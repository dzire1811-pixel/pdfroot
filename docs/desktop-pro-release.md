# PDFRoot Desktop Pro Beta 15

Production download page: https://www.pdfroot.com/desktop-pro
GitHub release: https://github.com/dzire1811-pixel/pdfroot/releases/tag/v0.7.0-beta.15

Installer: PDFRoot-Desktop-Pro-Setup-v0.7.0-beta.15-x64.exe
Size: 118425299 bytes
SHA-256: 494606FCE58B307F527CD3AD54FA356976128E35A6540DC7BBA28F116CEA63D9

## Keyboard shortcut and file picker behavior

Auto and Normal Mode hotkeys read the currently selected, supported File Explorer files and launch the corresponding editor or conversion without invoking the Windows "Select files for..." dialog. Right-click commands do not pop open a picker either. If File Explorer does not report an eligible selection, PDFRoot shows a notification advising the user to select suitable files and press the shortcut again. A shortcut cannot process an image that has never been selected. The existing add-image chooser inside Crop is intentionally preserved for explicit user clicks.

The persistent Windows STA Explorer helper, Unicode paths, automatic startup, right-click repair, current email/Google sign-in, payment and license flow remain present. Responsiveness depends on Explorer and the customer's PC; no absolute zero-delay guarantee is made.

## Image fidelity

- The generic and government image-compression shortcuts do not automatically shrink JPG dimensions (the previous build always shrank them 14% or 28%).
- Lossless PNG output stays PNG; WebP is retained as WebP instead of converted to JPEG during a compression shortcut.
- JPEG compression tries a high-quality same-resolution encode when it makes the result smaller, otherwise writes an unchanged copy. Existing originals are never modified.
- For Exact KB, an already-small valid JPEG is padded directly without any pixel re-encoding. When output must be smaller than input, quality/dimensions may need to change; this is an unavoidable size-versus-quality constraint.
- Front & Back does not enlarge the smaller ID photo to match the larger one, uses centered panels and higher JPEG output quality; PNG-to-JPG quality setting has also been increased.

## Tests and release

Source branch: codex/fast-shortcuts-image-fidelity-beta15
Windows release workflow: https://github.com/dzire1811-pixel/pdfroot/actions/runs/38391764511

- 97 automated tests passed on the Windows CI runner, covering crop, File Explorer selection, shortcut input, compression dimensions, exact-KB byte and pixel integrity, Front & Back, activation and other local tools.
- Installer was installed on Windows Server 2022; real crop JPG replace, menu registration and uninstall, hotkey, trial fixture, conversion and restart smoke checks passed.
- The release includes electron-updater beta.yml and installer blockmap for automatic beta updates.
- Real physical Windows 10 and Windows 11 customer machines have not been independently checked. Not every visual/quality condition for all 35 tools is exhaustively proved by these tests.

The GitHub release holds the installer outside Vercel so the website deploy remains compact.
