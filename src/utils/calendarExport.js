/**
 * iCalendar (.ics) generator & iOS Shortcut bridge for Apple Calendar on iPhone/Mac.
 *
 * Why iOS Safari (.ics) needs special handling:
 * - iOS Safari's .ics importer is "add-only": it can neither update nor delete existing events
 *   (METHOD:CANCEL / STATUS:CANCELLED are ignored).
 *
 * Robust update strategy implemented here (v3.1.6):
 * 1. Every shift gets a STABLE calendar key per day (`YYYY-MM-DD#n`) – independent of the
 *    Firestore document id (which changes whenever a month is re-imported from CareMan).
 * 2. The export history (localStorage) remembers per key what was exported (fingerprint).
 *    Comparing it with the current month yields: new / modified / unchanged and REMOVED
 *    (shift deleted or moved to another day but still in the iPhone calendar).
 * 3. Only brand-new shifts are ever added without cleaning. As soon as a shift was modified
 *    or removed, the month is first cleaned via the native iOS Shortcut
 *    (`Schichttagebuch-Kalender`, deletes all `Dienst:` events of the month) and then
 *    exported completely with fresh UIDs.
 * 4. The export history is reset ONLY after the Shortcut confirmed success via x-success
 *    (one-time token). If the Shortcut fails or is cancelled nothing is reset, so no
 *    duplicates can be produced.
 * 5. The history is stored in the user's account (Firestore, see calendarExportRemote.js)
 *    with localStorage only as cache: on the iPhone the Home-Screen web app and Safari
 *    (where the Shortcut returns to) have separate localStorage.
 */

const EXPORT_HISTORY_STORAGE_KEY = 'schichttagebuch_ics_export_history_v1';
const SHORTCUT_INSTALLED_STORAGE_KEY = 'schichttagebuch_ios_shortcut_installed_v1';
const EXPORT_PREFS_STORAGE_KEY = 'schichttagebuch_ics_export_prefs_v1';
const CLEAR_TOKEN_MAX_AGE_MS = 30 * 60 * 1000;
const HISTORY_SCHEMA = 2;

export const DEFAULT_TITLE_FORMAT = 'codeAndType';
export const DEFAULT_ALARM_OPTION = '1440';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

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

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
}

// ---------------------------------------------------------------------------
// Remote (account-wide) storage of the export history
// ---------------------------------------------------------------------------

let remoteStore = null; // { loadMonth(ym), saveMonth(ym, entry) }
let lastRemoteError = null;
const pendingRemoteWrites = new Set();

/** Connects the export history to the user's account (Firestore adapter) or null for local only. */
export function setCalendarExportRemote(adapter) {
  remoteStore = adapter || null;
}

export function getCalendarExportRemoteError() {
  return lastRemoteError;
}

function entryStamp(entry) {
  return Number(entry?.updatedAt || entry?.exportedAt || 0);
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Zeitüberschreitung')), ms))
  ]);
}

function pushMonthToRemote(yearMonth, entry) {
  if (!remoteStore || !yearMonth || !entry) return Promise.resolve(false);
  const p = Promise.resolve()
    .then(() => remoteStore.saveMonth(yearMonth, entry))
    .then(() => {
      lastRemoteError = null;
      return true;
    })
    .catch(err => {
      lastRemoteError = err;
      console.warn('[Kalender] Abgleichsstand konnte nicht im Konto gespeichert werden:', err);
      return false;
    })
    .finally(() => pendingRemoteWrites.delete(p));
  pendingRemoteWrites.add(p);
  return p;
}

/** Waits until all pending account writes are done (or failed). */
export async function flushCalendarExportWrites(timeoutMs = 6000) {
  if (pendingRemoteWrites.size === 0) return true;
  try {
    await withTimeout(Promise.all([...pendingRemoteWrites]), timeoutMs);
    return true;
  } catch {
    return false;
  }
}

/**
 * Loads the month state from the account and merges it with the local cache (newer wins).
 * Returns { ok, source: 'remote'|'local'|'none', error }.
 */
