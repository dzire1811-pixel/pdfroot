# Exact KB PDF — Beta 20

Compact, local Desktop Pro popup (Ctrl+Alt+Q), catalog and Explorer command. Target KB uses 1,000 bytes. It writes collision-safe separate copies beside each source and verifies output size and page count.

The default path preserves original quality and uses lossless PDF rewriting when needed. An explicit image-compression action can re-encode supported JPEG images while preserving dimensions, native text, forms and supported ICC profiles. If that cannot fit, Strong compression is offered with a warning: resolution/clarity may decrease and text/forms become page images.

Strong compression renders supported PDF pages locally through packaged PDF.js/native canvas assets, including PNG/non-JPEG scanned content, visible form values and page rotation. It tries bounded page canvases at 150/120/96/72/60/48 DPI and searches JPEG quality 35–90. It supports up to 50 pages. It never executes PDF document JavaScript or uploads the PDF. Very small targets may still be unreachable; the popup reports the smallest result found, not an absolute minimum size.

Signed, encrypted and dynamic XFA PDFs are protected. Failed conversions save no file. Compression runs in a worker, and the renderer can reveal only outputs from its own session.

## Assemble and publish

Expand `.release/PDFRoot-Desktop-Pro-Beta9-Tool-Icons-Right-Click-Build-Kit.zip`. Apply Beta 11/12/14/15 overlays and their main/test patches in order. Run the Exact KB PDF overlay, then the image-compression overlay. The resulting package and lockfile version is `0.7.0-beta.20`. Apply each patch once to fresh source; Windows CRLF input is normalized by the image overlay.

See `.github/workflows/test-exact-kb-pdf.yml` for exact steps. It runs Node.js 22 locked dependencies, all 117 regression tests, the Windows x64 installer build and installed Windows smoke tests, then publishes the installer, blockmap and beta update manifest to the Beta 20 prerelease. The production download page is updated separately after checksum verification. Physical Windows 10/11 device testing remains separate from CI.

## Validation

The tests cover exact bytes/padding, lossless stream and form fidelity, unchanged default JPEG dimensions, original protection, ICC RGB compression, malformed/signed/XFA PDFs, worker execution, mixed batches, collision safety and all three image presets. Strong regression cases include explicit true-only opt-in, two-page PNG PDFs at exactly 70,000 bytes, rotated display geometry, flattened fields, unreachable targets and render resource cleanup. Independent Poppler rendering verified a 70 KB sample with visible form text. Installed Windows smoke tests click the real Strong button and verify the packaged renderer, consent, exact output and original bytes.
