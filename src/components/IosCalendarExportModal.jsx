import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Calendar, Check, Download, X,
  Smartphone, CheckCircle2, Trash2,
  Users, MapPin, Truck, HelpCircle, ChevronDown, Sparkles, AlertTriangle
} from 'lucide-react';
import {
  downloadIcsFile,
  downloadIcsString,
  isAwaitingExportAfterClear,
  runIosCalendarDeleteShortcut,
  downloadIosDeleteShortcutFile,
  analyzeMonthExport,
  getCalendarExportHistory,
  getLastExportOptions,
  confirmCalendarClear,
  setCalendarExportRemote,
  syncMonthFromRemote
} from '../utils/calendarExport';
import { createFirestoreCalendarRemote } from '../utils/calendarExportRemote';
import { getShiftColor } from '../utils/shiftColors';
import { useAuth } from '../context/AuthContext';

// Wrapper: hooks of the dialog only run while it is open (no hooks after an early return)
export default function IosCalendarExportModal(props) {
  if (!props.isOpen) return null;
  return <IosCalendarExportDialog key={props.yearMonth} {...props} />;
}

function readUrlParam(name) {
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
}

function IosCalendarExportDialog({
  onClose,
  shifts = [],
  currentMonthLabel = '',
  yearMonth = '',
  storeSettings = {},
  initialCleared = false,
  shiftsReady = true
}) {
  const { currentUser } = useAuth() || {};
  const uid = currentUser?.uid || null;

  const [titleFormat, setTitleFormat] = useState(() => getLastExportOptions(yearMonth).titleFormat); // 'codeAndType', 'codeOnly', 'typeAndTimes'
  const [alarmOption, setAlarmOption] = useState(() => getLastExportOptions(yearMonth).alarmOption);
  const [overwriteMode, setOverwriteMode] = useState('update'); // 'update' | 'forceNew'
  const [selectedIds, setSelectedIds] = useState(() => new Set(shifts.map(s => s.id)));
  const [downloadSuccess, setDownloadSuccess] = useState(() => (readUrlParam('clearFailed') === '1' ? 'clearFailed' : null)); // null | 'export' | 'deleteShortcut' | 'installShortcut' | 'clearFailed'
  const [exportVersionTick, setExportVersionTick] = useState(0);
  const [isTipPopupOpen, setIsTipPopupOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState('loading'); // 'loading' | 'ready' | 'localOnly'
  // One single process: after the Shortcut cleaned the month, the new .ics is created automatically
  const [autoExport, setAutoExport] = useState(null); // null | { titleFormat, alarmOption, startedAt }
  const lastIcsRef = useRef(null); // { icsString, fileName } – to open the file again if iOS did not show it

  // Load the export state of this month from the account (shared by Safari, Home-Screen app and Mac),
  // then handle the return from the iOS Shortcut (?cleared=<token>)
  useEffect(() => {
    let alive = true;
    (async () => {
      setCalendarExportRemote(uid ? createFirestoreCalendarRemote(uid) : null);
      const res = await syncMonthFromRemote(yearMonth);

      const token = typeof initialCleared === 'string' ? initialCleared : readUrlParam('cleared');
      if (token) {
        const clearedMonth = readUrlParam('month') || yearMonth;
        if (clearedMonth !== yearMonth) await syncMonthFromRemote(clearedMonth);
        const result = confirmCalendarClear(token, clearedMonth);
        if (alive && result && clearedMonth === yearMonth) {
          if (readUrlParam('autoExport') === '1' && isAwaitingExportAfterClear(token, yearMonth)) {
            const last = getLastExportOptions(yearMonth);
            const fmt = readUrlParam('fmt') || last.titleFormat;
            const alarm = readUrlParam('alarm') || last.alarmOption;
            setTitleFormat(fmt);
            setAlarmOption(alarm);
            setAutoExport({ titleFormat: fmt, alarmOption: alarm, startedAt: Date.now() });
            setDownloadSuccess('autoExporting');
            setSyncStatus(uid && res.ok ? 'ready' : 'localOnly');
            setExportVersionTick(t => t + 1);
            return;
          }
          setDownloadSuccess('deleteShortcut');
        }
      }

      if (!alive) return;
      const opts = getLastExportOptions(yearMonth);
      setTitleFormat(opts.titleFormat);
      setAlarmOption(opts.alarmOption);
      setSyncStatus(uid && res.ok ? 'ready' : 'localOnly');
      setExportVersionTick(t => t + 1);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportHistory = useMemo(() => {
    return getCalendarExportHistory(yearMonth);
  }, [yearMonth, exportVersionTick]);

  const analysis = useMemo(() => {
    return analyzeMonthExport(shifts, yearMonth, storeSettings, { titleFormat, alarmOption });
  }, [shifts, yearMonth, storeSettings, titleFormat, alarmOption, exportVersionTick, exportHistory]);

  const hasPreviousExport = analysis.hasPreviousExport;
  const shiftStatuses = analysis.statusById;
  const removedItems = analysis.removedItems;

  const newOnlyIds = useMemo(() => {
    if (!hasPreviousExport) return [];
    return shifts.filter(s => shiftStatuses[s.id] === 'new').map(s => s.id);
  }, [shifts, shiftStatuses, hasPreviousExport]);

  const modifiedIds = useMemo(() => {
    if (!hasPreviousExport) return [];
    return shifts.filter(s => shiftStatuses[s.id] === 'modified').map(s => s.id);
  }, [shifts, shiftStatuses, hasPreviousExport]);

  const changedOrNewIds = useMemo(() => {
    if (!hasPreviousExport) return [];
    return shifts
      .filter(s => shiftStatuses[s.id] === 'modified' || shiftStatuses[s.id] === 'new')
      .map(s => s.id);
  }, [shifts, shiftStatuses, hasPreviousExport]);

  // Old calendar entries must be removed first if a shift was changed, deleted or moved
  const monthNeedsClean = hasPreviousExport && (modifiedIds.length > 0 || removedItems.length > 0);
  const calendarUpToDate = hasPreviousExport && !monthNeedsClean && newOnlyIds.length === 0;

  // Stable signature so a re-render of the parent (new array reference, Firestore snapshot)
  // does not reset the user's manual selection
  const selectionSignature = useMemo(() => {
    return [
      overwriteMode,
      hasPreviousExport ? '1' : '0',
      removedItems.length,
      shifts.map(s => `${s.id}:${shiftStatuses[s.id] || ''}`).join(',')
    ].join('|');
  }, [overwriteMode, hasPreviousExport, removedItems.length, shifts, shiftStatuses]);

  // Default selection:
  // - forceNew / first export: all shifts
  // - update + changed/removed shifts: all shifts (month is cleaned first, then re-exported completely)
  // - update + only new shifts: only the new ones
  // - update + nothing changed: nothing (calendar is up to date)
  useEffect(() => {
    if (overwriteMode === 'update' && hasPreviousExport) {
      if (monthNeedsClean) {
        setSelectedIds(new Set(shifts.map(s => s.id)));
      } else {
        setSelectedIds(new Set(newOnlyIds));
      }
    } else {
      setSelectedIds(new Set(shifts.map(s => s.id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionSignature]);

  const selectedShifts = useMemo(() => {
    return shifts.filter(s => selectedIds.has(s.id));
  }, [shifts, selectedIds]);

  // In 'update' mode iOS cannot overwrite or delete events from an .ics file.
  // If a selected shift is already in the calendar, or an exported shift no longer exists,
  // the month must be cleaned via the iOS Shortcut first – otherwise duplicates/leftovers remain.
  const needsShortcutCleanBeforeExport = useMemo(() => {
    if (overwriteMode !== 'update' || !hasPreviousExport) return false;
    if (removedItems.length > 0) return true;
    return selectedShifts.some(s => shiftStatuses[s.id] !== 'new');
  }, [overwriteMode, hasPreviousExport, removedItems.length, selectedShifts, shiftStatuses]);

  const toggleSelectAll = () => {
    if (selectedIds.size === shifts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(shifts.map(s => s.id)));
    }
  };

  const selectOnlyChanged = () => {
    if (changedOrNewIds.length > 0) {
      setSelectedIds(new Set(changedOrNewIds));
    }
  };

  const toggleShift = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isSyncing = syncStatus === 'loading';
  const isAutoExporting = Boolean(autoExport);

  // Step 2 of the single process: as soon as the shifts are freshly loaded from the server,
  // export ALL shifts of the month (the calendar month was just cleaned by the Shortcut)
  useEffect(() => {
    if (!autoExport || isSyncing) return undefined;
    const waited = Date.now() - autoExport.startedAt;
    if (!shiftsReady || shifts.length === 0) {
      // Fallback after 15 s (e.g. offline): show the manual step 2 instead
      const t = setTimeout(() => {
        setAutoExport(null);
        setDownloadSuccess('deleteShortcut');
      }, Math.max(0, 15000 - waited));
      return () => clearTimeout(t);
    }
    // short settle time so partner/roster enrichment of the freshly loaded shifts is included
    const t = setTimeout(() => {
      lastIcsRef.current = downloadIcsFile(shifts, {
        calendarName: 'Dienstplan',
        titleFormat: autoExport.titleFormat,
        alarmOption: autoExport.alarmOption,
        overwriteMode: 'update',
        yearMonth,
        storeSettings,
        allShifts: shifts
      });
      setAutoExport(null);
      setExportVersionTick(v => v + 1);
      setDownloadSuccess('autoExported');
    }, 700);
    return () => clearTimeout(t);
  }, [autoExport, isSyncing, shiftsReady, shifts, yearMonth, storeSettings]);

  const handleExport = () => {
    if (selectedShifts.length === 0 || isSyncing || isAutoExporting) return;

    // Changes/removals: the Shortcut deletes the old entries of this month, returns to the app
    // and the app then creates the new .ics automatically – one single process (0 duplicates)
    if (needsShortcutCleanBeforeExport) {
      runIosCalendarDeleteShortcut(yearMonth, { titleFormat, alarmOption });
      return;
    }

    lastIcsRef.current = downloadIcsFile(selectedShifts, {
      calendarName: 'Dienstplan',
      titleFormat,
      alarmOption,
      overwriteMode,
      yearMonth,
      storeSettings,
      allShifts: shifts
    });

    setExportVersionTick(t => t + 1);
    setDownloadSuccess('export');
    setTimeout(() => setDownloadSuccess(null), 9000);
  };

  // Manual tool: only delete the month's entries (no automatic re-export)
  const handleRunDeleteShortcut = () => {
    // History is reset only after the Shortcut reports success (x-success -> ?cleared=<token>)
    runIosCalendarDeleteShortcut(yearMonth);
  };

  const handleOpenLastIcsAgain = () => {
    if (lastIcsRef.current) downloadIcsString(lastIcsRef.current.icsString, lastIcsRef.current.fileName);
  };

  const handleInstallShortcut = () => {
    downloadIosDeleteShortcutFile();
    setDownloadSuccess('installShortcut');
    setTimeout(() => setDownloadSuccess(null), 14000);
  };

  const sortedShifts = useMemo(() => {
    return shifts.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [shifts]);

  const labelStyle = {
    display: 'block',
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--c-text-muted)',
    marginBottom: '6px'
  };

  const controlHeight = '38px';

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        alignItems: 'center',
        padding: '16px',
        backdropFilter: 'blur(10px)',
        backgroundColor: 'rgb(var(--rgb-deep) / 0.78)'
      }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '680px',
          width: '100%',
          maxHeight: '92vh',
          borderRadius: '24px',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(180deg, var(--c-surface-2) 0%, var(--c-bg) 100%)',
          border: '1px solid rgb(var(--rgb-muted) / 0.16)',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.75)',
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        {/* Top Header with Integrated Shift Count Badge */}
        <div style={{
          padding: '16px 22px',
          borderBottom: '1px solid rgb(var(--rgb-muted) / 0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          background: 'rgb(var(--rgb-bg) / 0.5)',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              background: 'linear-gradient(135deg, rgb(var(--rgb-warning) / 0.22) 0%, rgb(var(--rgb-warning) / 0.08) 100%)',
              border: '1px solid rgb(var(--rgb-warning) / 0.35)',
              color: 'var(--c-warning)',
              borderRadius: '12px',
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgb(var(--rgb-warning) / 0.15)',
              flexShrink: 0
            }}>
              <Calendar size={20} />
            </div>
            <div>
              <h2 style={{
                margin: 0,
                fontSize: '18px',
                fontWeight: 700,
                color: 'var(--c-text)',
                letterSpacing: '-0.01em',
                textTransform: 'none'
              }}>
                In iOS Kalender übertragen
              </h2>
              <div style={{ fontSize: '12.5px', color: 'var(--c-text-muted)', marginTop: '1px' }}>
                Dienstplan für <span style={{ color: 'var(--c-text)', fontWeight: 600 }}>{currentMonthLabel}</span> exportieren
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Shift Count Pill */}
            <div style={{
              background: 'rgb(var(--rgb-warning) / 0.14)',
              border: '1px solid rgb(var(--rgb-warning) / 0.35)',
              color: 'var(--c-warning)',
              height: '34px',
              padding: '0 12px',
              borderRadius: '10px',
              display: 'inline-flex',
              alignItems: 'center',
              fontSize: '12.5px',
              fontWeight: 700,
              whiteSpace: 'nowrap'
            }}>
              {selectedShifts.length} {selectedShifts.length === 1 ? 'Dienst' : 'Dienste'}
            </div>

            <button
              type="button"
              onClick={() => setIsTipPopupOpen(true)}
              style={{
                background: 'rgb(var(--rgb-muted) / 0.1)',
                border: '1px solid rgb(var(--rgb-muted) / 0.2)',
                color: 'var(--c-text-soft)',
                height: '34px',
                padding: '0 11px',
                borderRadius: '10px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="Hilfe & Tipp zum Überschreiben und Löschen im Apple Kalender anzeigen"
            >
              <HelpCircle size={15} style={{ color: 'var(--c-warning)' }} />
              <span>Tipp</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'rgb(var(--rgb-muted) / 0.1)',
                border: '1px solid rgb(var(--rgb-muted) / 0.15)',
                color: 'var(--c-text-muted)',
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="Schließen"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Main Body */}
        <div style={{
          padding: '18px 22px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          flex: 1,
          minHeight: 0
        }}>
          {/* Feedback Banners */}
          {downloadSuccess === 'export' && (
            <div style={{
              background: 'rgb(var(--rgb-success) / 0.14)',
              border: '1px solid rgb(var(--rgb-success) / 0.4)',
              color: 'var(--c-success)',
              padding: '10px 14px',
              borderRadius: '12px',
              fontSize: '12.5px',
              lineHeight: 1.4,
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flexShrink: 0
            }}>
              <CheckCircle2 size={17} style={{ flexShrink: 0 }} />
              <div>
                <strong>Kalenderdatei (.ics) erstellt!</strong> Tippe auf „Alle hinzufügen“ und wähle deinen Ziel-Kalender. Die App merkt sich, was übertragen wurde – beim nächsten Mal werden nur Änderungen abgeglichen.
              </div>
            </div>
          )}

          {downloadSuccess === 'autoExporting' && (
            <div style={{
              background: 'rgb(var(--rgb-success) / 0.14)',
              border: '1px solid rgb(var(--rgb-success) / 0.4)',
              color: 'var(--c-success)',
              padding: '10px 14px',
              borderRadius: '12px',
              fontSize: '12.5px',
              lineHeight: 1.4,
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flexShrink: 0
            }}>
              <CheckCircle2 size={17} style={{ flexShrink: 0 }} />
              <div>
                <strong>Alte Termine für {currentMonthLabel} gelöscht.</strong> Die aktuellen Dienste werden geladen und gleich automatisch übertragen …
              </div>
            </div>
          )}

          {downloadSuccess === 'autoExported' && (
            <div style={{
              background: 'rgb(var(--rgb-success) / 0.14)',
              border: '1px solid rgb(var(--rgb-success) / 0.4)',
              color: 'var(--c-success)',
              padding: '10px 14px',
              borderRadius: '12px',
              fontSize: '12.5px',
              lineHeight: 1.4,
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flexShrink: 0
            }}>
              <CheckCircle2 size={17} style={{ flexShrink: 0 }} />
              <div>
                <strong>Kalender aktualisiert!</strong> Alte Termine wurden gelöscht, die aktuellen Dienste sind in der Kalenderdatei. Tippe auf „Alle hinzufügen“ und wähle deinen Kalender.{' '}
                <button
                  type="button"
                  onClick={handleOpenLastIcsAgain}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    color: 'inherit',
                    fontWeight: 700,
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    fontSize: 'inherit'
                  }}
                >
                  Datei nicht erschienen? Hier öffnen
                </button>
              </div>
            </div>
          )}

          {downloadSuccess === 'deleteShortcut' && (
            <div style={{
              background: 'rgb(var(--rgb-success) / 0.14)',
              border: '1px solid rgb(var(--rgb-success) / 0.4)',
              color: 'var(--c-success)',
              padding: '10px 14px',
              borderRadius: '12px',
              fontSize: '12.5px',
              lineHeight: 1.4,
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flexShrink: 0
            }}>
              <CheckCircle2 size={17} style={{ flexShrink: 0 }} />
              <div>
                <strong>Schritt 1 erledigt: Alte Termine für {currentMonthLabel} im Kalender gelöscht!</strong> Tippe jetzt unten auf den gelben Button (Schritt 2), um die aktuellen Dienste frisch und ohne Duplikate einzutragen.
              </div>
            </div>
          )}

          {downloadSuccess === 'clearFailed' && (
            <div style={{
              background: 'rgb(var(--rgb-danger) / 0.12)',
              border: '1px solid rgb(var(--rgb-danger) / 0.4)',
              color: 'var(--c-danger)',
              padding: '10px 14px',
              borderRadius: '12px',
              fontSize: '12.5px',
              lineHeight: 1.4,
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flexShrink: 0
            }}>
              <AlertTriangle size={17} style={{ flexShrink: 0 }} />
              <div>
                <strong>Kurzbefehl wurde nicht ausgeführt.</strong> Im Kalender wurde nichts gelöscht und der Abgleich bleibt unverändert – es entstehen keine Duplikate. Ist der Kurzbefehl „Schichttagebuch-Kalender“ installiert? Sonst zuerst „Kurzbefehl (1×)“ tippen.
              </div>
            </div>
          )}

          {syncStatus === 'localOnly' && (
            <div style={{
              background: 'rgb(var(--rgb-orange) / 0.12)',
              border: '1px solid rgb(var(--rgb-orange) / 0.38)',
              color: 'var(--c-orange)',
              padding: '10px 14px',
              borderRadius: '12px',
              fontSize: '12.5px',
              lineHeight: 1.4,
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flexShrink: 0
            }}>
              <AlertTriangle size={17} style={{ flexShrink: 0 }} />
              <div>
                <strong>Abgleichsstand konnte nicht aus dem Konto geladen werden</strong> (offline?). Es wird der Stand dieses Geräts verwendet. Im Zweifel „Termine löschen“ und danach alle Dienste neu übertragen.
              </div>
            </div>
          )}

          {!isSyncing && !['deleteShortcut', 'autoExporting', 'autoExported'].includes(downloadSuccess) && overwriteMode === 'update' && hasPreviousExport && (monthNeedsClean || calendarUpToDate) && (
            <div style={{
              background: calendarUpToDate ? 'rgb(var(--rgb-success) / 0.1)' : 'rgb(var(--rgb-orange) / 0.12)',
              border: calendarUpToDate ? '1px solid rgb(var(--rgb-success) / 0.32)' : '1px solid rgb(var(--rgb-orange) / 0.38)',
              color: calendarUpToDate ? 'var(--c-success)' : 'var(--c-orange)',
              padding: '10px 14px',
              borderRadius: '12px',
              fontSize: '12.5px',
              lineHeight: 1.4,
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flexShrink: 0
            }}>
              {calendarUpToDate ? <CheckCircle2 size={17} style={{ flexShrink: 0 }} /> : <AlertTriangle size={17} style={{ flexShrink: 0 }} />}
              <div>
                {calendarUpToDate ? (
                  <><strong>Kalender ist aktuell.</strong> Seit der letzten Übertragung hat sich in {currentMonthLabel} nichts geändert.</>
                ) : (
                  <>
                    <strong>
                      {[
                        modifiedIds.length > 0 ? `${modifiedIds.length} ${modifiedIds.length === 1 ? 'Dienst geändert' : 'Dienste geändert'}` : null,
                        removedItems.length > 0 ? `${removedItems.length} ${removedItems.length === 1 ? 'Dienst entfallen/verschoben' : 'Dienste entfallen/verschoben'}` : null
                      ].filter(Boolean).join(', ')}.
                    </strong>{' '}
                    Beim Übertragen werden die alten Termine des Monats automatisch ersetzt – der Kurzbefehl öffnet sich kurz und die App trägt danach alle aktuellen Dienste neu ein.
                  </>
                )}
              </div>
            </div>
          )}

          {downloadSuccess === 'installShortcut' && (
            <div style={{
              background: 'rgb(var(--rgb-warning) / 0.14)',
              border: '1px solid rgb(var(--rgb-warning) / 0.4)',
              color: 'var(--c-warning)',
              padding: '10px 14px',
              borderRadius: '12px',
              fontSize: '12.5px',
              lineHeight: 1.4,
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flexShrink: 0
            }}>
              <Sparkles size={17} style={{ flexShrink: 0 }} />
              <div>
                <strong>Kurzbefehl „Schichttagebuch-Kalender“ geladen!</strong> Öffne die geladene Datei in Safari und tippe auf <strong>„Kurzbefehl hinzufügen“</strong> (nur 1× nötig). Danach aktualisiert <strong>„In Kalender übertragen“</strong> den Kalender in einem Schritt.
              </div>
            </div>
          )}

          {/* Symmetrical 2x2 Settings Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '12px 14px',
            background: 'rgb(var(--rgb-bg) / 0.45)',
            border: '1px solid rgb(var(--rgb-muted) / 0.12)',
            borderRadius: '14px',
            padding: '14px',
            flexShrink: 0
          }}>
            {/* Cell 1 (Top-Left): Title Format */}
            <div>
              <label style={labelStyle}>Titel im Kalender</label>
              <div style={{ position: 'relative' }}>
                <select
                  value={titleFormat}
                  onChange={(e) => setTitleFormat(e.target.value)}
                  style={{
                    width: '100%',
                    height: controlHeight,
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    background: 'var(--c-surface)',
                    border: '1px solid rgb(var(--rgb-muted) / 0.22)',
                    borderRadius: '10px',
                    padding: '0 32px 0 12px',
                    color: 'var(--c-text)',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                >
                  <option value="codeAndType">Kürzel & Art (z.B. RT2M (Spätschicht))</option>
                  <option value="codeOnly">Nur Kürzel (z.B. RT2M)</option>
                  <option value="typeAndTimes">Schichtart & Zeiten</option>
                </select>
                <ChevronDown
                  size={15}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--c-text-muted)',
                    pointerEvents: 'none'
                  }}
                />
              </div>
            </div>

            {/* Cell 2 (Top-Right): Reminder */}
            <div>
              <label style={labelStyle}>Erinnerung (iOS Hinweis)</label>
              <div style={{ position: 'relative' }}>
                <select
                  value={alarmOption}
                  onChange={(e) => setAlarmOption(e.target.value)}
                  style={{
                    width: '100%',
                    height: controlHeight,
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    background: 'var(--c-surface)',
                    border: '1px solid rgb(var(--rgb-muted) / 0.22)',
                    borderRadius: '10px',
                    padding: '0 32px 0 12px',
                    color: 'var(--c-text)',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                >
                  <option value="1440">1 Tag vorher (Standard)</option>
                  <option value="1440_60">1 Tag vorher + 1 Std. vorher</option>
                  <option value="2880">2 Tage vorher</option>
                  <option value="720">12 Stunden vorher</option>
                  <option value="120">2 Stunden vorher</option>
                  <option value="60">1 Stunde vorher</option>
                  <option value="30">30 Minuten vorher</option>
                  <option value="0">Keine Erinnerung</option>
                </select>
                <ChevronDown
                  size={15}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--c-text-muted)',
                    pointerEvents: 'none'
                  }}
                />
              </div>
            </div>

            {/* Cell 3 (Bottom-Left): Overwrite Mode Segmented Switch */}
            <div>
              <label style={labelStyle}>Bestehende Termine</label>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '4px',
                height: controlHeight,
                background: 'var(--c-bg)',
                border: '1px solid rgb(var(--rgb-muted) / 0.22)',
                borderRadius: '10px',
                padding: '3px'
              }}>
                <button
                  type="button"
                  onClick={() => setOverwriteMode('update')}
                  style={{
                    border: 'none',
                    borderRadius: '7px',
                    background: overwriteMode === 'update' ? 'var(--c-surface-3)' : 'transparent',
                    color: overwriteMode === 'update' ? 'var(--c-text)' : 'var(--c-text-muted)',
                    fontSize: '12px',
                    fontWeight: overwriteMode === 'update' ? 700 : 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap'
                  }}
                  title="Gleicht den Kalender ab: neue Dienste werden ergänzt, bei Änderungen wird der Monat erst bereinigt und dann neu eingetragen"
                >
                  Aktualisieren
                </button>
                <button
                  type="button"
                  onClick={() => setOverwriteMode('forceNew')}
                  style={{
                    border: 'none',
                    borderRadius: '7px',
                    background: overwriteMode === 'forceNew' ? 'var(--c-surface-3)' : 'transparent',
                    color: overwriteMode === 'forceNew' ? 'var(--c-text)' : 'var(--c-text-muted)',
                    fontSize: '12px',
                    fontWeight: overwriteMode === 'forceNew' ? 700 : 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap'
                  }}
                  title="Trägt alle ausgewählten Dienste ohne Abgleich neu ein (kann Dopplungen erzeugen)"
                >
                  Neu erzwingen
                </button>
              </div>
            </div>

            {/* Cell 4 (Bottom-Right): Clean Calendar via Native iOS Shortcut */}
            <div>
              <label style={labelStyle}>Kalender bereinigen</label>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1.25fr 0.95fr',
                gap: '4px',
                height: controlHeight,
                background: 'var(--c-bg)',
                border: '1px solid rgb(var(--rgb-muted) / 0.22)',
                borderRadius: '10px',
                padding: '3px'
              }}>
                <button
                  type="button"
                  onClick={handleRunDeleteShortcut}
                  style={{
                    border: 'none',
                    borderRadius: '7px',
                    background: 'var(--c-surface)',
                    color: 'var(--c-text)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '5px',
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap'
                  }}
                  title="Löscht alle bisherigen Dienste dieses Monats per iOS-Kurzbefehl aus dem iPhone-Kalender"
                >
                  <Trash2 size={13} style={{ color: 'var(--c-danger)', flexShrink: 0 }} />
                  <span>Termine löschen</span>
                </button>
                <button
                  type="button"
                  onClick={handleInstallShortcut}
                  style={{
                    border: 'none',
                    borderRadius: '7px',
                    background: 'rgb(var(--rgb-warning) / 0.12)',
                    color: 'var(--c-warning)',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap'
                  }}
                  title="Lädt einmalig den Apple-Kurzbefehl „Schichttagebuch-Kalender“ auf das iPhone, damit das Löschen im Kalender funktioniert"
                >
                  <Download size={12} style={{ flexShrink: 0 }} />
                  <span>Kurzbefehl (1×)</span>
                </button>
              </div>
            </div>
          </div>

          {/* Shifts Selection List */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minHeight: '240px'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px',
              flexWrap: 'wrap',
              gap: '8px',
              flexShrink: 0
            }}>
              <div style={{
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--c-text-muted)'
              }}>
                Zu übertragende Dienste <span style={{ color: 'var(--c-text)' }}>({selectedShifts.length} von {shifts.length})</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {changedOrNewIds.length > 0 && changedOrNewIds.length < shifts.length && (
                  <button
                    type="button"
                    onClick={selectOnlyChanged}
                    style={{
                      background: 'rgb(var(--rgb-orange) / 0.14)',
                      border: '1px solid rgb(var(--rgb-orange) / 0.35)',
                      color: 'var(--c-orange)',
                      fontSize: '11px',
                      padding: '3px 9px',
                      borderRadius: '7px',
                      cursor: 'pointer',
                      fontWeight: 700
                    }}
                  >
                    Nur geänderte/neue ({changedOrNewIds.length})
                  </button>
                )}
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  style={{
                    background: 'rgb(var(--rgb-muted) / 0.1)',
                    border: '1px solid rgb(var(--rgb-muted) / 0.2)',
                    color: 'var(--c-text)',
                    fontSize: '11px',
                    padding: '3px 9px',
                    borderRadius: '7px',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  {selectedIds.size === shifts.length ? 'Keine auswählen' : 'Alle auswählen'}
                </button>
              </div>
            </div>

            {shifts.length === 0 ? (
              <div style={{
                padding: '28px',
                textAlign: 'center',
                color: 'var(--c-text-subtle)',
                background: 'rgb(var(--rgb-bg) / 0.5)',
                borderRadius: '14px',
                border: '1px dashed rgb(var(--rgb-muted) / 0.2)'
              }}>
                Keine Dienste in diesem Monat vorhanden.
              </div>
            ) : (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '7px',
                flex: 1,
                maxHeight: '380px',
                overflowY: 'auto',
                paddingRight: '4px'
              }}>
                {sortedShifts.map(shift => {
                  const isChecked = selectedIds.has(shift.id);
                  const shiftCodeObj = (storeSettings.shiftCodes || []).find(
                    c => c.id === shift.codeId || c.code === shift.code
                  );
                  const code = shift.code || shiftCodeObj?.code || 'Schicht';
                  const shiftTypeObj = (storeSettings.shiftTypes || []).find(t => t.id === shift.typeId);
                  const typeName = shift.shiftTypeName || shiftTypeObj?.name || '';
                  const shiftCol = getShiftColor(typeName, code, shift.station, shift.vehicle);

                  const dateObj = new Date(shift.date);
                  const weekday = dateObj.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '');
                  const rawDate = dateObj.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }).replace(/\.$/, '');
                  const formattedDate = `${rawDate}.`;
                  const status = hasPreviousExport ? shiftStatuses[shift.id] : null;
                  const cleanPartner = shift.partner
                    ? (shift.partner.trim().startsWith('mit ') ? shift.partner.trim() : `mit ${shift.partner.trim()}`)
                    : '';

                  return (
                    <div
                      key={shift.id}
                      onClick={() => toggleShift(shift.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '11px',
                        padding: '9px 12px',
                        borderRadius: '12px',
                        background: isChecked
                          ? 'rgb(var(--rgb-surface) / 0.78)'
                          : 'rgb(var(--rgb-bg) / 0.4)',
                        border: status === 'modified'
                          ? '1px solid rgb(var(--rgb-orange) / 0.45)'
                          : (isChecked ? '1px solid rgb(var(--rgb-muted) / 0.18)' : '1px solid rgb(var(--rgb-muted) / 0.06)'),
                        cursor: 'pointer',
                        opacity: isChecked ? 1 : 0.48,
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {/* Custom Vector Checkbox */}
                      <div style={{
                        width: '19px',
                        height: '19px',
                        borderRadius: '6px',
                        background: isChecked ? 'var(--c-warning-strong)' : 'rgb(var(--rgb-bg) / 0.8)',
                        border: isChecked ? '1.5px solid var(--c-warning-strong)' : '1.5px solid var(--c-border-strong)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--c-bg)',
                        flexShrink: 0,
                        transition: 'all 0.15s ease'
                      }}>
                        {isChecked && <Check size={13} strokeWidth={3} />}
                      </div>

                      {/* Date Tile */}
                      <div style={{
                        minWidth: '46px',
                        padding: '3px 5px',
                        borderRadius: '9px',
                        background: 'rgb(var(--rgb-bg) / 0.65)',
                        border: '1px solid rgb(var(--rgb-muted) / 0.12)',
                        textAlign: 'center',
                        flexShrink: 0
                      }}>
                        <span style={{
                          fontSize: '9.5px',
                          color: 'var(--c-warning)',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          display: 'block',
                          lineHeight: 1.1
                        }}>
                          {weekday}
                        </span>
                        <span style={{
                          fontSize: '13px',
                          fontWeight: 800,
                          color: 'var(--c-text)',
                          lineHeight: 1.2
                        }}>
                          {formattedDate}
                        </span>
                      </div>

                      {/* Shift Code Pill in Station Color */}
                      <div style={{
                        background: shiftCol.bg,
                        color: shiftCol.color,
                        border: `1px solid ${shiftCol.border}`,
                        padding: '3px 8px',
                        borderRadius: '7px',
                        fontWeight: 800,
                        fontSize: '11.5px',
                        minWidth: '50px',
                        textAlign: 'center',
                        flexShrink: 0
                      }}>
                        {code}
                      </div>

                      {/* Main Shift Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                          flexWrap: 'wrap'
                        }}>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--c-text)' }}>
                            {shift.startTime} – {shift.endTime} Uhr
                          </span>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {status === 'modified' && (
                              <span style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                background: 'rgb(var(--rgb-orange) / 0.18)',
                                border: '1px solid rgb(var(--rgb-orange) / 0.35)',
                                color: 'var(--c-orange)',
                                padding: '1px 7px',
                                borderRadius: '999px'
                              }}>
                                Geändert
                              </span>
                            )}
                            {status === 'new' && (
                              <span style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                background: 'rgb(var(--rgb-info) / 0.18)',
                                border: '1px solid rgb(var(--rgb-info) / 0.35)',
                                color: 'var(--c-info)',
                                padding: '1px 7px',
                                borderRadius: '999px'
                              }}>
                                Neu
                              </span>
                            )}
                            {status === 'unchanged' && (
                              <span style={{
                                fontSize: '10px',
                                fontWeight: 600,
                                background: 'rgb(var(--rgb-success) / 0.12)',
                                border: '1px solid rgb(var(--rgb-success) / 0.28)',
                                color: 'var(--c-success)',
                                padding: '1px 7px',
                                borderRadius: '999px'
                              }}>
                                Übertragen
                              </span>
                            )}
                          </div>
                        </div>

                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '7px',
                          marginTop: '2px',
                          fontSize: '11.5px',
                          color: 'var(--c-text-muted)',
                          flexWrap: 'wrap'
                        }}>
                          {shift.station && (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              color: shiftCol.stationColor,
                              fontWeight: 600
                            }}>
                              <MapPin size={11} />
                              {shift.station}
                            </span>
                          )}
                          {shift.vehicle && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              <span style={{ color: 'var(--c-border-strong)' }}>•</span>
                              <Truck size={11} />
                              {shift.vehicle}
                            </span>
                          )}
                          {cleanPartner && (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              color: 'var(--c-info)',
                              fontWeight: 500
                            }}>
                              <span style={{ color: 'var(--c-border-strong)' }}>•</span>
                              <Users size={11} />
                              {cleanPartner}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Sticky Footer */}
        <div style={{
          padding: '14px 22px',
          background: 'rgb(var(--rgb-bg) / 0.9)',
          borderTop: '1px solid rgb(var(--rgb-muted) / 0.12)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          flexShrink: 0
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 0.8,
              background: 'rgb(var(--rgb-surface) / 0.8)',
              border: '1px solid rgb(var(--rgb-muted) / 0.2)',
              color: 'var(--c-text-soft)',
              padding: '11px 16px',
              borderRadius: '12px',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            Schließen
          </button>

          <button
            type="button"
            onClick={handleExport}
            disabled={selectedShifts.length === 0 || isSyncing || isAutoExporting}
            style={{
              flex: 2.5,
              background: selectedShifts.length > 0
                ? (needsShortcutCleanBeforeExport
                    ? 'linear-gradient(135deg, var(--c-info) 0%, var(--c-info-strong) 100%)'
                    : 'linear-gradient(135deg, var(--c-warning) 0%, var(--c-warning-strong) 100%)')
                : 'rgb(var(--rgb-warning) / 0.3)',
              color: needsShortcutCleanBeforeExport ? '#ffffff' : 'var(--c-bg)',
              border: 'none',
              padding: '11px 18px',
              borderRadius: '12px',
              fontWeight: 700,
              fontSize: '14px',
              cursor: selectedShifts.length > 0 ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: selectedShifts.length > 0
                ? (needsShortcutCleanBeforeExport
                    ? '0 8px 20px -4px rgb(var(--rgb-info) / 0.4)'
                    : '0 8px 20px -4px rgb(var(--rgb-warning) / 0.4)')
                : 'none',
              opacity: selectedShifts.length > 0 ? 1 : 0.5,
              transition: 'all 0.15s ease'
            }}
          >
            {isSyncing || isAutoExporting ? (
              <span>{isAutoExporting ? 'Dienste werden übertragen …' : 'Abgleich mit dem Kalender wird geladen …'}</span>
            ) : needsShortcutCleanBeforeExport ? (
              <>
                <Trash2 size={18} strokeWidth={2.5} style={{ flexShrink: 0 }} />
                <span>
                  Kalender aktualisieren (alte Termine ersetzen)
                </span>
              </>
            ) : (
              <>
                <Download size={18} strokeWidth={2.5} style={{ flexShrink: 0 }} />
                <span>
                  {downloadSuccess === 'deleteShortcut' ? 'Schritt 2/2: ' : ''}
                  {selectedShifts.length} {selectedShifts.length === 1 ? 'Dienst' : 'Dienste'} als ics-Datei zum Import in Kalender exportieren
                </span>
              </>
            )}
          </button>
        </div>

        {/* Tip Pop-up Overlay (Opens only on click) */}
        {isTipPopupOpen && (
          <div
            onClick={() => setIsTipPopupOpen(false)}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgb(var(--rgb-deep) / 0.78)',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px',
              zIndex: 50,
              animation: 'fadeIn 0.15s ease-out'
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'var(--c-surface)',
                border: '1px solid rgb(var(--rgb-warning) / 0.35)',
                borderRadius: '18px',
                padding: '20px 22px',
                maxWidth: '490px',
                width: '100%',
                boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)'
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                marginBottom: '14px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    background: 'rgb(var(--rgb-warning) / 0.16)',
                    color: 'var(--c-warning)',
                    borderRadius: '10px',
                    padding: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Smartphone size={18} />
                  </div>
                  <h3 style={{ margin: 0, fontSize: '15.5px', fontWeight: 700, color: 'var(--c-text)', textTransform: 'none' }}>
                    So funktionieren Aktualisieren & Löschen auf dem iPhone
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsTipPopupOpen(false)}
                  style={{
                    background: 'rgb(var(--rgb-muted) / 0.12)',
                    border: 'none',
                    color: 'var(--c-text-muted)',
                    width: '30px',
                    height: '30px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer'
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              <div style={{ fontSize: '13px', color: 'var(--c-text-soft)', lineHeight: 1.55, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <strong style={{ color: 'var(--c-text)' }}>1. Aktualisieren (ein Tipp, ohne Duplikate):</strong><br />
                  Die App merkt sich für jeden Tag, was zuletzt übertragen wurde. Kommen nur <strong>neue Dienste</strong> hinzu, werden nur diese eingetragen. Wurde ein Dienst <strong>geändert, gestrichen oder verschoben</strong>, löscht der Kurzbefehl automatisch die alten Termine des Monats, springt zurück und die App trägt sofort alle aktuellen Dienste neu ein – so bleiben <strong>keine Dopplungen oder Altlasten</strong> stehen.
                </div>
                <div>
                  <strong style={{ color: 'var(--c-text)' }}>2. Termine löschen (per iOS-Kurzbefehl):</strong><br />
                  Da Apple das Löschen über .ics-Dateien nicht erlaubt, nutzt das iPhone dafür einen Kurzbefehl (einmalig über <strong>„Kurzbefehl (1×)“</strong> → <em>„Kurzbefehl hinzufügen“</em> installieren). <strong>„Termine löschen“</strong> entfernt nur alle Monats-Dienste aus dem Kalender, ohne neu einzutragen.
                </div>
                <div>
                  <strong style={{ color: 'var(--c-text)' }}>3. Neu erzwingen:</strong><br />
                  Trägt alle ausgewählten Dienste ohne Abgleich neu ein (z.B. wenn Termine manuell gelöscht wurden). Achtung: Sind die alten Termine noch im Kalender, entstehen Dopplungen – dann vorher „Termine löschen“ nutzen.
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsTipPopupOpen(false)}
                style={{
                  marginTop: '16px',
                  width: '100%',
                  background: 'linear-gradient(135deg, var(--c-warning) 0%, var(--c-warning-strong) 100%)',
                  color: 'var(--c-bg)',
                  border: 'none',
                  padding: '10px',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '13.5px',
                  cursor: 'pointer'
                }}
              >
                Verstanden
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
