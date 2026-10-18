/**
 * Unified Personal Life Dashboard (Finance & Nutrition)
 * File: Code.gs
 * Entry point for Google Apps Script Web App, iOS Widget JSON API & HTML Template helpers.
 */

const APP_CONFIG = Object.freeze({
  TIMEZONE: 'Asia/Bangkok',
  DEFAULT_FINANCE_SS_ID: 'YOUR_FINANCE_SPREADSHEET_ID',
  DEFAULT_FOOD_SS_ID: 'YOUR_FOOD_SPREADSHEET_ID',
  CACHE_KEY_UNIFIED: 'UNIFIED_LIFE_DASHBOARD_V3',
  CACHE_TTL_SECONDS: 180,
  LIVE_WEBAPP_URL: 'https://script.google.com/macros/s/AKfycbyq6FrcVrN1AxhWMaO8i7oFwmXIBiTrod55lCYvQrESfim4YIzHN0OJywO1rzvAKHCuQA/exec',
  TARGETS: Object.freeze({
    MONTHLY_BUDGET_THB: 10000,
    PROTEIN_G: 115,
    PROTEIN_WARN_G: 85,
    CALORIE_LOW: 1800,
    CALORIE_HIGH: 2100,
    VEG_FRUIT_PORTIONS: 3.0
  }),
  SHEETS: Object.freeze({
    OUTCOME: 'Outcome',
    INCOME: 'Income',
    SUBSCRIPTION: 'Subscription_Master',
    MONTHLY_DASHBOARD: 'Monthly_Dashboard',
    FOOD_LOG: 'Food_Log',
    BODY_WORKOUT_LOG: 'Body_Workout_Log',
    DAILY_NUTRITION_SUMMARY: 'Daily_Nutrition_Summary'
  })
});

/**
 * Web App HTTP GET Entry Point.
 * Supports:
 *   - ?mode=widget_json -> Returns compact JSON for iOS Scriptable Medium Widget (4 core metrics)
 *   - ?mode=overview | finance | nutrition -> Renders Web App HTML
 *
 * @param {GoogleAppsScript.Events.DoGet} e
 * @return {GoogleAppsScript.HTML.HtmlOutput|GoogleAppsScript.Content.TextOutput}
 */
