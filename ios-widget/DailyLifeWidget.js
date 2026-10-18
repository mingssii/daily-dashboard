// Variables used by Scriptable.
// icon-color: deep-gray; icon-glyph: chart-bar;
/**
 * Daily Life Dashboard — iOS Medium Widget (4x2) for Scriptable
 * Fetches live 4-metric JSON summary from Google Apps Script (?mode=widget_json)
 * and opens the full interactive dashboard on tap.
 *
 * Metrics included:
 * 1. งบคงเหลือเดือนนี้ + % ที่ใช้ไป (เทียบงบ ฿10,000)
 * 2. โปรตีนวันนี้เทียบเป้า 115g + สถานะสี
 * 3. แคลอรีวันนี้เทียบกรอบ 1,800–2,100 kcal (Midpoint)
 * 4. รายจ่ายวันนี้ & รายจ่ายสะสมเดือนนี้
 */

const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbyq6FrcVrN1AxhWMaO8i7oFwmXIBiTrod55lCYvQrESfim4YIzHN0OJywO1rzvAKHCuQA/exec";
const API_URL = WEBAPP_URL + "?mode=widget_json";

async function loadMetrics() {
  try {
    const req = new Request(API_URL);
    req.timeoutInterval = 15;
    return await req.loadJSON();
  } catch (e) {
    return null;
  }
}

function fmtTHB(n) {
  return "฿" + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function addCard(parent, title, mainVal, subText, accentHex) {
  const card = parent.addStack();
  card.layoutVertically();
  card.backgroundColor = new Color("#262320");
  card.cornerRadius = 10;
  card.setPadding(8, 10, 8, 10);
  card.borderColor = new Color("#3A3530");
  card.borderWidth = 1;

  const t = card.addText(title.toUpperCase());
  t.font = Font.semiboldSystemFont(9);
  t.textColor = new Color("#A8A29E");
  card.addSpacer(3);

  const v = card.addText(mainVal);
  v.font = Font.boldMonospacedSystemFont(15);
  v.textColor = new Color(accentHex || "#FAF9F6");
  card.addSpacer(2);

  const s = card.addText(subText);
  s.font = Font.systemFont(9);
  s.textColor = new Color("#78716C");
  s.lineLimit = 1;
}

const data = await loadMetrics();
const w = new ListWidget();
w.backgroundColor = new Color("#1C1917");
w.setPadding(12, 14, 12, 14);
w.url = WEBAPP_URL;

const header = w.addStack();
header.centerAlignContent();
const title = header.addText("DAILY LIFE VAULT");
title.font = Font.boldSystemFont(10);
title.textColor = new Color("#D6D3CD");
header.addSpacer();
const meta = header.addText(data && data.activeMonth ? data.activeMonth : "OFFLINE");
meta.font = Font.mediumMonospacedSystemFont(9);
meta.textColor = new Color("#10B981");
w.addSpacer(8);

if (data && data.metrics) {
  const m = data.metrics;
  const row1 = w.addStack();
  row1.spacing = 8;
  const bPct = Number(m.budget.usedPct || 0).toFixed(1);
  addCard(
    row1,
    "1. งบคงเหลือเดือนนี้",
    fmtTHB(m.budget.remainingTHB),
    "ใช้ไป " + bPct + "% ของงบ ฿10k",
    m.budget.remainingTHB >= 2000 ? "#FAF9F6" : "#F59E0B"
  );
  const pColor = m.protein.currentG >= 115 ? "#34D399" : (m.protein.currentG >= 85 ? "#FBBF24" : "#FB7185");
  addCard(
    row1,
    "2. โปรตีนวันนี้",
    m.protein.currentG.toFixed(1) + " / 115g",
    "วันที่ " + m.protein.date,
    pColor
  );

  w.addSpacer(8);
  const row2 = w.addStack();
  row2.spacing = 8;
  addCard(
    row2,
    "3. แคลอรีวันนี้ (MID)",
    m.calories.mid + " kcal",
    "กรอบ " + m.calories.low + "–" + m.calories.high + " kcal",
    "#FAF9F6"
  );
  addCard(
    row2,
    "4. รายจ่ายวันนี้ / เดือนนี้",
    fmtTHB(m.spend.todayTHB),
    "เดือนนี้ " + fmtTHB(m.spend.monthTHB),
    "#FAF9F6"
  );
} else {
  const err = w.addText("ไม่สามารถดึงข้อมูลได้ แตะเพื่อเปิด Web App");
  err.font = Font.systemFont(11);
  err.textColor = new Color("#F87171");
}

if (config.runsInWidget) {
  Script.setWidget(w);
} else {
  await w.presentMedium();
}
Script.complete();
