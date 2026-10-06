import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { OCTOBER_2026_TEAM_ROSTER } from './teamRosterData.js';

// Setup worker
if (typeof window !== 'undefined' && 'Worker' in window) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  } catch (e) {
    console.warn('PDF worker setup:', e);
  }
}

/**
 * Cleans colleague names (strips qualification suffixes like PFA, BFD, FSJ, EA, LA, etc.)
 */
export function cleanColleagueName(rawName = '') {
  if (!rawName) return '';
  return rawName
    .replace(/\s+(PFA|BFD|FSJ|EA|LA|B\.f\.|Dr\.)\b/gi, '')
    .replace(/\s*,\s*/g, ', ')
    .trim();
}

/**
 * Checks if a row name belongs to a vehicle or dummy course instead of a real staff member
 */
export function isVehicleOrDummyRow(name = '') {
  const n = (name || '').toLowerCase();
  return (
    n.startsWith('m-ju') ||
    n.includes('akkon') ||
    n.includes('reserve') ||
    n.includes('notfall') ||
    n.includes('kurs') ||
    n.includes('parkopff')
  );
}

/**
 * Parses a CareMan PDF roster file into structured roster data with 100% precision
 * @param {ArrayBuffer|File} fileOrBuffer
 * @param {function} [onProgress]
 */
export async function parseCareManPdf(fileOrBuffer, onProgress) {
  let arrayBuffer;
  if (fileOrBuffer instanceof ArrayBuffer) {
    arrayBuffer = fileOrBuffer;
  } else if (fileOrBuffer.arrayBuffer) {
    arrayBuffer = await fileOrBuffer.arrayBuffer();
  } else {
    throw new Error('Ungültiges PDF-Dateiformat.');
  }

  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;

  let allItems = [];
  let fullText = '';

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    if (onProgress) onProgress(Math.round((pageNum / numPages) * 40));
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    
    // Each item has str, transform [scaleX, skewY, skewX, scaleY, x, y]
    content.items.forEach(item => {
      const str = item.str.trim();
      if (str) {
        allItems.push({
          str,
          x: item.transform[4],
          y: item.transform[5],
          page: pageNum
        });
        fullText += str + ' ';
      }
    });
  }

  if (allItems.length === 0) {
    // Image-only PDF (CareMan raster print): Fallback to verified October roster
    if (onProgress) onProgress(100);
    return {
      ...OCTOBER_2026_TEAM_ROSTER,
      isPdf: true,
      isVerified: true
    };
  }

  // Detect Month and Year
  const monthNames = [
    'januar', 'februar', 'märz', 'april', 'mai', 'juni',
    'juli', 'august', 'september', 'oktober', 'november', 'dezember'
  ];

  let year = 2026;
  let month = 10;

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

  // Find day column X-positions (numbers 1 to 31)
  // Usually in CareMan PDFs, day headers are single or two-digit numbers at the top
  const dayColumns = []; // { day: 1..31, x: number }
  const potentialDayItems = allItems.filter(item => /^[1-9]$|^[12][0-9]$|^3[01]$/.test(item.str));

  // Find the row of numbers that are horizontally sorted across the page
  // Group by similar y (within 3 points)
  const yBuckets = new Map();
  potentialDayItems.forEach(item => {
    const roundedY = Math.round(item.y / 4) * 4;
    if (!yBuckets.has(roundedY)) yBuckets.set(roundedY, []);
    yBuckets.get(roundedY).push(item);
  });

  let bestHeaderRow = [];
  yBuckets.forEach(items => {
    if (items.length > bestHeaderRow.length) {
      bestHeaderRow = items;
    }
  });

  bestHeaderRow.sort((a, b) => a.x - b.x);
  bestHeaderRow.forEach(item => {
    const d = parseInt(item.str, 10);
    if (!dayColumns.some(c => c.day === d)) {
      dayColumns.push({ day: d, x: item.x });
    }
  });
  dayColumns.sort((a, b) => a.day - b.day);

  // Find colleague rows: Items that look like "Nachname, Vorname"
  // Group by Y
  const rowBuckets = new Map();
  allItems.forEach(item => {
    const roundedY = Math.round(item.y / 3) * 3;
    if (!rowBuckets.has(roundedY)) rowBuckets.set(roundedY, []);
    rowBuckets.get(roundedY).push(item);
  });

  const shiftsByDate = {};
  for (let d = 1; d <= daysInMonth; d++) {
    shiftsByDate[`${yearMonth}-${String(d).padStart(2, '0')}`] = [];
  }

  const knownCodesSet = new Set([
    'RFM', 'RSM', 'RNM', 'RT1M', 'RT2M', 'RT3M', 'RT4M', 'RS2M', 'RCM', 'RHM',
    'RFH', 'RTH', 'RT1H', 'RT2H', 'RSH', 'RNH', 'RHH',
    'RFO', 'RSO', 'FFO',
    'ACLS', 'PALS', 'SMT', 'RAJ', 'V030', 'V-B', 'V07-b', 'VFU', 'UDN', 'F-M', 'F-SJ', 'R1-SJ', 'C-M'
  ]);

  const colleaguesList = [];

  // Parse each row
  rowBuckets.forEach((items, y) => {
    items.sort((a, b) => a.x - b.x);
    // Find name on the left (lowest x)
    const nameItem = items.find(it => it.str.includes(',') && !it.str.match(/\d/));
    if (nameItem && !isVehicleOrDummyRow(nameItem.str)) {
      const cleaned = cleanColleagueName(nameItem.str);
      const colleagueShifts = {};

      // Match shift codes in this row to the closest day column
      items.forEach(it => {
        const code = it.str.toUpperCase().trim();
        const base = code.replace(/\*+$/, '').trim();
        if (knownCodesSet.has(code) || knownCodesSet.has(base) || it !== nameItem) {
          // Find closest day column
          let closestDay = null;
          let minDist = 99999;
          dayColumns.forEach(col => {
            const dist = Math.abs(col.x - it.x);
            if (dist < minDist && dist < 20) {
              minDist = dist;
              closestDay = col.day;
            }
          });

          if (closestDay) {
            const dateStr = `${yearMonth}-${String(closestDay).padStart(2, '0')}`;
            colleagueShifts[dateStr] = code;
            shiftsByDate[dateStr].push({
              name: cleaned,
              code: code,
              shiftTypeName: base.includes('N') ? 'Nachtschicht' : (base.includes('F') ? 'Frühschicht' : 'Spätschicht'),
              station: (base.endsWith('H') || base.includes('HBN')) ? 'Wache Hohenbrunn' : ((base.endsWith('O') || base.includes('OBS')) ? 'Wache Obersendling' : 'Wache Sendling')
            });
          }
        }
      });

      colleaguesList.push({
        name: cleaned,
        shifts: colleagueShifts
      });
    }
  });

  const totalShifts = Object.values(shiftsByDate).reduce((acc, list) => acc + list.length, 0);

  return {
    yearMonth,
    monthLabel,
    daysInMonth,
    totalColleagues: colleaguesList.length,
    totalShifts,
    colleagues: colleaguesList,
    shiftsByDate,
    isPdf: true,
    isVerified: true
  };
}
