import React, { useState, useMemo } from 'react';
import {
  Calendar, Check, Download, X,
  Smartphone, CheckCircle2, Trash2,
  Users, MapPin, Truck, HelpCircle, ChevronDown
} from 'lucide-react';
import {
  downloadIcsFile,
  downloadCancelIcsFile,
  getShiftExportStatus,
  getCalendarExportHistory
} from '../utils/calendarExport';
import { getShiftColor } from '../utils/shiftColors';

export default function IosCalendarExportModal({
  isOpen,
  onClose,
  shifts = [],
  currentMonthLabel = 'November 2026',
  yearMonth = '2026-11',
  storeSettings = {}
}) {
  if (!isOpen) return null;

  const [titleFormat, setTitleFormat] = useState('codeAndType'); // 'codeAndType', 'codeOnly', 'typeAndTimes'
  const [alarmOption, setAlarmOption] = useState('1440'); // Default: 1 Tag vorher!
  const [overwriteMode, setOverwriteMode] = useState('update'); // 'update' | 'forceNew'
  const [selectedIds, setSelectedIds] = useState(() => new Set(shifts.map(s => s.id)));
  const [downloadSuccess, setDownloadSuccess] = useState(null); // null | 'export' | 'cancel'
  const [exportVersionTick, setExportVersionTick] = useState(0);
  const [isTipPopupOpen, setIsTipPopupOpen] = useState(false);

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
      calendarName: 'Dienstplan',
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
      calendarName: 'Dienstplan',
      titleFormat,
      yearMonth,
      storeSettings
    });
    setDownloadSuccess('cancel');
    setTimeout(() => setDownloadSuccess(null), 9000);
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
    color: '#94a3b8',
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
        backgroundColor: 'rgba(2, 6, 23, 0.78)'
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
          background: 'linear-gradient(180deg, #162033 0%, #0f172a 100%)',
          border: '1px solid rgba(148, 163, 184, 0.16)',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.75)',
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        {/* Top Header with Integrated Shift Count Badge */}
        <div style={{
          padding: '16px 22px',
          borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          background: 'rgba(15, 23, 42, 0.5)',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.22) 0%, rgba(234, 179, 8, 0.08) 100%)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              color: '#fbbf24',
              borderRadius: '12px',
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(245, 158, 11, 0.15)',
              flexShrink: 0
            }}>
              <Calendar size={20} />
            </div>
            <div>
              <h2 style={{
                margin: 0,
                fontSize: '18px',
                fontWeight: 700,
                color: '#f8fafc',
                letterSpacing: '-0.01em',
                textTransform: 'none'
              }}>
                In iOS Kalender übertragen
              </h2>
              <div style={{ fontSize: '12.5px', color: '#94a3b8', marginTop: '1px' }}>
                Dienstplan für <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{currentMonthLabel}</span> exportieren
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Shift Count Pill */}
            <div style={{
              background: 'rgba(245, 158, 11, 0.14)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              color: '#fbbf24',
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
                background: 'rgba(148, 163, 184, 0.1)',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                color: '#cbd5e1',
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
              title="Hilfe & Tipp zum Überschreiben im Apple Kalender anzeigen"
            >
              <HelpCircle size={15} style={{ color: '#fbbf24' }} />
              <span>Tipp</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'rgba(148, 163, 184, 0.1)',
                border: '1px solid rgba(148, 163, 184, 0.15)',
                color: '#94a3b8',
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
          {/* Feedback Banners after Download */}
          {downloadSuccess === 'export' && (
            <div style={{
              background: 'rgba(16, 185, 129, 0.14)',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              color: '#34d399',
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
                <strong>Kalenderdatei (.ics) erstellt!</strong> Öffne die Datei und wähle beim Import deinen gewünschten Ziel-Kalender aus.
              </div>
            </div>
          )}

          {downloadSuccess === 'cancel' && (
            <div style={{
              background: 'rgba(56, 189, 248, 0.14)',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              color: '#38bdf8',
              padding: '10px 14px',
              borderRadius: '12px',
              fontSize: '12.5px',
              lineHeight: 1.4,
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flexShrink: 0
            }}>
              <Trash2 size={17} style={{ flexShrink: 0 }} />
              <div>
                <strong>Lösch-Datei (.ics) geladen!</strong> Erst im Kalender öffnen, danach die Dienste unten neu exportieren.
              </div>
            </div>
          )}

          {/* Symmetrical 2x2 Settings Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '12px 14px',
            background: 'rgba(15, 23, 42, 0.45)',
            border: '1px solid rgba(148, 163, 184, 0.12)',
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
                    background: '#1e293b',
                    border: '1px solid rgba(148, 163, 184, 0.22)',
                    borderRadius: '10px',
                    padding: '0 32px 0 12px',
                    color: '#f8fafc',
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
                    color: '#94a3b8',
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
                    background: '#1e293b',
                    border: '1px solid rgba(148, 163, 184, 0.22)',
                    borderRadius: '10px',
                    padding: '0 32px 0 12px',
                    color: '#f8fafc',
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
                    color: '#94a3b8',
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
                background: '#0f172a',
                border: '1px solid rgba(148, 163, 184, 0.22)',
                borderRadius: '10px',
                padding: '3px'
              }}>
                <button
                  type="button"
                  onClick={() => setOverwriteMode('update')}
                  style={{
                    border: 'none',
                    borderRadius: '7px',
                    background: overwriteMode === 'update' ? '#334155' : 'transparent',
                    color: overwriteMode === 'update' ? '#f8fafc' : '#94a3b8',
                    fontSize: '12px',
                    fontWeight: overwriteMode === 'update' ? 700 : 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap'
                  }}
                >
                  Aktualisieren
                </button>
                <button
                  type="button"
                  onClick={() => setOverwriteMode('forceNew')}
                  style={{
                    border: 'none',
                    borderRadius: '7px',
                    background: overwriteMode === 'forceNew' ? '#334155' : 'transparent',
                    color: overwriteMode === 'forceNew' ? '#f8fafc' : '#94a3b8',
                    fontSize: '12px',
                    fontWeight: overwriteMode === 'forceNew' ? 700 : 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap'
                  }}
                >
                  Neu erzwingen
                </button>
              </div>
            </div>

            {/* Cell 4 (Bottom-Right): Cancel .ics Action */}
            <div>
              <label style={labelStyle}>Kalender bereinigen</label>
              <button
                type="button"
                onClick={handleDownloadCancelIcs}
                style={{
                  width: '100%',
                  height: controlHeight,
                  background: '#1e293b',
                  border: '1px solid rgba(148, 163, 184, 0.22)',
                  color: '#cbd5e1',
                  borderRadius: '10px',
                  padding: '0 12px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '7px',
                  transition: 'all 0.15s ease'
                }}
                title="Lädt eine .ics Storno-Datei herunter, die bereits übertragene Termine dieses Monats aus dem Kalender entfernt"
              >
                <Trash2 size={14} style={{ color: '#f87171' }} />
                <span>Alte Termine per .ics löschen</span>
              </button>
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
                color: '#94a3b8'
              }}>
                Zu übertragende Dienste <span style={{ color: '#e2e8f0' }}>({selectedShifts.length} von {shifts.length})</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {changedOrNewIds.length > 0 && changedOrNewIds.length < shifts.length && (
                  <button
                    type="button"
                    onClick={selectOnlyChanged}
                    style={{
                      background: 'rgba(249, 115, 22, 0.14)',
                      border: '1px solid rgba(249, 115, 22, 0.35)',
                      color: '#fb923c',
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
                    background: 'rgba(148, 163, 184, 0.1)',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    color: '#e2e8f0',
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
                color: '#64748b',
                background: 'rgba(15, 23, 42, 0.5)',
                borderRadius: '14px',
                border: '1px dashed rgba(148, 163, 184, 0.2)'
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
                  const status = exportHistory ? shiftStatuses[shift.id] : null;
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
                          ? 'rgba(30, 41, 59, 0.78)'
                          : 'rgba(15, 23, 42, 0.4)',
                        border: status === 'modified'
                          ? '1px solid rgba(249, 115, 22, 0.45)'
                          : (isChecked ? '1px solid rgba(148, 163, 184, 0.18)' : '1px solid rgba(148, 163, 184, 0.06)'),
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
                        background: isChecked ? '#eab308' : 'rgba(15, 23, 42, 0.8)',
                        border: isChecked ? '1.5px solid #eab308' : '1.5px solid #475569',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#0f172a',
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
                        background: 'rgba(15, 23, 42, 0.65)',
                        border: '1px solid rgba(148, 163, 184, 0.12)',
                        textAlign: 'center',
                        flexShrink: 0
                      }}>
                        <span style={{
                          fontSize: '9.5px',
                          color: '#fbbf24',
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
                          color: '#f8fafc',
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
                          <span style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>
                            {shift.startTime} – {shift.endTime} Uhr
                          </span>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {status === 'modified' && (
                              <span style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                background: 'rgba(249, 115, 22, 0.18)',
                                border: '1px solid rgba(249, 115, 22, 0.35)',
                                color: '#fb923c',
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
                                background: 'rgba(56, 189, 248, 0.18)',
                                border: '1px solid rgba(56, 189, 248, 0.35)',
                                color: '#38bdf8',
                                padding: '1px 7px',
                                borderRadius: '999px'
                              }}>
                                Neu
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
                          color: '#94a3b8',
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
                              <span style={{ color: '#475569' }}>•</span>
                              <Truck size={11} />
                              {shift.vehicle}
                            </span>
                          )}
                          {cleanPartner && (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              color: '#38bdf8',
                              fontWeight: 500
                            }}>
                              <span style={{ color: '#475569' }}>•</span>
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
          background: 'rgba(15, 23, 42, 0.9)',
          borderTop: '1px solid rgba(148, 163, 184, 0.12)',
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
              background: 'rgba(30, 41, 59, 0.8)',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              color: '#cbd5e1',
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
            disabled={selectedShifts.length === 0}
            style={{
              flex: 2.5,
              background: selectedShifts.length > 0
                ? 'linear-gradient(135deg, #fbbf24 0%, #eab308 100%)'
                : 'rgba(234, 179, 8, 0.3)',
              color: '#0f172a',
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
              boxShadow: selectedShifts.length > 0 ? '0 8px 20px -4px rgba(234, 179, 8, 0.4)' : 'none',
              opacity: selectedShifts.length > 0 ? 1 : 0.5,
              transition: 'all 0.15s ease'
            }}
          >
            <Download size={18} strokeWidth={2.5} style={{ flexShrink: 0 }} />
            <span>
              {selectedShifts.length} {selectedShifts.length === 1 ? 'Dienst' : 'Dienste'} als ics-Datei zum Import in Kalender exportieren
            </span>
          </button>
        </div>

        {/* Tip Pop-up Overlay (Opens only on click) */}
        {isTipPopupOpen && (
          <div
            onClick={() => setIsTipPopupOpen(false)}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(2, 6, 23, 0.78)',
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
                background: '#1e293b',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                borderRadius: '18px',
                padding: '20px 22px',
                maxWidth: '480px',
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
                    background: 'rgba(245, 158, 11, 0.16)',
                    color: '#fbbf24',
                    borderRadius: '10px',
                    padding: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Smartphone size={18} />
                  </div>
                  <h3 style={{ margin: 0, fontSize: '15.5px', fontWeight: 700, color: '#f8fafc', textTransform: 'none' }}>
                    Tipp zum Überschreiben im Apple Kalender
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsTipPopupOpen(false)}
                  style={{
                    background: 'rgba(148, 163, 184, 0.12)',
                    border: 'none',
                    color: '#94a3b8',
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

              <div style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: 1.55, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <strong style={{ color: '#f8fafc' }}>1. Aktualisieren (Standard):</strong><br />
                  Nutzt dieselbe Kalender-ID und sendet automatisch eine höhere <strong>Versionsnummer (SEQUENCE)</strong> mit, damit der Kalender vorhandene Termine aktualisiert.
                </div>
                <div>
                  <strong style={{ color: '#f8fafc' }}>2. Neu erzwingen:</strong><br />
                  Vergibt eine neue Kalender-ID – ideal, falls iOS Safari beim Tippen auf „Alle hinzufügen“ bereits bekannte IDs überspringt (z. B. wenn du nur einen geänderten Dienst überträgst).
                </div>
                <div>
                  <strong style={{ color: '#f8fafc' }}>3. Alte Termine per .ics löschen:</strong><br />
                  Erzeugt eine Storno-Datei, die die bisherigen Monats-Einträge aus dem Kalender entfernt, bevor du den aktualisierten Plan frisch einträgst.
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsTipPopupOpen(false)}
                style={{
                  marginTop: '16px',
                  width: '100%',
                  background: 'linear-gradient(135deg, #fbbf24 0%, #eab308 100%)',
                  color: '#0f172a',
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
