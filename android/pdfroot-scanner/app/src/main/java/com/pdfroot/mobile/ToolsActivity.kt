package com.pdfroot.mobile

import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.ValueCallback
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.button.MaterialButton

/** Opens PDFRoot tools inside the app, restricting navigation to the official website. */
class ToolsActivity : AppCompatActivity() {
    private lateinit var web: WebView
    private var pendingChooser: ValueCallback<Array<Uri>>? = null

    private val chooseFile = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val callback = pendingChooser ?: return@registerForActivityResult
        pendingChooser = null
        val items = WebChromeClient.FileChooserParams.parseResult(
            result.resultCode, result.data
        )?.filter { uri -> uri.scheme == "content" && uri.authority != packageName + ".fileprovider" }
            ?.toTypedArray()
        callback.onReceiveValue(items?.takeIf { it.isNotEmpty() })
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val screen = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(android.graphics.Color.WHITE)
        }
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(10), dp(7), dp(10), dp(7))
        }
        header.addView(button("←") { finish() })
        header.addView(TextView(this).apply {
            text = "PDFRoot  •  All Tools"
            textSize = 17f
            setTextColor(android.graphics.Color.parseColor("#20232B"))
        }, LinearLayout.LayoutParams(0, -2, 1f))
        header.addView(button("↻") { web.reload() })
        header.addView(button("↗") { openExternal(web.url ?: HOME) })
        screen.addView(header, LinearLayout.LayoutParams(-1, dp(55)))

        val progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            progressTintList = android.content.res.ColorStateList.valueOf(
                android.graphics.Color.parseColor("#D62832")
            )
        }
        screen.addView(progress, LinearLayout.LayoutParams(-1, dp(3)))
        web = WebView(this)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = true
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false)
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (!request.isForMainFrame) return false
                if (isTrusted(request.url.toString())) return false
                if (request.url.scheme == "https") openExternal(request.url.toString())
                else toast("Unsupported link")
                return true
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, newProgress: Int) {
                progress.progress = newProgress
                progress.visibility = if (newProgress >= 100) View.INVISIBLE else View.VISIBLE
            }
            override fun onShowFileChooser(
                webView: WebView,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams
            ): Boolean {
                pendingChooser?.onReceiveValue(null)
                pendingChooser = filePathCallback
                return try {
                    chooseFile.launch(fileChooserParams.createIntent())
                    true
                } catch (_: Exception) {
                    pendingChooser = null
                    filePathCallback.onReceiveValue(null)
                    toast("No file picker found")
                    true
                }
            }
        }
        web.setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            if (!isTrusted(web.url ?: "")) {
                toast("Untrusted download blocked")
            } else if (url.startsWith("blob:")) {
                toast("To save this result, tap ↗ and open in your browser")
            } else if (isTrusted(url)) {
                try {
                    val name = android.webkit.URLUtil.guessFileName(url, contentDisposition, mimeType)
                    val request = DownloadManager.Request(Uri.parse(url))
                        .setTitle(name)
                        .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    CookieManager.getInstance().getCookie(url)?.let { request.addRequestHeader("Cookie", it) }
                    request.addRequestHeader("User-Agent", userAgent)
                    (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
                    toast("Downloading: " + name)
                } catch (_: Exception) {
                    toast("Could not download this file")
                }
            }
        }
        screen.addView(web, LinearLayout.LayoutParams(-1, 0, 1f))
        setContentView(screen)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else finish()
            }
        })
        web.loadUrl(intent.getStringExtra(EXTRA_URL)?.takeIf { isTrusted(it) } ?: HOME)
    }

    private fun isTrusted(url: String): Boolean = try {
        val uri = Uri.parse(url)
        uri.scheme == "https" && uri.host in setOf("pdfroot.com", "www.pdfroot.com") &&
            (uri.port == -1 || uri.port == 443)
    } catch (_: Exception) { false }

    private fun openExternal(url: String) {
        if (!isTrusted(url)) { toast("Not a PDFRoot page"); return }
        try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
        catch (_: ActivityNotFoundException) { toast("No browser available") }
    }
    private fun button(text: String, action: () -> Unit) =
        MaterialButton(this).apply {
            this.text = text
            isAllCaps = false
            minWidth = 0
            minHeight = 0
            setPadding(dp(6), 0, dp(6), 0)
            backgroundTintList = android.content.res.ColorStateList.valueOf(android.graphics.Color.WHITE)
            setTextColor(android.graphics.Color.parseColor("#20232B"))
            setOnClickListener { action() }
        }

    private fun dp(value: Int) = (value * resources.displayMetrics.density + 0.5f).toInt()
    private fun toast(text: String) = Toast.makeText(this, text, Toast.LENGTH_LONG).show()

    override fun onDestroy() {
        pendingChooser?.onReceiveValue(null)
        pendingChooser = null
        web.destroy()
        super.onDestroy()
    }
    companion object {
        const val EXTRA_URL = "toolUrl"
        const val HOME = "https://www.pdfroot.com/tools"
    }
}
