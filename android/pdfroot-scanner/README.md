# PDFRoot Mobile — all-in-one Android prototype

This project combines an on-device CamScanner-style scanner with the PDFRoot website's full tool directory in one mobile app. It is a separate Android Studio project: **the Vercel website and Windows Desktop Pro are unchanged**.

## What is implemented in version 0.1

| Tool / workflow | Implementation | Network |
|---|---|---|
| Document scanner: automatic crop, filters, multi-page | Native Google ML Kit scanner UI | Requires Google Play services; initial module download may need internet |
| Gallery photos to PDF (1–30 pages) | Native Android PdfDocument | Offline |
| My Documents (open/share/save/rename/delete PDFs) | Native Android app-private files and Android Documents UI | Offline |
| Merge PDF, Compress PDF, Split PDF, PDF to JPG, Exact KB, crop, signature resize and other live PDFRoot tools | **Website shown inside the app** in an embedded WebView | Internet required |

The tools shown in the embedded tab use the already deployed public PDFRoot website; they have **not** been rewritten as native/offline tools. The app provides Android file selection and attempts secure same-site file exports. Standard HTTPS downloads go via Android DownloadManager. Browser-generated blob results up to 25 MB are handled via an origin-scoped WebView messaging bridge (when supported by the installed WebView), then an Android Save As picker. If a result is not exportable from WebView, tap **↗** to open that PDFRoot tool in the browser. These flows need physical-device verification and should not be called production-ready yet.

## Building a debug APK

1. Install Android Studio (JDK 17, Android SDK 35).
2. Open the `android/pdfroot-scanner` directory as the project.
3. Sync Gradle, then choose **Build → Build APK(s)**.
4. Debug APK path: `app/build/outputs/apk/debug/app-debug.apk`.
5. GitHub Actions workflow `PDFRoot Android Scanner APK` also attempts to build and upload a debug APK artifact on PR changes.

## Device prerequisites

- Android 6.0+, Google Play services, enough available RAM and Android System WebView.
- The ML Kit scanner may download its module on first use. Not every Android device is supported.
- Camera/gallery access for scanning is handled by the Google scanner UI. File selection uses Android's Documents UI.
- The app's locally stored PDFs may be lost when the application is uninstalled; tap **Save** for a durable external copy.
- The native scanner/converter do not upload source documents to a PDFRoot server. Website-based tools use the current public PDFRoot website and its separate processing/privacy policies. Sensitive inputs should be treated accordingly.

## Engineering status and release blockers

- Android compile is checked with the GitHub Actions workflow; check the latest run's **conclusion**.
- Real Android camera tests, large inputs, low-memory/legacy Android tests, WebView file picker and blob export verification, privacy disclosures, release signing and Play Store policy review are pending.
- Not yet implemented as native features: OCR/searchable PDF (English/Hindi/Gujarati), PDF signatures, PDF page editor, native PDF merge/compress, offline Exact KB tools, PDF password encryption, cloud synchronization, or an iOS build.
- The Android project currently builds a debug APK only, not a production-ready signed Play Store release.

Scanner implementation reference: https://developers.google.com/ml-kit/vision/doc-scanner/android

## Next native milestones

1. Stabilize CI and validate scan → save → share, photos → PDF, and live tool uploads/exports on at least two real Android versions.
2. Native PDF merge/split/compress and offline Exact KB image resizing, preserving output quality.
3. OCR in English, Hindi and Gujarati, plus searchable PDF.
4. Native PDF annotation/signature workflows, a proper files dashboard, permission-safe storage and accessibility.
5. Polish full Play Store branding, privacy and release signing; then Android release testing.
