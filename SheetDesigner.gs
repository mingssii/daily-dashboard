/**
 * Unified Personal Life Dashboard (Finance & Nutrition)
 * File: SheetDesigner.gs
 * Minimalist Executive (Shadcn / Linear) In-Sheet Dashboard Builder for:
 *   1) Daily_Finance -> Monthly_Dashboard
 *   2) Daily_Food    -> Daily_Nutrition_Summary
 * Strictly read-only on raw log tabs (Outcome, Income, Subscription_Master, Food_Log, Body_Workout_Log).
 */

/**
 * Public function to rebuild and format both In-Sheet Dashboards.
 * Can be run directly from the Apps Script IDE or triggered from the Web App UI.
 * @return {Object} Status summary of rebuilt tabs.
 */
function rebuildInSheetDashboards() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return {
      success: false,
      error: 'มีการรัน rebuildInSheetDashboards() อยู่ก่อนแล้ว กรุณารอสักครู่แล้วลองใหม่'
    };
  }

  try {
    const unified = fetchUnifiedDashboardData_(true);
    if (!unified || !unified.success) {
      throw new Error(unified && unified.error ? unified.error : 'ไม่สามารถดึงข้อมูลจาก Spreadsheets ได้');
    }

    const ids = getSpreadsheetIds_();
    const financeSS = SpreadsheetApp.openById(ids.financeSpreadsheetId);
    const foodSS = SpreadsheetApp.openById(ids.foodSpreadsheetId);

    const financeSummary = designMonthlyFinanceSheet_(financeSS, unified);
    const foodSummary = designDailyNutritionSheet_(foodSS, unified);

    SpreadsheetApp.flush();
    clearUnifiedDashboardCache_();

    return {
      success: true,
      rebuiltAt: Utilities.formatDate(new Date(), APP_CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss'),
      financeDashboard: financeSummary,
      nutritionDashboard: foodSummary
    };
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    console.error('rebuildInSheetDashboards failed:', msg);
    return {
      success: false,
      error: msg
    };
  } finally {
    lock.releaseLock();
  }
}

/* ==========================================================================
 * 1. FINANCE IN-SHEET DASHBOARD: Monthly_Dashboard
 * ========================================================================== */

/**
 * Rebuilds the `Monthly_Dashboard` sheet inside `Daily_Finance` with live formulas,
 * KPI Cards, Period (YYYY-MM) Breakdown, and Main_Category & Payment_Method Tables.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {Object} unified
 * @return {Object}
 */
