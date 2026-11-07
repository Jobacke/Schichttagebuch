import { parseCareManHtml } from './teamRosterHtmlParser.js';
import {
  getActiveTeamRoster,
  saveStationTeamRoster,
  saveStationTeamRosterToCloud,
  deleteTeamRoster,
  deleteTeamRosterFromCloud,
  detectRosterStation,
  syncTeamRostersWithCloud,
  extractPersonalShiftsFromRoster,
  getPartnersForShiftFromRoster,
  isCorruptedIstplanHourRoster
} from './teamRosterParser.js';
import {
  CAREMAN_NOVEMBER_2026_BACKHAUS,
  getPresetForCode,
  buildShiftFromPreset
} from './shiftPresets.js';

/**
 * Checks whether a string looks like CareMan roster data
 * (Multi-station bundle, single-station Bookmarklet JSON, CareMan HTML table, or copied CareMan table text).
 */
export function looksLikeCareManData(rawText) {
  if (!rawText || typeof rawText !== 'string') return false;
  const trimmed = rawText.trim();
  if (trimmed.length < 20) return false;

  // 1. JSON from SIEDA/CareMan Bookmarklet (single station or 3-station multiStation bundle)
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && parsed.multiStation && Array.isArray(parsed.rosters) && parsed.rosters.length > 0) return true;
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].shifts) return true;
      if (parsed && Array.isArray(parsed.colleagues) && parsed.colleagues.length > 0) return true;
    } catch {
      // Not valid JSON, continue checking HTML/text
    }
  }

  // 2. HTML from CareMan / SIEDA portal
  if (/<table[\s>]/i.test(trimmed) || /mat-table|employee-cell/i.test(trimmed)) {
    return true;
  }

  // 3. Copied plain text table from CareMan (contains colleague names "Nachname, Vorname" + shift codes)
  const shiftCodePattern = /\b(RF[MHO]|RS[MHO]|RN[MHO]|RT[1-4]?[MHO]|RC[MH]|RH[MH]|FFO|NFO|DDM|BDR|LGI|ACLS|PALS|VS30|V030)\b/i;
  const hasCommaNames = /[A-ZÄÖÜ][a-zäöüß]+,\s+[A-ZÄÖÜ][a-zäöüß]+/.test(trimmed);
  if (hasCommaNames && shiftCodePattern.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Extracts personal shifts ("Backhaus, Johannes") from the active roster for a month
 * and synchronizes them 1:1 (including short-term changes, added/removed shifts,
 * overtime times, and automatic "mit ..." PartnerIn) directly into the Journal.
 */
export async function transferPersonalRosterToJournal({
  yearMonth,
  activeRoster,
  personalTimesOverride = {},
  store,
  addShifts,
  deleteShifts,
  ensureCodesAndTypes
}) {
  if (!yearMonth || !addShifts) {
    return { transferredCount: 0, withPartnersCount: 0, removedCount: 0, yearMonth };
  }

  const rosterToUse = activeRoster || getActiveTeamRoster(yearMonth);
  let personalShifts = extractPersonalShiftsFromRoster(yearMonth, rosterToUse);

  // Fallback for November 2026 verified CareMan preset if roster has no personal entries yet
  if (personalShifts.length === 0 && yearMonth === '2026-11') {
    personalShifts = CAREMAN_NOVEMBER_2026_BACKHAUS.map(item => {
      const dateStr = `2026-11-${String(item.day).padStart(2, '0')}`;
      const preset = getPresetForCode(item.code);
      const partner = getPartnersForShiftFromRoster(dateStr, item.code, rosterToUse);
      return {
        day: item.day,
        date: dateStr,
        code: item.code,
        startTime: item.startTime || preset?.startTime || '07:00',
        endTime: item.endTime || preset?.endTime || '19:00',
        partner: partner || '',
        preset
      };
    });
  }

  if (personalShifts.length === 0) {
    return { transferredCount: 0, withPartnersCount: 0, removedCount: 0, yearMonth };
  }

  const requiredCodes = [];
  const requiredTypes = [];

  personalShifts.forEach(s => {
    const preset = s.preset || getPresetForCode(s.code);
    if (s.code) {
      requiredCodes.push({ code: s.code, hours: preset?.hours || 8.2 });
    }
    if (preset?.shiftTypeName) {
      requiredTypes.push({ name: preset.shiftTypeName });
    }
  });

  let effectiveSettings = store?.settings;
  if (ensureCodesAndTypes) {
    const updated = await ensureCodesAndTypes(requiredCodes, requiredTypes);
    if (updated) effectiveSettings = updated;
  }

  // Guard against old v2.2.23 bookmarklet personalTimes where day-of-month equaled start-time hour (6, 14, 15, 22)
  const ptEntries = Object.entries(personalTimesOverride || {});
  const isCorruptedPersonalTimes =
    ptEntries.length > 0 &&
    ptEntries.every(([dateKey, val]) => {
      const dNum = parseInt(dateKey.split('-')[2], 10);
      const sHour = parseInt((val?.startTime || '').split(':')[0], 10);
      return dNum === sHour;
    });
  const safeTimesOverride = isCorruptedPersonalTimes ? {} : (personalTimesOverride || {});

  const newShifts = personalShifts.map(s => {
    const partnerStr = s.partner || getPartnersForShiftFromRoster(s.date, s.code, rosterToUse) || '';
    const base = buildShiftFromPreset({
      dateStr: s.date,
      code: s.code,
      partner: partnerStr,
      storeSettings: effectiveSettings
    });
    const defaultStart = s.startTime || base.startTime;
    const defaultEnd = s.endTime || base.endTime;
    const customTime = safeTimesOverride?.[s.date];
    let useCustom = Boolean(customTime?.startTime && customTime?.endTime);
    if (useCustom && defaultStart) {
      const defH = parseInt(defaultStart.split(':')[0], 10);
      const cusH = parseInt(customTime.startTime.split(':')[0], 10);
      if (!isNaN(defH) && !isNaN(cusH) && Math.abs(defH - cusH) >= 6) {
        useCustom = false;
      }
    }
    return {
      ...base,
      station: s.station || base.station,
      startTime: useCustom ? customTime.startTime : defaultStart,
      endTime: useCustom ? customTime.endTime : defaultEnd,
      partner: partnerStr
    };
  });

  // Count short-term cancelled/swapped shifts in this month that no longer exist in CareMan
  let removedCount = 0;
  if (store?.shifts) {
    const validDates = new Set(newShifts.map(s => s.date));
    const obsoleteShiftIds = store.shifts
      .filter(s => s.date && s.date.startsWith(yearMonth) && !validDates.has(s.date))
      .map(s => s.id)
      .filter(Boolean);
    removedCount = obsoleteShiftIds.length;
  }

  // Atomically update existing shifts in this month, insert new shifts, and delete obsolete/duplicate shifts in yearMonth
  const ok = await addShifts(newShifts, true, yearMonth);
  if (!ok) {
    throw new Error('Fehler beim Speichern der persönlichen Dienste im Journal.');
  }

  const withPartnersCount = newShifts.filter(s => s.partner).length;
  return {
    transferredCount: newShifts.length,
    withPartnersCount,
    removedCount,
    yearMonth,
    shifts: newShifts
  };
}

/**
 * Parses a raw CareMan payload (3-station multiStation bundle, single JSON, HTML, or Text),
 * saves all Station Team Rosters locally + in Firebase Cloud, and immediately synchronizes
 * personal shifts + partners (including short-term changes) into the Journal.
 */
export async function importCareManPayloadAndSync({
  rawText,
  stationOverride = 'AUTO',
  preferredYearMonth = null,
  currentUser,
  store,
  addShifts,
  deleteShifts,
  ensureCodesAndTypes,
  onProgress
}) {
  let trimmed = (rawText || '').trim();
  let isMultiStation = false;
  let parsedMulti = null;

  if (trimmed.startsWith('{')) {
    try {
      const candidate = JSON.parse(trimmed);
      if (candidate && candidate.multiStation && Array.isArray(candidate.rosters) && candidate.rosters.length > 0) {
        isMultiStation = true;
        parsedMulti = candidate;
      } else if (
        candidate &&
        !candidate.extractedAt &&
        !candidate.multiStation &&
        Array.isArray(candidate.colleagues) &&
        preferredYearMonth &&
        /^\d{4}-\d{2}$/.test(preferredYearMonth) &&
        candidate.yearMonth &&
        candidate.yearMonth !== preferredYearMonth
      ) {
        // Legacy bookmarklet ("Abteilungs-DP kopieren") read ?date=YYYY-MM from the URL before page text.
        // Check if Backhaus, Johannes in candidate matches the known November 2026 schedule:
        const selfRow = candidate.colleagues.find(c => c?.name && /backhaus/i.test(c.name));
        const sMap = selfRow?.shifts || {};
        const isActuallyNov2026 =
          Boolean(sMap['2026-11-04'] && sMap['2026-11-04'].includes('RFM')) &&
          Boolean(sMap['2026-11-05'] && sMap['2026-11-05'].includes('RT2M'));

        if (!isActuallyNov2026) {
          const [py, pm] = preferredYearMonth.split('-').map(Number);
          const mNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
          candidate.yearMonth = preferredYearMonth;
          candidate.monthLabel = `${mNames[pm - 1]} ${py}`;
          candidate.colleagues = candidate.colleagues.map(col => {
            if (!col || !col.shifts) return col;
            const remapped = {};
            Object.entries(col.shifts).forEach(([k, v]) => {
              const dayPart = k.includes('-') ? k.split('-')[2] : String(k).padStart(2, '0');
              remapped[`${preferredYearMonth}-${dayPart}`] = v;
            });
            return { ...col, shifts: remapped };
          });
          trimmed = JSON.stringify(candidate);
        }
      }
    } catch {
      /* not JSON */
    }
  }

  if (isMultiStation && parsedMulti) {
    const MULTI_STATION_ORDER = ['Sendling', 'Obersendling', 'Hohenbrunn'];
    const stationCounts = {};
    parsedMulti.rosters.forEach(r => {
      if (r && r.station) stationCounts[r.station] = (stationCounts[r.station] || 0) + 1;
    });
    const hasDuplicateStationLabels = Object.values(stationCounts).some(c => c > 1);
    const seenColleagueSigs = new Set();

    const stationsImported = [];
    let totalShiftsAll = 0;
    let totalColleaguesAll = 0;
    let targetYearMonth = parsedMulti.yearMonth || parsedMulti.rosters?.[0]?.yearMonth || '2026-11';
    let targetMonthLabel = parsedMulti.monthLabel || targetYearMonth;
    const importTimestampMs = Date.now();

    // Lösche zunächst alle bisherigen Team-Dienstpläne des Zielmonats lokal (und in der Cloud),
    // damit Personaländerungen oder gestrichene Dienste niemals als Altlasten erhalten bleiben!
    if (targetYearMonth && /^\d{4}-\d{2}$/.test(targetYearMonth)) {
      deleteTeamRoster(targetYearMonth);
      if (currentUser) {
        try {
          await Promise.race([
            deleteTeamRosterFromCloud(targetYearMonth, currentUser),
            new Promise(r => setTimeout(r, 1500))
          ]);
        } catch {}
      }
    }

    const cloudSavePromises = [];

    for (let i = 0; i < parsedMulti.rosters.length; i++) {
      const stRoster = parsedMulti.rosters[i];
      if (!stRoster || !Array.isArray(stRoster.colleagues) || stRoster.colleagues.length === 0) continue;

      const colSig = stRoster.colleagues.map(c => `${c.name}:${JSON.stringify(c.shifts || {})}`).join('|');
      if (hasDuplicateStationLabels && seenColleagueSigs.has(colSig)) {
        continue;
      }
      seenColleagueSigs.add(colSig);

      if (onProgress) {
        onProgress(Math.round(20 + ((i + 1) / parsedMulti.rosters.length) * 60));
      }

      const stName = (hasDuplicateStationLabels && MULTI_STATION_ORDER[i])
        ? MULTI_STATION_ORDER[i]
        : (stRoster.station || MULTI_STATION_ORDER[i] || 'Sendling');

      const parsedRoster = await parseCareManHtml(JSON.stringify({ ...stRoster, station: stName }));
      if (!parsedRoster || !parsedRoster.yearMonth) continue;

      parsedRoster.extractedAt = importTimestampMs;
      parsedRoster.updatedAtMs = importTimestampMs;

      if (parsedRoster.yearMonth !== targetYearMonth) {
        targetYearMonth = parsedRoster.yearMonth;
        deleteTeamRoster(targetYearMonth);
      }
      targetMonthLabel = parsedRoster.monthLabel || targetMonthLabel;

      saveStationTeamRoster(parsedRoster, stName);
      if (currentUser) {
        cloudSavePromises.push(
          saveStationTeamRosterToCloud(parsedRoster, stName, currentUser).catch(err => {
            console.error(`Cloud save failed for ${stName}:`, err);
          })
        );
      }

      stationsImported.push(stName);
      totalShiftsAll += parsedRoster.totalShifts || 0;
      totalColleaguesAll += parsedRoster.totalColleagues || 0;
    }

    if (cloudSavePromises.length > 0) {
      try {
        await Promise.race([
          Promise.all(cloudSavePromises),
          new Promise(r => setTimeout(r, 2500))
        ]);
      } catch {}
    }

    localStorage.setItem('schichten_selected_year_month', targetYearMonth);
    try {
      sessionStorage.setItem('schichttagebuch_journal_month', targetYearMonth);
    } catch {
      /* ignore */
    }

    const activeCombined = getActiveTeamRoster(targetYearMonth);

    const transferRes = await transferPersonalRosterToJournal({
      yearMonth: targetYearMonth,
      activeRoster: activeCombined,
      personalTimesOverride: parsedMulti.personalTimes || {},
      store,
      addShifts,
      deleteShifts,
      ensureCodesAndTypes
    });

    if (onProgress) onProgress(100);

    const personalMsg =
      transferRes.transferredCount > 0
        ? ` & ${transferRes.transferredCount} eigene Dienste (${transferRes.withPartnersCount}x mit PartnerIn) direkt ins Journal übernommen!`
        : ` (${totalShiftsAll} Team-Dienste gespeichert)!`;

    const detail = {
      source: 'careman_multistation',
      yearMonth: targetYearMonth,
      monthLabel: targetMonthLabel,
      targetStation: stationsImported.join(', '),
      stationsImported,
      totalColleagues: totalColleaguesAll,
      totalShifts: totalShiftsAll,
      transferredCount: transferRes.transferredCount,
      withPartnersCount: transferRes.withPartnersCount,
      removedCount: transferRes.removedCount,
      activeCombined,
      message: `✅ CareMan Live-Sync: ${targetMonthLabel} (${stationsImported.join(', ')}) aktualisiert${personalMsg}`
    };

    try {
      localStorage.setItem('careman_last_imported_clip', trimmed);
    } catch {
      /* ignore */
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('careman-oneclick-synced', { detail }));
    }

    return detail;
  }

  // Single-station payload
  const parsedRoster = await parseCareManHtml(trimmed, onProgress);
  if (!parsedRoster || !parsedRoster.yearMonth) {
    throw new Error('Dienstplan konnte nicht erkannt werden.');
  }

  const targetStation =
    stationOverride !== 'AUTO'
      ? stationOverride
      : parsedRoster.station || detectRosterStation(parsedRoster);

  // 1. Save Station Team Roster locally
  saveStationTeamRoster(parsedRoster, targetStation);
  localStorage.setItem('schichten_selected_year_month', parsedRoster.yearMonth);
  try {
    sessionStorage.setItem('schichttagebuch_journal_month', parsedRoster.yearMonth);
  } catch {
    /* ignore storage errors */
  }

  // 2. Save to Firebase Cloud in background/parallel
  if (currentUser) {
    saveStationTeamRosterToCloud(parsedRoster, targetStation, currentUser).catch(err => {
      console.error('Cloud save failed:', err);
    });
  }

  // 3. Get combined active roster for the month (or fallback to parsedRoster if it was a 1-person Istplan extract and no team roster is stored yet)
  const storedCombined = getActiveTeamRoster(parsedRoster.yearMonth);
  const activeCombined = (storedCombined && storedCombined.colleagues && storedCombined.colleagues.length > 0)
    ? storedCombined
    : parsedRoster;

  let singlePersonalTimes = {};
  if (trimmed.startsWith('{')) {
    try {
      const p = JSON.parse(trimmed);
      if (p && p.personalTimes) singlePersonalTimes = p.personalTimes;
    } catch {}
  }

  // 4. Immediately transfer personal shifts ("Backhaus, Johannes") + Partners ("mit ...") into Journal
  const transferRes = await transferPersonalRosterToJournal({
    yearMonth: parsedRoster.yearMonth,
    activeRoster: activeCombined,
    personalTimesOverride: singlePersonalTimes,
    store,
    addShifts,
    deleteShifts,
    ensureCodesAndTypes
  });

  // 5. If no personal shifts were extracted from this single roster, enrich any existing manual shifts in that month with partner names
  if (transferRes.transferredCount === 0 && store?.shifts && addShifts) {
    const monthShifts = store.shifts.filter(s => s.id && s.date && s.date.startsWith(parsedRoster.yearMonth));
    const toUpdate = [];
    monthShifts.forEach(s => {
      const codeObj = (store.settings?.shiftCodes || []).find(c => c.id === s.codeId || c.code === s.code);
      const codeStr = s.code || codeObj?.code || '';
      if (!codeStr) return;
      const detectedPartner = getPartnersForShiftFromRoster(s.date, codeStr, activeCombined);
      if (detectedPartner && s.partner !== detectedPartner) {
        toUpdate.push({ ...s, partner: detectedPartner });
      }
    });
    if (toUpdate.length > 0) {
      await addShifts(toUpdate, false);
    }
  }

  const personalSingleMsg =
    transferRes.transferredCount > 0
      ? ` & ${transferRes.transferredCount} eigene Dienste (${transferRes.withPartnersCount}x mit PartnerIn) direkt ins Journal übernommen!`
      : ` (${parsedRoster.totalShifts} Team-Dienste gespeichert)!`;

  const detail = {
    source: 'careman_payload',
    yearMonth: parsedRoster.yearMonth,
    monthLabel: parsedRoster.monthLabel,
    targetStation,
    totalColleagues: parsedRoster.totalColleagues,
    totalShifts: parsedRoster.totalShifts,
    transferredCount: transferRes.transferredCount,
    withPartnersCount: transferRes.withPartnersCount,
    removedCount: transferRes.removedCount,
    activeCombined,
    message: `✅ CareMan Live-Sync: ${parsedRoster.monthLabel} (Wache ${targetStation}) eingelesen${personalSingleMsg}`
  };

  try {
    localStorage.setItem('careman_last_imported_clip', trimmed);
  } catch {
    /* ignore */
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('careman-oneclick-synced', { detail }));
  }

  return detail;
}

