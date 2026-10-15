package com.pdfroot.mobile

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.text.TextUtils
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.PopupMenu
import android.widget.ScrollView
import android.widget.TextView
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class ScannerScreen(
    private val context: Context,
    private val onScan: () -> Unit,
    private val onTools: () -> Unit,
    private val onOpen: (File) -> Unit,
    private val onShare: (File) -> Unit,
    private val onSave: (File) -> Unit,
    private val onRename: (File) -> Unit,
    private val onDelete: (File) -> Unit
) {
    private val dark = Color.parseColor("#20232B")
    private val red = Color.parseColor("#D62832")
    private val muted = Color.parseColor("#68707D")
    private val border = Color.parseColor("#E5E7EB")
    private val background = Color.parseColor("#F6F7F9")
    private val white = Color.WHITE
    private val filesList = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
    private val savedCount = label("", 13, muted)
    private val status = label("Your PDFs are stored privately in this app. Use Save to keep a copy outside the app.", 12, muted)

    val root: ScrollView = ScrollView(context).apply {
        setBackgroundColor(this@ScannerScreen.background)
        isFillViewport = true
    }

    init {
        val main = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(18), dp(20), dp(36))
        }
        root.addView(main)

        val logo = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        logo.addView(label("PDF", 29, red, true))
        logo.addView(label("Root", 29, dark, true))
        logo.addView(label("  SCANNER", 11, muted))
        main.addView(logo)

        val hero = card()
        val heroBody = column(22)
        heroBody.addView(label("Scan. Edit. Save.", 27, dark, true))
        heroBody.addView(label(
            "Turn paper documents into clean, multi-page PDFs with your phone.",
            15, muted
        ), top(8))
        heroBody.addView(button("Scan a document", true) { onScan() },
            LinearLayout.LayoutParams(-1, dp(54)).apply { topMargin = dp(22) })
        heroBody.addView(label("Auto edges  ·  Crop  ·  Filters  ·  Multiple pages", 12, muted),
            top(10))
        hero.addView(heroBody)
        main.addView(hero, top(25))

        val toolsCard = card()
        val toolsBody = column(18)
        toolsBody.addView(label("All PDFRoot Tools", 18, dark, true))
        toolsBody.addView(label("Image resize, merge PDF, compress and more.", 13, muted), top(5))
        toolsBody.addView(button("Open PDFRoot Tools", false) { onTools() },
            LinearLayout.LayoutParams(-1, dp(49)).apply { topMargin = dp(12) })
        toolsCard.addView(toolsBody)
        main.addView(toolsCard, top(15))

        val libraryHeader = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        libraryHeader.addView(label("My Scans", 20, dark, true),
            LinearLayout.LayoutParams(0, -2, 1f))
        libraryHeader.addView(savedCount)
        main.addView(libraryHeader, top(27))

        main.addView(status, top(9))
        main.addView(filesList, top(12))
        main.addView(label(
            "Scanning requires Google Play services. Save important PDFs to a device folder before uninstalling the app.",
            11, muted
        ), top(20))
    }

    fun setStatus(message: String) { status.text = message }

    fun showFiles(files: List<File>) {
        savedCount.text = files.size.toString() + " saved"
        filesList.removeAllViews()
        if (files.isEmpty()) {
            val empty = card()
            empty.addView(column(18).apply {
                addView(label(
                    "No scans yet. Tap “Scan a document” to capture your first PDF.",
                    14, muted
                ))
            })
            filesList.addView(empty, top(5))
            return
        }

        val dateFormat = SimpleDateFormat("dd MMM yyyy, hh:mm a", Locale.getDefault())
        files.forEach { file ->
            val card = card()
            val content = column(15)
            val name = label(file.name, 15, dark, true).apply {
                maxLines = 2
                ellipsize = TextUtils.TruncateAt.END
            }
            content.addView(name)
            val sizeKb = file.length() / 1024.0
            val size = if (sizeKb >= 1024) {
                String.format(Locale.getDefault(), "%.1f MB", sizeKb / 1024)
            } else String.format(Locale.getDefault(), "%.0f KB", sizeKb)
            val detail = "PDF  •  " + size + "  •  " + dateFormat.format(Date(file.lastModified()))
            content.addView(label(detail, 12, muted), top(5))

            val actions = LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
            }
            val open = button("Open", false) { onOpen(file) }
            val share = button("Share", false) { onShare(file) }
            val save = button("Save", false) { onSave(file) }
            val more = button("More", false) {}
            more.setOnClickListener {
                val popup = PopupMenu(context, more)
                popup.menu.add("Rename").setOnMenuItemClickListener { onRename(file); true }
                popup.menu.add("Delete").setOnMenuItemClickListener { onDelete(file); true }
                popup.show()
            }
            listOf(open, share, save, more).forEachIndexed { i, button ->
                val params = LinearLayout.LayoutParams(0, dp(42), 1f)
                if (i != 0) params.marginStart = dp(4)
                actions.addView(button, params)
            }
            content.addView(actions, top(12))
            card.addView(content)
            filesList.addView(card, top(8))
        }
    }

    private fun dp(value: Int): Int =
        (value * context.resources.displayMetrics.density + 0.5f).toInt()

    private fun top(margin: Int) = LinearLayout.LayoutParams(-1, -2).apply {
        topMargin = dp(margin)
    }

    private fun column(padding: Int) = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(padding), dp(padding), dp(padding), dp(padding))
    }

    private fun card(): MaterialCardView = MaterialCardView(context).apply {
        radius = dp(19).toFloat()
        cardElevation = 0f
        setCardBackgroundColor(white)
        strokeColor = border
        strokeWidth = dp(1)
    }

    private fun label(text: String, sizeSp: Int, color: Int, bold: Boolean = false): TextView =
        TextView(context).apply {
            this.text = text
            textSize = sizeSp.toFloat()
            setTextColor(color)
            if (bold) typeface = Typeface.DEFAULT_BOLD
            setLineSpacing(dp(3).toFloat(), 1f)
        }

    private fun button(text: String, primary: Boolean, action: () -> Unit): MaterialButton =
        MaterialButton(context).apply {
            this.text = text
            isAllCaps = false
            textSize = 12f
            minWidth = 0
            minHeight = 0
            insetTop = 0
            insetBottom = 0
            cornerRadius = dp(12)
            setPadding(dp(2), 0, dp(2), 0)
            backgroundTintList = ColorStateList.valueOf(if (primary) red else dark)
            setTextColor(white)
            setOnClickListener { action() }
        }
}
