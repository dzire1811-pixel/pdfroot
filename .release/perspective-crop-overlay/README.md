# PDFRoot Desktop Pro Beta 22 — optional Perspective Crop

Assemble the verified Beta 21 source using the existing overlays, then run:

```sh
node .release/perspective-crop-overlay/apply.cjs PATH_TO_ASSEMBLED_APP
```

Normal Crop remains the default. Perspective Crop exposes four independent corners
in clockwise order. Convexity and minimum-area checks prevent crossed or collapsed
selections. Mouse dragging and arrow keys work in normalized preview coordinates;
zoom does not change the selected image coordinates.

Apply Crop performs a projective transform at source resolution in a local Worker,
using bilinear interpolation with premultiplied alpha. No network service or new
runtime dependency is required. The existing 16,000 px / 50 MP limits are enforced.
Output dimensions use the longer of the two opposing edges. Perspective alone
cannot infer a document's physical aspect ratio; existing Fixed Size controls can
set the required output dimensions.

Applying updates the working preview only. Save uses the existing file-replacement
and copy workflow, original MIME type, Fixed Size and Exact KB settings. Save while
the corner selection is open applies it first. Reset all edits restores the source
photo. Each image retains its own working preview and crop mode while switching
within a batch. A new shortcut batch resets Perspective Crop to Normal Crop.

Validation:

- `npm test` in the assembled app includes original crop regressions and independent
  homography, pixel identity, corner resampling, alpha and malformed-selection tests.
- `browser-smoke.cjs APP_PATH ARTIFACT_PATH` uses Playwright for real mouse drags,
  normal crop/save, mode switching, zoom, local Worker, reset, batch state and save.
- `windows-smoke.cjs INSTALLED_EXE APP_PATH` extends the Beta 21 installed-app
  startup/shortcut checks with an installed Perspective Worker and source reset.
- `test-perspective-crop.yml` builds a Windows x64 candidate and verifies it before
  uploading artifacts. It does not publish a release or change customer downloads.
