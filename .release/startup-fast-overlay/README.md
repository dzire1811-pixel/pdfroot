# PDFRoot Desktop Pro Beta 21

Windows startup and first shortcut response fixes, assembled on top of the verified Beta 20 source.

- Create a named per-user Windows Run entry in the installer, without requiring a manual first launch. Start hidden with `--background`.
- Migrate old profiles once to startup enabled. A preference changed after this migration remains respected.
- Ignore duplicate background launches, keep close-to-tray behavior, and register shortcuts before rendering tool UIs.
- Prepare six empty local tool windows in sequence: Crop, page order, Front/Back, compression, image settings, Exact KB PDF. No source files are read or processed during preparation.
- A shortcut establishes its own session, activates the already loaded UI and reveals it. Closed windows replenish in the background. Conversion and preview loading still depend on input size and the PC.
- Avoid unnecessary Desktop COM discovery and process lookup in the Explorer selection worker for every keypress. No stale selection cache is used.

Microsecond UI appearance is not a supported claim. Measure first keypress to usable tool on physical Windows 10/11. Preloaded renderers use additional memory; hosted-only tools still depend on internet access. Windows Task Manager can disable startup externally.
