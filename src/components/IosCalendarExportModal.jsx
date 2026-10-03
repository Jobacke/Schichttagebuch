import React, { useState, useMemo } from 'react';
import {
  Calendar, Check, Download, X, Clock, MapPin, Bell,
  Smartphone, Laptop, CheckCircle2, ShieldCheck, ChevronRight
} from 'lucide-react';
import { downloadIcsFile } from '../utils/calendarExport';

export default function IosCalendarExportModal({
  isOpen,
  onClose,
  shifts = [],
  currentMonthLabel = 'November 2026',
  yearMonth = '2026-11',
  storeSettings = {}
}) {
  if (!isOpen) return null;

  const [calendarName, setCalendarName] = useState('Familie');
  const [titleFormat, setTitleFormat] = useState('codeAndType'); // 'codeAndType', 'codeOnly', 'typeAndTimes'
  const [alarmMinutes, setAlarmMinutes] = useState(60); // 60 min
  const [selectedIds, setSelectedIds] = useState(() => new Set(shifts.map(s => s.id)));
  const [downloadSuccess, setDownloadSuccess] = useState(false);

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
      alarmMinutes: Number(alarmMinutes),
      yearMonth,
      storeSettings
    });

    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 8000);
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
          {/* iOS Calendar Badge (Match user image) */}
          <div style={{
            background: 'rgba(234, 179, 8, 0.1)',
            border: '1px solid rgba(234, 179, 8, 0.3)',
            borderRadius: '16px',
            padding: '16px',
            marginBottom: '20px',
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
                <div style={{ fontSize: '12px', color: '#cbd5e1' }}>
                  Passend für deinen freigegebenen Apple / iOS Kalender
                </div>
              </div>
            </div>

            <div style={{ fontSize: '12px', color: '#eab308', fontWeight: 600, textAlign: 'right' }}>
              {selectedShifts.length} {selectedShifts.length === 1 ? 'Dienst' : 'Dienste'}
            </div>
          </div>

          {/* Success Download Banner */}
          {downloadSuccess && (
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
                <CheckCircle2 size={16} /> Kalenderdatei (.ics) erfolgreich erstellt!
              </div>
              Tippe auf deinem iPhone in Safari auf <strong>„Laden“</strong> und öffne die Datei mit der <strong>Kalender-App</strong>, um alle Dienste mit einem Klick in <strong>„Familie“</strong> zu speichern.
            </div>
          )}

          {/* Options: Title format & Alarm */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            marginBottom: '20px'
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
              <label className="text-label">Erinnerung (Alarm)</label>
              <select
                className="input-premium"
                value={alarmMinutes}
                onChange={(e) => setAlarmMinutes(Number(e.target.value))}
                style={{ marginBottom: 0 }}
              >
                <option value={0}>Keine Erinnerung</option>
                <option value={30}>30 Minuten vorher</option>
                <option value={60}>60 Minuten (1 Std) vorher</option>
                <option value={120}>2 Stunden vorher</option>
                <option value={720}>12 Stunden vorher</option>
              </select>
            </div>
          </div>

          {/* Shifts Selection List */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span className="text-label" style={{ margin: 0 }}>
                Zu übertragende Dienste ({selectedShifts.length} von {shifts.length})
              </span>
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

            {shifts.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)', background: 'var(--color-bg)', borderRadius: '12px' }}>
                Keine Dienste in diesem Monat vorhanden.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                {shifts
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
                          border: isChecked ? '1px solid var(--color-border)' : '1px solid transparent',
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
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-main)' }}>
                            {shift.startTime} - {shift.endTime} Uhr
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            {shift.station} {shift.vehicle ? `• ${shift.vehicle}` : ''}
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
            padding: '14px 16px',
            fontSize: '12px',
            color: 'var(--color-text-muted)',
            lineHeight: 1.5
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-text-main)', fontWeight: 'bold', marginBottom: '6px' }}>
              <Smartphone size={16} color="#eab308" />
              So funktioniert die Übernahme auf iPhone & iPad:
            </div>
            <ol style={{ margin: 0, paddingLeft: '18px' }}>
              <li>Unten auf <strong>„Dienstplan für ‚Familie‘ herunterladen (.ics)“</strong> tippen.</li>
              <li>Safari fragt nach Bestätigung: Auf <strong>„Laden“</strong> tippen und die Datei öffnen.</li>
              <li>In der Apple Kalender-App oben rechts auf <strong>„Alle hinzufügen“</strong> tippen.</li>
              <li>Wähle deinen Kalender <strong style={{ color: '#eab308' }}>„Familie“</strong> aus und bestätige – fertig!</li>
            </ol>
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
            {selectedShifts.length} Dienste in „{calendarName}“ exportieren
          </button>
        </div>
      </div>
    </div>
  );
}