export async function syncMonthFromRemote(yearMonth, timeoutMs = 6000) {
  if (!remoteStore || !yearMonth) return { ok: false, source: 'local', error: null };
  await flushCalendarExportWrites(timeoutMs);
  try {
    const remoteEntry = await withTimeout(remoteStore.loadMonth(yearMonth), timeoutMs);
    const all = readJson(EXPORT_HISTORY_STORAGE_KEY, {}) || {};
    const localEntry = all[yearMonth] ? migrateMonthHistory(all[yearMonth]) : null;

    if (remoteEntry && entryStamp(remoteEntry) >= entryStamp(localEntry)) {
      all[yearMonth] = migrateMonthHistory(remoteEntry);
      writeJson(EXPORT_HISTORY_STORAGE_KEY, all);
      lastRemoteError = null;
      return { ok: true, source: 'remote', error: null };
    }
    if (localEntry) {
      // Local state is newer (e.g. written offline or before this update) -> upload it
      const pushed = await pushMonthToRemote(yearMonth, { ...localEntry, updatedAt: entryStamp(localEntry) || Date.now() });
      return { ok: pushed, source: 'local', error: pushed ? null : lastRemoteError };
    }
    lastRemoteError = null;
    return { ok: true, source: 'none', error: null };
  } catch (err) {
    lastRemoteError = err;
    console.warn('[Kalender] Abgleichsstand konnte nicht aus dem Konto geladen werden:', err);
    return { ok: false, source: 'local', error: err };
  }
}

