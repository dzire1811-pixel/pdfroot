# PDFRoot Desktop Pro Beta 20 release

The production `/desktop-pro` page links to the verified Windows x64 Beta 20 installer, distributed as a GitHub Release asset. The installer is not part of the website static bundle.

Compress Image opens the same compact Normal / Low / Heavy chooser from the catalog, keyboard shortcut and Explorer menu. Native JPEG/WebP encoding replaces the old mild-recompression/copy behavior. Every level preserves dimensions; stronger levels are lossy. Transparent PNG stays PNG, with colour reduction only in Low/Heavy. Opaque PNG may become JPG, as disclosed before choosing a level. Already compact inputs are never enlarged, and results report original/output KB and percentage saved. Originals are kept as separate files.

Exact KB PDF adds explicit Strong compression when the ordinary JPEG-only methods do not reach a target. It renders supported pages locally at adaptive resolution and JPEG quality, including PNG/scanned content and visible form values. The popup explains that clarity may decrease and text/forms become images. It reports the smallest result found, rather than claiming a universal minimum. The existing lossless and original-dimension JPEG paths remain available, with ICC colour-profile preservation. Strong supports up to 50 pages with bounded canvas sizes. Signed, encrypted and dynamic XFA documents remain protected.

## Verification and build

Source: GitHub tag `v0.7.0-beta.20`. The `test-exact-kb-pdf.yml` workflow assembles the Beta 11/12/14/15 overlays, then the Exact KB PDF overlay and image-compression overlay. It installs locked dependencies with Node.js 22, runs all 117 automated tests, builds the x64 NSIS installer and tests the installed app on Windows Server 2022 before publishing.

Installed tests exercise all three image compression buttons on the same image, verify distinct smaller output sizes, unchanged dimensions, original bytes, cancellation, actual savings messages, licensing in an isolated profile, registered shortcuts, the actual Strong button on a two-page PNG PDF at exactly 70,000 bytes, Exact KB PDF and crop replacement. This does not replace physical Windows 10/11 device testing.

The GitHub prerelease contains the installer, its `.blockmap` and `beta.yml` for the existing beta automatic update channel. The website lists its SHA-256. Downloads and updates use the same installer; existing activation settings remain in the app profile.
