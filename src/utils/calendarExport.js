/**
 * iCalendar (.ics) generator & iOS Shortcut bridge for Apple Calendar on iPhone/Mac.
 *
 * Why iOS Safari (.ics) needs special handling:
 * - iOS Safari's native .ics previewer (EKICSPreviewController) is an "Add-Only" importer:
 *   1. Any VEVENT whose UID already exists in the iPhone Calendar is silently skipped ("importedEvents").
 *   2. METHOD:CANCEL / STATUS:CANCELLED inside a .ics file is ignored by iOS Safari and never deletes events.
 *
 * Solution implemented here:
 * 1. Content-Hash UIDs in 'update' mode (`<shiftId>-<contentHash>-v<resetVersion>@schichttagebuch`):
 *    - Unchanged shifts keep their exact UID -> iOS Safari automatically skips them (0 duplicates).
 *    - Modified shifts (or changed Title/Reminder settings) get a new contentHash UID -> iOS Safari imports them!
 * 2. Native iOS Shortcut bridge (`Schichttagebuch-Kalender`) for deleting old entries on iPhone:
 *    - Deletes all `Dienst:` events of the selected month in 1 second via Apple Shortcuts (EventKit)
 *      and increments `resetVersion` so the subsequent .ics export starts fresh.
 */

const EXPORT_HISTORY_STORAGE_KEY = 'schichttagebuch_ics_export_history_v1';
const SHORTCUT_INSTALLED_STORAGE_KEY = 'schichttagebuch_ios_shortcut_installed_v1';

