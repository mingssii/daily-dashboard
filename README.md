# Unified Personal Life Dashboard (Finance & Nutrition)

Executive Single-Page Application (SPA) & Google Apps Script Web App uniting **Daily Finance** (`Outcome`, `Income`, `Subscription_Master`) and **Daily Food & Nutrition** (`Food_Log`, `Body_Workout_Log`) with an **iPhone iOS Home Screen Medium Widget** (`4×2`) and **GitHub Pages Launchpad**.

## Quick Links

- **GitHub Pages Interactive Showcase & Launchpad:** [https://mingssii.github.io/daily-dashboard/](https://mingssii.github.io/daily-dashboard/)
- **Live Google Apps Script Vault (Real-time Sheets RPC):** [Open Live Web App](https://script.google.com/macros/s/AKfycbyq6FrcVrN1AxhWMaO8i7oFwmXIBiTrod55lCYvQrESfim4YIzHN0OJywO1rzvAKHCuQA/exec)
- **Architecture & Planning Packet:** [`docs/AGENTS.md`](docs/AGENTS.md)
- **iOS Scriptable Medium Widget Script:** [`ios-widget/DailyLifeWidget.js`](ios-widget/DailyLifeWidget.js)

---

## Key Features (v2.1)

1. **Low-Glare Warm Paper Theme (`1A`) + Slate-950 Dark Mode:**
   - Designed for extended financial & nutritional auditing without eye strain (`--bg-app: #F5F4F0`, `--bg-surface: #FAF9F6`, `--border-subtle: #E2DFD7`, `--text-primary: #1C1917`).
   - Strict tabular typography (`Inter` + `IBM Plex Sans Thai` + `JetBrains Mono` with `font-variant-numeric: tabular-nums`).
2. **Scalable Multi-Dashboard Sidebar (`2A`):**
   - Collapsible desktop sidebar (`w-64` ↔ `w-16` icon rail) + mobile bottom navigation bar.
   - Active modules (`Overview & Cross-Insights`, `Finance & Cashflow`, `Nutrition & Health`) plus extensible module slots (`Workout & Cardio`, `Habit & Sleep`, `Asset Portfolio`).
3. **iPhone iOS Medium Widget (`4×2` via Scriptable):**
   - Connects to `?mode=widget_json` on the Google Apps Script endpoint to display 4 real-time metrics on the iOS Home Screen:
     1. **งบคงเหลือเดือนนี้ + % ที่ใช้ไป** (เทียบงบ ฿10,000)
     2. **โปรตีนวันนี้เทียบเป้า 115g** พร้อมสถานะสี
     3. **แคลอรีวันนี้ (Midpoint)** เทียบกรอบ 1,800–2,100 kcal
     4. **รายจ่ายวันนี้ & รายจ่ายสะสมเดือนนี้**
   - Tapping the widget opens the full interactive dashboard.
4. **Defensive Data Hygiene & Privacy:**
   - Auto-recovers shifted rows in `Outcome` and deduplicates meal entries in `Food_Log`.
   - Spreadsheet IDs are stored in Google Apps Script `PropertiesService.getScriptProperties()` (`FINANCE_SPREADSHEET_ID`, `FOOD_SPREADSHEET_ID`) so zero private Sheet IDs are exposed in the public repository.
