import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Users, ChevronLeft, ChevronRight, Search,
  UploadCloud, X, CheckCircle2, Sparkles, AlertCircle, FileText, FileCode, Clipboard
} from 'lucide-react';
import {
  getActiveTeamRoster,
  saveActiveTeamRoster,
  runTeamRosterOcr,
  parseTeamRoster
} from '../utils/teamRosterParser';
import { parseCareManPdf } from '../utils/teamRosterPdfParser';
import { parseCareManHtml } from '../utils/teamRosterHtmlParser';
import { getShiftColor } from '../utils/shiftColors';

export default function TeamRoster() {
  // Active roster data (defaults to cleaned October 2026 data)
  const [roster, setRoster] = useState(() => getActiveTeamRoster('2026-10'));
  
  // Selected date
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const ym = roster?.yearMonth || '2026-10';
    if (todayStr.startsWith(ym)) return todayStr;
    return `${ym}-05`;
  });

  const [searchQuery, setSearchQuery] = useState('');

  // Upload modal state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [isPasteMode, setIsPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const fileInputRef = useRef(null);

  // Toast timer
  useEffect(() => {
    if (toastMessage) {
      const t = setTimeout(() => setToastMessage(null), 3500);
      return () => clearTimeout(t);
    }
  }, [toastMessage]);

  const daysInMonth = roster.daysInMonth || 31;
  const yearMonth = roster.yearMonth || '2026-10';

  // Navigation handlers
  const handlePrevDay = () => {
    const currentDay = parseInt(selectedDate.split('-')[2], 10);
    if (currentDay > 1) {
      setSelectedDate(`${yearMonth}-${String(currentDay - 1).padStart(2, '0')}`);
    }
  };

  const handleNextDay = () => {
    const currentDay = parseInt(selectedDate.split('-')[2], 10);
    if (currentDay < daysInMonth) {
      setSelectedDate(`${yearMonth}-${String(currentDay + 1).padStart(2, '0')}`);
    }
  };

  const handleToday = () => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (todayStr.startsWith(yearMonth)) {
      setSelectedDate(todayStr);
    } else {
      setSelectedDate(`${yearMonth}-05`);
    }
  };

  function getShiftRank(code = '') {
    const c = (code || '').toUpperCase().trim();
    if (c.startsWith('RF') || c === 'RT1M' || c === 'RT3M' || c === 'RT1H') return 10;
    if (c.startsWith('RT') && !c.includes('2') && !c.includes('4')) return 20;
    if (c === 'RTH') return 20;
    if (c.startsWith('RS') || c === 'RT2M' || c === 'RT4M' || c === 'RT2H') return 30;
    if (c.startsWith('RN')) return 40;
    if (['ACLS', 'PALS', 'SMT', 'RAJ'].some(k => c.includes(k))) return 50;
    if (['V030', 'VS30', 'V-B', 'V07', 'VFU', 'UDN'].some(k => c.includes(k))) return 60;
    return 70;
  }

  function getShiftGroupName(code = '') {
    const c = (code || '').toUpperCase().trim();
    if (c.startsWith('RF') || c === 'RT1M' || c === 'RT3M' || c === 'RT1H') return 'Frühdienst';
    if (c.startsWith('RT') && !c.includes('2') && !c.includes('4')) return 'Tagschicht';
    if (c === 'RTH') return 'Tagschicht';
    if (c.startsWith('RS') || c === 'RT2M' || c === 'RT4M' || c === 'RT2H') return 'Spätdienst';
    if (c.startsWith('RN')) return 'Nachtdienst';
    if (['ACLS', 'PALS', 'SMT', 'RAJ'].some(k => c.includes(k))) return 'Fortbildung';
    if (['V030', 'VS30', 'V-B', 'V07', 'VFU', 'UDN'].some(k => c.includes(k))) return 'Urlaub / Abwesend';
    return 'Sonderdienste';
  }

  // Filtered and sorted shifts for selected date
  const currentDayShifts = useMemo(() => {
    const raw = roster.shiftsByDate?.[selectedDate] || [];
    const filtered = raw.filter(shift => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        shift.name.toLowerCase().includes(q) ||
        shift.code.toLowerCase().includes(q)
      );
    });

    return [...filtered].sort((a, b) => {
      const rA = getShiftRank(a.code);
      const rB = getShiftRank(b.code);
      if (rA !== rB) return rA - rB;
      return a.name.localeCompare(b.name, 'de');
    });
  }, [roster, selectedDate, searchQuery]);

  // Formatted date string
  const formattedSelectedDate = useMemo(() => {
    try {
      const d = new Date(selectedDate + 'T12:00:00');
      return d.toLocaleDateString('de-DE', {
        weekday: 'short',
        day: 'numeric',
        month: 'short'
      });
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  // Handle File Upload (HTML, PDF or Image)
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setIsProcessing(true);
    setUploadProgress(15);

    try {
      let parsedRoster;

      // 1. HTML File (.html, .htm) -> 100% Precision directly from page DOM
      if (file.name.toLowerCase().endsWith('.html') || file.name.toLowerCase().endsWith('.htm') || file.type === 'text/html') {
        setUploadProgress(40);
        parsedRoster = await parseCareManHtml(file, p => {
          setUploadProgress(Math.min(95, 40 + Math.round(p * 0.55)));
        });
      } else if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        // 2. PDF File Upload
        setUploadProgress(30);
        parsedRoster = await parseCareManPdf(file, p => {
          setUploadProgress(Math.min(85, 30 + Math.round(p * 0.5)));
        });
      } else {
        // 3. Image / Screenshot Upload (OCR)
        setUploadProgress(25);
        const ocrText = await runTeamRosterOcr(file, progress => {
          setUploadProgress(Math.min(90, 25 + Math.round(progress * 0.7)));
        });
        parsedRoster = parseTeamRoster(ocrText, yearMonth);
      }

      setUploadProgress(100);
      setRoster(parsedRoster);
      saveActiveTeamRoster(parsedRoster);

      setIsUploadOpen(false);
      setIsProcessing(false);
      setUploadProgress(null);
      setToastMessage(`Dienstplan für ${parsedRoster.monthLabel} aktualisiert (${parsedRoster.totalShifts} Schichten)!`);
    } catch (err) {
      console.error('Upload Error:', err);
      setUploadError('Fehler beim Einlesen: ' + (err.message || 'Bitte prüfe das Dateiformat.'));
      setIsProcessing(false);
    }
  };

  // Handle direct Paste (HTML or Tab-separated table text)
  const handlePasteSubmit = async () => {
    if (!pasteText.trim()) return;
    setUploadError(null);
    setIsProcessing(true);
    setUploadProgress(30);

    try {
      const parsedRoster = await parseCareManHtml(pasteText, p => setUploadProgress(p));
      setUploadProgress(100);
      setRoster(parsedRoster);
      saveActiveTeamRoster(parsedRoster);

      setIsUploadOpen(false);
      setIsProcessing(false);
      setUploadProgress(null);
      setPasteText('');
      setIsPasteMode(false);
      setToastMessage(`Dienstplan für ${parsedRoster.monthLabel} übernommen (${parsedRoster.totalShifts} Schichten)!`);
    } catch (err) {
      console.error('Paste Error:', err);
      setUploadError('Fehler beim Einlesen: ' + (err.message || 'Bitte prüfe den kopierten Inhalt.'));
      setIsProcessing(false);
    }
  };

  return (
    <div className="team-roster-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 4000,
          background: '#10b981',
          color: 'white',
          padding: '10px 18px',
          borderRadius: '20px',
          fontSize: '13px',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <CheckCircle2 size={16} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header: Title & Upload Button */}
      <div className="team-roster-header">
        <h1 className="team-roster-title">
          <Users style={{ color: '#38bdf8' }} size={24} />
          <span>Wer hat Dienst?</span>
        </h1>

        <button
          type="button"
          onClick={() => setIsUploadOpen(true)}
          className="filter-chip"
          style={{
            background: 'rgba(14, 165, 233, 0.15)',
            color: '#38bdf8',
            borderColor: 'rgba(14, 165, 233, 0.3)',
            fontWeight: 600,
            padding: '7px 12px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer'
          }}
          title="Neuen Dienstplan laden"
        >
          <UploadCloud size={16} />
          <span>Plan laden</span>
        </button>
      </div>

      {/* Single-Row Date Stepper */}
      <div className="team-roster-stepper">
        <button
          type="button"
          onClick={handlePrevDay}
          className="team-roster-stepper-btn"
          title="Vorheriger Tag"
        >
          <ChevronLeft size={20} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text-main)' }}>
            {formattedSelectedDate}
          </span>
          <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
            • {currentDayShifts.length} im Dienst
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            type="button"
            onClick={handleToday}
            className="team-roster-today-btn"
          >
            Heute
          </button>
          <button
            type="button"
            onClick={handleNextDay}
            className="team-roster-stepper-btn"
            title="Nächster Tag"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Slim Search Input */}
      <div className="team-roster-search-box">
        <Search
          size={16}
          style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--color-text-muted)',
            pointerEvents: 'none'
          }}
        />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Kollege oder Kürzel suchen..."
          className="team-roster-search-input"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            style={{
              position: 'absolute',
              right: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'transparent',
              border: 'none',
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: '4px'
            }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Shifts List: Grouped & Sorted */}
      <div>
        {currentDayShifts.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '36px 16px',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: '16px'
          }}>
            <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', margin: 0 }}>
              {searchQuery
                ? `Keine Treffer für "${searchQuery}".`
                : 'Für diesen Tag sind keine Dienste eingetragen.'}
            </p>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  marginTop: '10px',
                  background: 'none',
                  border: 'none',
                  color: '#38bdf8',
                  fontSize: '13px',
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                Suche zurücksetzen
              </button>
            )}
          </div>
        ) : (
          <div className="team-roster-card">
            {currentDayShifts.map((shift, idx) => {
              const group = getShiftGroupName(shift.code);
              const prevGroup = idx > 0 ? getShiftGroupName(currentDayShifts[idx - 1].code) : null;
              const isNewGroup = group !== prevGroup;
              const colorInfo = getShiftColor('', shift.code);
              const isJohannes = shift.name.toLowerCase().includes('backhaus');

              return (
                <React.Fragment key={`${shift.name}-${idx}`}>
                  {isNewGroup && (
                    <div className="team-roster-group-header">
                      {group}
                    </div>
                  )}
                  <div className={`team-roster-row ${isJohannes ? 'is-user' : ''}`}>
                    {/* Colleague Name */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, paddingRight: '8px' }}>
                      <span style={{
                        fontSize: '14px',
                        fontWeight: isJohannes ? 700 : 500,
                        color: isJohannes ? '#38bdf8' : 'var(--color-text-main)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {shift.name}
                      </span>
                      {isJohannes && (
                        <span style={{
                          fontSize: '10px',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          background: '#0284c7',
                          color: 'white',
                          fontWeight: 800,
                          flexShrink: 0
                        }}>
                          Du
                        </span>
                      )}
                    </div>

                    {/* Shift Code Badge with Station Color */}
                    <span
                      className="team-roster-badge"
                      style={{
                        background: colorInfo.bg,
                        color: colorInfo.color,
                        borderColor: colorInfo.border
                      }}
                    >
                      {shift.code}
                    </span>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* Upload HTML / PDF / Screenshot Modal */}
      {isUploadOpen && (
        <div className="modal-overlay" style={{ alignItems: 'center', zIndex: 3000 }}>
          <div className="modal-content" style={{
            maxWidth: '460px',
            borderRadius: '24px',
            background: 'var(--color-surface)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.6)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Modal Header */}
            <div className="modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  background: 'rgba(14, 165, 233, 0.15)',
                  color: '#38bdf8',
                  borderRadius: '10px',
                  padding: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <UploadCloud size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: 'var(--color-text-main)' }}>
                    Dienstplan laden
                  </h3>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                    HTML (100% fehlerfrei), PDF oder Screenshot
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="close-btn"
                onClick={() => {
                  if (!isProcessing) {
                    setIsUploadOpen(false);
                    setUploadError(null);
                    setIsPasteMode(false);
                  }
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="modal-body" style={{ padding: '18px 20px' }}>
              {/* Tab Switcher */}
              <div style={{
                display: 'flex',
                background: 'rgba(15, 23, 42, 0.7)',
                padding: '4px',
                borderRadius: '12px',
                border: '1px solid var(--color-border)',
                marginBottom: '16px'
              }}>
                <button
                  type="button"
                  onClick={() => { setIsPasteMode(false); setUploadError(null); }}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: '8px',
                    border: !isPasteMode ? '1px solid rgba(14, 165, 233, 0.4)' : 'none',
                    background: !isPasteMode ? 'rgba(14, 165, 233, 0.2)' : 'transparent',
                    color: !isPasteMode ? '#38bdf8' : 'var(--color-text-muted)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <FileCode size={14} />
                  <span>Datei hochladen</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setIsPasteMode(true); setUploadError(null); }}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: '8px',
                    border: isPasteMode ? '1px solid rgba(14, 165, 233, 0.4)' : 'none',
                    background: isPasteMode ? 'rgba(14, 165, 233, 0.2)' : 'transparent',
                    color: isPasteMode ? '#38bdf8' : 'var(--color-text-muted)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Clipboard size={14} />
                  <span>Text einfügen</span>
                </button>
              </div>

              {!isPasteMode ? (
                /* File Dropzone Area */
                <div
                  onClick={() => !isProcessing && fileInputRef.current?.click()}
                  className="team-roster-modal-dropzone"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".html,.htm,text/html,application/pdf,image/*"
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                  />

                  <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
                    <FileCode size={28} style={{ color: '#10b981' }} />
                    <FileText size={28} style={{ color: '#38bdf8' }} />
                    <UploadCloud size={28} style={{ color: 'var(--color-text-muted)' }} />
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-main)', marginBottom: '8px' }}>
                    CareMan HTML-Datei auswählen
                  </div>

                  <div style={{
                    fontSize: '11px',
                    color: 'var(--color-text-muted)',
                    background: 'rgba(15, 23, 42, 0.8)',
                    borderRadius: '12px',
                    padding: '10px 12px',
                    border: '1px solid var(--color-border)',
                    textAlign: 'left',
                    lineHeight: '1.4'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981', fontWeight: 700, marginBottom: '4px' }}>
                      <CheckCircle2 size={14} />
                      <span>Empfehlung: Website als HTML speichern</span>
                    </div>
                    <span>
                      Auf der CareMan-Dienstplanseite im Browser einfach <strong>Cmd + S</strong> drücken, als <em>„Nur HTML“</em> abspeichern und hier wählen. 100% fehlerfreie Erkennung!
                    </span>
                  </div>
                </div>
              ) : (
                /* Direct Paste Area */
                <div>
                  <textarea
                    value={pasteText}
                    onChange={e => setPasteText(e.target.value)}
                    placeholder="Kopierten HTML-Quelltext oder markierte CareMan-Tabelle hier einfügen (Cmd + V)..."
                    rows={7}
                    className="input-premium"
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      resize: 'none',
                      marginBottom: '10px',
                      background: 'rgba(15, 23, 42, 0.8)'
                    }}
                    disabled={isProcessing}
                  />
                  <button
                    type="button"
                    disabled={isProcessing || !pasteText.trim()}
                    onClick={handlePasteSubmit}
                    className="btn-primary"
                    style={{
                      width: '100%',
                      background: '#0284c7',
                      color: 'white',
                      fontWeight: 600,
                      fontSize: '13px',
                      padding: '10px',
                      borderRadius: '10px',
                      cursor: 'pointer'
                    }}
                  >
                    Dienstplan einlesen
                  </button>
                </div>
              )}

              {/* Progress Indicator */}
              {isProcessing && (
                <div style={{ marginTop: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--color-text-main)', marginBottom: '6px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Sparkles size={14} style={{ color: '#38bdf8' }} />
                      Dienstplan wird eingelesen...
                    </span>
                    <span style={{ fontWeight: 700, color: '#38bdf8' }}>{uploadProgress}%</span>
                  </div>
                  <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${uploadProgress}%`,
                      height: '100%',
                      background: '#38bdf8',
                      transition: 'width 0.2s ease'
                    }} />
                  </div>
                </div>
              )}

              {/* Error Message */}
              {uploadError && (
                <div style={{
                  marginTop: '12px',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  <span>{uploadError}</span>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="modal-footer" style={{ justifyContent: 'flex-end', padding: '12px 20px' }}>
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => {
                  setIsUploadOpen(false);
                  setUploadError(null);
                  setIsPasteMode(false);
                }}
                className="btn-secondary"
                style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '10px' }}
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
