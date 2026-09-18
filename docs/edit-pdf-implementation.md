# Edit PDF Online

Local implementation of `/edit-pdf`. No deployment was performed.

## Files created

| File | Purpose |
| --- | --- |
| `components/editPdf/EditPdfPage.tsx` | Reuses the existing site header and footer |
| `components/editPdf/EditPdfTool.tsx` | Upload, validation, progress, result and download workflow |
| `components/editPdf/PdfEditor.tsx` | Editor orchestration, page operations, keyboard commands |
| `components/editPdf/PdfToolbar.tsx` | Desktop and compact mobile toolbars |
| `components/editPdf/PdfCanvas.tsx` | PDF.js rendering, page-coordinate gestures and touch panning |
| `components/editPdf/ObjectGraphic.tsx` | SVG previews of edit objects |
| `components/editPdf/PageSidebar.tsx` | Lazy page thumbnails and page actions |
| `components/editPdf/PropertiesPanel.tsx` | Object selection and editable properties |
| `components/editPdf/SignatureDialog.tsx` | Draw, type, upload and session-only signatures |
| `components/editPdf/EditPdf.module.css` | Styles scoped to this tool |
| `lib/editPdf/model.ts` | Page and object models, rotation and duplication |
| `lib/editPdf/history.ts` | Immutable undo/redo snapshots |
| `lib/editPdf/assets.ts` | Browser PDF/image loading and resource limits |
| `lib/editPdf/text.ts` | Shared font metrics and text layout |
| `lib/editPdf/exporter.ts` | Native PDF overlay export |
| `public/icons/tools/edit-pdf.svg` | Tool directory icon |
| `tests/edit-pdf.spec.ts` | Focused desktop/mobile Playwright coverage |
| `docs/edit-pdf-implementation.md` | Implementation and verification notes |

## Existing files modified

- `app/[slug]/page.tsx`: editor-specific rendering and metadata within the existing routing/metadata architecture.
- `components/ToolRenderer.tsx`: lazy editor registration.
- `lib/tools.ts`: appended the editor to the PDF tools registry. Existing items retain their order. All Tools, navigation and sitemap consume this registry.

The workspace already contained changes to PDF-to-Word, PDF-to-HTML, blog and audit files. Those changes were preserved. No global stylesheet, header/footer implementation, dependency manifest, lockfile, Next.js configuration or test framework configuration was changed.

## Libraries

No project dependencies installed. Reuses PDF.js, pdf-lib, Lucide, React and Playwright. The agent-browser CLI was invoked through the npm cache for local visual QA only.

## Completed workflow

- Choose PDF or drag/drop one PDF, with filename/size, local-processing notice and validation.
- Active-page PDF rendering with device-pixel-ratio support, fit-relative zoom, cropped/rotated page support and lazy low-resolution thumbnails.
- Text with shared PDF font metrics, wrapping, alignment, size, common font families, bold/italic/underline, color, opacity and rotation.
- PNG/JPG/JPEG/WebP images; move, resize, rotation, opacity, replacement and duplication.
- Drawn, typed or uploaded signatures; optional in-memory reuse for this editor session.
- Freehand vector drawings and whole-stroke eraser; rectangular highlights; rectangle, ellipse, line and arrow shapes; whiteout and clearly labeled Cover Content.
- Object selection, pointer movement/resizing, keyboard-accessible object picker, duplicate/delete and layer ordering.
- Page navigation, left/right rotation, duplicate/delete, drag reorder, keyboard/touch reorder buttons, blank pages and appended PDFs.
- Undo/redo for object and page changes; copy/paste, duplicate, delete, arrow movement, Escape, Ctrl/Cmd+Z, Ctrl/Cmd+Y and Shift+Ctrl/Cmd+Z.
- Mobile drawers occupy their own layout space below the canvas. Touch users can pan zoomed pages in Select mode.
- Applying-edits status without fabricated percentages, native PDF download, Edit Again, New File, and related-tool links.
- Tool metadata, canonical URL, OpenGraph/Twitter metadata, local data/resource cleanup and bounded input handling.

## Coordinate and export behavior

Objects use PDF.js scale-1 page coordinates, never viewport pixels. Screen scaling is applied only when displaying the canvas and interpreting pointer positions. Export inverts PDF.js's viewport transform, including crop offsets, page rotation and UserUnit. Added text, shapes and drawing paths are native PDF content; uploaded images/signatures are embedded images. Original pages are copied rather than turned into screenshots.

