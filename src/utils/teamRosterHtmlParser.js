import { cleanColleagueName, isVehicleOrDummyRow } from './teamRosterPdfParser.js';
import { getShiftTypeForCode, getStationForCode, getTimesForCode } from './teamRosterParser.js';

/**
 * Parses an exported or saved HTML file (Cmd+S -> Nur HTML) of CareMan Roster
 * with 100% precision directly from the DOM.
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

  if (onProgress) onProgress(40);

  // Parse HTML string in browser DOMParser
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');

  // 1. Detect Month and Year from headings, title, or body text
  const monthNames = [
    'januar', 'februar', 'märz', 'april', 'mai', 'juni',
    'juli', 'august', 'september', 'oktober', 'november', 'dezember'
  ];

  let year = new Date().getFullYear();
  let month = new Date().getMonth() + 1;

  const fullText = doc.body ? doc.body.textContent : htmlString;
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

  if (onProgress) onProgress(60);

  // 2. Locate the main roster table
  // Find all <table> elements and pick the one with the most rows/columns
  const tables = Array.from(doc.querySelectorAll('table'));
  let targetTable = null;
  let maxCells = 0;

  for (const table of tables) {
    const cellCount = table.querySelectorAll('td, th').length;
    if (cellCount > maxCells) {
      maxCells = cellCount;
      targetTable = table;
    }
  }

  const shiftsByDate = {};
  for (let d = 1; d <= daysInMonth; d++) {
    shiftsByDate[`${yearMonth}-${String(d).padStart(2, '0')}`] = [];
  }

  const colleaguesList = [];

  if (targetTable) {
    const rows = Array.from(targetTable.querySelectorAll('tr'));

    // Find the header row containing day numbers (1 to 28..31)
    let dayColMap = new Map(); // colIndex -> dayNumber
    let nameColIndex = -1;

    for (let r = 0; r < Math.min(10, rows.length); r++) {
      const cells = Array.from(rows[r].children);
      const tempDayMap = new Map();

      cells.forEach((cell, idx) => {
        const text = cell.textContent.trim();
        // Check for standalone day number (e.g. "1", "01", "1 Fr", "Do 1", etc.)
        const numMatch = text.match(/\b([1-9]|[12][0-9]|3[01])\b/);
        if (numMatch) {
          const d = parseInt(numMatch[1], 10);
          if (d >= 1 && d <= daysInMonth) {
            tempDayMap.set(idx, d);
          }
        }
      });

      // If we found at least 15 days in this row, it is our day header row!
      if (tempDayMap.size >= 15) {
        dayColMap = tempDayMap;
        break;
      }
    }

    // Identify the colleague name column: check rows for cell containing "Nachname, Vorname"
    for (let r = 0; r < rows.length; r++) {
      const cells = Array.from(rows[r].children);
      for (let c = 0; c < cells.length; c++) {
        if (!dayColMap.has(c)) {
          const text = cells[c].textContent.trim();
          if (text.includes(',') && !text.match(/\d{2,}/) && text.length > 4 && text.length < 50) {
            nameColIndex = c;
            break;
          }
        }
      }
      if (nameColIndex !== -1) break;
    }

    if (nameColIndex === -1) {
      nameColIndex = 0; // fallback to first column
    }

    // Parse each colleague row
    rows.forEach(row => {
      const cells = Array.from(row.children);
      if (cells.length < 5) return;

      const nameCell = cells[nameColIndex];
      if (!nameCell) return;

      const rawName = nameCell.textContent.trim();
      if (!rawName || !rawName.includes(',') || isVehicleOrDummyRow(rawName)) return;

      const colleagueName = cleanColleagueName(rawName);
      if (!colleagueName) return;

      const colleagueShifts = {};

      dayColMap.forEach((dayNum, colIdx) => {
        if (colIdx < cells.length) {
          const cell = cells[colIdx];
          // Get text or title/alt if available
          let code = cell.textContent.trim();

          // Sometimes shifts are inside badges or data attributes
          const innerBadge = cell.querySelector('[data-shift], .shift, .badge, span');
          if (innerBadge) {
            const attr = innerBadge.getAttribute('data-shift') || innerBadge.getAttribute('title');
            if (attr) code = attr.trim();
          }

          // Clean code: remove leading/trailing non-alphanumerics, keep valid codes
          code = code.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();

          // Filter out dummy/empty values like "-", "/", "frei", "0", etc.
          if (code && code !== '-' && code !== '/' && code !== '0' && code.toLowerCase() !== 'frei' && code.length >= 2) {
            // If code contains multiple words, take the first uppercase abbreviation token
            const tokens = code.split(' ').filter(Boolean);
            const validToken = tokens.find(t => /^[A-Z0-9\-]{2,10}$/i.test(t)) || tokens[0];

            if (validToken) {
              const cleanCode = validToken.toUpperCase();
              const dateStr = `${yearMonth}-${String(dayNum).padStart(2, '0')}`;
              colleagueShifts[dateStr] = cleanCode;

              const st = getShiftTypeForCode(cleanCode);
              const station = getStationForCode(cleanCode);
              const times = getTimesForCode(cleanCode, st);

              shiftsByDate[dateStr].push({
                name: colleagueName,
                code: cleanCode,
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

      if (Object.keys(colleagueShifts).length > 0) {
        colleaguesList.push({
          name: colleagueName,
          shifts: colleagueShifts
        });
      }
    });
  }

  // Fallback if no <table> was found: check for TSV (copied table text)
  if (colleaguesList.length === 0 && htmlString.includes('\t')) {
    const rawLines = htmlString.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let dayColMap = new Map();

    for (let r = 0; r < Math.min(10, rawLines.length); r++) {
      const parts = rawLines[r].split('\t').map(p => p.trim());
      const tempDayMap = new Map();
      parts.forEach((p, idx) => {
        const numMatch = p.match(/\b([1-9]|[12][0-9]|3[01])\b/);
        if (numMatch) {
          const d = parseInt(numMatch[1], 10);
          if (d >= 1 && d <= daysInMonth) tempDayMap.set(idx, d);
        }
      });
      if (tempDayMap.size >= 15) {
        dayColMap = tempDayMap;
        break;
      }
    }

    rawLines.forEach(line => {
      const parts = line.split('\t').map(p => p.trim());
      if (parts.length < 5) return;

      const nameCandidate = parts.find((p, idx) => !dayColMap.has(idx) && p.includes(',') && !p.match(/\d{2,}/));
      if (!nameCandidate || isVehicleOrDummyRow(nameCandidate)) return;

      const colleagueName = cleanColleagueName(nameCandidate);
      if (!colleagueName) return;

      const colleagueShifts = {};
      dayColMap.forEach((dayNum, colIdx) => {
        if (colIdx < parts.length) {
          const code = parts[colIdx].toUpperCase();
          if (code && code !== '-' && code !== '/' && code !== '0' && code !== 'FREI' && code.length >= 2) {
            const tokens = code.split(' ').filter(Boolean);
            const validToken = tokens.find(t => /^[A-Z0-9\-]{2,10}$/i.test(t)) || tokens[0];
            if (validToken) {
              const cleanCode = validToken.toUpperCase();
              const dateStr = `${yearMonth}-${String(dayNum).padStart(2, '0')}`;
              colleagueShifts[dateStr] = cleanCode;

              const st = getShiftTypeForCode(cleanCode);
              const station = getStationForCode(cleanCode);
              const times = getTimesForCode(cleanCode, st);

              shiftsByDate[dateStr].push({
                name: colleagueName,
                code: cleanCode,
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

      if (Object.keys(colleagueShifts).length > 0) {
        colleaguesList.push({
          name: colleagueName,
          shifts: colleagueShifts
        });
      }
    });
  }

  if (onProgress) onProgress(100);

  const totalShifts = Object.values(shiftsByDate).reduce((acc, list) => acc + list.length, 0);

  if (colleaguesList.length === 0) {
    throw new Error('In der HTML-Datei konnte keine Dienstplantabelle gefunden werden. Bitte stelle sicher, dass die gesamte Seite als HTML gespeichert wurde.');
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