/**
 * Opens the Johanniter Secure Portal login page (`https://my.secure.johanniter.de/auth/ui/app/auth/flow/secure-portal/password`)
 * with Auto-Pilot state in `window.name` so that:
 * 1. Username & Password are automatically filled and submitted ("Anmelden")
 * 2. Airlock 2FA selection is automatically confirmed (user confirms push manually in Airlock 2FA)
 * 3. Automatically opens Dienstplan Bayern for the selected month (`https://dienstplan-bayern.secure.johanniter.de/app/home/(calendar//panel:entries)?date=YYYY-M-D`)
 * 4. Automatically extracts all 3 stations (Rettungswache München, Rettungswache Obersendling, Rettungswache Hohenbrunn) + personal shifts and transfers them into the App.
 */
export function openCareManLiveWindow(targetYearMonth) {
  const now = new Date();
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const ym =
    (typeof targetYearMonth === 'string' && /^\d{4}-\d{2}$/.test(targetYearMonth) ? targetYearMonth : null) ||
    (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('schichttagebuch_journal_month')) ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('schichten_selected_year_month')) ||
    currentYM;

  const [yStr, mStr] = ym.split('-');
  const year = parseInt(yStr, 10) || now.getFullYear();
  const month = parseInt(mStr, 10) || (now.getMonth() + 1);
  const day = ym === currentYM ? now.getDate() : 1;
  const targetDate = `${year}-${month}-${day}`;
  const targetCareManUrl = `https://dienstplan-bayern.secure.johanniter.de/app/home/(calendar//panel:entries)?date=${targetDate}`;

  let username = 'johannes.backhaus@johanniter.de';
  let password = '';
  try {
    const savedUser = localStorage.getItem('careman_login_user');
    if (savedUser && savedUser.trim()) username = savedUser.trim();
    const savedPass = localStorage.getItem('careman_login_pass');
    if (savedPass) password = savedPass;
    localStorage.setItem('schichten_selected_year_month', ym);
    sessionStorage.setItem('schichttagebuch_journal_month', ym);
  } catch {
    /* ignore storage errors */
  }

  const autoPilotPayload = {
    autoRun: true,
    targetYearMonth: ym,
    targetDate,
    targetCareManUrl,
    username,
    password,
    startedAt: Date.now()
  };

  try {
    window.name = 'CAREMAN_AUTOPILOT:' + JSON.stringify(autoPilotPayload);
  } catch {
    /* ignore */
  }

  // On macOS (Safari / Chrome), trigger the local CareMan Auto-Pilot Daemon (http://127.0.0.1:3847)
  // which controls the login window via CDP, fills username & password automatically, waits for manual Airlock 2FA,
  // opens Dienstplan Bayern (?date=...), extracts all 3 stations, and returns straight back to the App in Safari!
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
  const isTouchDevice = typeof navigator !== 'undefined' && Number(navigator.maxTouchPoints) > 1;
  const isMacDesktop = /Macintosh|Mac OS X/i.test(ua) && !/iPhone|iPad|iPod|Mobile/i.test(ua) && !isTouchDevice;
  if (isMacDesktop) {
    const returnOrigin = (typeof window !== 'undefined' && window.location && window.location.origin)
      ? window.location.origin
      : 'https://schicht.vjbackhaus.de';
    const daemonStartUrl =
      `http://127.0.0.1:3847/start?ym=${encodeURIComponent(ym)}` +
      `&date=${encodeURIComponent(targetDate)}` +
      `&user=${encodeURIComponent(username)}` +
      `&pass=${encodeURIComponent(password)}` +
      `&returnOrigin=${encodeURIComponent(returnOrigin)}`;
    window.location.href = daemonStartUrl;
    return;
  }

  // On iPhone / mobile (or non-Mac environments):
  // Connect to the CareMan Auto-Pilot Cloud Bridge (Firestore) so the background Auto-Pilot
  // automatically enters Username & Password, triggers the Airlock 2FA push on the iPhone,
  // extracts all 3 stations (München, Obersendling, Hohenbrunn), and delivers the shifts
  // live into the iPhone App without getting stuck on the Safari login screen!
  if (typeof document !== 'undefined') {
    const existingOverlay = document.getElementById('careman-iphone-autopilot-modal');
    if (existingOverlay) existingOverlay.remove();

    const overlay = document.createElement('div');
    overlay.id = 'careman-iphone-autopilot-modal';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:999999;background:rgba(15,23,42,0.92);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:20px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';

    overlay.innerHTML = `
      <div style="max-width:440px;width:100%;background:#1e293b;border:1px solid rgba(52,211,153,0.45);border-radius:22px;padding:24px;box-shadow:0 20px 50px rgba(0,0,0,0.6);text-align:center;color:#f8fafc;">
        <div id="cm-ip-spin" style="width:42px;height:42px;border:4px solid rgba(52,211,153,0.2);border-top-color:#10b981;border-radius:50%;animation:cmipspin 0.9s linear infinite;margin:0 auto 16px auto;"></div>
        <style>@keyframes cmipspin { to { transform: rotate(360deg); } }</style>
        <div style="font-size:18px;font-weight:800;color:#34d399;margin-bottom:6px;">⚡ CareMan 3-Wachen Auto-Pilot</div>
        <div style="font-size:12.5px;color:#94a3b8;margin-bottom:18px;">Rettungswache München · Obersendling · Hohenbrunn (${ym})</div>
        <div id="cm-ip-msg" style="background:rgba(15,23,42,0.85);border:1px solid rgba(56,189,248,0.35);border-radius:14px;padding:15px;font-size:14px;font-weight:700;color:#e2e8f0;line-height:1.45;margin-bottom:18px;">
          🚀 Starte automatische Anmeldung & 3-Wachen-Abruf für ${ym}...
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <button id="cm-ip-fallback" style="background:rgba(56,189,248,0.14);color:#38bdf8;border:1px solid rgba(56,189,248,0.35);padding:10px 14px;border-radius:11px;font-size:12.5px;font-weight:700;cursor:pointer;">
            Alternativ: Direkt im Browser mit Lesezeichen öffnen
          </button>
          <button id="cm-ip-cancel" style="background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.35);padding:10px 14px;border-radius:11px;font-size:12.5px;font-weight:700;cursor:pointer;">
            Abbrechen
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    let stopped = false;
    const reqId = `ip_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const fbKey = 'AIzaSyBntKv5YUjvoDDXsuBxQmzPFRqX99KMbxo';
    const fbEmail = 'careman-autopilot-bridge@vjbackhaus.de';
    const fbPass = 'CareManBridge_2026!Secure';
    const fbProject = 'schichttagebuch-da2c3';

    const msgEl = overlay.querySelector('#cm-ip-msg');
    const spinEl = overlay.querySelector('#cm-ip-spin');
    const cancelBtn = overlay.querySelector('#cm-ip-cancel');
    const fallbackBtn = overlay.querySelector('#cm-ip-fallback');

    let bridgeDocUrl = null;
    let bridgeToken = null;

    if (fallbackBtn) {
      fallbackBtn.onclick = () => {
        stopped = true;
        overlay.remove();
        window.location.href = targetCareManUrl;
      };
    }

    if (cancelBtn) {
      cancelBtn.onclick = async () => {
        stopped = true;
        overlay.remove();
        if (bridgeDocUrl && bridgeToken) {
          try {
            await fetch(`${bridgeDocUrl}?updateMask.fieldPaths=status`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${bridgeToken}` },
              body: JSON.stringify({ fields: { status: { stringValue: 'cancelled' } } })
            });
          } catch {}
        }
      };
    }

    (async () => {
      try {
        const authRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${fbKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: fbEmail, password: fbPass, returnSecureToken: true })
        });
        if (!authRes.ok) throw new Error('Cloud-Bridge Auth fehlgeschlagen');
        const authData = await authRes.json();
        bridgeToken = authData.idToken;
        bridgeDocUrl = `https://firestore.googleapis.com/v1/projects/${fbProject}/databases/(default)/documents/users/${authData.localId}/team_rosters/autopilot_bridge`;

        const mask = ['requestId', 'status', 'stepMessage', 'ym', 'targetDate', 'resultJson', 'error', 'requestedAt']
          .map(f => `updateMask.fieldPaths=${f}`)
          .join('&');

        await fetch(`${bridgeDocUrl}?${mask}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${bridgeToken}` },
          body: JSON.stringify({
            fields: {
              requestId: { stringValue: reqId },
              status: { stringValue: 'requested' },
              stepMessage: { stringValue: `🚀 Verbinde mit CareMan & trage Zugangsdaten für ${ym} automatisch ein...` },
              ym: { stringValue: ym },
              targetDate: { stringValue: targetDate },
              resultJson: { stringValue: '' },
              error: { stringValue: '' },
              requestedAt: { integerValue: String(Date.now()) }
            }
          })
        });

        for (let tick = 0; tick < 220 && !stopped; tick++) {
          await new Promise(r => setTimeout(r, 850));
          if (stopped) break;

          const pollRes = await fetch(bridgeDocUrl, {
            headers: { 'Authorization': `Bearer ${bridgeToken}` }
          });
          if (!pollRes.ok) continue;
          const doc = await pollRes.json();
          const f = doc.fields || {};
          const curReqId = f.requestId?.stringValue || '';
          const curStatus = f.status?.stringValue || '';
          const stepMsg = f.stepMessage?.stringValue || '';
          const resJson = f.resultJson?.stringValue || '';

          if (curReqId === reqId && stepMsg && msgEl) {
            msgEl.textContent = stepMsg;
          }

          if (curReqId === reqId && curStatus === 'done' && resJson && resJson.length > 20) {
            stopped = true;
            if (msgEl) {
              msgEl.style.borderColor = '#10b981';
              msgEl.style.color = '#34d399';
              msgEl.textContent = `✅ Alle 3 Wachen (${ym}) geladen – trage Dienste & PartnerInnen ins Journal ein...`;
            }
            window.postMessage({ type: 'CAREMAN_LIVE_SYNC_RESULT', payload: resJson }, '*');
            setTimeout(() => overlay.remove(), 900);
            return;
          }

          if (curReqId === reqId && curStatus === 'error') {
            if (spinEl) spinEl.style.display = 'none';
            if (msgEl) {
              msgEl.style.borderColor = '#ef4444';
              msgEl.style.color = '#f87171';
              msgEl.textContent = stepMsg || '⚠️ Fehler beim Abruf.';
            }
            return;
          }
        }
      } catch {
        if (!stopped) {
          overlay.remove();
          window.location.href = targetCareManUrl;
        }
      }
    })();
    return;
  }

  window.location.href = targetCareManUrl;
}

