/**
 * Unified Personal Life Dashboard (Finance & Nutrition)
 * File: DataService.gs
 * Backend data ingestion, defensive parsing, deduplication, normalization, and caching.
 */

const KNOWN_PAYMENT_METHODS_MAP = Object.freeze({
  'scb': 'SCB',
  'ไทยพาณิชย์': 'SCB',
  'kbank': 'KBank',
  'กสิกร': 'KBank',
  'กสิกรไทย': 'KBank',
  'ktb': 'KTB',
  'กรุงไทย': 'KTB',
  'bbl': 'BBL',
  'กรุงเทพ': 'BBL',
  'ttb': 'TTB',
  'ทีทีบี': 'TTB',
  'เป๋าตัง': 'เป๋าตัง (G-Wallet)',
  'เป๋าตัง (g-wallet)': 'เป๋าตัง (G-Wallet)',
  'g-wallet': 'เป๋าตัง (G-Wallet)',
  'gwallet': 'เป๋าตัง (G-Wallet)',
  'credit card': 'Credit Card',
  'บัตรเครดิต': 'Credit Card',
  'cash': 'Cash',
  'เงินสด': 'Cash',
  'promptpay': 'PromptPay',
  'พร้อมเพย์': 'PromptPay',
  'unknown': 'Unknown'
});

const KNOWN_MAIN_CATEGORIES_MAP = Object.freeze({
  'food & drink': 'Food & Drink',
  'food and drink': 'Food & Drink',
  'food': 'Food & Drink',
  'transport': 'Transport',
  'transportation': 'Transport',
  'shopping & personal': 'Shopping & Personal',
  'shopping': 'Shopping & Personal',
  'housing & bills': 'Housing & Bills',
  'housing': 'Housing & Bills',
  'bills': 'Housing & Bills',
  'health & wellness': 'Health & Wellness',
  'health': 'Health & Wellness',
  'work & education': 'Work & Education',
  'work': 'Work & Education',
  'education': 'Work & Education',
  'entertainment': 'Entertainment',
  'investment transfer': 'Investment Transfer',
  'investment': 'Investment Transfer',
  'income': 'Income',
  'other expense': 'Other Expense',
  'others': 'Other Expense',
  'other': 'Other Expense',
  'อื่นๆ': 'Other Expense'
});

const STANDARD_EXPENSE_CATEGORIES = Object.freeze([
  'Food & Drink',
  'Transport',
  'Shopping & Personal',
  'Housing & Bills',
  'Health & Wellness',
  'Work & Education',
  'Entertainment',
  'Investment Transfer',
  'Other Expense'
]);

const STANDARD_PAYMENT_METHODS = Object.freeze([
  'SCB',
  'KBank',
  'KTB',
  'BBL',
  'TTB',
  'เป๋าตัง (G-Wallet)',
  'Credit Card',
  'Cash',
  'PromptPay',
  'Unknown'
]);

const STANDARD_MEAL_TYPES = Object.freeze([
  'Breakfast',
  'Lunch',
  'Dinner',
  'Snack',
  'Drink',
  'Pre-workout',
  'Post-workout'
]);

const HEALTH_WARNING_FLAGS = Object.freeze([
  'sugary drink',
  'fried food',
  'highly processed food',
  'dessert / high added sugar'
]);

/**
 * Public RPC endpoint for Web App frontend.
 * @param {boolean=} forceRefresh Set true to bypass short-term CacheService.
 * @return {Object} Unified JSON payload for Finance, Nutrition, and Cross-Insights.
 */
function getUnifiedDashboardData(forceRefresh) {
  return fetchUnifiedDashboardData_(Boolean(forceRefresh));
}

/**
 * Core implementation for fetching, cleaning, and aggregating both Spreadsheets.
 * @param {boolean} forceRefresh
 * @return {Object}
 */
