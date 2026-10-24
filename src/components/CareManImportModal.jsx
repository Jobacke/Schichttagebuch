import React, { useState, useMemo } from 'react';
import {
  Calendar, CheckCircle2, AlertCircle, Trash2,
  X, ChevronLeft, ChevronRight, Check, Users
} from 'lucide-react';
import {
  CAREMAN_NOVEMBER_2026_BACKHAUS,
  getPresetForCode,
  buildShiftFromPreset
} from '../utils/shiftPresets';
import {
  getPartnersForShiftFromRoster,
  extractPersonalShiftsFromRoster
} from '../utils/teamRosterParser';

export default function CareManImportModal({
  isOpen,
  onClose,
  onImportSuccess,
  store,
  addShifts,
  ensureCodesAndTypes,
  initialYearMonth
}) {
  if (!isOpen) return null;

  // Determine starting month from prop or current date
  const defaultStartingMonth = useMemo(() => {
    if (initialYearMonth && /^\d{4}-\d{2}$/.test(initialYearMonth)) {
      return initialYearMonth;
    }
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, [initialYearMonth]);

  const [selectedYearMonth, setSelectedYearMonth] = useState(defaultStartingMonth);
  const [overwriteExisting, setOverwriteExisting] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  // Build shifts for a month directly from the Team Roster (with Nov 2026 fallback if no roster stored)
  const buildShiftsForMonth = (ym) => {
    const fromRoster = extractPersonalShiftsFromRoster(ym);
    if (fromRoster.length > 0) {
      return fromRoster.map(item => ({
        id: crypto.randomUUID(),
        day: item.day,
        date: item.date,
        code: item.code,
        startTime: item.startTime || item.preset?.startTime || '07:00',
        endTime: item.endTime || item.preset?.endTime || '19:00',
        partner: item.partner || '',
        enabled: true,
        preset: item.preset
      }));
    }
    if (ym === '2026-11') {
      return CAREMAN_NOVEMBER_2026_BACKHAUS.map(item => {
        const dateStr = `2026-11-${String(item.day).padStart(2, '0')}`;
        const preset = getPresetForCode(item.code);
        const partner = getPartnersForShiftFromRoster(dateStr, item.code);
        return {
          id: crypto.randomUUID(),
          day: item.day,
          date: dateStr,
          code: item.code,
          startTime: item.startTime || preset?.startTime || '07:00',
          endTime: item.endTime || preset?.endTime || '19:00',
          partner: partner || '',
          enabled: true,
          preset: preset
        };
      });
    }
    return [];
  };

  const [stagedShifts, setStagedShifts] = useState(() => buildShiftsForMonth(defaultStartingMonth));

  const [year, month] = useMemo(() => {
    const parts = selectedYearMonth.split('-');
    return [parseInt(parts[0], 10), parseInt(parts[1], 10)];
  }, [selectedYearMonth]);

  const formattedSelectedMonth = useMemo(() => {
    const d = new Date(year, month - 1, 1);
    return d.toLocaleString('de-DE', { month: 'long', year: 'numeric' });
  }, [year, month]);

  const handleMonthChange = (newYearMonth) => {
    if (!newYearMonth) return;
    setSelectedYearMonth(newYearMonth);
    setStatusMessage(null);
    setStagedShifts(buildShiftsForMonth(newYearMonth));
  };

  const stepMonth = (delta) => {
    const d = new Date(year, month - 1 + delta, 1);
    const newStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    handleMonthChange(newStr);
  };

  const getRelativeYearMonth = (monthOffset) => {
    const d = new Date();
    d.setMonth(d.getMonth() + monthOffset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  const toggleShift = (id) => {
    setStagedShifts(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  };

  const removeShift = (id) => {
    setStagedShifts(prev => prev.filter(s => s.id !== id));
  };

  const allShiftsToImport = useMemo(() => {
    return stagedShifts
      .filter(s => s.enabled)
      .map(s => ({
        ...s,
        partner: s.partner || getPartnersForShiftFromRoster(s.date, s.code) || ''
      }));
  }, [stagedShifts]);

  const totalHours = useMemo(() => {
    return allShiftsToImport.reduce((acc, s) => {
      const h = s.preset?.hours || 8.2;
      return acc + h;
    }, 0);
  }, [allShiftsToImport]);

  const handleImport = async () => {
    if (allShiftsToImport.length === 0) return;
    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const requiredCodes = [];
      const requiredTypes = [];

      allShiftsToImport.forEach(s => {
        const preset = s.preset || getPresetForCode(s.code);
        if (s.code) {
          requiredCodes.push({
            code: s.code,
            hours: preset?.hours || 8.2
          });
        }
        if (preset?.shiftTypeName) {
          requiredTypes.push({
            name: preset.shiftTypeName
          });
        }
      });

      if (ensureCodesAndTypes) {
        await ensureCodesAndTypes(requiredCodes, requiredTypes);
      }

      const newShifts = allShiftsToImport.map(s => {
        const partnerStr = s.partner || getPartnersForShiftFromRoster(s.date, s.code) || '';
        const base = buildShiftFromPreset({
          dateStr: s.date,
          code: s.code,
          partner: partnerStr,
          storeSettings: store.settings
        });
        return {
          ...base,
          startTime: s.startTime || base.startTime,
          endTime: s.endTime || base.endTime,
          partner: partnerStr
        };
      });

      const success = await addShifts(newShifts, overwriteExisting);

      if (success) {
        if (onImportSuccess) {
          onImportSuccess(selectedYearMonth, newShifts.length);
        }
        onClose();
      } else {
        setStatusMessage({ type: 'error', text: 'Fehler beim Speichern in der Datenbank.' });
      }
    } catch (err) {
      console.error('Import error:', err);
      setStatusMessage({ type: 'error', text: 'Unerwarteter Fehler: ' + err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ alignItems: 'center' }}>
      <div className="modal-content" style={{
        maxWidth: '680px',
        maxHeight: '92vh',
        borderRadius: '24px',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div className="modal-header" style={{ padding: '18px 24px', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              background: 'rgba(249, 115, 22, 0.15)',
              color: 'var(--color-primary)',
              borderRadius: '12px',
              padding: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Calendar size={22} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: 'var(--color-text-main)', textTransform: 'none' }}>
                Dienstplan übernehmen
              </h2>
              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                Eigene Dienste inkl. PartnerIn automatisch aus dem Team-Plan generieren
              </span>
            </div>
          </div>
          <button className="close-btn" onClick={onClose} disabled={isSubmitting}>
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body" style={{ padding: '20px 24px', overflowY: 'auto' }}>

          {/* SCHRITT 1: ZIEL-MONAT AUSWÄHLEN */}
          <div style={{
            background: 'var(--color-surface)',
            border: '1px solid rgba(249, 115, 22, 0.45)',
            borderRadius: '16px',
            padding: '14px 16px',
            marginBottom: '18px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  background: 'var(--color-primary)',
                  color: 'white',
                  borderRadius: '50%',
                  width: '22px',
                  height: '22px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 'bold'
                }}>
                  1
                </span>
                <span style={{ fontWeight: 'bold', fontSize: '14px', color: 'var(--color-text-main)' }}>
                  Monat auswählen:
                </span>
              </div>
              <span style={{ fontSize: '14px', color: 'var(--color-primary)', fontWeight: 'bold' }}>
                {formattedSelectedMonth}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => stepMonth(-1)}
                className="btn-secondary"
                style={{ padding: '8px 10px', borderRadius: '8px' }}
                title="Vorheriger Monat"
              >
                <ChevronLeft size={18} />
              </button>

              <input
                type="month"
                className="input-premium"
                value={selectedYearMonth}
                onChange={(e) => handleMonthChange(e.target.value)}
                style={{
                  flex: '1 1 160px',
                  margin: 0,
                  fontWeight: 'bold',
                  fontSize: '15px',
                  padding: '8px 12px'
                }}
              />

              <button
                type="button"
                onClick={() => stepMonth(1)}
                className="btn-secondary"
                style={{ padding: '8px 10px', borderRadius: '8px' }}
                title="Nächster Monat"
              >
                <ChevronRight size={18} />
              </button>

              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => handleMonthChange(getRelativeYearMonth(0))}
                  className="filter-chip"
                  style={{
                    background: selectedYearMonth === getRelativeYearMonth(0) ? 'var(--color-primary)' : 'rgba(255,255,255,0.05)',
                    color: selectedYearMonth === getRelativeYearMonth(0) ? 'white' : 'var(--color-text-muted)',
                    fontSize: '12px',
                    padding: '6px 10px'
                  }}
                >
                  Aktueller Monat
                </button>

                <button
                  type="button"
                  onClick={() => handleMonthChange(getRelativeYearMonth(1))}
                  className="filter-chip"
                  style={{
                    background: selectedYearMonth === getRelativeYearMonth(1) ? 'var(--color-primary)' : 'rgba(255,255,255,0.05)',
                    color: selectedYearMonth === getRelativeYearMonth(1) ? 'white' : 'var(--color-text-muted)',
                    fontSize: '12px',
                    padding: '6px 10px'
                  }}
                >
                  Nächster Monat
                </button>
              </div>
            </div>
          </div>

          {/* Status Message */}
          {statusMessage && (
            <div style={{
              padding: '10px 14px',
              borderRadius: '10px',
              marginBottom: '16px',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: statusMessage.type === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
              color: statusMessage.type === 'error' ? 'var(--color-danger)' : 'var(--color-success)',
              border: `1px solid ${statusMessage.type === 'error' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`
            }}>
              {statusMessage.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* SCHRITT 2: ERKANNTE DIENSTE & PARTNERIN */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  background: 'var(--color-primary)',
                  color: 'white',
                  borderRadius: '50%',
                  width: '22px',
                  height: '22px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 'bold'
                }}>
                  2
                </span>
                <span style={{ fontWeight: 'bold', fontSize: '14px', color: 'var(--color-text-main)' }}>
                  Erkannte Dienste für {formattedSelectedMonth} ({allShiftsToImport.length})
                </span>
              </div>
              <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--color-primary)' }}>
                {totalHours.toFixed(1)} Std. Gesamt
              </span>
            </div>

            {stagedShifts.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '32px 20px',
                color: 'var(--color-text-muted)',
                background: 'var(--color-bg)',
                borderRadius: '14px',
                border: '1px solid var(--color-border)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px'
              }}>
                <Users size={28} style={{ color: '#38bdf8', opacity: 0.8 }} />
                <div style={{ fontSize: '13.5px', color: 'var(--color-text-main)', fontWeight: 600 }}>
                  Noch kein Abteilungsdienstplan für {formattedSelectedMonth} hinterlegt
                </div>
                <div style={{ fontSize: '12px', maxWidth: '420px', lineHeight: 1.45 }}>
                  Füge zuerst im Modul <strong>Team</strong> den Abteilungsdienstplan für {formattedSelectedMonth} ein – daraus werden deine Schichten samt PartnerIn automatisch generiert.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '360px', overflowY: 'auto', paddingRight: '2px' }}>
                {stagedShifts.map((shift) => {
                  const preset = shift.preset || getPresetForCode(shift.code);
                  const dateObj = new Date(shift.date);
                  const weekday = dateObj.toLocaleDateString('de-DE', { weekday: 'short' });
                  const formattedDate = dateObj.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
                  const partnerStr = shift.partner || getPartnersForShiftFromRoster(shift.date, shift.code) || '';

                  return (
                    <div
                      key={shift.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        background: shift.enabled ? 'var(--color-surface)' : 'rgba(15, 23, 42, 0.5)',
                        border: '1px solid var(--color-border)',
                        borderRadius: '12px',
                        padding: '10px 14px',
                        opacity: shift.enabled ? 1 : 0.5,
                        transition: 'opacity 0.2s'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={shift.enabled}
                        onChange={() => toggleShift(shift.id)}
                        style={{ marginRight: '12px', width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--color-primary)' }}
                      />

                      <div style={{
                        width: '50px',
                        textAlign: 'center',
                        marginRight: '12px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        color: 'var(--color-text-main)'
                      }}>
                        <div style={{ color: 'var(--color-primary)', fontSize: '10px' }}>{weekday}</div>
                        <div>{formattedDate}</div>
                      </div>

                      <div style={{
                        background: 'rgba(249, 115, 22, 0.15)',
                        color: 'var(--color-primary)',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontWeight: 'bold',
                        fontSize: '13px',
                        minWidth: '50px',
                        textAlign: 'center',
                        marginRight: '12px'
                      }}>
                        {shift.code}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-main)' }}>
                          <span>{preset?.shiftTypeName || 'Dienst'}</span>
                          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>•</span>
                          <span style={{ fontSize: '12px', color: '#cbd5e1' }}>
                            {shift.startTime || preset?.startTime || '07:00'} - {shift.endTime || preset?.endTime || '19:00'}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {preset?.station || 'Wache Sendling'} • {preset?.vehicle || 'RTW Akkon Sendling 71/1'}
                        </div>
                        {partnerStr && (
                          <div style={{ fontSize: '11.5px', color: '#38bdf8', fontWeight: 600, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            👤 {partnerStr}
                          </div>
                        )}
                      </div>

                      <div style={{ textAlign: 'right', marginLeft: '12px', minWidth: '50px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#e2e8f0' }}>
                          {(preset?.hours || 8.2).toFixed(1)} h
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeShift(shift.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--color-text-muted)',
                          cursor: 'pointer',
                          marginLeft: '8px',
                          padding: '4px'
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Overwrite Option */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
            <input
              type="checkbox"
              id="overwriteExisting"
              checked={overwriteExisting}
              onChange={(e) => setOverwriteExisting(e.target.checked)}
              style={{ width: '16px', height: '16px', accentColor: 'var(--color-primary)' }}
            />
            <label htmlFor="overwriteExisting" style={{ fontSize: '12px', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
              Bereits existierende Schichten an diesen Tagen im Kalender überschreiben
            </label>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer" style={{ padding: '16px 24px', background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={isSubmitting}
            style={{ flex: 1 }}
          >
            Abbrechen
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleImport}
            disabled={isSubmitting || allShiftsToImport.length === 0}
            style={{ flex: 2 }}
          >
            {isSubmitting ? (
              'Wird eingetragen...'
            ) : (
              <>
                <Check size={18} />
                {allShiftsToImport.length} Schichten für {formattedSelectedMonth} eintragen
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
