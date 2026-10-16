# Exact KB PDF for PDFRoot Desktop Pro

Adds a compact white Exact KB PDF popup to the existing Desktop Pro app. Access it from All Tools, the PDF right-click menu, or Ctrl + Alt + Q. The existing image Exact KB shortcut is unchanged. The new tool works in both Normal and Auto modes without loading a website.

Choose PDFs, enter a target, and create separate copies beside the original files. Default units are decimal KB (500 KB = 500,000 bytes); a binary KiB option is explicit. The output size is measured after writing. Existing files are never overwritten, including repeated conversions and Unicode filenames. Up to 50 PDFs per batch and 100 MiB per file/target are supported.

Original quality is preserved by default. Images are never resized; native text, vector content, fonts, and existing form appearances are retained. If the original is already smaller than the target, its object bytes are retained and whitespace padding is inserted before the final startxref. Otherwise, lossless object serialization and compression of previously uncompressed streams are tried. If these methods cannot reach the target, no output for that file is written; the UI reports the best size found by this tool and offers a larger target. If the target cannot be reached losslessly, the compact popup offers an explicit image-compression action and a one-click larger lossless size. JPEG image compression occurs only with allowImageCompression === true. It preserves dimensions, native text and forms, uses the packaged Skia JPEG encoder at the highest practical uniform quality that fits (floor 5; stronger compression is identified in the result), and reports that image quality changed. It does not claim that recompression is lossless. Indirect RGB/gray color spaces are resolved. ICC RGB images retain their original PDF profile and are decoded without applying its transform twice. Unsupported/masked/non-RGB-profile images remain untouched. Not every PDF can reach every size.

Encrypted PDFs and digital signature fields are rejected with recovery instructions. Dynamic XFA forms are not rewritten. Each batch file has an individual success/failure result. The conversion runs in a worker thread; the renderer cannot supply arbitrary filesystem paths through IPC and can reveal only its own generated results.

## Assemble

Start with the repository's .release/PDFRoot-Desktop-Pro-Beta9-Tool-Icons-Right-Click-Build-Kit.zip. Apply the Beta 11, 12, 14, and 15 overlays in that order, and run the Beta 14/15 main patches and Beta 15 existing-test patch, as in .github/workflows/test-exact-kb-pdf.yml. Then run:

    node .release/exact-kb-pdf-overlay/apply.cjs <desktop/resources/app>

The patch fails if its expected anchors are absent. Apply it once to freshly assembled source. The package and root lockfile versions become 0.7.0-beta.18. Run npm ci, npm test, and npm run pack:win in that app directory on Windows.

Changing the target clears stale results. Recommended-size actions actually create the PDF; Cancel/Escape close the popup. The candidate workflow builds and verifies a Windows installer as an Actions artifact. It does not publish a release, change the website download, or activate automatic updates. Physical Windows 10/11 validation is still separate from CI.

## Validation

- Ten engine behavior tests: precise decimal/binary units; pass-through/padding; lossless stream fidelity and forms; exact source pass-through and impossible targets; unchanged JPEG bytes and dimensions; signed/malformed/XFA safety; mixed batch and collision-safe output; real worker output; explicit recompression opt-in and same dimensions/native streams/forms.
- Existing desktop tests are retained; inventory assertions are extended for the new PDF tool, shortcut, icon and menu entry.
- Independent MuPDF verification of a two-page sample with text, JPEG, vector artwork, rotated page and filled form: 20,000-byte and 500,000-byte results render pixel-for-pixel identically at 144 dpi; extracted text and widget values agree.
