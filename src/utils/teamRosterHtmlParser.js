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

  // 0. Direct JSON Support (from SIEDA 1-click extractor)
  const trimmed = htmlString.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsedJson = JSON.parse(trimmed);
      let targetYearMonth = '2026-10';
      let targetLabel = 'Oktober 2026';
      let rawColleagues = [];

      if (Array.isArray(parsedJson)) {
        rawColleagues = parsedJson;
      } else if (parsedJson && typeof parsedJson === 'object') {
        if (parsedJson.yearMonth) targetYearMonth = parsedJson.yearMonth;
        if (parsedJson.monthLabel) targetLabel = parsedJson.monthLabel;
        if (Array.isArray(parsedJson.colleagues)) rawColleagues = parsedJson.colleagues;
      }

      // Check first date keys to infer yearMonth if not set
      if (!parsedJson.yearMonth && rawColleagues.length > 0 && rawColleagues[0].shifts) {
        const firstDateKey = Object.keys(rawColleagues[0].shifts)[0];
        if (firstDateKey && firstDateKey.match(/^\d{4}-\d{2}/)) {
          targetYearMonth = firstDateKey.slice(0, 7);
          const [y, m] = targetYearMonth.split('-').map(Number);
          const mNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
          targetLabel = `${mNames[m - 1]} ${y}`;
        }
      }

      const [yNum, mNum] = targetYearMonth.split('-').map(Number);
      const totalDays = new Date(yNum, mNum, 0).getDate();
      const shiftsByDateMap = {};
      for (let d = 1; d <= totalDays; d++) {
        shiftsByDateMap[`${targetYearMonth}-${String(d).padStart(2, '0')}`] = [];
      }

      const cleanColleagues = [];
      rawColleagues.forEach(c => {
        const name = cleanColleagueName(c.name || '');
        if (!name || !c.shifts) return;

        const normalizedShifts = {};
        Object.entries(c.shifts).forEach(([k, v]) => {
          if (!v) return;
          const cleanCode = String(v).trim().toUpperCase();
          if (cleanCode.length < 2 || cleanCode === '-' || cleanCode === '/' || cleanCode === '0') return;

          let dateStr = k;
          if (!k.includes('-')) {
            const dayNum = parseInt(k, 10);
            if (dayNum >= 1 && dayNum <= totalDays) {
              dateStr = `${targetYearMonth}-${String(dayNum).padStart(2, '0')}`;
            }
          }

          if (shiftsByDateMap[dateStr]) {
            normalizedShifts[dateStr] = cleanCode;
            const st = getShiftTypeForCode(cleanCode);
            const station = getStationForCode(cleanCode);
            const times = getTimesForCode(cleanCode, st);

            shiftsByDateMap[dateStr].push({
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
        });

        if (Object.keys(normalizedShifts).length > 0) {
          cleanColleagues.push({ name, shifts: normalizedShifts });
        }
      });

      let targetStation = parsedJson.station || null;

      const totalShiftsCount = Object.values(shiftsByDateMap).reduce((acc, list) => acc + list.length, 0);
      if (cleanColleagues.length > 0) {
        if (!targetStation) {
          let mCount = 0, oCount = 0, hCount = 0;
          cleanColleagues.forEach(c => {
            Object.values(c.shifts).forEach(code => {
              const up = (code || '').toUpperCase().trim();
              if (up.endsWith('M') || up.includes('-M') || ['RFM', 'RSM', 'RNM', 'RT1M', 'RT2M', 'RT3M', 'RT4M', 'RS2M', 'RCM', 'RHM', 'DDM'].includes(up)) mCount++;
              else if (up.endsWith('O') || up === 'RFO' || up === 'RSO' || up.startsWith('NFO') || up.startsWith('FFO')) oCount++;
              else if (up.endsWith('H') || up.includes('HBN') || ['RFH', 'RTH', 'RT1H', 'RT2H', 'RSH', 'RNH', 'RHH'].includes(up)) hCount++;
            });
          });
          if (oCount > mCount && oCount > hCount) targetStation = 'Obersendling';
          else if (hCount > mCount && hCount > oCount) targetStation = 'Hohenbrunn';
          else targetStation = 'Sendling';
        }

        if (onProgress) onProgress(100);
        return {
          yearMonth: targetYearMonth,
          monthLabel: targetLabel,
          station: targetStation,
          daysInMonth: totalDays,
          totalColleagues: cleanColleagues.length,
          totalShifts: totalShiftsCount,
          colleagues: cleanColleagues,
          shiftsByDate: shiftsByDateMap,
          isVerified: true
        };
      }
    } catch (jsonErr) {
      console.warn('JSON parsing attempt failed, falling back to HTML/text parser:', jsonErr);
    }
  }

  // Parse HTML string in browser DOMParser
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');

  // 1. Detect Month and Year from headings, title, body text or day header weekday
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
  } else {
    // Weekday-based detection: in 2026, Nov 1 is Sunday (So1), Oct 1 is Thursday (Do1), Dec 1 is Tuesday (Di1)
    if (fullText.includes('So1') && fullText.includes('Mo2') && fullText.includes('Di3')) {
      month = 11; // November 2026
    } else if (fullText.includes('Do1') && fullText.includes('Fr2') && fullText.includes('Sa3')) {
      month = 10; // Oktober 2026
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
              const validToken = tokens.find(t => /^[A-Z0-9\-*]{2,10}$/i.test(t));
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
              const validToken = tokens.find(t => /^[A-Z0-9\-*]{2,10}$/i.test(t));
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

    // 1. Search ALL lines for the day numbers row (e.g. 1 2 3 ... 31)
    for (let r = 0; r < rawLines.length; r++) {
      const line = rawLines[r];
      const parts = line.includes('\t') ? line.split('\t') : line.split(/\s{2,}|\s(?=\d+\b)/);
      const tempMap = new Map();
      parts.forEach((p, idx) => {
        const m = p.trim().match(/^([1-9]|[12][0-9]|3[01])$/);
        if (m) {
          const d = parseInt(m[1], 10);
          if (d >= 1 && d <= daysInMonth) tempMap.set(idx, d);
        }
      });
      if (tempMap.size >= 10) {
        dayColMap = tempMap;
        break;
      }
    }

    // 2. Process all colleague rows
    rawLines.forEach(line => {
      const parts = line.includes('\t') ? line.split('\t') : line.split(/\s{2,}/);
      if (parts.length < 2) return;

      // Find colleague name in this row
      const nameIdx = parts.findIndex(p => {
        const t = p.trim();
        return t.includes(',') && !t.match(/\d{2,}/) && t.length > 3 && t.length < 50;
      });

      if (nameIdx === -1) return;
      const rawName = parts[nameIdx].trim();
      if (isVehicleOrDummyRow(rawName)) return;

      const colleagueName = cleanColleagueName(rawName);
      if (!colleagueName) return;

      const colleagueShifts = {};

      if (dayColMap.size >= 10) {
        // Explicit column index to day number mapping
        dayColMap.forEach((dayNum, colIdx) => {
          if (colIdx < parts.length) {
            const token = parts[colIdx].trim().toUpperCase();
            if (token && token.length >= 2 && token !== '-' && token !== '/' && token !== 'FREI' && token !== '0') {
              const cleanCode = token.split(/[\s,]+/)[0];
              colleagueShifts[`${yearMonth}-${String(dayNum).padStart(2, '0')}`] = cleanCode;
              registerShift(colleagueName, dayNum, cleanCode);
            }
          }
        });
      } else if (parts.length >= 25) {
        // Direct column index mapping: each column after name corresponds to day 1, 2, ..., 31!
        for (let d = 1; d <= daysInMonth; d++) {
          const colIdx = nameIdx + d;
          if (colIdx < parts.length) {
            const token = parts[colIdx].trim().toUpperCase();
            if (token && token.length >= 2 && token !== '-' && token !== '/' && token !== 'FREI' && token !== '0') {
              const cleanCode = token.split(/[\s,]+/)[0];
              colleagueShifts[`${yearMonth}-${String(d).padStart(2, '0')}`] = cleanCode;
              registerShift(colleagueName, d, cleanCode);
            }
          }
        }
      }

      if (Object.keys(colleagueShifts).length > 0 && !processedColleagues.has(colleagueName)) {
        processedColleagues.add(colleagueName);
        colleaguesList.push({ name: colleagueName, shifts: colleagueShifts });
      }
    });
  }

  // --- STRATEGY 4: MULTI-LINE COLLEAGUE BLOCKS (e.g. name followed by shift lines) ---
  if (colleaguesList.length === 0) {
    const lines = fullText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let currentColleague = null;
    let colleagueShifts = {};
    let dayIndex = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nameMatch = line.match(/^([A-ZÄÖÜ][a-zäöüß\-]+(?:\s+[A-ZÄÖÜ][a-zäöüß\-]+)*),\s*([A-ZÄÖÜ][a-zäöüß\-]+)/);

      if (nameMatch && !isVehicleOrDummyRow(line)) {
        if (currentColleague && Object.keys(colleagueShifts).length > 0 && !processedColleagues.has(currentColleague)) {
          processedColleagues.add(currentColleague);
          colleaguesList.push({ name: currentColleague, shifts: colleagueShifts });
        }
        currentColleague = cleanColleagueName(`${nameMatch[1]}, ${nameMatch[2]}`);
        colleagueShifts = {};
        dayIndex = 1;

        const lineParts = line.split('\t').slice(1);
        lineParts.forEach(p => {
          const token = p.trim().toUpperCase();
          if (token && token.length >= 2 && token !== '-' && token !== '/' && token !== 'FREI' && token !== '0') {
            const cleanCode = token.split(/[\s,]+/)[0];
            if (dayIndex <= daysInMonth) {
              colleagueShifts[`${yearMonth}-${String(dayIndex).padStart(2, '0')}`] = cleanCode;
              registerShift(currentColleague, dayIndex, cleanCode);
            }
          }
          dayIndex++;
        });
      } else if (currentColleague) {
        const parts = line.split('\t');
        parts.forEach(p => {
          const token = p.trim().toUpperCase();
          if (token && token.length >= 2 && token !== '-' && token !== '/' && token !== 'FREI' && token !== '0') {
            const cleanCode = token.split(/[\s,]+/)[0];
            if (dayIndex <= daysInMonth) {
              colleagueShifts[`${yearMonth}-${String(dayIndex).padStart(2, '0')}`] = cleanCode;
              registerShift(currentColleague, dayIndex, cleanCode);
            }
          }
          dayIndex++;
        });
      }
    }

    if (currentColleague && Object.keys(colleagueShifts).length > 0 && !processedColleagues.has(currentColleague)) {
      processedColleagues.add(currentColleague);
      colleaguesList.push({ name: currentColleague, shifts: colleagueShifts });
    }
  }

  if (onProgress) onProgress(100);

  const totalShifts = Object.values(shiftsByDate).reduce((acc, list) => acc + list.length, 0);

  if (colleaguesList.length === 0) {
    throw new Error('In dieser Datei konnte keine lesbare Dienstplantabelle erkannt werden. Bitte nutze oben den Reiter „Text einfügen“: Markiere die Tabelle auf der CareMan-Seite einfach mit der Maus (oder Cmd + A), kopiere sie (Cmd + C) und füge sie dort direkt ein!');
  }

  let detectedStation = 'Sendling';
  let mCount = 0, oCount = 0, hCount = 0;
  colleaguesList.forEach(c => {
    Object.values(c.shifts).forEach(code => {
      const up = (code || '').toUpperCase().trim();
      if (up.endsWith('M') || up.includes('-M') || ['RFM', 'RSM', 'RNM', 'RT1M', 'RT2M', 'RT3M', 'RT4M', 'RS2M', 'RCM', 'RHM', 'DDM'].includes(up)) mCount++;
      else if (up.endsWith('O') || up === 'RFO' || up === 'RSO' || up.startsWith('NFO') || up.startsWith('FFO')) oCount++;
      else if (up.endsWith('H') || up.includes('HBN') || ['RFH', 'RTH', 'RT1H', 'RT2H', 'RSH', 'RNH', 'RHH'].includes(up)) hCount++;
    });
  });
  if (oCount > mCount && oCount > hCount) detectedStation = 'Obersendling';
  else if (hCount > mCount && hCount > oCount) detectedStation = 'Hohenbrunn';

  return {
    yearMonth,
    monthLabel,
    station: detectedStation,
    daysInMonth,
    totalColleagues: colleaguesList.length,
    totalShifts,
    colleagues: colleaguesList,
    shiftsByDate,
    isHtml: true,
    isVerified: true
  };
}