PDFs and image bytes stay in browser memory. PDF.js uses the existing same-origin worker. Object URLs are revoked when replaced, reset or unmounted. PDF.js loading tasks are destroyed on cleanup. History shares immutable objects and assets instead of copying PDF/image bytes into every snapshot.

## Intentional deferrals and limitations

- Existing PDF text is not directly editable. Whiteout plus new text is a visual replacement.
- **No secure redaction.** Whiteout and Cover Content leave underlying text/images recoverable. The UI says this explicitly.
- New text uses the standard PDF fonts and supports Latin/WinAnsi characters. Unsupported characters produce a visible message and block export. Original Unicode text is preserved; Unicode text can also be inserted as an image. Additional embedded Unicode font families are deferred.
- Typed and drawn signatures are visual marks, not cryptographic digital signatures. Typed signature appearance depends on available system fonts but is captured consistently in the inserted image.
- Eraser removes an entire added drawing stroke. Pixel/partial-stroke erasing is deferred.
- Page thumbnails show the original page plus its edit count; the main canvas is the authoritative live edit preview.
- Text is wrapped and clipped to the text box. Resize the box if more lines need to be visible.
- Password-protected documents must be unlocked first. Complex interactive forms, existing signatures, bookmarks and other document-level catalog features are not a supported editing workflow; copying pages does not guarantee retention of those features.
- Limits: combined source PDFs up to 100 MB, at most 300 pages, images up to 20 MB, decoded source images up to 40 megapixels, image assets downscaled to a 4096-pixel maximum side, and a 64-megapixel session image budget. Very complex PDFs can still exceed a device's available memory.
- Undo retains up to 80 recent edits. Files, signatures and edits are not persisted across refresh/closing the page. Start a new file to release all session resources.
- Zoom percentages are relative to fitting the page in the workspace, as stated beside the canvas.

## Verification

Commands used:

```text
npm run build
npm run lint
npx tsc --noEmit --pretty false
npx next lint --dir components/editPdf --dir lib/editPdf --file tests/edit-pdf.spec.ts
npx next build --experimental-build-mode compile
npx next build --experimental-build-mode generate
npx playwright test tests/edit-pdf.spec.ts --project=desktop-chromium --project=mobile-chromium --reporter=list
```

The standard build compiles application bundles successfully, then fails on the pre-existing `prefer-const` error in `components/PdfToWordTool.tsx:1036`. Full-project TypeScript checking also reports pre-existing errors in `tests/homepage.final.inspection.spec.ts`, `tests/pdf-to-html-conversion.spec.ts`, `tests/pdfroot.final.spec.ts` and `tests/resize-image-exact-kb-drag.spec.ts`. No new editor or editor-test TypeScript errors were reported. Scoped editor lint is clean.

For local browser QA, Next.js's separate compile/generate modes produced an optimized build without changing project configuration. These modes skip normal validation gates; their success is not a claim that the standard build is clean.

Browser coverage includes downloaded-PDF text extraction, crop/rotation/UserUnit geometry and rendered-pixel checks, local-only processing, signatures/images, overlays, undo/redo, page operations, gestures, error handling and layouts at 1920×1080, 1366×768, 1024×768, 768×1024, 390×844 and 360×800.

Final editor QA: all six scenarios passed in both desktop and mobile Chromium (12 validated cases). An initial mobile run had three incorrect test selectors for the More button; correcting those selectors made all three pass. The layout checks were rerun with real Chromium touch events and confirmed that zoomed pages can be panned on mobile.

Existing regression suites: `pdf-to-word-analysis.spec.ts` and `pdf-to-html-engine.spec.ts` passed all 16 tests. Final full-project TypeScript output contains only the pre-existing errors listed above. The editor's code and tests have no TypeScript errors, and scoped lint reports no warnings or errors.

The existing `homepage.mobile-menu-scroll.spec.ts` suite was also run: all five viewport cases fail at line 121 because the Recruitment Resize Tools group has exactly 10 links while the assertion requires more than 10. The editor is appended to PDF Tools without a government flag; it does not affect that group. The shared header and that test were left unchanged.

Final screenshots were inspected at 1366px and 360px after the scoped heading correction. Screenshots for every requested size are saved beneath `tmp/edit-pdf-final-qa/`.
