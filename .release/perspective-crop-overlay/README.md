# PDFRoot Desktop Pro Beta 23 — live image corner Free Transform

Assemble the existing Beta 21 source, then run `node .release/perspective-crop-overlay/apply.cjs APP_PATH`.

Normal Crop remains the default. Free Transform places handles on the image's own four corners. Dragging any handle warps the entire photo into the destination quadrilateral immediately. Corners move independently, inward or outward. The preview includes space around the photo, refits after a drag, and retains mouse-wheel zoom and keyboard corner nudging. Invalid crossed/collapsed shapes are rejected.

This replaces the earlier Beta 22 document-boundary rectifier. The old selection-to-rectangle operation has been removed. A projective forward transform maps the complete source photo into the moved image corners; inverse sampling avoids holes. The bounding output includes every transformed corner, with transparency outside the image (white when saved to JPG). The original source is retained for Reset all edits.

Apply Transform runs in a local Worker at full resolution. The live preview uses the same mapping at reduced resolution and coalesces drag updates with requestAnimationFrame. The existing 16,000 px / 50 MP limits apply to full-resolution output. No service calls or new app dependencies are used.

Apply changes the working image; Save uses the existing replace/copy, MIME type, Fixed Size and Exact KB behavior. Saving with Free Transform open applies it first. Normal Crop's selection is preserved when toggling modes. Applied images and draft corner positions persist per image. A new shortcut batch starts in Normal Crop.

Validation includes unit tests for pixel identity, analytic projective mapping, whole-source corner movement, outward translation, malformed quads and alpha interpolation. The Windows candidate workflow installs and tests the real Worker and existing startup/shortcuts, then checks live preview pixel changes during actual mouse drags, outward handles, independent corners, normal cropping, reset, per-image state and Save. It uploads a candidate installer and screenshots; it does not publish a release or update the live website.
