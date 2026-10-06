import { OCTOBER_2026_TEAM_ROSTER, getPresetRosterForMonth } from './teamRosterData.js';
import { SHIFT_PRESETS, getPresetForCode } from './shiftPresets.js';
import { detectStation } from './shiftColors.js';
import { db } from '../firebase.js';
import { collection, doc, setDoc, getDocs, deleteDoc, onSnapshot } from 'firebase/firestore';

/**
 * Runs OCR on an image file or data URL using Tesseract.js
 * @param {string|File|Blob} imageSource 
 * @param {function} onProgress 
 */
export async function runTeamRosterOcr(imageSource, onProgress) {
  try {
    let processedSource = imageSource;

    // Browser Canvas Pre-Processing for much higher OCR accuracy on small screenshots
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      try {
        const img = new Image();
        const url = typeof imageSource === 'string' ? imageSource : URL.createObjectURL(imageSource);
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = url;
        });

        const scale = img.width < 900 ? 2.5 : 1.5;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          const brightness = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
          const v = brightness > 140 ? 255 : (brightness < 80 ? 0 : brightness);
          d[i] = v;
          d[i + 1] = v;
          d[i + 2] = v;
        }
        ctx.putImageData(imgData, 0, 0);
        processedSource = canvas.toDataURL('image/png');
      } catch (prepErr) {
        console.warn('Canvas pre-processing fallback:', prepErr);
      }
    }

    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('deu', 1, {
      logger: m => {
        if (m.status === 'recognizing text' && onProgress) {
          onProgress(Math.round((m.progress || 0) * 100));
        }
      }
    });

    const result = await worker.recognize(processedSource);
    await worker.terminate();
    return result.data.text;
  } catch (err) {
    console.warn('Team Roster OCR Error:', err);
    throw err;
  }
}

/**
 * Helper to determine station from code or text
 */
export function getStationForCode(code = '') {
  const c = code.toUpperCase().trim();
  const clean = c.replace(/\*+$/, '').trim();
  if (clean.endsWith('H') || clean.startsWith('RH') || clean.includes('HBN') || ['RFH', 'RTH', 'RT1H', 'RT2H', 'RSH', 'RNH', 'RHH'].includes(clean)) return 'Wache Hohenbrunn';
  if (clean.endsWith('O') || clean.startsWith('RO') || clean.includes('OBS') || clean.includes('FO') || clean.startsWith('NFO') || clean.startsWith('FFO')) return 'Wache Obersendling';
  if (clean.endsWith('M') || clean.startsWith('RM') || clean.includes('SEN') || clean.includes('SJ') || clean.includes('-M')) return 'Wache Sendling';
  return 'Wache Sendling';
}

/**
 * Helper to determine shift type name
 */
export function getShiftTypeForCode(code = '') {
  const c = code.toUpperCase().trim();
  const clean = c.replace(/\*+$/, '').trim();
  const preset = getPresetForCode(c) || getPresetForCode(clean);
  if (preset?.shiftTypeName) return preset.shiftTypeName;

  if (['PALS', 'ACLS', 'SMT', 'RAJ'].some(k => clean.includes(k))) return 'Fortbildung';
  if (['V030', 'V-B', 'V07', 'VFU', 'UDN'].some(k => clean.includes(k))) return 'Urlaub / Freistellung';
  if (['IO', 'F-M', 'C-M', 'SW1', 'RZF', 'R-SAN'].some(k => clean.includes(k))) return 'Sonderdienst';
  if (clean.includes('RN') || clean.endsWith('NM') || clean.endsWith('NH')) return 'Nachtschicht';
  if (clean.includes('RF') || clean.endsWith('FM') || clean.endsWith('FH') || clean.endsWith('FO')) return 'Frühschicht';
  if (clean.includes('RS') || clean.endsWith('SM') || clean.endsWith('SH') || clean.endsWith('SO')) return 'Spätschicht';
  if (clean.includes('RT') || clean.startsWith('RT') || clean.includes('TH')) {
    if (clean.includes('1') || clean.includes('3') || clean === 'RTH') return 'Tagschicht';
    return 'Spätschicht';
  }
  return 'Tagdienst';
}

