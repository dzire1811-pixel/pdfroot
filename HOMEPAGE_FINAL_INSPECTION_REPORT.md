# PDFRoot Homepage Final Inspection

Inspection target: `https://pdfroot.vercel.app/` only  
Inspection date: July 13, 2026  
Viewports: 1920×1080, 1440×900, 1366×768, 768×1024, 430×932, 390×844, and 360×800  
Method: Playwright Chromium screenshots and interaction checks, DOM/layout measurements, keyboard checks, asset/link requests, metadata validation, initial-load CLS/LCP collection, and manual visual review of every captured homepage section.

Final automated result: **6 passed, 1 failed** in 1.7 minutes. The sole assertion failure is the real unresolved `pdfroot.com` Open Graph image URL documented in LB-02. The mobile menu defect is recorded through explicit after-scroll geometry and screenshots at all four non-desktop sizes.

The homepage is **not ready for launch**. The visual system is coherent and generally professional, but two critical failures remain: the mobile menu becomes unreachable after scrolling, and the production metadata host currently has no resolvable public address. Final score: **6.0/10**.

## 1. Launch blockers

### LB-01 — Mobile menu is rendered above the viewport after the homepage has been scrolled

- **Viewport size:** 768×1024, 430×932, 390×844, and 360×800
- **Homepage section:** Sticky mobile header / hamburger navigation
- **Exact visible problem:** Opening the hamburger after browsing down the homepage locks page scrolling but renders the menu far above the visible viewport. Measured menu `y` positions were `-5,070px`, `-8,051px`, `-8,134px`, and `-8,136px`. The user sees the current page section with no usable menu and cannot scroll the background. The same panel opens correctly at `y: 65px` only from a clean top-of-page state.
- **Expected professional result:** The overlay must always begin immediately below the sticky header, regardless of current scroll position, while its own content scrolls vertically.
- **Recommended CSS or layout correction:** Mount the panel in a viewport-level portal and use a stable fixed inset such as `position: fixed; inset: var(--header-height) 0 0; width: 100vw; height: calc(100dvh - var(--header-height)); z-index: 100+`. Avoid changing both root scroll containers in a way that re-bases fixed positioning. Preserve and restore `scrollY` with a non-layout-shifting scroll-lock class, then add an automated assertion that `getBoundingClientRect().top === headerHeight` after opening at multiple scroll depths.
- **Screenshot path:** `homepage-inspection-screenshots/mobile-390x844/20-mobile-menu-after-scroll-defect.png` (also present for the other tablet/mobile viewport folders)
- **Priority:** **Critical**

### LB-02 — Canonical and social metadata point to a non-resolving production host

- **Viewport size:** All viewports; network validation recorded at 1440×900
- **Homepage section:** Document metadata / social sharing
- **Exact visible problem:** The canonical, Open Graph URL/image, organization schema, and related metadata point to `https://pdfroot.com`, but DNS returns only an SOA authority record and no usable address. Playwright fails to fetch `https://pdfroot.com/pdfroot-og-image.png` with `ENOTFOUND pdfroot.com`. The same image exists and returns 200 on the Vercel host.
- **Expected professional result:** Canonical and Open Graph resources must resolve publicly and return successful responses before launch, so search engines and social crawlers can index and render the intended production identity.
- **Recommended CSS or layout correction:** This is not a CSS issue. Finish the apex-domain DNS/Vercel domain configuration and TLS provisioning, then verify the canonical, `og:url`, `og:image`, schema URLs, sitemap URLs, and social preview image all return 200 from an external resolver. Until that is complete, metadata should not advertise an unreachable host.
- **Screenshot path:** `test-results/artifacts/homepage.final.inspection--9b226--and-performance-inspection-desktop-chromium/test-failed-1.png`; supporting data: `homepage-inspection-artifacts/desktop-1440x900.json`
- **Priority:** **Critical**

## 2. Professional design issues

### PD-01 — Hero status cards simulate processing without a user upload

- **Viewport size:** All seven viewports
- **Homepage section:** Hero upload workflow
- **Exact visible problem:** “Image resize” and “PDF conversion” automatically alternate between “Preparing” and “Preview ready,” with animated progress bars, even though no file has been selected. This reads as a real processing state and conflicts with the later Product Preview statement that the previews do not pretend to process uploaded files.
- **Expected professional result:** An idle homepage should show clearly illustrative, static workflow examples or an explicit “Example” label; processing language should begin only after a user action.
- **Recommended CSS or layout correction:** Replace the autonomous status loop with a static “Example workflow” state, add an unmistakable `Demo`/`Illustration` badge, or keep progress at zero until the file input changes. Reserve “Preparing” and “Preview ready” for genuine state transitions.
- **Screenshot path:** `homepage-inspection-screenshots/desktop-1440x900/11-hero-status-after-timer.png`
- **Priority:** **Important**

