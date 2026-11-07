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
  currentUser,
  store,
  addShifts,
  deleteShifts,
  ensureCodesAndTypes,
  onProgress
}) {
  const trimmed = (rawText || '').trim();
  let isMultiStation = false;
  let parsedMulti = null;

  if (trimmed.startsWith('{')) {
    try {
      const candidate = JSON.parse(trimmed);
      if (candidate && candidate.multiStation && Array.isArray(candidate.rosters) && candidate.rosters.length > 0) {
        isMultiStation = true;
        parsedMulti = candidate;
      }
    } catch {
      /* not multiStation JSON */
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
      activeCombined
    };

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('careman-oneclick-synced', { detail }));
    }

    return detail;
  }

  // Single-station payload
  const parsedRoster = await parseCareManHtml(rawText, onProgress);
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
    activeCombined
  };

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
  onProgress,
  openLivePortalIfNoNewClipboard = true
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
        sessionStorage.removeItem('pending_careman_import');
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
      /* ignore sessionStorage errors */
    }
  }

  // 2. Try reading Clipboard directly (if fresh CareMan data was copied)
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
    try {
      const clipText = await navigator.clipboard.readText();
      if (clipText && looksLikeCareManData(clipText)) {
        let lastSig = null;
        try {
          lastSig = sessionStorage.getItem('last_imported_careman_sig');
        } catch {
          /* ignore */
        }
        const currentSig = `${clipText.length}:${clipText.slice(0, 120)}:${clipText.slice(-120)}`;
        const isFreshClipboard = currentSig !== lastSig;

        if (isFreshClipboard || !openLivePortalIfNoNewClipboard) {
          const res = await importCareManPayloadAndSync({
            rawText: clipText,
            stationOverride,
            currentUser,
            store,
            addShifts,
            deleteShifts,
            ensureCodesAndTypes,
            onProgress
          });

          try {
            sessionStorage.setItem('last_imported_careman_sig', currentSig);
          } catch {
            /* ignore */
          }

          const personalMsg =
            res.transferredCount > 0
              ? ` & ${res.transferredCount} eigene Dienste (${res.withPartnersCount}x mit PartnerIn) direkt ins Journal übernommen!`
              : ` (${res.totalShifts} Team-Dienste gespeichert)!`;

          return {
            ...res,
            message: `✅ CareMan Live-Sync: ${res.monthLabel} (Wache ${res.targetStation}) eingelesen${personalMsg}`
          };
        }
      }
    } catch {
      // Clipboard permission denied or empty -> continue
    }
  }

  // 3. If user clicked 1-Click to fetch live changes from CareMan, open CareMan Live Portal with Auto-Pilot
  if (openLivePortalIfNoNewClipboard && typeof window !== 'undefined') {
    const now = new Date();
    const defaultYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const ym = targetYearMonth || localStorage.getItem('schichten_selected_year_month') || defaultYM;
    openCareManLiveWindow(ym);
    return {
      source: 'live_portal_opened',
      yearMonth: ym,
      transferredCount: 0,
      message: '🔄 CareMan Live-Abruf gestartet: Bitte im geöffneten CareMan-Tab (falls nötig Airlock bestätigen) 1x auf das Lesezeichen klicken – alle 3 Wachen (61000, 61010, 61300) werden automatisch übertragen!'
    };
  }

  // 4. Fallback: Sync with Cloud & transfer from active Team Roster for targetYearMonth
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
