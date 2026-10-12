# PDFRoot Desktop Pro Beta 14

The production /desktop-pro page points to GitHub's Beta 14 prerelease installer. The ~118 MB installer stays outside Vercel hosting. The GitHub release also contains `beta.yml` and the installer blockmap so existing beta clients can discover updates.

Release: https://github.com/dzire1811-pixel/pdfroot/releases/tag/v0.7.0-beta.14

Installer: PDFRoot-Desktop-Pro-Setup-v0.7.0-beta.14-x64.exe

Installer size: 118423346 bytes.

SHA-256: 2A35897D326D451BBC5388931BA4BEBC9A8EE940D46065C8AEAB516C15D815AC

## Crop Image Windows EPERM improvement

When Windows temporarily prevents replacing the original JPG/PNG/WebP because it is in use, Crop Save retries with short delays. If the destination stays locked, PDFRoot saves a conflict-free `-copy-N` image beside the original instead of losing the crop or modifying the original. The UI states explicitly when a separate copy was saved. Temporary files are removed even when saving fails, and a changed original is not silently overwritten.

## Release verification

- Source branch: `codex/fix-crop-image-eperm-20261012`
- Release build: https://github.com/dzire1811-pixel/pdfroot/actions/runs/38251296067
- 93 automated tests passed, including EPERM recovery and preserving the original.
- The Windows Server 2022 build installed and smoke-tested the real crop save, local conversion, account/activation fixture, hotkey, right-click integration, restart and uninstall.
- Existing Beta 13 license, payment, and right-click behaviors were carried forward.
- Actual customer machines running Windows 10 and Windows 11 were not verified by the hosted runner.

## Rollout

The production website's installer URL and SHA-256 correspond to the verified Beta 14 release. Existing beta installations have the built-in `electron-updater` prerelease channel, which may download a newer installer when update checks succeed. Installation depends on each PC's update configuration and permission state, and should be verified manually on a real Windows 10/11 machine.