function fetchUnifiedDashboardData_(forceRefresh) {
  const cache = CacheService.getScriptCache();
  if (!forceRefresh && cache) {
    try {
      const cachedText = cache.get(APP_CONFIG.CACHE_KEY_UNIFIED);
      if (typeof cachedText === 'string' && cachedText.length > 0) {
        const parsed = JSON.parse(cachedText);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.success === true) {
          parsed.meta = parsed.meta || {};
          parsed.meta.fromCache = true;
          return parsed;
        }
      }
    } catch (cacheReadErr) {
      console.warn('Cache read skipped:', cacheReadErr && cacheReadErr.message ? cacheReadErr.message : 'parse_error');
    }
  }

  try {
    const now = new Date();
    const todayStr = Utilities.formatDate(now, APP_CONFIG.TIMEZONE, 'yyyy-MM-dd');
    const currentMonthStr = Utilities.formatDate(now, APP_CONFIG.TIMEZONE, 'yyyy-MM');
    const generatedAtStr = Utilities.formatDate(now, APP_CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');

    const ids = getSpreadsheetIds_();
    const financeSS = SpreadsheetApp.openById(ids.financeSpreadsheetId);
    const foodSS = SpreadsheetApp.openById(ids.foodSpreadsheetId);

    const financeResult = parseFinanceSpreadsheet_(financeSS, todayStr, currentMonthStr);
    const nutritionResult = parseFoodSpreadsheet_(foodSS, todayStr);
    const crossInsights = computeCrossInsights_(financeResult, nutritionResult, currentMonthStr);
    const gymSummary = buildGymSummary_(todayStr, nutritionResult);

    const payload = {
      success: true,
      meta: {
        generatedAt: generatedAtStr,
        timezone: APP_CONFIG.TIMEZONE,
        today: todayStr,
        currentMonth: currentMonthStr,
        fromCache: false,
        latestFinanceDate: financeResult.latestDate || todayStr,
        latestFinanceMonth: financeResult.latestMonth || currentMonthStr,
        latestFoodDate: nutritionResult.latestDate || todayStr,
        stats: {
          outcomeRawRows: financeResult.stats.outcomeRawRows,
          outcomeParsedRows: financeResult.stats.outcomeParsedRows,
          outcomeShiftedRowsRecovered: financeResult.stats.outcomeShiftedRowsRecovered,
          incomeRawRows: financeResult.stats.incomeRawRows,
          incomeParsedRows: financeResult.stats.incomeParsedRows,
          subscriptionRows: financeResult.stats.subscriptionRows,
          foodRawRows: nutritionResult.stats.foodRawRows,
          foodUniqueRows: nutritionResult.stats.foodUniqueRows,
          foodDuplicatesRemoved: nutritionResult.stats.foodDuplicatesRemoved,
          bodyWorkoutRows: nutritionResult.stats.bodyWorkoutRows
        }
      },
      targets: {
        monthlyBudgetTHB: APP_CONFIG.TARGETS.MONTHLY_BUDGET_THB,
        proteinG: APP_CONFIG.TARGETS.PROTEIN_G,
        proteinWarnG: APP_CONFIG.TARGETS.PROTEIN_WARN_G,
        calorieLow: APP_CONFIG.TARGETS.CALORIE_LOW,
        calorieHigh: APP_CONFIG.TARGETS.CALORIE_HIGH,
        vegFruitPortions: APP_CONFIG.TARGETS.VEG_FRUIT_PORTIONS
      },
      finance: financeResult,
      nutrition: nutritionResult,
      crossInsights: crossInsights,
      gym: gymSummary
    };

    if (cache) {
      try {
        const serialized = JSON.stringify(payload);
        if (serialized.length < 95000) {
          cache.put(APP_CONFIG.CACHE_KEY_UNIFIED, serialized, APP_CONFIG.CACHE_TTL_SECONDS);
        }
      } catch (cacheWriteErr) {
        console.warn('Cache write skipped (payload size or quota)');
      }
    }

    return payload;
  } catch (err) {
    const errMsg = err && err.message ? err.message : String(err);
    console.error('fetchUnifiedDashboardData_ failed:', errMsg);
    return {
      success: false,
      error: errMsg,
      meta: {
        generatedAt: Utilities.formatDate(new Date(), APP_CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss'),
        timezone: APP_CONFIG.TIMEZONE
      }
    };
  }
}

/**
 * Clears the cached unified payload (used after sheet dashboard rebuilds).
 */
function clearUnifiedDashboardCache_() {
  try {
    const cache = CacheService.getScriptCache();
    if (cache) {
      cache.remove(APP_CONFIG.CACHE_KEY_UNIFIED);
    }
  } catch (e) {
    // Non-fatal
  }
}

/* ==========================================================================
 * 1. FINANCE SPREADSHEET PARSER (Outcome, Income, Subscription_Master)
 * ========================================================================== */

/**
 * Parses Daily_Finance tabs with defensive column shift recovery & normalization.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {string} todayStr
 * @param {string} currentMonthStr
 * @return {Object}
 */
function parseFinanceSpreadsheet_(ss, todayStr, currentMonthStr) {
  const transactions = [];
  const subscriptions = [];
  const stats = {
    outcomeRawRows: 0,
    outcomeParsedRows: 0,
    outcomeShiftedRowsRecovered: 0,
    incomeRawRows: 0,
    incomeParsedRows: 0,
    subscriptionRows: 0
  };

  // --- 1A. Parse Outcome (with Defensive Shifted-Column Parser) ---
  const outcomeSheet = ss.getSheetByName(APP_CONFIG.SHEETS.OUTCOME);
  if (outcomeSheet) {
    const lastRow = outcomeSheet.getLastRow();
    const lastCol = Math.max(10, outcomeSheet.getLastColumn());
    if (lastRow > 1) {
      stats.outcomeRawRows = lastRow - 1;
      const values = outcomeSheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
      for (let i = 0; i < values.length; i++) {
        const parsed = parseOutcomeRowDefensive_(values[i], i + 2);
        if (parsed) {
          transactions.push(parsed);
          stats.outcomeParsedRows++;
          if (parsed.wasShifted) {
            stats.outcomeShiftedRowsRecovered++;
          }
        }
      }
    }
  }

  // --- 1B. Parse Income ---
  const incomeSheet = ss.getSheetByName(APP_CONFIG.SHEETS.INCOME);
  if (incomeSheet) {
    const lastRow = incomeSheet.getLastRow();
    const lastCol = Math.max(9, incomeSheet.getLastColumn());
    if (lastRow > 1) {
      stats.incomeRawRows = lastRow - 1;
      const values = incomeSheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
      for (let i = 0; i < values.length; i++) {
        const parsed = parseIncomeRow_(values[i], i + 2);
        if (parsed) {
          transactions.push(parsed);
          stats.incomeParsedRows++;
        }
      }
    }
  }

  // --- 1C. Parse Subscription_Master ---
  const subSheet = ss.getSheetByName(APP_CONFIG.SHEETS.SUBSCRIPTION);
  let activeSubscriptionBurn = 0;
  let dueSoonCount = 0;

  if (subSheet) {
    const lastRow = subSheet.getLastRow();
    const lastCol = Math.max(14, subSheet.getLastColumn());
    if (lastRow > 1) {
      const values = subSheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
      for (let i = 0; i < values.length; i++) {
        const sub = parseSubscriptionRow_(values[i], i + 2, todayStr);
        if (sub) {
          subscriptions.push(sub);
          stats.subscriptionRows++;
          if (sub.status === 'Active') {
            activeSubscriptionBurn += sub.amountTHBEst;
            if (sub.isDueSoon) {
              dueSoonCount++;
            }
          }
        }
      }
    }
  }

  // Sort transactions newest first for tables, and compute chronological summaries
  transactions.sort(function(a, b) {
    const keyA = a.date + ' ' + (a.time || '00:00') + ' ' + a.id;
    const keyB = b.date + ' ' + (b.time || '00:00') + ' ' + b.id;
    return keyB.localeCompare(keyA);
  });

  // Sort subscriptions: Active first, then by daysUntilBilling ascending
  subscriptions.sort(function(a, b) {
    if (a.status === 'Active' && b.status !== 'Active') return -1;
    if (a.status !== 'Active' && b.status === 'Active') return 1;
    return (a.daysUntilBilling ?? 999) - (b.daysUntilBilling ?? 999);
  });

  // Collect available months, categories, payment methods, and build monthly summaries
  const monthSet = {};
  monthSet[currentMonthStr] = true;
  const catSet = {};
  STANDARD_EXPENSE_CATEGORIES.forEach(function(c) { catSet[c] = true; });
  const paySet = {};

  let latestDate = '';
  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    if (tx.period) monthSet[tx.period] = true;
    if (tx.date && tx.date.length >= 7) monthSet[tx.date.slice(0, 7)] = true;
    if (tx.mainCat) catSet[tx.mainCat] = true;
    if (tx.payMethod) paySet[tx.payMethod] = true;
    if (tx.date > latestDate) latestDate = tx.date;
  }

  const availableMonths = Object.keys(monthSet).sort().reverse();
  const latestMonth = availableMonths.length > 0 ? availableMonths[0] : currentMonthStr;

  const monthlySummaries = buildFinanceMonthlySummaries_(
    transactions,
    availableMonths,
    activeSubscriptionBurn
  );

  return {
    transactions: transactions,
    subscriptions: subscriptions,
    activeSubscriptionBurn: round2_(activeSubscriptionBurn),
    dueSoonCount: dueSoonCount,
    availableMonths: availableMonths,
    availableCategories: Object.keys(catSet),
    availablePaymentMethods: STANDARD_PAYMENT_METHODS.slice(),
    monthlySummaries: monthlySummaries,
    latestDate: latestDate || todayStr,
    latestMonth: latestMonth,
    stats: stats
  };
}

