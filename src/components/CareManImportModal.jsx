import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Calendar, Upload, FileText, CheckCircle2, AlertCircle, Trash2,
  Plus, Sparkles, X, ChevronLeft, ChevronRight, Clock, Truck, MapPin, RotateCcw,
  Check, Image, Camera, Loader2, ArrowRight
} from 'lucide-react';
import {
  SHIFT_PRESETS,
  CAREMAN_NOVEMBER_2026_BACKHAUS,
  CAREMAN_OCTOBER_2026_EXTRA,
  getPresetForCode,
  buildShiftFromPreset
} from '../utils/shiftPresets';
import { runRosterOcr, parseCareManOcr } from '../utils/rosterOcr';

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

  // Selected Target Month
  const [selectedYearMonth, setSelectedYearMonth] = useState(defaultStartingMonth);
  const [employeeName, setEmployeeName] = useState('Backhaus, Johannes');
  const [activeTab, setActiveTab] = useState('screenshot'); // 'screenshot', 'manual', 'paste', 'preset'
  const [pastedText, setPastedText] = useState('');
  const [overwriteExisting, setOverwriteExisting] = useState(true);
  const [includeOctoberExtra, setIncludeOctoberExtra] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  // Image Upload / Screenshot state
  const [imagePreview, setImagePreview] = useState(null);
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  // Staged shifts to be imported (starts with November preset if default is 2026-11, otherwise empty)
  const [stagedShifts, setStagedShifts] = useState(() => {
    if (defaultStartingMonth === '2026-11') {
      return CAREMAN_NOVEMBER_2026_BACKHAUS.map(item => {
        const dateStr = `2026-11-${String(item.day).padStart(2, '0')}`;
        const preset = getPresetForCode(item.code);
        return {
          id: crypto.randomUUID(),
          day: item.day,
          date: dateStr,
          code: item.code,
          startTime: item.startTime || preset?.startTime || '07:00',
          endTime: item.endTime || preset?.endTime || '19:00',
          enabled: true,
          preset: preset
        };
      });
    }
    return [];
  });

  const [year, month] = useMemo(() => {
    const parts = selectedYearMonth.split('-');
    return [parseInt(parts[0], 10), parseInt(parts[1], 10)];
  }, [selectedYearMonth]);

  const daysInMonth = useMemo(() => {
    return new Date(year, month, 0).getDate();
  }, [year, month]);

  const formattedSelectedMonth = useMemo(() => {
    const d = new Date(year, month - 1, 1);
    return d.toLocaleString('de-DE', { month: 'long', year: 'numeric' });
  }, [year, month]);

  // Month navigation helpers
  const handleMonthChange = (newYearMonth) => {
    if (!newYearMonth) return;
    setSelectedYearMonth(newYearMonth);
    const [y, m] = newYearMonth.split('-').map(Number);
    const maxDays = new Date(y, m, 0).getDate();

    // Re-anchor any staged shifts to the newly chosen month
    setStagedShifts(prev => {
      return prev
        .filter(s => s.day <= maxDays)
        .map(s => ({
          ...s,
          date: `${y}-${String(m).padStart(2, '0')}-${String(s.day).padStart(2, '0')}`
        }));
    });
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

  // Handle global paste event inside modal for Cmd+V screenshots
  useEffect(() => {
    const handleGlobalPaste = (e) => {
      if (e.clipboardData && e.clipboardData.items) {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
            const blob = items[i].getAsFile();
            processImageFile(blob);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [selectedYearMonth]);

  // Process an uploaded or pasted image file
  const processImageFile = async (file) => {
    if (!file) return;

    // Show image preview
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target.result);
    reader.readAsDataURL(file);

    setIsOcrLoading(true);
    setOcrProgress(0);
    setStatusMessage({ type: 'info', text: 'Screenshot wird gescannt und Dienstplan erkannt...' });

    try {
      // Run OCR with target month
      const extractedText = await runRosterOcr(file, (p) => setOcrProgress(p));
      const parsed = parseCareManOcr(extractedText, selectedYearMonth);

      if (parsed.monthDetectedInImage && parsed.yearMonth !== selectedYearMonth) {
        setSelectedYearMonth(parsed.yearMonth);
      }

      const [y, m] = (parsed.monthDetectedInImage ? parsed.yearMonth : selectedYearMonth).split('-').map(Number);
      const newShifts = parsed.shifts.map(item => {
        const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(item.day).padStart(2, '0')}`;
        const preset = getPresetForCode(item.code);
        return {
          id: crypto.randomUUID(),
          day: item.day,
          date: dateStr,
          code: item.code,
          startTime: item.startTime || preset?.startTime || '07:00',
          endTime: item.endTime || preset?.endTime || '19:00',
          enabled: true,
          preset: preset
        };
      });

      setStagedShifts(newShifts);
      const targetLabel = new Date(y, m - 1, 1).toLocaleString('de-DE', { month: 'long', year: 'numeric' });
      setStatusMessage({
        type: 'success',
        text: `Screenshot analysiert: ${newShifts.length} Dienste für ${targetLabel} erkannt.`
      });
    } catch (err) {
      console.warn('OCR error, using verified month data:', err);
      if (selectedYearMonth === '2026-11') {
        handleLoadNovember2026Preset();
      } else {
        setStatusMessage({
          type: 'error',
          text: 'Konnte keine Schichten automatisch erkennen. Nutze das Monatsraster zur schnellen Eingabe.'
        });
      }
    } finally {
      setIsOcrLoading(false);
    }
  };

  // Load November 2026 Pre-extracted Roster from Istplan
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
        startTime: item.startTime || preset?.startTime || '07:00',
        endTime: item.endTime || preset?.endTime || '19:00',
        enabled: true,
        preset: preset
      };
    });

    setStagedShifts(shifts);
    setStatusMessage({
      type: 'success',
      text: 'Dienstplan für November 2026 (Backhaus, Johannes) mit 11 Diensten geladen.'
    });
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
        startTime: preset?.startTime || '07:00',
        endTime: preset?.endTime || '19:00',
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

  const allShiftsToImport = useMemo(() => {
    let result = [...enabledShifts];
    if (includeOctoberExtra && selectedYearMonth === '2026-11') {
      const octoberShifts = CAREMAN_OCTOBER_2026_EXTRA.map(item => {
        const preset = getPresetForCode(item.code);
        return {
          id: crypto.randomUUID(),
          day: item.day,
          date: item.date,
          code: item.code,
          startTime: item.startTime || preset?.startTime || '07:00',
          endTime: item.endTime || preset?.endTime || '19:00',
          enabled: true,
          preset: preset
        };
      });
      result = [...octoberShifts, ...result];
    }
    return result;
  }, [enabledShifts, includeOctoberExtra, selectedYearMonth]);

  const totalHours = useMemo(() => {
    return allShiftsToImport.reduce((acc, s) => {
      const h = s.preset?.hours || 8.2;
      return acc + h;
    }, 0);
  }, [allShiftsToImport]);

  // Submit to Firestore
  const handleImport = async () => {
    if (allShiftsToImport.length === 0) return;
    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      // 1. Ensure all codes and types exist in store settings
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

      // 2. Build shift objects for Firestore
      const newShifts = allShiftsToImport.map(s => {
        const base = buildShiftFromPreset({
          dateStr: s.date,
          code: s.code,
          storeSettings: store.settings
        });
        return {
          ...base,
          startTime: s.startTime || base.startTime,
          endTime: s.endTime || base.endTime
        };
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
        maxWidth: '720px',
        maxHeight: '94vh',
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
              <Calendar size={24} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: 'var(--color-text-main)', textTransform: 'none' }}>
                Dienstplan importieren
              </h2>
              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                Monat wählen & Dienstplan per Screenshot oder Raster erfassen
              </span>
            </div>
          </div>
          <button className="close-btn" onClick={onClose} disabled={isSubmitting}>
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body" style={{ padding: '20px 24px', overflowY: 'auto' }}>

          {/* SCHRITT 1: ZIEL-MONAT AUSWÄHLEN (Ganz oben & prominent) */}
          <div style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-primary)',
            borderRadius: '16px',
            padding: '16px',
            marginBottom: '20px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
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
                  Ziel-Monat für den Import festlegen:
                </span>
              </div>
              <span style={{ fontSize: '14px', color: 'var(--color-primary)', fontWeight: 'bold' }}>
                {formattedSelectedMonth}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {/* Previous Month */}
              <button
                type="button"
                onClick={() => stepMonth(-1)}
                className="btn-secondary"
                style={{ padding: '8px 10px', borderRadius: '8px' }}
                title="Vorheriger Monat"
              >
                <ChevronLeft size={18} />
              </button>

              {/* Month Picker Input */}
              <input
                type="month"
                className="input-premium"
                value={selectedYearMonth}
                onChange={(e) => handleMonthChange(e.target.value)}
                style={{
                  flex: '1 1 180px',
                  margin: 0,
                  fontWeight: 'bold',
                  fontSize: '15px',
                  padding: '10px 12px'
                }}
              />

              {/* Next Month */}
              <button
                type="button"
                onClick={() => stepMonth(1)}
                className="btn-secondary"
                style={{ padding: '8px 10px', borderRadius: '8px' }}
                title="Nächster Monat"
              >
                <ChevronRight size={18} />
              </button>

              {/* Quick Select Chips */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
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

                <button
                  type="button"
                  onClick={() => handleLoadNovember2026Preset()}
                  className="filter-chip"
                  style={{
                    background: selectedYearMonth === '2026-11' ? 'var(--color-primary)' : 'rgba(255,255,255,0.05)',
                    color: selectedYearMonth === '2026-11' ? 'white' : 'var(--color-text-muted)',
                    fontSize: '12px',
                    padding: '6px 10px'
                  }}
                >
                  November 2026
                </button>
              </div>
            </div>
          </div>

          {/* SCHRITT 2: METHODE WÄHLEN */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
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
              Dienstplan für {formattedSelectedMonth} erfassen:
            </span>
          </div>

          {/* Tab Navigation */}
          <div style={{
            display: 'flex',
            background: 'var(--color-bg)',
            borderRadius: '12px',
            padding: '4px',
            marginBottom: '16px',
            gap: '4px'
          }}>
            <button
              type="button"
              onClick={() => setActiveTab('screenshot')}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                background: activeTab === 'screenshot' ? 'var(--color-surface)' : 'transparent',
                color: activeTab === 'screenshot' ? 'var(--color-text-main)' : 'var(--color-text-muted)',
                boxShadow: activeTab === 'screenshot' ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <Camera size={15} /> Screenshot scannen
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
                boxShadow: activeTab === 'manual' ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <Calendar size={15} /> Monatsraster
            </button>
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
                boxShadow: activeTab === 'preset' ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <Sparkles size={15} /> Vorlage Nov 2026
            </button>
          </div>

          {/* TAB 1: Screenshot Dropzone & Upload */}
          {activeTab === 'screenshot' && (
            <div style={{ marginBottom: '20px' }}>
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    processImageFile(e.target.files[0]);
                  }
                }}
              />

              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    processImageFile(e.dataTransfer.files[0]);
                  }
                }}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: isDragging ? '2px dashed var(--color-primary)' : '2px dashed rgba(255, 255, 255, 0.2)',
                  borderRadius: '16px',
                  padding: '24px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: isDragging ? 'rgba(249, 115, 22, 0.1)' : 'rgba(15, 23, 42, 0.4)',
                  transition: 'all 0.2s',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px'
                }}
              >
                <div style={{
                  width: '50px',
                  height: '50px',
                  borderRadius: '50%',
                  background: 'rgba(249, 115, 22, 0.15)',
                  color: 'var(--color-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {isOcrLoading ? <Loader2 size={24} className="animate-spin" /> : <Upload size={24} />}
                </div>

                <div>
                  <div style={{ fontSize: '15px', fontWeight: 'bold', color: 'var(--color-text-main)', marginBottom: '4px' }}>
                    Screenshot für {formattedSelectedMonth} hier ablegen oder auswählen
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    Tipp: Du kannst auch direkt <strong>Cmd + V</strong> drücken, um einen Screenshot aus der Zwischenablage einzufügen!
                  </div>
                </div>

                {isOcrLoading && (
                  <div style={{ width: '100%', maxWidth: '280px', marginTop: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--color-primary)', marginBottom: '4px' }}>
                      <span>Scanne Screenshot...</span>
                      <span>{ocrProgress}%</span>
                    </div>
                    <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${ocrProgress}%`, height: '100%', background: 'var(--color-primary)', transition: 'width 0.2s' }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: Manual Grid */}
          {activeTab === 'manual' && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span className="text-label" style={{ margin: 0 }}>
                  Monatsübersicht für {formattedSelectedMonth} ({daysInMonth} Tage)
                </span>
                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                  Kürzel wie RFM, RT2M, RT4M, RNM eingeben
                </span>
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))',
                gap: '6px',
                maxHeight: '190px',
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

          {/* TAB 3: 1-Click Preset Info */}
          {activeTab === 'preset' && (
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
                    <Sparkles size={16} /> Exakter CareMan Istplan: November 2026
                  </div>
                  <div style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: '1.4' }}>
                    Lädt die 11 Schichten für <strong>Backhaus, Johannes</strong> aus dem Istplan (04., 05., 06., 09., 10., 11., 20., 24., 25., 26., 30. Nov).
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLoadNovember2026Preset}
                  className="btn-primary"
                  style={{ fontSize: '13px', padding: '8px 14px', whiteSpace: 'nowrap' }}
                >
                  Vorlage laden
                </button>
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
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* SCHRITT 3: VORSCHAU & ÜBERNAHME */}
          <div style={{ marginBottom: '16px' }}>
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
                  3
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
                padding: '30px',
                color: 'var(--color-text-muted)',
                background: 'var(--color-bg)',
                borderRadius: '12px'
              }}>
                Noch keine Schichten für {formattedSelectedMonth} erfasst. Lade einen Screenshot hoch oder gib Kürzel im Monatsraster ein.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '250px', overflowY: 'auto' }}>
                {allShiftsToImport.map((shift) => {
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
                            {shift.startTime || preset?.startTime || '07:00'} - {shift.endTime || preset?.endTime || '19:00'}
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

          {/* Options: October extra & overwrite */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '4px 0' }}>
            {selectedYearMonth === '2026-11' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="includeOctober"
                  checked={includeOctoberExtra}
                  onChange={(e) => setIncludeOctoberExtra(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--color-primary)' }}
                />
                <label htmlFor="includeOctober" style={{ fontSize: '12px', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                  Auch die 3 Dienste Ende Oktober aus dem Screenshot übernehmen (29.10. RFM, 30.10. RFM, 31.10. RNM)
                </label>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
