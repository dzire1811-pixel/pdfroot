import Link from "next/link";

type Guide = {
  label: string;
  summary: string;
  bestFor: string;
  supports: string;
  workflow: string[];
  example: string;
  limits: string;
  faqs: Array<[string, string]>;
  related: Array<[string, string]>;
};

const imageFormats = "JPG, JPEG, PNG and WebP image files.";
const browserPrivacy = "This workflow processes the selected file in your browser; the file is not uploaded to a PDFRoot server for this operation.";
const imageRelated: Array<[string, string]> = [["Crop Image", "/crop-image"], ["Resize Image", "/resize-image"], ["Resize Image to Exact KB", "/resize-image-to-exact-kb"]];
const pdfRelated: Array<[string, string]> = [["Merge PDF", "/merge-pdf"], ["Split PDF", "/split-pdf"], ["Compress PDF", "/compress-pdf"]];

const guides: Record<string, Guide> = {
  "pdf-to-excel": {
    label: "PDF data into spreadsheets",
    summary: "Extract readable PDF text into spreadsheet rows and columns, with a worksheet for each page that contains extracted data.",
    bestFor: "Reusing lists, statements and simple text-based tables in a spreadsheet.",
    supports: "PDF files (.pdf) with readable text; output is Excel (.xlsx).",
    workflow: ["Choose the PDFs containing the data you need.", "Convert the files to extract page text into worksheets.", "Open the workbook and check column alignment, numbers and missing rows against the PDF."],
    example: "Extract a typed expense list, then correct any shifted columns before sorting its rows in Excel.",
    limits: "This tool does not run OCR on scanned pages. Table boundaries are inferred from text positions, so merged cells, multi-line entries and complex layouts may need cleanup. Formulas are not recovered from a PDF.",
    faqs: [["Can I convert a scanned statement?", "Not directly if its pages contain only images. This workflow requires readable PDF text and does not include OCR."], ["How are pages arranged in Excel?", "Each page with extracted rows becomes a worksheet named for that page."], ["Will formulas be restored?", "No. The tool extracts displayed text and values, not the original spreadsheet formulas."], ["Why are some columns misaligned?", "PDF text positions do not always describe a table reliably. Check wrapped text, blank cells and multi-column pages manually."], ["Can I convert several PDFs?", "Yes. Each PDF produces a workbook; multiple results are packaged in a ZIP download."]],
    related: [["Excel to PDF", "/excel-to-pdf"], ["PDF to Word", "/pdf-to-word"], ["Split PDF", "/split-pdf"]],
  },
  "pdf-to-powerpoint": {
    label: "PDF pages into slides",
    summary: "Render PDF pages as images and place them into a downloadable PowerPoint presentation.",
    bestFor: "Presenting an existing PDF as a slide deck without rebuilding its pages manually.",
    supports: "PDF files (.pdf); output is PowerPoint (.pptx) with image-based slides.",
    workflow: ["Add the PDF files you want to present.", "Convert their pages into PowerPoint slides.", "Open the presentation and check page proportions, text readability and slide order."],
    example: "Turn a PDF training handout into a presentation for displaying its pages during a meeting.",
    limits: "Page text, charts and graphics become slide images, not separately editable PowerPoint objects. Check how portrait or unusually sized pages fit the slides.",
    faqs: [["Does each PDF page become a slide?", "Yes. Pages are rendered as images and added to the presentation in order."], ["Can I edit individual words on a slide?", "Not as native PowerPoint text: the converted page is an image."], ["Can scanned pages be converted?", "They can be rendered as slide images, but this does not recognize their text."], ["Can I convert several PDFs together?", "Yes. Each PDF becomes a presentation; multiple outputs are downloaded in a ZIP."], ["Will PDF animations or links become PowerPoint effects?", "No. This conversion renders the visible pages rather than recreating interactive presentation features."]],
    related: [["PowerPoint to PDF", "/powerpoint-to-pdf"], ["PDF to JPG", "/pdf-to-jpg"], ["Split PDF", "/split-pdf"]],
  },
  "png-to-pdf": {
    label: "PNG images into a document",
    summary: "Arrange PNG images and combine them into a PDF with the available page-size, orientation and margin settings.",
    bestFor: "Collecting PNG screenshots, diagrams or scanned pages into one document.",
    supports: "PNG image files (.png); output is PDF.",
    workflow: ["Choose the PNG files for your document.", "Arrange the images and review the page settings.", "Create the PDF and check that every image fits its page before downloading."],
    example: "Put several PNG screenshots of a software issue into one PDF in the order they should be read.",
    limits: "The PDF contains images, not newly editable text. Inspect transparent areas, margins and scaling in the result, and keep the original PNG files for future edits.",
    faqs: [["Can this route accept JPG files?", "This workspace is restricted to PNG. Use JPG to PDF for JPG, JPEG or other supported image inputs."], ["Can I combine multiple PNGs?", "Yes. Arrange the selected PNG images before creating the PDF."], ["Can I change the page orientation?", "Yes. Use the orientation and page settings in the workspace."], ["Will text in screenshots become searchable?", "This workflow does not perform OCR; screenshot text remains part of the image."], ["Why should I check transparent areas?", "Transparency can look different against a PDF page background. Review the saved document in your intended viewer."]],
    related: [["JPG to PDF", "/jpg-to-pdf"], ["PDF to JPG", "/pdf-to-jpg"], ["Merge PDF", "/merge-pdf"]],
  },
  "word-to-pdf": {
    label: "Word documents as PDF",
    summary: "Create a PDF from a DOCX document, carrying over readable text, headings, basic styling and simple tables where supported.",
    bestFor: "Making a shareable PDF copy of a straightforward Word document.",
    supports: "One Word DOCX file (.docx) at a time. Save legacy DOC files as DOCX before conversion.",
    workflow: ["Select a DOCX document.", "Convert the document to PDF.", "Review the downloaded pages for text wrapping, tables and page breaks."],
    example: "Convert a short typed letter to a PDF attachment, then confirm that its address and signature lines appear correctly.",
    limits: "This is not Word's print engine. Complex formatting, embedded objects and precise page layout may not carry over; compare the PDF with the original document.",
    faqs: [["Can I convert a legacy DOC file?", "The file picker accepts DOC, but conversion requires DOCX. Open the DOC in a compatible editor and save it as DOCX first."], ["Does the tool accept multiple Word files at once?", "This workflow works with one document at a time."], ["Are headings and simple tables supported?", "The converter handles headings, paragraphs, basic text styling and simple tables where possible."], ["Will page breaks match Word exactly?", "Not necessarily. Review pagination and wrapping in the generated PDF."], ["Can I recover an editable Word document from the PDF later?", "PDF to Word is a separate conversion and may require cleanup. Keep the original DOCX for editing."]],
    related: [["PDF to Word", "/pdf-to-word"], ["Merge PDF", "/merge-pdf"], ["Compress PDF", "/compress-pdf"]],
  },
  "excel-to-pdf": {
    label: "Spreadsheet tables as PDF",
    summary: "Turn spreadsheet cell data into PDF tables, choosing the sheet scope, paper size, orientation and column-fit options in the workspace.",
    bestFor: "Sharing a readable table of worksheet values with someone who does not need to edit the workbook.",
    supports: "Excel workbook files (.xls and .xlsx); output is PDF.",
    workflow: ["Select the Excel workbooks to convert.", "Choose the sheets, page settings and column-fit option.", "Create the PDF and check wide tables, long cell values and page breaks."],
    example: "Export the first sheet of a stock list as a landscape PDF for review at a meeting.",
    limits: "The converter lays out cell values as tables rather than reproducing Excel's print layout. Charts, drawings, workbook styling and formulas are not recreated as interactive spreadsheet features.",
    faqs: [["Can I convert XLS as well as XLSX?", "Yes. Both workbook formats are accepted."], ["Can I export only the first sheet?", "Yes. The sheet-scope setting offers the first sheet or all sheets."], ["Can I use landscape pages?", "Yes. Choose portrait or landscape, with A4 or Letter paper."], ["Will all columns be included?", "Check the column-fit setting: the workspace can include all columns or limit the table to the first ten."], ["Can I calculate with formulas in the PDF?", "No. The PDF is a table of displayed cell values, not a working spreadsheet. Retain the workbook for calculations."]],
    related: [["PDF to Excel", "/pdf-to-excel"], ["Merge PDF", "/merge-pdf"], ["Rotate PDF", "/rotate-pdf"]],
  },
  "powerpoint-to-pdf": {
    label: "Presentation pages as PDF",
    summary: "Convert supported text and images from a PPTX presentation into PDF pages for reading or sharing outside a presentation editor.",
    bestFor: "Creating a static reference copy of a simple slide presentation.",
    supports: "PowerPoint PPTX files (.pptx). Save legacy PPT files as PPTX before conversion.",
    workflow: ["Add the PPTX presentations.", "Review the available page settings and convert the files.", "Open the PDF and compare slide text, images and placement with the original deck."],
    example: "Make a PDF copy of a short briefing deck to distribute with meeting notes.",
    limits: "The browser converter does not reproduce every PowerPoint feature. Animations, transitions, complex drawings and unsupported image formats may be omitted or look different.",
    faqs: [["Can I use an older PPT file?", "Save it as PPTX first. Legacy PPT files are rejected when conversion begins."], ["Will animations play in the PDF?", "No. The result contains static pages."], ["Is this identical to PowerPoint's PDF export?", "No. This converter reads supported slide elements, so check complex layouts carefully."], ["Can I convert more than one presentation?", "Yes. Multiple presentations can be selected, with multiple outputs packaged for download."], ["Should I keep the PPTX?", "Yes. It remains the editable source for slide changes and presentation effects."]],
    related: [["PDF to PowerPoint", "/pdf-to-powerpoint"], ["Merge PDF", "/merge-pdf"], ["PDF to JPG", "/pdf-to-jpg"]],
  },
  "rotate-pdf": {
    label: "Page orientation",
    summary: "Correct sideways or upside-down PDF pages using the rotation controls, then save a new PDF.",
    bestFor: "Fixing the reading direction of scanned pages without changing their wording.",
    supports: "One PDF file (.pdf) at a time.",
    workflow: ["Choose the PDF and inspect its page previews.", "Rotate the required page, or use the option to apply rotation to all pages.", "Save the result and check each page's orientation."],
    example: "Turn a sideways scanned receipt upright while leaving the other pages in the document as they are.",
    limits: "Rotation changes the page orientation, not the text or image contents. It does not straighten a slightly skewed scan or recover detail from a blurry page.",
    faqs: [["Can I rotate only one page?", "Yes. Select the page you want to rotate in the workspace."], ["Can I rotate every page together?", "Yes. Use the apply-to-all option when the whole document needs the same rotation."], ["Does rotation change the words on the page?", "No. It changes how the page is oriented."], ["Will this fix a scan tilted by a few degrees?", "The page rotation controls are for orientation changes, not fine-angle scan correction."], ["Will the saved file still be a PDF?", "Yes. Download a new PDF with the chosen rotations."]],
    related: [["Crop PDF", "/crop-pdf"], ["Organize PDF Pages", "/organize-pdf-pages"], ["Delete PDF Pages", "/delete-pdf-pages"]],
  },
  "organize-pdf-pages": {
    label: "Page order and selection",
    summary: "Arrange PDF page previews into the order you need, with controls to rotate or remove pages before saving a new document.",
    bestFor: "Putting scanned pages in reading order or assembling selected pages from several PDFs.",
    supports: "One or more PDF files (.pdf).",
    workflow: ["Add PDFs and review their page thumbnails.", "Reorder pages and use the rotation or removal controls as needed.", "Create the organized PDF and verify the final sequence."],
    example: "Place an application's cover page first, move its supporting pages into order, and remove a duplicate scan.",
    limits: "Organizing changes page order and inclusion, not the text within each page. Check that every required page is present before sharing the new document.",
    faqs: [["Can I change page order?", "Yes. Move the page previews into the intended sequence."], ["Can pages come from more than one PDF?", "Yes. Add multiple PDFs to organize their pages together."], ["Can I rotate a page here?", "Yes. Page rotation is available alongside the organization controls."], ["Can I remove unwanted pages?", "Yes. Review your selection before removing pages and creating the result."], ["Can I edit a sentence while organizing?", "No. Use Edit PDF for supported text edits or added annotations."]],
    related: [["Merge PDF", "/merge-pdf"], ["Split PDF", "/split-pdf"], ["Edit PDF", "/edit-pdf"]],
  },
  "delete-pdf-pages": {
    label: "Remove unwanted pages",
    summary: "Select pages to leave out of a PDF and download a new copy containing the pages you keep.",
    bestFor: "Removing blank scans, duplicates or an unnecessary appendix from a document.",
    supports: "One PDF file (.pdf) at a time.",
    workflow: ["Choose a PDF and review its page thumbnails.", "Select the pages to delete, leaving at least one page in the document.", "Create the result and check the remaining pages before downloading."],
    example: "Remove the blank reverse-side pages from a scanned form while keeping all completed pages.",
    limits: "This tool removes whole pages, not individual words or pictures. Keep the original separately and check page numbers after deletion.",
    faqs: [["Can I delete every page?", "No. At least one page must remain in the output."], ["Can I choose several pages to remove?", "Yes. Select the unwanted pages before running deletion."], ["Will the original file be overwritten?", "The tool creates a downloadable result. Keep your source file for reference."], ["Does deleting a page renumber printed page labels?", "It changes the PDF's page sequence, not page numbers printed within its content."], ["Can I remove only a paragraph?", "No. This workflow removes complete pages, not parts of a page."]],
    related: [["Organize PDF Pages", "/organize-pdf-pages"], ["Split PDF", "/split-pdf"], ["Merge PDF", "/merge-pdf"]],
  },
  "watermark-pdf": {
    label: "Visible document labels",
    summary: "Add a visible text or image watermark to PDF pages, adjusting its appearance and the pages where it is applied.",
    bestFor: "Labelling review copies, drafts or documents with a visible logo.",
    supports: "PDF files (.pdf); PNG or JPG images can be used for an image watermark.",
    workflow: ["Add the PDFs and choose a text or image watermark.", "Set its position, angle and opacity, and choose all pages or a page range.", "Generate the PDF and check that the watermark does not obscure important content."],
    example: "Add a light DRAFT label to review pages before circulating them for comments.",
    limits: "A visible watermark is not encryption, a digital signature or secure redaction. Check text rendering and image proportions in the final PDF.",
    faqs: [["Can I use a logo instead of text?", "Yes. Choose image watermark and select a PNG or JPG logo."], ["Can I watermark selected pages?", "Yes. Choose the selected-pages option and enter the required page range."], ["Can I make the watermark less prominent?", "Use the opacity, position and size controls, then inspect the output."], ["Does a watermark prevent copying?", "No. It is a visible mark, not a document access control."], ["Does it remove content underneath?", "No. A watermark is added over existing content and must not be used to redact sensitive information."]],
    related: [["Protect PDF", "/protect-pdf"], ["Edit PDF", "/edit-pdf"], ["Merge PDF", "/merge-pdf"]],
  },
  "crop-pdf": {
    label: "PDF page framing",
    summary: "Draw a crop area around the part of a PDF page you want to display and apply the available page-scope settings.",
    bestFor: "Trimming wide margins or framing a specific section of a scanned PDF page.",
    supports: "PDF files (.pdf).",
    workflow: ["Add PDFs and select a page in the crop workspace.", "Draw and adjust the crop area, then check which pages the crop will affect.", "Create the output and inspect page edges, text and margins."],
    example: "Trim empty borders from a scanned receipt so the visible PDF page focuses on the receipt itself.",
    limits: "Cropping changes PDF page boundaries. Content outside the visible area may remain in the file, so cropping is not secure redaction. Check the output page count as well as the framing.",
    faqs: [["Does cropping rewrite the page text?", "No. It changes the visible page boundaries rather than editing the wording."], ["Can I adjust the crop visually?", "Yes. Draw and adjust a crop area in the page preview."], ["Will one crop automatically suit every page?", "Not necessarily. Pages can differ in size or orientation; review the selected scope and each result."], ["Is cropped-out information securely removed?", "Do not assume so. Cropping is not a safe way to redact confidential content."], ["Can cropping reduce the file size substantially?", "Not reliably. Hidden page content can remain; use Compress PDF separately if size is the goal."]],
    related: [["Rotate PDF", "/rotate-pdf"], ["Delete PDF Pages", "/delete-pdf-pages"], ["Compress PDF", "/compress-pdf"]],
  },
  "protect-pdf": {
    label: "Password-protected copies",
    summary: "Set and confirm a password to create a PDF copy that requires a password to open.",
    bestFor: "Adding an opening password before sharing a document with its intended recipient.",
    supports: "PDF files (.pdf) that the tool can read; output is password-protected PDF.",
    workflow: ["Choose the PDFs to protect.", "Enter a password and confirm the same value.", "Create the protected copy, then test opening it with the password before sharing."],
    example: "Create a password-protected copy of a personal record and provide the password to its recipient separately.",
    limits: "Keep the password and original document available: this tool does not offer password recovery. Protection does not remove visible sensitive information from the pages.",
    faqs: [["What does the password protect?", "The generated PDF requires the password to open. It does not redact the document's contents."], ["Why do I enter the password twice?", "Confirmation helps catch typing mistakes before a protected file is created."], ["Is there a minimum password length?", "The workspace requires at least six characters. Choose a password that is not easy to guess."], ["Can I protect multiple PDFs?", "Yes. The chosen password is applied to the selected PDFs."], ["Can PDFRoot recover a forgotten password here?", "No. Keep a record of your password and retain your original document."]],
    related: [["Unlock PDF", "/unlock-pdf"], ["Watermark PDF", "/watermark-pdf"], ["Merge PDF", "/merge-pdf"]],
  },
  "unlock-pdf": {
    label: "Open a permitted PDF copy",
    summary: "Use a PDF password you know to create an unlocked copy of a document you are permitted to access.",
    bestFor: "Removing an opening-password prompt from your own PDF for a workflow that needs an unlocked file.",
    supports: "PDF files (.pdf), with the correct password when required.",
    workflow: ["Select the protected PDF files.", "Enter the required password and run the unlock operation.", "Open the downloaded copy to confirm its contents and that it no longer prompts for a password."],
    example: "Unlock your own password-protected statement before combining it with supporting documents, where you have permission to do so.",
    limits: "This is not a password-recovery or guessing tool. An incorrect password or unsupported file may prevent processing. The downloaded unlocked copy no longer has the same opening-password protection.",
    faqs: [["Can I unlock a PDF without knowing its password?", "An opening password is required when the PDF demands it. The tool does not recover forgotten passwords."], ["What if the password is rejected?", "Check the password for that file and try again. A damaged PDF can also fail to open."], ["Can I process multiple PDFs?", "Yes. The workspace uses the entered password for the selected files; files with different passwords may need separate runs."], ["Will the page content change?", "The operation removes password protection rather than editing the page contents. Review the new copy afterward."], ["Can I protect the file again?", "Yes. Use Protect PDF to create a new password-protected copy."]],
    related: [["Protect PDF", "/protect-pdf"], ["Merge PDF", "/merge-pdf"], ["Split PDF", "/split-pdf"]],
  },
  "edit-pdf": {
    label: "PDF annotations and text edits",
    summary: "Open a PDF to edit supported native text or add notes, images, signatures and other visual content, then review the changes before saving.",
    bestFor: "Correcting selectable text, annotating a document or placing a signature image on a form.",
    supports: "One unlocked PDF at a time. Existing-text editing requires native PDF text, not a scanned image of text.",
    workflow: ["Choose the PDF you want to update.", "Select existing text or add content with the editor tools, then review the page.", "Apply your changes and download the edited PDF, keeping the original for reference."],
    example: "Double-click a selectable date to correct it, then add a note beside the relevant paragraph and check their placement before applying changes.",
    limits: "Check wording, fonts, placement and page order in the saved PDF. Scanned text is not directly editable. Whiteout and Cover Content are visual overlays, not secure redaction.",
    faqs: [["Can I edit text already in a PDF?", "Double-click supported native PDF text to edit its span. Scanned pages and text converted to an image are not directly editable."], ["What if the PDF uses an unavailable font?", "Exact matching depends on whether the original font and required characters can be reused. Review the properties panel and exported text carefully."], ["Can I add a signature or image?", "Yes. The editor provides tools for images, signatures, added text, drawings, highlights and shapes."], ["Does whiteout securely remove text?", "No. Whiteout and Cover Content only cover content visually; do not use them for confidential redaction."], ["Will the result still be a PDF?", "Yes. Apply your changes, download the edited PDF and retain the original if you need to start again."]],
    related: [["Merge PDF", "/merge-pdf"], ["Compress PDF", "/compress-pdf"], ["Split PDF", "/split-pdf"], ["PDF to Word", "/pdf-to-word"]],
  },
  "jpg-to-png": {
    label: "Image format conversion",
    summary: "Convert JPG or JPEG images into PNG files for workflows that require PNG input.",
    bestFor: "Preparing an existing JPEG image for an application or editing workflow that accepts PNG.",
    supports: "JPG and JPEG images (.jpg, .jpeg); output is PNG.",
    workflow: ["Add the JPG or JPEG images.", "Convert them to PNG in the workspace.", "Review the converted files and their sizes before downloading."],
    example: "Convert a JPEG illustration to PNG before importing it into a design document that requires that format.",
    limits: "Changing format does not restore detail already lost in a JPEG or automatically remove its background. PNG output can be larger than the source.",
    faqs: [["Will converting to PNG sharpen a blurry JPEG?", "No. Format conversion cannot recreate missing image detail."], ["Will the background become transparent?", "No. The JPEG's background remains part of the converted image."], ["Why can the PNG be larger?", "PNG stores images differently from JPEG; photographic content can take more space."], ["Can I convert several images?", "Yes. Add multiple JPG or JPEG files to the workspace."], ["Can I change the PNG back to JPG?", "Use PNG to JPG, retaining the original source if you want to avoid repeated lossy conversions."]],
    related: [["PNG to JPG", "/png-to-jpg"], ["PNG to PDF", "/png-to-pdf"], ["Resize Image", "/resize-image"]],
  },
  "png-to-jpg": {
    label: "PNG images as JPEG",
    summary: "Convert PNG images to JPG for sharing or for upload fields that require JPEG files.",
    bestFor: "Making a JPEG copy of a PNG screenshot, scan or illustration.",
    supports: "PNG images (.png); output is JPG.",
    workflow: ["Choose the PNG images to convert.", "Run the JPG conversion.", "Check transparent areas, fine text and file size before downloading the results."],
    example: "Convert a PNG scan to JPG for an upload field that accepts JPEG, then check its separate size limit.",
    limits: "JPEG does not support transparency. This tool places transparent areas on white, and JPEG compression can soften sharp edges or small lettering.",
    faqs: [["What happens to a transparent background?", "It is flattened onto white because JPG cannot store transparency."], ["Will the output always be smaller?", "No. The size depends on the source content and encoding; check the reported result."], ["Can I convert several PNG files?", "Yes. The workspace accepts multiple PNG images."], ["Is JPG suitable for tiny text or line art?", "Inspect it carefully: JPEG compression may soften fine edges. Keep the PNG when exact sharpness matters."], ["Can I set an exact KB size here?", "Use Resize Image to Exact KB separately when the destination specifies a file-size target."]],
    related: [["JPG to PNG", "/jpg-to-png"], ["JPG to PDF", "/jpg-to-pdf"], ["Resize Image to Exact KB", "/resize-image-to-exact-kb"]],
  },
  "background-remover": {
    label: "Subject cutouts",
    summary: "Separate a subject from its image background, refine the cutout and choose a transparent or replacement background for export.",
    bestFor: "Preparing a subject image for a design or replacing a distracting background.",
    supports: imageFormats,
    workflow: ["Choose an image with a clearly visible subject.", "Remove the background, inspect the edges and use the refinement controls where needed.", "Choose the background and output format, then review the exported image."],
    example: "Create a PNG cutout of a portrait for a poster, checking hair and shoulder edges before placing it on the design.",
    limits: "Fine hair, transparent objects and low-contrast edges can need manual refinement. Keep the original and check the cutout against both light and dark backgrounds.",
    faqs: [["Which format keeps a transparent background?", "Choose PNG or WebP with a transparent background. JPG requires a solid background."], ["Can I replace the background with a color?", "Yes. The workspace includes background choices and a custom color option."], ["Why are some edges missing or uneven?", "Automatic separation can struggle with low contrast, fine detail or translucent objects. Inspect and refine the mask."], ["Can I review the original while editing?", "Use the preview and editing controls to inspect the subject and background before export."], ["Will selecting JPG keep transparency?", "No. A transparent background is changed to white for JPG output."]],
    related: [["Crop Image", "/crop-image"], ["Resize Image", "/resize-image"], ["PNG to JPG", "/png-to-jpg"]],
  },
  "passport-photo-maker": {
    label: "Portrait print sheets",
    summary: "Prepare a portrait and arrange repeated copies on a print sheet using the available photo, background and sheet settings.",
    bestFor: "Making a print sheet from a clear portrait after checking the requirements of its intended use.",
    supports: "JPG, JPEG, PNG and WebP photos under 15 MB; sheet output can be JPG, PNG or PDF.",
    workflow: ["Add a clear portrait and review its framing.", "Choose the available photo and sheet settings, checking any background or outfit changes.", "Create the sheet and verify photo dimensions and print scaling before downloading."],
    example: "Arrange repeated copies of a portrait on a 4 × 6 inch sheet for printing at actual size.",
    limits: "A prepared sheet is not proof that a photo meets an issuing authority's rules. Optional AI outfit changes depend on service availability and send the photo to a server; avoid alterations that the intended application does not allow.",
    faqs: [["Does this guarantee an accepted passport photo?", "No. Check the current photo rules of the authority or application you are using."], ["Can I keep the original outfit?", "Yes. You do not need to choose a generated outfit to prepare a sheet."], ["Are AI outfits always available?", "No. The option depends on the configured service and photo suitability, and it uses server processing."], ["Which sheet formats can I download?", "The output choices include JPG, PNG and PDF."], ["How should I check a printed sheet?", "Use actual-size printing and measure a photo. Printer scaling can change the dimensions shown in the workspace."]],
    related: [["Crop Image", "/crop-image"], ["Resize Image", "/resize-image"], ["Resize Image to Exact KB", "/resize-image-to-exact-kb"]],
  },
  "front-back-card-merge": {
    label: "Two sides on one page",
    summary: "Combine front and back images of a card into one arranged output, with layout and export settings for sharing or printing.",
    bestFor: "Presenting both sides of a card together when a recipient requests a single file.",
    supports: "JPG, JPEG, PNG and WebP images for the front and back; output can be JPG, PNG or PDF.",
    workflow: ["Add the front and back images in their respective slots.", "Review orientation, layout, spacing and the available border or crop options.", "Create the combined file and check that both sides are legible and fully visible."],
    example: "Place the front and back of a membership card side by side in one PDF for a permitted records workflow.",
    limits: "Combining images does not authenticate a card or guarantee acceptance by a recipient. Check automatic cropping for clipped edges and share personal information only where it is needed.",
    faqs: [["Do I need images of both sides?", "This workflow is designed for a front image and a back image in their separate slots."], ["Can I arrange the sides vertically?", "Yes. The output layout includes side-by-side and top-bottom arrangements."], ["Can I download a PDF rather than an image?", "Yes. Choose PDF, JPG or PNG in the output settings."], ["Can I adjust spacing or borders?", "Yes. Review the layout, spacing and border controls before creating the result."], ["What should I check after automatic cropping?", "Make sure no card edge, number or other required information has been cut off."]],
    related: [["Crop Image", "/crop-image"], ["JPG to PDF", "/jpg-to-pdf"], ["Resize Image to Exact KB", "/resize-image-to-exact-kb"]],
  },
  "resize-image-to-exact-kb": {
    label: "File-size control",
    summary: "Set a target file size for a photo, signature or scan, then review the produced image before download. This is useful when an upload field specifies KB rather than only pixel dimensions.",
    bestFor: "Applicants, students, office users and anyone whose portal gives a specific image-size limit.",
    supports: imageFormats,
    workflow: ["Choose one or more supported images.", "Enter a preset or custom target in KB and process the images.", "Check the resulting size, dimensions and clarity before downloading."],
    example: "If a portal asks for a file close to 50 KB, set 50 KB, then verify the downloaded image still meets the portal's separate format and dimension rules.",
    limits: "KB is file size, not image dimensions. Reaching a smaller size can reduce detail, and an exact size alone cannot make a photo meet every portal rule. Always inspect the final image.",
    faqs: [["Does KB mean pixels?", "No. KB measures the file's storage size; pixels measure width and height."], ["Which image types can I select?", imageFormats], ["Can I use a custom target?", "Yes. The tool accepts a custom KB target in addition to its presets."], ["Why might a portal still reject the file?", "The portal may also check format, dimensions, orientation, background or a size range."], ["Where does processing happen?", browserPrivacy]],
    related: imageRelated,
  },
  "crop-image": {
    label: "Crop and framing",
    summary: "Crop one or more images with a visual workspace, then save a cleaner frame for a form, profile, document or web upload.",
    bestFor: "People who need to remove margins, isolate a photo or signature, or prepare several images from a scan.",
    supports: imageFormats,
    workflow: ["Add supported images to the workspace.", "Move and size the crop area; use the available rotation, flip and output controls when needed.", "Review each result and download the cropped image."],
    example: "For a scanned page containing a photograph and signature, crop each area separately before using a resize or exact-KB tool.",
    limits: "Cropping removes pixels outside the selected area. It does not repair blur, restore missing detail or certify an image for an official application.",
    faqs: [["Can I crop more than one image?", "Yes. The workspace accepts multiple supported images."], ["Can I rotate an image first?", "Yes. The crop workspace includes rotation controls."], ["Does cropping reduce file size?", "It can, because fewer pixels may be saved, but use an exact-KB or compression tool when a size target matters."], ["What formats are accepted?", imageFormats], ["Is the crop processed in the browser?", browserPrivacy]],
    related: imageRelated,
  },
  "compress-image": {
    label: "Image compression",
    summary: "Reduce the size of supported images with adjustable compression while retaining a usable downloaded image for routine uploads and sharing.",
    bestFor: "Users who need a smaller image attachment but do not have a fixed target size.",
    supports: imageFormats,
    workflow: ["Select one or more supported images.", "Choose the available compression setting and process the files.", "Compare the result's size and readability, then download it."],
    example: "Compress a large phone photo before attaching it to an email; if a portal demands a specific size, use Resize Image to Exact KB afterward.",
    limits: "Compression can soften fine text or image detail. PNG and WebP sources may be saved as JPEG when that produces a smaller result.",
    faqs: [["Can I set an exact KB value?", "This tool is for reducing size. Use Resize Image to Exact KB for a target size."], ["Will every image become smaller?", "The tool reports the result; the amount of reduction depends on the source image and selected settings."], ["What formats can I use?", imageFormats], ["Why does the output sometimes use JPEG?", "The tool may use JPEG when it is needed to produce a smaller image."], ["Where is compression performed?", browserPrivacy]],
    related: imageRelated,
  },
  "merge-pdf": {
    label: "Combine PDF files",
    summary: "Put multiple PDF documents into one downloadable PDF and arrange their order before creating the final file.",
    bestFor: "Submitting multi-page scans, combining receipts, or joining documents for a single upload.",
    supports: "PDF files (.pdf).",
    workflow: ["Add the PDF files you want to combine.", "Arrange the files in the order they should appear.", "Create the merged PDF, inspect it and download the result."],
    example: "Combine a cover letter, supporting pages and a signed form into one PDF when an application accepts a single document.",
    limits: "Merging combines documents; it does not edit their text, remove password restrictions or guarantee that a third-party portal will accept the final file.",
    faqs: [["Can I merge more than two PDFs?", "Yes. The tool accepts multiple PDF files."], ["Can I choose the order?", "Yes. Arrange the selected files before making the merged document."], ["Will the output remain a PDF?", "Yes."], ["Does merging compress the pages?", "No. Use Compress PDF if file size needs to be reduced afterward."], ["Where is the file processed?", browserPrivacy]],
    related: pdfRelated,
  },
  "split-pdf": {
    label: "Separate PDF pages",
    summary: "Split a PDF into separate output files or extract the pages and ranges you need from a longer document.",
    bestFor: "Sending only selected pages, separating a scan, or removing an unnecessary section before a submission.",
    supports: "PDF files (.pdf).",
    workflow: ["Add one or more PDFs.", "Choose the page split or extraction option in the workspace.", "Create the output, confirm the selected pages and download it."],
    example: "Extract the identity-proof page from a multi-page scan instead of uploading the entire document where only one page is requested.",
    limits: "Splitting changes document grouping, not page content. Check the selected page range carefully before using the output.",
    faqs: [["Can I extract a page range?", "Yes. The split workspace supports selected page ranges."], ["Can I split more than one file?", "Yes, supported PDFs can be added to the workspace."], ["Will text on the pages change?", "No; splitting reorganizes the PDF pages."], ["Can I reduce size at the same time?", "Use Compress PDF after splitting if a smaller output is needed."], ["Where does splitting happen?", browserPrivacy]],
    related: pdfRelated,
  },
  "compress-pdf": {
    label: "PDF size reduction",
    summary: "Create a smaller PDF for email or a portal upload, then compare the output with the original before submission.",
    bestFor: "Scanned documents and PDFs that exceed an attachment or upload-size limit.",
    supports: "PDF files (.pdf).",
    workflow: ["Choose the PDF files to reduce.", "Select the available compression option and process them.", "Open the downloaded result and inspect small text, stamps and images."],
    example: "Reduce a scanned application PDF before uploading it to a portal with an attachment limit, while keeping the original file separately.",
    limits: "Compression may reduce image detail. The final size depends on the source content, and this tool does not promise a specific KB value.",
    faqs: [["Can I enter an exact PDF size?", "No. The output size depends on the source document and selected compression."], ["Will text stay readable?", "Review the output before submission, especially scanned text and stamps."], ["Can I compress multiple PDFs?", "Yes, the workspace accepts multiple PDF files."], ["Should I keep my original?", "Yes. Keep the original in case you need another compression setting."], ["Where does compression happen?", browserPrivacy]],
    related: pdfRelated,
  },
  "pdf-to-jpg": {
    label: "PDF pages as images",
    summary: "Render PDF pages as downloadable JPG images for previews, sharing or image-based upload workflows.",
    bestFor: "Users who need pages as images rather than a PDF attachment.",
    supports: "PDF files (.pdf); output is JPG.",
    workflow: ["Add the PDF files.", "Choose the pages and available image settings in the workspace.", "Review the rendered pages and download the JPG files."],
    example: "Turn a one-page PDF receipt into a JPG when a website accepts an image but not a PDF.",
    limits: "The output is an image, so PDF text will not remain editable text. Complex pages may need a visual check after conversion.",
    faqs: [["Does each PDF page become an image?", "Yes. The tool renders selected pages as JPG images."], ["Can I convert several PDFs?", "Yes, the workspace accepts multiple PDF files."], ["Will the output be editable text?", "No. JPG is an image format."], ["Can I make a PDF from the results?", "Use JPG to PDF after reviewing the images."], ["Where is conversion performed?", browserPrivacy]],
    related: [["JPG to PDF", "/jpg-to-pdf"], ...pdfRelated],
  },
  "jpg-to-pdf": {
    label: "Images into a PDF",
    summary: "Arrange JPG, PNG or WebP images and make one downloadable PDF document from them.",
    bestFor: "Combining photographed pages, receipts, scans or supporting images into one file.",
    supports: imageFormats,
    workflow: ["Select one or more images.", "Arrange the images in the order required for the document.", "Create the PDF, review the pages and download it."],
    example: "Combine photos of handwritten assignment pages into one PDF before sending them to a teacher.",
    limits: "The resulting PDF contains image pages. It does not extract editable text or improve an unclear source photograph.",
    faqs: [["Can I use multiple images?", "Yes. The tool supports multiple selected images."], ["Can I arrange the page order?", "Yes. Arrange images before creating the PDF."], ["Can I add PNG or WebP files?", "Yes; JPG, JPEG, PNG and WebP are supported."], ["Will the image text become editable?", "No. The images are placed into PDF pages."], ["Where is the PDF made?", browserPrivacy]],
    related: [["PDF to JPG", "/pdf-to-jpg"], ...pdfRelated],
  },
  "pdf-to-word": {
    label: "Editable document conversion",
    summary: "Convert a PDF into a downloadable Word document using the browser-based conversion workspace, then check the output before editing or submitting it.",
    bestFor: "Updating a document when you have permission to edit it or reusing text from a readable PDF.",
    supports: "PDF files (.pdf); output is a Word document (.docx).",
    workflow: ["Add a PDF to the conversion workspace.", "Run the conversion and download the DOCX output.", "Open the file in a compatible editor and review layout, text and tables."],
    example: "Convert a simple text-based PDF letter to DOCX so you can update a date or contact detail with permission.",
    limits: "PDF layout and Word layout are different. Scanned PDFs, unusual fonts, complex tables and multi-column layouts can require manual cleanup after conversion.",
    faqs: [["Can I convert a scanned PDF?", "The tool can process the file, but scanned pages and complex layouts may need additional editing."], ["What is the output format?", "DOCX, which can be opened in Word-compatible editors."], ["Will the layout be identical?", "Not always. Check page breaks, tables, fonts and text flow."], ["Should I retain the original PDF?", "Yes. Keep the original for reference."], ["Where does conversion run?", browserPrivacy]],
    related: pdfRelated,
  },
  "resize-image": {
    label: "Pixel dimensions",
    summary: "Set image width and height for a supported image while preserving or changing the aspect ratio through the workspace controls.",
    bestFor: "Web uploads, profile images and forms that specify dimensions in pixels.",
    supports: imageFormats,
    workflow: ["Choose supported images.", "Enter the required width and height and use the aspect-ratio option where appropriate.", "Review the output dimensions and download the resized image."],
    example: "If a portal asks for a 300 × 300 pixel image, set those dimensions, then use an exact-KB tool only if the portal also has a file-size requirement.",
    limits: "Changing dimensions is not the same as controlling KB. Enlarging a small image cannot create missing visual detail.",
    faqs: [["Are pixels the same as KB?", "No. Pixels are dimensions; KB is file size."], ["Can I resize multiple images?", "Yes. The workspace accepts multiple supported images."], ["What formats are supported?", imageFormats], ["Will resizing improve a blurry photo?", "No. Enlarging cannot restore missing source detail."], ["Where does resizing happen?", browserPrivacy]],
    related: imageRelated,
  },
  "signature-resize-tool": {
    label: "Signature preparation",
    summary: "Crop and resize a signature image for an upload workflow, including file-size controls when a form specifies a KB limit.",
    bestFor: "Applicants preparing a clearly scanned signature before an online form upload.",
    supports: imageFormats,
    workflow: ["Add a clear scan or photograph of the signature.", "Adjust the size and available output controls in the workspace.", "Check that strokes remain legible before downloading."],
    example: "Start with a tightly cropped signature on a plain background, then check the current official portal instructions for its required dimensions and size.",
    limits: "This tool prepares an image; it does not verify an application's live rules or guarantee acceptance by a specific portal.",
    faqs: [["Can I use a JPG or PNG signature?", "Yes. JPG, JPEG, PNG and WebP are accepted."], ["Can I use a custom KB target?", "Use the available target-size controls and review the output."], ["Should I crop blank space first?", "Yes. A close, readable crop usually gives better control over the final file."], ["Does this verify an official requirement?", "No. Confirm the latest requirements on the official portal."], ["Where is it processed?", browserPrivacy]],
    related: imageRelated,
  },
  "ssc-photo-resize": {
    label: "SSC signature workspace",
    summary: "Prepare a signature image with the SSC-focused workspace, including output controls for format, dimensions and file size.",
    bestFor: "Candidates who need a practical signature-preparation workflow before applying through an SSC portal.",
    supports: imageFormats,
    workflow: ["Select a supported signature image.", "Use the workspace controls to crop, size and prepare the output.", "Inspect the downloaded JPG and compare it with the current SSC notice."],
    example: "Use a clean scan with little surrounding whitespace, then verify the final file against the notification for the specific examination.",
    limits: "Recruitment instructions can change. The tool's settings are not a substitute for the current official notice or application page.",
    faqs: [["What input formats are accepted?", imageFormats], ["Does the tool make a JPG output?", "The SSC workflow prepares a JPEG output."], ["Can I prepare several signatures?", "Yes. The workspace supports multiple selected images."], ["Are the requirements official for every SSC exam?", "Check the current official notice; requirements can differ by examination."], ["Where is processing performed?", browserPrivacy]],
    related: [["Signature Resize Tool", "/signature-resize-tool"], ...imageRelated],
  },
  "rrb-signature-resize": {
    label: "RRB signature workspace",
    summary: "Use the RRB-focused signature workspace to prepare a clean image with the available crop, dimension and size controls.",
    bestFor: "Railway recruitment applicants who want to prepare a signature image before checking it against the current RRB notice.",
    supports: imageFormats,
    workflow: ["Choose a supported signature image.", "Adjust the image in the RRB workspace and generate the output.", "Check size, dimensions, format and legibility against the live application instructions."],
    example: "Create a clear, close crop of a signature, then compare the output with the notice for the RRB recruitment you are applying for.",
    limits: "Official requirements may vary by recruitment. PDFRoot does not submit the file or confirm portal acceptance.",
    faqs: [["Can I use PNG or WebP input?", "Yes. JPG, JPEG, PNG and WebP are accepted."], ["What does the tool output?", "The RRB signature workflow prepares JPEG output."], ["Can I use it for a photo?", "It is designed around signature preparation; use a photo-specific workflow when appropriate."], ["Does it replace the official RRB notice?", "No. Verify the current notice and portal instructions."], ["Where is processing performed?", browserPrivacy]],
    related: [["Signature Resize Tool", "/signature-resize-tool"], ...imageRelated],
  },
  "ibps-photo-resize": {
    label: "IBPS image preparation",
    summary: "Prepare a photo, signature, thumb impression or declaration image in the IBPS-focused workspace before uploading it to an application.",
    bestFor: "IBPS applicants who need a single place to work with the different image types requested in an application.",
    supports: imageFormats,
    workflow: ["Choose the relevant image type and add a supported file.", "Use the available crop, dimension and output controls.", "Review the image and compare it with the current IBPS application instructions."],
    example: "Prepare a declaration image separately from a photo so each file can be checked against the correct field in the application.",
    limits: "Different IBPS applications can use different rules. Verify every file type, size, dimensions and wording with the current official instructions.",
    faqs: [["Which files can I add?", imageFormats], ["Can I prepare more than a photo?", "Yes. The workspace covers photo, signature, thumb impression and declaration workflows."], ["Does the output use JPEG?", "The IBPS preparation workflow produces JPEG output."], ["Will the tool submit my application?", "No. It only prepares a file for you to download."], ["Where is processing performed?", browserPrivacy]],
    related: [["Crop Image", "/crop-image"], ["Resize Image to Exact KB", "/resize-image-to-exact-kb"], ["Signature Resize Tool", "/signature-resize-tool"]],
  },
  "ojas-photo-resize": {
    label: "OJAS image preparation",
    summary: "Prepare OJAS application photos and signatures in a focused browser workspace, then compare the downloaded file with the current OJAS form instructions.",
    bestFor: "Gujarat applicants preparing an image before an OJAS application upload.",
    supports: imageFormats,
    workflow: ["Select a supported photo or signature image.", "Use the OJAS workspace controls to crop and prepare an output.", "Confirm the result is clear and check it against the current OJAS instructions."],
    example: "Prepare a newly scanned signature without extra border space, then check its final size and dimensions on the application page.",
    limits: "The tool helps prepare a file but does not confirm a live OJAS portal rule or submit an application.",
    faqs: [["What image formats are accepted?", imageFormats], ["Can I prepare a photo and a signature?", "Yes. The OJAS workspace supports these preparation workflows."], ["What kind of output is created?", "The output is prepared as a JPEG image."], ["Can I rely on a past requirement?", "No. Check the current OJAS advertisement or application instructions."], ["Where is processing performed?", browserPrivacy]],
    related: [["Resize Image to Exact KB", "/resize-image-to-exact-kb"], ["Crop Image", "/crop-image"], ["OJAS preparation guide", "/blog/ojas-photo-resize-student-problem"]],
  },
  "gpsc-photo-resize": {
    label: "GPSC image preparation",
    summary: "Use the GPSC-focused workspace to prepare an image before an application upload and review its final file details.",
    bestFor: "GPSC applicants preparing a photo or signature image for a current application.",
    supports: imageFormats,
    workflow: ["Add a supported image.", "Use the available crop and output settings in the GPSC workspace.", "Download the result and compare it with the current GPSC application instructions."],
    example: "Prepare the photo and signature as separate files, then check each against the correct field on the form.",
    limits: "This is a preparation tool, not an official GPSC service. Rules can change by advertisement, so the official instructions remain the source of truth.",
    faqs: [["Which files can I add?", imageFormats], ["Can I prepare more than one image?", "Yes. The GPSC workspace supports multiple selected images."], ["What output is created?", "The GPSC preparation workflow produces JPEG output."], ["Does it verify a live GPSC form?", "No. Check the current official application instructions."], ["Where is processing performed?", browserPrivacy]],
    related: [["Crop Image", "/crop-image"], ["Resize Image to Exact KB", "/resize-image-to-exact-kb"], ["Signature Resize Tool", "/signature-resize-tool"]],
  },
  "upsc-photo-resize": {
    label: "UPSC image preparation",
    summary: "Prepare a supported image in the UPSC-focused workspace, then inspect the downloaded file before using it in an application.",
    bestFor: "UPSC applicants who need to adjust an image's framing, dimensions or file preparation before upload.",
    supports: imageFormats,
    workflow: ["Choose a supported image.", "Adjust it with the available UPSC workspace controls.", "Review clarity, format, dimensions and file size against the current application instructions."],
    example: "Start with a clear original image and use the output only after checking the specific UPSC form's current requirements.",
    limits: "The tool does not submit an application or certify a file. Official requirements can differ between applications and change over time.",
    faqs: [["What input formats are accepted?", imageFormats], ["Can I use the tool on a phone?", "The workspace is available on current mobile and desktop browsers."], ["Does it make an official UPSC photo?", "No. It prepares an image; you must verify the official requirements."], ["Should I check the downloaded file?", "Yes. Check its readability, dimensions, format and size before upload."], ["Where is processing performed?", browserPrivacy]],
    related: [["Crop Image", "/crop-image"], ["Resize Image", "/resize-image"], ["Resize Image to Exact KB", "/resize-image-to-exact-kb"]],
  },
  "image-compressor-for-government-forms": {
    label: "Form image size reduction",
    summary: "Reduce supported image files before an application upload, while keeping the result visible for review.",
    bestFor: "Applicants whose photo, signature or scanned image needs to be smaller before uploading.",
    supports: imageFormats,
    workflow: ["Add a supported image.", "Choose a compression option and create the result.", "Check clarity, file size, dimensions and format against the official form."],
    example: "Reduce a large photo first, then use an exact-KB tool if the portal gives a precise size rather than simply a maximum.",
    limits: "This tool reduces size; it cannot verify a government portal's current rules, and strong compression may make text or a signature less legible.",
    faqs: [["Can I enter an exact file size?", "Use Resize Image to Exact KB when a precise target is required."], ["What image types are supported?", imageFormats], ["Will compression change dimensions?", "Review the output details before uploading; size and format requirements are separate checks."], ["Does this guarantee portal acceptance?", "No. Confirm the current official requirements."], ["Where is processing performed?", browserPrivacy]],
    related: imageRelated,
  },
};