/**
 * Defensive parser for a single Outcome row.
 * Handles standard 10-column rows AND early shifted rows where Logged_At / Tx_Time were omitted.
 *
 * Standard Schema:
 * [0] Logged_At, [1] Tx_Date, [2] Tx_Time, [3] Type, [4] Amount,
 * [5] Main_Category, [6] Sub_Category, [7] Description, [8] Payment_Method, [9] Raw_Input
 *
 * @param {Array<*>} row
 * @param {number} sheetRow
 * @return {Object|null}
 */
function parseOutcomeRowDefensive_(row, sheetRow) {
  if (!Array.isArray(row) || row.length === 0) return null;

  // Step 1: Detect index of `Type` ('Expense' | 'Income' | 'Transfer') across columns 0..5
  let typeIdx = -1;
  let normalizedType = '';
  const maxScan = Math.min(row.length, 6);

  // Check standard index 3 first for fast path, then scan 0..5
  const checkOrder = [3, 1, 2, 0, 4, 5];
  for (let c = 0; c < checkOrder.length; c++) {
    const idx = checkOrder[c];
    if (idx < maxScan) {
      const detected = detectTxType_(row[idx]);
      if (detected) {
        typeIdx = idx;
        normalizedType = detected;
        break;
      }
    }
  }

  if (typeIdx === -1 || !normalizedType) {
    return null;
  }

  const wasShifted = typeIdx !== 3;

  // Step 2: Extract Tx_Date and Tx_Time from columns preceding `typeIdx`
  let txDate = '';
  let txTime = '';

  if (typeIdx >= 3) {
    // Standard layout: [0]=Logged_At, [1]=Tx_Date, [2]=Tx_Time
    txDate = normalizeDate_(row[1]) || normalizeDate_(row[0]);
    txTime = normalizeTime_(row[2]) || extractTimeFromLoggedAt_(row[0]);
  } else if (typeIdx === 2) {
    // Either [0]=Logged_At, [1]=Tx_Date OR [0]=Tx_Date, [1]=Tx_Time
    const d1 = normalizeDate_(row[1]);
    const d0 = normalizeDate_(row[0]);
    if (d1) {
      txDate = d1;
      txTime = extractTimeFromLoggedAt_(row[0]);
    } else {
      txDate = d0;
      txTime = normalizeTime_(row[1]) || extractTimeFromLoggedAt_(row[0]);
    }
  } else if (typeIdx === 1) {
    // Shifted row: [0]=Tx_Date (YYYY-MM-DD), [1]=Type (Expense)
    txDate = normalizeDate_(row[0]);
    txTime = extractTimeFromLoggedAt_(row[0]);
  } else {
    // Fallback if Type is at 0: look ahead for date if any
    for (let k = 0; k < row.length; k++) {
      const d = normalizeDate_(row[k]);
      if (d) {
        txDate = d;
        break;
      }
    }
  }

  if (!txDate) {
    return null;
  }

  // Step 3: Extract Amount (immediately after Type at typeIdx + 1)
  const amount = normalizeNumber_(row[typeIdx + 1]);
  if (amount <= 0) {
    return null;
  }

  // Step 4: Extract Main_Category, Sub_Category, Description, Payment_Method relative to typeIdx
  const rawMainCat = row[typeIdx + 2];
  const rawSubCat = row[typeIdx + 3];
  const rawDesc = row[typeIdx + 4];
  const rawPayMethod = row[typeIdx + 5];

  const mainCat = normalizeMainCategory_(rawMainCat, normalizedType);
  let subCat = String(rawSubCat ?? '').trim();
  let desc = String(rawDesc ?? '').trim();
  let payMethod = normalizePaymentMethod_(rawPayMethod);

  // Defensive check for shifted rows where Payment_Method might have landed in desc or subCat slot
  if (payMethod === 'Unknown') {
    const descAsPay = matchKnownPaymentMethodOnly_(rawDesc);
    if (descAsPay) {
      payMethod = descAsPay;
      desc = '';
    } else {
      const subAsPay = matchKnownPaymentMethodOnly_(rawSubCat);
      if (subAsPay && !rawDesc) {
        payMethod = subAsPay;
        subCat = '';
      }
    }
  }

  const period = txDate.slice(0, 7);

  return {
    id: 'OUT-' + sheetRow,
    sheetRow: sheetRow,
    source: 'Outcome',
    date: txDate,
    period: period,
    time: txTime || '00:00',
    type: normalizedType,
    amount: round2_(amount),
    mainCat: mainCat,
    subCat: subCat || (normalizedType === 'Transfer' ? 'Investment' : mainCat),
    desc: desc || subCat || mainCat,
    payMethod: payMethod,
    wasShifted: wasShifted
  };
}

/**
 * Parses a single row from the Income sheet (9 columns).
 * Schema:
 * [0] Logged_At, [1] Received_Date, [2] Period (YYYY-MM), [3] Source,
 * [4] Income_Type, [5] Amount, [6] Payment_Method, [7] Description_Detail, [8] Raw_Input
 *
 * @param {Array<*>} row
 * @param {number} sheetRow
 * @return {Object|null}
 */
function parseIncomeRow_(row, sheetRow) {
  if (!Array.isArray(row) || row.length < 6) return null;

  const date = normalizeDate_(row[1]) || normalizeDate_(row[0]);
  if (!date) return null;

  const amount = normalizeNumber_(row[5]);
  if (amount <= 0) return null;

  const period = normalizePeriod_(row[2], date);
  const incomeSource = String(row[3] ?? '').trim();
  const incomeType = String(row[4] ?? '').trim() || 'อื่นๆ';
  const payMethod = normalizePaymentMethod_(row[6]);
  const descDetail = String(row[7] ?? '').trim();

  const descParts = [];
  if (incomeSource) descParts.push(incomeSource);
  if (descDetail) descParts.push(descDetail);
  const desc = descParts.join(' • ') || incomeType;

  return {
    id: 'INC-' + sheetRow,
    sheetRow: sheetRow,
    source: 'Income',
    date: date,
    period: period,
    time: extractTimeFromLoggedAt_(row[0]) || '09:00',
    type: 'Income',
    amount: round2_(amount),
    mainCat: 'Income',
    subCat: incomeType,
    incomeSource: incomeSource,
    desc: desc,
    payMethod: payMethod,
    wasShifted: false
  };
}

/**
 * Parses a single row from Subscription_Master (14 columns).
 * Schema:
 * [0] Service_Name, [1] Platform, [2] Category, [3] Cycle, [4] Billing_Day,
 * [5] Amount, [6] Currency, [7] Amount_THB_Est, [8] Payment_Method,
 * [9] Start_Date, [10] Duration_Months, [11] Status, [12] Auto_Renew, [13] Notes
 *
 * @param {Array<*>} row
 * @param {number} sheetRow
 * @param {string} todayStr
 * @return {Object|null}
 */