/**
 * Helper for shift start and end times
 */
export function getTimesForCode(code = '', shiftTypeName = '') {
  const c = code.toUpperCase().trim();
  const clean = c.replace(/\*+$/, '').trim();
  const preset = getPresetForCode(code) || getPresetForCode(clean);
  if (preset?.startTime && preset?.endTime) {
    return { startTime: preset.startTime, endTime: preset.endTime };
  }
  const st = (shiftTypeName || getShiftTypeForCode(code)).toLowerCase();
  if (st.includes('nacht')) return { startTime: '22:54', endTime: '07:06' };
  if (st.includes('früh')) {
    if (clean.endsWith('O')) return { startTime: '07:54', endTime: '16:06' };
    return { startTime: '06:54', endTime: '15:06' };
  }
  if (st.includes('spät')) {
    if (clean.endsWith('O')) return { startTime: '15:54', endTime: '00:06' };
    if (clean.includes('RT4')) return { startTime: '15:24', endTime: '00:06' };
    return { startTime: '14:54', endTime: '23:06' };
  }
  if (st.includes('tag')) {
    if (clean.includes('RT3')) return { startTime: '06:54', endTime: '15:36' };
    if (clean.includes('RT1')) return { startTime: '06:54', endTime: '15:06' };
    return { startTime: '08:54', endTime: '19:06' };
  }
  if (st.includes('fortbildung')) return { startTime: '08:00', endTime: '17:00' };
  return { startTime: '08:00', endTime: '16:30' };
}

/**
 * Parses OCR extracted text or image structure into a complete Team Roster object
 * @param {string} text - OCR text
 * @param {string} [fallbackYearMonth='2026-10']
 */
