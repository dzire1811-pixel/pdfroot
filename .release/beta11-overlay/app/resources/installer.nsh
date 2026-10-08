!macro PDFRootContextCommand Key Label Slug
  WriteRegStr HKCU "Software\Classes\*\shell\PDFRootDesktopPro\shell\${Key}" "MUIVerb" "${Label}"
  WriteRegStr HKCU "Software\Classes\*\shell\PDFRootDesktopPro\shell\${Key}" "Icon" "$INSTDIR\resources\context-icons\${Slug}.ico"
  WriteRegStr HKCU "Software\Classes\*\shell\PDFRootDesktopPro\shell\${Key}\command" "" '$\"$INSTDIR\PDFRoot Desktop Pro.exe$\" --context-tool=${Slug} --file=$\"%1$\"'
!macroend

!macro PDFRootPdfCommand Key Label Slug
  !insertmacro PDFRootContextCommand "${Key}" "${Label}" "${Slug}"
  WriteRegStr HKCU "Software\Classes\*\shell\PDFRootDesktopPro\shell\${Key}" "AppliesTo" 'System.FileExtension:=".pdf"'
!macroend

!macro PDFRootImageCommand Key Label Slug
  !insertmacro PDFRootContextCommand "${Key}" "${Label}" "${Slug}"
  WriteRegStr HKCU "Software\Classes\*\shell\PDFRootDesktopPro\shell\${Key}" "AppliesTo" 'System.FileExtension:=".jpg" OR System.FileExtension:=".jpeg" OR System.FileExtension:=".png" OR System.FileExtension:=".webp" OR System.FileExtension:=".bmp" OR System.FileExtension:=".tif" OR System.FileExtension:=".tiff"'
!macroend

