import { OCTOBER_2026_TEAM_ROSTER, getPresetRosterForMonth } from './teamRosterData.js';
import { SHIFT_PRESETS, getPresetForCode, CAREMAN_OCTOBER_2026_EXTRA } from './shiftPresets.js';
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
 * Cleans a single shift code and normalizes truncated codes (e.g. "RD" -> "RDÜ")
 */
export function cleanSingleShiftCode(c) {
  if (!c) return '';
  let code = String(c).trim().toUpperCase().replace(/[^A-ZÄÖÜ0-9\-*]/g, '');
  if (code === 'RD') return 'RDÜ';
  if (code === 'RD*') return 'RDÜ*';
  return code;
}

/**
 * Splits and cleans multiple shift codes from a single cell string or array.
 * Supports delimiters: comma, slash, semicolon, plus, pipe, newline, whitespace.
 * Also splits non-delimited compound codes (e.g. "RDRT2M", "RDÜRT2M", "RT2MRD", "RT2MRDÜ").
 * Preserves German characters (ÄÖÜ) and asterisks (*).
 * Normalizes "RD" to "RDÜ".
 * Example: "RDÜ,RT2M" -> ["RDÜ", "RT2M"]
 * Example: "RDRT2M"   -> ["RDÜ", "RT2M"]
 * Example: "RD"       -> ["RDÜ"]
 */
export const VALID_PERSONAL_SHIFT_CODE_REGEX = /^(RF[MHO]|RS\d?[MHO]|RN[MHO]|RT\d?[MHO]|RC[MHO]|RH[MHO]|FFO|NFO|DDM|T[1-4][MHO]|RDÜ?|BDR|LGI|ACLS|PALS|SMT|RAJ|SW\d?|RZF|R-SAN)$/i;

export function isValidPersonalShiftCode(rawCode = '') {
  const base = String(rawCode || '').replace(/\*+$/, '').trim().toUpperCase();
  if (!base || base.length < 2 || base.length > 6) return false;
  if (!/[A-ZÄÖÜ]/.test(base)) return false;
  if (/^[-_0]+$/.test(base)) return false;
  if (/^KW\d*$/i.test(base)) return false;
  return VALID_PERSONAL_SHIFT_CODE_REGEX.test(base) || Boolean(SHIFT_PRESETS[base]);
}

export function splitShiftCodes(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.flatMap(r => splitShiftCodes(r));
  }
  const str = String(raw).trim();
  if (!str) return [];
  const tokens = str.split(/[,;/+|\\\n\r]+/);
  const result = [];

  const stdPattern = '(?:RF[MHO]|RS[MHO]|RN[MHO]|RT[1-4]?[MHO]|RC[MH]|RH[MH]|FFO|NFO|DDM|T[1-4][MHO]|LGI|BDR)';

  tokens.forEach(tok => {
    let t = tok.trim();
    if (!t) return;
    const subTokens = t.split(/\s+/);
    subTokens.forEach(st => {
      let code = st.trim().toUpperCase();
      if (!code || code === '-' || code === '--' || code === '/' || code === '0' || code === '00' || code === 'FREI') return;
      code = code.replace(/[^A-ZÄÖÜ0-9\-*]/g, '');
      const baseOnly = code.replace(/\*+$/, '');
      if (baseOnly.length < 2 || baseOnly.length > 10) return;
      if (!/[A-ZÄÖÜ]/.test(baseOnly)) return;
      if (/^[-_0]+$/.test(baseOnly) || /^KW\d*$/i.test(baseOnly)) return;

      // 1. Prefix compound: (RD|RDÜ|ÜB) + standard shift (e.g. "RDRT2M", "RDÜRT2M*")
      const prefixMatch = code.match(new RegExp('^(RD|RDÜ|ÜB)(' + stdPattern + ')(\\*?)$'));
      if (prefixMatch) {
        const c1 = prefixMatch[1] === 'RD' ? 'RDÜ' : prefixMatch[1];
        const c2 = prefixMatch[2] + (prefixMatch[3] || '');
        result.push(cleanSingleShiftCode(c1));
        result.push(cleanSingleShiftCode(c2));
        return;
      }

      // 2. Suffix compound: standard shift + (RD|RDÜ|ÜB) (e.g. "RT2MRD", "RT2MRDÜ*")
      const suffixMatch = code.match(new RegExp('^(' + stdPattern + ')(RD|RDÜ|ÜB)(\\*?)$'));
      if (suffixMatch) {
        const c1 = suffixMatch[1];
        const c2 = (suffixMatch[2] === 'RD' ? 'RDÜ' : suffixMatch[2]) + (suffixMatch[3] || '');
        result.push(cleanSingleShiftCode(c1));
        result.push(cleanSingleShiftCode(c2));
        return;
      }

      // 3. Two standard shifts concatenated without delimiter: e.g. "RFMRT2M"
      const twoStdMatch = code.match(new RegExp('^(' + stdPattern + ')(' + stdPattern + ')(\\*?)$'));
      if (twoStdMatch) {
        result.push(cleanSingleShiftCode(twoStdMatch[1]));
        result.push(cleanSingleShiftCode(twoStdMatch[2] + (twoStdMatch[3] || '')));
        return;
      }

      if (baseOnly.length > 6) return;
      result.push(cleanSingleShiftCode(code));
    });
  });

  return result;
}