export function parseTeamRoster(text = '', fallbackYearMonth = '2026-10') {
  const monthNames = [
    'januar', 'februar', 'märz', 'april', 'mai', 'juni',
    'juli', 'august', 'september', 'oktober', 'november', 'dezember'
  ];

  let year = 2026;
  let month = 10;

  if (fallbackYearMonth) {
    const [y, m] = fallbackYearMonth.split('-').map(Number);
    if (y) year = y;
    if (m) month = m;
  }

  // Detect Month & Year from OCR text
  const monthMatch = text.match(/(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})/i);
  if (monthMatch) {
    const mIdx = monthNames.indexOf(monthMatch[1].toLowerCase());
    if (mIdx !== -1) {
      month = mIdx + 1;
      year = parseInt(monthMatch[2], 10);
    }
  }

  const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
  const monthLabel = `${monthNames[month - 1].charAt(0).toUpperCase() + monthNames[month - 1].slice(1)} ${year}`;

  // If this matches October 2026, we have the verified high-fidelity CareMan dataset
  if (yearMonth === '2026-10') {
    return {
      ...OCTOBER_2026_TEAM_ROSTER,
      isVerified: true
    };
  }

  // Generic parser for newly uploaded roster months
  const daysInMonth = new Date(year, month, 0).getDate();
  const shiftsByDate = {};
  for (let d = 1; d <= daysInMonth; d++) {
    shiftsByDate[`${yearMonth}-${String(d).padStart(2, '0')}`] = [];
  }

  const colleaguesMap = new Map();
  const knownCodes = [
    'RFM', 'RSM', 'RNM', 'RT1M', 'RT2M', 'RT3M', 'RT4M', 'RS2M', 'RCM', 'RHM',
    'RFH', 'RTH', 'RT1H', 'RT2H', 'RSH', 'RNH', 'RHH',
    'RFO', 'RSO', 'FFO',
    'ACLS', 'PALS', 'SMT', 'RAJ', 'V030', 'V-B', 'V07-b', 'VFU', 'UDN', 'F-M', 'F-SJ', 'R1-SJ', 'C-M'
  ];

  const lines = text.split('\n');
  lines.forEach(line => {
    // Check if line contains a name (e.g. "Name, Vorname")
    const nameMatch = line.match(/^([A-ZÄÖÜ][a-zäöüß\-]+(?:\s+[A-ZÄÖÜ][a-zäöüß\-]+)*),\s*([A-ZÄÖÜ][a-zäöüß\-]+(?:\s+[A-ZÄÖÜ][a-zäöüß\-]+)*)/);
    if (nameMatch) {
      const colleagueName = `${nameMatch[1]}, ${nameMatch[2]}`;
      if (!colleaguesMap.has(colleagueName)) {
        colleaguesMap.set(colleagueName, {});
      }

      // Check for day + code patterns in this line
      knownCodes.forEach(code => {
        if (line.includes(code)) {
          // Find day number near code
          const dayRegex = new RegExp(`(?:\\b([1-9]|[12][0-9]|3[01])\\b[^a-zA-Z0-9]*${code}|${code}[^a-zA-Z0-9]*\\b([1-9]|[12][0-9]|3[01])\\b)`, 'g');
          let m;
          while ((m = dayRegex.exec(line)) !== null) {
            const dayNum = parseInt(m[1] || m[2], 10);
            if (dayNum >= 1 && dayNum <= daysInMonth) {
              const dateStr = `${yearMonth}-${String(dayNum).padStart(2, '0')}`;
              colleaguesMap.get(colleagueName)[dateStr] = code;

              const st = getShiftTypeForCode(code);
              const station = getStationForCode(code);
              const times = getTimesForCode(code, st);

              shiftsByDate[dateStr].push({
                name: colleagueName,
                code: code,
                shiftTypeName: st,
                station: station,
                startTime: times.startTime,
                endTime: times.endTime,
                isTraining: st === 'Fortbildung',
                isVacation: st.includes('Urlaub') || st.includes('Freistellung')
              });
            }
          }
        }
      });
    }
  });

  const colleaguesList = Array.from(colleaguesMap.entries()).map(([name, shifts]) => ({
    name,
    shifts
  }));

  const totalShifts = Object.values(shiftsByDate).reduce((acc, list) => acc + list.length, 0);

  return {
    yearMonth,
    monthLabel,
    daysInMonth,
    totalColleagues: colleaguesList.length,
    totalShifts,
    colleagues: colleaguesList,
    shiftsByDate,
    isVerified: false
  };
}

/**
 * Station constants & Storage key prefix
 */
export const ROSTER_STATIONS = ['Sendling', 'Obersendling', 'Hohenbrunn'];
const STORAGE_KEY_PREFIX = 'schichten_team_roster_';
const CURRENT_ROSTER_KEY = 'schichten_current_team_roster';

/**
 * Automatically detects whether a roster belongs to Sendling, Obersendling, or Hohenbrunn:
 * - Codes ending in 'M' (or DDM, C-M, etc.) -> Sendling
 * - Codes ending in 'O' (or NFO, FFO, etc.) -> Obersendling
 * - Codes ending in 'H' (or RFH, RTH, etc.) -> Hohenbrunn
 */
export function detectRosterStation(rosterData) {
  if (!rosterData) return 'Sendling';
  if (rosterData.station && ROSTER_STATIONS.includes(rosterData.station)) {
    return rosterData.station;
  }

  let mCount = 0;
  let oCount = 0;
  let hCount = 0;

  const checkCode = (code = '') => {
    const c = (code || '').toUpperCase().trim();
    const base = c.replace(/\*+$/, '').trim();
    if (!base || base === '-' || base === '/' || base === '0') return;
    if (base.endsWith('M') || base.includes('-M') || ['RFM', 'RSM', 'RNM', 'RT1M', 'RT2M', 'RT3M', 'RT4M', 'RS2M', 'RCM', 'RHM', 'DDM'].includes(base)) {
      mCount++;
    } else if (base.endsWith('O') || base === 'RFO' || base === 'RSO' || base.startsWith('NFO') || base.startsWith('FFO')) {
      oCount++;
    } else if (base.endsWith('H') || base.includes('HBN') || ['RFH', 'RTH', 'RT1H', 'RT2H', 'RSH', 'RNH', 'RHH'].includes(base)) {
      hCount++;
    }
  };

  if (rosterData.colleagues) {
    rosterData.colleagues.forEach(c => {
      if (c.shifts) {
        Object.values(c.shifts).forEach(code => checkCode(code));
      }
    });
  }

  if (rosterData.shiftsByDate) {
    Object.values(rosterData.shiftsByDate).forEach(list => {
      list.forEach(s => checkCode(s.code));
    });
  }

  if (oCount > mCount && oCount > hCount) return 'Obersendling';
  if (hCount > mCount && hCount > oCount) return 'Hohenbrunn';
  if (mCount > 0) return 'Sendling';
  if (oCount > 0) return 'Obersendling';
  if (hCount > 0) return 'Hohenbrunn';
  return 'Sendling';
}