!macro customInstall
  WriteRegStr HKCU "Software\Classes\*\shell\PDFRootDesktopPro" "MUIVerb" "PDFRoot Desktop Pro"
  WriteRegStr HKCU "Software\Classes\*\shell\PDFRootDesktopPro" "Icon" "$INSTDIR\resources\context-icons\pdfroot-menu.ico"
  WriteRegStr HKCU "Software\Classes\*\shell\PDFRootDesktopPro" "SubCommands" ""
  WriteRegStr HKCU "Software\Classes\*\shell\PDFRootDesktopPro" "Position" "Top"
  WriteRegStr HKCU "Software\Classes\*\shell\PDFRootDesktopPro" "MultiSelectModel" "Player"
  WriteRegStr HKCU "Software\Classes\*\shell\PDFRootDesktopPro" "AppliesTo" 'System.FileExtension:=".pdf" OR System.FileExtension:=".jpg" OR System.FileExtension:=".jpeg" OR System.FileExtension:=".png" OR System.FileExtension:=".webp" OR System.FileExtension:=".bmp" OR System.FileExtension:=".tif" OR System.FileExtension:=".tiff"'

  !insertmacro PDFRootPdfCommand "01MergePdf" "Merge PDF" "merge-pdf"
  !insertmacro PDFRootPdfCommand "02SplitPdf" "Split PDF" "split-pdf"
  !insertmacro PDFRootPdfCommand "03CompressPdf" "Compress PDF" "compress-pdf"
  !insertmacro PDFRootPdfCommand "04PdfToWord" "PDF to Word" "pdf-to-word"
  !insertmacro PDFRootPdfCommand "05PdfToExcel" "PDF to Excel" "pdf-to-excel"
  !insertmacro PDFRootPdfCommand "06PdfToPowerPoint" "PDF to PowerPoint" "pdf-to-powerpoint"
  !insertmacro PDFRootPdfCommand "07PdfToJpg" "PDF to JPG" "pdf-to-jpg"
  !insertmacro PDFRootPdfCommand "08RotatePdf" "Rotate PDF" "rotate-pdf"
  !insertmacro PDFRootPdfCommand "09OrganizePdf" "Organize PDF Pages" "organize-pdf-pages"
  !insertmacro PDFRootPdfCommand "10DeletePdfPages" "Delete PDF Pages" "delete-pdf-pages"
  !insertmacro PDFRootPdfCommand "11WatermarkPdf" "Watermark PDF" "watermark-pdf"
  !insertmacro PDFRootPdfCommand "12CropPdf" "Crop PDF" "crop-pdf"
  !insertmacro PDFRootPdfCommand "13ProtectPdf" "Protect PDF" "protect-pdf"
  !insertmacro PDFRootPdfCommand "14UnlockPdf" "Unlock PDF" "unlock-pdf"
  !insertmacro PDFRootPdfCommand "15EditPdf" "Edit PDF" "edit-pdf"

  !insertmacro PDFRootImageCommand "01JpgToPdf" "JPG to PDF" "jpg-to-pdf"
  !insertmacro PDFRootImageCommand "02PngToPdf" "PNG to PDF" "png-to-pdf"
  !insertmacro PDFRootImageCommand "03ExactKb" "Resize Image to Exact KB" "resize-image-to-exact-kb"
  !insertmacro PDFRootImageCommand "04CompressImage" "Compress Image" "compress-image"
  !insertmacro PDFRootImageCommand "05CropImage" "Crop Image" "crop-image"
  !insertmacro PDFRootImageCommand "06ResizeImage" "Resize Image" "resize-image"
  !insertmacro PDFRootImageCommand "07JpgToPng" "JPG to PNG" "jpg-to-png"
  !insertmacro PDFRootImageCommand "08PngToJpg" "PNG to JPG" "png-to-jpg"
  !insertmacro PDFRootImageCommand "09SignatureResize" "Signature Resize Tool" "signature-resize-tool"
  !insertmacro PDFRootImageCommand "10GovtCompressor" "Govt. Form Image Compressor" "image-compressor-for-government-forms"
  !insertmacro PDFRootImageCommand "11SscResize" "SSC Photo and Signature Resize" "ssc-photo-resize"
  !insertmacro PDFRootImageCommand "12RrbResize" "RRB Signature Resize" "rrb-signature-resize"
  !insertmacro PDFRootImageCommand "13IbpsResize" "IBPS Photo, Signature, Thumb and Declaration" "ibps-photo-resize"
  !insertmacro PDFRootImageCommand "14OjasResize" "OJAS Photo Resize" "ojas-photo-resize"
  !insertmacro PDFRootImageCommand "15GpscResize" "GPSC Photo Resize" "gpsc-photo-resize"
  !insertmacro PDFRootImageCommand "16UpscResize" "UPSC Photo Resize" "upsc-photo-resize"
  !insertmacro PDFRootImageCommand "17FrontBack" "Front and Back Card Merge" "front-back-card-merge"

  WriteRegStr HKCU "Software\Classes\Directory\shell\PDFRootDesktopPro" "MUIVerb" "Open PDFRoot Desktop Pro"
  WriteRegStr HKCU "Software\Classes\Directory\shell\PDFRootDesktopPro" "Icon" "$INSTDIR\resources\context-icons\pdfroot-menu.ico"
  WriteRegStr HKCU "Software\Classes\Directory\shell\PDFRootDesktopPro" "Position" "Top"
  WriteRegStr HKCU "Software\Classes\Directory\shell\PDFRootDesktopPro\command" "" '$\"$INSTDIR\PDFRoot Desktop Pro.exe$\" --context-tool=catalog'

  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\PDFRootDesktopPro" "MUIVerb" "Open PDFRoot Desktop Pro"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\PDFRootDesktopPro" "Icon" "$INSTDIR\resources\context-icons\pdfroot-menu.ico"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\PDFRootDesktopPro" "Position" "Top"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\PDFRootDesktopPro\command" "" '$\"$INSTDIR\PDFRoot Desktop Pro.exe$\" --context-tool=catalog'

  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "PDFRoot Desktop Pro"
  DeleteRegKey HKCU "Software\Classes\*\shell\PDFRootDesktopPro"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\PDFRootDesktopPro"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\PDFRootDesktopPro"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
