# PDFRoot Final Playwright Inspection Report

Inspection date: 13 July 2026  
Base URL: `https://pdfroot.vercel.app`  
Final command: `npx playwright test`  
Final result: **115 passed, 5 intentionally skipped, 0 failed** in 4.6 minutes

The five skips are expected project guards: desktop-only integrity/dropdown checks are skipped in the mobile project, and mobile-only hamburger/drawer checks are skipped in the desktop project. They do not represent unexecuted features or defects.

## Critical

No critical defects were found in the automated inspection scope.

## Important

No important defects were found in the automated inspection scope.

## Minor

No minor defects were found in the automated inspection scope.

## Passed

- Audited all 53 public HTML routes at both requested Chromium sizes: desktop 1440x900 and mobile 390x844.
- Confirmed every audited route responds below HTTP 400, renders one non-empty document title, one visible H1, and no duplicate page title across the public route set.
- Confirmed all discovered same-origin links resolve without HTTP errors, including `robots.txt` and `sitemap.xml`.
- Detected no uncaught page exceptions or browser console errors on the route matrix.
- Detected no failed image requests, rendered images with zero natural width, or missing navigation tool icons.
- Detected no document-level horizontal overflow or horizontally clipped visible interactive elements in the audited initial page states.
- Confirmed every one of the 36 public tool routes exposes an upload input.
- Confirmed desktop direct navigation routes and Convert PDF, Government Recruitment Resize Tools, and All Tools dropdown contents.
- Confirmed the desktop dropdown rows do not overlap and remain within the viewport.
- Confirmed the two shortened government-tool labels in the relevant desktop and mobile menus.
- Confirmed the mobile hamburger menu, direct links, single-open accordion behavior, complete tool counts, internal scrolling, background scroll lock, final-item visibility, and close-button/hamburger/outside-tap behavior.
- Confirmed image upload, preview, desktop settings, mobile settings drawer, fixed action bar, processing transition, result screen, and blob-backed download link on the Resize Image workflow.
- Confirmed two-file PDF upload, page previews, fixed action bar, processing transition, result screen, and blob-backed download link on the Merge PDF workflow.
- Confirmed the Compress PDF mobile settings drawer opens within the viewport above the sticky workflow UI and closes cleanly.
- Confirmed sticky workflow bars and tested drawers stay within the requested viewports without horizontal clipping.
- Playwright is configured to retain screenshots, videos, and traces only for failures. The final passing run produced no failure artifacts.

## Not Tested

- Firefox, WebKit, Safari, Edge, and branded Google Chrome were not run; the requested desktop and mobile Chromium profiles were run first and completed successfully.
- Authenticated dashboard behavior, account creation, sign-in submission, email delivery, and other user-account backends were not exercised.
- Every tool page was audited for route health and upload availability, but all 36 processing engines were not each run through a complete conversion. End-to-end processing used representative image and PDF workflows plus the Compress PDF mobile drawer.
- The AI Background Remover network model/API was not submitted to avoid invoking an external or potentially metered production operation.
- Office conversion accuracy for DOCX, XLSX, and PPTX, password-protected PDF behavior, and output fidelity for every PDF editor were not byte-for-byte validated.
- Download controls were verified for visibility, filename metadata, and blob-backed URLs; actual disk persistence and downloaded-file byte comparison were not performed.
- Large files, malformed files, unsupported formats, network interruption recovery, rate limiting, concurrent uploads, accessibility conformance, and performance budgets were not stress-tested.
- Drag-and-drop, touch-drag drawer dismissal, and file-card reordering gestures were not exhaustively exercised; click/tap upload and close paths were covered.

## Artifacts

- HTML report: `playwright-report/index.html`
- JSON result data: `test-results/results.json`
- Final suite: `tests/pdfroot.final.spec.ts`
- Configuration: `playwright.config.ts`

No production source, UI, CSS, route, or application functionality was changed as part of this inspection work.
