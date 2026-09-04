# PDF-to-Word WPS integration assessment

Date: 2026-08-22

## Availability

- No official WPS API credentials, application configuration, server-side upload storage, or licensed local WPS SDK are present in this project.
- The publicly documented integration is the WPS Open Platform cloud API: submit a remotely downloadable PDF URL to `POST /v7/developer/weboffice/pdf/convert/to/docx`, then poll the asynchronous task endpoint and download the completed DOCX.
- Exact WPS conversion parity is therefore not currently available. The browser-local converter must be described as the `internal` high-fidelity engine, not as the WPS algorithm.

## Licensing and deployment constraints

- WPS conversion access requires an authorized application, conversion permission, credentials, quotas, and applicable commercial terms.
- The desktop `kpdf2wordsdk` add-on is proprietary. This project must not copy, extract, redistribute, or invoke files from a user's WPS installation without a separate deployment license from WPS.
- A future official integration must be server-side. Secrets must remain in server environment variables and must never be shipped to browser code.
- The public API currently documents a 100 MB maximum input, a three-page limit for test applications, asynchronous results retained for one hour, and conversion API rate limits. Production limits and regional availability must be confirmed with WPS for the licensed application.

## Language and runtime assessment

- The official PDF-to-DOCX endpoint documents document conversion/OCR but does not publish a Gujarati-specific guarantee or its proprietary native-vs-OCR reconstruction algorithm. Gujarati support must be acceptance-tested with WPS before enabling the engine.
- The cloud route requires outbound HTTPS, a WPS access token, a time-limited PDF URL reachable by WPS, polling/queue handling, and temporary storage for the returned DOCX.
- No redistributable local/server WPS SDK has been supplied. If WPS offers one under contract, local deployment and Gujarati support must be verified directly in that license and SDK documentation.

## Privacy impact

- The existing PDF-to-Word implementation processes files in the browser. WPS Open Platform would upload or expose each source PDF to a third party for remote processing.
- The WPS cloud engine must remain disabled until the product explicitly approves this change, updates user-facing privacy disclosure/consent, and defines retention and deletion behavior.

## Integration point

- Introduce a `PdfToWordEngine` boundary ahead of conversion orchestration. `internal` remains the automatic local engine.
- A future `wpsOfficial` adapter belongs in a protected server route: create an upload URL, submit the WPS task, poll its status, fetch the DOCX, and return it unchanged. It must be enabled only by an explicit feature flag plus valid server credentials and privacy approval.
- Do not pass an official WPS DOCX through the internal paragraph, font, table, or Unicode reconstruction pipeline.

## Decision

Do not enable or simulate `wpsOfficial` in this change. Improve and test the generic internal engine, and keep the public workflow as Upload PDF -> Convert -> Download Word with no manual conversion settings.

## Official references

- https://open.wps.cn/documents/app-integration-dev/docs-center/convert/api-docs/ocr/pdf-to-docs
- https://open.wps.cn/documents/app-integration-dev/docs-center/convert/api-docs/ocr/to-docs-status
- https://open.wps.cn/documents/app-integration-dev/docs-center/convert/api-docs/overview
- https://www.wps.com/eula/