function parseSubscriptionRow_(row, sheetRow, todayStr) {
  if (!Array.isArray(row)) return null;
  const serviceName = String(row[0] ?? '').trim();
  if (!serviceName) return null;

  const platform = String(row[1] ?? '').trim();
  const category = String(row[2] ?? '').trim() || 'Subscription';
  const cycle = String(row[3] ?? '').trim() || 'Monthly';
  const billingDayRaw = parseInt(String(row[4] ?? '').replace(/[^\d]/g, ''), 10);
  const billingDay = Number.isFinite(billingDayRaw) && billingDayRaw >= 1 && billingDayRaw <= 31
    ? billingDayRaw
    : null;

  const amountOrig = normalizeNumber_(row[5]);
  const currency = String(row[6] ?? 'THB').trim().toUpperCase() || 'THB';
  const amountTHBEstRaw = normalizeNumber_(row[7]);
  const amountTHBEst = amountTHBEstRaw > 0
    ? amountTHBEstRaw
    : (currency === 'THB' ? amountOrig : amountOrig);

  const payMethod = normalizePaymentMethod_(row[8]);
  const startDate = normalizeDate_(row[9]);
  const durationMonths = normalizeNumber_(row[10]);

  const rawStatus = String(row[11] ?? 'Active').trim().toLowerCase();
  let status = 'Active';
  if (rawStatus === 'paused' || rawStatus === 'ระงับชั่วคราว') {
    status = 'Paused';
  } else if (rawStatus === 'cancelled' || rawStatus === 'canceled' || rawStatus === 'ยกเลิก') {
    status = 'Cancelled';
  }

  const autoRenewRaw = String(row[12] ?? '').trim().toLowerCase();
  const autoRenew = autoRenewRaw === 'true' || autoRenewRaw === 'yes' || autoRenewRaw === '1' || row[12] === true;
  const notes = String(row[13] ?? '').trim();

  const billingInfo = computeDaysUntilBilling_(billingDay, todayStr);

  return {
    id: 'SUB-' + sheetRow,
    sheetRow: sheetRow,
    serviceName: serviceName,
    platform: platform,
    category: category,
    cycle: cycle,
    billingDay: billingDay,
    amount: round2_(amountOrig),
    currency: currency,
    amountTHBEst: round2_(amountTHBEst),
    payMethod: payMethod,
    startDate: startDate,
    durationMonths: durationMonths,
    status: status,
    autoRenew: autoRenew,
    notes: notes,
    daysUntilBilling: billingInfo.daysUntil,
    nextBillingDate: billingInfo.nextDate,
    isDueSoon: status === 'Active' && billingInfo.daysUntil !== null && billingInfo.daysUntil <= 7
  };
}

/**
 * Builds monthly & overall summaries for Finance Dashboard.
 * @param {Array<Object>} transactions
 * @param {Array<string>} availableMonths
 * @param {number} activeSubscriptionBurn
 * @return {Object}
 */
function buildFinanceMonthlySummaries_(transactions, availableMonths, activeSubscriptionBurn) {
  const summaries = {};
  const keysToBuild = ['ALL'].concat(availableMonths);

  for (let k = 0; k < keysToBuild.length; k++) {
    const periodKey = keysToBuild[k];
    summaries[periodKey] = {
      period: periodKey,
      income: 0,
      expense: 0,
      investmentTransfer: 0,
      netCashflow: 0,
      budgetTarget: APP_CONFIG.TARGETS.MONTHLY_BUDGET_THB,
      budgetRemaining: APP_CONFIG.TARGETS.MONTHLY_BUDGET_THB,
      budgetUsedPct: 0,
      activeSubscriptionBurn: round2_(activeSubscriptionBurn),
      foodExpense: 0,
      txCount: 0,
      expenseTxCount: 0,
      byCategory: {},
      bySubCategory: {},
      byPaymentMethod: {},
      dailyMap: {}
    };
  }

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    const targets = ['ALL'];
    if (tx.period && summaries[tx.period]) {
      targets.push(tx.period);
    }

    for (let t = 0; t < targets.length; t++) {
      const key = targets[t];
      const s = summaries[key];
      s.txCount++;

      if (!s.dailyMap[tx.date]) {
        s.dailyMap[tx.date] = { date: tx.date, income: 0, expense: 0, transfer: 0, foodExpense: 0 };
      }

      if (tx.type === 'Income') {
        s.income += tx.amount;
        s.dailyMap[tx.date].income += tx.amount;
      } else if (tx.type === 'Expense') {
        s.expense += tx.amount;
        s.expenseTxCount++;
        s.dailyMap[tx.date].expense += tx.amount;

        if (tx.mainCat === 'Food & Drink') {
          s.foodExpense += tx.amount;
          s.dailyMap[tx.date].foodExpense += tx.amount;
        }
        if (tx.mainCat === 'Investment Transfer') {
          s.investmentTransfer += tx.amount;
        }

        // Category aggregation
        if (!s.byCategory[tx.mainCat]) {
          s.byCategory[tx.mainCat] = { count: 0, amount: 0 };
        }
        s.byCategory[tx.mainCat].count++;
        s.byCategory[tx.mainCat].amount = round2_(s.byCategory[tx.mainCat].amount + tx.amount);

        // Sub-category drilldown
        if (!s.bySubCategory[tx.mainCat]) {
          s.bySubCategory[tx.mainCat] = {};
        }
        const subKey = tx.subCat || 'ไม่ระบุหมวดย่อย';
        if (!s.bySubCategory[tx.mainCat][subKey]) {
          s.bySubCategory[tx.mainCat][subKey] = { count: 0, amount: 0 };
        }
        s.bySubCategory[tx.mainCat][subKey].count++;
        s.bySubCategory[tx.mainCat][subKey].amount = round2_(
          s.bySubCategory[tx.mainCat][subKey].amount + tx.amount
        );

        // Payment Method aggregation (for Expense + Transfer)
        const pm = tx.payMethod || 'Unknown';
        if (!s.byPaymentMethod[pm]) {
          s.byPaymentMethod[pm] = { count: 0, amount: 0 };
        }
        s.byPaymentMethod[pm].count++;
        s.byPaymentMethod[pm].amount = round2_(s.byPaymentMethod[pm].amount + tx.amount);
      } else if (tx.type === 'Transfer') {
        s.investmentTransfer += tx.amount;
        s.dailyMap[tx.date].transfer += tx.amount;

        if (!s.byCategory['Investment Transfer']) {
          s.byCategory['Investment Transfer'] = { count: 0, amount: 0 };
        }
        s.byCategory['Investment Transfer'].count++;
        s.byCategory['Investment Transfer'].amount = round2_(
          s.byCategory['Investment Transfer'].amount + tx.amount
        );
      }
    }
  }

  // Finalize numbers & daily series
  for (let k = 0; k < keysToBuild.length; k++) {
    const key = keysToBuild[k];
    const s = summaries[key];
    s.income = round2_(s.income);
    s.expense = round2_(s.expense);
    s.investmentTransfer = round2_(s.investmentTransfer);
    s.foodExpense = round2_(s.foodExpense);
    s.netCashflow = round2_(s.income - s.expense);
    s.budgetRemaining = round2_(APP_CONFIG.TARGETS.MONTHLY_BUDGET_THB - s.expense);
    s.budgetUsedPct = round2_((s.expense / APP_CONFIG.TARGETS.MONTHLY_BUDGET_THB) * 100);

    const sortedDates = Object.keys(s.dailyMap).sort();
    s.dailySeries = sortedDates.map(function(d) {
      const item = s.dailyMap[d];
      return {
        date: item.date,
        income: round2_(item.income),
        expense: round2_(item.expense),
        transfer: round2_(item.transfer),
        foodExpense: round2_(item.foodExpense)
      };
    });
    delete s.dailyMap;
  }

  return summaries;
}

