/**
 * iCalendar (.ics) generator for iOS Calendar and other calendar applications.
 * Formats shifts with exact start/end timestamps (handling midnight crossings),
 * location, description, reminders, and target calendar name ("Familie").
 */

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
 * Generates an .ics file string from a list of shifts
 * @param {Array} shifts - Array of shift objects
 * @param {Object} options - Export options (calendarName, alarmMinutes, titleFormat, etc.)
 */
export function generateIcsCalendar(shifts, options = {}) {
  const {
    calendarName = 'Familie',
    alarmMinutes = 60, // e.g. 60 min before shift
    titleFormat = 'codeAndType', // 'codeAndType', 'codeOnly', 'typeAndTimes'
    storeSettings = {}
  } = options;

  const nowIso = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  let icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Schichttagebuch//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
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
    const uid = `${shift.id || crypto.randomUUID()}@schichttagebuch`;

    icsContent.push('BEGIN:VEVENT');
    icsContent.push(`UID:${uid}`);
    icsContent.push(`DTSTAMP:${nowIso}`);
    icsContent.push(`DTSTART;TZID=Europe/Berlin:${dtStart}`);
    icsContent.push(`DTEND;TZID=Europe/Berlin:${dtEnd}`);
    icsContent.push(`SUMMARY:${escapeIcsText(summary)}`);
    if (location) icsContent.push(`LOCATION:${location}`);
    icsContent.push(`DESCRIPTION:${description}`);
    icsContent.push('STATUS:CONFIRMED');

    // Optional Alarm / Reminder
    if (alarmMinutes > 0) {
      icsContent.push('BEGIN:VALARM');
      icsContent.push(`TRIGGER:-PT${alarmMinutes}M`);
      icsContent.push('ACTION:DISPLAY');
      icsContent.push(`DESCRIPTION:Erinnerung an Dienst ${escapeIcsText(code)}`);
      icsContent.push('END:VALARM');
    }

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
    yearMonth = '2026-11'
  } = options;

  const icsString = generateIcsCalendar(shifts, options);
  const blob = new Blob([icsString], { type: 'text/calendar;charset=utf-8' });

  const fileName = `Dienstplan_${yearMonth}_${calendarName}.ics`;

  // Standard anchor download
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  return true;
}