function designMonthlyFinanceSheet_(ss, unified) {
  const sheetName = APP_CONFIG.SHEETS.MONTHLY_DASHBOARD;
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  sheet.clear();
  sheet.clearConditionalFormatRules();
  sheet.setHiddenGridlines(true);

  const finance = unified.finance;
  const monthsDesc = finance.availableMonths.slice(0, 12);
  const activeMonth = unified.crossInsights.activeMonth || unified.meta.currentMonth;
  const activeMonthSummary = finance.monthlySummaries[activeMonth] || finance.monthlySummaries.ALL;

  const totalCols = 10;
  if (sheet.getMaxColumns() < totalCols) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), totalCols - sheet.getMaxColumns());
  }

  const colWidths = [24, 190, 135, 135, 135, 135, 135, 135, 145, 24];
  for (let c = 0; c < colWidths.length; c++) {
    sheet.setColumnWidth(c + 1, colWidths[c]);
  }

  // --------------------------------------------------------------------------
  // SECTION A: EXECUTIVE BANNER (Rows 2-3, Minimalist Slate-900)
  // --------------------------------------------------------------------------
  sheet.setRowHeight(1, 14);
  sheet.setRowHeight(2, 38);
  sheet.setRowHeight(3, 24);
  sheet.setRowHeight(4, 14);

  sheet.getRange('B2:I2').merge()
    .setValue('PERSONAL FINANCE EXECUTIVE DASHBOARD — MONTHLY & CATEGORY PULSE')
    .setBackground('#0F172A')
    .setFontColor('#F8FAFC')
    .setFontFamily('Inter')
    .setFontSize(13)
    .setFontWeight('bold')
    .setVerticalAlignment('middle');

  sheet.getRange('B3:I3').merge()
    .setValue(
      'Active Period: ' + activeMonth +
      '   |   Monthly Budget Target: ฿10,000.00   |   Last Synced: ' +
      unified.meta.generatedAt + ' (' + APP_CONFIG.TIMEZONE + ')'
    )
    .setBackground('#1E293B')
    .setFontColor('#CBD5E1')
    .setFontFamily('IBM Plex Sans Thai')
    .setFontSize(9)
    .setVerticalAlignment('middle');

  // --------------------------------------------------------------------------
  // SECTION B: 5 EXECUTIVE KPI CARDS (Rows 5-7, Columns B..I)
  // --------------------------------------------------------------------------
  sheet.setRowHeight(5, 22);
  sheet.setRowHeight(6, 36);
  sheet.setRowHeight(7, 20);
  sheet.setRowHeight(8, 16);

  sheet.getRange('B5:C5').merge();
  sheet.getRange('B6:C6').merge();
  sheet.getRange('B7:C7').merge();

  sheet.getRange('D5:E5').merge();
  sheet.getRange('D6:E6').merge();
  sheet.getRange('D7:E7').merge();

  sheet.getRange('G5:H5').merge();
  sheet.getRange('G6:H6').merge();
  sheet.getRange('G7:H7').merge();

  sheet.getRange('B5').setValue('TOTAL INCOME (THB)');
  sheet.getRange('D5').setValue('TOTAL EXPENSE (THB)');
  sheet.getRange('F5').setValue('NET CASHFLOW (THB)');
  sheet.getRange('G5').setValue('BUDGET 10,000 REMAINING (' + activeMonth + ')');
  sheet.getRange('I5').setValue('ACTIVE SUBSCRIPTION BURN');

  sheet.getRange('B5:I5')
    .setBackground('#F1F5F9')
    .setFontColor('#475569')
    .setFontFamily('Inter')
    .setFontSize(8)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  const totalIncomeFormula = '=IFERROR(SUM(Income!F2:F) + SUMIF(Outcome!D2:D, "Income", Outcome!E2:E), 0)';
  const totalExpenseFormula = '=IFERROR(SUMIF(Outcome!D2:D, "Expense", Outcome!E2:E) + SUMIF(Outcome!B2:B, "Expense", Outcome!C2:C) + SUMIF(Outcome!C2:C, "Expense", Outcome!D2:D), 0)';
  const netCashflowFormula = '=B6-D6';
  const budgetRemainingFormula = '=10000 - D11';
  const activeSubFormula = '=IFERROR(SUMIF(Subscription_Master!L2:L, "Active", Subscription_Master!H2:H), 0)';

  sheet.getRange('B6').setFormula(totalIncomeFormula);
  sheet.getRange('D6').setFormula(totalExpenseFormula);
  sheet.getRange('F6').setFormula(netCashflowFormula);
  sheet.getRange('G6').setFormula(budgetRemainingFormula);
  sheet.getRange('I6').setFormula(activeSubFormula);

  sheet.getRange('B6:I6')
    .setBackground('#FFFFFF')
    .setFontFamily('Inter')
    .setFontSize(14)
    .setFontWeight('bold')
    .setNumberFormat('฿#,##0.00;(-฿#,##0.00);"฿0.00"')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  sheet.getRange('B6').setFontColor('#059669');
  sheet.getRange('D6').setFontColor('#E11D48');
  sheet.getRange('F6').setFontColor('#0F172A');
  sheet.getRange('G6').setFontColor(activeMonthSummary.budgetRemaining >= 0 ? '#059669' : '#E11D48');
  sheet.getRange('I6').setFontColor('#0F172A');

  sheet.getRange('B7').setValue('รวมรายรับจากแท็บ Income + Outcome');
  sheet.getRange('D7').setValue('รวมรายจ่ายทุกหมวด (Defensive Sync)');
  sheet.getRange('F7').setFormula('=IF(F6>=0, "กระแสเงินสดสุทธิเป็นบวก", "กระแสเงินสดสุทธิติดลบ")');
  sheet.getRange('G7').setFormula('="ใช้ไป " & TEXT(D11/10000, "0.0%") & " ของงบ 10,000 บาท"');
  sheet.getRange('I7').setFormula('="Active " & COUNTIF(Subscription_Master!L2:L, "Active") & " รายการ/เดือน"');

  sheet.getRange('B7:I7')
    .setBackground('#F8FAFC')
    .setFontColor('#64748B')
    .setFontFamily('IBM Plex Sans Thai')
    .setFontSize(8)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  sheet.getRange('B5:I7').setBorder(
    true, true, true, true, true, false,
    '#E2E8F0', SpreadsheetApp.BorderStyle.SOLID
  );

  // --------------------------------------------------------------------------
  // SECTION C: MONTHLY CASHFLOW & BUDGET TABLE BY PERIOD (YYYY-MM)
  // --------------------------------------------------------------------------
  const periodTitleRow = 9;
  const periodHeaderRow = 10;
  const periodStartRow = 11;

  sheet.setRowHeight(periodTitleRow, 28);
  sheet.setRowHeight(periodHeaderRow, 26);

  sheet.getRange(periodTitleRow, 2, 1, 8).merge()
    .setValue('ตารางสรุปรายรับ-รายจ่าย และงบประมาณแยกตามเดือน (Period: YYYY-MM)')
    .setBackground('#0F172A')
    .setFontColor('#FFFFFF')
    .setFontFamily('IBM Plex Sans Thai')
    .setFontSize(10)
    .setFontWeight('bold')
    .setVerticalAlignment('middle');

  const periodHeaders = [[
    'Period (YYYY-MM)',
    'Total Income (THB)',
    'Total Expense (THB)',
    'Investment Transfer',
    'Net Cashflow (THB)',
    'Budget 10,000 Left',
    '% Budget Used',
    'Budget Status'
  ]];
  sheet.getRange(periodHeaderRow, 2, 1, 8)
    .setValues(periodHeaders)
    .setBackground('#F1F5F9')
    .setFontColor('#0F172A')
    .setFontFamily('Inter')
    .setFontSize(9)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  sheet.getRange(periodHeaderRow, 3, 1, 6).setHorizontalAlignment('right');

  const orderedPeriods = [activeMonth].concat(
    monthsDesc.filter(function(m) { return m !== activeMonth; })
  );

  const periodRowsData = [];
  for (let i = 0; i < orderedPeriods.length; i++) {
    const p = orderedPeriods[i];
    const rowNum = periodStartRow + i;
    const ms = finance.monthlySummaries[p] || {
      income: 0,
      expense: 0,
      investmentTransfer: 0
    };

    periodRowsData.push([
      p,
      ms.income,
      ms.expense,
      ms.investmentTransfer,
      '=C' + rowNum + '-D' + rowNum,
      '=10000-D' + rowNum,
      '=D' + rowNum + '/10000',
      '=IF(D' + rowNum + '<=8000, "On Track (<80%)", IF(D' + rowNum + '<=10000, "Near Limit", "Over Budget"))'
    ]);
  }

  const numPeriods = periodRowsData.length;
  if (numPeriods > 0) {
    const periodDataRange = sheet.getRange(periodStartRow, 2, numPeriods, 8);
    periodDataRange.setValues(periodRowsData);
    periodDataRange.setFontFamily('Inter').setFontSize(9).setVerticalAlignment('middle');

    sheet.setRowHeights(periodStartRow, numPeriods, 24);
    const periodBgs = [];
    for (let r = 0; r < numPeriods; r++) {
      const bg = r % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
      periodBgs.push([bg, bg, bg, bg, bg, bg, bg, bg]);
    }
    periodDataRange.setBackgrounds(periodBgs);

    sheet.getRange(periodStartRow, 2, numPeriods, 1).setHorizontalAlignment('center').setFontWeight('bold');
    sheet.getRange(periodStartRow, 3, numPeriods, 5)
      .setNumberFormat('฿#,##0.00;(-฿#,##0.00);"฿0.00"')
      .setHorizontalAlignment('right');
    sheet.getRange(periodStartRow, 8, numPeriods, 1)
      .setNumberFormat('0.0%')
      .setHorizontalAlignment('right');
    sheet.getRange(periodStartRow, 9, numPeriods, 1)
      .setHorizontalAlignment('center')
      .setFontFamily('IBM Plex Sans Thai');
  }

  const periodTotalRow = periodStartRow + numPeriods;
  const lastPeriodRow = periodTotalRow - 1;
  sheet.setRowHeight(periodTotalRow, 26);

  sheet.getRange(periodTotalRow, 2, 1, 8).setValues([[
    'TOTAL / OVERALL',
    '=SUM(C' + periodStartRow + ':C' + lastPeriodRow + ')',
    '=SUM(D' + periodStartRow + ':D' + lastPeriodRow + ')',
    '=SUM(E' + periodStartRow + ':E' + lastPeriodRow + ')',
    '=C' + periodTotalRow + '-D' + periodTotalRow,
    '=AVERAGE(G' + periodStartRow + ':G' + lastPeriodRow + ')',
    '=AVERAGE(H' + periodStartRow + ':H' + lastPeriodRow + ')',
    '=IF(AVERAGE(H' + periodStartRow + ':H' + lastPeriodRow + ')<=1, "On Track (Avg)", "Over Budget (Avg)")'
  ]])
    .setBackground('#F1F5F9')
    .setFontColor('#0F172A')
    .setFontFamily('Inter')
    .setFontSize(9)
    .setFontWeight('bold')
    .setVerticalAlignment('middle');

  sheet.getRange(periodTotalRow, 2).setHorizontalAlignment('center');
  sheet.getRange(periodTotalRow, 3, 1, 5)
    .setNumberFormat('฿#,##0.00;(-฿#,##0.00);"฿0.00"')
    .setHorizontalAlignment('right');
  sheet.getRange(periodTotalRow, 8).setNumberFormat('0.0%').setHorizontalAlignment('right');
  sheet.getRange(periodTotalRow, 9).setHorizontalAlignment('center');

  sheet.getRange(periodHeaderRow, 2, numPeriods + 2, 8).setBorder(
    true, true, true, true, true, true,
    '#E2E8F0', SpreadsheetApp.BorderStyle.SOLID
  );

  // --------------------------------------------------------------------------
  // SECTION D: MAIN_CATEGORY & PAYMENT_METHOD BREAKDOWN
  // --------------------------------------------------------------------------
  const catTitleRow = periodTotalRow + 2;
  const catHeaderRow = catTitleRow + 1;
  const catStartRow = catHeaderRow + 1;

  sheet.setRowHeight(periodTotalRow + 1, 16);
  sheet.setRowHeight(catTitleRow, 28);
  sheet.setRowHeight(catHeaderRow, 26);

  sheet.getRange(catTitleRow, 2, 1, 5).merge()
    .setValue('สัดส่วนค่าใช้จ่ายตามหมวดหลัก (Main_Category Breakdown)')
    .setBackground('#0F172A')
    .setFontColor('#FFFFFF')
    .setFontFamily('IBM Plex Sans Thai')
    .setFontSize(10)
    .setFontWeight('bold')
    .setVerticalAlignment('middle');

  sheet.getRange(catHeaderRow, 2, 1, 5).setValues([[
    'Main_Category',
    'Active Month (' + activeMonth + ')',
    'All-Time Total (THB)',
    '% Share (All-Time)',
    'Tx Count'
  ]])
    .setBackground('#F1F5F9')
    .setFontColor('#0F172A')
    .setFontFamily('Inter')
    .setFontSize(9)
    .setFontWeight('bold')
    .setVerticalAlignment('middle');
  sheet.getRange(catHeaderRow, 2).setHorizontalAlignment('left');
  sheet.getRange(catHeaderRow, 3, 1, 4).setHorizontalAlignment('right');

  sheet.getRange(catTitleRow, 8, 1, 2).merge()
    .setValue('ช่องทางชำระเงิน (Payment_Method)')
    .setBackground('#0F172A')
    .setFontColor('#FFFFFF')
    .setFontFamily('IBM Plex Sans Thai')
    .setFontSize(10)
    .setFontWeight('bold')
    .setVerticalAlignment('middle');

  sheet.getRange(catHeaderRow, 8, 1, 2).setValues([[
    'Payment_Method',
    'Total Spend (THB)'
  ]])
    .setBackground('#F1F5F9')
    .setFontColor('#0F172A')
    .setFontFamily('Inter')
    .setFontSize(9)
    .setFontWeight('bold')
    .setVerticalAlignment('middle');
  sheet.getRange(catHeaderRow, 8).setHorizontalAlignment('left');
  sheet.getRange(catHeaderRow, 9).setHorizontalAlignment('right');

  const allSummary = finance.monthlySummaries.ALL;
  const catRows = [];
  const numCats = STANDARD_EXPENSE_CATEGORIES.length;
  const numPay = STANDARD_PAYMENT_METHODS.length;
  const catTotalRow = catStartRow + numCats;

  for (let i = 0; i < numCats; i++) {
    const catName = STANDARD_EXPENSE_CATEGORIES[i];
    const rNum = catStartRow + i;
    const activeCatObj = (activeMonthSummary.byCategory && activeMonthSummary.byCategory[catName]) || { amount: 0, count: 0 };
    const allCatObj = (allSummary.byCategory && allSummary.byCategory[catName]) || { amount: 0, count: 0 };

    catRows.push([
      catName,
      activeCatObj.amount,
      allCatObj.amount,
      '=IFERROR(D' + rNum + '/$D$' + catTotalRow + ', 0)',
      allCatObj.count
    ]);
  }

  const maxSideBySideRows = Math.max(numCats + 1, numPay);
  sheet.setRowHeights(catStartRow, maxSideBySideRows, 23);

  const catBgs = [];
  for (let i = 0; i < numCats; i++) {
    const bg = i % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
    catBgs.push([bg, bg, bg, bg, bg]);
  }
  sheet.getRange(catStartRow, 2, numCats, 5).setValues(catRows).setBackgrounds(catBgs);

  sheet.getRange(catStartRow, 2, numCats, 1).setFontWeight('bold').setFontFamily('Inter').setFontSize(9);
  sheet.getRange(catStartRow, 3, numCats, 2).setNumberFormat('฿#,##0.00;(-฿#,##0.00);"฿0.00"').setHorizontalAlignment('right').setFontFamily('Inter').setFontSize(9);
  sheet.getRange(catStartRow, 5, numCats, 1).setNumberFormat('0.0%').setHorizontalAlignment('right').setFontFamily('Inter').setFontSize(9);
  sheet.getRange(catStartRow, 6, numCats, 1).setNumberFormat('#,##0').setHorizontalAlignment('right').setFontFamily('Inter').setFontSize(9);

  sheet.setRowHeight(catTotalRow, 25);
  sheet.getRange(catTotalRow, 2, 1, 5).setValues([[
    'TOTAL BY CATEGORY',
    '=SUM(C' + catStartRow + ':C' + (catTotalRow - 1) + ')',
    '=SUM(D' + catStartRow + ':D' + (catTotalRow - 1) + ')',
    '=SUM(E' + catStartRow + ':E' + (catTotalRow - 1) + ')',
    '=SUM(F' + catStartRow + ':F' + (catTotalRow - 1) + ')'
  ]])
    .setBackground('#F1F5F9')
    .setFontColor('#0F172A')
    .setFontWeight('bold')
    .setFontFamily('Inter')
    .setFontSize(9);
  sheet.getRange(catTotalRow, 3, 1, 2).setNumberFormat('฿#,##0.00').setHorizontalAlignment('right');
  sheet.getRange(catTotalRow, 5).setNumberFormat('0.0%').setHorizontalAlignment('right');
  sheet.getRange(catTotalRow, 6).setNumberFormat('#,##0').setHorizontalAlignment('right');

  sheet.getRange(catHeaderRow, 2, numCats + 2, 5).setBorder(
    true, true, true, true, true, true,
    '#E2E8F0', SpreadsheetApp.BorderStyle.SOLID
  );

  const payRows = [];
  const payBgs = [];
  for (let i = 0; i < numPay; i++) {
    const pm = STANDARD_PAYMENT_METHODS[i];
    const pmObj = (allSummary.byPaymentMethod && allSummary.byPaymentMethod[pm]) || { amount: 0 };
    payRows.push([pm, pmObj.amount]);
    const bg = i % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
    payBgs.push([bg, bg]);
  }
  sheet.getRange(catStartRow, 8, numPay, 2)
    .setValues(payRows)
    .setBackgrounds(payBgs)
    .setFontFamily('Inter')
    .setFontSize(9);
  sheet.getRange(catStartRow, 8, numPay, 1).setFontWeight('bold');
  sheet.getRange(catStartRow, 9, numPay, 1).setNumberFormat('฿#,##0.00;(-฿#,##0.00);"฿0.00"').setHorizontalAlignment('right');
  sheet.getRange(catHeaderRow, 8, numPay + 1, 2).setBorder(
    true, true, true, true, true, true,
    '#E2E8F0', SpreadsheetApp.BorderStyle.SOLID
  );

  // Conditional Formatting for Monthly Budget Remaining & Status (No Emojis)
  const cfRules = [];
  const budgetLeftRange = sheet.getRange(periodStartRow, 7, Math.max(numPeriods, 1), 1);
  const statusRange = sheet.getRange(periodStartRow, 9, Math.max(numPeriods, 1), 1);

  cfRules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenNumberGreaterThanOrEqualTo(2000)
      .setBackground('#ECFDF5')
      .setFontColor('#065F46')
      .setRanges([budgetLeftRange])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenNumberBetween(0, 1999.99)
      .setBackground('#FFFBEB')
      .setFontColor('#92400E')
      .setRanges([budgetLeftRange])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenNumberLessThan(0)
      .setBackground('#FFF1F2')
      .setFontColor('#9F1239')
      .setRanges([budgetLeftRange])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextContains('On Track')
      .setBackground('#ECFDF5')
      .setFontColor('#065F46')
      .setRanges([statusRange])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextContains('Near Limit')
      .setBackground('#FFFBEB')
      .setFontColor('#92400E')
      .setRanges([statusRange])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextContains('Over Budget')
      .setBackground('#FFF1F2')
      .setFontColor('#9F1239')
      .setRanges([statusRange])
      .build()
  );

  sheet.setConditionalFormatRules(cfRules);

  return {
    sheetName: sheetName,
    periodsRendered: numPeriods,
    categoriesRendered: numCats,
    activeMonth: activeMonth
  };
}

