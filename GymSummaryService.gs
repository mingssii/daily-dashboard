/**
 * Unified Personal Life Dashboard
 * File: GymSummaryService.gs
 * READ-ONLY summary of the standalone Gym Tracker spreadsheet (Session_Log, Workout_Log, Body_Progress).
 * All workout mutations (saveExerciseLog, completeWorkout) stay in the standalone Gym App — this file never writes.
 */

/**
 * Builds the Gym & Recovery summary. Never throws: failures return { available: false } so the
 * rest of the dashboard still renders.
 * @param {string} todayStr 'yyyy-MM-dd'
 * @param {Object} nutritionResult Output of parseFoodSpreadsheet_ (Daily_Food)
 * @return {Object}
 */
function buildGymSummary_(todayStr, nutritionResult) {
  const appUrl = getGymAppUrl_();
  const fuel = buildGymFuelCheck_(todayStr, nutritionResult);
  const gymId = getSpreadsheetIds_().gymSpreadsheetId;

  if (!gymId || gymId.indexOf('YOUR_') !== -1) {
    return { available: false, reason: 'not_configured', appUrl: appUrl, fuel: fuel };
  }

  try {
    const ss = SpreadsheetApp.openById(gymId);
    const profileMap = readProfileMap_(ss);
    const sessions = readSheetObjects_(ss, APP_CONFIG.SHEETS.GYM_SESSIONS);
    const workoutRows = readSheetObjects_(ss, APP_CONFIG.SHEETS.GYM_WORKOUT_LOG);
    const bodyRows = readSheetObjects_(ss, APP_CONFIG.SHEETS.GYM_BODY_PROGRESS);

    // Completed sessions, oldest -> newest
    const completed = sessions
      .map(function(r) {
        return {
          id: String(r.Session_ID ?? '').trim(),
          date: normalizeDate_(r.Date),
          time: normalizeTime_(r.Start_Time),
          workoutType: String(r.Workout_Type ?? '').trim(),
          durationMin: normalizeNullableNumber_(r.Duration_Min),
          completed: isTruthyCell_(r.Session_Completed)
        };
      })
      .filter(function(s) { return s.completed && s.date; })
      .sort(function(a, b) {
        return (a.date + ' ' + a.time).localeCompare(b.date + ' ' + b.time);
      });

    const trainedDates = {};
    completed.forEach(function(s) { trainedDates[s.date] = true; });
    const trainedToday = trainedDates[todayStr] === true;

    // Consecutive training days ending today (if trained today) or yesterday
    let streakDays = 0;
    let cursor = trainedToday ? todayStr : shiftDateStr_(todayStr, -1);
    while (trainedDates[cursor]) {
      streakDays++;
      cursor = shiftDateStr_(cursor, -1);
    }

    const profileMaxConsec = normalizeNullableNumber_(profileMap.max_consecutive_days ?? profileMap.maxconsecutivedays);
    const maxConsecutive = profileMaxConsec !== null ? Math.max(1, Math.round(profileMaxConsec)) : APP_CONFIG.TARGETS.GYM_MAX_CONSECUTIVE_DAYS;
    const profileWeeklyTarget = normalizeNullableNumber_(profileMap.weekly_target ?? profileMap.weekly_goal ?? profileMap.weeklytarget);
    const weeklyTarget = profileWeeklyTarget !== null ? Math.max(1, Math.round(profileWeeklyTarget)) : APP_CONFIG.TARGETS.GYM_WEEKLY_SESSIONS;

    let status = 'train';
    if (trainedToday) {
      status = 'done';
    } else if (streakDays >= maxConsecutive) {
      status = 'rest';
    }

    // Full Body A/B alternation based on the last completed session
    const last = completed.length > 0 ? completed[completed.length - 1] : null;
    const lastType = last ? last.workoutType.toUpperCase() : '';
    const nextWorkout = /\bA\s*$/.test(lastType) || /_A$/.test(lastType) ? 'Full Body B' : 'Full Body A';

    // Weekly count (Monday-start week containing today)
    const weekStart = mondayOfWeekStr_(todayStr);
    const weeklyCount = completed.filter(function(s) {
      return s.date >= weekStart && s.date <= todayStr;
    }).length;

    let lastSession = null;
    if (last) {
      const exerciseCount = workoutRows.filter(function(r) {
        if (String(r.Session_ID ?? '').trim() !== last.id) return false;
        const comp = r.Completed;
        return comp === undefined || String(comp).trim() === '' || isTruthyCell_(comp);
      }).length;
      lastSession = {
        date: last.date,
        workoutType: last.workoutType || '-',
        durationMin: last.durationMin,
        exerciseCount: exerciseCount,
        daysAgo: daysBetweenStr_(last.date, todayStr)
      };
    }

    // Latest body metric + delta vs the previous weigh-in
    const weighIns = bodyRows
      .map(function(r) {
        return {
          date: normalizeDate_(r.Date),
          weightKg: normalizeNullableNumber_(r.Body_Weight_kg),
          waistCm: normalizeNullableNumber_(r.Waist_cm)
        };
      })
      .filter(function(b) { return b.date && b.weightKg !== null; })
      .sort(function(a, b) { return a.date.localeCompare(b.date); });

    let body = null;
    if (weighIns.length > 0) {
      const latest = weighIns[weighIns.length - 1];
      const prev = weighIns.length > 1 ? weighIns[weighIns.length - 2] : null;
      body = {
        date: latest.date,
        weightKg: round1_(latest.weightKg),
        waistCm: latest.waistCm !== null ? round1_(latest.waistCm) : null,
        deltaKg: prev ? round1_(latest.weightKg - prev.weightKg) : null
      };
    }

    return {
      available: true,
      appUrl: appUrl,
      status: status,
      trainedToday: trainedToday,
      streakDays: streakDays,
      maxConsecutiveDays: maxConsecutive,
      nextWorkout: nextWorkout,
      weeklyCount: weeklyCount,
      weeklyTarget: weeklyTarget,
      weekStart: weekStart,
      lastSession: lastSession,
      body: body,
      fuel: fuel
    };
  } catch (err) {
    console.error('buildGymSummary_ failed:', err && err.message ? err.message : 'unknown');
    return {
      available: false,
      reason: 'error',
      error: err && err.message ? err.message : 'gym_summary_error',
      appUrl: appUrl,
      fuel: fuel
    };
  }
}

