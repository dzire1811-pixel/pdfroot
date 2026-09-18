# PDFRoot public-route audit

Audit basis: repository route definitions and tool implementations reviewed on 18 September 2026. “Indexed” means intended index status after this change; it is not a statement about Google's current index.

| Route | Type / classification | Working and content assessment | Intended index status | Recommendation |
| --- | --- | --- | --- | --- |
| `/` | Homepage / F | Working; unique homepage sections, now with a clearer service and browser-processing explanation | Index | Keep indexed |
| `/tools` | Tool directory / G | Working directory with internal links | Index | Keep indexed |
| `/about` | Trust / F | Working; founder and independent-site context | Index | Keep indexed |
| `/contact` | Support / G | Working mailto contact with visible email address | Index | Keep indexed |
| `/privacy-policy` | Legal / F | Working; browser and third-party AI processing disclosures | Index | Keep indexed |
| `/terms-and-conditions` | Legal / F | Working | Index | Keep indexed |
| `/disclaimer` | Legal / F | Working | Index | Keep indexed |
| `/faq` | Support / G | Working; privacy answers corrected | Index | Keep indexed |
| `/blog` | Blog directory / E | Working | Index | Keep indexed |
| `/blog/ojas-photo-resize-student-problem` | Article / E | Detailed, authored article | Index | Keep indexed |
| `/blog/pdfroot-smart-crop-image-tool` | Article / E | Detailed tool article | Index | Keep indexed |
| `/blog/resize-image-to-exact-kb` | Article / E | Detailed tool article and FAQ | Index | Keep indexed |
| `/blog/resize-image-exact-kb-government-forms` | Article / E | Useful but overlaps the exact-KB guide | Index | Keep indexed; distinguish further in a future editorial pass |
| `/blog/jpg-to-pdf-online-complete-guide` | Article / E | Short but useful workflow guide | Index | Keep indexed; expand with screenshots/examples later |
| `/blog/compress-pdf-without-losing-quality` | Article / E | Short but useful workflow guide | Index | Keep indexed; expand with concrete trade-offs later |
| `/blog/best-pdf-tools-students-professionals` | Article / E | Broad overview; closest to a summary page | Index | Keep indexed; add task-based examples later |
| `/blog/ssc-ojas-ibps-photo-resize-guide` | Article / E | Useful but overlaps focused recruitment tools | Index | Keep indexed; keep official-rule caveats |
| `/merge-pdf` | A | Implemented PDF merge, ordering and download; dedicated guide added | Index | Keep indexed |
| `/split-pdf` | A | Implemented page/range workflow; dedicated guide added | Index | Keep indexed |
| `/compress-pdf` | A | Implemented compression workflow; dedicated guide added | Index | Keep indexed |
| `/pdf-to-word` | A | Implemented DOCX conversion; dedicated guide added | Index | Keep indexed |
| `/pdf-to-excel` | A | Implemented conversion component | Index | Keep indexed; add a route-specific guide in next content pass |
| `/pdf-to-powerpoint` | A | Implemented conversion component | Index | Keep indexed; add a route-specific guide in next content pass |
| `/pdf-to-jpg` | A | Implemented PDF page rendering; dedicated guide added | Index | Keep indexed |
| `/jpg-to-pdf` | A | Implemented image-to-PDF workflow; dedicated guide added | Index | Keep indexed |
| `/png-to-pdf` | A | Implemented image-to-PDF workflow | Index | Keep indexed; add a PNG-specific guide in next pass |
| `/word-to-pdf` | A | Implemented conversion component | Index | Keep indexed; add a route-specific guide in next content pass |
| `/excel-to-pdf` | A | Implemented conversion component | Index | Keep indexed; add a route-specific guide in next content pass |
| `/powerpoint-to-pdf` | A | Implemented conversion component | Index | Keep indexed; add a route-specific guide in next content pass |
| `/rotate-pdf` | A | Implemented rotation component | Index | Keep indexed; add a route-specific guide in next content pass |
| `/organize-pdf-pages` | A | Implemented page organization component | Index | Keep indexed; add a route-specific guide in next content pass |
| `/delete-pdf-pages` | A | Implemented page deletion component | Index | Keep indexed; add a route-specific guide in next content pass |
| `/watermark-pdf` | A | Implemented watermark component | Index | Keep indexed; add a route-specific guide in next content pass |
| `/crop-pdf` | A | Implemented crop component | Index | Keep indexed; add a route-specific guide in next content pass |
| `/protect-pdf` | A | Implemented protection component | Index | Keep indexed; add a route-specific guide in next content pass |
| `/unlock-pdf` | A | Implemented unlock component | Index | Keep indexed; add a route-specific guide in next content pass |
| `/edit-pdf` | A | Dedicated implemented editor page | Index | Keep indexed |
| `/resize-image-to-exact-kb` | A | Implemented exact-KB workspace; dedicated guide added | Index | Keep indexed |
| `/compress-image` | A | Implemented image compression; dedicated guide added | Index | Keep indexed |
| `/crop-image` | A | Implemented crop workspace and article; dedicated guide added | Index | Keep indexed |
| `/resize-image` | A | Implemented dimension workspace; dedicated guide added | Index | Keep indexed |
| `/jpg-to-png` | A | Implemented conversion component | Index | Keep indexed; add a route-specific guide in next content pass |
| `/png-to-jpg` | A | Implemented conversion component | Index | Keep indexed; add a route-specific guide in next content pass |
| `/signature-resize-tool` | A | Implemented signature workspace; dedicated guide added | Index | Keep indexed |
| `/image-compressor-for-government-forms` | A | Implemented compression workflow; dedicated guide added | Index | Keep indexed |
| `/ssc-photo-resize` | A | Implemented SSC-focused helper; dedicated guide added | Index | Keep indexed |
| `/rrb-signature-resize` | A | Implemented RRB-focused helper; dedicated guide added | Index | Keep indexed |
| `/ibps-photo-resize` | A | Implemented IBPS-focused helper; dedicated guide added | Index | Keep indexed |
| `/ojas-photo-resize` | A | Implemented OJAS-focused helper; dedicated guide added | Index | Keep indexed |
| `/gpsc-photo-resize` | A | Implemented GPSC-focused helper; dedicated guide added | Index | Keep indexed |
| `/upsc-photo-resize` | A | Implemented UPSC-focused helper; dedicated guide added | Index | Keep indexed |
| `/front-back-card-merge` | A | Implemented card-combination component | Index | Keep indexed; add a route-specific guide in next content pass |
| `/background-remover` | D | Working local model, but intentionally hidden from listings | Noindex | Keep usable; excluded from sitemap until it is ready to promote |
| `/passport-photo-maker` | D | Optional AI feature and intentionally hidden from listings | Noindex | Keep usable; excluded from sitemap until it is ready to promote |
| `/login`, `/signup`, `/dashboard` | G | Redirected to `/tools` in `next.config.ts` | Redirect | Keep redirects; do not add to sitemap |

## Repeated copy found

The prior shared tool route template repeated “Upload File”, “Process Instantly”, “Download Result”, “Professional workflow”, “Mobile-first design”, “Secure experience”, “Complete platform”, and broad trust claims across tool pages. Priority routes now render dedicated factual guides instead. The generic fallback copy was also changed to user-facing guidance rather than SEO positioning.

## Privacy/processing audit

- Core document and image workflows are browser-based according to their implementation; they do not use network calls to transfer selected files for processing.
- Passport Photo Maker's optional AI outfit action posts the selected photo/mask to `/api/passport-photo/apply-outfit`, which forwards it to OpenAI's Images API when the feature is configured. It is therefore a third-party processing path.
- The former “automatically deleted within one hour” and blanket SSL/security claims were not proven by repository infrastructure and were removed.
- Background Remover uses local model code. It remains hidden/noindexed by existing listing policy, not because of a server upload finding.

## Editorial backlog (not published)

Future human-reviewed guides should cover: exact-KB resizing; file size versus dimensions; government form photos; signature preparation; portal upload failures; JPG/JPEG/PNG; PDF compression; PDF merge safety; scanned versus text PDFs; PDF-to-Word limitations; OJAS preparation; and RRB troubleshooting. Do not publish these as mass-generated pages.
