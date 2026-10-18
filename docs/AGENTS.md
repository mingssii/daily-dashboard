# AGENTS.md

## 1. Project Or Topic Purpose
Upgrade the **Unified Personal Life Dashboard (Finance & Nutrition)** across four areas:
1. **Low-Glare Warm Paper Light Palette (`1A`)** to eliminate eye strain from pure-white (`#FFFFFF`) surfaces while retaining a crisp `Slate-950` dark mode.
2. **Scalable Multi-Dashboard Navigation (`2A`)** using a collapsible left sidebar on desktop and a bottom tab bar + module drawer on mobile so future personal dashboards (e.g., Workout, Habit/Sleep, Portfolio) plug in without overflowing the top header.
3. **GitHub Repository & GitHub Pages Launchpad (`N1 = A`)** under `mingssii2/daily-dashboard`, sanitizing private Google Spreadsheet IDs into `ScriptProperties` before publishing to GitHub, and publishing an interactive GitHub Pages Showcase/Launchpad with a direct 1-click button to the live Google Apps Script Web App.
4. **iPhone iOS Home Screen Medium Widget (`N2`)** powered by a lightweight JSON summary endpoint (`?mode=widget_json`) in `Code.gs` and a ready-to-use **Scriptable** iOS widget script (`ios-widget/DailyLifeWidget.js`) displaying the 4 owner-selected daily metrics.

## 2. Operating Persona
- **Pragmatic Senior Engineer + Systems Architect & Privacy Reviewer**
- Prioritizes eye comfort (low-glare warm paper surfaces), zero AI slop, strict data-privacy separation between public GitHub code and private Google Sheets data, and minimal moving parts.

## 3. Current Context
- **Workspace:** `d:\record_self\daily_dashboard`
- **Apps Script Project:** `1kh7ntlKaiHoHIZ8DTFcQD8l6vny-7DqyVu3jcejrpXfA506siY3Yu1o3` (Deployment `@2`: `AKfycbyq6FrcVrN1AxhWMaO8i7oFwmXIBiTrod55lCYvQrESfim4YIzHN0OJywO1rzvAKHCuQA`)
- **GitHub Account:** `mingssii2` (`gh` CLI authenticated with `repo`, `workflow` scopes). Portfolio hub at `https://mingssii2.github.io` automatically lists public repos with GitHub Pages / homepage URLs as **Live app**.
- **Existing Files:** `Code.gs`, `DataService.gs`, `SheetDesigner.gs`, `Index.html`, `Styles.html`, `App.html`, `appsscript.json`, `.clasp.json`.

## 4. Goals And Non-Goals
### Goals
- Replace high-glare `#F8FAFC`/`#FFFFFF` light surfaces with Warm Paper / Stone tokens (`#F5F4F0` canvas, `#FAF9F6` cards, `#E4E2DD` 1px borders, `#1C1917` primary ink).
- Replace the 3-tab horizontal header switcher with a scalable **Collapsible Left Sidebar (Desktop)** + **Bottom Navigation Bar & Module Drawer (Mobile)** + **iOS Widget Setup Modal**.
- Add a lightweight `?mode=widget_json` endpoint in `Code.gs` and generate `ios-widget/DailyLifeWidget.js` for the iOS **Scriptable** app showing:
  1. Monthly Budget Remaining + % Used (`฿5,180` / `48.2%`)
  2. Daily Protein vs `115g` Target (`122.5 / 115 g` + status color)
  3. Daily Calorie Midpoint vs `1,800–2,100 kcal` Band (`1,930 kcal`)
  4. Today's Spend & Monthly Cumulative Spend (`วันนี้ ฿... • เดือนนี้ ฿...`)
- Sanitize hardcoded Google Spreadsheet IDs from public git commits (store in Apps Script `ScriptProperties` with safe setup helper) and publish `mingssii2/daily-dashboard` with GitHub Pages enabled.

### Non-Goals
- Native Swift/Xcode iOS app compilation requiring a paid Apple Developer account.
- Exposing raw personal financial transactions publicly on GitHub Pages without authentication.

## 5. Definitions And Canonical Terms
- **Warm Paper Palette (`1A`):** `--bg-app: #F5F4F0`, `--bg-surface: #FAF9F6`, `--bg-surface-muted: #EBE9E4`, `--border-subtle: #E4E2DD`, `--text-primary: #1C1917`, `--text-secondary: #57534E`, `--text-muted: #78716C`.
- **Launchpad Mode (`N1-A`):** Static build hosted on GitHub Pages (`https://mingssii2.github.io/daily-dashboard/`) that renders interactive synthetic preview data for visitors and provides a 1-click **"Open Live Vault"** button to the owner's Google Apps Script Web App.
- **Widget JSON Endpoint:** `doGet(e)` when `e.parameter.mode === 'widget_json'`, returning a compact JSON object with the 4 selected metrics for iOS Scriptable.

## 6. Decisions Already Made
1. **Light Theme Comfort (`N3 = 1A`):** Selected **Warm Paper / Stone (`#F5F4F0` / `#FAF9F6`)** over Daylight Matte Slate (`1B`) to eliminate blue-light glare and pure-white halation.
2. **Navigation Architecture (`N3 = 2A`):** Selected **Collapsible Left Sidebar (Desktop) + Bottom Bar (Mobile)** over a top dropdown so future dashboard modules can be organized by domain group.
3. **GitHub & GitHub Pages Route (`N1 = A`):** Selected **Public Showcase + Launchpad button to live GAS** over full public Token API or Private-only repo. Accepted trade-off: live personal data stays behind Google authentication on `script.google.com`, while GitHub Pages serves as a fast launchpad and portfolio showcase.
4. **iOS Widget Metrics & Size (`N2`):** Selected **Medium Widget (4×2)** displaying 4 core metrics: (1) Monthly Budget Left + %, (2) Today's Protein vs 115g, (3) Today's Calorie Mid vs 1,800–2,100, and (4) Today's Expense + Month-to-Date Expense.
5. **Execution Authorization (`A3`):** Owner explicitly authorized immediate implementation and GitHub deployment after writing `docs/AGENTS.md`.

