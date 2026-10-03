import React, { useState, useMemo } from 'react';
import {
  Calendar, Upload, FileText, CheckCircle2, AlertCircle, Trash2,
  Plus, Sparkles, X, ChevronRight, Clock, Truck, MapPin, RotateCcw,
  Check, Layers
} from 'lucide-react';
import {
  SHIFT_PRESETS,
  CAREMAN_NOVEMBER_2026_BACKHAUS,
  getPresetForCode,
  buildShiftFromPreset
} from '../utils/shiftPresets';

export default function CareManImportModal({ isOpen, onClose, onImportSuccess, store, addShifts, ensureCodesAndTypes, initialYearMonth = '2026-11' }) {
  if (!isOpen) return null;

  // Tabs: 'preset' (1-Klick November 2026), 'paste' (CareMan Text kopieren), 'manual' (Monatsraster)
  const [activeTab, setActiveTab] = useState('preset');
  const [selectedYearMonth, setSelectedYearMonth] = useState(initialYearMonth);
  const [employeeName, setEmployeeName] = useState('Backhaus, Johannes');
  const [pastedText, setPastedText] = useState('');
  const [overwriteExisting, setOverwriteExisting] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  // Staged shifts to be imported: Array of { date, code, enabled, preset, shiftObj }
  const [stagedShifts, setStagedShifts] = useState(() => {
    // Initial load from November 2026 preset
    return CAREMAN_NOVEMBER_2026_BACKHAUS.map(item => {
      const dateStr = `2026-11-${String(item.day).padStart(2, '0')}`;
      const preset = getPresetForCode(item.code);
      return {
        id: crypto.randomUUID(),
        day: item.day,
        date: dateStr,
        code: item.code,
        enabled: true,
        preset: preset
      };
    });
  });

  const [year, month] = useMemo(() => {
    const parts = selectedYearMonth.split('-');
    return [parseInt(parts[0], 10), parseInt(parts[1], 10)];
  }, [selectedYearMonth]);

  const daysInMonth = useMemo(() => {
    return new Date(year, month, 0).getDate();
  }, [year, month]);

  // Load November 2026 Pre-extracted Roster
  const handleLoadNovember2026Preset = () => {
    setSelectedYearMonth('2026-11');
    setEmployeeName('Backhaus, Johannes');
    const shifts = CAREMAN_NOVEMBER_2026_BACKHAUS.map(item => {
      const dateStr = `2026-11-${String(item.day).padStart(2, '0')}`;
      const preset = getPresetForCode(item.code);
      return {
        id: crypto.randomUUID(),
        day: item.day,
        date: dateStr,
        code: item.code,
        enabled: true,
        preset: preset
      };
    });
    setStagedShifts(shifts);
    setStatusMessage({ type: 'info', text: 'Dienstplan für November 2026 (Backhaus, Johannes) mit 11 Schichten geladen.' });
  };

  // Parse Pasted CareMan Text / Table
  const handleParsePastedText = () => {
    if (!pastedText.trim()) return;

    // Check if pasted text contains date in query or text, e.g. "date=2026-11-1" or "November 2026"
    const dateMatch = pastedText.match(/date=(\d{4})-(\d{1,2})/i);
    let targetYear = year;
    let targetMonth = month;
    if (dateMatch) {
      targetYear = parseInt(dateMatch[1], 10);
      targetMonth = parseInt(dateMatch[2], 10);
      setSelectedYearMonth(`${targetYear}-${String(targetMonth).padStart(2, '0')}`);
    } else {
      const monthNames = ['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
      const monthMatch = pastedText.match(/(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})/i);
      if (monthMatch) {
        const foundMIndex = monthNames.indexOf(monthMatch[1].toLowerCase());
        if (foundMIndex !== -1) {
          targetMonth = foundMIndex + 1;
          targetYear = parseInt(monthMatch[2], 10);
          setSelectedYearMonth(`${targetYear}-${String(targetMonth).padStart(2, '0')}`);
        }
      }
    }

    const maxDays = new Date(targetYear, targetMonth, 0).getDate();
    const lines = pastedText.split('\n');

    // Find line for target employee (e.g. Backhaus, Johannes)
    let matchedLine = lines.find(l => l.toLowerCase().includes('backhaus'));
    if (!matchedLine && lines.length > 0) {
      // Find any line with known codes
      matchedLine = lines.find(l => {
        const upper = l.toUpperCase();
        return upper.includes('RFM') || upper.includes('RT2M') || upper.includes('RNM') || upper.includes('RSM');
      });
    }

    if (!matchedLine) {
      // If no specific line found, tokenize entire text for day-code pairs
      matchedLine = pastedText;
    }

    // CareMan columns are usually tab-separated or space-separated after employee name
    // Tokenize
    const tokens = matchedLine
      .replace(/Backhaus,?\s*Johannes/gi, '')
      .split(/[\t\s]+/)
      .map(t => t.trim())
      .filter(Boolean);

    const parsed = [];
    const validCodeRegex = /^[A-Z0-9]{2,5}$/i;

    // Check if tokens are positioned by column (days 1..N) or list of codes
    if (tokens.length >= 20) {
      // Likely full month row columns
      tokens.slice(0, maxDays).forEach((tok, idx) => {
        const day = idx + 1;
        const cleanTok = tok.toUpperCase();
        if (validCodeRegex.test(cleanTok) && cleanTok !== '??' && cleanTok !== '-') {
          const dateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          parsed.push({
            id: crypto.randomUUID(),
            day: day,
            date: dateStr,
            code: cleanTok,
            enabled: true,
            preset: getPresetForCode(cleanTok)
          });
        }
      });
    } else {
      // Search for code matches
      tokens.forEach((tok) => {
        const cleanTok = tok.toUpperCase();
        if (validCodeRegex.test(cleanTok) && SHIFT_PRESETS[cleanTok]) {
          parsed.push({
            id: crypto.randomUUID(),
            day: parsed.length + 1,
            date: `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(parsed.length + 1).padStart(2, '0')}`,
            code: cleanTok,
            enabled: true,
            preset: SHIFT_PRESETS[cleanTok]
          });
        }
      });
    }

    if (parsed.length > 0) {
      setStagedShifts(parsed);
      setStatusMessage({ type: 'success', text: `${parsed.length} Schichten aus Text extrahiert.` });
    } else {
      setStatusMessage({ type: 'error', text: 'Konnte keine Schichtkürzel in diesem Text finden. Bitte Format prüfen.' });
    }
  };

  // Toggle shift enable/disable
  const toggleShift = (id) => {
    setStagedShifts(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  };

  // Remove shift
  const removeShift = (id) => {
    setStagedShifts(prev => prev.filter(s => s.id !== id));
  };

  // Add / Edit manual shift in grid
  const handleGridCodeChange = (dayNum, newCode) => {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    const cleanCode = newCode.trim().toUpperCase();

    if (!cleanCode) {
      // Remove shift on that day
      setStagedShifts(prev => prev.filter(s => s.day !== dayNum));
      return;
    }

    const preset = getPresetForCode(cleanCode);
    setStagedShifts(prev => {
      const existingIdx = prev.findIndex(s => s.day === dayNum);
      const shiftData = {
        id: existingIdx !== -1 ? prev[existingIdx].id : crypto.randomUUID(),
        day: dayNum,
        date: dateStr,
        code: cleanCode,
        enabled: true,
        preset: preset
      };

      if (existingIdx !== -1) {
        const updated = [...prev];
        updated[existingIdx] = shiftData;
        return updated;
      } else {
        return [...prev, shiftData].sort((a, b) => a.day - b.day);
      }
    });
  };

  // Summary calculations
  const enabledShifts = useMemo(() => stagedShifts.filter(s => s.enabled), [stagedShifts]);
  const totalHours = useMemo(() => {
    return enabledShifts.reduce((acc, s) => {
      const h = s.preset?.hours || 8.2;
      return acc + h;
    }, 0);
  }, [enabledShifts]);

  // Submit to Firestore
  const handleImport = async () => {
    if (enabledShifts.length === 0) return;
    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      // 1. Ensure all codes and types exist in store settings
      const requiredCodes = [];
      const requiredTypes = [];

      enabledShifts.forEach(s => {
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

      // 2. Build shift objects for Firestore
      const newShifts = enabledShifts.map(s => {
        return buildShiftFromPreset({
          dateStr: s.date,
          code: s.code,
          storeSettings: store.settings
        });
      });

      // 3. Save to Firestore
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
        <div className="modal-header" style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border)' }}>
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
              <Calendar size={24} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: 'var(--color-text-main)', textTransform: 'none' }}>
                Monatsdienstplan eintragen
              </h2>
              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                CareMan Dienstplan direkt übernehmen
              </span>
            </div>
          </div>
          <button className="close-btn" onClick={onClose} disabled={isSubmitting}>
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body" style={{ padding: '20px 24px', overflowY: 'auto' }}>
          {/* Quick Highlight Banner: CareMan November 2026 */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.15) 0%, rgba(249, 115, 22, 0.05) 100%)',
            border: '1px solid rgba(249, 115, 22, 0.3)',
            borderRadius: '16px',
            padding: '16px',
            marginBottom: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-primary)', fontWeight: 'bold', fontSize: '14px', marginBottom: '4px' }}>
                  <Sparkles size={16} /> Dienstplan erkannt: November 2026
                </div>
                <div style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: '1.4' }}>
                  Spalte <strong>Backhaus, Johannes</strong> • 11 Schichten (RFM, RT2M, RT4M, RT3M, RSM, RNM, RT1M)
                </div>
              </div>
              <button
                type="button"
                onClick={handleLoadNovember2026Preset}
                className="btn-primary"
                style={{ fontSize: '13px', padding: '8px 14px', whiteSpace: 'nowrap' }}
              >
                Plan laden (11 Dienste)
              </button>
            </div>
          </div>

          {/* Tab Navigation */}
          <div style={{
            display: 'flex',
            background: 'var(--color-bg)',
            borderRadius: '12px',
            padding: '4px',
            marginBottom: '20px',
            gap: '4px'
          }}>
            <button
              type="button"
              onClick={() => setActiveTab('preset')}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                background: activeTab === 'preset' ? 'var(--color-surface)' : 'transparent',
                color: activeTab === 'preset' ? 'var(--color-text-main)' : 'var(--color-text-muted)',
                boxShadow: activeTab === 'preset' ? '0 2px 8px rgba(0,0,0,0.2)' : 'none'
              }}
            >
              1-Klick Vorlage
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('paste')}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                background: activeTab === 'paste' ? 'var(--color-surface)' : 'transparent',
                color: activeTab === 'paste' ? 'var(--color-text-main)' : 'var(--color-text-muted)',
                boxShadow: activeTab === 'paste' ? '0 2px 8px rgba(0,0,0,0.2)' : 'none'
              }}
            >
              Text einfügen
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('manual')}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                background: activeTab === 'manual' ? 'var(--color-surface)' : 'transparent',
                color: activeTab === 'manual' ? 'var(--color-text-main)' : 'var(--color-text-muted)',
                boxShadow: activeTab === 'manual' ? '0 2px 8px rgba(0,0,0,0.2)' : 'none'
              }}
            >
              Monatsraster
            </button>
          </div>

          {/* Month & Target Settings Bar */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            marginBottom: '20px'
          }}>
            <div>
              <label className="text-label">Monat auswählen</label>
              <input
                type="month"
                className="input-premium"
                value={selectedYearMonth}
                onChange={(e) => setSelectedYearMonth(e.target.value)}
                style={{ marginBottom: 0 }}
              />
            </div>
            <div>
              <label className="text-label">Mitarbeiter Name</label>
              <input
                type="text"
                className="input-premium"
                value={employeeName}
                onChange={(e) => setEmployeeName(e.target.value)}
                placeholder="Backhaus, Johannes"
                style={{ marginBottom: 0 }}
              />
            </div>
          </div>

          {/* Tab 1: 1-Click Preset Info */}
          {activeTab === 'preset' && (
            <div style={{
              background: 'var(--color-bg)',
              borderRadius: '12px',
              padding: '14px',
              marginBottom: '20px',
              fontSize: '13px',
              color: 'var(--color-text-muted)',
              lineHeight: 1.5
            }}>
              <div style={{ color: 'var(--color-text-main)', fontWeight: 600, marginBottom: '4px' }}>
                Extrahierter CareMan Dienstplan (Bayern)
              </div>
              Die 11 Dienste für <strong>Backhaus, Johannes</strong> aus dem aktuellen Dienstplan-Screenshot sind unten in der Vorschau aufgeführt. Die Zeiten, Wache Sendling und RTW 71/1 bzw. 71/2 sind anhand der App-Presets automatisch zugewiesen.
            </div>
          )}

          {/* Tab 2: Paste CareMan Text */}
          {activeTab === 'paste' && (
            <div style={{ marginBottom: '20px' }}>
              <label className="text-label">Text oder Tabelle aus CareMan einfügen</label>
              <textarea
                className="input-premium"
                rows={4}
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="Zeile für 'Backhaus, Johannes' oder den Dienstplan kopieren und hier einfügen..."
                style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '12px', marginBottom: '8px' }}
              />
              <button
                type="button"
                onClick={handleParsePastedText}
                className="btn-secondary"
                style={{ width: '100%', fontSize: '13px', padding: '10px' }}
              >
                Text analysieren & Kürzel extrahieren
              </button>
            </div>
          )}

          {/* Tab 3: Monthly Grid Quick Entry */}
          {activeTab === 'manual' && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label className="text-label" style={{ margin: 0 }}>Monatsübersicht ({selectedYearMonth})</label>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {['RFM', 'RT1M', 'RT2M', 'RT3M', 'RT4M', 'RSM', 'RNM'].map(quickCode => (
                    <button
                      key={quickCode}
                      type="button"
                      onClick={() => {
                        // Helpful hint
                      }}
                      style={{
                        fontSize: '10px',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-muted)',
                        padding: '2px 6px',
                        borderRadius: '4px'
                      }}
                    >
                      {quickCode}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))',
                gap: '6px',
                maxHeight: '180px',
                overflowY: 'auto',
                padding: '8px',
                background: 'var(--color-bg)',
                borderRadius: '12px'
              }}>
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const dayNum = i + 1;
                  const dateObj = new Date(year, month - 1, dayNum);
                  const weekdayStr = dateObj.toLocaleDateString('de-DE', { weekday: 'narrow' });
                  const shift = stagedShifts.find(s => s.day === dayNum);
                  const val = shift ? shift.code : '';

                  return (
                    <div
                      key={dayNum}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        background: val ? 'rgba(249, 115, 22, 0.15)' : 'var(--color-surface)',
                        border: val ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                        borderRadius: '8px',
                        padding: '4px'
                      }}
                    >
                      <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
                        {weekdayStr} {dayNum}
                      </span>
                      <input
                        type="text"
                        value={val}
                        placeholder="-"
                        maxLength={5}
                        onChange={(e) => handleGridCodeChange(dayNum, e.target.value)}
                        style={{
                          width: '100%',
                          textAlign: 'center',
                          background: 'transparent',
                          border: 'none',
                          color: val ? 'var(--color-primary)' : 'var(--color-text-main)',
                          fontWeight: 'bold',
                          fontSize: '12px',
                          outline: 'none',
                          padding: '2px 0'
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
              {statusMessage.text}
            </div>
          )}

          {/* Staged Shifts Preview */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span className="text-label" style={{ margin: 0 }}>
                Erkannte Schichten ({enabledShifts.length} von {stagedShifts.length} ausgewählt)
              </span>
              <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--color-primary)' }}>
                {totalHours.toFixed(1)} Std. Gesamt
              </span>
            </div>

            {stagedShifts.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '30px',
                color: 'var(--color-text-muted)',
                background: 'var(--color-bg)',
                borderRadius: '12px'
              }}>
                Keine Schichten erfasst. Wähle die 1-Klick Vorlage oder gib Kürzel im Monatsraster ein.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto' }}>
                {stagedShifts.map((shift) => {
                  const preset = shift.preset || getPresetForCode(shift.code);
                  const dateObj = new Date(shift.date);
                  const weekday = dateObj.toLocaleDateString('de-DE', { weekday: 'short' });
                  const formattedDate = dateObj.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });

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
                        width: '54px',
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
                            {preset?.startTime || '07:00'} - {preset?.endTime || '19:00'}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {preset?.station || 'Wache Sendling'} • {preset?.vehicle || 'RTW Akkon Sendling 71/1'}
                        </div>
                      </div>

                      <div style={{ textAlign: 'right', marginLeft: '12px', minWidth: '55px' }}>
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

          {/* Overwrite option */}
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
            disabled={isSubmitting || enabledShifts.length === 0}
            style={{ flex: 2 }}
          >
            {isSubmitting ? (
              'Wird eingetragen...'
            ) : (
              <>
                <Check size={18} />
                {enabledShifts.length} Schichten eintragen
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
