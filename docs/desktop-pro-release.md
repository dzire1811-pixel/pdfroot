# PDFRoot Desktop Pro Beta 9

The production `/desktop-pro` page links to the Windows x64 NSIS installer hosted as a GitHub prerelease asset. Installer binaries are not included in the Vercel bundle.

Release: https://github.com/dzire1811-pixel/pdfroot/releases/tag/v0.7.0-beta.9

Installer: `PDFRoot-Desktop-Pro-Setup-v0.7.0-beta.9-x64.exe` (118413198 bytes)

SHA-256: `EF43A41519D3F0910F838E9D6735DE6AC31FC804B950880EF5BE8EAC077CD5AA`

## File Explorer menu

The installer registers the classic context menu for the Windows account that installs the app. Each customer's installation receives the same integration automatically. Windows 10 displays it in the classic right-click menu; Windows 11 exposes it through **Show more options**. No paid signing certificate, self-signed certificate trust installation, or system-wide Explorer menu override is used.

The menu provides 15 PDF-input commands and 17 image/government-input commands, with an individual icon for each tool. Folder and folder-background entries open the full catalog. Uninstall removes the PDFRoot menu keys. Existing keyboard shortcuts and the production payment/login configuration are preserved.

## Validation

- All 70 source tests passed locally and on the Windows build runner.
- The Windows workflow checks production configuration, builds the installer, and verifies installer/update files.
- Before publication, the workflow silently installs the app, verifies all 32 commands, icon files and folder entries, then uninstalls and verifies menu cleanup.
- A physical Windows 10/11 Explorer interaction check is separate from these Windows runner installation checks.

Build workflow: `.github/workflows/publish-desktop-beta9.yml` on `codex/beta9-classic-menu-20261008`. The prerelease includes the installer, its blockmap and `beta.yml` for the existing beta update channel.