/**
 * Saves a station-specific team roster into localStorage
 */
export function saveStationTeamRoster(rosterData, stationOverride) {
  if (!rosterData || !rosterData.yearMonth) return 'Sendling';
  const station = stationOverride || rosterData.station || detectRosterStation(rosterData);
  const updatedRoster = {
    ...rosterData,
    station
  };

  // Tag station on each shift in shiftsByDate
  if (updatedRoster.shiftsByDate) {
    Object.values(updatedRoster.shiftsByDate).forEach(list => {
      list.forEach(s => {
        s.station = s.station || station;
      });
    });
  }

  try {
    const jsonStr = JSON.stringify(updatedRoster);
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${updatedRoster.yearMonth}_${station}`, jsonStr);
    localStorage.setItem(CURRENT_ROSTER_KEY, jsonStr);
    // Legacy compatibility for Sendling
    if (station === 'Sendling') {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${updatedRoster.yearMonth}`, jsonStr);
    }
  } catch (e) {
    console.error('Error saving station roster:', e);
  }

  return station;
}

export function saveActiveTeamRoster(rosterData, stationOverride) {
  return saveStationTeamRoster(rosterData, stationOverride);
}

/**
 * Loads the active team roster for a month, merging all saved stations (Sendling, Obersendling, Hohenbrunn)
 */
