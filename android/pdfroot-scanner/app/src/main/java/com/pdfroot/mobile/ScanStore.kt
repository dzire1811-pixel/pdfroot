package com.pdfroot.mobile

import android.content.Context
import android.net.Uri
import androidx.core.content.FileProvider
import java.io.File
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Local-only PDF storage. The scanner SDK provides a temporary content URI;
 * copy it into app-private storage immediately before its lifetime ends.
 */
object ScanStore {
    private fun folder(context: Context): File =
        File(context.filesDir, "scans").apply {
            if (!isDirectory && !mkdirs()) throw IOException("Cannot create scans folder")
        }

    fun list(context: Context): List<File> =
        folder(context).listFiles()
            ?.filter { it.isFile && it.extension.equals("pdf", ignoreCase = true) }
            ?.sortedWith(compareByDescending<File> { it.lastModified() }.thenByDescending { it.name })
            ?: emptyList()

    fun importPdf(context: Context, temporaryUri: Uri): File {
        val dir = folder(context)
        val date = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
        var index = 0
        var target: File
        do {
            val suffix = if (index == 0) "" else "_" + index
            target = File(dir, "PDFRoot_Scan_" + date + suffix + ".pdf")
            index++
        } while (target.exists())

        val temporaryFile = File.createTempFile("scan_", ".part", dir)
        try {
            val input = context.contentResolver.openInputStream(temporaryUri)
                ?: throw IOException("Could not read scanner output")
            input.use { source ->
                temporaryFile.outputStream().use { destination -> source.copyTo(destination) }
            }
            if (temporaryFile.length() == 0L) throw IOException("Scanner created an empty PDF")
            if (!temporaryFile.renameTo(target)) throw IOException("Could not save scanned PDF")
            return target
        } finally {
            if (temporaryFile.exists()) temporaryFile.delete()
        }
    }

    fun rename(file: File, proposedName: String): File? {
        val safe = proposedName.trim()
            .replace(Regex("[^\\p{L}\\p{N} _.()-]"), "_")
            .trim('.', ' ')
            .take(80)
        if (safe.isBlank()) return null
        val output = File(file.parentFile, safe + ".pdf")
        if (output.absolutePath == file.absolutePath) return file
        if (output.exists()) return null
        return if (file.renameTo(output)) output else null
    }

    fun shareUri(context: Context, file: File): Uri =
        FileProvider.getUriForFile(context, context.packageName + ".fileprovider", file)
}