/**
 * 1-Click CareMan Master Action:
 * 1. Checks URL hash (#careman=...) or pending session import
 * 2. Checks Clipboard for fresh CareMan data (if not already imported in this session)
 * 3. If forceLiveFetch is true or no fresh clipboard data is present, can open CareMan Live Auto-Pilot
 */
export async function runOneClickCareManSync({
  targetYearMonth,
  stationOverride = 'AUTO',
  currentUser,
  store,
  addShifts,
  deleteShifts,
  ensureCodesAndTypes,
  onProgress
}) {
  // 1. Check URL Hash or pending sessionStorage payload
  if (typeof window !== 'undefined') {
    const hash = window.location.hash || '';
    if (hash.startsWith('#careman=')) {
      const encoded = hash.slice('#careman='.length);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      const decoded = decodeURIComponent(encoded);
      if (looksLikeCareManData(decoded)) {
        const res = await importCareManPayloadAndSync({
          rawText: decoded,
          stationOverride,
          currentUser,
          store,
          addShifts,
          deleteShifts,
          ensureCodesAndTypes,
          onProgress
        });
        return {
          ...res,
          message: `✅ CareMan Live-Sync: ${res.monthLabel} (${res.targetStation}) aktualisiert & ${res.transferredCount} eigene Dienste (${res.withPartnersCount}x mit PartnerIn) übernommen!`
        };
      }
    }

    try {
      if (window.name && window.name.startsWith('CAREMAN_SYNC:')) {
        const fromName = window.name.slice('CAREMAN_SYNC:'.length);
        window.name = '';
        if (looksLikeCareManData(fromName)) {
          try { sessionStorage.setItem('pending_careman_import', fromName); } catch {}
          try { localStorage.setItem('pending_careman_import', fromName); } catch {}
        }
      }
      const pending =
        window.__PENDING_CAREMAN_IMPORT ||
        (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('pending_careman_import')) ||
        (typeof localStorage !== 'undefined' && localStorage.getItem('pending_careman_import'));
      if (pending && looksLikeCareManData(pending)) {
        window.__PENDING_CAREMAN_IMPORT = null;
        try { sessionStorage.removeItem('pending_careman_import'); } catch {}
        try { localStorage.removeItem('pending_careman_import'); } catch {}
        const res = await importCareManPayloadAndSync({
          rawText: pending,
          stationOverride,
          currentUser,
          store,
          addShifts,
          deleteShifts,
          ensureCodesAndTypes,
          onProgress
        });
        return {
          ...res,
          message: `✅ CareMan Live-Sync: ${res.monthLabel} (${res.targetStation}) aktualisiert & ${res.transferredCount} eigene Dienste (${res.withPartnersCount}x mit PartnerIn) übernommen!`
        };
      }
    } catch {
      /* ignore storage errors */
    }
  }

  // 2. Try reading Clipboard directly (if CareMan data was copied)
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
    try {
      const clipText = await navigator.clipboard.readText();
      if (clipText && looksLikeCareManData(clipText)) {
        const res = await importCareManPayloadAndSync({
          rawText: clipText,
          stationOverride,
          preferredYearMonth: targetYearMonth,
          currentUser,
          store,
          addShifts,
          deleteShifts,
          ensureCodesAndTypes,
          onProgress
        });

        const personalMsg =
          res.transferredCount > 0
            ? ` & ${res.transferredCount} eigene Dienste (${res.withPartnersCount}x mit PartnerIn) direkt ins Journal übernommen!`
            : ` (${res.totalShifts} Team-Dienste gespeichert)!`;

        return {
          ...res,
          message: `✅ CareMan Live-Sync: ${res.monthLabel} (Wache ${res.targetStation}) eingelesen${personalMsg}`
        };
      }
    } catch {
      // Clipboard permission denied or empty -> continue
    }
  }

  // 3. Fallback: Sync with Cloud & transfer from active Team Roster for targetYearMonth
  if (currentUser) {
    try {
      await syncTeamRostersWithCloud(currentUser);
    } catch (err) {
      console.warn('Cloud sync before 1-click transfer failed:', err);
    }
  }

  const now = new Date();
  const defaultYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const ym = targetYearMonth || localStorage.getItem('schichten_selected_year_month') || defaultYM;
  const activeCombined = getActiveTeamRoster(ym);

  const transferRes = await transferPersonalRosterToJournal({
    yearMonth: ym,
    activeRoster: activeCombined,
    store,
    addShifts,
    deleteShifts,
    ensureCodesAndTypes
  });

  if (transferRes.transferredCount > 0) {
    const [y, m] = ym.split('-').map(Number);
    const mNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
    const monthLabel = activeCombined?.monthLabel || `${mNames[m - 1]} ${y}`;

    const detail = {
      source: 'stored_roster',
      yearMonth: ym,
      monthLabel,
      transferredCount: transferRes.transferredCount,
      withPartnersCount: transferRes.withPartnersCount,
      activeCombined
    };

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('careman-oneclick-synced', { detail }));
    }

    return {
      ...detail,
      message: `✅ CareMan 1-Klick: ${transferRes.transferredCount} eigene Dienste für ${monthLabel} (${transferRes.withPartnersCount}x mit PartnerIn) direkt ins Journal übernommen!`
    };
  }

  return {
    source: 'empty',
    yearMonth: ym,
    transferredCount: 0,
    message: null
  };
}

