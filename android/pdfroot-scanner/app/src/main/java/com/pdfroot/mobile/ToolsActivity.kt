package com.pdfroot.mobile

import android.app.Activity
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
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import androidx.webkit.WebMessageCompat
import org.json.JSONObject
import java.io.File
import java.io.BufferedOutputStream
import java.io.FileOutputStream
import com.google.android.material.button.MaterialButton

/** Opens PDFRoot tools inside the app, restricting navigation to the official website. */
class ToolsActivity : AppCompatActivity() {
    private lateinit var web: WebView
    private var pendingChooser: ValueCallback<Array<Uri>>? = null
    private var partialFile: File? = null
    private var partialStream: BufferedOutputStream? = null
    private var expectedSize: Long = 0
    private var writtenSize: Long = 0
    private var proposedName = "PDFRoot-File"
    private var proposedMime = "application/octet-stream"
    private var pendingExport: File? = null
    private val saveWebResult = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val data = pendingExport
        pendingExport = null
        try {
            if (result.resultCode == Activity.RESULT_OK && result.data?.data != null && data != null) {
                contentResolver.openOutputStream(result.data!!.data!!)?.use { out ->
                    data.inputStream().use { input -> input.copyTo(out) }
                } ?: error("Cannot open output file")
                toast("File saved successfully")
            }
        } catch (e: Exception) {
            toast("Save failed: " + e.localizedMessage)
        } finally {
            data?.delete()
        }
    }

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
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(
                web, "PDFRootSave",
                setOf("https://www.pdfroot.com", "https://pdfroot.com")
            ) { _, packet, sourceOrigin, isMainFrame, _ ->
                if (isMainFrame && isTrusted(sourceOrigin.toString())) receiveWebResult(packet)
            }
        }

        web.setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            if (!isTrusted(web.url ?: "")) {
                toast("Untrusted download blocked")
            } else if (url.startsWith("blob:")) {
                saveWebBlob(url, android.webkit.URLUtil.guessFileName("download", contentDisposition, mimeType), mimeType)
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

    /** Stream a same-origin blob to a temporary private file, then Android's Save As picker. */
    private fun saveWebBlob(url: String, name: String, mime: String?) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            toast("Tap ↗ to save this result using your browser")
            return
        }
        if (partialStream != null || pendingExport != null) {
            toast("Finish saving the previous file first")
            return
        }
        if (!url.startsWith("blob:https://www.pdfroot.com/") &&
            !url.startsWith("blob:https://pdfroot.com/")) {
            toast("Untrusted blob URL blocked")
            return
        }
        val js = "(async function(){try{" +
            "const response=await fetch(" + JSONObject.quote(url) + ");" +
            "const blob=await response.blob();" +
            "if(blob.size>25*1024*1024)throw Error('File over 25 MB; use browser');" +
            "PDFRootSave.postMessage(JSON.stringify({kind:'begin',size:blob.size,name:" +
                JSONObject.quote(name) + ",mime:" + JSONObject.quote(mime ?: "application/octet-stream") + "}));" +
            "const bytes=new Uint8Array(await blob.arrayBuffer());" +
            "for(let offset=0;offset<bytes.length;offset+=65536){" +
                "const piece=bytes.subarray(offset,Math.min(offset+65536,bytes.length));" +
                "let binary='';for(let i=0;i<piece.length;i++)binary+=String.fromCharCode(piece[i]);" +
                "PDFRootSave.postMessage(JSON.stringify({kind:'chunk',data:btoa(binary)}));" +
            "}" +
            "PDFRootSave.postMessage(JSON.stringify({kind:'done'}));" +
            "}catch(e){PDFRootSave.postMessage(JSON.stringify({kind:'error',message:String(e)}))}})();"
        web.evaluateJavascript(js, null)
    }

    private fun receiveWebResult(message: WebMessageCompat) {
        try {
            val data = JSONObject(message.data ?: return)
            when (data.optString("kind")) {
                "begin" -> {
                    clearPartial()
                    expectedSize = data.getLong("size")
                    if (expectedSize < 0 || expectedSize > 25L * 1024 * 1024)
                        error("Result is too large for in-app saving")
                    writtenSize = 0
                    proposedMime = data.optString("mime", "application/octet-stream")
                    proposedName = data.optString("name", "PDFRoot-File")
                        .replace(Regex("[^a-zA-Z0-9 _.-]"), "_").take(90)
                        .ifBlank { "PDFRoot-File" }
                    val tempDir = File(cacheDir, "tool-results").apply { mkdirs() }
                    partialFile = File.createTempFile("result_", ".part", tempDir)
                    partialStream = BufferedOutputStream(FileOutputStream(partialFile), 65536)
                }
                "chunk" -> {
                    val bytes = android.util.Base64.decode(data.getString("data"), android.util.Base64.DEFAULT)
                    writtenSize += bytes.size
                    if (writtenSize > expectedSize) error("Invalid result length")
                    (partialStream ?: error("No active download")).write(bytes)
                }
                "done" -> {
                    if (writtenSize != expectedSize) error("Incomplete download")
                    partialStream?.close()
                    partialStream = null
                    val file = partialFile ?: error("Missing result")
                    partialFile = null
                    pendingExport = file
                    val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = proposedMime
                        putExtra(Intent.EXTRA_TITLE, proposedName)
                    }
                    saveWebResult.launch(intent)
                }
                "error" -> {
                    clearPartial()
                    toast(data.optString("message", "Download failed"))
                }
            }
        } catch (e: Exception) {
            clearPartial()
            toast("Cannot save result: " + e.localizedMessage)
        }
    }

    private fun clearPartial() {
        try { partialStream?.close() } catch (_: Exception) {}
        partialStream = null
        partialFile?.delete()
        partialFile = null
        writtenSize = 0
        expectedSize = 0
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
        clearPartial()
        pendingExport?.delete()
        web.destroy()
        super.onDestroy()
    }
    companion object {
        const val EXTRA_URL = "toolUrl"
        const val HOME = "https://www.pdfroot.com/tools"
    }
}