/** Normalizes "7:00", "07:00", "0700", "07:00:00" -> "07:00". Returns fallback if invalid. */
export function normalizeTime(timeStr, fallback = '07:00') {
  const raw = String(timeStr || '').trim();
  let h;
  let m;
  const colon = raw.match(/^(\d{1,2})[:.](\d{2})/);
  if (colon) {
    h = Number(colon[1]);
    m = Number(colon[2]);
  } else if (/^\d{3,4}$/.test(raw)) {
    const padded = raw.padStart(4, '0');
    h = Number(padded.slice(0, 2));
    m = Number(padded.slice(2));
  } else {
    return fallback;
  }
  if (!(h >= 0 && h <= 23 && m >= 0 && m <= 59)) return fallback;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// YYYY-MM-DD + HH:MM -> YYYYMMDDTHHMMSS
function formatIcsDateTime(dateStr, timeStr) {
  const cleanDate = String(dateStr).replace(/[^0-9]/g, '').slice(0, 8);
  const cleanTime = timeStr.replace(':', '') + '00';
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

// Escape special characters in iCalendar text (RFC 5545 3.3.11)
function escapeIcsText(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

// Fold content lines longer than 75 octets (RFC 5545 3.1), UTF-8 safe
const textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
function byteLength(str) {
  return textEncoder ? textEncoder.encode(str).length : unescape(encodeURIComponent(str)).length;
}
function foldLine(line) {
  if (byteLength(line) <= 75) return line;
  const parts = [];
  let current = '';
  let currentBytes = 0;
  for (const ch of line) {
    const b = byteLength(ch);
    if (currentBytes + b > 75) {
      parts.push(current);
      current = ' ' + ch;
      currentBytes = 1 + b;
    } else {
      current += ch;
      currentBytes += b;
    }
  }
  if (current) parts.push(current);
  return parts.join('\r\n');
}

function resolveCodeAndType(shift, storeSettings = {}) {
  const shiftCodeObj = (storeSettings?.shiftCodes || []).find(
    c => c.id === shift.codeId || c.code === shift.code
  );
  const code = shift.code || shiftCodeObj?.code || 'Schicht';
  const shiftTypeObj = (storeSettings?.shiftTypes || []).find(t => t.id === shift.typeId);
  const typeName = shift.shiftTypeName || shiftTypeObj?.name || 'Dienst';
  return { code, typeName };
}

function getShiftTimes(shift) {
  return {
    startTime: normalizeTime(shift.startTime, '07:00'),
    endTime: normalizeTime(shift.endTime, '19:00')
  };
}

// ---------------------------------------------------------------------------
// Stable calendar keys (independent of Firestore ids)
// ---------------------------------------------------------------------------

/**
 * Assigns a stable key per shift: `YYYY-MM-DD#1`, `YYYY-MM-DD#2` (several shifts on one day,
 * ordered by start time). Returns Map(shiftRef -> key) plus Map(id -> key).
 */
export function buildCalendarKeys(shifts = []) {
  const byDate = {};
  shifts.forEach(s => {
    if (!s || !s.date) return;
    (byDate[s.date] = byDate[s.date] || []).push(s);
  });
  const byShift = new Map();
  const byId = {};
  Object.keys(byDate).forEach(date => {
    byDate[date]
      .slice()
      .sort((a, b) => {
        const ta = normalizeTime(a.startTime, '07:00');
        const tb = normalizeTime(b.startTime, '07:00');
        if (ta !== tb) return ta < tb ? -1 : 1;
        return String(a.code || a.id || '').localeCompare(String(b.code || b.id || ''));
      })
      .forEach((s, idx) => {
        const key = `${date}#${idx + 1}`;
        byShift.set(s, key);
        if (s.id) byId[s.id] = key;
      });
  });
  return { byShift, byId };
}

function keyToUidPart(key) {
  return String(key).replace(/[^0-9A-Za-z-]/g, '-');
}

// ---------------------------------------------------------------------------
// Export history
// ---------------------------------------------------------------------------

// Converts a history entry of the old schema (items keyed by Firestore id) to stable keys
function migrateMonthHistory(entry) {
  if (!entry || entry.schema === HISTORY_SCHEMA) return entry;
  const items = Object.values(entry.items || {}).filter(it => it && it.date);
  const byDate = {};
  items.forEach(it => {
    (byDate[it.date] = byDate[it.date] || []).push(it);
  });
  const nextItems = {};
  Object.keys(byDate).forEach(date => {
    byDate[date]
      .slice()
      .sort((a, b) => String(a.dtStart || '').localeCompare(String(b.dtStart || '')))
      .forEach((it, idx) => {
        nextItems[`${date}#${idx + 1}`] = it;
      });
  });
  return { ...entry, schema: HISTORY_SCHEMA, items: nextItems };
}

/**
 * Load export history from localStorage
 * Structure: { [yearMonth]: { schema, exportedAt, resetVersion, titleFormat, alarmOption, items: { [calendarKey]: { uid, date, fingerprint, ... } } } }
 */
export function getCalendarExportHistory(yearMonth) {
  const all = readJson(EXPORT_HISTORY_STORAGE_KEY, null);
  if (!all) return null;
  if (yearMonth) return migrateMonthHistory(all[yearMonth] || null);
  return all;
}

function saveCalendarExportHistory(yearMonth, itemsMap, meta = {}) {
  const all = readJson(EXPORT_HISTORY_STORAGE_KEY, {}) || {};
  const prev = migrateMonthHistory(all[yearMonth]) || {};
  const now = Date.now();
  all[yearMonth] = {
    ...prev,
    ...meta,
    schema: HISTORY_SCHEMA,
    resetVersion: meta.resetVersion || prev.resetVersion || 1,
    exportedAt: now,
    updatedAt: Math.max(now, entryStamp(prev) + 1),
    items: itemsMap
  };
  writeJson(EXPORT_HISTORY_STORAGE_KEY, all);
  pushMonthToRemote(yearMonth, all[yearMonth]);
}

/**
 * Increments resetVersion and clears exported items for a month
 * so that after deleting events from the calendar, all shifts can be exported fresh.
 */
export function resetMonthExportHistory(yearMonth, extraMeta = {}) {
  if (!yearMonth) return 1;
  const all = readJson(EXPORT_HISTORY_STORAGE_KEY, {}) || {};
  const prev = all[yearMonth] || {};
  const nextVersion = (prev.resetVersion || 1) + 1;
  const now = Date.now();
  all[yearMonth] = {
    schema: HISTORY_SCHEMA,
    exportedAt: null,
    updatedAt: Math.max(now, entryStamp(prev) + 1),
    resetVersion: nextVersion,
    titleFormat: prev.titleFormat || null,
    alarmOption: prev.alarmOption || null,
    lastClearToken: prev.lastClearToken || null,
    lastClearAt: prev.lastClearAt || null,
    ...extraMeta,
    items: {}
  };
  writeJson(EXPORT_HISTORY_STORAGE_KEY, all);
  pushMonthToRemote(yearMonth, all[yearMonth]);
  return nextVersion;
}

/** Last used title/alarm settings (per month history first, then global preference). */
export function getLastExportOptions(yearMonth) {
  const history = yearMonth ? getCalendarExportHistory(yearMonth) : null;
  const prefs = readJson(EXPORT_PREFS_STORAGE_KEY, {}) || {};
  return {
    titleFormat: history?.titleFormat || prefs.titleFormat || DEFAULT_TITLE_FORMAT,
    alarmOption: String(history?.alarmOption || prefs.alarmOption || DEFAULT_ALARM_OPTION)
  };
}

function saveExportPrefs(titleFormat, alarmOption) {
  writeJson(EXPORT_PREFS_STORAGE_KEY, { titleFormat, alarmOption: String(alarmOption) });
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

// ---------------------------------------------------------------------------
// Change detection
// ---------------------------------------------------------------------------

export function buildShiftFingerprint(shift, storeSettings = {}, exportOptions = {}) {
  const { code, typeName } = resolveCodeAndType(shift, storeSettings);
  const { startTime, endTime } = getShiftTimes(shift);
  const titleFormat = exportOptions.titleFormat || DEFAULT_TITLE_FORMAT;
  const alarmOption = String(exportOptions.alarmOption ?? DEFAULT_ALARM_OPTION);

  return [
    shift.date || '',
    code,
    typeName,
    startTime,
    endTime,
    shift.station || '',
    shift.vehicle || '',
    shift.callSign || '',
    shift.partner || '',
    titleFormat,
    alarmOption
  ].join('|');
}

/**
 * Compares the current shifts of a month with the last export.
 * Returns { hasPreviousExport, statusById: {id: 'new'|'modified'|'unchanged'}, keyById, removedItems }
 * removedItems = exported calendar entries that no longer exist in the app (deleted/moved shifts).
 */
export function analyzeMonthExport(shifts = [], yearMonth, storeSettings = {}, exportOptions = {}) {
  const history = getCalendarExportHistory(yearMonth);
  const items = history?.items || {};
  const hasPreviousExport = Object.keys(items).length > 0;
  const { byShift, byId } = buildCalendarKeys(shifts);

  const statusById = {};
  const currentKeys = new Set();
  shifts.forEach(s => {
    const key = byShift.get(s);
    if (!key) return;
    currentKeys.add(key);
    const prev = items[key];
    let status = 'new';
    if (prev) {
      status = prev.fingerprint === buildShiftFingerprint(s, storeSettings, exportOptions)
        ? 'unchanged'
        : 'modified';
    }
    statusById[s.id ?? key] = status;
  });

  const removedItems = Object.entries(items)
    .filter(([key]) => !currentKeys.has(key))
    .map(([key, item]) => ({ key, ...item }));

  return { hasPreviousExport, statusById, keyById: byId, removedItems };
}

/** Backwards compatible single-shift status helper. */
export function getShiftExportStatus(shift, yearMonth, storeSettings = {}, exportOptions = {}, allShifts = null) {
  const list = allShifts || [shift];
  const { hasPreviousExport, statusById } = analyzeMonthExport(list, yearMonth, storeSettings, exportOptions);
  if (!hasPreviousExport) return 'new';
  return statusById[shift.id] || 'new';
}

// ---------------------------------------------------------------------------
// ICS generation
// ---------------------------------------------------------------------------

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

function buildAlarmLines(alarmOption, code, startTimeStr, endTimeStr) {
  const c = escapeIcsText(code);
  const alarm = (trigger, text) => [
    'BEGIN:VALARM',
    `TRIGGER:${trigger}`,
    'ACTION:DISPLAY',
    `DESCRIPTION:${text}`,
    'END:VALARM'
  ];
  const dayBefore = `Erinnerung: Morgen Dienst ${c} (${startTimeStr} - ${endTimeStr} Uhr)`;

  switch (String(alarmOption)) {
    case '1440':
    case 'day_before':
      return alarm('-P1D', dayBefore);
    case '1440_60':
      return [
        ...alarm('-P1D', dayBefore),
        ...alarm('-PT1H', `Erinnerung: In 1 Std. Dienst ${c} (${startTimeStr} - ${endTimeStr} Uhr)`)
      ];
    case '2880':
      return alarm('-P2D', `Erinnerung: In 2 Tagen Dienst ${c}`);
    case '720':
      return alarm('-PT12H', `Erinnerung: In 12 Std. Dienst ${c}`);
    case '120':
      return alarm('-PT2H', `Erinnerung: In 2 Std. Dienst ${c}`);
    case '60':
      return alarm('-PT1H', `Erinnerung: In 1 Std. Dienst ${c}`);
    case '30':
      return alarm('-PT30M', `Erinnerung: In 30 Min. Dienst ${c}`);
    default: {
      const n = Number(alarmOption);
      return n > 0 ? alarm(`-PT${n}M`, `Erinnerung an Dienst ${c}`) : [];
    }
  }
}

/**
 * Generates an .ics file string from a list of shifts
 * @param {Array} shifts - shifts to export (selection)
 * @param {Object} options - { calendarName, alarmOption, titleFormat, overwriteMode, yearMonth, storeSettings,
 *                             allShifts (all shifts of the month – needed for stable keys) }
 */
export function generateIcsCalendar(shifts, options = {}) {
  const {
    calendarName = 'Dienstplan',
    alarmMinutes,
    titleFormat = DEFAULT_TITLE_FORMAT, // 'codeAndType', 'codeOnly', 'typeAndTimes'
    overwriteMode = 'update',           // 'update' (stable UID) | 'forceNew' (fresh revision UID)
    yearMonth = '',
    storeSettings = {},
    allShifts = null
  } = options;
  const alarmOption = String(options.alarmOption ?? alarmMinutes ?? DEFAULT_ALARM_OPTION);

  const nowIso = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const revision = Date.now().toString(36);

  const prevHistory = yearMonth ? getCalendarExportHistory(yearMonth) : null;
  const prevItems = prevHistory?.items || {};
  const resetVersion = prevHistory?.resetVersion || 1;
  const nextHistoryItems = { ...prevItems };

  // Keys are computed over the whole month so that the index of a day stays stable
  const { byShift, byId } = buildCalendarKeys(allShifts && allShifts.length ? allShifts : shifts);
  const fallbackKeys = buildCalendarKeys(shifts).byShift;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Schichttagebuch//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    ...getTimezoneLines()
  ];

  shifts.forEach(shift => {
    if (!shift || !shift.date) return;
    const key = byShift.get(shift) || (shift.id && byId[shift.id]) || fallbackKeys.get(shift) || `${shift.date}#1`;
    const { code, typeName } = resolveCodeAndType(shift, storeSettings);
    const { startTime: startTimeStr, endTime: endTimeStr } = getShiftTimes(shift);

    let summary = `${code} (${typeName})`;
    if (titleFormat === 'codeOnly') {
      summary = code;
    } else if (titleFormat === 'typeAndTimes') {
      summary = `${typeName} (${startTimeStr} - ${endTimeStr})`;
    }

    // End on the next day if the shift crosses midnight; equal start/end = 24h shift
    const isOvernight = endTimeStr <= startTimeStr;
    const startDateStr = shift.date;
    const endDateStr = isOvernight ? addDaysToDateStr(startDateStr, 1) : startDateStr;
    const dtStart = formatIcsDateTime(startDateStr, startTimeStr);
    const dtEnd = formatIcsDateTime(endDateStr, endTimeStr);

    // Description starts with "Dienst:" so the iOS Shortcut can always identify Schichttagebuch entries
    const descParts = [
      `Dienst: ${code} - ${typeName}`,
      `Zeiten: ${startTimeStr} bis ${endTimeStr} Uhr`,
      shift.station ? `Wache: ${shift.station}` : null,
      shift.vehicle ? `Fahrzeug: ${shift.vehicle}` : null,
      shift.callSign ? `Funkrufname: ${shift.callSign}` : null,
      shift.partner ? `PartnerIn: ${shift.partner}` : null
    ].filter(Boolean);

    const fingerprint = buildShiftFingerprint(shift, storeSettings, { titleFormat, alarmOption });
    const contentHash = hashString(fingerprint);
    const uidBase = `st-${keyToUidPart(key)}`;
    const uid = overwriteMode === 'forceNew'
      ? `${uidBase}-r${revision}@schichttagebuch`
      : `${uidBase}-v${resetVersion}@schichttagebuch`;

    nextHistoryItems[key] = {
      uid,
      id: shift.id || null,
      date: shift.date,
      summary,
      dtStart,
      dtEnd,
      location: shift.station || '',
      fingerprint,
      contentHash,
      exportedAt: Date.now()
    };

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push('SEQUENCE:0');
    lines.push(`DTSTAMP:${nowIso}`);
    lines.push(`LAST-MODIFIED:${nowIso}`);
    lines.push(`DTSTART;TZID=Europe/Berlin:${dtStart}`);
    lines.push(`DTEND;TZID=Europe/Berlin:${dtEnd}`);
    lines.push(`SUMMARY:${escapeIcsText(summary)}`);
    if (shift.station) lines.push(`LOCATION:${escapeIcsText(shift.station)}`);
    lines.push(`DESCRIPTION:${escapeIcsText(descParts.join('\n'))}`);
    lines.push('STATUS:CONFIRMED');
    lines.push('TRANSP:OPAQUE');
    lines.push(...buildAlarmLines(alarmOption, code, startTimeStr, endTimeStr));
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');

  if (yearMonth) {
    saveCalendarExportHistory(yearMonth, nextHistoryItems, {
      resetVersion,
      titleFormat,
      alarmOption
    });
  }
  saveExportPrefs(titleFormat, alarmOption);

  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/**
 * Triggers download of the .ics file on iOS / desktop browsers
 */
export function downloadIcsFile(shifts, options = {}) {
  const {
    calendarName = 'Dienstplan',
    yearMonth = '',
    overwriteMode = 'update'
  } = options;

  const icsString = generateIcsCalendar(shifts, options);
  const suffix = overwriteMode === 'forceNew' ? '_Neu' : '';
  const fileName = `Dienstplan_${yearMonth || 'Export'}_${calendarName}${suffix}.ics`;
  downloadIcsString(icsString, fileName);
  return { icsString, fileName };
}

/** Opens/downloads an already generated .ics again (does not touch the export history). */
export function downloadIcsString(icsString, fileName = 'Dienstplan.ics') {
  const blob = new Blob([icsString], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
}

// ---------------------------------------------------------------------------
// iOS Shortcut bridge (delete old entries of a month)
// ---------------------------------------------------------------------------

function buildReturnUrl(yearMonth, extraParams) {
  try {
    const urlObj = new URL(window.location.href);
    ['cleared', 'clearFailed', 'autoExport', 'fmt', 'alarm'].forEach(p => urlObj.searchParams.delete(p));
    urlObj.searchParams.set('month', yearMonth);
    urlObj.searchParams.set('openCalendarExport', '1');
    Object.entries(extraParams).forEach(([k, v]) => urlObj.searchParams.set(k, v));
    return urlObj.toString();
  } catch {
    return window.location.href;
  }
}

/**
 * Triggers the native iOS Shortcut ("Schichttagebuch-Kalender") to delete all
 * exported Schichttagebuch shifts ("Dienst:") of the given month from the iPhone Calendar.
 * The export history is NOT reset here – only after the Shortcut reports success
 * (see confirmCalendarClear), so a failed/cancelled Shortcut can never cause duplicates.
 */
export function runIosCalendarDeleteShortcut(yearMonth, autoExport = null) {
  if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) return false;
  const [y, m] = yearMonth.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const startStr = `${yearMonth}-01T00:00:00`;
  const endStr = `${yearMonth}-${String(lastDay).padStart(2, '0')}T23:59:59`;

  // One-time token: <timestamp base36>-<random>. Validated against the account state on return,
  // so it also works when the Shortcut returns to Safari instead of the Home-Screen web app.
  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const inputPayload = `${startStr}\n${endStr}`;
  // autoExport: after a successful clean the app creates the new .ics right away (one single process)
  const successUrl = buildReturnUrl(yearMonth, autoExport
    ? {
        cleared: token,
        autoExport: '1',
        fmt: autoExport.titleFormat || DEFAULT_TITLE_FORMAT,
        alarm: String(autoExport.alarmOption ?? DEFAULT_ALARM_OPTION)
      }
    : { cleared: token });
  const failUrl = buildReturnUrl(yearMonth, { clearFailed: '1' });

  const shortcutUrl =
    `shortcuts://x-callback-url/run-shortcut?name=${encodeURIComponent('Schichttagebuch-Kalender')}` +
    `&input=text&text=${encodeURIComponent(inputPayload)}` +
    `&x-success=${encodeURIComponent(successUrl)}` +
    `&x-cancel=${encodeURIComponent(failUrl)}` +
    `&x-error=${encodeURIComponent(failUrl)}`;

  window.location.href = shortcutUrl;
  return true;
}

function parseClearTokenTime(token) {
  const ts = parseInt(String(token).split('-')[0], 36);
  return Number.isFinite(ts) ? ts : 0;
}

/**
 * Called after returning from the Shortcut via x-success (?cleared=<token>&month=YYYY-MM).
 * isAwaitingExportAfterClear() tells whether nothing was exported since that clean.
 * Call syncMonthFromRemote(yearMonth) before, so the account state is known.
 * Returns 'confirmed' (history reset now), 'already' (token was already used – page reload)
 * or null (invalid/expired token -> nothing is reset).
 */
export function confirmCalendarClear(token, yearMonth) {
  if (!token || token === true || !yearMonth) return null;
  const tokenStr = String(token);
  const entry = getCalendarExportHistory(yearMonth) || {};
  if (entry.lastClearToken === tokenStr) return 'already';

  const ts = parseClearTokenTime(tokenStr);
  const age = Date.now() - ts;
  if (!ts || age < -5 * 60 * 1000 || age > CLEAR_TOKEN_MAX_AGE_MS) return null;
  if (entry.lastClearAt && ts <= Number(entry.lastClearAt)) return null;

  resetMonthExportHistory(yearMonth, { lastClearToken: tokenStr, lastClearAt: ts });
  return 'confirmed';
}

/** True if the month was cleaned with this token and nothing has been exported since. */
export function isAwaitingExportAfterClear(token, yearMonth) {
  if (!token || !yearMonth) return false;
  const entry = getCalendarExportHistory(yearMonth);
  return Boolean(
    entry &&
    entry.lastClearToken === String(token) &&
    !entry.exportedAt &&
    Object.keys(entry.items || {}).length === 0
  );
}

/**
 * Downloads the pre-signed Apple Shortcut ("Schichttagebuch-Kalender.shortcut")
 * for 1-time installation in the iOS Shortcuts app.
 */
export function downloadIosDeleteShortcutFile() {
  markIosShortcutInstalled();
  const link = document.createElement('a');
  link.href = `${import.meta.env?.BASE_URL || '/'}Schichttagebuch-Kalender.shortcut`;
  link.setAttribute('download', 'Schichttagebuch-Kalender.shortcut');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  return true;
}
