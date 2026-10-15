# PDFRoot Android Scanner — MVP

An Android-first companion for PDFRoot.com. This is a separate Android Studio project and does not change the live PDFRoot website or Windows Desktop Pro.

## Available in this prototype

- **Scan a document:** native camera/gallery scanner from Google's ML Kit Document Scanner.
- Automatic page-edge detection, crop, rotation, filters and multi-page PDF creation using the SDK's FULL mode.
- PDFs are copied out of the scanner's temporary URI into **app-private on-device storage**.
- **My Scans:** view, rename, share, save/export to a folder chosen by the user, and delete.
- **PDFRoot Tools:** opens https://www.pdfroot.com/tools through a Chrome Custom Tab / browser, so existing web tools remain accessible.
- Scanning itself does not require this app to request the Android CAMERA permission.

## Build an APK

1. Install recent Android Studio and Android SDK 35 (JDK 17).
2. Open the **android/pdfroot-scanner** folder as a Gradle project and let Android Studio sync.
3. Choose **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
4. The debug APK is produced at **app/build/outputs/apk/debug/app-debug.apk**.
5. Alternatively, the GitHub Actions workflow **PDFRoot Android Scanner APK** builds and uploads a debug APK artifact when the pull request runs, or when manually dispatched.

**The source has not been verified on a physical Android phone yet.** A successful CI build is only a compile check; camera scanning and different device configurations need real-device QA.

## Device requirements and important behavior

- Android 6.0 or newer (minSdk 23), Google Play services, and adequate RAM (ML Kit specifies at least 1.7 GB).
- On first use, Google Play services may download the scanner component and its models. Therefore first-run scanning may need connectivity and take time.
- The built-in scanner UI is provided by Google Play services, not a custom PDFRoot camera implementation.
- Scans in My Scans are app-private and **can be removed when the app is uninstalled**; use **Save** to make a separate permanent copy.
- No scanned images or PDFs are uploaded to a PDFRoot server by this app's native scanning/storage functionality. Opening the web tools accesses the public website, whose own handling applies.

## Out of scope for version 0.1

- OCR / searchable PDF / text extraction in Hindi, Gujarati, and English
- PDF signing, annotations, watermark, password lock, cloud backup
- iOS app
- Google Play public release, signed release bundle and production readiness checks

Before Google Play submission: add production app icon and brand artwork, privacy disclosures, signing, device testing, accessibility QA and check the SDK's compatibility with Android devices that use 16 KB memory pages.

The existing website's code/deployments are untouched by this PR.

Documentation: https://developers.google.com/ml-kit/vision/doc-scanner/android