/* ==========================================================================
 * 2. NUTRITION IN-SHEET DASHBOARD: Daily_Nutrition_Summary
 * ========================================================================== */

/**
 * Rebuilds the `Daily_Nutrition_Summary` sheet inside `Daily_Food` with
 * Minimalist Executive (Shadcn / Linear) styling, right-aligned numbers, and live formulas.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {Object} unified
 * @return {Object}
 */
function designDailyNutritionSheet_(ss, unified) {
  const sheetName = APP_CONFIG.SHEETS.DAILY_NUTRITION_SUMMARY;
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  sheet.clear();
  sheet.clearConditionalFormatRules();
  sheet.setHiddenGridlines(true);

  const nutrition = unified.nutrition;
  const dailySummaries = nutrition.dailySummaries || [];
  const dupOffsets = nutrition.duplicateOffsetsByDate || {};

  const totalCols = 15;
  if (sheet.getMaxColumns() < totalCols) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), totalCols - sheet.getMaxColumns());
  }

  const colWidths = [20, 115, 85, 105, 105, 115, 155, 95, 145, 95, 110, 120, 110, 95, 115];
  for (let c = 0; c < colWidths.length; c++) {
    sheet.setColumnWidth(c + 1, colWidths[c]);
  }

  // --------------------------------------------------------------------------
  // SECTION A: EXECUTIVE BANNER (Rows 2-3, Minimalist Slate-900)
  // --------------------------------------------------------------------------
  sheet.setRowHeight(1, 14);
  sheet.setRowHeight(2, 38);
  sheet.setRowHeight(3, 24);
  sheet.setRowHeight(4, 14);

  sheet.getRange('B2:O2').merge()
    .setValue('DAILY NUTRITION & BODY PERFORMANCE SUMMARY — TARGET TRACKER')
    .setBackground('#0F172A')
    .setFontColor('#F8FAFC')
    .setFontFamily('Inter')
    .setFontSize(13)
    .setFontWeight('bold')
    .setVerticalAlignment('middle');

  sheet.getRange('B3:O3').merge()
    .setValue(
      'Daily Targets:  Protein >= 115 g/day (Pass >=115g | Warn 85-114g | Low <85g)   •   ' +
      'Calorie Band: 1,800 - 2,100 kcal/day   •   Veg & Fruit: >= 3.0 portions/day   •   ' +
      'Deduplicated Sync: ' + unified.meta.generatedAt
    )
    .setBackground('#1E293B')
    .setFontColor('#CBD5E1')
    .setFontFamily('IBM Plex Sans Thai')
    .setFontSize(9)
    .setVerticalAlignment('middle');

  // --------------------------------------------------------------------------
  // SECTION B: WEEKLY ROLLUP SUMMARY TABLE (Rows 5..5+W)
  // --------------------------------------------------------------------------
  const weeklyRows = buildWeeklyNutritionRollup_(dailySummaries);
  const weekTitleRow = 5;
  const weekHeaderRow = 6;
  const weekStartRow = 7;

  sheet.setRowHeight(weekTitleRow, 26);
  sheet.setRowHeight(weekHeaderRow, 24);

  sheet.getRange(weekTitleRow, 2, 1, 9).merge()
    .setValue('สรุปโภชนาการและการออกกำลังกายรายสัปดาห์ (Weekly Performance Rollup)')
    .setBackground('#0F172A')
    .setFontColor('#FFFFFF')
    .setFontFamily('IBM Plex Sans Thai')
    .setFontSize(10)
    .setFontWeight('bold')
    .setVerticalAlignment('middle');

  sheet.getRange(weekHeaderRow, 2, 1, 9).setValues([[
    'Week Starting',
    'Days Logged',
    'Avg Calorie_Mid',
    'Avg Protein (g)',
    'Protein Status',
    'Avg Carbs (g)',
    'Avg Veg & Fruit',
    'Warning Flags',
    'Workout Burn (kcal)'
  ]])
    .setBackground('#F1F5F9')
    .setFontColor('#0F172A')
    .setFontFamily('Inter')
    .setFontSize(9)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  const numWeeks = Math.max(weeklyRows.length, 1);
  if (weeklyRows.length > 0) {
    const formattedWeekData = [];
    const weekBgs = [];
    for (let idx = 0; idx < weeklyRows.length; idx++) {
      const w = weeklyRows[idx];
      const rNum = weekStartRow + idx;
      formattedWeekData.push([
        w.weekStart,
        w.daysLogged,
        w.avgCalMid,
        w.avgProteinG,
        '=IF(E' + rNum + '>=115, "Pass (>= 115g)", IF(E' + rNum + '>=85, "Warn (85-114g)", "Low (< 85g)"))',
        w.avgCarbsG,
        w.avgVegFruit,
        w.totalWarningFlags,
        w.totalWorkoutBurn
      ]);
      const bg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
      weekBgs.push([bg, bg, bg, bg, bg, bg, bg, bg, bg]);
    }
    sheet.setRowHeights(weekStartRow, formattedWeekData.length, 22);
    sheet.getRange(weekStartRow, 2, formattedWeekData.length, 9)
      .setValues(formattedWeekData)
      .setBackgrounds(weekBgs)
      .setFontFamily('Inter')
      .setFontSize(9)
      .setVerticalAlignment('middle');
    sheet.getRange(weekStartRow, 2, formattedWeekData.length, 1).setHorizontalAlignment('center');
    sheet.getRange(weekStartRow, 3, formattedWeekData.length, 1).setNumberFormat('#,##0').setHorizontalAlignment('right');
    sheet.getRange(weekStartRow, 4, formattedWeekData.length, 2).setNumberFormat('#,##0.0').setHorizontalAlignment('right');
    sheet.getRange(weekStartRow, 6, formattedWeekData.length, 1).setHorizontalAlignment('center');
    sheet.getRange(weekStartRow, 7, formattedWeekData.length, 2).setNumberFormat('#,##0.0').setHorizontalAlignment('right');
    sheet.getRange(weekStartRow, 9, formattedWeekData.length, 2).setNumberFormat('#,##0').setHorizontalAlignment('right');
  } else {
    sheet.getRange(weekStartRow, 2, 1, 9).setValues([['-', 0, 0, 0, 'Low (< 85g)', 0, 0, 0, 0]]);
  }

  sheet.getRange(weekHeaderRow, 2, numWeeks + 1, 9).setBorder(
    true, true, true, true, true, true,
    '#E2E8F0', SpreadsheetApp.BorderStyle.SOLID
  );

  // --------------------------------------------------------------------------
  // SECTION C: DAILY NUTRITION & BODY SUMMARY TABLE (Live Formulas + Conditional Formatting)
  // --------------------------------------------------------------------------
  const dailyTitleRow = weekStartRow + numWeeks + 2;
  const dailyHeaderRow = dailyTitleRow + 1;
  const dailyStartRow = dailyHeaderRow + 1;

  sheet.setRowHeight(dailyTitleRow - 1, 16);
  sheet.setRowHeight(dailyTitleRow, 28);
  sheet.setRowHeight(dailyHeaderRow, 28);

  sheet.getRange(dailyTitleRow, 2, 1, 14).merge()
    .setValue('ตารางสรุปโภชนาการและร่างกายรายวัน (Daily Nutrition & Body Summary — Deduplicated Live Formulas)')
    .setBackground('#0F172A')
    .setFontColor('#FFFFFF')
    .setFontFamily('IBM Plex Sans Thai')
    .setFontSize(10)
    .setFontWeight('bold')
    .setVerticalAlignment('middle');

  const dailyHeaders = [[
    'Date (YYYY-MM-DD)',
    'Meals',
    'Calorie_Low',
    'Calorie_High',
    'Calorie_Mid',
    'Calorie Band Status',
    'Protein (g)',
    'Protein Status (115g)',
    'Carbs (g)',
    'Veg & Fruit',
    'Veg Status (>=3.0)',
    'Warning Flags',
    'Weight (kg)',
    'Workout Burn (kcal)'
  ]];

  sheet.getRange(dailyHeaderRow, 2, 1, 14)
    .setValues(dailyHeaders)
    .setBackground('#F1F5F9')
    .setFontColor('#0F172A')
    .setFontFamily('Inter')
    .setFontSize(9)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  const numDays = dailySummaries.length;
  if (numDays > 0) {
    const dailyRows = [];
    const dailyBgs = [];
    for (let i = 0; i < numDays; i++) {
      const ds = dailySummaries[i];
      const rNum = dailyStartRow + i;
      const dup = dupOffsets[ds.date] || {
        count: 0,
        calLow: 0,
        calHigh: 0,
        proteinG: 0,
        carbsG: 0,
        vegFruit: 0
      };

      const mealCountFormula = '=MAX(0, COUNTIF(Food_Log!$B$2:$B, $B' + rNum + ')' + (dup.count > 0 ? '-' + dup.count : '') + ')';
      const calLowFormula = '=MAX(0, SUMIFS(Food_Log!$F$2:$F, Food_Log!$B$2:$B, $B' + rNum + ')' + (dup.calLow > 0 ? '-' + round1_(dup.calLow) : '') + ')';
      const calHighFormula = '=MAX(0, SUMIFS(Food_Log!$G$2:$G, Food_Log!$B$2:$B, $B' + rNum + ')' + (dup.calHigh > 0 ? '-' + round1_(dup.calHigh) : '') + ')';
      const calMidFormula = '=(D' + rNum + '+E' + rNum + ')/2';
      const calStatusFormula = '=IF(F' + rNum + '<1800, "Under (<1,800)", IF(F' + rNum + '<=2100, "Optimal (1,800-2,100)", "Over (>2,100)"))';
      const proteinFormula = '=MAX(0, SUMIFS(Food_Log!$H$2:$H, Food_Log!$B$2:$B, $B' + rNum + ')' + (dup.proteinG > 0 ? '-' + round1_(dup.proteinG) : '') + ')';
      const proteinStatusFormula = '=IF(H' + rNum + '>=115, "Pass (>= 115g)", IF(H' + rNum + '>=85, "Warn (85-114g)", "Low (< 85g)"))';
      const carbsFormula = '=MAX(0, SUMIFS(Food_Log!$I$2:$I, Food_Log!$B$2:$B, $B' + rNum + ')' + (dup.carbsG > 0 ? '-' + round1_(dup.carbsG) : '') + ')';
      const vegFormula = '=MAX(0, SUMIFS(Food_Log!$J$2:$J, Food_Log!$B$2:$B, $B' + rNum + ')' + (dup.vegFruit > 0 ? '-' + round1_(dup.vegFruit) : '') + ')';
      const vegStatusFormula = '=IF(K' + rNum + '>=3, "Pass (>= 3.0)", "Low (< 3.0)")';
      const workoutBurnFormula = '=IFERROR(SUMIFS(Body_Workout_Log!$H$2:$H, Body_Workout_Log!$B$2:$B, $B' + rNum + '), 0)';

      dailyRows.push([
        ds.date,
        mealCountFormula,
        calLowFormula,
        calHighFormula,
        calMidFormula,
        calStatusFormula,
        proteinFormula,
        proteinStatusFormula,
        carbsFormula,
        vegFormula,
        vegStatusFormula,
        ds.warningMealCount,
        ds.weightKg !== null ? ds.weightKg : '',
        workoutBurnFormula
      ]);

      const bg = i % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
      dailyBgs.push([bg, bg, bg, bg, bg, bg, bg, bg, bg, bg, bg, bg, bg, bg]);
    }

    sheet.setRowHeights(dailyStartRow, numDays, 23);
    const dailyRange = sheet.getRange(dailyStartRow, 2, numDays, 14);
    dailyRange.setValues(dailyRows);
    dailyRange.setBackgrounds(dailyBgs);
    dailyRange.setFontFamily('Inter').setFontSize(9).setVerticalAlignment('middle');

    sheet.getRange(dailyStartRow, 2, numDays, 1).setHorizontalAlignment('center').setFontWeight('bold');
    sheet.getRange(dailyStartRow, 3, numDays, 4).setNumberFormat('#,##0').setHorizontalAlignment('right');
    sheet.getRange(dailyStartRow, 7, numDays, 1).setHorizontalAlignment('center');
    sheet.getRange(dailyStartRow, 8, numDays, 1).setNumberFormat('#,##0.0').setHorizontalAlignment('right').setFontWeight('bold');
    sheet.getRange(dailyStartRow, 9, numDays, 1).setHorizontalAlignment('center');
    sheet.getRange(dailyStartRow, 10, numDays, 2).setNumberFormat('#,##0.0').setHorizontalAlignment('right');
    sheet.getRange(dailyStartRow, 12, numDays, 1).setHorizontalAlignment('center');
    sheet.getRange(dailyStartRow, 13, numDays, 1).setNumberFormat('#,##0').setHorizontalAlignment('right');
    sheet.getRange(dailyStartRow, 14, numDays, 1).setNumberFormat('0.0').setHorizontalAlignment('right');
    sheet.getRange(dailyStartRow, 15, numDays, 1).setNumberFormat('#,##0').setHorizontalAlignment('right');

    const avgRow = dailyStartRow + numDays;
    const lastDayRow = avgRow - 1;
    sheet.setRowHeight(avgRow, 26);

    sheet.getRange(avgRow, 2, 1, 14).setValues([[
      'DAILY AVERAGE',
      '=AVERAGE(C' + dailyStartRow + ':C' + lastDayRow + ')',
      '=AVERAGE(D' + dailyStartRow + ':D' + lastDayRow + ')',
      '=AVERAGE(E' + dailyStartRow + ':E' + lastDayRow + ')',
      '=AVERAGE(F' + dailyStartRow + ':F' + lastDayRow + ')',
      '=IF(AND(F' + avgRow + '>=1800, F' + avgRow + '<=2100), "Optimal Avg", "Outside Band")',
      '=AVERAGE(H' + dailyStartRow + ':H' + lastDayRow + ')',
      '=IF(H' + avgRow + '>=115, "Pass (>= 115g)", IF(H' + avgRow + '>=85, "Warn (85-114g)", "Low (< 85g)"))',
      '=AVERAGE(J' + dailyStartRow + ':J' + lastDayRow + ')',
      '=AVERAGE(K' + dailyStartRow + ':K' + lastDayRow + ')',
      '=IF(K' + avgRow + '>=3, "Pass (>= 3.0)", "Low (< 3.0)")',
      '=SUM(M' + dailyStartRow + ':M' + lastDayRow + ')',
      '=IFERROR(AVERAGE(N' + dailyStartRow + ':N' + lastDayRow + '), "-")',
      '=SUM(O' + dailyStartRow + ':O' + lastDayRow + ')'
    ]])
      .setBackground('#F1F5F9')
      .setFontColor('#0F172A')
      .setFontFamily('Inter')
      .setFontSize(9)
      .setFontWeight('bold')
      .setVerticalAlignment('middle');

    sheet.getRange(avgRow, 2).setHorizontalAlignment('center');
    sheet.getRange(avgRow, 3).setNumberFormat('0.0').setHorizontalAlignment('right');
    sheet.getRange(avgRow, 4, 1, 3).setNumberFormat('#,##0').setHorizontalAlignment('right');
    sheet.getRange(avgRow, 7).setHorizontalAlignment('center');
    sheet.getRange(avgRow, 8).setNumberFormat('#,##0.0').setHorizontalAlignment('right');
    sheet.getRange(avgRow, 9).setHorizontalAlignment('center');
    sheet.getRange(avgRow, 10, 1, 2).setNumberFormat('#,##0.0').setHorizontalAlignment('right');
    sheet.getRange(avgRow, 12).setHorizontalAlignment('center');
    sheet.getRange(avgRow, 13).setNumberFormat('#,##0').setHorizontalAlignment('right');
    sheet.getRange(avgRow, 14).setNumberFormat('0.0').setHorizontalAlignment('right');
    sheet.getRange(avgRow, 15).setNumberFormat('#,##0').setHorizontalAlignment('right');

    sheet.getRange(dailyHeaderRow, 2, numDays + 2, 14).setBorder(
      true, true, true, true, true, true,
      '#E2E8F0', SpreadsheetApp.BorderStyle.SOLID
    );

    const proteinNumRange = sheet.getRange(dailyStartRow, 8, numDays, 1);
    const calMidRange = sheet.getRange(dailyStartRow, 6, numDays, 1);
    const vegRange = sheet.getRange(dailyStartRow, 11, numDays, 1);
    const badgeRanges = [
      sheet.getRange(dailyStartRow, 7, numDays, 1),
      sheet.getRange(dailyStartRow, 9, numDays, 1),
      sheet.getRange(dailyStartRow, 12, numDays, 1),
      sheet.getRange(weekStartRow, 6, numWeeks, 1)
    ];

    const rules = [
      SpreadsheetApp.newConditionalFormatRule()
        .whenNumberGreaterThanOrEqualTo(115)
        .setBackground('#ECFDF5')
        .setFontColor('#065F46')
        .setRanges([proteinNumRange])
        .build(),
      SpreadsheetApp.newConditionalFormatRule()
        .whenNumberBetween(85, 114.99)
        .setBackground('#FFFBEB')
        .setFontColor('#92400E')
        .setRanges([proteinNumRange])
        .build(),
      SpreadsheetApp.newConditionalFormatRule()
        .whenNumberLessThan(85)
        .setBackground('#FFF1F2')
        .setFontColor('#9F1239')
        .setRanges([proteinNumRange])
        .build(),

      SpreadsheetApp.newConditionalFormatRule()
        .whenNumberBetween(1800, 2100)
        .setBackground('#ECFDF5')
        .setFontColor('#065F46')
        .setRanges([calMidRange])
        .build(),
      SpreadsheetApp.newConditionalFormatRule()
        .whenNumberGreaterThan(2100)
        .setBackground('#FFFBEB')
        .setFontColor('#92400E')
        .setRanges([calMidRange])
        .build(),
      SpreadsheetApp.newConditionalFormatRule()
        .whenNumberLessThan(1800)
        .setBackground('#F1F5F9')
        .setFontColor('#334155')
        .setRanges([calMidRange])
        .build(),

      SpreadsheetApp.newConditionalFormatRule()
        .whenNumberGreaterThanOrEqualTo(3.0)
        .setBackground('#ECFDF5')
        .setFontColor('#065F46')
        .setRanges([vegRange])
        .build(),
      SpreadsheetApp.newConditionalFormatRule()
        .whenNumberLessThan(3.0)
        .setBackground('#FFF1F2')
        .setFontColor('#9F1239')
        .setRanges([vegRange])
        .build(),

      SpreadsheetApp.newConditionalFormatRule()
        .whenTextContains('Pass')
        .setBackground('#ECFDF5')
        .setFontColor('#065F46')
        .setRanges(badgeRanges)
        .build(),
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextContains('Optimal')
        .setBackground('#ECFDF5')
        .setFontColor('#065F46')
        .setRanges(badgeRanges)
        .build(),
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextContains('Warn')
        .setBackground('#FFFBEB')
        .setFontColor('#92400E')
        .setRanges(badgeRanges)
        .build(),
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextContains('Over')
        .setBackground('#FFFBEB')
        .setFontColor('#92400E')
        .setRanges(badgeRanges)
        .build(),
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextContains('Low')
        .setBackground('#FFF1F2')
        .setFontColor('#9F1239')
        .setRanges(badgeRanges)
        .build(),
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextContains('Under')
        .setBackground('#F1F5F9')
        .setFontColor('#334155')
        .setRanges(badgeRanges)
        .build()
    ];

    sheet.setConditionalFormatRules(rules);
  }

  return {
    sheetName: sheetName,
    daysRendered: numDays,
    weeksRendered: weeklyRows.length
  };
}