function doGet(e) {
  const rawMode = e && e.parameter && typeof e.parameter.mode === 'string'
    ? e.parameter.mode.trim().toLowerCase()
    : 'overview';

  if (rawMode === 'widget_json' || (e && e.parameter && e.parameter.format === 'json')) {
    const force = Boolean(e && e.parameter && e.parameter.refresh === '1');
    const widgetPayload = buildWidgetSummaryPayload_(force);
    return ContentService
      .createTextOutput(JSON.stringify(widgetPayload))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const template = HtmlService.createTemplateFromFile('Index');
  const allowedModes = ['overview', 'finance', 'nutrition'];
  template.initialMode = allowedModes.indexOf(rawMode) !== -1 ? rawMode : 'overview';

  return template
    .evaluate()
    .setTitle('Unified Personal Life Dashboard (Finance & Nutrition)')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=5.0');
}

/**
 * Builds the compact 4-metric JSON payload for the iPhone iOS Medium Widget (Scriptable).
 * Selected Metrics:
 *   1. Monthly Budget Remaining + % Used
 *   2. Today's Protein vs 115g Target
 *   3. Today's Calorie Midpoint vs 1,800-2,100 kcal Band
 *   4. Today's Expense + Month-to-Date Expense
 *
 * @param {boolean} forceRefresh
 * @return {Object}
 */
function buildWidgetSummaryPayload_(forceRefresh) {
  try {
    const unified = fetchUnifiedDashboardData_(Boolean(forceRefresh));
    if (!unified || !unified.success) {
      return {
        success: false,
        error: (unified && unified.error) || 'Failed to load dashboard data'
      };
    }

    const activeMonth = (unified.crossInsights && unified.crossInsights.activeMonth) || unified.meta.currentMonth;
    const monthSum = (unified.finance && unified.finance.monthlySummaries && unified.finance.monthlySummaries[activeMonth]) || {
      expense: 0,
      budgetRemaining: APP_CONFIG.TARGETS.MONTHLY_BUDGET_THB,
      budgetUsedPct: 0
    };

    const allTx = (unified.finance && unified.finance.transactions) || [];
    const targetExpenseDate = unified.meta.latestFinanceDate || unified.meta.today;
    let todayExpense = 0;
    for (let i = 0; i < allTx.length; i++) {
      const tx = allTx[i];
      if (tx.date === targetExpenseDate && tx.type === 'Expense') {
        todayExpense += Number(tx.amount) || 0;
      }
    }

    const latestNut = (unified.nutrition && unified.nutrition.dailySummaries && unified.nutrition.dailySummaries[0]) || {
      date: unified.meta.today,
      proteinG: 0,
      proteinStatus: 'red',
      calLow: 0,
      calHigh: 0,
      calMid: 0,
      calorieStatus: 'under'
    };

    const usedPct = Math.round((Number(monthSum.budgetUsedPct) || 0) * 10) / 10;
    const budgetStatus = usedPct <= 80 ? 'on_track' : (usedPct <= 100 ? 'warning' : 'over');

    const calObj = {
      date: latestNut.date,
      mid: Math.round(Number(latestNut.calMid) || 0),
      low: Math.round(Number(latestNut.calLow) || 0),
      high: Math.round(Number(latestNut.calHigh) || 0),
      midKcal: Math.round(Number(latestNut.calMid) || 0),
      lowKcal: Math.round(Number(latestNut.calLow) || 0),
      highKcal: Math.round(Number(latestNut.calHigh) || 0),
      targetLowKcal: APP_CONFIG.TARGETS.CALORIE_LOW,
      targetHighKcal: APP_CONFIG.TARGETS.CALORIE_HIGH,
      status: latestNut.calorieStatus || 'under'
    };

    return {
      success: true,
      activeMonth: activeMonth,
      updatedAt: unified.meta.generatedAt,
      webAppUrl: APP_CONFIG.LIVE_WEBAPP_URL,
      metrics: {
        budget: {
          period: activeMonth,
          targetTHB: APP_CONFIG.TARGETS.MONTHLY_BUDGET_THB,
          remainingTHB: Math.round(Number(monthSum.budgetRemaining) || 0),
          usedPct: usedPct,
          status: budgetStatus
        },
        protein: {
          date: latestNut.date,
          currentG: Math.round((Number(latestNut.proteinG) || 0) * 10) / 10,
          targetG: APP_CONFIG.TARGETS.PROTEIN_G,
          diffG: Math.round(((Number(latestNut.proteinG) || 0) - APP_CONFIG.TARGETS.PROTEIN_G) * 10) / 10,
          status: latestNut.proteinStatus || 'red'
        },
        calories: calObj,
        calorie: calObj,
        spend: {
          todayDate: targetExpenseDate,
          todayTHB: Math.round(todayExpense),
          monthPeriod: activeMonth,
          monthTHB: Math.round(Number(monthSum.expense) || 0)
        }
      }
    };
  } catch (err) {
    return {
      success: false,
      error: err && err.message ? err.message : 'widget_summary_error'
    };
  }
}

/**
 * HTML template partial include helper.
 * Usage in Index.html: <?!= include('Styles'); ?> and <?!= include('App'); ?>
 * @param {string} filename
 * @return {string}
 */
function include(filename) {
  const allowedFiles = ['Styles', 'App'];
  const cleanName = String(filename ?? '').trim();
  if (allowedFiles.indexOf(cleanName) === -1) {
    throw new Error('Disallowed template include: ' + cleanName);
  }
  return HtmlService.createHtmlOutputFromFile(cleanName).getContent();
}

/**
 * Resolves Spreadsheet IDs from ScriptProperties with automatic one-time persistence
 * so public repository commits do not require hardcoded Spreadsheet IDs.
 * @return {{financeSpreadsheetId: string, foodSpreadsheetId: string}}
 */
function getSpreadsheetIds_() {
  let financeId = APP_CONFIG.DEFAULT_FINANCE_SS_ID;
  let foodId = APP_CONFIG.DEFAULT_FOOD_SS_ID;
  try {
    const props = PropertiesService.getScriptProperties();
    const customFinanceId = props.getProperty('FINANCE_SPREADSHEET_ID');
    const customFoodId = props.getProperty('FOOD_SPREADSHEET_ID');

    if (customFinanceId && customFinanceId.trim()) {
      financeId = customFinanceId.trim();
    } else if (financeId && financeId.indexOf('YOUR_') === -1) {
      props.setProperty('FINANCE_SPREADSHEET_ID', financeId);
    }

    if (customFoodId && customFoodId.trim()) {
      foodId = customFoodId.trim();
    } else if (foodId && foodId.indexOf('YOUR_') === -1) {
      props.setProperty('FOOD_SPREADSHEET_ID', foodId);
    }
  } catch (err) {
    console.warn('PropertiesService read fallback applied');
  }
  return {
    financeSpreadsheetId: financeId,
    foodSpreadsheetId: foodId
  };
}