### PD-02 — Three near-identical all-tools actions compete in the opening journey

- **Viewport size:** All seven viewports, most noticeable at 360×800–430×932
- **Homepage section:** Hero and Popular Tools introduction
- **Exact visible problem:** “Explore All Tools,” “Browse tools,” and “View all tools” appear in close succession and lead users toward substantially the same destination. On mobile this creates repeated calls to action before the first tool list is fully scanned.
- **Expected professional result:** One clear primary discovery action and, at most, one contextual secondary action with distinct wording or purpose.
- **Recommended CSS or layout correction:** Keep “Explore All Tools” as the primary discovery CTA, use the red hero-side action for upload-specific guidance or remove it, and retain “View all tools” only as the Popular Tools section-level link.
- **Screenshot path:** `homepage-inspection-screenshots/mobile-390x844/00-full-homepage-initial.png`
- **Priority:** **Minor**

### PD-03 — Desktop All Tools dropdown has no visible category labels

- **Viewport size:** 1920×1080, 1440×900, and 1366×768
- **Homepage section:** Desktop header / All Tools dropdown
- **Exact visible problem:** PDF and image/government tools are laid out in four long columns, but the underlying “PDF Tools” and “Image Tools” group labels are not displayed. The boundary between groups is invisible, so the panel reads like one undifferentiated list.
- **Expected professional result:** Clearly labeled groups with a subtle divider or spacing break so a large tool inventory can be scanned immediately.
- **Recommended CSS or layout correction:** Render each existing group label above its grid using a consistent 12–13px uppercase/semibold heading, add `aria-labelledby`, and separate the groups with either a vertical divider or 24–32px gap without changing tool routes or the approved column structure.
- **Screenshot path:** `homepage-inspection-screenshots/desktop-1440x900/19-desktop-all-tools-dropdown.png`
- **Priority:** **Minor**

## 3. Responsive issues

### R-01 — The mobile homepage becomes excessively long and repetitive

- **Viewport size:** 430×932, 390×844, and 360×800
- **Homepage section:** Popular Tools, Government Tools, Why PDFRoot, trust strip, and footer
- **Exact visible problem:** Total document height grows from roughly 5,742–5,857px on desktop to 10,609–11,154px on mobile. Popular Tools alone is about 1,740px and Government Tools is about 1,884–2,019px. Large one-column cards, repeated copy, and vertically stacked supporting sections make the page feel more like a directory than a focused landing page.
- **Expected professional result:** Mobile should retain the same content hierarchy while reducing repetition and time-to-footer, with compact cards or progressive disclosure for secondary content.
- **Recommended CSS or layout correction:** Use a compact two-column card grid where names remain readable, shorten or hide repeated card descriptions below 430px, show the highest-value tools first with a “Show more” action, and reduce vertical section padding by approximately 16–24px on mobile.
- **Screenshot path:** `homepage-inspection-screenshots/mobile-360x800/00-full-homepage-initial.png`
- **Priority:** **Important**

### R-02 — Mobile footer is much taller than its information density requires

- **Viewport size:** 430×932, 390×844, and 360×800
- **Homepage section:** Footer
- **Exact visible problem:** Company, Tools, Government, and Legal groups are stacked as four separate long lists, producing a large final scroll region. The long IBPS link further increases the visual weight of the Government column.
- **Expected professional result:** A compact but readable footer that keeps legal and key navigation available without adding another full-screen directory.
- **Recommended CSS or layout correction:** Use a two-column footer grid from 360px upward or convert link groups into accessible mobile accordions, keep 44px tap areas, and retain a single full-width brand/legal row.
- **Screenshot path:** `homepage-inspection-screenshots/mobile-390x844/00-full-homepage-initial.png`
- **Priority:** **Minor**

## 4. Typography and spacing issues

### TS-01 — Tool-card descriptions are too small for comfortable scanning

