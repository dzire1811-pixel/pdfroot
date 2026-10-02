# PDFRoot Desktop Pro beta download

The website route `/desktop-pro` lists the currently tested Windows x64 Beta 2 installer. The installer itself is distributed as a GitHub Release asset rather than checked into Git or added to the Vercel static bundle.

Asset: `PDFRoot-Desktop-Pro-Setup-v0.7.0-beta.2-x64.exe` (105 MB)

SHA-256: `BA4E337514D9DBFC09F97733F3207D788EF06EF1616511B8E46E710DCBB45C95`

To activate the public download:

1. Upload the verified installer to a release in `dzire1811-pixel/pdfroot` (suggested tag: `v0.7.0-beta.2`). Never upload either seller private key package.
2. Set `NEXT_PUBLIC_PDFROOT_DESKTOP_INSTALLER_URL` in the PDFRoot website's Vercel project to the release asset's public HTTPS download URL and redeploy. Until then, the website shows “Download link being prepared” instead of a broken button.
3. Check the public URL, filename, downloaded file SHA-256, Windows installer launch and activation instructions before announcing the release.

Beta 2 uses manual monthly activation codes. The separate automatic payment service has not been deployed; the website page says so explicitly. Change both the installer and page copy together when payment activation is live.
