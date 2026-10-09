# PDFRoot Desktop Pro Beta 13

The production /desktop-pro page links to PDFRoot-Desktop-Pro-Setup-v0.7.0-beta.13-x64.exe, hosted as a GitHub prerelease asset. Installer binaries are outside the Vercel bundle.

Release: https://github.com/dzire1811-pixel/pdfroot/releases/tag/v0.7.0-beta.13

Installer size: 118421926 bytes.

SHA-256: 7A522F6B44498482B8739FCD23BA65CA239CC18C7D8CA19D15EBE4CE5164EBE8

## Behavior

New profiles enable Windows startup automatically and keep PDFRoot in the tray. Existing active licences and saved startup preferences remain intact. Keys register before the main window opens, recover unavailable bindings automatically, and register again after resume/unlock. The app restores its own per-user classic menu at startup without requiring a user to repair registry entries.

The installer and repaired commands send a quoted --file argument. A first right-click launch captures Explorer selection before the app takes focus. Explicit multi-file arguments are retained; unrelated selections from another Explorer window are excluded. The selection worker waits for readiness on slower machines, starts in an STA thread, sends Unicode-safe data, and recovers from crashes or hangs. If Windows cannot provide files, a standard file chooser opens so the user can continue normally.

The menu retains 15 PDF-input and 17 image/government-input tools with individual icons. Windows 10 uses the classic right-click menu; Windows 11 uses Show more options. Uninstall removes the app's menu and Windows startup value. No paid signing certificate or certificate trust setup is required.

## Validation

Build source commit: d7fefd5707218afd1f5fcc17fde89234fbf795ae on codex/beta13-simple-payment-20261009. The overlay applies to the previously published Beta 9 source kit stored on that branch. Workflow: .github/workflows/publish-desktop-beta13.yml; successful Actions run 37883977822.

- 90 automated tests passed locally and on Windows, including slow worker readiness, crash/hang recovery, wrong-window file protection and preserved startup preferences.
- The real installer passed silent installation, 32 menu commands, quoted file arguments, icon files, folder entries and uninstall cleanup.
- The installed app opened in a fresh profile; a local isolated test key activated a 14-day fixture without using Production account/payment APIs.
- All 27 shortcut entries registered automatically and the real Windows Ctrl+Shift+F1 key opened the catalog.
- An actual Unicode/spaced JPG path launched through the same context command path and converted to PNG; JPG/PNG preview produced a two-page PDF; crop opened the selected image.
- Restart preserved the active test licence and a user-disabled startup preference.
- The installed public-key resource was restored after tests; the published installer always contains the original Production public keys.

The hosted runner is Windows Server 2022. It does not establish that all 35 engines or every physical Windows 10/11 PC have been tested. The friend's Windows 10 PC was unavailable, and the exact cause there remains unconfirmed. These changes address specific startup and file-selection weaknesses found in the existing source. The release includes beta.yml and blockmap files for the existing update channel.

## Sign-in and payment flow

- Google paid sign-in redirects the verified callback tab straight to the trusted Razorpay checkout; it no longer shows a plain return message before account verification.
- Google failure shows recovery instructions and restores the app. Verified email OTP is also available for both trial and paid plans.
- Checkout failures remain visible with a Retry payment button. Account summary loading does not block payment creation.
- Background sync of the current trial or paid licence keeps the plan screen open. Only a newly applied activation switches to tools; existing trials are never reported as payment confirmations.
- Twelve new regression tests cover callback success/error/state/redirect trust, same-tab checkout, email fallback, retry, summary delays and licence-sync navigation. No real customer email or payment is used in these fixtures.
- The installed Windows app checks the rendered email fallback, hidden initial retry and collapsed manual activation section in addition to the retained shortcut/conversion checks.
- A real Google account sign-in and captured Razorpay payment have not been performed as part of this release verification.

Public verification: the full installer download returned HTTP 200 with the recorded byte size and SHA-256; its SHA-512 matches the published beta update manifest. The website production build passed. A repository-wide TypeScript check still reports existing errors in unrelated Playwright test files; no application type errors were reported by that check.
