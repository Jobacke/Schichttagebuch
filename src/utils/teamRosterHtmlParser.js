import { cleanColleagueName, isVehicleOrDummyRow } from './teamRosterPdfParser.js';
import { getShiftTypeForCode, getStationForCode, getTimesForCode } from './teamRosterParser.js';

/**
 * Universal multi-strategy CareMan HTML & Text parser
 * Supports single tables, split/parallel tables, CSS grids, TSV and clipboard text
 * @param {File|string} fileOrHtmlText
 * @param {function} [onProgress]
 * @returns {Promise<Object>}
 */
export async function parseCareManHtml(fileOrHtmlText, onProgress) {
  if (onProgress) onProgress(20);

  let htmlString = '';
  if (typeof fileOrHtmlText === 'string') {
    htmlString = fileOrHtmlText;
  } else if (fileOrHtmlText && typeof fileOrHtmlText.text === 'function') {
    htmlString = await fileOrHtmlText.text();
  } else if (fileOrHtmlText instanceof Blob || fileOrHtmlText instanceof File) {
    htmlString = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(fileOrHtmlText, 'UTF-8');
    });
  } else {
    throw new Error('Ungültiges HTML-Format.');
  }

  if (onProgress) onProgress(35);

  // Parse HTML string in browser DOMParser
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');

  // 1. Detect Month and Year from headings, title, or body text
  const monthNames = [
    'januar', 'februar', 'märz', 'april', 'mai', 'juni',
    'juli', 'august', 'september', 'oktober', 'november', 'dezember'
  ];

  let year = 2026;
  let month = 10;

  const fullText = (doc.body ? doc.body.textContent : htmlString) || '';
  const monthMatch = fullText.match(/(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})/i);
  if (monthMatch) {
    const mIdx = monthNames.indexOf(monthMatch[1].toLowerCase());
    if (mIdx !== -1) {
      month = mIdx + 1;
      year = parseInt(monthMatch[2], 10);
    }
  }

  const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
  const monthLabel = `${monthNames[month - 1].charAt(0).toUpperCase() + monthNames[month - 1].slice(1)} ${year}`;
  const daysInMonth = new Date(year, month, 0).getDate();

  const shiftsByDate = {};
  for (let d = 1; d <= daysInMonth; d++) {
    shiftsByDate[`${yearMonth}-${String(d).padStart(2, '0')}`] = [];
  }

  const colleaguesList = [];
  const processedColleagues = new Set();

  function registerShift(name, dayNum, code) {
    if (!name || !code || dayNum < 1 || dayNum > daysInMonth) return;
    const cleanCode = code.toUpperCase().trim();
    if (cleanCode.length < 2 || cleanCode === '-' || cleanCode === '/' || cleanCode === '0' || cleanCode === 'FREI') return;

    const dateStr = `${yearMonth}-${String(dayNum).padStart(2, '0')}`;
    const st = getShiftTypeForCode(cleanCode);
    const station = getStationForCode(cleanCode);
    const times = getTimesForCode(cleanCode, st);

    shiftsByDate[dateStr].push({
      name: name,
      code: cleanCode,
      shiftTypeName: st,
      station: station,
      startTime: times.startTime,
      endTime: times.endTime,
      isTraining: st === 'Fortbildung',
      isVacation: st.includes('Urlaub') || st.includes('Freistellung')
    });
  }

  // --- STRATEGY 1: SINGLE COMBINED TABLE (has day headers AND employee names) ---
  const allTables = Array.from(doc.querySelectorAll('table'));
  for (const table of allTables) {
    const rows = Array.from(table.querySelectorAll('tr'));
    if (rows.length < 3) continue;

    // Search all rows (not just first 10!) for day columns
    let dayColMap = new Map();
    let headerRowIdx = -1;

    for (let r = 0; r < Math.min(25, rows.length); r++) {
      const cells = Array.from(rows[r].children);
      const tempDayMap = new Map();
      cells.forEach((cell, idx) => {
        const text = cell.textContent.trim();
        const numMatch = text.match(/\b([1-9]|[12][0-9]|3[01])\b/);
        if (numMatch) {
          const d = parseInt(numMatch[1], 10);
          if (d >= 1 && d <= daysInMonth) {
            tempDayMap.set(idx, d);
          }
        }
      });
      if (tempDayMap.size >= 10) {
        dayColMap = tempDayMap;
        headerRowIdx = r;
        break;
      }
    }

    if (dayColMap.size >= 10) {
      // Find colleague name column in this table
      let nameColIdx = -1;
      for (let r = headerRowIdx + 1; r < Math.min(headerRowIdx + 15, rows.length); r++) {
        const cells = Array.from(rows[r].children);
        cells.forEach((c, idx) => {
          if (!dayColMap.has(idx)) {
            const txt = c.textContent.trim();
            if (txt.includes(',') && !txt.match(/\d{2,}/) && txt.length > 3 && txt.length < 50) {
              nameColIdx = idx;
            }
          }
        });
        if (nameColIdx !== -1) break;
      }

      if (nameColIdx !== -1) {
        // Parse rows
        for (let r = headerRowIdx + 1; r < rows.length; r++) {
          const cells = Array.from(rows[r].children);
          if (cells.length < 5) continue;
          const nameCell = cells[nameColIdx];
          if (!nameCell) continue;
          const rawName = nameCell.textContent.trim();
          if (!rawName.includes(',') || isVehicleOrDummyRow(rawName)) continue;
          const colleagueName = cleanColleagueName(rawName);
          if (!colleagueName) continue;

          const colleagueShifts = {};
          dayColMap.forEach((dayNum, cIdx) => {
            if (cIdx < cells.length) {
              let code = cells[cIdx].textContent.trim();
              const badge = cells[cIdx].querySelector('[data-shift], .badge, span');
              if (badge) {
                const attr = badge.getAttribute('data-shift') || badge.getAttribute('title');
                if (attr) code = attr.trim();
              }
              const tokens = code.split(/[\s\r\n]+/).filter(Boolean);
              const validToken = tokens.find(t => /^[A-Z0-9\-]{2,10}$/i.test(t));
              if (validToken) {
                const cleanCode = validToken.toUpperCase();
                colleagueShifts[`${yearMonth}-${String(dayNum).padStart(2, '0')}`] = cleanCode;
                registerShift(colleagueName, dayNum, cleanCode);
              }
            }
          });

          if (Object.keys(colleagueShifts).length > 0 && !processedColleagues.has(colleagueName)) {
            processedColleagues.add(colleagueName);
            colleaguesList.push({ name: colleagueName, shifts: colleagueShifts });
          }
        }
      }
    }
  }

  // --- STRATEGY 2: SPLIT TABLES (Table A = Names, Table B = Day Shifts) ---
  if (colleaguesList.length === 0 && allTables.length >= 2) {
    let nameTableRows = [];
    let shiftTableRows = [];
    let splitDayColMap = new Map();

    for (const table of allTables) {
      const rows = Array.from(table.querySelectorAll('tr'));
      // Check if rows have names
      const sampleNames = rows.slice(0, 10).filter(r => {
        const txt = r.textContent;
        return txt.includes(',') && !txt.match(/\d{4}/);
      });
      if (sampleNames.length >= 3 && nameTableRows.length === 0) {
        nameTableRows = rows;
      }

      // Check if table has day header row
      for (let r = 0; r < Math.min(10, rows.length); r++) {
        const cells = Array.from(rows[r].children);
        const tempMap = new Map();
        cells.forEach((c, idx) => {
          const numMatch = c.textContent.trim().match(/\b([1-9]|[12][0-9]|3[01])\b/);
          if (numMatch) {
            const d = parseInt(numMatch[1], 10);
            if (d >= 1 && d <= daysInMonth) tempMap.set(idx, d);
          }
        });
        if (tempMap.size >= 10 && shiftTableRows.length === 0) {
          splitDayColMap = tempMap;
          shiftTableRows = rows.slice(r + 1);
          break;
        }
      }
    }

    if (nameTableRows.length > 0 && shiftTableRows.length > 0 && splitDayColMap.size >= 10) {
      const minLen = Math.min(nameTableRows.length, shiftTableRows.length);
      for (let i = 0; i < minLen; i++) {
        const nameRowText = nameTableRows[i].textContent.trim();
        const nameMatch = nameRowText.match(/([A-ZÄÖÜ][a-zäöüß\-]+(?:\s+[A-ZÄÖÜ][a-zäöüß\-]+)*),\s*([A-ZÄÖÜ][a-zäöüß\-]+)/);
        if (nameMatch && !isVehicleOrDummyRow(nameRowText)) {
          const colleagueName = cleanColleagueName(`${nameMatch[1]}, ${nameMatch[2]}`);
          const shiftCells = Array.from(shiftTableRows[i].children);
          const colleagueShifts = {};

          splitDayColMap.forEach((dayNum, cIdx) => {
            if (cIdx < shiftCells.length) {
              const code = shiftCells[cIdx].textContent.trim().toUpperCase();
              const tokens = code.split(/[\s\r\n]+/).filter(Boolean);
              const validToken = tokens.find(t => /^[A-Z0-9\-]{2,10}$/i.test(t));
              if (validToken) {
                const cleanCode = validToken.toUpperCase();
                colleagueShifts[`${yearMonth}-${String(dayNum).padStart(2, '0')}`] = cleanCode;
                registerShift(colleagueName, dayNum, cleanCode);
              }
            }
          });

          if (Object.keys(colleagueShifts).length > 0 && !processedColleagues.has(colleagueName)) {
            processedColleagues.add(colleagueName);
            colleaguesList.push({ name: colleagueName, shifts: colleagueShifts });
          }
        }
      }
    }
  }

  // --- STRATEGY 3: TEXT LINES / TSV / CLIPBOARD (Tabs, Spaces, or Copied Table) ---
  if (colleaguesList.length === 0) {
    const rawLines = htmlString.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let dayColMap = new Map();

    for (let r = 0; r < Math.min(30, rawLines.length); r++) {
      const parts = rawLines[r].includes('\t') ? rawLines[r].split('\t') : rawLines[r].split(/\s{2,}/);
      const tempMap = new Map();
      parts.forEach((p, idx) => {
        const numMatch = p.trim().match(/\b([1-9]|[12][0-9]|3[01])\b/);
        if (numMatch) {
          const d = parseInt(numMatch[1], 10);
          if (d >= 1 && d <= daysInMonth) tempMap.set(idx, d);
        }
      });
      if (tempMap.size >= 10) {
        dayColMap = tempMap;
        break;
      }
    }

    rawLines.forEach(line => {
      const parts = line.includes('\t') ? line.split('\t') : line.split(/\s{2,}/);
      if (parts.length < 3) return;

      const namePart = parts.find((p, idx) => !dayColMap.has(idx) && p.includes(',') && !p.match(/\d{2,}/));
      if (!namePart || isVehicleOrDummyRow(namePart)) return;

      const colleagueName = cleanColleagueName(namePart);
      if (!colleagueName) return;

      const colleagueShifts = {};
      if (dayColMap.size >= 10) {
        dayColMap.forEach((dayNum, colIdx) => {
          if (colIdx < parts.length) {
            const token = parts[colIdx].trim().toUpperCase();
            if (token && token.length >= 2 && token !== '-' && token !== '/' && token !== 'FREI') {
              const cleanCode = token.split(/\s+/)[0];
              colleagueShifts[`${yearMonth}-${String(dayNum).padStart(2, '0')}`] = cleanCode;
              registerShift(colleagueName, dayNum, cleanCode);
            }
          }
        });
      }

      if (Object.keys(colleagueShifts).length > 0 && !processedColleagues.has(colleagueName)) {
        processedColleagues.add(colleagueName);
        colleaguesList.push({ name: colleagueName, shifts: colleagueShifts });
      }
    });
  }

  // --- STRATEGY 4: GENERAL REGEX SCAN FOR "Name, Vorname ... RT1M ..." ---
  if (colleaguesList.length === 0) {
    const lines = fullText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const knownCodes = ['RFM', 'RSM', 'RNM', 'RT1M', 'RT2M', 'RT3M', 'RT4M', 'RS2M', 'RCM', 'RHM', 'RFH', 'RTH', 'RT1H', 'RT2H', 'RSH', 'RNH', 'RHH', 'RFO', 'RSO', 'ACLS', 'PALS', 'SMT', 'RAJ', 'V030', 'VS30', 'V-B', 'V07', 'VFU', 'UDN'];

    lines.forEach(line => {
      const nameMatch = line.match(/^([A-ZÄÖÜ][a-zäöüß\-]+(?:\s+[A-ZÄÖÜ][a-zäöüß\-]+)*),\s*([A-ZÄÖÜ][a-zäöüß\-]+)/);
      if (nameMatch && !isVehicleOrDummyRow(line)) {
        const colleagueName = cleanColleagueName(`${nameMatch[1]}, ${nameMatch[2]}`);
        const colleagueShifts = {};

        // Find any day + code combinations in the line
        knownCodes.forEach(code => {
          const reg = new RegExp(`\\b([1-9]|[12][0-9]|3[01])\\b[^a-zA-Z0-9]*${code}|${code}[^a-zA-Z0-9]*\\b([1-9]|[12][0-9]|3[01])\\b`, 'g');
          let m;
          while ((m = reg.exec(line)) !== null) {
            const dayNum = parseInt(m[1] || m[2], 10);
            if (dayNum >= 1 && dayNum <= daysInMonth) {
              colleagueShifts[`${yearMonth}-${String(dayNum).padStart(2, '0')}`] = code;
              registerShift(colleagueName, dayNum, code);
            }
          }
        });

        if (Object.keys(colleagueShifts).length > 0 && !processedColleagues.has(colleagueName)) {
          processedColleagues.add(colleagueName);
          colleaguesList.push({ name: colleagueName, shifts: colleagueShifts });
        }
      }
    });
  }

  if (onProgress) onProgress(100);

  const totalShifts = Object.values(shiftsByDate).reduce((acc, list) => acc + list.length, 0);

  if (colleaguesList.length === 0) {
    throw new Error('In dieser Datei konnte keine lesbare Dienstplantabelle erkannt werden. Bitte nutze oben den Reiter „Text einfügen“: Markiere die Tabelle auf der CareMan-Seite einfach mit der Maus (oder Cmd + A), kopiere sie (Cmd + C) und füge sie dort direkt ein!');
  }

  return {
    yearMonth,
    monthLabel,
    daysInMonth,
    totalColleagues: colleaguesList.length,
    totalShifts,
    colleagues: colleaguesList,
    shiftsByDate,
    isHtml: true,
    isVerified: true
  };
}
