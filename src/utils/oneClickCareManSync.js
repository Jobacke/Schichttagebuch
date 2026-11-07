import { parseCareManHtml } from './teamRosterHtmlParser';
import {
  getActiveTeamRoster,
  saveStationTeamRoster,
  saveStationTeamRosterToCloud,
  detectRosterStation,
  syncTeamRostersWithCloud,
  extractPersonalShiftsFromRoster,
  getPartnersForShiftFromRoster
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

  const newShifts = personalShifts.map(s => {
    const partnerStr = s.partner || getPartnersForShiftFromRoster(s.date, s.code, rosterToUse) || '';
    const base = buildShiftFromPreset({
      dateStr: s.date,
      code: s.code,
      partner: partnerStr,
      storeSettings: effectiveSettings
    });
    const customTime = personalTimesOverride?.[s.date];
    return {
      ...base,
      startTime: customTime?.startTime || s.startTime || base.startTime,
      endTime: customTime?.endTime || s.endTime || base.endTime,
      partner: partnerStr
    };
  });

  // Detect short-term cancelled/swapped shifts in this month that no longer exist in CareMan
  let removedCount = 0;
  if (deleteShifts && store?.shifts) {
    const validDates = new Set(newShifts.map(s => s.date));
    const obsoleteShiftIds = store.shifts
      .filter(s => s.date && s.date.startsWith(yearMonth) && !validDates.has(s.date))
      .map(s => s.id)
      .filter(Boolean);

    if (obsoleteShiftIds.length > 0) {
      await deleteShifts(obsoleteShiftIds);
      removedCount = obsoleteShiftIds.length;
    }
  }

  const ok = await addShifts(newShifts, true);
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

  // 4. Immediately transfer personal shifts ("Backhaus, Johannes") + Partners ("mit ...") into Journal
  const transferRes = await transferPersonalRosterToJournal({
    yearMonth: parsedRoster.yearMonth,
    activeRoster: activeCombined,
    store,
    addShifts,
    deleteShifts,
    ensureCodesAndTypes
  });

  // 5. Also enrich any existing shifts in that month with partner names
  if (store?.shifts && addShifts) {
    const monthShifts = store.shifts.filter(s => s.date && s.date.startsWith(parsedRoster.yearMonth));
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
 * Opens the live CareMan Bayern portal in a helper tab/window for the requested month
 * so the Auto-Pilot / Bookmarklet can fetch all 3 stations (61000, 61010, 61300) live.
 */
export function openCareManLiveWindow(targetYearMonth) {
  const now = new Date();
  const ym = targetYearMonth || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [y, m] = ym.split('-').map(Number);
  const careManUrl = `https://dienstplan-bayern.secure.johanniter.de/app/team-duty?date=${y}-${m}-1&schichten_autopilot=1`;
  return window.open(careManUrl, 'careman_live_sync');
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
    const detectMonthYear = () => {
      let year = new Date().getFullYear();
      let month = new Date().getMonth() + 1;
      const pageText = document.body ? document.body.innerText : '';
      const textMatch = pageText.match(/(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\\s+(\\d{4})/i);
      const rangeMatch = pageText.match(/01\\.(\\d{2})\\.(\\d{4})\\s*-\\s*\\d{2}\\.\\d{2}\\.\\d{4}/);
      if (textMatch) {
        const idx = monthNames.findIndex(m => m.toLowerCase() === textMatch[1].toLowerCase());
        if (idx !== -1) {
          month = idx + 1;
          year = parseInt(textMatch[2], 10);
        }
      } else if (rangeMatch) {
        month = parseInt(rangeMatch[1], 10);
        year = parseInt(rangeMatch[2], 10);
      } else {
        const urlMatch = window.location.href.match(/date=(\\d{4})-(\\d{1,2})/);
        if (urlMatch) {
          year = parseInt(urlMatch[1], 10);
          month = parseInt(urlMatch[2], 10);
        }
      }
      return {
        yearMonth: \`\${year}-\${String(month).padStart(2, '0')}\`,
        monthLabel: \`\${monthNames[month - 1]} \${year}\`
      };
    };

    const extractVisibleTable = (forcedStation, ymOverride, labelOverride) => {
      const { yearMonth: ym, monthLabel: ml } = ymOverride ? { yearMonth: ymOverride, monthLabel: labelOverride } : detectMonthYear();
      const table = document.querySelector('table.mat-table') || document.querySelector('table');
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

      const rows = Array.from(document.querySelectorAll('tr')).filter(r => {
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
              if (!baseCode || baseCode.length < 2 || baseCode === 'FREI' || baseCode === '00' || baseCode === 'WKS') return;

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

      let station = forcedStation || 'Sendling';
      if (!forcedStation) {
        if (oCount > mCount && oCount > hCount) station = 'Obersendling';
        else if (hCount > mCount && hCount > oCount) station = 'Hohenbrunn';
      }
      return { extractedAt: Date.now(), yearMonth: ym, monthLabel: ml, station, colleagues };
    };

    // MILLISECOND 0 (SYNCHRONOUS): Immediately copy the currently visible table while Chrome's user gesture is 100% active!
    const initialSnap = extractVisibleTable(null);
    if (initialSnap.colleagues.length > 0) {
      copySync(JSON.stringify(initialSnap));
    }

    const personalTimes = {};
    // 1. Falls noch auf der CareMan-Startseite (Istplan) und noch nicht im Abteilungsdienstplan
    if (!window.location.href.includes('team-duty') && !/Planungsgruppe/i.test(document.body ? document.body.innerText : '')) {
      const abtBtn = Array.from(document.querySelectorAll('a, button, div, span')).find(el => {
        const t = (el.innerText || el.textContent || '').replace(/\\s+/g, '');
        return t === 'Abteilungsdienstplan' || t === 'Abteilungs-dienstplan';
      });
      if (abtBtn) {
        setStatus('⚡ Öffne Abteilungsdienstplan...');
        abtBtn.click();
        for (let i = 0; i < 30; i++) {
          await sleep(250);
          if (window.location.href.includes('team-duty') || /Planungsgruppe/i.test(document.body ? document.body.innerText : '')) break;
        }
        await sleep(600);
      }
    }

    const { yearMonth, monthLabel } = detectMonthYear();

    // Universeller Finder für das Dropdown "Filter Planungsgruppe" (egal ob mat-select, md-select, ng-select oder div)
    const findPlanungsgruppeTrigger = () => {
      const allSelects = Array.from(document.querySelectorAll(
        'mat-select, md-select, ng-select, select, [role="combobox"], [role="listbox"], .mat-select, .md-select, .ng-select'
      ));
      const byParentLabel = allSelects.find(el => {
        let p = el.parentElement;
        for (let d = 0; d < 4 && p && p !== document.body; d++) {
          if (/Planungsgruppe/i.test(p.innerText || p.textContent || '')) return true;
          p = p.parentElement;
        }
        return false;
      });
      if (byParentLabel) return byParentLabel;
      if (allSelects.length > 0) return allSelects[0];

      const allEls = Array.from(document.querySelectorAll('*'));
      const labelEl = allEls.find(el => {
        if (el.children.length > 2) return false;
        const t = (el.innerText || el.textContent || '').trim();
        return /^Filter\\s+Planungsgruppe$/i.test(t) || t === 'Planungsgruppe';
      });

      if (labelEl) {
        let container = labelEl.parentElement;
        for (let i = 0; i < 4 && container && container !== document.body; i++) {
          const siblingOrChild = Array.from(container.querySelectorAll('input, select, button, [tabindex], [role], div, span')).find(
            c => c !== labelEl && !labelEl.contains(c) && !c.contains(labelEl) && /(61\\d*|Fahrzeugplanung|Rettungswache|SKo|WL|Oktoberfest|Aubing|M[üu]nchen|Obersendling|Hohenbrunn)/i.test((c.innerText || c.value || '').trim())
          );
          if (siblingOrChild) return siblingOrChild;
          container = container.parentElement;
        }
        return labelEl.nextElementSibling || labelEl.parentElement;
      }

      return allEls.find(el => {
        if (el.closest('table')) return false;
        if (el.children.length > 3) return false;
        const t = (el.innerText || el.textContent || '').trim();
        return /^(61\\s+Fahrzeugplanung|61\\s+SKo|61\\s+WL|61000|61010|61300)/i.test(t);
      }) || null;
    };

    const findOptionInPopup = (pattern, pgTrigger) => {
      const optionCandidates = Array.from(document.querySelectorAll(
        'mat-option, md-option, [role="option"], .mat-option, .md-option, .mat-mdc-option, .ng-option, li'
      ));
      const explicitMatch = optionCandidates.find(o => pattern.test((o.innerText || o.textContent || '').trim()));
      if (explicitMatch) return explicitMatch;

      const allCandidates = Array.from(document.querySelectorAll('div, span, a, p, li')).filter(el => {
        if (!pgTrigger) return false;
        if (el === pgTrigger || pgTrigger.contains(el) || el.contains(pgTrigger)) return false;
        if (el.closest('table')) return false;
        const txt = (el.innerText || el.textContent || '').trim();
        if (!txt || txt.length > 120) return false;
        return pattern.test(txt);
      });
      return allCandidates.sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length)[0] || null;
    };

    const isPopupOpen = (pgTrigger) => {
      const opts = document.querySelectorAll('mat-option, md-option, [role="option"], .mat-option, .md-option, .mat-mdc-option');
      if (opts.length > 0) return true;
      return Boolean(findOptionInPopup(/(61\\s+Fahrzeugplanung|61000|61010|61300)/i, pgTrigger));
    };

    // Opens the dropdown cleanly with a SINGLE click (never double-toggling!)
    const openDropdown = async (pgTrigger) => {
      if (isPopupOpen(pgTrigger)) return true;
      const inner = pgTrigger.querySelector
        ? pgTrigger.querySelector('.mat-select-trigger, .mat-mdc-select-trigger, .md-select-value, [role="combobox"], [role="listbox"]')
        : null;
      if (inner && inner !== pgTrigger) {
        inner.click();
        await sleep(200);
        if (isPopupOpen(pgTrigger)) return true;
      }
      pgTrigger.click();
      await sleep(200);
      if (isPopupOpen(pgTrigger)) return true;
      const target = inner || pgTrigger;
      target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
      await sleep(200);
      return isPopupOpen(pgTrigger);
    };

    const TARGET_STATIONS = [
      { key: '61000', pattern: /61000.*Rettungswache\\s+M[üu]nchen/i, station: 'Sendling', label: '61000 Rettungswache München' },
      { key: '61010', pattern: /61010.*Obersendling/i, station: 'Obersendling', label: '61010 Rettungswache Obersendling' },
      { key: '61300', pattern: /61300.*Hohenbrunn/i, station: 'Hohenbrunn', label: '61300 Rettungswache Hohenbrunn' }
    ];

    const rosters = [];

    for (let i = 0; i < TARGET_STATIONS.length; i++) {
      const target = TARGET_STATIONS[i];
      const pgTrigger = findPlanungsgruppeTrigger();
      if (!pgTrigger) break;

      setStatus(\`⚡ Lese Wache \${i + 1}/3: \${target.label}...\`);

      const currentTriggerText = (pgTrigger.innerText || pgTrigger.textContent || pgTrigger.value || '').trim();
      const alreadySelected = target.pattern.test(currentTriggerText) &&
        document.querySelectorAll('tr').length > 3 &&
        !Array.from(document.querySelectorAll('tr')).some(r => /^M-J\\s*\\d/i.test((r.children[0]?.textContent || '').trim()));

      if (!alreadySelected) {
        await openDropdown(pgTrigger);

        let matchOpt = null;
        for (let w = 0; w < 18; w++) {
          matchOpt = findOptionInPopup(target.pattern, pgTrigger);
          if (matchOpt) break;
          await sleep(130);
          matchOpt = findOptionInPopup(target.pattern, pgTrigger);
          if (matchOpt) break;
          // Falls das Popup eine Scrollbar hat (z.B. ab 61010 / 61300), im Popup nach unten scrollen
          const scrollables = Array.from(document.querySelectorAll('div, ul, md-content, .mat-select-panel, .cdk-virtual-scroll-viewport')).filter(
            el => !el.closest('table') && el !== document.body && el.scrollHeight > el.clientHeight + 20 && el.clientHeight > 60 && el.clientHeight < 600
          );
          scrollables.forEach(s => { s.scrollTop += 220; });
        }

        if (matchOpt) {
          const prevSig = Array.from(document.querySelectorAll('tr')).slice(1, 6).map(r => (r.children[0]?.textContent || '').trim()).join('|');
          try { matchOpt.scrollIntoView({ block: 'nearest' }); } catch (e) {}
          await sleep(60);
          matchOpt.click();

          for (let w = 0; w < 30; w++) {
            await sleep(160);
            const newSig = Array.from(document.querySelectorAll('tr')).slice(1, 6).map(r => (r.children[0]?.textContent || '').trim()).join('|');
            if (newSig && newSig !== prevSig && !/^M-J\\s*\\d/i.test(newSig)) break;
          }
          await sleep(300);
        } else {
          document.body.click();
          await sleep(150);
          continue;
        }
      }

      const extracted = extractVisibleTable(target.station, yearMonth, monthLabel);
      if (extracted.colleagues.length > 0) {
        rosters.push(extracted);
      }
    }

    if (rosters.length === 0) {
      const single = extractVisibleTable(null, yearMonth, monthLabel);
      if (single.colleagues.length > 0) rosters.push(single);
      else if (initialSnap.colleagues.length > 0) rosters.push(initialSnap);
    }

    const payload = rosters.length > 1
      ? { multiStation: true, extractedAt: Date.now(), yearMonth, monthLabel, rosters, personalTimes }
      : { ...(rosters[0] || { yearMonth, monthLabel, station: 'Sendling', colleagues: [] }), extractedAt: Date.now() };

    const json = JSON.stringify(payload);
    copySync(json);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try { await navigator.clipboard.writeText(json); } catch (e) {}
    }

    if (window.opener && !window.opener.closed) {
      try {
        window.opener.postMessage({ type: 'CAREMAN_LIVE_SYNC_RESULT', payload }, '*');
      } catch (e) {}
    }

    const targetUrl = 'https://schicht.vjbackhaus.de/#careman=' + encodeURIComponent(json);
    banner.style.background = 'linear-gradient(135deg,#059669,#10b981)';
    setStatus(\`✅ \${rosters.length} \${rosters.length === 1 ? 'Wache' : 'Wachen'} (\${monthLabel}) ans Schichttagebuch übertragen!\`);

    const appWin = window.open(targetUrl, 'schichttagebuch_app');
    if (!appWin) {
      window.location.href = targetUrl;
    } else {
      try { appWin.focus(); } catch (e) {}
      setTimeout(() => banner.remove(), 6000);
    }
  } catch (err) {
    banner.style.background = '#dc2626';
    setStatus('⚠️ Fehler: ' + err.message);
    setTimeout(() => banner.remove(), 6000);
  }
})();`;

export const BOOKMARKLET_CODE = 'javascript:' + encodeURIComponent(SIEDA_EXTRACTOR_SCRIPT);