/**
 * Today's protein & calorie progress from Daily_Food (same deduplicated source as Daily_Nutrition_Summary).
 * @param {string} todayStr
 * @param {Object} nutritionResult
 * @return {Object}
 */
function buildGymFuelCheck_(todayStr, nutritionResult) {
  const days = (nutritionResult && nutritionResult.dailySummaries) || [];
  let today = null;
  for (let i = 0; i < days.length; i++) {
    if (days[i].date === todayStr && days[i].mealCount > 0) {
      today = days[i];
      break;
    }
  }
  return {
    date: todayStr,
    hasLog: today !== null,
    proteinG: today ? today.proteinG : 0,
    calMid: today ? today.calMid : 0,
    mealCount: today ? today.mealCount : 0,
    proteinTargetG: APP_CONFIG.TARGETS.PROTEIN_G,
    calorieLow: APP_CONFIG.TARGETS.CALORIE_LOW,
    calorieHigh: APP_CONFIG.TARGETS.CALORIE_HIGH
  };
}

/**
 * Reads Profile sheet (Key, Value) into a lowercase-keyed map. Missing sheet -> {}.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @return {Object}
 */
function readProfileMap_(ss) {
  const rows = readSheetObjects_(ss, APP_CONFIG.SHEETS.GYM_PROFILE);
  const map = {};
  for (let i = 0; i < rows.length; i++) {
    const k = String(rows[i].Key ?? '').trim().toLowerCase();
    if (k) map[k] = rows[i].Value;
  }
  return map;
}

/**
 * Reads a sheet into header-keyed objects with one getValues() call. Missing sheet -> [].
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {string} sheetName
 * @return {Array<Object>}
 */
function readSheetObjects_(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];

  const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = values[0].map(function(h) { return String(h ?? '').trim(); });
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      if (headers[c]) obj[headers[c]] = values[i][c];
    }
    rows.push(obj);
  }
  return rows;
}

function isTruthyCell_(value) {
  if (value === true) return true;
  return /^(true|yes|y|1|done|completed)$/i.test(String(value ?? '').trim());
}

/** Shifts a 'yyyy-MM-dd' string by n days (UTC math, no timezone drift). */
function shiftDateStr_(dateStr, n) {
  const p = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing dateStr, as 'yyyy-MM-dd'. */
function mondayOfWeekStr_(dateStr) {
  const p = dateStr.split('-').map(Number);
  const dow = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay(); // 0 = Sunday
  return shiftDateStr_(dateStr, dow === 0 ? -6 : 1 - dow);
}

function daysBetweenStr_(fromStr, toStr) {
  const a = fromStr.split('-').map(Number);
  const b = toStr.split('-').map(Number);
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
}