export function hasToolGuide(slug: string) {
  return Boolean(guides[slug]);
}

export function ToolGuideContent({ slug, name }: { slug: string; name: string }) {
  const guide = guides[slug];
  if (!guide) return null;

  return (
    <section data-tool-page-extra="guide" className="border-y border-border bg-muted/40 px-6 py-14 sm:py-16 lg:px-8">
      <div className="mx-auto grid max-w-[1800px] gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-2xl border border-border bg-card p-6 sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">{guide.label}</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-foreground">How {name} works</h2>
          <p className="mt-4 leading-7 text-muted-foreground">{guide.summary}</p>
          <dl className="mt-6 grid gap-4 text-sm leading-6 sm:grid-cols-2">
            <div><dt className="font-semibold text-foreground">Useful for</dt><dd className="mt-1 text-muted-foreground">{guide.bestFor}</dd></div>
            <div><dt className="font-semibold text-foreground">Supported input</dt><dd className="mt-1 text-muted-foreground">{guide.supports}</dd></div>
          </dl>
          <h3 className="mt-8 text-xl font-semibold text-foreground">A practical workflow</h3>
          <ol className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
            {guide.workflow.map((step, index) => <li key={step}><span className="mr-2 font-semibold text-primary">{index + 1}.</span>{step}</li>)}
          </ol>
          <h3 className="mt-7 text-xl font-semibold text-foreground">Example</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{guide.example}</p>
          <h3 className="mt-7 text-xl font-semibold text-foreground">Before you download</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{guide.limits}</p>
        </article>
        <aside className="rounded-2xl border border-border bg-card p-6 sm:p-8">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Questions about this tool</h2>
          <div className="mt-5 divide-y divide-border">
            {guide.faqs.map(([question, answer]) => (
              <details key={question} className="group py-3">
                <summary className="cursor-pointer list-none pr-4 text-sm font-semibold text-foreground">{question}</summary>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{answer}</p>
              </details>
            ))}
          </div>
          <h3 className="mt-7 text-lg font-semibold text-foreground">Continue with a related tool</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {guide.related.map(([label, href]) => <Link key={href} href={href} className="rounded-full border border-border px-3 py-1.5 text-sm font-medium text-foreground transition hover:border-primary/40 hover:text-primary">{label}</Link>)}
          </div>
        </aside>
      </div>
    </section>
  );
}