- **Viewport size:** All seven viewports; most noticeable on 360×800–430×932
- **Homepage section:** Popular Tools and Government Recruitment tools
- **Exact visible problem:** Tool names render at 13px and descriptions at 11px/16.5px. On mobile the descriptions occupy large cards yet remain visually faint and require more effort to read than the surrounding 14–16px body copy.
- **Expected professional result:** Supporting text should remain comfortably legible and visually proportional to the card size.
- **Recommended CSS or layout correction:** Raise descriptions to at least 12–13px with a 1.45–1.55 line-height and tool names to 14px on mobile. If page length is a concern, shorten or clamp descriptions instead of reducing type size.
- **Screenshot path:** `homepage-inspection-screenshots/mobile-390x844/03-popular-tools.png`
- **Priority:** **Important**

### TS-02 — Tool icon visual sizes are inconsistent despite similar containers

- **Viewport size:** All seven viewports
- **Homepage section:** Popular Tools, Government Tools, and large dropdown inventories
- **Exact visible problem:** Composite PDF icons such as Merge/Split appear visually heavier than single-file icons, while several recruitment icons appear much smaller or lighter. Some desktop All Tools rows look as if the icon is absent at normal viewing scale even though asset requests succeed.
- **Expected professional result:** Every tool should have comparable optical weight and alignment while retaining its approved original artwork and color.
- **Recommended CSS or layout correction:** Keep the current 20×20px alignment box, but apply per-asset optical scaling so the visible artwork occupies roughly 17–18px in both dimensions. Avoid one global scale for icons with substantially different intrinsic whitespace.
- **Screenshot path:** `homepage-inspection-screenshots/desktop-1440x900/19-desktop-all-tools-dropdown.png`
- **Priority:** **Minor**

### TS-03 — Desktop government section is more vertically padded than neighboring sections

- **Viewport size:** 1920×1080, 1440×900, and 1366×768
- **Homepage section:** Built for India’s Exams
- **Exact visible problem:** The section measures about 1,030–1,038px tall and carries noticeably more empty vertical space around its centered introduction than Popular Tools (about 655–657px) and the product preview (874px). The transition feels slower than the otherwise compact desktop rhythm.
- **Expected professional result:** Major section spacing should vary intentionally but maintain a consistent landing-page cadence.
- **Recommended CSS or layout correction:** Reduce desktop top/bottom padding by 24–40px or pull the illustrative comparison and tool grid closer to the heading while keeping the centered composition.
- **Screenshot path:** `homepage-inspection-screenshots/desktop-1440x900/04-government-tools.png`
- **Priority:** **Minor**

## 5. Navigation and interaction issues

### NI-01 — Several keyboard-focused controls have no visible non-color focus indicator

- **Viewport size:** All seven viewports
- **Homepage section:** Mobile hamburger, Product Preview tabs, and FAQ accordion
- **Exact visible problem:** Computed focus checks found no outline or shadow on the mobile hamburger, active product tab, or FAQ button. The FAQ focus capture is visually indistinguishable from its unfocused state. Popular tool cards do show a clear browser outline, proving the inconsistency.
- **Expected professional result:** Every keyboard-operable control should show a consistent, clearly visible focus ring that is not conveyed by color alone.
- **Recommended CSS or layout correction:** Add a shared `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2` treatment to hamburger, preview tabs, FAQ triggers, and menu controls; verify against both white and tinted backgrounds.
- **Screenshot path:** `homepage-inspection-screenshots/mobile-390x844/16-faq-focus.png`
- **Priority:** **Important**

### NI-02 — Multiple interactive targets are below 44×44px on touch layouts

- **Viewport size:** 768×1024, 430×932, 390×844, and 360×800
- **Homepage section:** Mobile header, section links, Product Preview tabs, and footer
- **Exact visible problem:** The hamburger is 40×40px, product tabs are about 40.7px high, “View all tools/posts” are about 22.7px high, and footer links have approximately 17px-high hit boxes.
- **Expected professional result:** Primary and repeated touch controls should provide at least a 44×44px target without forcing larger visible typography.
- **Recommended CSS or layout correction:** Apply `min-width: 44px; min-height: 44px` or equivalent padding to icon buttons, tabs, inline section actions, and footer links. Preserve the existing visual size by expanding transparent/internal hit areas where appropriate.
- **Screenshot path:** `homepage-inspection-screenshots/mobile-390x844/14-product-jpg-tab.png`
- **Priority:** **Important**

### NI-03 — Desktop All Tools declares a menu trigger without a menu role on its panel