/* ==========================================================================
 * 2. FOOD & BODY SPREADSHEET PARSER (Food_Log, Body_Workout_Log)
 * ========================================================================== */

/**
 * Parses Daily_Food tabs with strict same-day (Date + Meal_Type + Food_Items) deduplication.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {string} todayStr
 * @return {Object}
 */
function parseFoodSpreadsheet_(ss, todayStr) {
  const meals = [];
  const bodyWorkouts = [];
  const seenMealKeys = {};
  const duplicateOffsetsByDate = {};

  const stats = {
    foodRawRows: 0,
    foodUniqueRows: 0,
    foodDuplicatesRemoved: 0,
    bodyWorkoutRows: 0
  };

  // --- 2A. Parse Food_Log (14 columns) with Deduplication Rule ---
  const foodSheet = ss.getSheetByName(APP_CONFIG.SHEETS.FOOD_LOG);
  if (foodSheet) {
    const lastRow = foodSheet.getLastRow();
    const lastCol = Math.max(14, foodSheet.getLastColumn());
    if (lastRow > 1) {
      stats.foodRawRows = lastRow - 1;
      const values = foodSheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

      for (let i = 0; i < values.length; i++) {
        const row = values[i];
        const sheetRow = i + 2;
        const date = normalizeDate_(row[1]) || normalizeDate_(row[0]);
        if (!date) continue;

        const mealType = normalizeMealType_(row[2]);
        const foodItems = String(row[3] ?? '').trim();
        if (!foodItems) continue;

        const portion = String(row[4] ?? '').trim();
        const calLow = normalizeNumber_(row[5]);
        const calHighRaw = normalizeNumber_(row[6]);
        const calHigh = calHighRaw > 0 ? calHighRaw : calLow;
        const calMid = round1_((calLow + calHigh) / 2);
        const proteinG = round1_(normalizeNumber_(row[7]));
        const carbsG = round1_(normalizeNumber_(row[8]));
        const vegFruit = round1_(normalizeNumber_(row[9]));
        const flags = parseNutritionFlags_(row[10]);
        const confidence = normalizeConfidence_(row[11]);
        const uncertainty = String(row[12] ?? '').trim();
        const loggedTime = extractTimeFromLoggedAt_(row[0]);

        // Deduplication Rule: exact same Date + Meal_Type + Food_Items on the same day
        const dedupKey = [
          date,
          mealType.toLowerCase(),
          foodItems.toLowerCase().replace(/\s+/g, ' ')
        ].join('||');

        if (seenMealKeys[dedupKey]) {
          stats.foodDuplicatesRemoved++;
          if (!duplicateOffsetsByDate[date]) {
            duplicateOffsetsByDate[date] = {
              count: 0,
              calLow: 0,
              calHigh: 0,
              proteinG: 0,
              carbsG: 0,
              vegFruit: 0
            };
          }
          duplicateOffsetsByDate[date].count++;
          duplicateOffsetsByDate[date].calLow += calLow;
          duplicateOffsetsByDate[date].calHigh += calHigh;
          duplicateOffsetsByDate[date].proteinG += proteinG;
          duplicateOffsetsByDate[date].carbsG += carbsG;
          duplicateOffsetsByDate[date].vegFruit += vegFruit;
          continue;
        }
        seenMealKeys[dedupKey] = true;
        stats.foodUniqueRows++;

        meals.push({
          id: 'FOOD-' + sheetRow,
          sheetRow: sheetRow,
          date: date,
          time: loggedTime || '',
          mealType: mealType,
          foodItems: foodItems,
          portion: portion,
          calLow: round1_(calLow),
          calHigh: round1_(calHigh),
          calMid: calMid,
          proteinG: proteinG,
          carbsG: carbsG,
          vegFruit: vegFruit,
          flags: flags,
          hasWarningFlag: flags.length > 0,
          confidence: confidence,
          uncertainty: uncertainty
        });
      }
    }
  }

  // --- 2B. Parse Body_Workout_Log (9 columns) ---
  const bodySheet = ss.getSheetByName(APP_CONFIG.SHEETS.BODY_WORKOUT_LOG);
  if (bodySheet) {
    const lastRow = bodySheet.getLastRow();
    const lastCol = Math.max(9, bodySheet.getLastColumn());
    if (lastRow > 1) {
      const values = bodySheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
      for (let i = 0; i < values.length; i++) {
        const row = values[i];
        const sheetRow = i + 2;
        const date = normalizeDate_(row[1]) || normalizeDate_(row[0]);
        if (!date) continue;

        const weightKg = normalizeNullableNumber_(row[2]);
        const waistCm = normalizeNullableNumber_(row[3]);
        const workoutType = String(row[4] ?? '').trim() || 'Rest';
        const durationMin = normalizeNumber_(row[5]);
        const intensity = String(row[6] ?? '').trim();
        const estBurnKcal = normalizeNumber_(row[7]);
        const notes = String(row[8] ?? '').trim();

        stats.bodyWorkoutRows++;
        bodyWorkouts.push({
          id: 'BODY-' + sheetRow,
          sheetRow: sheetRow,
          date: date,
          time: extractTimeFromLoggedAt_(row[0]) || '',
          weightKg: weightKg !== null ? round1_(weightKg) : null,
          waistCm: waistCm !== null ? round1_(waistCm) : null,
          workoutType: workoutType,
          durationMin: round1_(durationMin),
          intensity: intensity,
          estBurnKcal: round1_(estBurnKcal),
          notes: notes
        });
      }
    }
  }

  // Sort meals and workouts newest first
  meals.sort(function(a, b) {
    const keyA = a.date + ' ' + (a.time || '00:00') + ' ' + a.id;
    const keyB = b.date + ' ' + (b.time || '00:00') + ' ' + b.id;
    return keyB.localeCompare(keyA);
  });

  bodyWorkouts.sort(function(a, b) {
    return b.date.localeCompare(a.date);
  });

  // Build Daily Summaries across all dates present in Food_Log or Body_Workout_Log
  const dailyMap = {};
  function ensureDay_(d) {
    if (!dailyMap[d]) {
      dailyMap[d] = {
        date: d,
        mealCount: 0,
        calLow: 0,
        calHigh: 0,
        calMid: 0,
        proteinG: 0,
        carbsG: 0,
        vegFruit: 0,
        warningMealCount: 0,
        flagsBreakdown: {
          'sugary drink': 0,
          'fried food': 0,
          'highly processed food': 0,
          'dessert / high added sugar': 0
        },
        byMealType: {},
        weightKg: null,
        waistCm: null,
        workoutDurationMin: 0,
        workoutBurnKcal: 0,
        workoutTypes: []
      };
    }
    return dailyMap[d];
  }

  for (let i = 0; i < meals.length; i++) {
    const m = meals[i];
    const day = ensureDay_(m.date);
    day.mealCount++;
    day.calLow += m.calLow;
    day.calHigh += m.calHigh;
    day.calMid += m.calMid;
    day.proteinG += m.proteinG;
    day.carbsG += m.carbsG;
    day.vegFruit += m.vegFruit;

    if (m.flags.length > 0) {
      day.warningMealCount++;
      for (let f = 0; f < m.flags.length; f++) {
        const flagName = m.flags[f];
        day.flagsBreakdown[flagName] = (day.flagsBreakdown[flagName] ?? 0) + 1;
      }
    }

    if (!day.byMealType[m.mealType]) {
      day.byMealType[m.mealType] = { count: 0, calMid: 0, proteinG: 0, carbsG: 0 };
    }
    day.byMealType[m.mealType].count++;
    day.byMealType[m.mealType].calMid = round1_(day.byMealType[m.mealType].calMid + m.calMid);
    day.byMealType[m.mealType].proteinG = round1_(day.byMealType[m.mealType].proteinG + m.proteinG);
    day.byMealType[m.mealType].carbsG = round1_(day.byMealType[m.mealType].carbsG + m.carbsG);
  }

  for (let i = 0; i < bodyWorkouts.length; i++) {
    const bw = bodyWorkouts[i];
    const day = ensureDay_(bw.date);
    if (bw.weightKg !== null && day.weightKg === null) {
      day.weightKg = bw.weightKg;
    }
    if (bw.waistCm !== null && day.waistCm === null) {
      day.waistCm = bw.waistCm;
    }
    day.workoutDurationMin = round1_(day.workoutDurationMin + bw.durationMin);
    day.workoutBurnKcal = round1_(day.workoutBurnKcal + bw.estBurnKcal);
    if (bw.workoutType && bw.workoutType.toLowerCase() !== 'rest') {
      if (day.workoutTypes.indexOf(bw.workoutType) === -1) {
        day.workoutTypes.push(bw.workoutType);
      }
    }
  }

  const availableDates = Object.keys(dailyMap).sort().reverse();
  const latestDate = availableDates.length > 0 ? availableDates[0] : todayStr;

  const dailySummaries = availableDates.map(function(d) {
    const item = dailyMap[d];
    item.calLow = round1_(item.calLow);
    item.calHigh = round1_(item.calHigh);
    item.calMid = round1_((item.calLow + item.calHigh) / 2);
    item.proteinG = round1_(item.proteinG);
    item.carbsG = round1_(item.carbsG);
    item.vegFruit = round1_(item.vegFruit);

    // Target evaluation
    if (item.proteinG >= APP_CONFIG.TARGETS.PROTEIN_G) {
      item.proteinStatus = 'green';
      item.proteinBadge = '>= 115g';
    } else if (item.proteinG >= APP_CONFIG.TARGETS.PROTEIN_WARN_G) {
      item.proteinStatus = 'yellow';
      item.proteinBadge = '85-114g';
    } else {
      item.proteinStatus = 'red';
      item.proteinBadge = '< 85g';
    }

    if (item.calMid >= APP_CONFIG.TARGETS.CALORIE_LOW && item.calMid <= APP_CONFIG.TARGETS.CALORIE_HIGH) {
      item.calorieStatus = 'optimal';
    } else if (item.calMid < APP_CONFIG.TARGETS.CALORIE_LOW) {
      item.calorieStatus = 'under';
    } else {
      item.calorieStatus = 'over';
    }

    item.vegStatus = item.vegFruit >= APP_CONFIG.TARGETS.VEG_FRUIT_PORTIONS ? 'green' : 'red';
    return item;
  });

  return {
    meals: meals,
    bodyWorkouts: bodyWorkouts,
    dailySummaries: dailySummaries,
    availableDates: availableDates,
    latestDate: latestDate,
    duplicateOffsetsByDate: duplicateOffsetsByDate,
    stats: stats
  };
}

