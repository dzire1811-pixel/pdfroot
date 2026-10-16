Exact KB PDF now offers an explicit Strong compression action when the ordinary image-compression methods cannot fit the chosen target.

- Strong compression also handles PNG/scanned page content and tries progressively smaller page images. It searches for the best practical JPEG quality that fits each attempted resolution.
- Before choosing Strong, the popup explains that resolution/clarity may decrease and text/forms become images. Default lossless and original-dimension JPEG paths remain available.
- Exact output bytes are verified; all pages remain, including displayed rotation and visible form values. Original files are never overwritten.
- The smallest result found is reported honestly, rather than claiming a universal minimum size. Some PDFs still cannot reach very small targets.
- Signed, encrypted and dynamic XFA PDFs remain protected. Strong rendering supports up to 50 pages with bounded canvas sizes and local decoder/font assets.
- Includes the Beta 19 Normal/Low/Heavy image compression fixes.

Validated with automated regression tests and an installed Windows x64 app test of the actual 70 KB Strong compression button and packaged renderer.