/**
 * Helper to aggregate daily nutrition summaries into Monday-starting weekly buckets.
 * @param {Array<Object>} dailySummaries
 * @return {Array<Object>}
 */
function buildWeeklyNutritionRollup_(dailySummaries) {
  const weekMap = {};
  for (let i = 0; i < dailySummaries.length; i++) {
    const ds = dailySummaries[i];
    const parts = ds.date.split('-');
    if (parts.length !== 3) continue;
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const dayOfWeek = d.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMonday);
    const weekStart = [
      monday.getFullYear(),
      String(monday.getMonth() + 1).padStart(2, '0'),
      String(monday.getDate()).padStart(2, '0')
    ].join('-');

    if (!weekMap[weekStart]) {
      weekMap[weekStart] = {
        weekStart: weekStart,
        daysLogged: 0,
        sumCalMid: 0,
        sumProteinG: 0,
        sumCarbsG: 0,
        sumVegFruit: 0,
        totalWarningFlags: 0,
        totalWorkoutBurn: 0
      };
    }

    const w = weekMap[weekStart];
    if (ds.mealCount > 0) {
      w.daysLogged++;
      w.sumCalMid += ds.calMid;
      w.sumProteinG += ds.proteinG;
      w.sumCarbsG += ds.carbsG;
      w.sumVegFruit += ds.vegFruit;
      w.totalWarningFlags += ds.warningMealCount;
    }
    w.totalWorkoutBurn += ds.workoutBurnKcal;
  }

  const weekKeys = Object.keys(weekMap).sort().reverse();
  return weekKeys.map(function(k) {
    const w = weekMap[k];
    const divisor = Math.max(w.daysLogged, 1);
    return {
      weekStart: w.weekStart,
      daysLogged: w.daysLogged,
      avgCalMid: round1_(w.sumCalMid / divisor),
      avgProteinG: round1_(w.sumProteinG / divisor),
      avgCarbsG: round1_(w.sumCarbsG / divisor),
      avgVegFruit: round1_(w.sumVegFruit / divisor),
      totalWarningFlags: w.totalWarningFlags,
      totalWorkoutBurn: round1_(w.totalWorkoutBurn)
    };
  });
}
