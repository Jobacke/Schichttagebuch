import React, { useState, useMemo } from 'react';
import {
  Calendar, Check, Download, X, Bell,
  Smartphone, CheckCircle2, RefreshCw, Trash2
} from 'lucide-react';
import {
  downloadIcsFile,
  downloadCancelIcsFile,
  getShiftExportStatus,
  getCalendarExportHistory
} from '../utils/calendarExport';

export default function IosCalendarExportModal({
  isOpen,
  onClose,
  shifts = [],
  currentMonthLabel = 'November 2026',
  yearMonth = '2026-11',
  storeSettings = {}
}) {
  if (!isOpen) return null;

  const [calendarName] = useState('Familie');
  const [titleFormat, setTitleFormat] = useState('codeAndType'); // 'codeAndType', 'codeOnly', 'typeAndTimes'
  const [alarmOption, setAlarmOption] = useState('1440'); // Default: 1 Tag vorher!
  const [overwriteMode, setOverwriteMode] = useState('update'); // 'update' | 'forceNew'
  const [selectedIds, setSelectedIds] = useState(() => new Set(shifts.map(s => s.id)));
  const [downloadSuccess, setDownloadSuccess] = useState(null); // null | 'export' | 'cancel'
  const [exportVersionTick, setExportVersionTick] = useState(0);

  const exportHistory = useMemo(() => {
    return getCalendarExportHistory(yearMonth);
  }, [yearMonth, exportVersionTick]);

  const shiftStatuses = useMemo(() => {
    const map = {};
    shifts.forEach(s => {
      map[s.id] = getShiftExportStatus(s, yearMonth, storeSettings);
    });
    return map;
  }, [shifts, yearMonth, storeSettings, exportVersionTick]);

  const changedOrNewIds = useMemo(() => {
    if (!exportHistory) return [];
    return shifts
      .filter(s => shiftStatuses[s.id] === 'modified' || shiftStatuses[s.id] === 'new')
      .map(s => s.id);
  }, [shifts, shiftStatuses, exportHistory]);

  const selectedShifts = useMemo(() => {
    return shifts.filter(s => selectedIds.has(s.id));
  }, [shifts, selectedIds]);

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

  const handleExport = () => {
    if (selectedShifts.length === 0) return;

    downloadIcsFile(selectedShifts, {
      calendarName,
      titleFormat,
      alarmOption,
      alarmMinutes: alarmOption === '1440' ? 1440 : (Number(alarmOption) || 1440),
      overwriteMode,
      yearMonth,
      storeSettings
    });

    setExportVersionTick(t => t + 1);
    setDownloadSuccess('export');
    setTimeout(() => setDownloadSuccess(null), 9000);
  };

  const handleDownloadCancelIcs = () => {
    if (shifts.length === 0) return;
    downloadCancelIcsFile(selectedShifts.length > 0 ? selectedShifts : shifts, {
      calendarName,
      titleFormat,
      yearMonth,
      storeSettings
    });
    setDownloadSuccess('cancel');
    setTimeout(() => setDownloadSuccess(null), 9000);
  };

  return (
    <div className="modal-overlay" style={{ alignItems: 'center' }}>
      <div className="modal-content" style={{
        maxWidth: '640px',
        maxHeight: '94vh',
        borderRadius: '24px',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div className="modal-header" style={{ padding: '18px 24px', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              background: 'rgba(234, 179, 8, 0.15)',
              color: '#eab308',
              borderRadius: '12px',
              padding: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Calendar size={24} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: 'var(--color-text-main)', textTransform: 'none' }}>
                In iOS Kalender übertragen
              </h2>
              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                Dienstplan für {currentMonthLabel} exportieren
              </span>
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body" style={{ padding: '20px 24px', overflowY: 'auto' }}>
          {/* iOS Calendar Badge */}
          <div style={{
            background: 'rgba(234, 179, 8, 0.1)',
            border: '1px solid rgba(234, 179, 8, 0.3)',
            borderRadius: '16px',
            padding: '14px 16px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                background: '#f59e0b',
                color: '#1e293b',
                borderRadius: '8px',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                boxShadow: '0 2px 8px rgba(245, 158, 11, 0.4)'
              }}>
                <Check size={20} strokeWidth={3} />
              </div>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--color-text-main)' }}>
                  Ziel-Kalender: {calendarName}
                </div>
                <div style={{ fontSize: '12px', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', flexWrap: 'wrap' }}>
                  <span>Passend für Apple / iOS</span>
                  <span>•</span>
                  <span style={{ color: '#facc15', fontWeight: 600 }}>🔔 Erinnerung: 1 Tag vorher aktiv</span>
                </div>
              </div>
            </div>

            <div style={{ fontSize: '12px', color: '#eab308', fontWeight: 600, textAlign: 'right' }}>
              {selectedShifts.length} {selectedShifts.length === 1 ? 'Dienst' : 'Dienste'}
            </div>
          </div>

          {/* Success Download Banner */}
          {downloadSuccess === 'export' && (
            <div style={{
              background: 'rgba(34, 197, 94, 0.15)',
              border: '1px solid rgba(34, 197, 94, 0.4)',
              color: 'var(--color-success)',
              padding: '14px',
              borderRadius: '12px',
              marginBottom: '16px',
              fontSize: '13px',
              lineHeight: 1.4,
              animation: 'fadeIn 0.2s ease-out'
            }}>
              <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <CheckCircle2 size={16} /> Kalenderdatei (.ics) mit Update-Version erstellt!
              </div>
              Öffne die heruntergeladene Datei in der <strong>Kalender-App</strong> und wähle den Kalender <strong>„{calendarName}“</strong> aus.
            </div>
          )}

          {downloadSuccess === 'cancel' && (
            <div style={{
              background: 'rgba(56, 189, 248, 0.15)',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              color: '#38bdf8',
              padding: '14px',
              borderRadius: '12px',
              marginBottom: '16px',
              fontSize: '13px',
              lineHeight: 1.4,
              animation: 'fadeIn 0.2s ease-out'
            }}>
              <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <Trash2 size={16} /> Lösch-Datei (.ics) heruntergeladen!
              </div>
              1. Öffne die Datei <strong>„..._Loeschen.ics“</strong> im Kalender, um die alten Einträge zu entfernen.<br />
              2. Klicke danach unten auf <strong>„Dienste in ‚{calendarName}‘ exportieren“</strong>, um den aktuellen Stand sauber einzutragen.
            </div>
          )}

          {/* Options: Title format & Alarm */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            marginBottom: '14px'
          }}>
            <div>
              <label className="text-label">Titel im Kalender</label>
              <select
                className="input-premium"
                value={titleFormat}
                onChange={(e) => setTitleFormat(e.target.value)}
                style={{ marginBottom: 0 }}
              >
                <option value="codeAndType">Kürzel & Art (z.B. RT2M (Spätschicht))</option>
                <option value="codeOnly">Nur Kürzel (z.B. RT2M)</option>
                <option value="typeAndTimes">Schichtart & Zeiten</option>
              </select>
            </div>

            <div>
              <label className="text-label" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Bell size={13} style={{ color: '#eab308' }} />
                Erinnerung (iOS Hinweis)
              </label>
              <select
                className="input-premium"
                value={alarmOption}
                onChange={(e) => setAlarmOption(e.target.value)}
                style={{ marginBottom: 0 }}
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
            </div>
          </div>

          {/* Overwrite / Update Controls for Existing Calendar Entries */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid #334155',
            borderRadius: '14px',
            padding: '12px 14px',
            marginBottom: '18px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
              <label className="text-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px', color: '#e2e8f0' }}>
                <RefreshCw size={13} style={{ color: '#38bdf8' }} />
                Bestehende Termine im Kalender behandeln
              </label>

              <button
                type="button"
                onClick={handleDownloadCancelIcs}
                style={{
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#f87171',
                  borderRadius: '8px',
                  padding: '4px 10px',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
                title="Lädt eine .ics Storno-Datei herunter, die bereits übertragene Termine dieses Monats aus dem Kalender entfernt"
              >
                <Trash2 size={12} />
                Alte Termine per .ics löschen
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setOverwriteMode('update')}
                style={{
                  padding: '8px 10px',
                  borderRadius: '10px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  background: overwriteMode === 'update' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(30, 41, 59, 0.5)',
                  border: overwriteMode === 'update' ? '1px solid #38bdf8' : '1px solid #334155',
                  color: overwriteMode === 'update' ? '#f8fafc' : '#94a3b8'
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 700, color: overwriteMode === 'update' ? '#38bdf8' : '#cbd5e1' }}>
                  🔄 Bestehende aktualisieren
                </div>
                <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '2px', lineHeight: 1.3 }}>
                  Gleiche Kalender-ID + höhere Versionsnummer (SEQUENCE)
                </div>
              </button>

              <button
                type="button"
                onClick={() => setOverwriteMode('forceNew')}
                style={{
                  padding: '8px 10px',
                  borderRadius: '10px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  background: overwriteMode === 'forceNew' ? 'rgba(234, 179, 8, 0.15)' : 'rgba(30, 41, 59, 0.5)',
                  border: overwriteMode === 'forceNew' ? '1px solid #eab308' : '1px solid #334155',
                  color: overwriteMode === 'forceNew' ? '#f8fafc' : '#94a3b8'
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 700, color: overwriteMode === 'forceNew' ? '#facc15' : '#cbd5e1' }}>
                  ✨ Neu-Eintrag erzwingen
                </div>
                <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '2px', lineHeight: 1.3 }}>
                  Vergibt neue ID (falls iOS „Alle hinzufügen“ bekannte IDs ignoriert)
                </div>
              </button>
            </div>
          </div>

          {/* Shifts Selection List */}
          <div style={{ marginBottom: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
              <span className="text-label" style={{ margin: 0 }}>
                Zu übertragende Dienste ({selectedShifts.length} von {shifts.length})
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {changedOrNewIds.length > 0 && changedOrNewIds.length < shifts.length && (
                  <button
                    type="button"
                    onClick={selectOnlyChanged}
                    style={{
                      background: 'rgba(249, 115, 22, 0.15)',
                      border: '1px solid rgba(249, 115, 22, 0.4)',
                      color: '#f97316',
                      fontSize: '11.5px',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontWeight: 700
                    }}
                  >
                    ✏️ Nur geänderte/neue ({changedOrNewIds.length})
                  </button>
                )}
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-primary)',
                    fontSize: '12px',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  {selectedIds.size === shifts.length ? 'Keine' : 'Alle auswählen'}
                </button>
              </div>
            </div>

            {shifts.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)', background: 'var(--color-bg)', borderRadius: '12px' }}>
                Keine Dienste in diesem Monat vorhanden.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                {shifts
                  .slice()
                  .sort((a, b) => new Date(a.date) - new Date(b.date))
                  .map(shift => {
                    const isChecked = selectedIds.has(shift.id);
                    const shiftCodeObj = (storeSettings.shiftCodes || []).find(
                      c => c.id === shift.codeId || c.code === shift.code
                    );
                    const code = shift.code || shiftCodeObj?.code || 'Schicht';
                    const dateObj = new Date(shift.date);
                    const weekday = dateObj.toLocaleDateString('de-DE', { weekday: 'short' });
                    const formattedDate = dateObj.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
                    const status = exportHistory ? shiftStatuses[shift.id] : null;

                    return (
                      <div
                        key={shift.id}
                        onClick={() => toggleShift(shift.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '10px 14px',
                          borderRadius: '12px',
                          background: isChecked ? 'var(--color-surface)' : 'rgba(15, 23, 42, 0.4)',
                          border: status === 'modified'
                            ? '1px solid rgba(249, 115, 22, 0.5)'
                            : (isChecked ? '1px solid var(--color-border)' : '1px solid transparent'),
                          cursor: 'pointer',
                          opacity: isChecked ? 1 : 0.5,
                          transition: 'all 0.15s'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleShift(shift.id)}
                          style={{ marginRight: '12px', width: '18px', height: '18px', accentColor: '#eab308' }}
                        />

                        <div style={{ width: '50px', textAlign: 'center', marginRight: '10px' }}>
                          <span style={{ fontSize: '10px', color: '#eab308', fontWeight: 'bold', display: 'block' }}>{weekday}</span>
                          <span style={{ fontSize: '13px', fontWeight: 'bold' }}>{formattedDate}</span>
                        </div>

                        <div style={{
                          background: 'rgba(234, 179, 8, 0.15)',
                          color: '#eab308',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontWeight: 'bold',
                          fontSize: '12px',
                          minWidth: '48px',
                          textAlign: 'center',
                          marginRight: '12px'
                        }}>
                          {code}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-main)' }}>
                              {shift.startTime} - {shift.endTime} Uhr
                            </span>
                            {status === 'modified' && (
                              <span style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                background: 'rgba(249, 115, 22, 0.2)',
                                color: '#fb923c',
                                padding: '1px 6px',
                                borderRadius: '4px'
                              }}>
                                ✏️ Geändert
                              </span>
                            )}
                            {status === 'new' && (
                              <span style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                background: 'rgba(56, 189, 248, 0.2)',
                                color: '#38bdf8',
                                padding: '1px 6px',
                                borderRadius: '4px'
                              }}>
                                🆕 Neu
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            {shift.station} {shift.vehicle ? `• ${shift.vehicle}` : ''} {shift.partner ? `• 👤 ${shift.partner}` : ''}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* iOS Instructions Box */}
          <div style={{
            background: 'var(--color-bg)',
            borderRadius: '14px',
            padding: '12px 16px',
            fontSize: '12px',
            color: 'var(--color-text-muted)',
            lineHeight: 1.5
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-text-main)', fontWeight: 'bold', marginBottom: '4px' }}>
              <Smartphone size={16} color="#eab308" />
              Tipp zum Überschreiben im Apple Kalender:
            </div>
            <div>
              Die Export-Datei enthält jetzt eine automatische <strong>Versionsnummer (SEQUENCE)</strong>, damit bestehende Termine aktualisiert werden. Falls iOS Safari beim Tippen auf „Alle hinzufügen“ bereits vorhandene Termine überspringt, kannst du oben <strong>„Alte Termine per .ics löschen“</strong> nutzen oder nur den geänderten Dienst mit <strong>„✨ Neu-Eintrag erzwingen“</strong> übertragen.
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer" style={{ padding: '16px 24px', background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            style={{ flex: 1 }}
          >
            Schließen
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={selectedShifts.length === 0}
            style={{
              flex: 2,
              background: '#eab308',
              color: '#0f172a',
              border: 'none',
              padding: '12px 20px',
              borderRadius: 'var(--radius-button)',
              fontWeight: 700,
              fontSize: '15px',
              cursor: selectedShifts.length > 0 ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 15px rgba(234, 179, 8, 0.3)',
              opacity: selectedShifts.length > 0 ? 1 : 0.6
            }}
          >
            <Download size={18} strokeWidth={2.5} />
            {selectedShifts.length} {selectedShifts.length === 1 ? 'Dienst' : 'Dienste'} in „{calendarName}“ exportieren
          </button>
        </div>
      </div>
    </div>
  );
}