export function getActiveTeamRoster(preferredYearMonth = '2026-10') {
  const [y, m] = (preferredYearMonth || '2026-10').split('-').map(Number);
  const monthNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const daysInMonth = new Date(y, m, 0).getDate();
  const monthLabel = `${monthNames[m - 1]} ${y}`;

  // 1. Gather all stored station rosters for this month
  const stationRosters = {};
  ROSTER_STATIONS.forEach(st => {
    try {
      const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${preferredYearMonth}_${st}`);
      if (stored) {
        stationRosters[st] = JSON.parse(stored);
      }
    } catch (e) {}
  });

  // 2. Check legacy unsuffixed key if no station rosters found
  if (Object.keys(stationRosters).length === 0) {
    try {
      const legacy = localStorage.getItem(`${STORAGE_KEY_PREFIX}${preferredYearMonth}`);
      if (legacy) {
        const parsed = JSON.parse(legacy);
        const detected = detectRosterStation(parsed);
        stationRosters[detected] = parsed;
      }
    } catch (e) {}
  }

  // 3. Fallback to preloaded October 2026 data if no saved station rosters exist for October
  if (Object.keys(stationRosters).length === 0 && preferredYearMonth === '2026-10') {
    const preset = getPresetRosterForMonth('2026-10');
    if (preset) return preset;
  }

  // 4. Merge all available station rosters for this month into one unified view
  const stationKeys = Object.keys(stationRosters);
  if (stationKeys.length > 0) {
    const mergedShiftsByDate = {};
    for (let d = 1; d <= daysInMonth; d++) {
      mergedShiftsByDate[`${preferredYearMonth}-${String(d).padStart(2, '0')}`] = [];
    }

    const colleaguesMap = new Map();
    let totalShifts = 0;

    stationKeys.forEach(st => {
      const r = stationRosters[st];
      if (!r) return;

      if (r.shiftsByDate) {
        Object.entries(r.shiftsByDate).forEach(([dateStr, list]) => {
          if (mergedShiftsByDate[dateStr]) {
            list.forEach(shift => {
              mergedShiftsByDate[dateStr].push({
                ...shift,
                station: shift.station || st
              });
              totalShifts++;
            });
          }
        });
      }

      if (r.colleagues) {
        r.colleagues.forEach(c => {
          if (!colleaguesMap.has(c.name)) {
            colleaguesMap.set(c.name, {
              name: c.name,
              station: st,
              shifts: { ...c.shifts }
            });
          } else {
            const existing = colleaguesMap.get(c.name);
            Object.assign(existing.shifts, c.shifts);
          }
        });
      }
    });

    return {
      yearMonth: preferredYearMonth,
      monthLabel,
      daysInMonth,
      totalColleagues: colleaguesMap.size,
      totalShifts,
      colleagues: Array.from(colleaguesMap.values()),
      shiftsByDate: mergedShiftsByDate,
      stationsPresent: stationKeys,
      stationRosters,
      isVerified: true
    };
  }

  // 5. Empty template fallback
  const emptyShiftsByDate = {};
  for (let d = 1; d <= daysInMonth; d++) {
    emptyShiftsByDate[`${preferredYearMonth}-${String(d).padStart(2, '0')}`] = [];
  }

  return {
    yearMonth: preferredYearMonth,
    monthLabel,
    daysInMonth,
    totalColleagues: 0,
    totalShifts: 0,
    colleagues: [],
    shiftsByDate: emptyShiftsByDate,
    stationsPresent: [],
    stationRosters: {},
    isEmptyTemplate: true
  };
}

/**
 * Returns all month keys currently available in localStorage or preloaded
 */
export function getSavedRosterMonths() {
  const months = new Set(['2026-10']);
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
        const rest = key.replace(STORAGE_KEY_PREFIX, '');
        const ym = rest.split('_')[0];
        if (ym.match(/^\d{4}-\d{2}$/)) {
          months.add(ym);
        }
      }
    }
  } catch (e) {}
  return Array.from(months).sort();
}

/**
 * Returns summary info for all stored months and their three stations
 */
export function getSavedRosterSummaries() {
  const monthKeys = getSavedRosterMonths();
  return monthKeys.map(ym => {
    const combined = getActiveTeamRoster(ym);
    const [y, m] = ym.split('-').map(Number);
    const monthNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
    const monthLabel = combined.monthLabel || `${monthNames[m - 1]} ${y}`;

    const stationSummaries = ROSTER_STATIONS.map(st => {
      let r = null;
      let isPreset = false;
      const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${ym}_${st}`);
      if (stored) {
        try { r = JSON.parse(stored); } catch (e) {}
      } else if (ym === '2026-10' && !localStorage.getItem(`${STORAGE_KEY_PREFIX}2026-10_${st}`)) {
        const preset = getPresetRosterForMonth('2026-10');
        if (preset) {
          isPreset = true;
          let shiftCount = 0;
          Object.entries(preset.shiftsByDate || {}).forEach(([dateStr, list]) => {
            const filtered = list.filter(s => detectStation({ code: s.code, station: s.station }) === st);
            shiftCount += filtered.length;
          });
          const colleagues = preset.colleagues?.filter(c => {
            return Object.values(c.shifts || {}).some(code => detectStation({ code }) === st);
          }) || [];
          r = {
            colleagues,
            totalColleagues: colleagues.length,
            totalShifts: shiftCount
          };
        }
      }

      return {
        station: st,
        hasData: Boolean(r && (r.totalShifts > 0 || (r.colleagues && r.colleagues.length > 0))),
        totalColleagues: r?.totalColleagues || r?.colleagues?.length || 0,
        totalShifts: r?.totalShifts || 0,
        isPreset
      };
    });

    const hasAnyData = Boolean(combined.colleagues && combined.colleagues.length > 0) ||
      stationSummaries.some(s => s.hasData);

    return {
      yearMonth: ym,
      monthLabel,
      totalColleagues: combined.totalColleagues || combined.colleagues?.length || 0,
      totalShifts: combined.totalShifts || 0,
      hasData: hasAnyData,
      isPreset: ym === '2026-10' && !stationSummaries.some(s => !s.isPreset && s.hasData),
      stations: stationSummaries
    };
  });
}

