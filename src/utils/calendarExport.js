/**
 * iCalendar (.ics) generator for iOS Calendar and other calendar applications.
 * Formats shifts with exact start/end timestamps (handling midnight crossings),
 * location, description, reminders, target calendar name ("Familie"),
 * and RFC 5545 SEQUENCE + LAST-MODIFIED versioning so existing calendar entries
 * can be updated/overwritten.
 */

const EXPORT_HISTORY_STORAGE_KEY = 'schichttagebuch_ics_export_history_v1';

// Format ISO date (YYYYMMDD) and time (HHMMSS)
function formatIcsDateTime(dateStr, timeStr) {
  const cleanDate = dateStr.replace(/[^0-9]/g, ''); // YYYYMMDD
  const cleanTime = (timeStr || '00:00').replace(/[^0-9]/g, '').padEnd(4, '0') + '00'; // HHMMSS
  return `${cleanDate}T${cleanTime}`;
}

// Add days to YYYY-MM-DD
function addDaysToDateStr(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const nextY = date.getFullYear();
  const nextM = String(date.getMonth() + 1).padStart(2, '0');
  const nextD = String(date.getDate()).padStart(2, '0');
  return `${nextY}-${nextM}-${nextD}`;
}

// Escape special characters in iCalendar text
function escapeIcsText(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Load export history from localStorage
 * Structure: { [yearMonth]: { exportedAt, items: { [shiftIdOrDate]: { uid, id, date, fingerprint, summary, dtStart, dtEnd } } } }
 */
export function getCalendarExportHistory(yearMonth) {
  try {
    const raw = localStorage.getItem(EXPORT_HISTORY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return yearMonth ? (parsed[yearMonth] || null) : parsed;
  } catch {
    return null;
  }
}

function saveCalendarExportHistory(yearMonth, itemsMap) {
  try {
    const raw = localStorage.getItem(EXPORT_HISTORY_STORAGE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[yearMonth] = {
      exportedAt: Date.now(),
      items: itemsMap
    };
    localStorage.setItem(EXPORT_HISTORY_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // ignore storage errors
  }
}

export function buildShiftFingerprint(shift, storeSettings = {}) {
  const shiftCodeObj = (storeSettings.shiftCodes || []).find(
    c => c.id === shift.codeId || c.code === shift.code
  );
  const code = shift.code || shiftCodeObj?.code || 'Schicht';
  const shiftTypeObj = (storeSettings.shiftTypes || []).find(
    t => t.id === shift.typeId
  );
  const typeName = shift.shiftTypeName || shiftTypeObj?.name || 'Dienst';

  return [
    shift.date || '',
    code,
    typeName,
    shift.startTime || '',
    shift.endTime || '',
    shift.station || '',
    shift.vehicle || '',
    shift.callSign || '',
    shift.partner || ''
  ].join('|');
}

/**
 * Determine export status of a shift compared to last export of this month:
 * 'new' | 'modified' | 'unchanged'
 */
export function getShiftExportStatus(shift, yearMonth, storeSettings = {}) {
  const history = getCalendarExportHistory(yearMonth);
  if (!history || !history.items) return 'new';

  const prevById = history.items[shift.id];
  const prevByDate = Object.values(history.items).find(item => item.date === shift.date);
  const prev = prevById || prevByDate;

  if (!prev) return 'new';
  const currentFp = buildShiftFingerprint(shift, storeSettings);
  if (prev.fingerprint !== currentFp) return 'modified';
  return 'unchanged';
}

function getTimezoneLines() {
  return [
    'X-WR-TIMEZONE:Europe/Berlin',
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Berlin',
    'X-LIC-LOCATION:Europe/Berlin',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'END:VTIMEZONE'
  ];
}

/**
 * Generates an .ics file string from a list of shifts
 * @param {Array} shifts - Array of shift objects
 * @param {Object} options - Export options (calendarName, alarmMinutes, titleFormat, overwriteMode, etc.)
 */
export function generateIcsCalendar(shifts, options = {}) {
  const {
    calendarName = 'Familie',
    alarmMinutes = 1440,
    alarmOption = '1440',
    titleFormat = 'codeAndType', // 'codeAndType', 'codeOnly', 'typeAndTimes'
    overwriteMode = 'update',    // 'update' (same UID + incremented SEQUENCE) | 'forceNew' (fresh UID so iOS never skips)
    yearMonth = '',
    storeSettings = {}
  } = options;

  const nowIso = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  // Strictly increasing integer sequence (seconds since 2026-01-01) so every export has a higher SEQUENCE than any previous one
  const sequenceNum = Math.max(1, Math.floor((Date.now() - 1767225600000) / 1000));

  const prevHistory = yearMonth ? getCalendarExportHistory(yearMonth) : null;
  const prevItems = prevHistory?.items || {};
  const nextHistoryItems = { ...prevItems };

  let icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Schichttagebuch//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    ...getTimezoneLines()
  ];

  const exportedUidsInThisBatch = new Set();

  shifts.forEach(shift => {
    const shiftCodeObj = (storeSettings.shiftCodes || []).find(
      c => c.id === shift.codeId || c.code === shift.code
    );
    const code = shift.code || shiftCodeObj?.code || 'Schicht';

    const shiftTypeObj = (storeSettings.shiftTypes || []).find(
      t => t.id === shift.typeId
    );
    const typeName = shift.shiftTypeName || shiftTypeObj?.name || 'Dienst';

    // Summary formatting
    let summary = `${code} (${typeName})`;
    if (titleFormat === 'codeOnly') {
      summary = code;
    } else if (titleFormat === 'typeAndTimes') {
      summary = `${typeName} (${shift.startTime || '07:00'} - ${shift.endTime || '19:00'})`;
    }

    // Determine start and end date (accounting for midnight crossing)
    const startDateStr = shift.date;
    const startTimeStr = shift.startTime || '07:00';
    const endTimeStr = shift.endTime || '19:00';

    const [startH, startM] = startTimeStr.split(':').map(Number);
    const [endH, endM] = endTimeStr.split(':').map(Number);

    // If end time is earlier than start time, it crosses midnight into the next day
    const isOvernight = endH < startH || (endH === startH && endM < startM);
    const endDateStr = isOvernight ? addDaysToDateStr(startDateStr, 1) : startDateStr;

    const dtStart = formatIcsDateTime(startDateStr, startTimeStr);
    const dtEnd = formatIcsDateTime(endDateStr, endTimeStr);

    // Build description
    const descParts = [
      `Dienst: ${code} - ${typeName}`,
      `Zeiten: ${startTimeStr} bis ${endTimeStr} Uhr`,
      shift.station ? `Wache: ${shift.station}` : null,
      shift.vehicle ? `Fahrzeug: ${shift.vehicle}` : null,
      shift.callSign ? `Funkrufname: ${shift.callSign}` : null,
      shift.partner ? `PartnerIn: ${shift.partner}` : null
    ].filter(Boolean);

    const description = escapeIcsText(descParts.join('\n'));
    const location = escapeIcsText(shift.station || '');

    // Determine UID:
    // In 'update' mode: reuse previously exported UID for this shift (or same date) so Apple Calendar matches the existing entry
    // In 'forceNew' mode: generate a fresh revision UID so iOS Safari's "Add All" never skips the event
    const prevRecord = prevItems[shift.id] || Object.values(prevItems).find(it => it.date === shift.date);
    let uid;
    if (overwriteMode === 'forceNew') {
      uid = `${shift.id || shift.date}-rev${sequenceNum}@schichttagebuch`;
    } else {
      uid = prevRecord?.uid || `${shift.id || crypto.randomUUID()}@schichttagebuch`;
    }

    exportedUidsInThisBatch.add(uid);

    // Save into history for future updates / cancellations
    nextHistoryItems[shift.id || shift.date] = {
      uid,
      id: shift.id,
      date: shift.date,
      summary,
      dtStart,
      dtEnd,
      location: shift.station || '',
      sequence: sequenceNum,
      fingerprint: buildShiftFingerprint(shift, storeSettings),
      exportedAt: Date.now()
    };

    icsContent.push('BEGIN:VEVENT');
    icsContent.push(`UID:${uid}`);
    icsContent.push(`SEQUENCE:${sequenceNum}`);
    icsContent.push(`DTSTAMP:${nowIso}`);
    icsContent.push(`LAST-MODIFIED:${nowIso}`);
    icsContent.push(`DTSTART;TZID=Europe/Berlin:${dtStart}`);
    icsContent.push(`DTEND;TZID=Europe/Berlin:${dtEnd}`);
    icsContent.push(`SUMMARY:${escapeIcsText(summary)}`);
    if (location) icsContent.push(`LOCATION:${location}`);
    icsContent.push(`DESCRIPTION:${description}`);
    icsContent.push('STATUS:CONFIRMED');
    icsContent.push('TRANSP:OPAQUE');

    // Optional Alarm / Reminder (supports 1 Tag vorher, multiple alarms, custom times)
    const effectiveAlarm = String(alarmOption || alarmMinutes || '1440');

    if (effectiveAlarm === '1440' || effectiveAlarm === 'day_before') {
      icsContent.push('BEGIN:VALARM');
      icsContent.push('TRIGGER:-P1D');
      icsContent.push('ACTION:DISPLAY');
      icsContent.push(`DESCRIPTION:Erinnerung: Morgen Dienst ${escapeIcsText(code)} (${startTimeStr} - ${endTimeStr} Uhr)`);
      icsContent.push('END:VALARM');
    } else if (effectiveAlarm === '1440_60') {
      // 1. Alarm: 1 Tag vorher
      icsContent.push('BEGIN:VALARM');
      icsContent.push('TRIGGER:-P1D');
      icsContent.push('ACTION:DISPLAY');
      icsContent.push(`DESCRIPTION:Erinnerung: Morgen Dienst ${escapeIcsText(code)} (${startTimeStr} - ${endTimeStr} Uhr)`);
      icsContent.push('END:VALARM');
      // 2. Alarm: 1 Stunde vorher
      icsContent.push('BEGIN:VALARM');
      icsContent.push('TRIGGER:-PT1H');
      icsContent.push('ACTION:DISPLAY');
      icsContent.push(`DESCRIPTION:Erinnerung: In 1 Std. Dienst ${escapeIcsText(code)} (${startTimeStr} - ${endTimeStr} Uhr)`);
      icsContent.push('END:VALARM');
    } else if (effectiveAlarm === '2880') {
      icsContent.push('BEGIN:VALARM');
      icsContent.push('TRIGGER:-P2D');
      icsContent.push('ACTION:DISPLAY');
      icsContent.push(`DESCRIPTION:Erinnerung: In 2 Tagen Dienst ${escapeIcsText(code)}`);
      icsContent.push('END:VALARM');
    } else if (effectiveAlarm === '720') {
      icsContent.push('BEGIN:VALARM');
      icsContent.push('TRIGGER:-PT12H');
      icsContent.push('ACTION:DISPLAY');
      icsContent.push(`DESCRIPTION:Erinnerung: In 12 Std. Dienst ${escapeIcsText(code)}`);
      icsContent.push('END:VALARM');
    } else if (effectiveAlarm === '120') {
      icsContent.push('BEGIN:VALARM');
      icsContent.push('TRIGGER:-PT2H');
      icsContent.push('ACTION:DISPLAY');
      icsContent.push(`DESCRIPTION:Erinnerung: In 2 Std. Dienst ${escapeIcsText(code)}`);
      icsContent.push('END:VALARM');
    } else if (effectiveAlarm === '60') {
      icsContent.push('BEGIN:VALARM');
      icsContent.push('TRIGGER:-PT1H');
      icsContent.push('ACTION:DISPLAY');
      icsContent.push(`DESCRIPTION:Erinnerung: In 1 Std. Dienst ${escapeIcsText(code)}`);
      icsContent.push('END:VALARM');
    } else if (effectiveAlarm === '30') {
      icsContent.push('BEGIN:VALARM');
      icsContent.push('TRIGGER:-PT30M');
      icsContent.push('ACTION:DISPLAY');
      icsContent.push(`DESCRIPTION:Erinnerung: In 30 Min. Dienst ${escapeIcsText(code)}`);
      icsContent.push('END:VALARM');
    } else if (Number(effectiveAlarm) > 0) {
      icsContent.push('BEGIN:VALARM');
      icsContent.push(`TRIGGER:-PT${Number(effectiveAlarm)}M`);
      icsContent.push('ACTION:DISPLAY');
      icsContent.push(`DESCRIPTION:Erinnerung an Dienst ${escapeIcsText(code)}`);
      icsContent.push('END:VALARM');
    }

    icsContent.push('END:VEVENT');
  });

  if (yearMonth) {
    saveCalendarExportHistory(yearMonth, nextHistoryItems);
  }

  icsContent.push('END:VCALENDAR');
  return icsContent.join('\r\n');
}

/**
 * Generates a Cancellation .ics file (METHOD:CANCEL + STATUS:CANCELLED)
 * to remove previously exported events of the given shifts/month from Apple Calendar.
 */
export function generateCancelIcsCalendar(shifts = [], options = {}) {
  const {
    calendarName = 'Familie',
    titleFormat = 'codeAndType',
    yearMonth = '',
    storeSettings = {}
  } = options;

  const nowIso = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const sequenceNum = Math.max(2, Math.floor((Date.now() - 1767225600000) / 1000) + 1);

  const prevHistory = yearMonth ? getCalendarExportHistory(yearMonth) : null;
  const prevItems = prevHistory?.items || {};

  let icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Schichttagebuch//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:CANCEL',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    ...getTimezoneLines()
  ];

  const cancelledUids = new Set();

  // 1. Cancel all selected current shifts (using both their current shift.id UID and any previously stored UID)
  shifts.forEach(shift => {
    const shiftCodeObj = (storeSettings.shiftCodes || []).find(
      c => c.id === shift.codeId || c.code === shift.code
    );
    const code = shift.code || shiftCodeObj?.code || 'Schicht';
    const shiftTypeObj = (storeSettings.shiftTypes || []).find(
      t => t.id === shift.typeId
    );
    const typeName = shift.shiftTypeName || shiftTypeObj?.name || 'Dienst';

    let summary = `${code} (${typeName})`;
    if (titleFormat === 'codeOnly') summary = code;
    else if (titleFormat === 'typeAndTimes') summary = `${typeName} (${shift.startTime || '07:00'} - ${shift.endTime || '19:00'})`;

    const startDateStr = shift.date;
    const startTimeStr = shift.startTime || '07:00';
    const endTimeStr = shift.endTime || '19:00';
    const [startH, startM] = startTimeStr.split(':').map(Number);
    const [endH, endM] = endTimeStr.split(':').map(Number);
    const isOvernight = endH < startH || (endH === startH && endM < startM);
    const endDateStr = isOvernight ? addDaysToDateStr(startDateStr, 1) : startDateStr;

    const dtStart = formatIcsDateTime(startDateStr, startTimeStr);
    const dtEnd = formatIcsDateTime(endDateStr, endTimeStr);

    const candidateUids = new Set([`${shift.id}@schichttagebuch`]);
    const prevById = prevItems[shift.id];
    if (prevById?.uid) candidateUids.add(prevById.uid);
    const prevByDate = Object.values(prevItems).find(it => it.date === shift.date);
    if (prevByDate?.uid) candidateUids.add(prevByDate.uid);

    candidateUids.forEach(uid => {
      if (!uid || cancelledUids.has(uid)) return;
      cancelledUids.add(uid);

      icsContent.push('BEGIN:VEVENT');
      icsContent.push(`UID:${uid}`);
      icsContent.push(`SEQUENCE:${sequenceNum}`);
      icsContent.push(`DTSTAMP:${nowIso}`);
      icsContent.push(`LAST-MODIFIED:${nowIso}`);
      icsContent.push(`DTSTART;TZID=Europe/Berlin:${dtStart}`);
      icsContent.push(`DTEND;TZID=Europe/Berlin:${dtEnd}`);
      icsContent.push(`SUMMARY:${escapeIcsText(summary)}`);
      icsContent.push('STATUS:CANCELLED');
      icsContent.push('END:VEVENT');
    });
  });

  // 2. Also cancel any orphaned shifts from previous exports of this month that were since deleted in the app
  Object.values(prevItems).forEach(item => {
    if (!item?.uid || cancelledUids.has(item.uid)) return;
    cancelledUids.add(item.uid);

    icsContent.push('BEGIN:VEVENT');
    icsContent.push(`UID:${item.uid}`);
    icsContent.push(`SEQUENCE:${sequenceNum}`);
    icsContent.push(`DTSTAMP:${nowIso}`);
    icsContent.push(`LAST-MODIFIED:${nowIso}`);
    icsContent.push(`DTSTART;TZID=Europe/Berlin:${item.dtStart}`);
    icsContent.push(`DTEND;TZID=Europe/Berlin:${item.dtEnd}`);
    icsContent.push(`SUMMARY:${escapeIcsText(item.summary || 'Dienst')}`);
    icsContent.push('STATUS:CANCELLED');
    icsContent.push('END:VEVENT');
  });

  icsContent.push('END:VCALENDAR');
  return icsContent.join('\r\n');
}

/**
 * Triggers download of the .ics file on iOS / desktop browsers
 */
export function downloadIcsFile(shifts, options = {}) {
  const {
    calendarName = 'Familie',
    yearMonth = '2026-11',
    overwriteMode = 'update'
  } = options;

  const icsString = generateIcsCalendar(shifts, options);
  const blob = new Blob([icsString], { type: 'text/calendar;charset=utf-8' });

  const suffix = overwriteMode === 'forceNew' ? '_Neu' : '';
  const fileName = `Dienstplan_${yearMonth}_${calendarName}${suffix}.ics`;

  // Standard anchor download
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  return true;
}

/**
 * Triggers download of a cancellation .ics file to remove old events from Apple Calendar
 */
export function downloadCancelIcsFile(shifts, options = {}) {
  const {
    calendarName = 'Familie',
    yearMonth = '2026-11'
  } = options;

  const icsString = generateCancelIcsCalendar(shifts, options);
  const blob = new Blob([icsString], { type: 'text/calendar;charset=utf-8' });

  const fileName = `Dienstplan_${yearMonth}_${calendarName}_Loeschen.ics`;

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  return true;
}
