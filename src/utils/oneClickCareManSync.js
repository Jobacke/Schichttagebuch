import { parseCareManHtml } from './teamRosterHtmlParser';
import {
  getActiveTeamRoster,
  saveStationTeamRoster,
  saveStationTeamRosterToCloud,
  detectRosterStation,
  syncTeamRostersWithCloud,
  extractPersonalShiftsFromRoster,
  getPartnersForShiftFromRoster,
  isCorruptedIstplanHourRoster
} from './teamRosterParser';
import {
  CAREMAN_NOVEMBER_2026_BACKHAUS,
  getPresetForCode,
  buildShiftFromPreset
} from './shiftPresets';

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
    const stationsImported = [];
    let totalShiftsAll = 0;
    let totalColleaguesAll = 0;
    let targetYearMonth = parsedMulti.yearMonth || '2026-11';
    let targetMonthLabel = parsedMulti.monthLabel || targetYearMonth;

    for (let i = 0; i < parsedMulti.rosters.length; i++) {
      const stRoster = parsedMulti.rosters[i];
      if (!stRoster || !Array.isArray(stRoster.colleagues) || stRoster.colleagues.length === 0) continue;

      if (onProgress) {
        onProgress(Math.round(20 + ((i + 1) / parsedMulti.rosters.length) * 60));
      }

      const parsedRoster = await parseCareManHtml(JSON.stringify(stRoster));
      if (!parsedRoster || !parsedRoster.yearMonth) continue;

      targetYearMonth = parsedRoster.yearMonth;
      targetMonthLabel = parsedRoster.monthLabel || targetMonthLabel;
      const stName = stRoster.station || parsedRoster.station || detectRosterStation(parsedRoster);

      saveStationTeamRoster(parsedRoster, stName);
      if (currentUser) {
        saveStationTeamRosterToCloud(parsedRoster, stName, currentUser).catch(err => {
          console.error(`Cloud save failed for ${stName}:`, err);
        });
      }

      stationsImported.push(stName);
      totalShiftsAll += parsedRoster.totalShifts || 0;
      totalColleaguesAll += parsedRoster.totalColleagues || 0;
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

  // 3. Get combined active roster for the month
  const activeCombined = getActiveTeamRoster(parsedRoster.yearMonth);

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
 * Opens the live CareMan Bayern portal so the user can log in (if needed),
 * select any month, and trigger the 1-Click Bookmarklet to import all 3 stations
 * + personal shifts directly back into the app.
 */
export function openCareManLiveWindow() {
  const careManUrl = 'https://dienstplan-bayern.secure.johanniter.de/';
  window.location.href = careManUrl;
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
          sessionStorage.setItem('pending_careman_import', fromName);
        }
      }
      const pending = sessionStorage.getItem('pending_careman_import');
      if (pending && looksLikeCareManData(pending)) {
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
        sessionStorage.removeItem('pending_careman_import');
        return {
          ...res,
          message: `✅ CareMan Live-Sync: ${res.monthLabel} (${res.targetStation}) aktualisiert & ${res.transferredCount} eigene Dienste (${res.withPartnersCount}x mit PartnerIn) übernommen!`
        };
      }
    } catch {
      /* ignore sessionStorage errors */
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
  banner.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:999999;background:linear-gradient(135deg,#0284c7,#0369a1);color:#fff;padding:12px 22px;border-radius:14px;font-family:sans-serif;font-size:14px;font-weight:700;box-shadow:0 12px 32px rgba(0,0,0,0.45);border:1px solid rgba(255,255,255,0.3);display:flex;align-items:center;gap:12px;';
  const setStatus = txt => { banner.textContent = txt; };
  document.body.appendChild(banner);

  const copySync = (str) => {
    try {
      const ta = document.createElement('textarea');
      ta.value = str;
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
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

    // Findet den exakt sichtbaren Monats-Textknoten in der CareMan-Kopfzeile (z.B. "Juli 2026" oder "November 2026")
    // und misst per Range.getBoundingClientRect() die millimetergenaue Text-Box (ohne umschließende < / > Buttons).
    // WICHTIG: Ignoriert komplett "01.11.2026 - 30.11.2026" aus dem Dropdown "Filter Planungsgruppe"!
    const getVisibleMonthHeaderInfo = () => {
      const rawCandidates = [];
      let domCounter = 0;

      if (document.body && document.createTreeWalker) {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while ((node = walker.nextNode())) {
          const raw = node.nodeValue || '';
          if (!raw || raw.length > 120) continue;
          if (/\\d{2}\\.\\d{2}\\.20\\d{2}/.test(raw)) continue;
          const m = raw.match(monthRegexSubstr);
          if (!m) continue;
          const parent = node.parentElement;
          if (!parent || !parent.getBoundingClientRect) continue;
          if (parent.closest('table, mat-option, md-option, [role="option"], script, style, noscript')) continue;
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

          if (r.width < 22 || r.width > 280 || r.height < 8 || r.height > 75) continue;
          if (r.top < 8 || r.top > 360 || r.left < 15 || r.left > 580) continue;

          rawCandidates.push({
            el: parent,
            rect: r,
            monthName: m[1],
            yearStr: m[2],
            domIdx: ++domCounter
          });
        }
      }

      Array.from(document.querySelectorAll('input')).forEach(inp => {
        const val = (inp.value || '').trim();
        if (!val || /\\d{2}\\.\\d{2}\\.20\\d{2}/.test(val)) return;
        const m = val.match(monthRegexSubstr);
        if (!m || !inp.getBoundingClientRect) return;
        const r = inp.getBoundingClientRect();
        if (r.width < 22 || r.width > 280 || r.height < 8 || r.height > 75) return;
        if (r.top < 8 || r.top > 360 || r.left < 15 || r.left > 580) return;
        rawCandidates.push({
          el: inp,
          rect: r,
          monthName: m[1],
          yearStr: m[2],
          domIdx: ++domCounter
        });
      });

      if (rawCandidates.length === 0) return null;

      let pgCy = null;
      try {
        const pgEl = typeof findPlanungsgruppeTrigger === 'function' ? findPlanungsgruppeTrigger() : null;
        if (pgEl && pgEl.getBoundingClientRect) {
          const pgr = pgEl.getBoundingClientRect();
          if (pgr.width > 0 && pgr.top > 0) {
            pgCy = pgr.top + pgr.height / 2;
          }
        }
      } catch (e) {}

      const scored = rawCandidates.map(c => {
        const r = c.rect;
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const topHit = document.elementFromPoint(cx, cy);
        const isTopmost = Boolean(topHit && (c.el === topHit || c.el.contains(topHit) || topHit.contains(c.el)));
        const onPgRow = pgCy !== null && Math.abs(cy - pgCy) <= 48;
        return { ...c, isTopmost, onPgRow };
      });

      scored.sort((a, b) => {
        if (a.onPgRow !== b.onPgRow) return a.onPgRow ? -1 : 1;
        if (a.isTopmost !== b.isTopmost) return a.isTopmost ? -1 : 1;
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
      const pageText = document.body ? document.body.innerText : '';
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
      const trs = Array.from(tbl.querySelectorAll('tr')).filter(r => {
        const first = (r.querySelector('.employee-cell') || r.children[0])?.textContent?.trim() || '';
        return first.includes(',') && !/^M-J/i.test(first);
      });
      return trs.slice(0, 8).map(r => (r.innerText || r.textContent || '').trim().replace(/\\s+/g, ' ')).join('||');
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
              if (!baseCode || baseCode.length < 2 || baseCode.length > 6 || !/[A-ZÄÖÜ]/i.test(baseCode) || /^KW\\d*$/i.test(baseCode) || baseCode === 'FREI' || baseCode === '00' || baseCode === 'WKS') return;

              const stdPat = '(?:RF[MHO]|RS[MHO]|RN[MHO]|RT[1-4]?[MHO]|RC[MH]|RH[MH]|FFO|NFO|DDM|T[1-4][MHO]|LGI|BDR)';
              const pm = baseCode.match(new RegExp('^(RD|RDÜ|ÜB)(' + stdPat + ')(\\\\*?)$'));
              if (pm) {
                const sub1 = pm[1] === 'RD' ? 'RDÜ' : pm[1];
                const sub2 = pm[2] + (pm[3] || (hasAsterisk ? '*' : ''));
                validCodes.push(sub1, sub2);
                return;
              }

              if (baseCode === 'RD') baseCode = 'RDÜ';
              const finalCode = hasAsterisk ? (baseCode + '*') : baseCode;
              validCodes.push(finalCode);
              if (baseCode.endsWith('M') || baseCode.includes('-M') || ['RFM', 'RSM', 'RNM', 'RT1M', 'RT2M', 'RT3M', 'RT4M', 'RS2M', 'RCM', 'RHM', 'DDM'].includes(baseCode)) mCount++;
              else if (baseCode.endsWith('O') || baseCode === 'RFO' || baseCode === 'RSO' || baseCode.startsWith('NFO') || baseCode.startsWith('FFO')) oCount++;
              else if (baseCode.endsWith('H') || baseCode.includes('HBN') || ['RFH', 'RTH', 'RT1H', 'RT2H', 'RSH', 'RNH', 'RHH'].includes(baseCode)) hCount++;
            });

            if (validCodes.length > 0) {
              shifts[String(dayNum)] = validCodes.join(', ');
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

      const station = detectedStation || forcedStation || 'Sendling';
      return { extractedAt: Date.now(), yearMonth: ym, monthLabel: ml, station, detectedStation, colleagues };
    };

    const PG_ITEM_REGEX = /(61\\s+Fahrzeugplanung|61\\s+SKo|61\\s+WL|61000|61010|61300)/i;

    const isElementVisible = (el) => {
      if (!el || !el.getBoundingClientRect) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width < 45 || rect.height < 12 || rect.height > 95) return false;
      if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) < 0.1) return false;
      return true;
    };

    const getVisiblePgElements = () => {
      return Array.from(document.querySelectorAll('mat-option, md-option, [role="option"], .mat-option, .md-option, .mat-mdc-option, .ng-option, li, div, span')).filter(el => {
        if (el.closest('table')) return false;
        if (!isElementVisible(el)) return false;
        const txt = (el.innerText || el.textContent || '').trim();
        if (!txt || txt.length > 110) return false;
        return PG_ITEM_REGEX.test(txt);
      });
    };

    // Das Popup ist genau dann offen, wenn mindestens 3 verschiedene Zeilen (unterschiedliche Y-Positionen)
    // mit Planungsgruppen ("61 Fahrzeugplanung", "61 SKo", "61 WL", "61000...", etc.) gleichzeitig sichtbar sind!
    const isPopupOpen = () => {
      const vis = getVisiblePgElements();
      const distinctY = new Set(vis.map(el => Math.round(el.getBoundingClientRect().top / 16)));
      return distinctY.size >= 3;
    };

    // Universeller Finder für das geschlossene Dropdown "Filter Planungsgruppe"
    const findPlanungsgruppeTrigger = () => {
      const visPg = getVisiblePgElements()
        .filter(el => el.getBoundingClientRect().top < 340)
        .sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length);
      if (visPg.length > 0) {
        const inner = visPg[0];
        return inner.closest('mat-select, md-select, ng-select, select, .mat-select-trigger, .mat-mdc-select-trigger, [role="combobox"], [role="listbox"]') || inner;
      }

      const allSelects = Array.from(document.querySelectorAll(
        'mat-select, md-select, ng-select, select, [role="combobox"], [role="listbox"], .mat-select, .md-select, .ng-select'
      )).filter(isElementVisible);
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
        if (!el.getBoundingClientRect) return false;
        const r = el.getBoundingClientRect();
        if (r.top < 15 || r.top > 340 || r.width < 30 || r.width > 240 || r.height < 6 || r.height > 40) return false;
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

    const personalTimes = {};
    const istplanShifts = {};
    const initialMonthInfo = detectMonthYear();
    const wasOnIstplan = !findPlanungsgruppeTrigger();

    // Falls wir auf dem persönlichen Istplan starten: Istplan-Schichten & Uhrzeiten (z.B. 19:14 - 23:06) vorab sichern
    if (wasOnIstplan) {
      try {
        const { yearMonth: istYm } = initialMonthInfo;
        const rawCells = Array.from(document.querySelectorAll('td, mat-grid-tile, div')).filter(c => {
          if (!c.getBoundingClientRect) return false;
          const r = c.getBoundingClientRect();
          if (r.width < 55 || r.width > 320 || r.height < 50 || r.height > 250) return false;
          const t = (c.innerText || '').trim();
          if (!/\\d{2}:\\d{2}\\s*-\\s*\\d{2}:\\d{2}/.test(t)) return false;
          // Wichtig: Uhrzeit vorher entfernen, damit NIEMALS die Startstunde (06, 14, 15, 22) im inneren grauen Kasten als Kalendertag erkannt wird!
          const withoutTime = t.replace(/\\d{2}:\\d{2}\\s*-\\s*\\d{2}:\\d{2}/g, '').trim();
          return /^([0-3]?\\d)\\b/.test(withoutTime);
        });
        const istCells = rawCells
          .filter(c => !rawCells.some(other => other !== c && c.contains(other)))
          .sort((a, b) => {
            const ra = a.getBoundingClientRect();
            const rb = b.getBoundingClientRect();
            return Math.round(ra.top / 30) - Math.round(rb.top / 30) || ra.left - rb.left;
          });

        istCells.forEach((cell, idx) => {
          const txt = (cell.innerText || '').trim();
          const withoutTime = txt.replace(/\\d{2}:\\d{2}\\s*-\\s*\\d{2}:\\d{2}/g, '').trim();
          const dayM = withoutTime.match(/^([0-3]?\\d)\\b/);
          const timeM = txt.match(/(\\d{2}:\\d{2})\\s*-\\s*(\\d{2}:\\d{2})/);
          if (!dayM || !timeM) return;
          const dNum = parseInt(dayM[1], 10);
          if (dNum < 1 || dNum > 31) return;
          // In den ersten 7 Zellen gehören Tage > 20 zum Vormonat; in den letzten 7 Zellen gehören Tage < 15 zum Folgemonat
          if (idx < 7 && dNum > 20) return;
          if (istCells.length >= 28 && idx >= istCells.length - 7 && dNum < 15) return;

          if (timeM[1] === '00:00' && timeM[2] === '00:00') return;

          const dStr = \`\${istYm}-\${String(dNum).padStart(2, '0')}\`;
          personalTimes[dStr] = { startTime: timeM[1], endTime: timeM[2] };
          const validShiftRegex = /^(RF[MHO]|RS\\d?[MHO]|RN[MHO]|RT\\d?[MHO]|RC[MHO]|RH[MHO]|FFO|NFO|DDM|T[1-4][MHO]|RDÜ?|BDR|LGI|ACLS|PALS|SMT|RAJ|SW\\d?|RZF|R-SAN)\\*?$/i;
          const lines = withoutTime.split(/[\\n\\r]+/).map(l => l.trim()).filter(Boolean);
          const matchedIstCodes = [];
          for (let li = 1; li < lines.length; li++) {
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
            istplanShifts[String(dNum)] = matchedIstCodes.join(', ');
          }
        });
      } catch (e) {}

      // Automatisch rechts im Menü auf den orangenen Button "Abteilungs-dienstplan" klicken
      const findAbtTile = () => {
        const candidates = Array.from(document.querySelectorAll('a, button, div, span, p, li')).filter(el => {
          if (!el.getBoundingClientRect) return false;
          const r = el.getBoundingClientRect();
          if (r.width < 20 || r.width > 220 || r.height < 12 || r.height > 200) return false;
          const norm = (el.innerText || el.textContent || '').replace(/[\\s\\-\\u00AD\\u2010-\\u2015]+/g, '').toLowerCase();
          return norm === 'abteilungsdienstplan' || (norm.includes('abteilungs') && norm.includes('dienstplan') && norm.length < 55);
        });
        return candidates.sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length)[0] || null;
      };

      let abtEl = findAbtTile();
      if (!abtEl) {
        const menuBtn = Array.from(document.querySelectorAll('button, a, div, span')).find(
          el => /^(Men[üu]|Menu)$/i.test((el.innerText || '').trim())
        );
        if (menuBtn && typeof menuBtn.click === 'function') {
          menuBtn.click();
          await sleep(350);
          abtEl = findAbtTile();
        }
      }

      if (abtEl) {
        setStatus('⚡ Öffne Abteilungsdienstplan...');
        const r = abtEl.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const iconAbove = document.elementFromPoint(cx, Math.max(10, r.top - 36));
        const tileContainer = abtEl.closest('button, a, [role="button"], li, mat-list-item, .mat-ripple') || abtEl.parentElement || abtEl;
        try {
          if (typeof tileContainer.click === 'function') tileContainer.click();
          else if (typeof abtEl.click === 'function') abtEl.click();
        } catch (e) {}
        await sleep(550);
        if (!findPlanungsgruppeTrigger() && !window.location.href.includes('team-duty')) {
          try {
            const iconHost = iconAbove ? (iconAbove.closest('button, a, [role="button"], div, span') || iconAbove) : abtEl;
            if (iconHost && typeof iconHost.click === 'function') iconHost.click();
          } catch (e) {}
        }

        // Bis zu 4 Sekunden warten, ob der Abteilungsdienstplan lädt
        for (let w = 0; w < 16; w++) {
          await sleep(250);
          if (window.location.href.includes('team-duty') || findPlanungsgruppeTrigger()) break;
        }
      }
    }

    // Warte bis zu 5 Sekunden, bis das Dropdown "Filter Planungsgruppe" geladen ist
    for (let w = 0; w < 20; w++) {
      if (findPlanungsgruppeTrigger()) break;
      await sleep(250);
    }
    await sleep(350);

    const clickChevronAt = (elOrNull, cx, cy) => {
      const hit = document.elementFromPoint(cx, cy) || elOrNull;
      const btn = (hit && hit.closest && hit.closest('button, a, [role="button"], mat-icon, .mat-icon')) ||
        (elOrNull && elOrNull.closest && elOrNull.closest('button, a, [role="button"], mat-icon, .mat-icon')) ||
        (hit && typeof hit.click === 'function' ? hit : null) ||
        (hit && hit.parentElement && typeof hit.parentElement.click === 'function' ? hit.parentElement : null);
      try {
        if (btn && typeof btn.click === 'function') {
          btn.click();
          return;
        }
      } catch (e) {}
      if (hit) {
        try {
          hit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy }));
        } catch (e) {}
      }
    };

    // Falls wir vom Istplan kamen und CareMan im Abteilungsdienstplan einen anderen Monat geöffnet hat: Monat angleichen
    let didStepMonth = false;
    const sigBeforeMonthStep = getAbtTableSig();
    if (wasOnIstplan && findPlanungsgruppeTrigger()) {
      const [wantY, wantM] = initialMonthInfo.yearMonth.split('-').map(Number);
      for (let step = 0; step < 12; step++) {
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
        const coordX = diff < 0 ? Math.max(14, mr.left - 44) : Math.max(28, mr.left - 14);

        // Cluster alle klickbaren Icon-/Button-Elemente links neben mr.left nach ihrer X-Mitte (Abstand >= 14px)
        const clusters = [];
        Array.from(document.querySelectorAll('button, a, [role="button"], mat-icon, .mat-icon, i, svg')).forEach(el => {
          if (!el.getBoundingClientRect) return;
          const r = el.getBoundingClientRect();
          if (r.width < 6 || r.width > 58 || r.height < 6 || r.height > 58) return;
          const cy = r.top + r.height / 2;
          const cx = r.left + r.width / 2;
          if (Math.abs(cy - arrowY) > 24) return;
          if (cx < Math.max(8, mr.left - 80) || cx > mr.left - 3) return;
          const host = el.closest('button, a, [role="button"]') || el.closest('mat-icon, .mat-icon') || el.parentElement || el;
          const existing = clusters.find(c => Math.abs(c.cx - cx) < 14);
          if (!existing) {
            clusters.push({ host, cx, cy });
          } else if (host && host.matches && host.matches('button, a, [role="button"]')) {
            existing.host = host;
          }
        });
        clusters.sort((a, b) => a.cx - b.cx);

        const chosen = clusters.length >= 2 ? (diff < 0 ? clusters[0] : clusters[1]) : null;
        const clickX = chosen ? chosen.cx : coordX;
        const clickY = chosen ? chosen.cy : arrowY;

        clickChevronAt(chosen ? chosen.host : null, clickX, clickY);

        let monthChanged = false;
        for (let w = 0; w < 6; w++) {
          await sleep(140);
          if ((getVisibleMonthHeaderInfo() || detectMonthYear()).yearMonth !== curInfo.yearMonth) {
            monthChanged = true;
            break;
          }
        }

        // Fallback mit exakter CareMan-Koordinate + MouseEvent-Sequenz, falls der erste Klick noch nicht ausgelöst hat
        if (!monthChanged) {
          const fallbackEl = document.elementFromPoint(coordX, arrowY);
          clickChevronAt(fallbackEl, coordX, arrowY);
          if (fallbackEl) {
            ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
              try {
                fallbackEl.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX: coordX, clientY: arrowY }));
              } catch (e) {}
            });
          }
          for (let w = 0; w < 14; w++) {
            await sleep(150);
            if ((getVisibleMonthHeaderInfo() || detectMonthYear()).yearMonth !== curInfo.yearMonth) {
              monthChanged = true;
              break;
            }
          }
        }

        if (monthChanged) {
          didStepMonth = true;
        }
        await sleep(260);
      }

      if (didStepMonth) {
        // Warte nach dem Monatswechsel kurz, bis CareMan die Tabelle / Planungsgruppen für den Zielmonat geladen hat
        for (let w = 0; w < 18; w++) {
          await sleep(160);
          const curSig = getAbtTableSig();
          if (curSig && curSig !== sigBeforeMonthStep) break;
        }
        await sleep(300);
      }
    }

    const detectedAfterNav = getVisibleMonthHeaderInfo() || detectMonthYear();
    const abtReachedTargetMonth = !wasOnIstplan || detectedAfterNav.yearMonth === initialMonthInfo.yearMonth;
    // WICHTIG: Wenn auf dem Istplan gestartet wurde (z.B. Juli 2026), bleibt der Zielmonat IMMER fest auf dem Istplan-Monat!
    const yearMonth = wasOnIstplan ? initialMonthInfo.yearMonth : detectedAfterNav.yearMonth;
    const monthLabel = wasOnIstplan ? initialMonthInfo.monthLabel : detectedAfterNav.monthLabel;

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
              p.matches('.mat-select-panel, .mat-mdc-select-panel, md-content, .md-select-menu-container, .cdk-virtual-scroll-viewport, [role="listbox"]')
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
      if (isPopupOpen()) return true;
      const rect = pgTrigger.getBoundingClientRect();
      const cx = rect.left + Math.min(Math.max(rect.width * 0.35, 24), 110);
      const cy = rect.top + rect.height / 2;
      const hitEl = document.elementFromPoint(cx, cy) || pgTrigger;

      // Versuch 1: Nativer Einzel-Klick auf den sichtbaren Punkt im Dropdown
      hitEl.click();
      await sleep(260);
      if (isPopupOpen()) return true;

      // Versuch 2: Klick auf das umschließende mat-select / trigger Element
      const selectBox = hitEl.closest('.mat-select-trigger, .mat-mdc-select-trigger, .md-select-value, mat-select, md-select, [role="combobox"], [role="listbox"]') || pgTrigger;
      if (selectBox && selectBox !== hitEl) {
        selectBox.click();
        await sleep(260);
        if (isPopupOpen()) return true;
      }

      // Versuch 3: Vollständige MouseEvent-Sequenz (mousedown -> mouseup -> click)
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
        hitEl.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy }));
      });
      await sleep(260);
      if (isPopupOpen()) return true;

      // Versuch 4: Tastatur-Event (ArrowDown) auf dem fokussierten Dropdown
      const focusTarget = hitEl.closest('mat-select, md-select, [tabindex], [role="combobox"], [role="listbox"]') || selectBox;
      if (focusTarget && focusTarget.focus) focusTarget.focus();
      focusTarget.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, which: 40, bubbles: true }));
      await sleep(260);
      return isPopupOpen();
    };

    const TARGET_STATIONS = [
      { key: '61000', pattern: /61000.*Rettungswache\\s+M[üu]nchen/i, station: 'Sendling', label: '61000 Rettungswache München' },
      { key: '61010', pattern: /61010.*Obersendling/i, station: 'Obersendling', label: '61010 Rettungswache Obersendling' },
      { key: '61300', pattern: /61300.*Hohenbrunn/i, station: 'Hohenbrunn', label: '61300 Rettungswache Hohenbrunn' }
    ];

    const rosters = [];

    for (let i = 0; i < TARGET_STATIONS.length && abtReachedTargetMonth; i++) {
      const target = TARGET_STATIONS[i];
      setStatus(\`⚡ Lese Wache \${i + 1}/3: \${target.label}...\`);

      // Prüfe anhand der echten Schicht-Codes in der Tabelle, ob diese Wache für den Zielmonat bereits geladen ist!
      const currentSnap = extractVisibleTable(null, yearMonth, monthLabel);
      const tableUpdatedForMonth = !didStepMonth || getAbtTableSig() !== sigBeforeMonthStep;
      if (tableUpdatedForMonth && currentSnap.colleagues.length > 0 && currentSnap.detectedStation === target.station) {
        rosters.push({ ...currentSnap, station: target.station });
        continue;
      }

      const pgTrigger = findPlanungsgruppeTrigger();
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
        await sleep(160);
        matchOpt = findOptionInPopup(target.pattern, pgTrigger);

        for (let step = 0; step < 12 && !matchOpt; step++) {
          const boxes = getPopupScrollContainers();
          boxes.forEach(s => {
            s.scrollTop += 150;
            s.dispatchEvent(new Event('scroll'));
          });
          await sleep(150);
          matchOpt = findOptionInPopup(target.pattern, pgTrigger);
        }
      }

      if (matchOpt) {
        const prevSig = getAbtTableSig();
        try { matchOpt.scrollIntoView({ block: 'nearest' }); } catch (e) {}
        await sleep(60);
        matchOpt.click();
        await sleep(180);

        // Falls das Popup nach Klick auf den inneren Text noch offen ist, auf das mat-option Element klicken
        if (isPopupOpen()) {
          const optHost = matchOpt.closest('mat-option, md-option, [role="option"], .mat-option, .md-option, .mat-mdc-option, li') || matchOpt.parentElement;
          if (optHost && optHost !== matchOpt) {
            optHost.click();
            await sleep(180);
          }
        }

        for (let w = 0; w < 32; w++) {
          await sleep(160);
          const newSig = getAbtTableSig();
          const checkSnap = extractVisibleTable(null, yearMonth, monthLabel);
          const sigChanged = Boolean(newSig && newSig !== prevSig);
          const validForMonth = !didStepMonth || Boolean(newSig && newSig !== sigBeforeMonthStep);
          if (checkSnap.colleagues.length > 0 && (sigChanged || (validForMonth && checkSnap.detectedStation === target.station))) {
            break;
          }
        }
        await sleep(300);

        const extracted = extractVisibleTable(target.station, yearMonth, monthLabel);
        if (extracted.colleagues.length > 0) {
          rosters.push({ ...extracted, station: extracted.detectedStation || target.station });
        }
      } else {
        document.body.click();
        await sleep(150);
      }
    }

    // Falls wir vom Istplan kamen und sowohl den 3-Wachen-Abteilungsdienstplan als auch Istplan-Schichten haben:
    // Ergänze eventuelle reine Istplan-Einträge (z.B. Lehrgänge wie LGI), ohne die Abteilungsdienstplan-Wachen zu überschreiben
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
      const fallbackSingle = abtReachedTargetMonth ? extractVisibleTable(null, yearMonth, monthLabel) : { colleagues: [] };
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
    copySync(json);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try { await navigator.clipboard.writeText(json); } catch (e) {}
    }

    const encodedHash = encodeURIComponent(json);
    const targetUrl = encodedHash.length < 48000
      ? ('https://schicht.vjbackhaus.de/?sync=' + Date.now() + '#careman=' + encodedHash)
      : ('https://schicht.vjbackhaus.de/?sync=' + Date.now());

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

export const BOOKMARKLET_CODE = 'javascript:' + encodeURIComponent(SIEDA_EXTRACTOR_SCRIPT);