// Fast deterministic 32-bit FNV-1a hash -> 8-char hex string
function hashString(str) {
  let h = 0x811c9dc5;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

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
 * Structure: { [yearMonth]: { exportedAt, resetVersion, titleFormat, alarmOption, items: { [shiftId]: { uid, id, date, fingerprint, ... } } } }
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

function saveCalendarExportHistory(yearMonth, itemsMap, meta = {}) {
  try {
    const raw = localStorage.getItem(EXPORT_HISTORY_STORAGE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    const prev = all[yearMonth] || {};
    all[yearMonth] = {
      ...prev,
      ...meta,
      resetVersion: meta.resetVersion || prev.resetVersion || 1,
      exportedAt: Date.now(),
      items: itemsMap
    };
    localStorage.setItem(EXPORT_HISTORY_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // ignore storage errors
  }
}

/**
 * Increments resetVersion and clears exported items for a month
 * so that after deleting events from the calendar, all shifts can be exported fresh.
 */
export function resetMonthExportHistory(yearMonth) {
  if (!yearMonth) return 1;
  try {
    const raw = localStorage.getItem(EXPORT_HISTORY_STORAGE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    const prev = all[yearMonth] || {};
    const nextVersion = (prev.resetVersion || 1) + 1;
    all[yearMonth] = {
      exportedAt: null,
      resetVersion: nextVersion,
      items: {}
    };
    localStorage.setItem(EXPORT_HISTORY_STORAGE_KEY, JSON.stringify(all));
    return nextVersion;
  } catch {
    return 2;
  }
}

export function isIosShortcutMarkedInstalled() {
  try {
    return localStorage.getItem(SHORTCUT_INSTALLED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markIosShortcutInstalled() {
  try {
    localStorage.setItem(SHORTCUT_INSTALLED_STORAGE_KEY, '1');
  } catch {
    // ignore
  }
}

export function buildShiftFingerprint(shift, storeSettings = {}, exportOptions = {}) {
  const shiftCodeObj = (storeSettings.shiftCodes || []).find(
    c => c.id === shift.codeId || c.code === shift.code
  );
  const code = shift.code || shiftCodeObj?.code || 'Schicht';
  const shiftTypeObj = (storeSettings.shiftTypes || []).find(
    t => t.id === shift.typeId
  );
  const typeName = shift.shiftTypeName || shiftTypeObj?.name || 'Dienst';

  const titleFormat = exportOptions.titleFormat || 'codeAndType';
  const alarmOption = String(exportOptions.alarmOption ?? '1440');

  return [
    shift.date || '',
    code,
    typeName,
    shift.startTime || '',
    shift.endTime || '',
    shift.station || '',
    shift.vehicle || '',
    shift.callSign || '',
    shift.partner || '',
    titleFormat,
    alarmOption
  ].join('|');
}

/**
 * Determine export status of a shift compared to last export of this month:
 * 'new' | 'modified' | 'unchanged'
 */
export function getShiftExportStatus(shift, yearMonth, storeSettings = {}, exportOptions = {}) {
  const history = getCalendarExportHistory(yearMonth);
  if (!history || !history.items || Object.keys(history.items).length === 0) return 'new';

  const prevById = history.items[shift.id];
  const prevByDate = Object.values(history.items).find(item => item.date === shift.date);
  const prev = prevById || prevByDate;

  if (!prev) return 'new';
  const currentFp = buildShiftFingerprint(shift, storeSettings, exportOptions);
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
    calendarName = 'Dienstplan',
    alarmMinutes = 1440,
    alarmOption = '1440',
    titleFormat = 'codeAndType', // 'codeAndType', 'codeOnly', 'typeAndTimes'
    overwriteMode = 'update',    // 'update' (content-hash UID) | 'forceNew' (fresh revision UID)
    yearMonth = '',
    storeSettings = {}
  } = options;

  const nowIso = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const sequenceNum = Math.max(1, Math.floor((Date.now() - 1767225600000) / 1000));

  const prevHistory = yearMonth ? getCalendarExportHistory(yearMonth) : null;
  const prevItems = prevHistory?.items || {};
  const resetVersion = prevHistory?.resetVersion || 1;
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

    // Build description (starts with "Dienst:" so the iOS Shortcut can always identify Schichttagebuch entries)
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

    const fingerprint = buildShiftFingerprint(shift, storeSettings, { titleFormat, alarmOption });
    const contentHash = hashString(fingerprint);

    // Determine UID:
    // - In 'update' mode: stable UID per shift and resetVersion (`<id>-v<resetVersion>@schichttagebuch`).
    //   resetVersion only increments when the calendar month is cleared via the iOS Shortcut.
    // - In 'forceNew' mode: fresh revision UID so iOS Safari imports every selected shift unconditionally.
    let uid;
    if (overwriteMode === 'forceNew') {
      uid = `${shift.id || shift.date}-rev${sequenceNum}@schichttagebuch`;
    } else {
      uid = `${shift.id || shift.date}-v${resetVersion}@schichttagebuch`;
    }

    // Save into history for future change detection
    nextHistoryItems[shift.id || shift.date] = {
      uid,
      id: shift.id,
      date: shift.date,
      summary,
      dtStart,
      dtEnd,
      location: shift.station || '',
      sequence: sequenceNum,
      fingerprint,
      contentHash,
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

    // Optional Alarm / Reminder
    const effectiveAlarm = String(alarmOption || alarmMinutes || '1440');

    if (effectiveAlarm === '1440' || effectiveAlarm === 'day_before') {
      icsContent.push('BEGIN:VALARM');
      icsContent.push('TRIGGER:-P1D');
      icsContent.push('ACTION:DISPLAY');
      icsContent.push(`DESCRIPTION:Erinnerung: Morgen Dienst ${escapeIcsText(code)} (${startTimeStr} - ${endTimeStr} Uhr)`);
      icsContent.push('END:VALARM');
    } else if (effectiveAlarm === '1440_60') {
      icsContent.push('BEGIN:VALARM');
      icsContent.push('TRIGGER:-P1D');
      icsContent.push('ACTION:DISPLAY');
      icsContent.push(`DESCRIPTION:Erinnerung: Morgen Dienst ${escapeIcsText(code)} (${startTimeStr} - ${endTimeStr} Uhr)`);
      icsContent.push('END:VALARM');
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
    saveCalendarExportHistory(yearMonth, nextHistoryItems, {
      resetVersion,
      titleFormat,
      alarmOption: String(alarmOption)
    });
  }

  icsContent.push('END:VCALENDAR');
  return icsContent.join('\r\n');
}

/**
 * Triggers download of the .ics file on iOS / desktop browsers
 */
export function downloadIcsFile(shifts, options = {}) {
  const {
    calendarName = 'Dienstplan',
    yearMonth = '2026-11',
    overwriteMode = 'update'
  } = options;

  const icsString = generateIcsCalendar(shifts, options);
  const blob = new Blob([icsString], { type: 'text/calendar;charset=utf-8' });

  const suffix = overwriteMode === 'forceNew' ? '_Neu' : '';
  const fileName = `Dienstplan_${yearMonth}_${calendarName}${suffix}.ics`;

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  return true;
}

/**
 * Triggers the native iOS Shortcut ("Schichttagebuch-Kalender") to delete all
 * exported Schichttagebuch shifts ("Dienst:") of the given month from the iPhone Calendar,
 * and resets the export history version so the next .ics export imports cleanly.
 */
export function runIosCalendarDeleteShortcut(yearMonth = '2026-11') {
  const [y, m] = yearMonth.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const startStr = `${yearMonth}-01T00:00:00`;
  const endStr = `${yearMonth}-${String(lastDay).padStart(2, '0')}T23:59:59`;

  // Reset export history & increment resetVersion so subsequent exports have fresh UIDs
  resetMonthExportHistory(yearMonth);

  const inputPayload = `${startStr}\n${endStr}`;
  let returnUrl = window.location.href;
  try {
    const urlObj = new URL(window.location.href);
    urlObj.searchParams.set('month', yearMonth);
    urlObj.searchParams.set('openCalendarExport', '1');
    urlObj.searchParams.set('cleared', '1');
    returnUrl = urlObj.toString();
  } catch {
    // fallback to window.location.href
  }

  const shortcutUrl = `shortcuts://x-callback-url/run-shortcut?name=${encodeURIComponent('Schichttagebuch-Kalender')}&input=text&text=${encodeURIComponent(inputPayload)}&x-success=${encodeURIComponent(returnUrl)}`;

  window.location.href = shortcutUrl;
  return true;
}

/**
 * Downloads the pre-signed Apple Shortcut ("Schichttagebuch-Kalender.shortcut")
 * for 1-time installation in the iOS Shortcuts app.
 */
export function downloadIosDeleteShortcutFile() {
  markIosShortcutInstalled();
  const link = document.createElement('a');
  link.href = '/Schichttagebuch-Kalender.shortcut';
  link.setAttribute('download', 'Schichttagebuch-Kalender.shortcut');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  return true;
}
