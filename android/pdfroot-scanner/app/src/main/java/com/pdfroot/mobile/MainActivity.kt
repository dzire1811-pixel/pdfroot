package com.pdfroot.mobile

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.EditText
import android.widget.Toast
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import java.io.File
import kotlin.concurrent.thread

class MainActivity : AppCompatActivity() {
    private lateinit var screen: ScannerScreen
    private var pendingSave: File? = null

    private val scanLauncher =
        registerForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { output ->
            if (output.resultCode == Activity.RESULT_CANCELED) {
                report("Scan cancelled")
                return@registerForActivityResult
            }
            if (output.resultCode != Activity.RESULT_OK) {
                report("Scan was not completed")
                return@registerForActivityResult
            }
            val result = GmsDocumentScanningResult.fromActivityResultIntent(output.data)
            val pdf = result?.pdf
            if (pdf == null) {
                report("No PDF was returned. Try scanning again.")
                return@registerForActivityResult
            }
            report("Saving " + pdf.pageCount + " page(s)...")
            thread(name = "save-scanner-pdf") {
                try {
                    val saved = ScanStore.importPdf(this, pdf.uri)
                    runOnUiThread {
                        if (!isDestroyed) {
                            report("Saved " + saved.name)
                            refresh()
                        }
                    }
                } catch (e: Exception) {
                    runOnUiThread {
                        if (!isDestroyed) report("Could not save scan: " + (e.localizedMessage ?: "unknown error"))
                    }
                }
            }
        }

    private val exportLauncher =
        registerForActivityResult(ActivityResultContracts.CreateDocument("application/pdf")) { destination ->
            val source = pendingSave
            pendingSave = null
            if (destination == null || source == null) return@registerForActivityResult

            thread(name = "export-scanner-pdf") {
                try {
                    val output = contentResolver.openOutputStream(destination)
                        ?: error("The selected location is not writable")
                    source.inputStream().use { input ->
                        output.use { destinationStream -> input.copyTo(destinationStream) }
                    }
                    runOnUiThread { if (!isDestroyed) report("PDF saved to the selected location") }
                } catch (e: Exception) {
                    runOnUiThread {
                        if (!isDestroyed) report("Save failed: " + (e.localizedMessage ?: "unknown error"))
                    }
                }
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        screen = ScannerScreen(
            this,
            onScan = { startScan() },
            onTools = { openPdfRootTools() },
            onOpen = { openPdf(it) },
            onShare = { sharePdf(it) },
            onSave = { savePdf(it) },
            onRename = { askRename(it) },
            onDelete = { askDelete(it) }
        )
        setContentView(screen.root)
        ViewCompat.setOnApplyWindowInsetsListener(screen.root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.setPadding(0, bars.top, 0, bars.bottom)
            insets
        }
        refresh()
    }

    override fun onResume() {
        super.onResume()
        if (::screen.isInitialized) refresh()
    }

    private fun refresh() {
        try {
            screen.showFiles(ScanStore.list(this))
        } catch (e: Exception) {
            report("Could not read saved scans")
        }
    }

    private fun report(message: String) {
        if (::screen.isInitialized) screen.setStatus(message)
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    }

    private fun startScan() {
        screen.setStatus("Opening document scanner...")
        val options = GmsDocumentScannerOptions.Builder()
            .setGalleryImportAllowed(true)
            .setPageLimit(30)
            .setResultFormats(
                GmsDocumentScannerOptions.RESULT_FORMAT_PDF,
                GmsDocumentScannerOptions.RESULT_FORMAT_JPEG
            )
            .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
            .build()
        GmsDocumentScanning.getClient(options)
            .getStartScanIntent(this)
            .addOnSuccessListener { sender ->
                scanLauncher.launch(IntentSenderRequest.Builder(sender).build())
            }
            .addOnFailureListener { error ->
                report("Scanner unavailable: " + (error.localizedMessage ?: "Update Google Play services"))
            }
    }

    private fun openPdfRootTools() {
        val url = Uri.parse("https://www.pdfroot.com/tools")
        try {
            CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(this, url)
        } catch (e: Exception) {
            try {
                startActivity(Intent(Intent.ACTION_VIEW, url))
            } catch (_: ActivityNotFoundException) {
                report("No web browser is installed")
            }
        }
    }

    private fun openPdf(file: File) {
        try {
            val uri = ScanStore.shareUri(this, file)
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/pdf")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            startActivity(Intent.createChooser(intent, "Open scanned PDF"))
        } catch (_: ActivityNotFoundException) {
            report("Install a PDF viewer to open files")
        } catch (e: Exception) {
            report("Could not open PDF: " + (e.localizedMessage ?: "unknown error"))
        }
    }

    private fun sharePdf(file: File) {
        try {
            val uri = ScanStore.shareUri(this, file)
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "application/pdf"
                putExtra(Intent.EXTRA_STREAM, uri)
                clipData = ClipData.newRawUri(file.name, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            startActivity(Intent.createChooser(intent, "Share scanned PDF"))
        } catch (e: Exception) {
            report("Sharing failed: " + (e.localizedMessage ?: "unknown error"))
        }
    }

    private fun savePdf(file: File) {
        pendingSave = file
        exportLauncher.launch(file.name)
    }

    private fun askRename(file: File) {
        val input = EditText(this).apply {
            setSingleLine(true)
            setText(file.nameWithoutExtension)
            setSelection(text.length)
        }
        AlertDialog.Builder(this)
            .setTitle("Rename PDF")
            .setView(input)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Rename") { _, _ ->
                val renamed = ScanStore.rename(file, input.text.toString())
                if (renamed == null) report("Invalid name or a file with this name already exists")
                else {
                    report("Renamed successfully")
                    refresh()
                }
            }
            .show()
    }

    private fun askDelete(file: File) {
        AlertDialog.Builder(this)
            .setTitle("Delete this scan?")
            .setMessage("This removes the in-app copy. Files you exported elsewhere are not deleted.")
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Delete") { _, _ ->
                if (file.delete()) {
                    report("Scan deleted")
                    refresh()
                } else report("Could not delete scan")
            }
            .show()
    }
}