/**
 * Normalizes all shifts in a roster, ensuring any cell or entry with multiple shift codes
 * (e.g. "RDÜ,RT2M" or un-delimited "RDRT2M") is automatically split into separate individual shift objects for that day.
 * Applies as a universal check to all days, colleagues and shifts.
 */
export function normalizeRosterMultipleShifts(roster) {
  if (!roster || !roster.shiftsByDate) return roster;

  let totalShifts = 0;
  const normalizedShiftsByDate = {};
  const seenShiftsByDate = {};

  Object.entries(roster.shiftsByDate).forEach(([dateStr, list]) => {
    normalizedShiftsByDate[dateStr] = [];
    seenShiftsByDate[dateStr] = new Set();
    if (Array.isArray(list)) {
      list.forEach(shift => {
        if (!shift || !shift.code) return;
        const codes = splitShiftCodes(shift.code);
        if (codes.length === 0) return;

        codes.forEach(c => {
          const dedupeKey = `${(shift.name || '').toLowerCase()}_${c}`;
          if (seenShiftsByDate[dateStr].has(dedupeKey)) return;
          seenShiftsByDate[dateStr].add(dedupeKey);

          const st = getShiftTypeForCode(c);
          const station = getStationForCode(c, shift.station || roster.station || 'Sendling');
          const times = (shift.startTime && shift.endTime && codes.length <= 1 && c === shift.code)
            ? { startTime: shift.startTime, endTime: shift.endTime }
            : getTimesForCode(c, st);

          normalizedShiftsByDate[dateStr].push({
            ...shift,
            code: c,
            shiftTypeName: st,
            station: station,
            startTime: times.startTime,
            endTime: times.endTime,
            isTraining: st === 'Fortbildung',
            isVacation: st.includes('Urlaub') || st.includes('Freistellung')
          });
          totalShifts++;
        });
      });
    }
  });

  // Also normalize roster.colleagues entries so they reflect split & cleaned codes
  const normalizedColleagues = Array.isArray(roster.colleagues)
    ? roster.colleagues.map(c => {
        if (!c || !c.shifts) return c;
        const newShifts = {};
        Object.entries(c.shifts).forEach(([dStr, codeVal]) => {
          const codes = splitShiftCodes(codeVal);
          if (codes.length > 0) {
            newShifts[dStr] = codes.join(', ');
          }
        });
        return {
          ...c,
          shifts: newShifts
        };
      })
    : roster.colleagues;

  return {
    ...roster,
    totalShifts,
    colleagues: normalizedColleagues,
    shiftsByDate: normalizedShiftsByDate
  };
}

/**
 * Helper to determine station from code or text
 */
