/**
 * Direct sync of the personal shifts into a Google Calendar (e.g. "Familie").
 *
 * The app talks to a small Google Apps Script web app that runs in the user's own Google
 * account (no server, no OAuth popups in the app). The script creates, updates and deletes
 * the shift events of a month so that the calendar exactly matches the app – the iPhone
 * receives the changes through the normal Google account sync. No Shortcut, no Safari,
 * no .ics import.
 *
 * Config (shared by all devices): users/{uid}/data/calendarSync
 *   { scriptUrl, secret, calendarId, calendarName, updatedAt }
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { buildCalendarEvents } from './calendarExport';

const CONFIG_CACHE_KEY = 'schichttagebuch_calendar_sync_config_v1';
export const APPS_SCRIPT_VERSION = 2;

function configRef(uid) {
  return doc(db, `users/${uid}/data`, 'calendarSync');
}

function readCache() {
  try {
    const raw = localStorage.getItem(CONFIG_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(cfg) {
  try {
    localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(cfg || null));
  } catch {
    // ignore
  }
}

export function getCachedSyncConfig() {
  return readCache();
}

export async function loadSyncConfig(uid) {
  if (!uid) return readCache();
  try {
    const snap = await getDoc(configRef(uid));
    const remote = snap.exists() ? snap.data() : null;
    const cached = readCache();
    // Never lose a locally created key: if the account has nothing (yet) or an older state,
    // keep the local one and upload it
    if (cached && (!remote || Number(cached.updatedAt || 0) > Number(remote.updatedAt || 0))) {
      setDoc(configRef(uid), cached).catch(() => {});
      return cached;
    }
    writeCache(remote);
    return remote;
  } catch (err) {
    console.warn('[Kalender-Sync] Einstellungen konnten nicht geladen werden:', err);
    return readCache();
  }
}

export async function saveSyncConfig(uid, patch) {
  const current = readCache() || {};
  const next = JSON.parse(JSON.stringify({ ...current, ...patch, updatedAt: Date.now() }));
  writeCache(next);
  if (uid) await setDoc(configRef(uid), next);
  return next;
}

export function isSyncConfigured(cfg) {
  return Boolean(cfg && isValidScriptUrl(cfg.scriptUrl) && cfg.secret && cfg.calendarId);
}

export function generateSecret() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function isValidScriptUrl(url) {
  return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec\/?$/.test(String(url || '').trim());
}

/** POST to the Apps Script web app (text/plain = no CORS preflight). */
export async function callSyncScript(scriptUrl, payload, timeoutMs = 60000) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(String(scriptUrl).trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
      signal: controller?.signal
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(
        text.includes('<html') || text.includes('<!DOCTYPE')
          ? 'Die Web-App antwortet nicht mit Daten. Ist sie mit „Zugriff: Jeder“ bereitgestellt?'
          : 'Unerwartete Antwort der Web-App.'
      );
    }
    if (!data || data.ok !== true) throw new Error(data?.error || 'Unbekannter Fehler der Web-App.');
    return data;
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('Zeitüberschreitung – Google hat nicht rechtzeitig geantwortet.');
    if (err instanceof TypeError) {
      throw new Error('Keine Verbindung zur Web-App. Prüfe: Zugriff „Jeder“, Zugriff autorisiert und neue Version bereitgestellt (oder offline).');
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function testSyncConnection(scriptUrl, secret) {
  const data = await callSyncScript(scriptUrl, { action: 'ping', secret }, 30000);
  return data.calendars || [];
}

/**
 * Makes the Google Calendar match the shifts of the month exactly.
 * Returns { created, updated, deleted, unchanged, legacyRemoved }.
 */
export async function syncMonthToGoogle({ config, yearMonth, shifts, storeSettings, titleFormat, alarmOption }) {
  if (!isSyncConfigured(config)) throw new Error('Google-Kalender-Sync ist nicht eingerichtet.');
  if (!/^\d{4}-\d{2}$/.test(yearMonth || '')) throw new Error('Ungültiger Monat.');
  const monthShifts = (shifts || []).filter(s => s?.date && s.date.startsWith(yearMonth));
  const events = buildCalendarEvents(monthShifts, { titleFormat, alarmOption, storeSettings });
  return callSyncScript(config.scriptUrl, {
    action: 'syncMonth',
    secret: config.secret,
    calendarId: config.calendarId,
    yearMonth,
    events
  });
}

/**
 * Google Apps Script code (Code.gs). It contains NO key: on the first "ping" the script
 * stores the app's key in its script properties (pairing) and accepts only that key afterwards.
 */
// eslint-disable-next-line no-unused-vars
export function getAppsScriptCode(_unused) {
  return `/**
 * Schichttagebuch – Google-Kalender-Sync (Version ${APPS_SCRIPT_VERSION})
 * Bereitstellen als Web-App:  Ausführen als „Ich“,  Zugriff „Jeder“.
 * Beim ersten „Verbindung testen“ koppelt sich das Skript mit deiner App (Schlüssel wird
 * in den Skripteigenschaften als APP_SECRET gespeichert). Neu koppeln: APP_SECRET löschen.
 */
const TZ = 'Europe/Berlin';
const KEY_TAG = 'stb_key';
const FP_TAG = 'stb_fp';

function doGet() {
  return out_({ ok: true, app: 'Schichttagebuch-Kalender-Sync', version: ${APPS_SCRIPT_VERSION} });
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return out_({ ok: false, error: 'Ungültige Anfrage' });
  }
  if (!req || !req.secret || String(req.secret).length < 24) return out_({ ok: false, error: 'Ungültiger App-Schlüssel' });

  var props = PropertiesService.getScriptProperties();
  var stored = props.getProperty('APP_SECRET');
  if (!stored && req.action === 'ping') {
    props.setProperty('APP_SECRET', String(req.secret)); // first contact: pair with this app
    stored = String(req.secret);
  }
  if (req.secret !== stored) {
    return out_({ ok: false, error: 'Dieses Skript ist mit einem anderen App-Schlüssel gekoppelt. Im Skript-Editor: Projekteinstellungen → Skripteigenschaften → APP_SECRET löschen, dann erneut „Verbindung testen“.' });
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return out_({ ok: false, error: 'Es läuft bereits ein Abgleich – bitte gleich noch einmal' });
  try {
    if (req.action === 'ping') return out_({ ok: true, version: ${APPS_SCRIPT_VERSION}, calendars: listCalendars_() });
    if (req.action === 'syncMonth') return out_(syncMonth_(req));
    return out_({ ok: false, error: 'Unbekannte Aktion' });
  } catch (err) {
    return out_({ ok: false, error: String((err && err.message) || err) });
  } finally {
    lock.releaseLock();
  }
}

function listCalendars_() {
  return CalendarApp.getAllCalendars().map(function (c) {
    return { id: c.getId(), name: c.getName() };
  });
}

function parse_(s) {
  return Utilities.parseDate(s, TZ, 'yyyy-MM-dd HH:mm');
}

function syncMonth_(req) {
  var cal = CalendarApp.getCalendarById(req.calendarId);
  if (!cal) throw new Error('Kalender nicht gefunden');
  if (!/^\\d{4}-\\d{2}$/.test(req.yearMonth)) throw new Error('Ungültiger Monat');

  var parts = req.yearMonth.split('-');
  var y = Number(parts[0]);
  var m = Number(parts[1]);
  var next = m === 12 ? (y + 1) + '-01' : y + '-' + ('0' + (m + 1)).slice(-2);
  var monthStart = parse_(req.yearMonth + '-01 00:00');
  var monthEnd = parse_(next + '-01 00:00');

  // Only events that START in this month (a night shift of the previous month stays untouched)
  var existing = cal.getEvents(monthStart, monthEnd).filter(function (ev) {
    var st = ev.getStartTime().getTime();
    return st >= monthStart.getTime() && st < monthEnd.getTime();
  });

  var byKey = {};
  var toDelete = [];
  var legacy = 0;
  existing.forEach(function (ev) {
    var key = ev.getTag(KEY_TAG);
    if (key) {
      if (byKey[key]) toDelete.push(ev); // duplicate
      else byKey[key] = ev;
    } else if (String(ev.getDescription() || '').indexOf('Dienst:') === 0) {
      toDelete.push(ev); // imported earlier via .ics – replaced by managed events
      legacy++;
    }
  });

  var result = { ok: true, created: 0, updated: 0, deleted: 0, unchanged: 0, legacyRemoved: legacy };
  var wanted = {};

  (req.events || []).forEach(function (d) {
    wanted[d.key] = true;
    var ev = byKey[d.key];
    if (ev && ev.getTag(FP_TAG) === d.fp) {
      result.unchanged++;
      return;
    }
    var start = parse_(d.start);
    var end = parse_(d.end);
    if (ev) {
      ev.setTitle(d.title);
      ev.setTime(start, end);
      ev.setLocation(d.location || '');
      ev.setDescription(d.description || '');
      result.updated++;
    } else {
      ev = cal.createEvent(d.title, start, end, { location: d.location || '', description: d.description || '' });
      ev.setTag(KEY_TAG, d.key);
      result.created++;
    }
    ev.removeAllReminders();
    (d.reminders || []).forEach(function (min) {
      ev.addPopupReminder(Number(min));
    });
    ev.setTag(FP_TAG, d.fp);
  });

  Object.keys(byKey).forEach(function (key) {
    if (!wanted[key]) toDelete.push(byKey[key]);
  });
  toDelete.forEach(function (ev) {
    ev.deleteEvent();
    result.deleted++;
  });
  result.deleted -= legacy;
  return result;
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
`;
}