export const SIEDA_EXTRACTOR_SCRIPT = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const banner = document.createElement('div');
  banner.setAttribute('data-careman-sync-banner', '1');
  banner.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:999999;pointer-events:none;background:linear-gradient(135deg,#0284c7,#0369a1);color:#fff;padding:12px 22px;border-radius:14px;font-family:sans-serif;font-size:14px;font-weight:700;box-shadow:0 12px 32px rgba(0,0,0,0.45);border:1px solid rgba(255,255,255,0.3);display:flex;align-items:center;gap:12px;';
  const setStatus = txt => { banner.textContent = txt; };
  document.body.appendChild(banner);

  const copySync = (str) => {
    try {
      const ta = document.createElement('textarea');
      ta.value = str;
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  };

  try {
    const monthNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
    const monthRegexSubstr = /\\b(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\\s+(20\\d{2})\\b/i;

    // ============================================================================
    // AUTO-PILOT STATE AUS WINDOW.NAME & URL (?date=YYYY-M-D)
    // ============================================================================
    let autoPilot = null;
    try {
      if (window.name && window.name.startsWith('CAREMAN_AUTOPILOT:')) {
        autoPilot = JSON.parse(window.name.slice('CAREMAN_AUTOPILOT:'.length));
      }
    } catch (e) {}

    const isFreshAutoPilot = Boolean(
      autoPilot &&
      autoPilot.targetYearMonth &&
      /^\\d{4}-\\d{2}$/.test(autoPilot.targetYearMonth) &&
      (!autoPilot.startedAt || (Date.now() - autoPilot.startedAt < 25 * 60 * 1000))
    );

    const decodedHref = (() => {
      try { return decodeURIComponent(window.location.href || ''); } catch (e) { return window.location.href || ''; }
    })();
    const urlDateMatch = decodedHref.match(/[?&]date=(20\\d{2})-(\\d{1,2})-(\\d{1,2})/);
    const urlYearMonth = urlDateMatch
      ? \`\${urlDateMatch[1]}-\${String(parseInt(urlDateMatch[2], 10)).padStart(2, '0')}\`
      : null;
    const urlTargetDate = urlDateMatch
      ? \`\${urlDateMatch[1]}-\${parseInt(urlDateMatch[2], 10)}-\${parseInt(urlDateMatch[3], 10)}\`
      : null;

    const setNativeInputValue = (el, val) => {
      if (!el || val === undefined || val === null) return;
      try {
        const proto = Object.getPrototypeOf(el);
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value') ||
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        if (descriptor && descriptor.set) {
          descriptor.set.call(el, val);
        } else {
          el.value = val;
        }
      } catch (e) {
        el.value = val;
      }
      ['input', 'change', 'blur'].forEach(evtName => {
        try { el.dispatchEvent(new Event(evtName, { bubbles: true })); } catch (e) {}
      });
    };

    // ============================================================================
    // STUFE 1: JOHANNITER SECURE PORTAL (LOGIN -> AIRLOCK 2FA -> DIENSTPLAN BAYERN)
    // ============================================================================
    if (/my\\.secure\\.johanniter\\.de/i.test(window.location.hostname || '')) {
      const now = new Date();
      const fallbackDate = \`\${now.getFullYear()}-\${now.getMonth() + 1}-\${now.getDate()}\`;
      let targetDate = (autoPilot && autoPilot.targetDate) || urlTargetDate || fallbackDate;
      let targetYm = (autoPilot && autoPilot.targetYearMonth) || urlYearMonth ||
        \`\${now.getFullYear()}-\${String(now.getMonth() + 1).padStart(2, '0')}\`;

      let apUser = (autoPilot && autoPilot.username) || '';
      let apPass = (autoPilot && autoPilot.password) || '';
      try {
        if (apUser) localStorage.setItem('careman_ap_user', apUser);
        else apUser = localStorage.getItem('careman_ap_user') || 'johannes.backhaus@johanniter.de';
        if (apPass) localStorage.setItem('careman_ap_pass', apPass);
        else apPass = localStorage.getItem('careman_ap_pass') || '';
      } catch (e) {
        if (!apUser) apUser = 'johannes.backhaus@johanniter.de';
      }

      if (!apPass) {
        try {
          const fbKey = 'AIzaSyBntKv5YUjvoDDXsuBxQmzPFRqX99KMbxo';
          const authRes = await fetch(\`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=\${fbKey}\`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'careman-autopilot-bridge@vjbackhaus.de', password: 'CareManBridge_2026!Secure', returnSecureToken: true })
          });
          if (authRes.ok) {
            const authData = await authRes.json();
            const docRes = await fetch(\`https://firestore.googleapis.com/v1/projects/schichttagebuch-da2c3/databases/(default)/documents/users/\${authData.localId}/team_rosters/autopilot_bridge\`, {
              headers: { 'Authorization': \`Bearer \${authData.idToken}\` }
            });
            if (docRes.ok) {
              const doc = await docRes.json();
              const f = doc.fields || {};
              if (f.credsUser?.stringValue) apUser = f.credsUser.stringValue;
              if (f.credsPass?.stringValue) apPass = f.credsPass.stringValue;
              if (!urlYearMonth && f.ym?.stringValue) targetYm = f.ym.stringValue;
              if (!urlTargetDate && f.targetDate?.stringValue) targetDate = f.targetDate.stringValue;
              try {
                if (apUser) localStorage.setItem('careman_ap_user', apUser);
                if (apPass) localStorage.setItem('careman_ap_pass', apPass);
              } catch (e) {}
            }
          }
        } catch (e) {}
      }

      const targetCareManUrl = (autoPilot && autoPilot.targetCareManUrl) ||
        \`https://dienstplan-bayern.secure.johanniter.de/app/home/(calendar//panel:entries)?date=\${targetDate}\`;

      try {
        window.name = 'CAREMAN_AUTOPILOT:' + JSON.stringify({
          autoRun: true,
          targetYearMonth: targetYm,
          targetDate,
          targetCareManUrl,
          username: apUser,
          password: apPass,
          startedAt: (autoPilot && autoPilot.startedAt) || Date.now()
        });
      } catch (e) {}

      let lastPasswordSubmitAt = 0;
      let last2faSelectAt = 0;

      // Warte bis zu 180 Sekunden auf Login + manuelle Bestätigung in Airlock 2FA
      for (let tick = 0; tick < 450; tick++) {
        const href = window.location.href || '';
        const bodyText = (document.body?.innerText || document.body?.textContent || '').trim();

        // 1. Prüfen, ob wir nach Airlock 2FA im Self Service Portal angekommen sind
        const dienstplanTile = Array.from(document.querySelectorAll('a, button, div, span, p')).find(el => {
          if (el.closest && el.closest('[data-careman-sync-banner]')) return false;
          const t = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
          return /^Dienstplan\\s+BAYERN$/i.test(t) || (el.tagName === 'A' && /dienstplan-bayern\\.secure\\.johanniter\\.de/i.test((el.getAttribute && el.getAttribute('href')) || ''));
        });
        const isPortalLoaded = Boolean(dienstplanTile) ||
          (!href.includes('/auth/ui/') && (/Webanwendungen|Self\\s*Service|Dienstplan\\s*BAYERN/i.test(bodyText)));

        if (isPortalLoaded) {
          banner.style.background = 'linear-gradient(135deg,#059669,#10b981)';
          setStatus(\`🚀 Airlock 2FA bestätigt! Öffne Dienstplan Bayern (\${targetDate})...\`);
          await sleep(250);
          window.location.href = targetCareManUrl;
          return;
        }

        // 2. Prüfen auf "Anmeldung mit Airlock 2FA" (manuelle Smartphone-Bestätigung)
        if (/Anmeldung\\s+mit\\s+Airlock\\s+2FA|Nachricht\\s+auf\\s+Ihrem\\s+Smartphone|Offline-Modus/i.test(bodyText)) {
          banner.style.background = 'linear-gradient(135deg,#0284c7,#0369a1)';
          setStatus(\`📱 Bitte jetzt in Airlock 2FA bestätigen – öffne danach automatisch Dienstplan Bayern (\${targetYm})...\`);
          await sleep(400);
          continue;
        }

        // 3. Prüfen auf "Auswahl" (Authentisierungsmöglichkeit: Airlock 2FA vs. OATH)
        if (/Authentisierungsm[öo]glichkeiten|Airlock\\s+2FA/i.test(bodyText) && !document.querySelector('input[type="password"]')) {
          if (Date.now() - last2faSelectAt > 2500) {
            setStatus('⚡ Wähle Airlock 2FA aus...');
            const radios = Array.from(document.querySelectorAll('input[type="radio"], [role="radio"], label, span, div')).filter(el => {
              if (el.closest && el.closest('[data-careman-sync-banner]')) return false;
              const t = (el.innerText || el.textContent || '').trim();
              return /^Airlock\\s*2FA$/i.test(t) || (el.tagName === 'INPUT' && /airlock/i.test((el.value || '') + ' ' + (el.id || '') + ' ' + (el.name || '')));
            });
            const radioInput = document.querySelector('input[type="radio"]') || radios[0];
            if (radioInput) {
              try {
                radioInput.click();
                if (radioInput.tagName === 'INPUT') {
                  radioInput.checked = true;
                  radioInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
              } catch (e) {}
            }
            if (radios[0] && radios[0] !== radioInput) {
              try { radios[0].click(); } catch (e) {}
            }
            await sleep(200);
            const selectBtn = Array.from(document.querySelectorAll('button, input[type="submit"], a, [role="button"]')).find(b => {
              const t = (b.innerText || b.value || b.textContent || '').trim();
              return /^(Ausw[äa]hlen|Weiter|Best[äa]tigen|OK|Anmelden)$/i.test(t);
            });
            if (selectBtn) {
              last2faSelectAt = Date.now();
              try { selectBtn.click(); } catch (e) {}
            }
          }
          await sleep(400);
          continue;
        }

        // 4. Prüfen auf Login-Formular (Benutzername & Passwort)
        const passInput = document.querySelector('input[type="password"]');
        if (passInput) {
          const allInputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="password"]):not([type="radio"]):not([type="checkbox"]):not([type="submit"])'));
          const userInput = allInputs.find(inp => /user|login|mail|name/i.test((inp.name || '') + ' ' + (inp.id || '') + ' ' + (inp.placeholder || '') + ' ' + (inp.getAttribute('autocomplete') || ''))) || allInputs[0];

          if (userInput && !userInput.value && apUser) {
            setNativeInputValue(userInput, apUser);
          }
          if (!passInput.value && apPass) {
            setNativeInputValue(passInput, apPass);
          }

          if (passInput && !passInput.hasAttribute('data-careman-listener')) {
            passInput.setAttribute('data-careman-listener', '1');
            passInput.addEventListener('change', () => {
              try {
                if (passInput.value) localStorage.setItem('careman_ap_pass', passInput.value);
                if (userInput && userInput.value) localStorage.setItem('careman_ap_user', userInput.value);
              } catch (e) {}
            });
          }

          const currentUserVal = userInput ? userInput.value.trim() : apUser;
          const currentPassVal = passInput.value;

          if (currentUserVal && currentPassVal && Date.now() - lastPasswordSubmitAt > 3000) {
            setStatus('🔐 Benutzername & Passwort eingetragen – klicke auf Anmelden...');
            try {
              localStorage.setItem('careman_ap_user', currentUserVal);
              localStorage.setItem('careman_ap_pass', currentPassVal);
            } catch (e) {}
            if (userInput) setNativeInputValue(userInput, currentUserVal);
            setNativeInputValue(passInput, currentPassVal);
            await sleep(150);

            const loginBtn = Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"]')).find(b => {
              const t = (b.innerText || b.value || b.textContent || '').trim();
              return /^(Anmelden|Login|Weiter|OK|Submit)$/i.test(t);
            }) || document.querySelector('button[type="submit"], input[type="submit"]');

            if (loginBtn) {
              lastPasswordSubmitAt = Date.now();
              try { loginBtn.click(); } catch (e) {}
              try {
                const form = passInput.closest('form');
                if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
              } catch (e) {}
            }
          } else if (!currentPassVal) {
            setStatus('🔐 Bitte Passwort bestätigen (oder im Schichttagebuch speichern) – klicke danach automatisch auf Anmelden...');
          }
        }

        await sleep(400);
      }
      return;
    }

    const getCommonAncestorDepth = (a, b) => {
      if (!a || !b) return 0;
      const ancestorsA = new Set();
      let cur = a;
      while (cur) {
        ancestorsA.add(cur);
        cur = cur.parentElement;
      }
      let lca = b;
      while (lca && !ancestorsA.has(lca)) {
        lca = lca.parentElement;
      }
      let depth = 0;
      while (lca) {
        depth++;
        lca = lca.parentElement;
      }
      return depth;
    };

    // Findet den exakt sichtbaren Monats-Textknoten in der CareMan-Kopfzeile (z.B. "Juli 2026" oder "November 2026")
    // und misst per Range.getBoundingClientRect() die millimetergenaue Text-Box (ohne umschließende < / > Buttons).
    // WICHTIG: Ignoriert unser eigenes Banner ([data-careman-sync-banner]) sowie Datumsbereiche ("01.11.2026 - 30.11.2026")!
    const getVisibleMonthHeaderInfo = () => {
      const rawCandidates = [];
      let domCounter = 0;
      let pgEl = null;
      let pgCy = null;
      try {
        pgEl = typeof findPlanungsgruppeTrigger === 'function' ? findPlanungsgruppeTrigger() : null;
        if (pgEl && pgEl.getBoundingClientRect) {
          const pgr = pgEl.getBoundingClientRect();
          if (pgr.width > 0 && pgr.top > 0) {
            pgCy = pgr.top + pgr.height / 2;
          }
        }
      } catch (e) {}

      const isIstplanToolbarRow = (el) => {
        if (!pgEl || !el) return false;
        let p = el;
        for (let d = 0; d < 4 && p && p !== document.body; d++) {
          const pr = p.getBoundingClientRect ? p.getBoundingClientRect() : null;
          if (pr && pr.height > 150) break;
          const t = (p.innerText || p.textContent || '');
          if (/Planungsgruppe/i.test(t)) return false;
          if (/\\b(Istplan|Sollplan|Erfassung)\\b/i.test(t)) return true;
          p = p.parentElement;
        }
        return false;
      };

      if (document.body && document.createTreeWalker) {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while ((node = walker.nextNode())) {
          const parent = node.parentElement;
          if (!parent || !parent.getBoundingClientRect) continue;
          if (parent.closest('[data-careman-sync-banner], table, mat-option, md-option, [role="option"], script, style, noscript')) continue;
          const raw = node.nodeValue || '';
          if (!raw || raw.length > 120) continue;
          if (/\\d{2}\\.\\d{2}\\.20\\d{2}/.test(raw)) continue;
          const m = raw.match(monthRegexSubstr);
          if (!m) continue;
          if (isIstplanToolbarRow(parent)) continue;
          const st = window.getComputedStyle(parent);
          if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) < 0.1) continue;

          let r = parent.getBoundingClientRect();
          try {
            const range = document.createRange();
            range.setStart(node, m.index);
            range.setEnd(node, m.index + m[0].length);
            const rr = range.getBoundingClientRect();
            if (rr && rr.width >= 20 && rr.height >= 6) {
              r = rr;
            }
          } catch (e) {}

          if (r.width < 18 || r.width > 360 || r.height < 8 || r.height > 85) continue;
          if (r.top < 4 || r.top > 450 || r.left < 0 || r.left > 620) continue;

          rawCandidates.push({
            el: parent,
            rect: r,
            monthName: m[1],
            yearStr: m[2],
            domIdx: ++domCounter
          });
        }
      }

      // Unterstützung falls Monat & Jahr auf zwei Kind-Spans verteilt sind (z.B. <span>Juli</span> <span>2026</span>)
      Array.from(document.querySelectorAll('span, div, button, a, strong, b, label')).forEach(el => {
        if (el.closest('[data-careman-sync-banner], table, mat-option, md-option, [role="option"], script, style, noscript')) return;
        if (el.children && el.children.length > 4) return;
        const txt = (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ');
        if (!txt || txt.length > 40 || /\\d{2}\\.\\d{2}\\.20\\d{2}/.test(txt)) return;
        const m = txt.match(/^(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\\s+(20\\d{2})$/i);
        if (!m || !el.getBoundingClientRect) return;
        if (isIstplanToolbarRow(el)) return;
        const st = window.getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) < 0.1) return;
        const r = el.getBoundingClientRect();
        if (r.width < 18 || r.width > 360 || r.height < 8 || r.height > 85) return;
        if (r.top < 4 || r.top > 450 || r.left < 0 || r.left > 620) return;
        if (rawCandidates.some(c => c.el === el || c.el.contains(el))) return;
        rawCandidates.push({
          el,
          rect: r,
          monthName: m[1],
          yearStr: m[2],
          domIdx: ++domCounter
        });
      });

      Array.from(document.querySelectorAll('input')).forEach(inp => {
        if (inp.closest('[data-careman-sync-banner]')) return;
        const val = (inp.value || '').trim();
        if (!val || /\\d{2}\\.\\d{2}\\.20\\d{2}/.test(val)) return;
        const m = val.match(monthRegexSubstr);
        if (!m || !inp.getBoundingClientRect) return;
        if (isIstplanToolbarRow(inp)) return;
        const r = inp.getBoundingClientRect();
        if (r.width < 18 || r.width > 360 || r.height < 8 || r.height > 85) return;
        if (r.top < 4 || r.top > 450 || r.left < 0 || r.left > 620) return;
        rawCandidates.push({
          el: inp,
          rect: r,
          monthName: m[1],
          yearStr: m[2],
          domIdx: ++domCounter
        });
      });

      if (rawCandidates.length === 0) return null;

      const scored = rawCandidates.map(c => {
        const r = c.rect;
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const topHit = document.elementFromPoint(cx, cy);
        const isTopmost = Boolean(topHit && (c.el === topHit || c.el.contains(topHit) || topHit.contains(c.el)));
        const onPgRow = pgCy !== null && Math.abs(cy - pgCy) <= 48;
        const lcaDepth = pgEl ? getCommonAncestorDepth(c.el, pgEl) : 0;
        return { ...c, isTopmost, onPgRow, lcaDepth };
      });

      scored.sort((a, b) => {
        if (a.isTopmost !== b.isTopmost) return a.isTopmost ? -1 : 1;
        if (a.onPgRow !== b.onPgRow) return a.onPgRow ? -1 : 1;
        if (a.lcaDepth !== b.lcaDepth) return b.lcaDepth - a.lcaDepth;
        return b.domIdx - a.domIdx;
      });

      const best = scored[0];
      const idx = monthNames.findIndex(name => name.toLowerCase() === best.monthName.toLowerCase());
      const month = idx + 1;
      const year = parseInt(best.yearStr, 10);
      return {
        el: best.el,
        rect: best.rect,
        year,
        month,
        yearMonth: \`\${year}-\${String(month).padStart(2, '0')}\`,
        monthLabel: \`\${monthNames[month - 1]} \${year}\`
      };
    };

    const detectMonthYear = () => {
      const headerInfo = getVisibleMonthHeaderInfo();
      if (headerInfo) {
        return { yearMonth: headerInfo.yearMonth, monthLabel: headerInfo.monthLabel };
      }
      let year = new Date().getFullYear();
      let month = new Date().getMonth() + 1;
      const pageText = Array.from(document.body ? document.body.children : [])
        .filter(el => !el.hasAttribute('data-careman-sync-banner'))
        .map(el => el.innerText || el.textContent || '')
        .join('\\n');
      const textMatches = Array.from(pageText.matchAll(/\\b(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\\s+(20\\d{2})\\b/gi));
      if (textMatches.length > 0) {
        const lastText = textMatches[textMatches.length - 1];
        const idx = monthNames.findIndex(m => m.toLowerCase() === lastText[1].toLowerCase());
        if (idx !== -1) {
          month = idx + 1;
          year = parseInt(lastText[2], 10);
        }
      }
      return {
        yearMonth: \`\${year}-\${String(month).padStart(2, '0')}\`,
        monthLabel: \`\${monthNames[month - 1]} \${year}\`
      };
    };

    const findAbteilungTable = () => {
      const allTables = Array.from(document.querySelectorAll('table'));
      return allTables.slice().reverse().find(t => {
        const hr = t.querySelector('thead tr') || t.querySelector('tr');
        const hs = Array.from(hr?.children || []).map(c => c.textContent.trim());
        return hs.filter(h => /\\b([1-9]|[12]\\d|3[01])\\b/.test(h)).length >= 20;
      }) || document.querySelector('table.mat-table') || document.querySelector('table');
    };

    const getAbtTableSig = () => {
      const tbl = findAbteilungTable();
      if (!tbl) return '';
      const allTrs = Array.from(tbl.querySelectorAll('tr'));
      const empTrs = allTrs.filter(r => {
        const first = (r.querySelector('.employee-cell') || r.children[0])?.textContent?.trim() || '';
        return first.includes(',') && !/^M-J/i.test(first);
      });
      const headerSig = (allTrs[0]?.innerText || allTrs[0]?.textContent || '').trim().replace(/\\s+/g, ' ');
      const bodyRows = empTrs.length > 0 ? empTrs.slice(0, 8) : allTrs.slice(1, 9);
      const bodySig = bodyRows.map(r => (r.innerText || r.textContent || '').trim().replace(/\\s+/g, ' ')).join('||');
      return headerSig + '##' + bodySig;
    };

    const extractVisibleTable = (forcedStation, ymOverride, labelOverride) => {
      const { yearMonth: ym, monthLabel: ml } = ymOverride ? { yearMonth: ymOverride, monthLabel: labelOverride } : detectMonthYear();
      const table = findAbteilungTable();
      const headerRow = table?.querySelector('thead tr') || table?.querySelector('tr');
      const headers = Array.from(headerRow?.children || []).map(c => c.textContent.trim());

      const colToDay = new Map();
      headers.forEach((h, idx) => {
        const m = h.match(/(\\d+)/);
        if (m) {
          const d = parseInt(m[1], 10);
          if (d >= 1 && d <= 31) colToDay.set(idx, d);
        }
      });

      const rows = Array.from((table || document).querySelectorAll('tr')).filter(r => {
        const nameEl = r.querySelector('.employee-cell') || r.children[0];
        const txt = nameEl ? nameEl.textContent.trim() : '';
        if (!txt.includes(',') || txt.match(/\\d{2,}/)) return false;
        if (/^M-J/i.test(txt) || /\\b(KTW|RTW|NEF|Ak\\.)\\b/i.test(txt)) return false;
        return true;
      });

      const colleagues = [];
      let mCount = 0, oCount = 0, hCount = 0;

      rows.forEach(r => {
        const nameEl = r.querySelector('.employee-cell') || r.children[0];
        const name = nameEl.textContent.trim().replace(/\\s+/g, ' ');
        const cells = Array.from(r.children);
        const shifts = {};

        colToDay.forEach((dayNum, colIdx) => {
          if (colIdx < cells.length) {
            const cell = cells[colIdx];
            const rawText = (cell.innerText || cell.textContent || '').trim();
            if (!rawText) return;
            const cellHasAsterisk = rawText.includes('*') ||
              Boolean(cell.innerHTML && cell.innerHTML.includes('*')) ||
              Boolean(cell.getAttribute('title') && cell.getAttribute('title').includes('*')) ||
              Boolean(cell.getAttribute('aria-label') && cell.getAttribute('aria-label').includes('*')) ||
              Boolean(cell.querySelector('[matbadge], .mat-badge, .mat-badge-content, [class*="star"], [class*="asterisk"]'));

            const parts = rawText.toUpperCase().split(/[,/;\\n\\r\\t]+/).map(p => p.trim()).filter(Boolean);
            const validCodes = [];
            parts.forEach(part => {
              const hasAsterisk = part.includes('*') || cellHasAsterisk;
              let baseCode = part.replace(/[^A-ZÄÖÜ0-9\\-]/g, '');
              if (!baseCode || baseCode.length < 2 || baseCode.length > 10 || !/[A-ZÄÖÜ]/i.test(baseCode) || /^KW\\d*$/i.test(baseCode) || baseCode === 'FREI' || baseCode === '00' || baseCode === 'WKS') return;

              const stdPat = '(?:RF[MHO]|RS\\d?[MHO]|RN[MHO]|RT[1-4]?[MHO]|RC[MHO]|RH[MHO]|KS\\d?[MHO]|KF\\d?[MHO]|KT\\d?[MHO]|KN\\d?[MHO]|FFO|NFO|DDM|T[1-4][MHO]|LGI|BDR)';
              const pm = baseCode.match(new RegExp('^(RD|RDÜ|ÜB)(' + stdPat + ')(\\\\*?)$'));
              if (pm) {
                const sub1 = pm[1] === 'RD' ? 'RDÜ' : pm[1];
                const sub2 = pm[2] + (pm[3] || (hasAsterisk ? '*' : ''));
                validCodes.push(sub1, sub2);
                return;
              }
              const sm = baseCode.match(new RegExp('^(' + stdPat + ')(RD|RDÜ|ÜB)(\\\\*?)$'));
              if (sm) {
                const sub1 = sm[1] + (hasAsterisk ? '*' : '');
                const sub2 = sm[2] === 'RD' ? 'RDÜ' : sm[2];
                validCodes.push(sub1, sub2);
                return;
              }

              if (baseCode.length > 6) return;
              if (baseCode === 'RD') baseCode = 'RDÜ';
              const finalCode = hasAsterisk ? (baseCode + '*') : baseCode;
              validCodes.push(finalCode);
              if (baseCode.endsWith('M') || baseCode.includes('-M') || ['RFM', 'RSM', 'RNM', 'RT1M', 'RT2M', 'RT3M', 'RT4M', 'RS2M', 'RCM', 'RHM', 'DDM'].includes(baseCode)) mCount++;
              else if (baseCode.endsWith('O') || baseCode === 'RFO' || baseCode === 'RSO' || baseCode.startsWith('NFO') || baseCode.startsWith('FFO')) oCount++;
              else if (baseCode.endsWith('H') || baseCode.includes('HBN') || ['RFH', 'RTH', 'RT1H', 'RT2H', 'RSH', 'RNH', 'RHH'].includes(baseCode)) hCount++;
            });

            if (validCodes.length > 0) {
              shifts[String(dayNum)] = validCodes.join(',');
            }
          }
        });

        if (Object.keys(shifts).length > 0) {
          colleagues.push({ name, shifts });
        }
      });

      let detectedStation = null;
      if (oCount > mCount && oCount > hCount) detectedStation = 'Obersendling';
      else if (hCount > mCount && hCount > oCount) detectedStation = 'Hohenbrunn';
      else if (mCount > 0) detectedStation = 'Sendling';

      const station = forcedStation || detectedStation || 'Sendling';
      return { extractedAt: Date.now(), yearMonth: ym, monthLabel: ml, station, detectedStation, colleagues };
    };

    const PG_ITEM_REGEX = /(61\\s+Fahrzeugplanung|61\\s+SKo|61\\s+WL|61000|61010|61300)/i;

    const isElementVisible = (el) => {
      if (!el || !el.getBoundingClientRect) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width < 26 || rect.height < 10 || rect.height > 165) return false;
      if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) < 0.1) return false;
      return true;
    };

    const getVisiblePgElements = () => {
      return Array.from(document.querySelectorAll('mat-option, md-option, [role="option"], .mat-option, .md-option, .mat-mdc-option, .ng-option, mat-select, md-select, ng-select, [role="combobox"], [role="listbox"], li, div, span')).filter(el => {
        if (el.closest('[data-careman-sync-banner], table')) return false;
        if (!isElementVisible(el)) return false;
        const txt = (el.innerText || el.textContent || '').trim();
        if (!txt || txt.length > 125) return false;
        return PG_ITEM_REGEX.test(txt);
      });
    };

    // Das Popup ist genau dann offen, wenn mindestens 2 sichtbare mat-option/[role="option"] Zeilen existieren
    // ODER mindestens 3 nicht-ineinander-verschachtelte Zeilen mit unterschiedlichen Planungsgruppen sichtbar sind!
    const isPopupOpen = () => {
      const visOpts = Array.from(document.querySelectorAll('mat-option, md-option, [role="option"], .mat-option, .md-option, .mat-mdc-option, .ng-option')).filter(
        el => !el.closest('[data-careman-sync-banner], table') && isElementVisible(el)
      );
      const optY = new Set(visOpts.map(el => Math.round(el.getBoundingClientRect().top / 18)));
      if (optY.size >= 2) return true;
      const rawVis = getVisiblePgElements();
      const leafVis = rawVis.filter(el => !rawVis.some(other => other !== el && el.contains(other)));
      const distinctY = new Set(leafVis.map(el => Math.round(el.getBoundingClientRect().top / 28)));
      return distinctY.size >= 3;
    };

    const dismissBlockingDialogs = () => {
      try {
        const dlgBtns = Array.from(document.querySelectorAll('mat-dialog-container button, .mat-dialog-container button, [role="dialog"] button'));
        const okBtn = dlgBtns.find(b => /^(OK|Schlie[ßs]en|Verstanden|Ja)$/i.test((b.innerText || b.textContent || '').trim())) || dlgBtns[0];
        if (okBtn && typeof okBtn.click === 'function') {
          okBtn.click();
          return true;
        }
      } catch (e) {}
      return false;
    };

    // Universeller Finder für das geschlossene Dropdown "Filter Planungsgruppe"
    const findPlanungsgruppeTrigger = () => {
      const visPg = getVisiblePgElements()
        .filter(el => el.getBoundingClientRect().top < 450)
        .sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length);
      if (visPg.length > 0) {
        const inner = visPg[0];
        return inner.closest('mat-select, md-select, ng-select, select, .mat-select-trigger, .mat-mdc-select-trigger, [role="combobox"], [role="listbox"]') || inner;
      }

      const allSelects = Array.from(document.querySelectorAll(
        'mat-select, md-select, ng-select, select, [role="combobox"], [role="listbox"], .mat-select, .md-select, .ng-select'
      )).filter(el => isElementVisible(el));
      const byParentLabel = allSelects.find(el => {
        let p = el.parentElement;
        for (let d = 0; d < 5 && p && p !== document.body; d++) {
          if (/Planungsgruppe/i.test(p.innerText || p.textContent || '')) return true;
          p = p.parentElement;
        }
        return false;
      });
      if (byParentLabel) return byParentLabel;

      // Fallback über das sichtbare Label "Filter Planungsgruppe" (auch wenn nach Monatswechsel noch keine Gruppe gewählt ist)
      const labelEl = Array.from(document.querySelectorAll('label, span, div')).find(el => {
        if (el.closest('[data-careman-sync-banner]')) return false;
        if (!el.getBoundingClientRect) return false;
        const r = el.getBoundingClientRect();
        if (r.top < 10 || r.top > 450 || r.width < 25 || r.width > 360 || r.height < 6 || r.height > 48) return false;
        const txt = (el.innerText || el.textContent || '').trim();
        return /^(Filter\\s+)?Planungsgruppe$/i.test(txt);
      });
      if (labelEl) {
        const r = labelEl.getBoundingClientRect();
        const belowEl = document.elementFromPoint(r.left + 45, r.bottom + 14);
        if (belowEl && belowEl !== document.body) {
          return belowEl.closest('mat-select, md-select, ng-select, select, .mat-select-trigger, .mat-mdc-select-trigger, .mat-form-field-infix, [role="combobox"], [role="listbox"]') || belowEl;
        }
      }
      return null;
    };

    const resolveClickableHost = (node) => {
      if (!node || (node.closest && node.closest('[data-careman-sync-banner]'))) return null;
      const svgRoot = node.closest ? node.closest('svg') : null;
      const base = (svgRoot && svgRoot.parentElement) ? svgRoot.parentElement : node;
      return (base.closest && base.closest('button, a, [role="button"]')) ||
        (base.closest && base.closest('mat-icon, .mat-icon')) ||
        base;
    };

    const clickChevronAt = (elOrNull, cx, cy) => {
      const rawHit = document.elementFromPoint(cx, cy) || elOrNull;
      const btn = resolveClickableHost(elOrNull) || resolveClickableHost(rawHit);
      try {
        if (btn && typeof btn.click === 'function') {
          btn.click();
        }
      } catch (e) {}
      const evtTarget = btn || rawHit;
      if (evtTarget && evtTarget.dispatchEvent) {
        ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
          try {
            evtTarget.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy }));
          } catch (e) {}
        });
      }
    };

    const stepVisibleHeaderToMonth = async (wantYm, wantLabel, contextName) => {
      const [wantY, wantM] = wantYm.split('-').map(Number);
      let stepped = false;
      for (let step = 0; step < 48; step++) {
        const curHeader = getVisibleMonthHeaderInfo();
        const curInfo = curHeader || detectMonthYear();
        const [curY, curM] = curInfo.yearMonth.split('-').map(Number);
        const diff = (wantY - curY) * 12 + (wantM - curM);
        if (diff === 0) break;

        setStatus(\`⚡ Wechsle im \${contextName} auf \${wantLabel} (\${curInfo.monthLabel})...\`);
        const mr = curHeader?.rect || (curHeader?.el ? curHeader.el.getBoundingClientRect() : null);
        if (!mr) break;

        const arrowY = mr.top + mr.height / 2;
        const coordX = diff < 0 ? Math.max(8, mr.left - 44) : Math.max(22, mr.left - 14);

        const clusters = [];
        const addClusterCandidate = (rawEl) => {
          const host = resolveClickableHost(rawEl);
          if (!host || !host.getBoundingClientRect) return;
          if (curHeader?.el && (host === curHeader.el || host.contains(curHeader.el))) return;
          const r = host.getBoundingClientRect();
          if (r.width < 6 || r.width > 64 || r.height < 6 || r.height > 64) return;
          const cy = r.top + r.height / 2;
          const cx = r.left + r.width / 2;
          if (Math.abs(cy - arrowY) > 28) return;
          if (cx < Math.max(2, mr.left - 115) || cx > mr.left - 2) return;
          const existing = clusters.find(c => Math.abs(c.cx - cx) < 12);
          if (!existing) {
            clusters.push({ host, cx, cy });
          } else if (host.matches && host.matches('button, a, [role="button"]')) {
            existing.host = host;
          }
        };

        Array.from(document.querySelectorAll('button, a, [role="button"], mat-icon, .mat-icon, i, svg')).forEach(addClusterCandidate);
        for (let probeX = Math.max(4, Math.round(mr.left - 100)); probeX <= Math.round(mr.left - 4); probeX += 4) {
          const hit = document.elementFromPoint(probeX, arrowY);
          if (hit) addClusterCandidate(hit);
        }
        clusters.sort((a, b) => a.cx - b.cx);

        const chosen = clusters.length >= 2 ? (diff < 0 ? clusters[0] : clusters[1]) : (clusters.length === 1 ? clusters[0] : null);
        const clickX = chosen ? chosen.cx : coordX;
        const clickY = chosen ? chosen.cy : arrowY;

        clickChevronAt(chosen ? chosen.host : null, clickX, clickY);

        let monthChanged = false;
        for (let w = 0; w < 8; w++) {
          await sleep(130);
          if ((getVisibleMonthHeaderInfo() || detectMonthYear()).yearMonth !== curInfo.yearMonth) {
            monthChanged = true;
            break;
          }
        }

        if (!monthChanged) {
          const fallbackEl = document.elementFromPoint(coordX, arrowY);
          clickChevronAt(fallbackEl, coordX, arrowY);
          for (let w = 0; w < 12; w++) {
            await sleep(140);
            if ((getVisibleMonthHeaderInfo() || detectMonthYear()).yearMonth !== curInfo.yearMonth) {
              monthChanged = true;
              break;
            }
          }
        }

        if (!monthChanged) break;
        stepped = true;
      }
      return stepped;
    };

    // Falls CareMan direkt nach dem Login/Redirect noch lädt, warte kurz bis Kalender oder Planungsgruppe sichtbar sind
    for (let w = 0; w < 36; w++) {
      if (getVisibleMonthHeaderInfo() || findPlanungsgruppeTrigger() || document.querySelectorAll('table tr').length > 2) break;
      setStatus('⚡ Warte auf Dienstplan Bayern...');
      await sleep(250);
    }

    const personalTimes = {};
    const istplanShifts = {};
    let initialMonthInfo = detectMonthYear();
    const desiredAutoYm = (isFreshAutoPilot && autoPilot.targetYearMonth) || urlYearMonth;
    if (desiredAutoYm && /^20\\d{2}-\\d{2}$/.test(desiredAutoYm)) {
      const [dy, dm] = desiredAutoYm.split('-').map(Number);
      if (dm >= 1 && dm <= 12) {
        initialMonthInfo = {
          yearMonth: desiredAutoYm,
          monthLabel: \`\${monthNames[dm - 1]} \${dy}\`
        };
      }
    }
    const wasOnIstplan = !findPlanungsgruppeTrigger();

    // Falls wir auf dem persönlichen Istplan starten: Istplan-Schichten & Uhrzeiten (z.B. 19:14 - 23:06) vorab sichern
    // (Auch auf dem iPhone, wo 7 Kalender-Spalten ~44px-53px breit sind!)
    if (wasOnIstplan) {
      if (desiredAutoYm && !urlYearMonth && detectMonthYear().yearMonth !== initialMonthInfo.yearMonth) {
        const dpToggleBtn = document.querySelector('myplan-date-selector mat-datepicker-toggle button, mat-datepicker-toggle button');
        if (dpToggleBtn && !getVisibleMonthHeaderInfo()) {
          try {
            dismissBlockingDialogs();
            dpToggleBtn.click();
            await sleep(220);
            const periodBtn = document.querySelector('.mat-calendar-period-button');
            if (periodBtn) {
              periodBtn.click();
              await sleep(220);
              const [wantY, wantM] = initialMonthInfo.yearMonth.split('-').map(Number);
              const yrCell = Array.from(document.querySelectorAll('.mat-calendar-body-cell')).find(c => (c.innerText || '').trim() === String(wantY));
              if (yrCell) {
                yrCell.click();
                await sleep(220);
                const mCells = Array.from(document.querySelectorAll('.mat-calendar-body-cell'));
                if (mCells[wantM - 1]) {
                  mCells[wantM - 1].click();
                  await sleep(220);
                  const dCell = Array.from(document.querySelectorAll('.mat-calendar-body-cell')).find(c => (c.innerText || '').trim() === '1');
                  if (dCell) {
                    dCell.click();
                    await sleep(900);
                  }
                }
              }
            }
          } catch (e) {}
        } else {
          const didStepIst = await stepVisibleHeaderToMonth(initialMonthInfo.yearMonth, initialMonthInfo.monthLabel, 'Istplan');
          if (didStepIst) await sleep(200);
        }
      }

      const istDayPrefixRegex = /^(?:(?:Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag|Mo|Di|Mi|Do|Fr|Sa|So)\\.?\\s+)?([0-3]?\\d)\\b/i;
      const validShiftRegex = /^(RF[MHO]|RS\\d?[MHO]|RN[MHO]|RT\\d?[MHO]|RC[MHO]|RH[MHO]|KS\\d?[MHO]|KF\\d?[MHO]|KT\\d?[MHO]|KN\\d?[MHO]|FFO|NFO|DDM|T[1-4][MHO]|RDÜ?|BDR|LGI|ACLS|PALS|SMT|RAJ|SW\\d?|RZF|R-SAN)\\*?$/i;
      const getIstplanRawCells = () => {
        let cells = Array.from(document.querySelectorAll('myplan-calendar-day-phone, myplan-calendar-cell, td, mat-grid-tile, div')).filter(c => {
          if (c.closest('[data-careman-sync-banner]')) return false;
          if (!c.getBoundingClientRect) return false;
          const r = c.getBoundingClientRect();
          if (r.width < 28 || r.width > 480 || r.height < 20 || r.height > 260) return false;
          const t = (c.innerText || c.textContent || '').trim();
          if (!/\\d{2}:\\d{2}\\s*-\\s*\\d{2}:\\d{2}/.test(t)) return false;
          // Wichtig: Uhrzeit vorher entfernen, damit NIEMALS die Startstunde (06, 14, 15, 22) im inneren grauen Kasten als Kalendertag erkannt wird!
          const withoutTime = t.replace(/\\d{2}:\\d{2}\\s*-\\s*\\d{2}:\\d{2}/g, '').trim();
          return istDayPrefixRegex.test(withoutTime);
        });
        if (cells.length === 0) {
          cells = Array.from(document.querySelectorAll('myplan-calendar-day-phone, myplan-calendar-cell, td, mat-grid-tile, div')).filter(c => {
            if (c.closest('[data-careman-sync-banner], thead, th')) return false;
            if (!c.getBoundingClientRect) return false;
            const r = c.getBoundingClientRect();
            if (r.width < 28 || r.width > 480 || r.height < 20 || r.height > 260) return false;
            const t = (c.innerText || c.textContent || '').trim();
            if (!istDayPrefixRegex.test(t)) return false;
            const withoutPrefix = t.replace(istDayPrefixRegex, '').trim();
            const tokens = withoutPrefix.split(/[\\s,;/+|\\n\\r]+/).map(x => x.trim()).filter(Boolean);
            return tokens.length >= 1 && tokens.length <= 12 && tokens.some(tok => validShiftRegex.test(tok.replace(/[^A-ZÄÖÜ0-9\\-*]/gi, '')));
          });
        }
        return cells;
      };

      // WICHTIG: CareMan rendert die Überschrift (z.B. "Dezember 2024") sofort bei 0ms, lädt die Kalenderzellen (getSmartMyPlanRoster)
      // aber asynchron nach. Warte bis zu 4.5s, bis die Kalenderzellen (00:00 - 00:00 / 06:54 - 15:06) geladen sind!
      for (let w = 0; w < 30; w++) {
        dismissBlockingDialogs();
        if (getIstplanRawCells().length > 0) break;
        setStatus(\`⚡ Lade Istplan (\${initialMonthInfo.monthLabel})...\`);
        await sleep(140);
      }

      const curUrlMatch = (window.location.href || '').match(/[?&]date=(20\\d{2})-(\\d{1,2})-(\\d{1,2})/);
      const curUrlYm = curUrlMatch ? \`\${curUrlMatch[1]}-\${String(parseInt(curUrlMatch[2], 10)).padStart(2, '0')}\` : urlYearMonth;
      const istVisibleMatchesTarget =
        !desiredAutoYm ||
        Boolean(curUrlYm && curUrlYm === initialMonthInfo.yearMonth) ||
        detectMonthYear().yearMonth === initialMonthInfo.yearMonth;
      if (istVisibleMatchesTarget) {
      try {
        const { yearMonth: istYm } = initialMonthInfo;
        const rawCells = getIstplanRawCells();

        const istCells = rawCells
          .filter(c => !rawCells.some(other => other !== c && c.contains(other)))
          .sort((a, b) => {
            const ra = a.getBoundingClientRect();
            const rb = b.getBoundingClientRect();
            return Math.round(ra.top / 24) - Math.round(rb.top / 24) || ra.left - rb.left;
          });

        istCells.forEach((cell, idx) => {
          const txt = (cell.innerText || cell.textContent || '').trim();
          const withoutTime = txt.replace(/\\d{2}:\\d{2}\\s*-\\s*\\d{2}:\\d{2}/g, '').trim();
          const dayM = withoutTime.match(istDayPrefixRegex);
          const timeM = txt.match(/(\\d{2}:\\d{2})\\s*-\\s*(\\d{2}:\\d{2})/);
          if (!dayM) return;
          const dNum = parseInt(dayM[1], 10);
          if (dNum < 1 || dNum > 31) return;
          // In den ersten 7 Zellen (bei vollem Desktop-Kalendergitter mit >31 Zellen inkl. Vor-/Folgemonat) gehören Tage > 20 zum Vormonat
          const isDesktopGridWithPadding = istCells.length > 31;
          if (isDesktopGridWithPadding && idx < 7 && dNum > 20) return;
          if (isDesktopGridWithPadding && idx >= istCells.length - 7 && dNum < 15) return;

          if (timeM && timeM[1] === '00:00' && timeM[2] === '00:00') return;

          const dStr = \`\${istYm}-\${String(dNum).padStart(2, '0')}\`;
          if (timeM) {
            personalTimes[dStr] = { startTime: timeM[1], endTime: timeM[2] };
          }
          const withoutDayPrefix = withoutTime.replace(istDayPrefixRegex, '').trim();
          const lines = withoutDayPrefix.split(/[\\n\\r]+/).map(l => l.trim()).filter(Boolean);
          const matchedIstCodes = [];
          for (let li = 0; li < lines.length; li++) {
            const line = lines[li];
            const tokens = line.split(/[,;/+|\\s]+/).map(t => t.trim()).filter(Boolean);
            tokens.forEach(tok => {
              const codeCandidate = tok.replace(/[^A-ZÄÖÜ0-9\\-*]/gi, '').toUpperCase();
              if (validShiftRegex.test(codeCandidate)) {
                matchedIstCodes.push(codeCandidate.replace(/^RD(\\*?)$/, 'RDÜ$1'));
              }
            });
          }
          if (matchedIstCodes.length > 0) {
            istplanShifts[String(dNum)] = matchedIstCodes.join(',');
          }
        });
      } catch (e) {}
      }

      // Automatisch rechts im Menü auf den orangenen Button "Abteilungs-dienstplan" klicken
      const findAbtTile = (requireVisible = true) => {
        const candidates = Array.from(document.querySelectorAll('a, button, div, span, p, li')).filter(el => {
          if (el.closest('[data-careman-sync-banner]')) return false;
          const norm = (el.innerText || el.textContent || '').replace(/[\\s\\-\\u00AD\\u2010-\\u2015]+/g, '').toLowerCase();
          const isMatch = norm === 'abteilungsdienstplan' || (norm.includes('abteilungs') && norm.includes('dienstplan') && norm.length < 55);
          if (!isMatch) return false;
          if (!requireVisible) return true;
          if (!el.getBoundingClientRect) return false;
          const r = el.getBoundingClientRect();
          if (r.width < 18 || r.width > 260 || r.height < 10 || r.height > 220) return false;
          if (r.left < -10 || r.left >= window.innerWidth || r.bottom < 0 || r.top >= window.innerHeight) return false;
          const st = window.getComputedStyle(el);
          if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) < 0.1) return false;
          return true;
        });
        return candidates.sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length)[0] || null;
      };

      const isMenuPanelVisible = () => {
        return Array.from(document.querySelectorAll('div, span, h1, h2, h3, h4, p, a, button')).some(el => {
          if (el.closest && el.closest('[data-careman-sync-banner], table')) return false;
          const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
          if (!r || r.width < 18 || r.height < 10 || r.left < 0 || r.left >= window.innerWidth) return false;
          const st = window.getComputedStyle(el);
          if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) < 0.1) return false;
          const norm = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
          return /^(Nacherfassung|Urlaub\\s*&\\s*Fehlzeiten|Vakante\\s*Dienste|Men[üu])$/i.test(norm);
        });
      };

      const isCloseButton = (el) => {
        if (!el) return false;
        const host = (el.closest && el.closest('button, a, [role="button"]')) || el;
        const txt = ((el.innerText || el.textContent || '') + ' ' + (host.innerText || host.textContent || '')).trim();
        const aria = ((host.getAttribute && (host.getAttribute('aria-label') || host.getAttribute('title'))) || '').trim();
        return /close|clear|✕|✖|×/i.test(txt) || /close|schlie/i.test(aria);
      };

      // WICHTIG: In CareMan wird die Kachel "Abteilungs-dienstplan" (*ngIf="showTeamDutyCalendarEntry") erst sichtbar,
      // nachdem CareMan im Hintergrund fillAllRight() (Berechtigungs-Check) geladen hat.
      // Außerdem darf NIEMALS der Schließen-Button (close_circle_blank / ✕) des bereits offenen Menüs geklickt werden!
      let abtEl = findAbtTile(true);
      let triedOpeningMenuDrawer = false;
      for (let w = 0; w < 38 && !abtEl; w++) {
        dismissBlockingDialogs();
        if (!triedOpeningMenuDrawer && !isMenuPanelVisible()) {
          triedOpeningMenuDrawer = true;
          let menuBtn = Array.from(document.querySelectorAll('button, a, [role="button"], div, span')).find(el => {
            if (el.closest && el.closest('[data-careman-sync-banner]')) return false;
            if (isCloseButton(el)) return false;
            const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
            if (!r || r.width < 16 || r.height < 12 || r.left >= window.innerWidth) return false;
            const txt = (el.innerText || '').trim();
            const aria = ((el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title'))) || '').trim();
            return /^(Men[üu]|Menu|apps|grid_on|view_module)$/i.test(txt) || /Men[üu]|Menu/i.test(aria);
          });
          if (!menuBtn) {
            const topRightBtns = Array.from(document.querySelectorAll('button, a, [role="button"], mat-icon, .mat-icon')).filter(el => {
              if (el.closest && el.closest('[data-careman-sync-banner], table')) return false;
              if (isCloseButton(el)) return false;
              if (!el.getBoundingClientRect) return false;
              const r = el.getBoundingClientRect();
              return r.top >= 0 && r.top <= 85 && r.left >= Math.max(120, window.innerWidth - 110) && r.width >= 16 && r.width <= 90 && r.height >= 16 && r.height <= 85;
            }).sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left);
            menuBtn = topRightBtns[0] ? ((topRightBtns[0].closest && topRightBtns[0].closest('button, a, [role="button"]')) || topRightBtns[0]) : null;
          }
          if (menuBtn) {
            try {
              if (typeof menuBtn.click === 'function') menuBtn.click();
              else menuBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            } catch (e) {}
          }
        }
        await sleep(140);
        abtEl = findAbtTile(true);
      }
      if (!abtEl) {
        abtEl = findAbtTile(false);
      }

      const clickAbtTileCleanly = (tileEl) => {
        if (!tileEl) return;
        const routerTarget = (tileEl.closest && tileEl.closest('[routerlink], [ng-reflect-router-link], .square, button, a, [role="button"], li, mat-list-item, .mat-ripple')) || tileEl.parentElement || tileEl;
        const targets = routerTarget && routerTarget !== tileEl ? [routerTarget, tileEl] : [tileEl];
        targets.forEach(t => {
          try {
            if (typeof t.click === 'function') t.click();
            else t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          } catch (e) {}
        });
      };

      if (abtEl) {
        setStatus('⚡ Öffne Abteilungsdienstplan...');
        clickAbtTileCleanly(abtEl);

        // Bis zu 5 Sekunden warten, ob der Abteilungsdienstplan lädt
        for (let w = 0; w < 42; w++) {
          await sleep(110);
          if ((window.location.href || '').includes('team-duty') || findPlanungsgruppeTrigger()) break;
          if (w === 16) {
            const freshAbt = findAbtTile(true) || abtEl;
            clickAbtTileCleanly(freshAbt);
          }
        }
      }

      // Fallback falls CareMan trotz Klick noch auf /app/home steht: direkt per Angular Router (pushState + popstate) auf /app/team-duty wechseln
      if (!(window.location.href || '').includes('team-duty') && !findPlanungsgruppeTrigger()) {
        try {
          const isMobileRoute = (window.location.pathname || '').includes('/app/sm/');
          const dateSearch = window.location.search || (urlDateMatch ? \`?date=\${urlDateMatch[0].split('=')[1]}\` : '');
          const abtPath = (isMobileRoute ? '/app/sm/team-duty' : '/app/team-duty') + dateSearch;
          if (window.history && typeof window.history.pushState === 'function') {
            window.history.pushState({}, '', abtPath);
            window.dispatchEvent(new Event('popstate'));
          }
          for (let w = 0; w < 30; w++) {
            await sleep(120);
            if (findPlanungsgruppeTrigger()) break;
          }
        } catch (e) {}
      }
    }

    // Warte bis zu 7.5 Sekunden, bis das Dropdown "Filter Planungsgruppe" (*ngIf="!isLoading") UND die Tabelle geladen sind
    for (let w = 0; w < 65; w++) {
      dismissBlockingDialogs();
      if (findPlanungsgruppeTrigger() && document.querySelectorAll('table tr').length > 2) break;
      setStatus(\`⚡ Lade Abteilungsdienstplan (\${initialMonthInfo.monthLabel})...\`);
      await sleep(115);
    }
    await sleep(120);

    // WICHTIG FÜR IPHONE / SCHMALE BILDSCHIRME:
    // Falls das rechte "Menü"-Drawer (mit "Nacherfassung" / "Urlaub & Fehlzeiten") auf einem schmalen Bildschirm (< 950px)
    // noch offen über dem Abteilungsdienstplan liegt, überdeckt es "< > Monat" und "Filter Planungsgruppe".
    // Schließe in diesem Fall gezielt NUR das "Menü"-Drawer über dessen "✕"-Button in der "Menü"-Kopfzeile!
    if (window.innerWidth < 950) {
      const isMenuDrawerCovering = Array.from(document.querySelectorAll('a, button, div, span, p')).some(el => {
        if (el.closest('[data-careman-sync-banner], table')) return false;
        const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
        if (!r || r.width < 20 || r.height < 10 || r.left < 0 || r.left >= window.innerWidth) return false;
        const st = window.getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) < 0.1) return false;
        const norm = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
        return /^(Nacherfassung|Urlaub\\s*&\\s*Fehlzeiten|Vakante\\s*Dienste)$/i.test(norm);
      });
      if (isMenuDrawerCovering) {
        const menuHeaderEl = Array.from(document.querySelectorAll('div, span, h1, h2, h3, h4, p')).find(el => {
          if (el.closest('[data-careman-sync-banner], table')) return false;
          const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
          if (!r || r.width < 20 || r.width > 200 || r.height < 10 || r.height > 60 || r.top > 180) return false;
          return /^(Men[üu]|Menu)$/i.test((el.innerText || el.textContent || '').trim());
        });
        if (menuHeaderEl) {
          const mr = menuHeaderEl.getBoundingClientRect();
          const menuCy = mr.top + mr.height / 2;
          const closeBtn = Array.from(document.querySelectorAll('button, a, [role="button"], mat-icon, .mat-icon, span, i')).find(el => {
            if (el.closest('[data-careman-sync-banner], table')) return false;
            if (el === menuHeaderEl || menuHeaderEl.contains(el)) return false;
            const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
            if (!r || r.width < 8 || r.width > 64 || r.height < 8 || r.height > 64) return false;
            const cy = r.top + r.height / 2;
            if (Math.abs(cy - menuCy) > 26 || r.left <= mr.right) return false;
            const rowParent = el.parentElement?.parentElement || el.parentElement;
            if (rowParent && /Abteilungsdienstplan/i.test(rowParent.innerText || '')) return false;
            return true;
          });
          if (closeBtn) {
            const host = closeBtn.closest('button, a, [role="button"]') || closeBtn;
            try { host.click(); } catch (e) {}
            await sleep(300);
          }
        }
      }
    }

    // Falls wir vom Istplan kamen (oder per Auto-Pilot einen Zielmonat angefordert haben) und CareMan im Abteilungsdienstplan einen anderen Monat geöffnet hat:
    // Bis zu 48 Monate (4 Jahre, z.B. von 2026 bis Januar 2025) rückwärts oder vorwärts blättern!
    let didStepMonth = false;
    const sigBeforeMonthStep = getAbtTableSig();
    if ((wasOnIstplan || Boolean(desiredAutoYm)) && findPlanungsgruppeTrigger()) {
      const [wantY, wantM] = initialMonthInfo.yearMonth.split('-').map(Number);
      for (let step = 0; step < 48; step++) {
        const curHeader = getVisibleMonthHeaderInfo();
        const curInfo = curHeader || detectMonthYear();
        const [curY, curM] = curInfo.yearMonth.split('-').map(Number);
        const diff = (wantY - curY) * 12 + (wantM - curM);
        if (diff === 0) break;

        setStatus(\`⚡ Wechsle im Abteilungsdienstplan auf \${initialMonthInfo.monthLabel} (\${curInfo.monthLabel})...\`);
        const mr = curHeader?.rect || (curHeader?.el ? curHeader.el.getBoundingClientRect() : null);
        if (!mr) break;

        const arrowY = mr.top + mr.height / 2;
        // Exakt gemessene CareMan-Koordinaten links vom Monatsnamen ("<  >  Monat Jahr"):
        // "<" (Monat zurück) liegt bei mr.left - 44px, ">" (Monat vor) liegt bei mr.left - 14px
        const coordX = diff < 0 ? Math.max(8, mr.left - 44) : Math.max(22, mr.left - 14);

        // Kombiniere DOM-Suche + horizontalen elementFromPoint-Scan links von mr.left
        const clusters = [];
        const addClusterCandidate = (rawEl) => {
          const host = resolveClickableHost(rawEl);
          if (!host || !host.getBoundingClientRect) return;
          if (curHeader?.el && (host === curHeader.el || host.contains(curHeader.el))) return;
          const r = host.getBoundingClientRect();
          if (r.width < 6 || r.width > 64 || r.height < 6 || r.height > 64) return;
          const cy = r.top + r.height / 2;
          const cx = r.left + r.width / 2;
          if (Math.abs(cy - arrowY) > 28) return;
          if (cx < Math.max(2, mr.left - 115) || cx > mr.left - 2) return;
          const existing = clusters.find(c => Math.abs(c.cx - cx) < 12);
          if (!existing) {
            clusters.push({ host, cx, cy });
          } else if (host.matches && host.matches('button, a, [role="button"]')) {
            existing.host = host;
          }
        };

        Array.from(document.querySelectorAll('button, a, [role="button"], mat-icon, .mat-icon, i, svg')).forEach(addClusterCandidate);
        for (let probeX = Math.max(4, Math.round(mr.left - 100)); probeX <= Math.round(mr.left - 4); probeX += 4) {
          const hit = document.elementFromPoint(probeX, arrowY);
          if (hit) addClusterCandidate(hit);
        }
        clusters.sort((a, b) => a.cx - b.cx);

        const chosen = clusters.length >= 2 ? (diff < 0 ? clusters[0] : clusters[1]) : (clusters.length === 1 ? clusters[0] : null);
        const clickX = chosen ? chosen.cx : coordX;
        const clickY = chosen ? chosen.cy : arrowY;

        clickChevronAt(chosen ? chosen.host : null, clickX, clickY);

        let monthChanged = false;
        for (let w = 0; w < 14; w++) {
          await sleep(50);
          if ((getVisibleMonthHeaderInfo() || detectMonthYear()).yearMonth !== curInfo.yearMonth) {
            monthChanged = true;
            break;
          }
        }

        // Fallback mit exakter CareMan-Koordinate, falls der erste Klick noch nicht ausgelöst hat
        if (!monthChanged) {
          const fallbackEl = document.elementFromPoint(coordX, arrowY);
          clickChevronAt(fallbackEl, coordX, arrowY);
          for (let w = 0; w < 16; w++) {
            await sleep(60);
            if ((getVisibleMonthHeaderInfo() || detectMonthYear()).yearMonth !== curInfo.yearMonth) {
              monthChanged = true;
              break;
            }
          }
        }

        if (monthChanged) {
          didStepMonth = true;
        }
        await sleep(45);
      }

      if (didStepMonth) {
        // Warte nach dem Monatswechsel, bis CareMan den Ladebalken (mat-progress-bar) beendet hat und die Planungsgruppen bereit sind
        await sleep(120);
        for (let w = 0; w < 90; w++) {
          await sleep(80);
          const isBusy = Boolean(document.querySelector('mat-progress-bar, .mat-progress-bar, [role="progressbar"]'));
          const curSig = getAbtTableSig();
          if (!isBusy && findPlanungsgruppeTrigger() && curSig && curSig !== sigBeforeMonthStep) break;
          if (!isBusy && w >= 15 && findPlanungsgruppeTrigger()) break;
        }
        await sleep(100);
      }
    }

    const detectedAfterNav = getVisibleMonthHeaderInfo() || detectMonthYear();
    // WICHTIG: Wenn auf dem Istplan gestartet wurde (oder per Auto-Pilot ein Zielmonat gewählt wurde), bleibt der Zielmonat IMMER fest auf dem Zielmonat!
    const yearMonth = (wasOnIstplan || Boolean(desiredAutoYm)) ? initialMonthInfo.yearMonth : detectedAfterNav.yearMonth;
    const monthLabel = (wasOnIstplan || Boolean(desiredAutoYm)) ? initialMonthInfo.monthLabel : detectedAfterNav.monthLabel;

    const getPopupScrollContainers = () => {
      const containers = new Set();
      const vis = getVisiblePgElements();
      vis.forEach(el => {
        let p = el.parentElement;
        while (p && p !== document.body && p !== document.documentElement) {
          if (!p.closest('table')) {
            const st = window.getComputedStyle(p);
            if (
              p.scrollHeight > p.clientHeight + 4 ||
              /(auto|scroll)/i.test(st.overflowY) ||
              (p.matches && p.matches('.mat-select-panel, .mat-mdc-select-panel, md-content, .md-select-menu-container, .cdk-virtual-scroll-viewport, [role="listbox"]'))
            ) {
              containers.add(p);
            }
          }
          p = p.parentElement;
        }
      });
      return Array.from(containers);
    };

    const findOptionInPopup = (pattern, pgTrigger) => {
      const triggerRect = pgTrigger ? pgTrigger.getBoundingClientRect() : null;
      const candidates = getVisiblePgElements().filter(el => {
        if (pgTrigger && (el === pgTrigger || pgTrigger.contains(el) || el.contains(pgTrigger))) return false;
        const txt = (el.innerText || el.textContent || '').trim();
        if (!pattern.test(txt)) return false;
        // Falls das geschlossene Trigger-Element an exakt derselben Y-Koordinate liegt und kein mat-option ist
        if (triggerRect && Math.abs(el.getBoundingClientRect().top - triggerRect.top) < 6 && !el.closest('mat-option, md-option, [role="option"], .cdk-overlay-container, .md-select-menu-container')) {
          return false;
        }
        return true;
      });

      const explicitOpt = candidates.find(el => el.matches('mat-option, md-option, [role="option"], .mat-option, .md-option, .mat-mdc-option, .ng-option, li'));
      if (explicitOpt) return explicitOpt;
      return candidates.sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length)[0] || null;
    };

    const openDropdown = async (pgTrigger) => {
      dismissBlockingDialogs();
      if (isPopupOpen()) return true;
      try { pgTrigger.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {}
      const rect = pgTrigger.getBoundingClientRect();
      const cx = rect.left + Math.min(Math.max(rect.width * 0.35, 24), 110);
      const cy = rect.top + rect.height / 2;
      const rawHit = document.elementFromPoint(cx, cy);
      const hitEl = (rawHit && (pgTrigger === rawHit || pgTrigger.contains(rawHit) || rawHit.contains(pgTrigger)))
        ? rawHit
        : (pgTrigger.querySelector('.mat-select-trigger, .mat-mdc-select-trigger, .mat-select-value') || pgTrigger);

      // Versuch 1: Nativer Einzel-Klick auf den sichtbaren Punkt im Dropdown
      if (hitEl && typeof hitEl.click === 'function') hitEl.click();
      await sleep(120);
      if (isPopupOpen()) return true;

      // Versuch 2: Klick auf das umschließende mat-select / trigger Element
      const selectBox = (hitEl && hitEl.closest && hitEl.closest('.mat-select-trigger, .mat-mdc-select-trigger, .md-select-value, mat-select, md-select, [role="combobox"], [role="listbox"]')) || pgTrigger;
      if (selectBox && selectBox !== hitEl && typeof selectBox.click === 'function') {
        selectBox.click();
        await sleep(140);
        if (isPopupOpen()) return true;
      }

      // Versuch 3: Vollständige MouseEvent-Sequenz (mousedown -> mouseup -> click)
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
        try {
          hitEl.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy }));
        } catch (e) {}
      });
      await sleep(140);
      if (isPopupOpen()) return true;

      // Versuch 4: Tastatur-Event (ArrowDown) auf dem fokussierten Dropdown
      const focusTarget = (hitEl && hitEl.closest && hitEl.closest('mat-select, md-select, [tabindex], [role="combobox"], [role="listbox"]')) || selectBox;
      if (focusTarget && focusTarget.focus) focusTarget.focus();
      if (focusTarget && focusTarget.dispatchEvent) {
        focusTarget.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, which: 40, bubbles: true }));
      }
      await sleep(140);
      return isPopupOpen();
    };

    const TARGET_STATIONS = [
      { key: '61000', pattern: /61000.*Rettungswache\\s+M[üu]nchen/i, station: 'Sendling', label: '61000 Rettungswache München' },
      { key: '61010', pattern: /61010.*Obersendling/i, station: 'Obersendling', label: '61010 Rettungswache Obersendling' },
      { key: '61300', pattern: /61300.*Hohenbrunn/i, station: 'Hohenbrunn', label: '61300 Rettungswache Hohenbrunn' }
    ];

    const rosters = [];

    for (let i = 0; i < TARGET_STATIONS.length; i++) {
      const target = TARGET_STATIONS[i];
      setStatus(\`⚡ Lese Wache \${i + 1}/3: \${target.label}...\`);

      // Prüfe bei Wache 1/3 (Sendling), ob diese Wache für den Zielmonat bereits geladen ist
      const currentSnap = extractVisibleTable(target.station, yearMonth, monthLabel);
      const tableUpdatedForMonth = !didStepMonth || getAbtTableSig() !== sigBeforeMonthStep;
      if (i === 0 && tableUpdatedForMonth && currentSnap.colleagues.length > 0 && currentSnap.detectedStation === 'Sendling') {
        rosters.push({ ...currentSnap, station: target.station });
        continue;
      }

      let pgTrigger = findPlanungsgruppeTrigger();
      for (let w = 0; w < 25 && !pgTrigger; w++) {
        await sleep(110);
        pgTrigger = findPlanungsgruppeTrigger();
      }
      if (!pgTrigger) break;

      const opened = await openDropdown(pgTrigger);
      if (!opened) continue;

      let matchOpt = findOptionInPopup(target.pattern, pgTrigger);

      // Falls Option noch nicht sichtbar: erst im Popup ganz nach oben scrollen, dann schrittweise nach unten!
      if (!matchOpt) {
        const scrollBoxes = getPopupScrollContainers();
        scrollBoxes.forEach(s => {
          s.scrollTop = 0;
          s.dispatchEvent(new Event('scroll'));
        });
        await sleep(90);
        matchOpt = findOptionInPopup(target.pattern, pgTrigger);

        for (let step = 0; step < 12 && !matchOpt; step++) {
          const boxes = getPopupScrollContainers();
          boxes.forEach(s => {
            s.scrollTop += 150;
            s.dispatchEvent(new Event('scroll'));
          });
          await sleep(80);
          matchOpt = findOptionInPopup(target.pattern, pgTrigger);
        }
      }

      if (matchOpt) {
        const prevSig = getAbtTableSig();
        try {
          const scrollBoxes = getPopupScrollContainers();
          scrollBoxes.forEach(sb => {
            if (sb.contains(matchOpt) && sb.getBoundingClientRect && matchOpt.getBoundingClientRect) {
              const sbRect = sb.getBoundingClientRect();
              const optRect = matchOpt.getBoundingClientRect();
              if (optRect.bottom > sbRect.bottom || optRect.top < sbRect.top) {
                sb.scrollTop += (optRect.top - sbRect.top) - (sbRect.height / 2) + (optRect.height / 2);
                sb.dispatchEvent(new Event('scroll'));
              }
            }
          });
          matchOpt.scrollIntoView({ block: 'nearest' });
        } catch (e) {}
        await sleep(40);
        matchOpt.click();
        await sleep(85);

        // Falls das Popup nach Klick auf den inneren Text noch offen ist, auf das mat-option Element klicken
        if (isPopupOpen()) {
          const optHost = matchOpt.closest('mat-option, md-option, [role="option"], .mat-option, .md-option, .mat-mdc-option, li') || matchOpt.parentElement;
          if (optHost && optHost !== matchOpt) {
            optHost.click();
            await sleep(85);
          }
        }

        // Warte bis CareMan den Ladebalken (mat-progress-bar) beendet hat (61000 hat ~120 Mitarbeiter und braucht ca. 5-8s Server-Ladezeit)
        await sleep(120);
        for (let w = 0; w < 240; w++) {
          await sleep(80);
          const isBusy = Boolean(document.querySelector('mat-progress-bar, .mat-progress-bar, [role="progressbar"]'));
          if (isBusy) continue;
          const newSig = getAbtTableSig();
          const checkSnap = extractVisibleTable(target.station, yearMonth, monthLabel);
          const sigChanged = Boolean(newSig && newSig !== prevSig);
          const validForMonth = !didStepMonth || Boolean(newSig && newSig !== sigBeforeMonthStep);
          if (checkSnap.colleagues.length > 0 && (sigChanged || (i === 0 && validForMonth && checkSnap.detectedStation === 'Sendling'))) {
            break;
          }
        }
        await sleep(90);

        const extracted = extractVisibleTable(target.station, yearMonth, monthLabel);
        if (extracted.colleagues.length > 0) {
          rosters.push({ ...extracted, station: target.station });
        }
      } else {
        document.body.click();
        await sleep(150);
      }
    }

    // Falls wir vom Istplan kamen und sowohl den 3-Wachen-Abteilungsdienstplan als auch Istplan-Schichten haben:
    // Ergänze eventuelle reine Istplan-Einträge (z.B. Lehrgänge wie LGI oder Wachen-übergreifende Dienste), ohne die Abteilungsdienstplan-Wachen zu überschreiben
    if (rosters.length > 0 && Object.keys(istplanShifts).length > 0) {
      let selfEntry = null;
      for (const r of rosters) {
        const found = (r.colleagues || []).find(c => c && c.name && /backhaus/i.test(c.name));
        if (found) {
          selfEntry = found;
          break;
        }
      }
      if (!selfEntry && rosters[0] && Array.isArray(rosters[0].colleagues)) {
        selfEntry = { name: 'Backhaus, Johannes', shifts: {} };
        rosters[0].colleagues.unshift(selfEntry);
      }
      if (selfEntry && selfEntry.shifts) {
        Object.entries(istplanShifts).forEach(([dayKey, codeVal]) => {
          const alreadyHasDay = rosters.some(r =>
            (r.colleagues || []).some(c => c && c.name && /backhaus/i.test(c.name) && c.shifts && c.shifts[dayKey])
          );
          if (!alreadyHasDay) {
            selfEntry.shifts[dayKey] = codeVal;
          }
        });
      }
    }

    if (rosters.length === 0) {
      const fallbackSingle = extractVisibleTable(null, yearMonth, monthLabel);
      if (fallbackSingle.colleagues.length > 0) {
        rosters.push(fallbackSingle);
      } else if (Object.keys(istplanShifts).length > 0) {
        rosters.push({
          extractedAt: Date.now(),
          yearMonth: initialMonthInfo.yearMonth,
          monthLabel: initialMonthInfo.monthLabel,
          station: 'Sendling',
          colleagues: [{ name: 'Backhaus, Johannes', shifts: istplanShifts }]
        });
      }
    }

    const payload = rosters.length > 1
      ? { multiStation: true, extractedAt: Date.now(), yearMonth, monthLabel, rosters, personalTimes }
      : { ...(rosters[0] || { yearMonth, monthLabel, station: 'Sendling', colleagues: [] }), personalTimes, extractedAt: Date.now() };

    const json = JSON.stringify(payload);
    try { window.name = 'CAREMAN_SYNC:' + json; } catch (e) {}
    if (window.__CAREMAN_DAEMON_MODE) {
      window.__CAREMAN_DAEMON_RESULT = json;
      banner.style.background = 'linear-gradient(135deg,#059669,#10b981)';
      setStatus(\`✅ \${Math.max(1, rosters.length)} \${rosters.length === 1 ? 'Wache' : 'Wachen'} (\${monthLabel}) übertragen – kehre zum Schichttagebuch zurück...\`);
      return;
    }
    copySync(json);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try { await navigator.clipboard.writeText(json); } catch (e) {}
    }

    if (window.opener && !window.opener.closed) {
      try {
        window.opener.postMessage({ type: 'CAREMAN_LIVE_SYNC_RESULT', payload }, '*');
      } catch (e) {}
    }

    // WICHTIG: #careman= IMMER an die Ziel-URL anhängen und direkt /journal?month=YYYY-MM öffnen
    // (verhindert auf dem iPhone jeden Redirect-Verlust durch <Navigate to="/analysis" replace />)!
    const encodedHash = encodeURIComponent(json);
    const targetUrl = 'https://schicht.vjbackhaus.de/journal?month=' + encodeURIComponent(yearMonth) + '&sync=' + Date.now() + '#careman=' + encodedHash;

    banner.style.background = 'linear-gradient(135deg,#059669,#10b981)';
    setStatus(\`✅ \${Math.max(1, rosters.length)} \${rosters.length === 1 ? 'Wache' : 'Wachen'} (\${monthLabel}) übertragen – öffne Schichttagebuch...\`);

    const navLink = document.createElement('a');
    navLink.href = targetUrl;
    navLink.target = '_top';
    navLink.style.display = 'none';
    document.body.appendChild(navLink);
    navLink.click();
    await sleep(150);
    window.top.location.href = targetUrl;
    window.location.href = targetUrl;
  } catch (err) {
    banner.style.background = '#dc2626';
    setStatus('⚠️ Fehler: ' + err.message);
    setTimeout(() => banner.remove(), 6000);
  }
})();`;

export const BOOKMARKLET_CODE =
  'javascript:' +
  encodeURIComponent(
    `fetch('https://schicht.vjbackhaus.de/careman-sync.js?t='+Date.now()).then(r=>{if(!r.ok)throw 0;return r.text()}).then(c=>(0,eval)(c)).catch(()=>{${SIEDA_EXTRACTOR_SCRIPT}})`
  );
