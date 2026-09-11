package com.axh.makebelieve.tv

import android.annotation.SuppressLint
import android.app.Activity
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.axh.makebelieve.tv.databinding.ActivityMainBinding

/**
 * One fullscreen WebView showing the host page. It holds no game state and no game logic, and
 * bundles nothing: the page is fetched on every launch.
 */
class MainActivity : Activity() {

  private lateinit var views: ActivityMainBinding

  private val retryHandler = Handler(Looper.getMainLooper())
  private var retryDelayMs = FIRST_RETRY_MS
  private var retryQueued = false

  /** True between a failed load and the next successful one. */
  private var showingError = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    views = ActivityMainBinding.inflate(layoutInflater)
    setContentView(views.root)

    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    goFullscreen()
    configureWebView()

    views.retryMessage.text = getString(R.string.unreachable, Uri.parse(BuildConfig.HOST_URL).host)

    // Says in `adb logcat` which Chromium the box's WebView actually is.
    Log.i(TAG, "host=${BuildConfig.HOST_URL} webview=${views.web.settings.userAgentString}")

    load()
  }

  @SuppressLint("SetJavaScriptEnabled")
  private fun configureWebView() {
    views.web.settings.apply {
      javaScriptEnabled = true
      domStorageEnabled = true
      // There is nothing on this screen to touch, so no gesture will ever arrive.
      mediaPlaybackRequiresUserGesture = false
      // How the host page tells it is in the wrapper rather than a browser tab.
      userAgentString = "$userAgentString $UA_SUFFIX"
    }

    views.web.webViewClient = object : WebViewClient() {
      // Nothing leaves this WebView: there is no browser on a TV to leave to.
      override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) = false

      override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
        if (request.isForMainFrame) onLoadFailed("${error.errorCode} ${error.description}")
      }

      override fun onReceivedHttpError(
        view: WebView,
        request: WebResourceRequest,
        response: WebResourceResponse,
      ) {
        // A restarting pod answers 502 through the ingress: the same "not there yet" case.
        if (request.isForMainFrame) onLoadFailed("HTTP ${response.statusCode}")
      }

      override fun onPageFinished(view: WebView, url: String) {
        // A failed load still finishes, on the error page; only an error-free one counts as back.
        if (!showingError) onLoadSucceeded()
      }
    }

    views.web.webChromeClient = object : WebChromeClient() {
      /** The host page's own console, forwarded so `adb logcat` can see it. */
      override fun onConsoleMessage(message: ConsoleMessage): Boolean {
        Log.d(TAG, "[page] ${message.message()} (${message.sourceId()}:${message.lineNumber()})")
        return true
      }
    }
  }

  /** Loads the host page, hiding whatever the last failure put on screen. */
  private fun load() {
    retryQueued = false
    showingError = false
    views.web.loadUrl(BuildConfig.HOST_URL)
  }

  private fun onLoadSucceeded() {
    retryDelayMs = FIRST_RETRY_MS
    retryHandler.removeCallbacksAndMessages(null)
    retryQueued = false
    views.retry.visibility = View.GONE
    views.web.visibility = View.VISIBLE
  }

  /** Shows the native "can't reach it" screen and tries again, backing off to [MAX_RETRY_MS]. */
  private fun onLoadFailed(reason: String) {
    Log.w(TAG, "load failed: $reason")
    showingError = true
    views.web.visibility = View.INVISIBLE
    views.retry.visibility = View.VISIBLE

    if (retryQueued) return
    retryQueued = true
    retryHandler.postDelayed(::load, retryDelayMs)
    retryDelayMs = (retryDelayMs * 2).coerceAtMost(MAX_RETRY_MS)
  }

  private fun goFullscreen() {
    WindowCompat.setDecorFitsSystemWindows(window, false)
    WindowInsetsControllerCompat(window, views.root).apply {
      hide(WindowInsetsCompat.Type.systemBars())
      systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }
  }

  /** Menu reloads and Back exits; the D-pad is left to the page, which ignores it. */
  override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
    if (keyCode == KeyEvent.KEYCODE_MENU) {
      load()
      return true
    }
    return super.onKeyDown(keyCode, event)
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    // The bars come back whenever anything else has been on top; put them away again.
    if (hasFocus) goFullscreen()
  }

  override fun onDestroy() {
    retryHandler.removeCallbacksAndMessages(null)
    // A WebView must leave the hierarchy before it is destroyed.
    views.root.removeView(views.web)
    views.web.destroy()
    super.onDestroy()
  }

  private companion object {
    const val TAG = "MAKEbelieve"
    const val UA_SUFFIX = "MAKEbelieveTV/1"
    const val FIRST_RETRY_MS = 2_000L
    const val MAX_RETRY_MS = 30_000L
  }
}