## 7. Open Questions
- None blocking. Optional future dashboard modules (e.g., Workout Log, Habit Tracker, Asset Allocation) are pre-scaffolded in the sidebar registry as extensible slots.

## 8. Constraints And Risks
- **Privacy / Secret Leakage Risk:** Hardcoded Spreadsheet IDs (`1DwZm...` and `1Aklu...`) and `.clasp.json` must not expose private data in a public repo. Mitigation: Keep `.clasp.json` in `.gitignore`, store real Spreadsheet IDs in Apps Script `ScriptProperties` (seeded on GAS before sanitizing local source), and use placeholder IDs in committed code.
- **GAS `doGet` Contract (`gas-review`):** `doGet(e)` must return `ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON)` when `e.parameter.mode === 'widget_json'` and `HtmlOutput` otherwise.

## 9. Recommended Plan
1. **Update `Styles.html` & `Index.html`:**
   - Apply Warm Paper (`#F5F4F0` / `#FAF9F6`) light-mode tokens and update Tailwind config.
   - Refactor layout to **Collapsible Left Sidebar (Desktop)** + **Bottom Bar (Mobile)** with domain groups (`Core Hub`, `Wealth & Finance`, `Health & Body`, `Tools & Widgets`) and a **"Open Live Vault"** launchpad button when running on GitHub Pages.
   - Add an in-app **iOS Widget Modal** showing the live preview of the Medium iOS Widget and a 1-click copy button for the Scriptable code.
2. **Update `App.html` & `Code.gs`:**
   - Add sidebar collapse/expand controller, chart color adaptation for Warm Paper (`#1C1917` / `#57534E` / `#EAE8E3` gridlines), and today's expense calculation.
   - Add `mode=widget_json` handler in `Code.gs` (`getWidgetSummaryPayload_`) returning the 4 selected metrics.
   - Add `ensureScriptPropertiesSeeded_()` so `ScriptProperties` on GAS holds the real Spreadsheet IDs, allowing the public GitHub repo to omit raw IDs.
3. **Create iOS Scriptable Widget (`ios-widget/DailyLifeWidget.js`) & Static GitHub Pages Build (`index.html`):**
   - Generate a standalone static `index.html` at repo root (or `docs/`) so GitHub Pages serves the interactive dashboard immediately without build steps.
4. **Deploy to Google Apps Script & Publish to GitHub (`mingssii2/daily-dashboard`):**
   - Push to Apps Script (`clasp push` + `clasp deploy`), then sanitize any local secrets, `git init`, commit, create public repo `mingssii2/daily-dashboard`, enable GitHub Pages, and verify live URLs.

## 10. Acceptance Criteria
- [ ] Light mode uses Warm Paper tokens (`#F5F4F0` background, `#FAF9F6` cards, `#E4E2DD` borders) with zero pure-white glare.
- [ ] Desktop displays a collapsible left sidebar (`w-60` <-> `w-16`) and mobile displays a bottom navigation bar.
- [ ] `?mode=widget_json` returns valid JSON with the 4 selected metrics, and `ios-widget/DailyLifeWidget.js` renders a Medium 4×2 iOS Scriptable widget.
- [ ] `mingssii2/daily-dashboard` is live on GitHub and GitHub Pages (`https://mingssii2.github.io/daily-dashboard/`) with zero hardcoded private Spreadsheet IDs in the public commit history.

## 11. Verification Or Review Plan
- Run `gas-review` checklist on `Code.gs`, `DataService.gs`, and `SheetDesigner.gs`.
- Verify zero hardcoded real Spreadsheet IDs or `.clasp.json` in `git status` / staged files before pushing to `mingssii2/daily-dashboard`.
- Verify `clasp deploy` updates the live Apps Script Web App (`@3`) and GitHub Pages responds at `https://mingssii2.github.io/daily-dashboard/`.

## 12. Research Notes And Sources
- **iOS Scriptable Widget API:** [Scriptable Documentation (`ListWidget`, `Request`)](https://docs.scriptable.app/listwidget/) — supports native iOS Small/Medium/Large Home Screen widgets fetching JSON over HTTPS and opening a `widget.url` deep link on tap.
- **Portfolio Integration:** Inspected `mingssii2/mingssii2.github.io` (`README.md`), confirming that public non-fork repos with GitHub Pages or a `homepage` URL are automatically listed and badged as **Live app**.

## 13. Instructions For The Next AI Agent
- Execute the 4-step Recommended Plan immediately as authorized by the user (`A3`).
- Before pushing to GitHub, ensure `.gitignore` excludes `.clasp.json` and `scripts/`, and verify that `FINANCE_SPREADSHEET_ID` and `FOOD_SPREADSHEET_ID` are saved in Apps Script `ScriptProperties` so the live GAS app continues reading the real sheets while the GitHub repo contains no private Sheet IDs.

## 14. When To Stop And Ask The User
- Stop and ask only if GitHub Pages activation is blocked by repository settings or if the user wants to add an optional secret key parameter to `?mode=widget_json`.