/* ==========================================================================
 * 3. CROSS-INSIGHTS ENGINE (Finance x Nutrition)
 * ========================================================================== */

/**
 * Computes executive cross-insights connecting Food & Drink spending with Protein & Calorie intake.
 * @param {Object} finance
 * @param {Object} nutrition
 * @param {string} currentMonthStr
 * @return {Object}
 */
function computeCrossInsights_(finance, nutrition, currentMonthStr) {
  const activeMonth = finance.monthlySummaries[currentMonthStr] &&
    finance.monthlySummaries[currentMonthStr].txCount > 0
      ? currentMonthStr
      : finance.latestMonth;

  // Map daily Food & Drink spending by date
  const foodSpendByDate = {};
  const foodTxCountByDate = {};
  let totalFoodSpendAll = 0;
  let totalFoodTxAll = 0;

  for (let i = 0; i < finance.transactions.length; i++) {
    const tx = finance.transactions[i];
    if (tx.type === 'Expense' && tx.mainCat === 'Food & Drink') {
      foodSpendByDate[tx.date] = round2_((foodSpendByDate[tx.date] ?? 0) + tx.amount);
      foodTxCountByDate[tx.date] = (foodTxCountByDate[tx.date] ?? 0) + 1;
      totalFoodSpendAll += tx.amount;
      totalFoodTxAll++;
    }
  }

  // Map daily nutrition by date
  const nutByDate = {};
  let totalProteinAll = 0;
  let totalCalMidAll = 0;
  let totalMealsAll = 0;

  for (let i = 0; i < nutrition.dailySummaries.length; i++) {
    const ds = nutrition.dailySummaries[i];
    if (ds.mealCount > 0) {
      nutByDate[ds.date] = ds;
      totalProteinAll += ds.proteinG;
      totalCalMidAll += ds.calMid;
      totalMealsAll += ds.mealCount;
    }
  }

  // Build unified daily correlation series (all dates where either Food Spend or Meal Log exists)
  const unionDateSet = {};
  Object.keys(foodSpendByDate).forEach(function(d) { unionDateSet[d] = true; });
  Object.keys(nutByDate).forEach(function(d) { unionDateSet[d] = true; });
  const sortedDates = Object.keys(unionDateSet).sort();

  let overlapDays = 0;
  let overlapFoodSpend = 0;
  let overlapProteinG = 0;
  let overlapCalMid = 0;
  let overlapMeals = 0;

  const dailyCorrelation = sortedDates.map(function(d) {
    const spend = round2_(foodSpendByDate[d] ?? 0);
    const nut = nutByDate[d];
    const proteinG = nut ? nut.proteinG : 0;
    const calMid = nut ? nut.calMid : 0;
    const mealCount = nut ? nut.mealCount : 0;
    const warningMealCount = nut ? nut.warningMealCount : 0;

    if (spend > 0 && proteinG > 0) {
      overlapDays++;
      overlapFoodSpend += spend;
      overlapProteinG += proteinG;
      overlapCalMid += calMid;
      overlapMeals += mealCount;
    }

    return {
      date: d,
      period: d.slice(0, 7),
      foodSpendTHB: spend,
      foodTxCount: foodTxCountByDate[d] ?? 0,
      proteinG: proteinG,
      calMid: calMid,
      mealCount: mealCount,
      warningMealCount: warningMealCount,
      thbPerGramProtein: spend > 0 && proteinG > 0 ? round2_(spend / proteinG) : null
    };
  });

  // Calculate THB per gram of Protein (prefer overlapping days if >= 1, with overall fallback)
  const effectiveSpend = overlapDays > 0 ? overlapFoodSpend : totalFoodSpendAll;
  const effectiveProtein = overlapDays > 0 ? overlapProteinG : totalProteinAll;
  const effectiveCalMid = overlapDays > 0 ? overlapCalMid : totalCalMidAll;

  const thbPerGramProtein = effectiveProtein > 0
    ? round2_(effectiveSpend / effectiveProtein)
    : 0;
  const kcalPerTHB = effectiveSpend > 0
    ? round1_(effectiveCalMid / effectiveSpend)
    : 0;

  const foodSpendDaysCount = Object.keys(foodSpendByDate).length;
  const avgDailyFoodSpend = foodSpendDaysCount > 0
    ? round2_(totalFoodSpendAll / foodSpendDaysCount)
    : 0;
  const avgSpendPerMeal = totalMealsAll > 0
    ? round2_(totalFoodSpendAll / totalMealsAll)
    : (totalFoodTxAll > 0 ? round2_(totalFoodSpendAll / totalFoodTxAll) : 0);

  return {
    activeMonth: activeMonth,
    totalFoodSpendTHB: round2_(totalFoodSpendAll),
    avgDailyFoodSpendTHB: avgDailyFoodSpend,
    avgSpendPerMealTHB: avgSpendPerMeal,
    totalProteinG: round1_(totalProteinAll),
    thbPerGramProtein: thbPerGramProtein,
    kcalPerTHB: kcalPerTHB,
    overlapDaysCount: overlapDays,
    foodSpendDaysCount: foodSpendDaysCount,
    nutritionDaysCount: Object.keys(nutByDate).length,
    dailyCorrelation: dailyCorrelation
  };
}