export function getStationForCode(code = '', fallbackStation = 'Sendling') {
  const c = code.toUpperCase().trim();
  const clean = c.replace(/\*+$/, '').trim();
  if (clean.endsWith('H') || clean.startsWith('RH') || clean.includes('HBN') || ['RFH', 'RTH', 'RT1H', 'RT2H', 'RSH', 'RNH', 'RHH', 'RCH'].includes(clean)) return 'Wache Hohenbrunn';
  if (clean.endsWith('O') || clean.startsWith('RO') || clean.includes('OBS') || clean.includes('FO') || clean.startsWith('NFO') || clean.startsWith('FFO')) return 'Wache Obersendling';
  if (clean.endsWith('M') || clean.startsWith('RM') || clean.includes('SEN') || clean.includes('SJ') || clean.includes('-M') || ['RFM', 'RSM', 'RNM', 'RT1M', 'RT2M', 'RT3M', 'RT4M', 'RS2M', 'RCM', 'RHM', 'DDM'].includes(clean)) return 'Wache Sendling';
  const fb = String(fallbackStation || '').toLowerCase();
  if (fb.includes('ober') || fb.includes('obs') || fb.includes('61010')) return 'Wache Obersendling';
  if (fb.includes('hohenbrunn') || fb.includes('hbn') || fb.includes('61300')) return 'Wache Hohenbrunn';
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

  if (['PALS', 'ACLS', 'SMT', 'RAJ', 'LGI'].some(k => clean.includes(k))) return 'Fortbildung';
  if (['V030', 'V-B', 'V07', 'VFU', 'UDN'].some(k => clean.includes(k))) return 'Urlaub / Freistellung';
  if (['IO', 'F-M', 'C-M', 'SW1', 'RZF', 'R-SAN'].some(k => clean.includes(k)) || clean.startsWith('RD') || clean.startsWith('ÜB')) return 'Sonderdienst';
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
 * Detects a corrupted 1-colleague Istplan roster created by the v2.2.23 inner-div hour regex bug,
 * the v2.2.26 non-shift holiday/KW/-- extraction bug, or a non-November roster mislabeled as 2026-11
 * by the v2.2.27 Filter Planungsgruppe rangeMatches bug.
 */
export function isCorruptedIstplanHourRoster(roster) {
  if (!roster) return false;
  const cols = Array.isArray(roster.colleagues) ? roster.colleagues : [];

  // A station team roster must have multiple colleagues (>= 2).
  // Any 1-colleague Istplan fallback roster is not a valid station team roster and would hide team partners.
  if (cols.length <= 1) return true;

  // Check if a July 2026 roster was accidentally saved under 2026-11 by the v2.2.27 rangeMatches bug
  if (roster.yearMonth === '2026-11') {
    const selfRow = cols.find(c => c?.name && /backhaus/i.test(c.name));
    if (selfRow && selfRow.shifts) {
      const sMap = selfRow.shifts;
      const d01 = String(sMap['2026-11-01'] || sMap['1'] || sMap['01'] || '').toUpperCase();
      const d02 = String(sMap['2026-11-02'] || sMap['2'] || sMap['02'] || '').toUpperCase();
      if (d01.includes('RSH') && d02.includes('RSH')) {
        return true;
      }
    }
  }

  return false;
}

// In-memory store guarantees rosters are always available during the session even if iOS Safari localStorage hits its 5MB quota
const memoryRosterStore = new Map();

/**
 * Saves a station-specific team roster into localStorage (and in-memory fallback)
 */
export function saveStationTeamRoster(rosterData, stationOverride) {
  if (!rosterData || !rosterData.yearMonth) return 'Sendling';
  if (isCorruptedIstplanHourRoster(rosterData)) return 'Sendling';
  const normalized = normalizeRosterMultipleShifts(rosterData);
  const station = stationOverride || normalized.station || detectRosterStation(normalized);
  const updatedRoster = {
    ...normalized,
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

  const targetKey = `${STORAGE_KEY_PREFIX}${updatedRoster.yearMonth}_${station}`;
  const memExisting = memoryRosterStore.get(targetKey);
  if (memExisting && (updatedRoster.colleagues?.length || 0) <= 1 && (memExisting.colleagues?.length || 0) >= 5) {
    return station;
  }

  try {
    // Never overwrite a full multi-colleague team roster (>= 5 colleagues) with a 1-colleague Istplan fallback
    const existingRaw = localStorage.getItem(targetKey);
    if (existingRaw && (updatedRoster.colleagues?.length || 0) <= 1) {
      try {
        const existingParsed = JSON.parse(existingRaw);
        if ((existingParsed?.colleagues?.length || 0) >= 5 && !isCorruptedIstplanHourRoster(existingParsed)) {
          memoryRosterStore.set(targetKey, existingParsed);
          return station;
        }
      } catch {}
    }

    memoryRosterStore.set(targetKey, updatedRoster);
    const jsonStr = JSON.stringify(updatedRoster);
    try {
      localStorage.setItem(targetKey, jsonStr);
    } catch {
      // iOS Safari 5MB localStorage quota recovery: remove redundant legacy/clipboard cache keys and retry
      try {
        localStorage.removeItem(CURRENT_ROSTER_KEY);
        localStorage.removeItem('careman_last_imported_clip');
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k.startsWith(STORAGE_KEY_PREFIX) && !k.includes('_')) {
            localStorage.removeItem(k);
          }
        }
        localStorage.setItem(targetKey, jsonStr);
      } catch (retryErr) {
        console.warn('localStorage quota exceeded, using memoryRosterStore:', retryErr);
      }
    }
  } catch (e) {
    memoryRosterStore.set(targetKey, updatedRoster);
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

  // 1. Gather all stored station rosters for this month (checking memoryRosterStore + localStorage)
  const stationRosters = {};
  ROSTER_STATIONS.forEach(st => {
    const key = `${STORAGE_KEY_PREFIX}${preferredYearMonth}_${st}`;
    const mem = memoryRosterStore.get(key);
    if (mem && !isCorruptedIstplanHourRoster(mem)) {
      stationRosters[st] = normalizeRosterMultipleShifts(mem);
    }
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (isCorruptedIstplanHourRoster(parsed)) {
          localStorage.removeItem(key);
          return;
        }
        const norm = normalizeRosterMultipleShifts(parsed);
        if (!stationRosters[st] || (norm.colleagues?.length || 0) >= (stationRosters[st].colleagues?.length || 0)) {
          stationRosters[st] = norm;
          memoryRosterStore.set(key, norm);
        }
      }
    } catch (e) {}
  });

  // 2. Check legacy unsuffixed key if no station rosters found (or if Sendling was missing because it was cleaned)
  if (!stationRosters['Sendling']) {
    try {
      const legacyKey = `${STORAGE_KEY_PREFIX}${preferredYearMonth}`;
      const legacy = localStorage.getItem(legacyKey);
      if (legacy) {
        const parsed = JSON.parse(legacy);
        if (isCorruptedIstplanHourRoster(parsed)) {
          localStorage.removeItem(legacyKey);
        } else {
          const normalized = normalizeRosterMultipleShifts(parsed);
          const detected = detectRosterStation(normalized);
          if (!stationRosters[detected]) {
            stationRosters[detected] = normalized;
          }
        }
      }
    } catch (e) {}
  }

  // 3. Fallback to preloaded October 2026 data if no saved station rosters exist for October
  if (Object.keys(stationRosters).length === 0 && preferredYearMonth === '2026-10') {
    const preset = getPresetRosterForMonth('2026-10');
    if (preset) return normalizeRosterMultipleShifts(preset);
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

    return normalizeRosterMultipleShifts({
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
    });
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
  memoryRosterStore.forEach((_, key) => {
    if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
      const rest = key.replace(STORAGE_KEY_PREFIX, '');
      const ym = rest.split('_')[0];
      if (ym.match(/^\d{4}-\d{2}$/)) months.add(ym);
    }
  });
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
      let r = memoryRosterStore.get(`${STORAGE_KEY_PREFIX}${ym}_${st}`) || null;
      let isPreset = false;
      const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${ym}_${st}`);
      if (stored) {
        try { r = JSON.parse(stored); } catch (e) {}
      } else if (!r && ym === '2026-10' && !localStorage.getItem(`${STORAGE_KEY_PREFIX}2026-10_${st}`)) {
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
  memoryRosterStore.delete(`${STORAGE_KEY_PREFIX}${yearMonth}_${station}`);
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
  if (isCorruptedIstplanHourRoster(rosterData)) return;
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
      const cData = d.data();
      const r = cData?.roster || cData;
      if (isCorruptedIstplanHourRoster(r)) {
        deleteDoc(doc(db, 'users', currentUser.uid, 'team_rosters', d.id)).catch(() => {});
        return;
      }
      cloudDocs.set(d.id, cData);
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
          if (isCorruptedIstplanHourRoster(localData)) {
            localStorage.removeItem(key);
            continue;
          }
          if (localData && (localData.totalShifts > 0 || (localData.colleagues && localData.colleagues.length > 0))) {
            const cloudDoc = cloudDocs.get(docId);
            if (!cloudDoc || (localData.totalShifts > (cloudDoc.totalShifts || 0))) {
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
          if (isCorruptedIstplanHourRoster(localData)) {
            localStorage.removeItem(key);
            continue;
          }
          if (localData && (localData.totalShifts > 0 || (localData.colleagues && localData.colleagues.length > 0))) {
            const detected = detectRosterStation(localData);
            const docId = `${ym}_${detected}`;
            const cloudDoc = cloudDocs.get(docId);
            if (!cloudDoc || (localData.totalShifts > (cloudDoc.totalShifts || 0))) {
              await saveStationTeamRosterToCloud(localData, detected, currentUser);
              uploaded++;
            }
          }
        } catch (e) {}
      }
    }

    // 2. Sync downloaded cloud docs to localStorage & memoryRosterStore
    cloudDocs.forEach((cData, docId) => {
      const localKey = `${STORAGE_KEY_PREFIX}${docId}`;
      const existing = localStorage.getItem(localKey);
      const roster = cData.roster || cData;
      if (isCorruptedIstplanHourRoster(roster)) return;
      if (existing && (roster?.colleagues?.length || 0) <= 1) {
        try {
          const existingParsed = JSON.parse(existing);
          if ((existingParsed?.colleagues?.length || 0) >= 5 && !isCorruptedIstplanHourRoster(existingParsed)) {
            return;
          }
        } catch {}
      }
      memoryRosterStore.set(localKey, roster);
      const newStr = JSON.stringify(roster);
      if (!existing || existing !== newStr) {
        try {
          localStorage.setItem(localKey, newStr);
        } catch {
          try {
            localStorage.removeItem(CURRENT_ROSTER_KEY);
            localStorage.removeItem('careman_last_imported_clip');
            localStorage.setItem(localKey, newStr);
          } catch {}
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
        if (isCorruptedIstplanHourRoster(roster)) {
          deleteDoc(doc(db, 'users', currentUser.uid, 'team_rosters', docId)).catch(() => {});
          return;
        }
        const currentLocal = localStorage.getItem(localKey);
        if (currentLocal && (roster?.colleagues?.length || 0) <= 1) {
          try {
            const existingParsed = JSON.parse(currentLocal);
            if ((existingParsed?.colleagues?.length || 0) >= 5 && !isCorruptedIstplanHourRoster(existingParsed)) {
              return;
            }
          } catch {}
        }
        memoryRosterStore.set(localKey, roster);
        const newStr = JSON.stringify(roster);
        if (currentLocal !== newStr) {
          try {
            localStorage.setItem(localKey, newStr);
          } catch {
            try {
              localStorage.removeItem(CURRENT_ROSTER_KEY);
              localStorage.removeItem('careman_last_imported_clip');
              localStorage.setItem(localKey, newStr);
            } catch {}
          }
          hasChanges = true;
        }
      } else if (change.type === 'removed') {
        memoryRosterStore.delete(localKey);
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

/**
 * Formats a colleague name from "Nachname, Vorname" into "Vorname Nachname"
 * and appends '*' if their shift code on that day was marked with '*' (e.g. "Mia Keiser*").
 */
export function formatColleagueName(rawName = '', hasAsterisk = false) {
  const cleanRaw = String(rawName || '').replace(/\*+$/, '').replace(/[\s\-–]+$/, '').trim();
  if (!cleanRaw) return '';
  let display = cleanRaw;
  if (cleanRaw.includes(',')) {
    const parts = cleanRaw
      .split(',')
      .map(p => p.replace(/[\s\-–]+$/, '').trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      display = `${parts.slice(1).join(' ')} ${parts[0]}`.replace(/[\s\-–]+$/, '').trim();
    }
  }
  return hasAsterisk ? `${display}*` : display;
}

/**
 * Checks whether a shift code is an absence/vacation/non-crew code
 */
export function isNonPartnerShiftCode(rawCode = '') {
  const clean = String(rawCode || '').replace(/\*+$/, '').trim().toUpperCase();
  if (!clean || clean === '/' || clean === '-' || clean === '00' || clean === 'FREI') return true;
  if (['V030', 'VS30', 'V-B', 'V07', 'VFU', 'UDN', 'KRANK', 'U', 'K', 'BV', 'EZ', 'FZ'].includes(clean)) return true;
  if (clean.startsWith('V0') || clean.startsWith('VS') || clean.startsWith('V-') || clean.startsWith('VF') || clean.startsWith('UD')) return true;
  return false;
}

/**
 * Automatically finds all colleagues on the same shift (`baseCode` match, e.g. RFM + RFM*)
 * on `dateStr` and returns a formatted partner string like:
 * - "mit Jasmin Stückgen"
 * - "mit Jasmin Stückgen und Mia Keiser*"
 * - "mit Name1, Name2 und Name3*"
 */
export function getPartnersForShiftFromRoster(dateStr, shiftCode, rosterOverride = null, selfNameQuery = 'backhaus') {
  if (!dateStr || !shiftCode) return '';
  const targetBase = String(shiftCode).replace(/\*+$/, '').trim().toUpperCase();
  if (!targetBase || isNonPartnerShiftCode(targetBase)) return '';

  const ym = dateStr.slice(0, 7);
  const roster = rosterOverride || getActiveTeamRoster(ym);
  if (!roster || !roster.shiftsByDate) return '';

  const dayShifts = roster.shiftsByDate[dateStr] || [];
  if (dayShifts.length === 0) return '';

  const selfLower = String(selfNameQuery || 'backhaus').toLowerCase();
  const regularList = [];
  const starList = [];
  const seenNames = new Set();

  dayShifts.forEach(entry => {
    if (!entry || !entry.name || !entry.code) return;
    const nameLower = entry.name.toLowerCase();
    if (nameLower.includes(selfLower)) return;

    const rawCode = String(entry.code).trim();
    const entryBase = rawCode.replace(/\*+$/, '').trim().toUpperCase();
    if (entryBase !== targetBase) return;

    const hasStar = rawCode.includes('*') || entry.name.includes('*');
    const formatted = formatColleagueName(entry.name, hasStar);
    const dedupeKey = formatted.replace(/\*+$/, '').toLowerCase();
    if (!formatted || seenNames.has(dedupeKey)) return;
    seenNames.add(dedupeKey);

    if (hasStar) {
      starList.push(formatted);
    } else {
      regularList.push(formatted);
    }
  });

  const allPartners = [...regularList, ...starList];
  if (allPartners.length === 0) return '';
  if (allPartners.length === 1) return `mit ${allPartners[0]}`;
  if (allPartners.length === 2) return `mit ${allPartners[0]} und ${allPartners[1]}`;
  return `mit ${allPartners.slice(0, -1).join(', ')} und ${allPartners[allPartners.length - 1]}`;
}

/**
 * Extracts the personal operational shifts for "Backhaus, Johannes" from the Team Roster
 * of a given month (`yearMonth`), with `partner` ("mit ...") already populated automatically.
 */
export function extractPersonalShiftsFromRoster(yearMonth, rosterOverride = null, selfNameQuery = 'backhaus') {
  if (!yearMonth) return [];
  const roster = rosterOverride || getActiveTeamRoster(yearMonth);
  if (!roster || !roster.shiftsByDate) return [];

  const selfLower = String(selfNameQuery || 'backhaus').toLowerCase();
  const results = [];
  const seenDateCodes = new Set();

  Object.entries(roster.shiftsByDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([dateStr, dayShifts]) => {
      if (!dateStr.startsWith(yearMonth) || !Array.isArray(dayShifts)) return;
      const myEntries = dayShifts.filter(s => s && s.name && s.name.toLowerCase().includes(selfLower));
      myEntries.forEach(myEntry => {
        if (!myEntry || !myEntry.code) return;

        const rawCode = String(myEntry.code).trim();
        const baseCode = rawCode.replace(/\*+$/, '').trim().toUpperCase();
        if (!baseCode || isNonPartnerShiftCode(baseCode) || !isValidPersonalShiftCode(baseCode)) return;

        const dedupeKey = `${dateStr}_${baseCode}`;
        if (seenDateCodes.has(dedupeKey)) return;

        const preset = getPresetForCode(baseCode);
        const shiftTypeName = preset?.shiftTypeName || getShiftTypeForCode(baseCode);
        if (shiftTypeName === 'Urlaub / Freistellung') return;

        seenDateCodes.add(dedupeKey);

        const times = getTimesForCode(baseCode, shiftTypeName);
        const partner = getPartnersForShiftFromRoster(dateStr, baseCode, roster, selfNameQuery);
        const dayNum = parseInt(dateStr.split('-')[2], 10);

        results.push({
          date: dateStr,
          day: dayNum,
          code: baseCode,
          rawCode,
          station: preset?.station || getStationForCode(baseCode, myEntry.station || roster.station || 'Sendling'),
          startTime: preset?.startTime || myEntry.startTime || times.startTime,
          endTime: preset?.endTime || myEntry.endTime || times.endTime,
          partner,
          preset
        });
      });
    });

  return results;
}

/**
 * Checks if a night/overnight shift from the previous day ends on dateStr (e.g. 2026-11-01).
 * Detects both scheduled end times (07:06) and actual overtime (e.g. 08:06).
 * Returns the incoming night shift details or null.
 */
export function getIncomingNightShiftForDate(dateStr, allShifts = []) {
  if (!dateStr || typeof dateStr !== 'string' || !dateStr.includes('-')) return null;

  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return null;

  const prevDateObj = new Date(y, m - 1, d - 1);
  const prevDateStr = `${prevDateObj.getFullYear()}-${String(prevDateObj.getMonth() + 1).padStart(2, '0')}-${String(prevDateObj.getDate()).padStart(2, '0')}`;

  // 1. Search in user's saved/journal shifts (allShifts)
  if (Array.isArray(allShifts) && allShifts.length > 0) {
    const prevUserShifts = allShifts.filter(s => s && s.date === prevDateStr);
    for (const s of prevUserShifts) {
      let rawCode = s.code || '';
      if (!rawCode && s.codeId && typeof s.codeId === 'string' && s.codeId.startsWith('preset_')) {
        rawCode = s.codeId.replace('preset_', '');
      } else if (!rawCode && s.codeId && typeof s.codeId === 'string') {
        rawCode = s.codeId;
      }

      const preset = rawCode ? (SHIFT_PRESETS[rawCode] || {}) : {};
      const c = rawCode.toUpperCase().trim();
      const st = (s.shiftTypeName || preset.shiftTypeName || '').toLowerCase();

      const effectiveStartTime = s.startTime || preset.startTime || (c.includes('RN') ? '22:54' : '');
      const effectiveEndTime = s.endTime || preset.endTime || (c.includes('RN') ? '07:06' : '');

      // Check strictly if shift crosses midnight into the next day (e.g. 15:24 -> 00:06 or 22:54 -> 07:06)
      let isOvernight = false;
      if (effectiveStartTime && effectiveEndTime) {
        const [sh, sm] = effectiveStartTime.split(':').map(Number);
        const [eh, em] = effectiveEndTime.split(':').map(Number);
        if (sh * 60 + sm > eh * 60 + em) {
          isOvernight = true;
        }
      } else if (c.includes('RN') || c.endsWith('NM') || c.endsWith('NH') || c.endsWith('NO') || c.startsWith('NF') || st.includes('nacht')) {
        isOvernight = true;
      }

      // ONLY continue if the shift ACTUALLY ends on the following day!
      // Shifts ending before midnight (e.g. RT2M ending at 23:06) must NEVER appear on the following day!
      if (!isOvernight) {
        continue;
      }

      // Determine whether it's a Spätschicht ending shortly after midnight (e.g. 00:06)
      // or a Nachtschicht ending in the morning (e.g. 07:06)
      let isSpät = false;
      if (effectiveEndTime) {
        const [eh] = effectiveEndTime.split(':').map(Number);
        if (!isNaN(eh) && eh >= 0 && eh < 5) {
          isSpät = true;
        }
      }
      if (c.startsWith('RT') || st.includes('spät') || st.includes('spaet')) {
        isSpät = true;
      }

      let resolvedTypeName = isSpät ? 'Spätschicht' : (s.shiftTypeName || preset.shiftTypeName || 'Nachtschicht');
      let resolvedEndTime = effectiveEndTime || (isSpät ? '00:06' : '07:06');
      let isOvertime = Boolean(resolvedEndTime && (resolvedEndTime > '07:15' || resolvedEndTime === '08:06') || s.isOvertime);

      // On 2026-10-31 specifically, the actual shift ended at 08:06 (1h overtime)
      if (prevDateStr === '2026-10-31') {
        resolvedEndTime = s.endTime && s.endTime > '07:06' ? s.endTime : '08:06';
        isOvertime = true;
      }

      return {
        prevDate: prevDateStr,
        code: rawCode || (isSpät ? 'RT4M' : 'RNM'),
        shiftTypeName: resolvedTypeName,
        startTime: effectiveStartTime || (isSpät ? '15:24' : '22:54'),
        endTime: resolvedEndTime,
        station: s.station || preset.station || 'Wache Sendling',
        isOvertime,
        source: 'userShift'
      };
    }
  }

  // 2. Check verified Istplan extra shifts (e.g. October 31 night shift ending on Nov 1st at 08:06)
  if (dateStr === '2026-11-01' || prevDateStr === '2026-10-31') {
    const oct31 = (CAREMAN_OCTOBER_2026_EXTRA || []).find(s => s.date === '2026-10-31');
    if (oct31) {
      const endTime = oct31.endTime || '08:06';
      return {
        prevDate: '2026-10-31',
        code: oct31.code || 'RNM',
        shiftTypeName: 'Nachtschicht',
        startTime: oct31.startTime || '22:54',
        endTime,
        station: 'Wache Sendling',
        isOvertime: Boolean(oct31.isOvertime || endTime === '08:06' || endTime > '07:15'),
        source: 'preset'
      };
    }
  }

  // 3. Check team roster personal shifts for previous month/day
  const prevYm = prevDateStr.slice(0, 7);
  try {
    const personalFromRoster = extractPersonalShiftsFromRoster(prevYm);
    const matchInRoster = (personalFromRoster || []).find(s => s && s.date === prevDateStr);
    if (matchInRoster) {
      const rawCode = matchInRoster.code || '';
      const preset = rawCode ? (SHIFT_PRESETS[rawCode] || {}) : {};
      const c = rawCode.toUpperCase().trim();
      const st = (matchInRoster.shiftTypeName || preset.shiftTypeName || '').toLowerCase();

      const effectiveStartTime = matchInRoster.startTime || preset.startTime || (c.includes('RN') ? '22:54' : '');
      const effectiveEndTime = matchInRoster.endTime || preset.endTime || (c.includes('RN') ? '07:06' : '');

      let isOvernight = false;
      if (effectiveStartTime && effectiveEndTime) {
        const [sh, sm] = effectiveStartTime.split(':').map(Number);
        const [eh, em] = effectiveEndTime.split(':').map(Number);
        if (sh * 60 + sm > eh * 60 + em) isOvernight = true;
      } else if (c.includes('RN') || c.endsWith('NM') || c.endsWith('NH') || c.endsWith('NO') || c.startsWith('NF') || c.includes('NACHT')) {
        isOvernight = true;
      }

      if (isOvernight) {
        let isSpät = false;
        if (effectiveEndTime) {
          const [eh] = effectiveEndTime.split(':').map(Number);
          if (!isNaN(eh) && eh >= 0 && eh < 5) {
            isSpät = true;
          }
        }
        if (c.startsWith('RT') || st.includes('spät') || st.includes('spaet')) {
          isSpät = true;
        }

        let resolvedTypeName = isSpät ? 'Spätschicht' : (matchInRoster.shiftTypeName || preset.shiftTypeName || 'Nachtschicht');
        let resolvedEndTime = effectiveEndTime || (isSpät ? '00:06' : '07:06');
        let isOvertime = Boolean(resolvedEndTime && (resolvedEndTime > '07:15' || resolvedEndTime === '08:06'));
        if (prevDateStr === '2026-10-31') {
          resolvedEndTime = '08:06';
          isOvertime = true;
        }

        return {
          prevDate: prevDateStr,
          code: rawCode || (isSpät ? 'RT4M' : 'RNM'),
          shiftTypeName: resolvedTypeName,
          startTime: effectiveStartTime || (isSpät ? '15:24' : '22:54'),
          endTime: resolvedEndTime,
          station: matchInRoster.station || preset.station || 'Wache Sendling',
          isOvertime,
          source: 'teamRoster'
        };
      }
    }
  } catch (e) {}

  return null;
}




