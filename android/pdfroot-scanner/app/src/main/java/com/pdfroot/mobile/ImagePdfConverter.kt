package com.pdfroot.mobile

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.pdf.PdfDocument
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import java.io.File
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.min

/** Offline conversion of one or more gallery images into a multi-page A4 PDF. */
object ImagePdfConverter {
    fun convert(context: Context, imageUris: List<Uri>): File {
        require(imageUris.isNotEmpty() && imageUris.size <= 30) { "Select 1–30 images" }
        val dir = File(context.filesDir, "scans").apply {
            if (!isDirectory && !mkdirs()) throw IOException("Cannot create documents folder")
        }
        val date = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
        var counter = 0
        var target: File
        do {
            val suffix = if (counter == 0) "" else "_".plus(counter)
            target = File(dir, "PDFRoot_Images_" + date + suffix + ".pdf")
            counter++
        } while (target.exists())

        val tempFile = File.createTempFile("images_", ".part", dir)
        val pdf = PdfDocument()
        try {
            imageUris.forEachIndexed { index, uri ->
                require(uri.scheme == "content") { "Unsupported image URI" }
                var bitmap = decodeImage(context, uri)
                try {
                    bitmap = applyOrientation(context, uri, bitmap)
                    val pageWidth = 595 // A4 at 72 DPI
                    val pageHeight = 842
                    val page = pdf.startPage(
                        PdfDocument.PageInfo.Builder(pageWidth, pageHeight, index + 1).create()
                    )
                    val canvas: Canvas = page.canvas
                    canvas.drawColor(Color.WHITE)
                    val padding = 15f
                    val scale = min(
                        (pageWidth - 2 * padding) / bitmap.width.toFloat(),
                        (pageHeight - 2 * padding) / bitmap.height.toFloat()
                    )
                    val width = bitmap.width * scale
                    val height = bitmap.height * scale
                    val left = (pageWidth - width) / 2f
                    val top = (pageHeight - height) / 2f
                    canvas.drawBitmap(
                        bitmap, null,
                        RectF(left, top, left + width, top + height),
                        Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
                    )
                    pdf.finishPage(page)
                } finally {
                    bitmap.recycle()
                }
            }
            tempFile.outputStream().use { pdf.writeTo(it) }
            if (tempFile.length() == 0L) throw IOException("PDF is empty")
            if (!tempFile.renameTo(target)) throw IOException("Failed to save PDF")
            return target
        } finally {
            pdf.close()
            if (tempFile.exists()) tempFile.delete()
        }
    }

    private fun decodeImage(context: Context, uri: Uri): Bitmap {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        context.contentResolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, bounds)
        } ?: throw IOException("Could not read image")
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw IOException("Unsupported image")
        var sampleSize = 1
        while (bounds.outWidth / (sampleSize * 2) >= 2500 ||
               bounds.outHeight / (sampleSize * 2) >= 2500) sampleSize *= 2
        val options = BitmapFactory.Options().apply {
            inJustDecodeBounds = false
            inSampleSize = sampleSize
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        return context.contentResolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, options)
        } ?: throw IOException("Could not decode image")
    }

    private fun applyOrientation(context: Context, uri: Uri, input: Bitmap): Bitmap {
        val orientation = try {
            context.contentResolver.openInputStream(uri)?.use {
                ExifInterface(it).getAttributeInt(
                    ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL
                )
            } ?: ExifInterface.ORIENTATION_NORMAL
        } catch (_: Exception) {
            ExifInterface.ORIENTATION_NORMAL
        }
        val matrix = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.setScale(-1f, 1f)
            ExifInterface.ORIENTATION_ROTATE_180 -> matrix.setRotate(180f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.setScale(1f, -1f)
            ExifInterface.ORIENTATION_TRANSPOSE -> { matrix.setScale(-1f, 1f); matrix.postRotate(270f) }
            ExifInterface.ORIENTATION_ROTATE_90 -> matrix.setRotate(90f)
            ExifInterface.ORIENTATION_TRANSVERSE -> { matrix.setScale(-1f, 1f); matrix.postRotate(90f) }
            ExifInterface.ORIENTATION_ROTATE_270 -> matrix.setRotate(270f)
            else -> return input
        }
        val rotated = Bitmap.createBitmap(input, 0, 0, input.width, input.height, matrix, true)
        if (rotated !== input) input.recycle()
        return rotated
    }
}