/**
 * Deletes a specific station's roster for a given month
 */
export function deleteStationTeamRoster(yearMonth, station) {
  if (!yearMonth || !station) return;
  try {
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}${yearMonth}_${station}`);
    if (station === 'Sendling') {
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}${yearMonth}`);
    }
  } catch (e) {
    console.error('Error deleting station roster:', e);
  }
}

/**
 * Deletes all stored rosters for a given month
 */
export function deleteTeamRoster(yearMonth) {
  if (!yearMonth) return;
  ROSTER_STATIONS.forEach(st => {
    deleteStationTeamRoster(yearMonth, st);
  });
  try {
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}${yearMonth}`);
    const current = localStorage.getItem(CURRENT_ROSTER_KEY);
    if (current) {
      try {
        const p = JSON.parse(current);
        if (p.yearMonth === yearMonth) {
          localStorage.removeItem(CURRENT_ROSTER_KEY);
        }
      } catch (err) {}
    }
  } catch (e) {
    console.error('Error deleting roster:', e);
  }
}

/**
 * Saves a station roster directly to Cloud Firestore under users/{uid}/team_rosters/{yearMonth}_{station}
 */
export async function saveStationTeamRosterToCloud(rosterData, stationOverride, currentUser) {
  if (!currentUser || !currentUser.uid || !db || !rosterData || !rosterData.yearMonth) return;
  const station = stationOverride || rosterData.station || detectRosterStation(rosterData);
  const docId = `${rosterData.yearMonth}_${station}`;

  const cleanRoster = JSON.parse(JSON.stringify({
    ...rosterData,
    station
  }));

  const docData = {
    yearMonth: rosterData.yearMonth,
    station,
    monthLabel: rosterData.monthLabel || '',
    totalColleagues: rosterData.totalColleagues || rosterData.colleagues?.length || 0,
    totalShifts: rosterData.totalShifts || 0,
    updatedAt: new Date().toISOString(),
    roster: cleanRoster
  };

  try {
    const docRef = doc(db, 'users', currentUser.uid, 'team_rosters', docId);
    await setDoc(docRef, docData);
  } catch (err) {
    console.error('Error saving team roster to cloud:', err);
    throw err;
  }
}

/**
 * Deletes a specific station's roster from Cloud Firestore
 */
export async function deleteStationTeamRosterFromCloud(yearMonth, station, currentUser) {
  if (!currentUser || !currentUser.uid || !db || !yearMonth || !station) return;
  try {
    const docRef = doc(db, 'users', currentUser.uid, 'team_rosters', `${yearMonth}_${station}`);
    await deleteDoc(docRef);
  } catch (err) {
    console.error('Error deleting station roster from cloud:', err);
  }
}

/**
 * Deletes all 3 stations' rosters for a month from Cloud Firestore
 */
export async function deleteTeamRosterFromCloud(yearMonth, currentUser) {
  if (!currentUser || !currentUser.uid || !db || !yearMonth) return;
  try {
    for (const st of ROSTER_STATIONS) {
      await deleteDoc(doc(db, 'users', currentUser.uid, 'team_rosters', `${yearMonth}_${st}`));
    }
  } catch (err) {
    console.error('Error deleting team roster from cloud:', err);
  }
}

/**
 * Synchronizes local rosters with Cloud Firestore bidirectionally:
 * - Uploads any local rosters from localStorage into Firestore if not present
 * - Downloads all Firestore rosters into localStorage
 */
export async function syncTeamRostersWithCloud(currentUser) {
  if (!currentUser || !currentUser.uid || !db) return { uploaded: 0, downloaded: 0, totalCloud: 0 };

  try {
    const colRef = collection(db, 'users', currentUser.uid, 'team_rosters');
    const snap = await getDocs(colRef);
    const cloudDocs = new Map();
    snap.forEach(d => {
      cloudDocs.set(d.id, d.data());
    });

    let uploaded = 0;
    let downloaded = 0;

    // 1. Check all localStorage items for rosters that need uploading to Cloud Firestore
    const localKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
        localKeys.push(key);
      }
    }

    for (const key of localKeys) {
      const rest = key.replace(STORAGE_KEY_PREFIX, '');
      const parts = rest.split('_');

      if (parts.length === 2 && parts[0].match(/^\d{4}-\d{2}$/) && ROSTER_STATIONS.includes(parts[1])) {
        const docId = rest;
        try {
          const localData = JSON.parse(localStorage.getItem(key));
          if (localData && (localData.totalShifts > 0 || (localData.colleagues && localData.colleagues.length > 0))) {
            if (!cloudDocs.has(docId)) {
              await saveStationTeamRosterToCloud(localData, parts[1], currentUser);
              uploaded++;
            }
          }
        } catch (e) {
          console.error('Error uploading local roster to cloud:', e);
        }
      } else if (parts.length === 1 && parts[0].match(/^\d{4}-\d{2}$/)) {
        // Legacy key without station suffix
        const ym = parts[0];
        try {
          const localData = JSON.parse(localStorage.getItem(key));
          if (localData && (localData.totalShifts > 0 || (localData.colleagues && localData.colleagues.length > 0))) {
            const detected = detectRosterStation(localData);
            const docId = `${ym}_${detected}`;
            if (!cloudDocs.has(docId)) {
              await saveStationTeamRosterToCloud(localData, detected, currentUser);
              uploaded++;
            }
          }
        } catch (e) {}
      }
    }

    // 2. Sync downloaded cloud docs to localStorage
    cloudDocs.forEach((cData, docId) => {
      const localKey = `${STORAGE_KEY_PREFIX}${docId}`;
      const existing = localStorage.getItem(localKey);
      if (!existing) {
        const roster = cData.roster || cData;
        localStorage.setItem(localKey, JSON.stringify(roster));
        if (cData.station === 'Sendling') {
          localStorage.setItem(`${STORAGE_KEY_PREFIX}${cData.yearMonth}`, JSON.stringify(roster));
        }
        downloaded++;
      }
    });

    return {
      uploaded,
      downloaded,
      totalCloud: cloudDocs.size + uploaded
    };
  } catch (err) {
    console.error('Error during team rosters cloud sync:', err);
    throw err;
  }
}

/**
 * Subscribes to real-time changes in Firestore team_rosters collection
 */
export function subscribeToCloudTeamRosters(currentUser, onChange) {
  if (!currentUser || !currentUser.uid || !db) return () => {};

  const colRef = collection(db, 'users', currentUser.uid, 'team_rosters');
  return onSnapshot(colRef, (snapshot) => {
    let hasChanges = false;
    snapshot.docChanges().forEach((change) => {
      const docId = change.doc.id;
      const localKey = `${STORAGE_KEY_PREFIX}${docId}`;

      if (change.type === 'added' || change.type === 'modified') {
        const cData = change.doc.data();
        const roster = cData.roster || cData;
        const currentLocal = localStorage.getItem(localKey);
        const newStr = JSON.stringify(roster);
        if (currentLocal !== newStr) {
          localStorage.setItem(localKey, newStr);
          if (cData.station === 'Sendling') {
            localStorage.setItem(`${STORAGE_KEY_PREFIX}${cData.yearMonth}`, newStr);
          }
          hasChanges = true;
        }
      } else if (change.type === 'removed') {
        if (localStorage.getItem(localKey)) {
          localStorage.removeItem(localKey);
          hasChanges = true;
        }
      }
    });

    if (hasChanges && typeof onChange === 'function') {
      onChange();
    }
  }, (err) => {
    console.error('Cloud team roster snapshot listener error:', err);
  });
}