- **Viewport size:** 1920×1080, 1440×900, and 1366×768
- **Homepage section:** Desktop header / All Tools dropdown
- **Exact visible problem:** The trigger exposes `aria-haspopup="menu"`, but the opened full-width All Tools panel has no `role="menu"`. Convert PDF and Government dropdowns do use menu semantics, so assistive-technology behavior is inconsistent.
- **Expected professional result:** Trigger and popup semantics should agree, with keyboard behavior and accessible grouping matching the chosen pattern.
- **Recommended CSS or layout correction:** Either add an appropriate menu/navigation role structure with menuitem semantics and managed keyboard navigation, or change the trigger/panel to a disclosure pattern (`aria-expanded` + labelled navigation region) rather than claiming a menu.
- **Screenshot path:** `homepage-inspection-screenshots/desktop-1440x900/19-desktop-all-tools-dropdown.png`
- **Priority:** **Important**

## 6. SEO, accessibility, and performance issues

The unresolved `pdfroot.com` metadata host is the critical SEO issue documented as LB-02. The keyboard focus and touch-target issues are documented as NI-01 and NI-02.

No additional automated launch blocker was found in initial-load performance: recorded CLS was `0` at all seven viewports, and lab LCP ranged from approximately 0.4s to 1.2s. These figures are local synthetic results, not field Core Web Vitals. A full assistive-technology screen-reader session, color-contrast audit against every state, and real-device network/CPU profiling were outside this Playwright-only inspection and should still be completed before release.

## 7. Passed checks

- Exactly one correct H1 appeared at every viewport.
- The document title, meta description, robots directive, canonical element, Open Graph fields, FAQ/WebApplication/Breadcrumb/Organization structured data, and heading order were present and parseable. The destination host problem is reported separately.
- No horizontal document overflow was measured at any of the seven viewport sizes.
- No visible interactive element extended beyond the viewport horizontally.
- No duplicate DOM IDs, missing accessible names, or skipped heading levels were detected.
- No page exceptions or console errors occurred.
- No loaded image, font, script, or stylesheet failed; all rendered images had valid natural dimensions.
- Homepage anchor checks found no 4xx/5xx route responses. No other tool page was visually inspected.
- The homepage file input opened the native file chooser and accepted image/PDF formats.
- Desktop logo, primary navigation, Sign in, and Get Started remained aligned and unclipped at 1920×1080, 1440×900, and 1366×768.
- Desktop Convert PDF and Government dropdowns opened and closed, and the All Tools panel contained the expected full inventory.
- From the top of the page, the mobile menu contained Home, direct links, the three approved accordions, all 36 All Tools links, original colored icons, a close button, two-column submenu grids, internal scrolling, and background scroll lock.
- Popular tool cards kept consistent borders, radius, shadow language, and desktop grid alignment; the first-card offset matched the rest of the grid.
- Hero, background grid, section dividers, product preview, blog cards, Why PDFRoot cards, trust strip, FAQ, CTA areas, and footer remained horizontally aligned with consistent outer margins.
- Product Preview tabs changed the illustrated workflow correctly and did not navigate away from the homepage.
- FAQ accordion expanded/collapsed correctly with no overlap or clipped answer text.
- Initial-load CLS was zero at all seven viewports; no late font, image, icon, or section shift was observed.

## 8. Exact recommended corrections

1. **Release gate:** Fix the scrolled mobile-menu containing-block/scroll-lock defect and add regression checks at 25%, 50%, and 90% page scroll for all four non-desktop viewport widths.
2. **Release gate:** Configure `pdfroot.com` with valid public DNS, Vercel domain ownership, HTTPS, and successful responses for canonical/OG/schema assets; rerun external metadata validation.
3. Stop autonomous “Preparing/Preview ready” hero animation until a user uploads a file, or label the rows explicitly as a non-processing demo.
4. Add consistent focus-visible rings to the hamburger, preview tabs, FAQ buttons, and every dropdown/accordion control.
5. Increase mobile hit areas to at least 44×44px for the hamburger, tabs, section actions, and footer links.
6. Resolve the All Tools popup semantic mismatch: implement a true menu pattern or expose it as a labelled navigation disclosure.
7. Raise tool-card supporting copy from 11px to at least 12–13px and tool names to 14px on mobile; clamp copy to keep cards compact.
8. Shorten the mobile page with compact tool cards/progressive disclosure and a two-column or accordion footer.
9. Render visible category headings in the desktop All Tools dropdown.
10. Normalize icon optical scale per asset within the existing 20×20px boxes.
11. Remove or differentiate one of the duplicate “Explore/Browse/View all tools” actions.
12. Reduce desktop Government section vertical padding by approximately 24–40px and recheck section cadence at 1366×768.

**Final score: 6.0/10**  
**Launch decision: Not ready for launch.** Reinspect after LB-01 and LB-02 are resolved; Important accessibility and mobile-density issues should also be corrected before public release.
