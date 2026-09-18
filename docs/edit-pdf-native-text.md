# Existing PDF text editing — implementation and validation

## Workflow

Select is the default tool. Native text has transparent hit regions, a subtle hover outline, single-click selection, and double-click inline editing. The inline field uses the extracted size, baseline, rotation and resolved font. Escape cancels; Enter/Ctrl+Enter or blur commits. Region edits are single-line to avoid reflowing forms and tables. Long replacements produce a fit warning; font size can be adjusted in the existing-text properties panel. Reset to Original removes the edit, restoring original text, style and geometry. Undo/redo uses the existing immutable history.

## Detection and coordinates

PDF.js text content and operator lists classify pages progressively as native, mixed, image-only/scanned, non-text vector content, or empty. Classification does not run OCR. Existing project OCR implementations were inspected but are not activated here. Active-page analysis renders the source and a text-free background to locate visible native text and estimate its color. Invisible OCR layers do not get fake editing handles. Text clipping modes are conservatively rejected because removing those text operations could alter the underlying artwork.

Text metadata includes source item indexes, source page index, original string, PDF text transform, font name/family/style, size, direction, rotation, baseline, and bounds. Coordinates are in the unrotated, scale-one PDF.js page space including CropBox and UserUnit. Zoom is display-only. Page rotation is a separate transform. Export inverts that same PDF.js transform.

Adjacent fragments are grouped only with matching fonts, size, color, orientation and baseline and a small gap. Label separators and larger gaps stop grouping. This is deliberately conservative: unusual spacing, complex tables and multi-style lines can remain multiple regions rather than being incorrectly merged.

## Fonts and Unicode

`nativeFonts.ts` resolves source fonts from the PDF font dictionaries, including descendant/CID fonts. Reuse requires supported font data, compatible style, permitted embedding flags and coverage of the actual replacement characters. Complete and subset fonts use the same coverage check; new characters missing from a subset trigger fallback.

The fallback system checks glyph coverage rather than detecting a document language. Standard serif/sans/monospace fonts are used when suitable. Locally served Noto fonts provide additional glyph coverage, including Gujarati and Devanagari. Mixed-script text is split into grapheme-safe font runs. Fontkit provides glyph shaping and advances/offsets. Export emits explicit glyph positions, preserves logical ordering, supplies ToUnicode entries for shaped glyphs, and includes ActualText metadata.

A font match is exact, substitute, or unavailable. Exact appearance cannot be guaranteed for unreusable source encodings, unavailable fonts, unusual vertical/sheared writing, or unsupported glyphs. Unsupported characters are rejected with a message, not guessed or silently replaced. Source extraction is not repaired by guessing Unicode.

## Export

Existing edits live in `EditorPage.existingTextEdits`; `objects` remains the separate collection for added objects. The original page is copied as PDF content. Only edited text regions receive a small background patch rendered with text operations omitted, preserving colored fills, graphics, images and table lines. Replacement glyphs are drawn as real PDF text at the original baseline. The full page is not rasterized.

This is visual replacement, not secure removal. Original text can remain recoverable and searchable in the source content stream. Complex overlapping text and artwork can still need manual review; the patch is a local raster reconstruction. A later content-stream editor can replace this strategy without changing the edit model.

## Performance and scope

Detailed text UI and backgrounds are limited to the active page; the source cache retains at most two detailed page analyses. Background page classification yields between pages. Loaded font faces and caches are released when closing/resetting a document. Added text, images, signatures, drawing, highlights, shapes, whiteout and cover tools remain available. The landing page and global styles are unchanged. No deployment was made.

## Files changed in this task

- `lib/editPdf/nativeText.ts`: detection, grouping, PDF-relative geometry and background patches.
- `lib/editPdf/nativeFonts.ts`: font resolution, shaping, Unicode maps and resource cleanup.
- `lib/editPdf/nativeExporter.ts`: visual replacement export.
- `lib/editPdf/model.ts`, `assets.ts`, `exporter.ts`: separate existing-text model, progressive classification and export integration.
- `components/editPdf/NativeTextLayer.tsx`, `NativeTextProperties.tsx`: inline layer and properties.
- `components/editPdf/PdfCanvas.tsx`, `PdfEditor.tsx`, `PdfToolbar.tsx`, `EditPdfTool.tsx`: integration, Fit Width, history and cleanup.
- `components/editPdf/EditPdf.module.css`: editor-scoped styles.
- `public/fonts/edit-pdf/`: six local Noto font assets and their license files.
- `package.json`, `package-lock.json`: fontkit and its required generator runtime.
- `tests/edit-pdf-native.spec.ts`: focused native text regression scenarios.

## QA cases

Generated marksheet-style tables contain a name, numeric field and subject, colored cells, borders, fragmented names and multiple fonts. Tests cover A4, Letter and landscape dimensions, 0/90/180/270-degree page rotation, rotated text, CropBox/UserUnit transforms, 50/75/100/125/150% zoom, Fit Page/Width, scanned and mixed pages, Gujarati, Devanagari, mixed-script replacements, cancellation, reset, undo/redo, and export coordinates. A pixel check verifies removal of old visible glyphs on a colored cell. Rendered PDF samples are reviewed at 2x scale.

The specific user-referenced marksheet file was not present in this task's attachments and its path was requested. The synthetic table fixture is not represented as that original document.

## Final verification

- 36 Playwright checks passed across desktop Chromium and mobile Chromium (native-text suite plus the existing editor suite).
- Changed-file ESLint passed with no warnings or errors.
- Project TypeScript checking found no errors in changed source/tests; existing errors remain in homepage, PDF-to-HTML, PDFRoot and resize-image tests.
- Rendered Latin and Hindi exports were inspected. Text position, color, table borders and page quality were preserved in the checked samples.
- Build result is recorded in `tmp/native-build-final.log`; the existing unrelated PDF-to-Word `prefer-const` error is the known production build gate.
- Final `npm run build`: application compiled successfully in 55 seconds, then failed on the existing `components/PdfToWordTool.tsx:1036` `prefer-const` lint error. No unrelated source was changed to bypass this gate.