/* ==========================================================================
 * 4. NORMALIZATION & DATE/TIME HELPER FUNCTIONS
 * ========================================================================== */

/**
 * Detects transaction type from cell value.
 * @param {*} val
 * @return {string} 'Expense' | 'Income' | 'Transfer' | ''
 */
function detectTxType_(val) {
  if (val == null || val === '') return '';
  const s = String(val).trim().toLowerCase();
  if (s === 'expense' || s === 'รายจ่าย' || s === 'outcome') return 'Expense';
  if (s === 'income' || s === 'รายรับ') return 'Income';
  if (s === 'transfer' || s === 'โอน' || s === 'investment transfer') return 'Transfer';
  return '';
}

/**
 * Normalizes Main_Category according to Data Cleaning Rules:
 * - "Others" -> "Other Expense"
 * @param {*} val
 * @param {string} txType
 * @return {string}
 */
function normalizeMainCategory_(val, txType) {
  const raw = String(val ?? '').trim();
  if (!raw) {
    if (txType === 'Income') return 'Income';
    if (txType === 'Transfer') return 'Investment Transfer';
    return 'Other Expense';
  }
  const lower = raw.toLowerCase();
  if (KNOWN_MAIN_CATEGORIES_MAP[lower]) {
    return KNOWN_MAIN_CATEGORIES_MAP[lower];
  }
  return raw;
}

/**
 * Normalizes Payment_Method according to Data Cleaning Rules:
 * - "เป๋าตัง" -> "เป๋าตัง (G-Wallet)"
 * @param {*} val
 * @return {string}
 */
function normalizePaymentMethod_(val) {
  const raw = String(val ?? '').trim();
  if (!raw) return 'Unknown';
  const lower = raw.toLowerCase();
  if (KNOWN_PAYMENT_METHODS_MAP[lower]) {
    return KNOWN_PAYMENT_METHODS_MAP[lower];
  }
  if (lower.indexOf('เป๋าตัง') !== -1 || lower.indexOf('g-wallet') !== -1) {
    return 'เป๋าตัง (G-Wallet)';
  }
  return raw;
}

/**
 * Checks if a raw cell string strictly matches a known payment method.
 * @param {*} val
 * @return {string}
 */
function matchKnownPaymentMethodOnly_(val) {
  const raw = String(val ?? '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (KNOWN_PAYMENT_METHODS_MAP[lower]) {
    return KNOWN_PAYMENT_METHODS_MAP[lower];
  }
  if (lower.indexOf('เป๋าตัง') !== -1 || lower.indexOf('g-wallet') !== -1) {
    return 'เป๋าตัง (G-Wallet)';
  }
  return '';
}

/**
 * Normalizes Meal_Type string.
 * @param {*} val
 * @return {string}
 */
function normalizeMealType_(val) {
  const raw = String(val ?? '').trim();
  if (!raw) return 'Snack';
  const lower = raw.toLowerCase();
  for (let i = 0; i < STANDARD_MEAL_TYPES.length; i++) {
    if (STANDARD_MEAL_TYPES[i].toLowerCase() === lower) {
      return STANDARD_MEAL_TYPES[i];
    }
  }
  return raw;
}

/**
 * Parses comma-separated Nutrition_Flags and filters out 'none'.
 * @param {*} val
 * @return {Array<string>}
 */
function parseNutritionFlags_(val) {
  const raw = String(val ?? '').trim();
  if (!raw) return [];
  const parts = raw.split(',');
  const result = [];
  for (let i = 0; i < parts.length; i++) {
    const f = parts[i].trim().toLowerCase();
    if (!f || f === 'none' || f === '-' || f === 'n/a') continue;
    if (f.indexOf('sugary') !== -1) {
      if (result.indexOf('sugary drink') === -1) result.push('sugary drink');
    } else if (f.indexOf('fried') !== -1) {
      if (result.indexOf('fried food') === -1) result.push('fried food');
    } else if (f.indexOf('processed') !== -1) {
      if (result.indexOf('highly processed food') === -1) result.push('highly processed food');
    } else if (f.indexOf('dessert') !== -1 || f.indexOf('added sugar') !== -1) {
      if (result.indexOf('dessert / high added sugar') === -1) result.push('dessert / high added sugar');
    } else {
      if (result.indexOf(f) === -1) result.push(f);
    }
  }
  return result;
}

/**
 * Normalizes Confidence ('High' | 'Medium' | 'Low').
 * @param {*} val
 * @return {string}
 */
function normalizeConfidence_(val) {
  const s = String(val ?? '').trim().toLowerCase();
  if (s === 'high' || s === 'สูง') return 'High';
  if (s === 'low' || s === 'ต่ำ') return 'Low';
  return 'Medium';
}

/**
 * Normalizes a Date or date string into 'yyyy-MM-dd'.
 * @param {*} value
 * @return {string}
 */
function normalizeDate_(value) {
  if (value == null || value === '') return '';

  if (value instanceof Date && !isNaN(value.getTime())) {
    let year = Number(Utilities.formatDate(value, APP_CONFIG.TIMEZONE, 'yyyy'));
    if (year > 2400) {
      const adjusted = new Date(value.getTime());
      adjusted.setFullYear(adjusted.getFullYear() - 543);
      return Utilities.formatDate(adjusted, APP_CONFIG.TIMEZONE, 'yyyy-MM-dd');
    }
    return Utilities.formatDate(value, APP_CONFIG.TIMEZONE, 'yyyy-MM-dd');
  }

  const text = String(value).trim();

  // yyyy-MM-dd or yyyy/MM/dd (with optional timestamp)
  let match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T].*)?$/);
  if (match) {
    let year = Number(match[1]);
    if (year > 2400) year -= 543;
    const month = String(match[2]).padStart(2, '0');
    const day = String(match[3]).padStart(2, '0');
    if (Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 && Number(day) <= 31) {
      return year + '-' + month + '-' + day;
    }
  }

  // dd/MM/yyyy or dd-MM-yyyy
  match = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T].*)?$/);
  if (match) {
    let year = Number(match[3]);
    if (year > 2400) year -= 543;
    const month = String(match[2]).padStart(2, '0');
    const day = String(match[1]).padStart(2, '0');
    if (Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 && Number(day) <= 31) {
      return year + '-' + month + '-' + day;
    }
  }

  return '';
}

/**
 * Normalizes a Period cell ('YYYY-MM' or Date object) with fallback to date.slice(0, 7).
 * @param {*} value
 * @param {string} fallbackDate
 * @return {string}
 */
function normalizePeriod_(value, fallbackDate) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, APP_CONFIG.TIMEZONE, 'yyyy-MM');
  }
  const text = String(value ?? '').trim();
  const match = text.match(/^(\d{4})-(\d{1,2})$/);
  if (match) {
    return match[1] + '-' + String(match[2]).padStart(2, '0');
  }
  if (fallbackDate && fallbackDate.length >= 7) {
    return fallbackDate.slice(0, 7);
  }
  return '';
}

/**
 * Normalizes time cell or timestamp to 'HH:mm'.
 * @param {*} value
 * @return {string}
 */
function normalizeTime_(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, APP_CONFIG.TIMEZONE, 'HH:mm');
  }
  const text = String(value).trim();
  const match = text.match(/(\d{1,2}):(\d{2})/);
  if (!match) return '';
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  }
  return '';
}

/**
 * Extracts 'HH:mm' from a Logged_At timestamp.
 * @param {*} value
 * @return {string}
 */
function extractTimeFromLoggedAt_(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, APP_CONFIG.TIMEZONE, 'HH:mm');
  }
  const text = String(value).trim();
  const match = text.match(/[ T](\d{1,2}):(\d{2})/);
  if (match) {
    return String(match[1]).padStart(2, '0') + ':' + match[2];
  }
  return '';
}

/**
 * Converts numeric or currency-formatted string to non-negative number.
 * @param {*} value
 * @return {number}
 */
function normalizeNumber_(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.abs(value) : 0;
  }
  const cleaned = String(value)
    .replace(/,/g, '')
    .replace(/฿/g, '')
    .replace(/THB/gi, '')
    .replace(/บาท/g, '')
    .replace(/kcal/gi, '')
    .replace(/\s+/g, '')
    .trim();
  const num = Number(cleaned);
  return Number.isFinite(num) ? Math.abs(num) : 0;
}

/**
 * Converts optional measurement cell to number or null if empty/zero.
 * Used for Weight_kg and Waist_cm so blank cells do not plot as 0.
 * @param {*} value
 * @return {number|null}
 */
function normalizeNullableNumber_(value) {
  if (value == null || value === '' || value === '-') return null;
  const num = normalizeNumber_(value);
  return num > 0 ? num : null;
}

/**
 * Computes days until next billing day from todayStr ('YYYY-MM-DD').
 * @param {number|null} billingDay
 * @param {string} todayStr
 * @return {{daysUntil: number|null, nextDate: string}}
 */
function computeDaysUntilBilling_(billingDay, todayStr) {
  if (billingDay === null || !todayStr) {
    return { daysUntil: null, nextDate: '' };
  }
  const parts = todayStr.split('-');
  const yr = Number(parts[0]);
  const mo = Number(parts[1]) - 1;
  const dy = Number(parts[2]);

  const todayDate = new Date(yr, mo, dy);
  const maxDayCurrentMonth = new Date(yr, mo + 1, 0).getDate();
  let targetDate = new Date(yr, mo, Math.min(billingDay, maxDayCurrentMonth));

  if (targetDate.getTime() < todayDate.getTime()) {
    const maxDayNextMonth = new Date(yr, mo + 2, 0).getDate();
    targetDate = new Date(yr, mo + 1, Math.min(billingDay, maxDayNextMonth));
  }

  const diffMs = targetDate.getTime() - todayDate.getTime();
  const daysUntil = Math.round(diffMs / (1000 * 60 * 60 * 24));
  const nextDateStr = [
    targetDate.getFullYear(),
    String(targetDate.getMonth() + 1).padStart(2, '0'),
    String(targetDate.getDate()).padStart(2, '0')
  ].join('-');

  return {
    daysUntil: daysUntil,
    nextDate: nextDateStr
  };
}

function round2_(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function round1_(n) {
  return Math.round((Number(n) || 0) * 10) / 10;
}
