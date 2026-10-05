import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Users, ChevronLeft, ChevronRight, Search,
  UploadCloud, X, CheckCircle2, Sparkles, AlertCircle, FileText, FileCode, Clipboard, Copy, Bookmark
} from 'lucide-react';
import {
  getActiveTeamRoster,
  saveActiveTeamRoster,
  runTeamRosterOcr,
  parseTeamRoster
} from '../utils/teamRosterParser';
import { parseCareManPdf } from '../utils/teamRosterPdfParser';
import { parseCareManHtml } from '../utils/teamRosterHtmlParser';
import { getShiftColor, detectStation } from '../utils/shiftColors';

const SIEDA_EXTRACTOR_SCRIPT = `(() => {
  const urlDate = new URLSearchParams(window.location.search).get('date') || '';
  let year = 2026;
  let month = 11;
  if (urlDate) {
    const p = urlDate.split('-');
    if (p.length >= 2) {
      year = parseInt(p[0], 10);
      month = parseInt(p[1], 10);
    }
  }
  const monthNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const yearMonth = \`\${year}-\${String(month).padStart(2, '0')}\`;
  const monthLabel = \`\${monthNames[month - 1]} \${year}\`;

  const table = document.querySelector('table.mat-table') || document.querySelector('table');
  const headerRow = table?.querySelector('thead tr') || table?.querySelector('tr');
  const headers = Array.from(headerRow?.children || []).map(c => c.textContent.trim());

  const colToDay = new Map();
  headers.forEach((h, idx) => {
    const m = h.match(/(\\d+)/);
    if (m) {
      const d = parseInt(m[1], 10);
      if (d >= 1 && d <= 31) colToDay.set(idx, d);
    }
  });

  const rows = Array.from(document.querySelectorAll('tr')).filter(r => {
    const nameEl = r.querySelector('.employee-cell') || r.children[0];
    const txt = nameEl ? nameEl.textContent.trim() : '';
    return txt.includes(',') && !txt.match(/\\d{2,}/);
  });

  const colleagues = [];
  rows.forEach(r => {
    const nameEl = r.querySelector('.employee-cell') || r.children[0];
    const name = nameEl.textContent.trim();
    const cells = Array.from(r.children);
    const shifts = {};

    colToDay.forEach((dayNum, colIdx) => {
      if (colIdx < cells.length) {
        let code = cells[colIdx].textContent.trim().replace(/\\*+$/, '').trim().toUpperCase();
        if (code && code.length >= 2 && code !== '-' && code !== '/' && code !== '0') {
          const dateStr = \`\${yearMonth}-\${String(dayNum).padStart(2, '0')}\`;
          shifts[dateStr] = code;
        }
      }
    });

    if (Object.keys(shifts).length > 0) {
      colleagues.push({ name, shifts });
    }
  });

  const result = { yearMonth, monthLabel, colleagues };
  copy(JSON.stringify(result));
  alert(\`Erfolg! \${colleagues.length} Kollegen für \${monthLabel} kopiert. Jetzt in der Schichten-App einfügen!\`);
})();`;

const BOOKMARKLET_CODE = `javascript:(function(){try{var u=new URLSearchParams(window.location.search).get("date")||"";var y=2026,m=11;if(u){var p=u.split("-");if(p.length>=2){y=parseInt(p[0],10);m=parseInt(p[1],10);}}var mn=["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];var ym=y+"-"+(m<10?"0"+m:m);var ml=mn[m-1]+" "+y;var t=document.querySelector("table.mat-table")||document.querySelector("table");if(!t){return alert("Keine Dienstplan-Tabelle gefunden! Bitte stelle sicher, dass die Monatsansicht geöffnet ist.");}var hRow=t.querySelector("thead tr")||t.querySelector("tr");var headers=Array.from(hRow?hRow.children:[]).map(function(c){return c.textContent.trim();});var cd={};headers.forEach(function(x,i){var n=x.match(/\\d+/);if(n){var d=parseInt(n[0],10);if(d>=1&&d<=31)cd[i]=d;}});var rs=Array.from(document.querySelectorAll("tr")).filter(function(r){var e=r.querySelector(".employee-cell")||r.children[0];var tx=e?e.textContent.trim():"";return tx.indexOf(",")!==-1&&!tx.match(/\\d{2,}/);});var cols=[];rs.forEach(function(r){var e=r.querySelector(".employee-cell")||r.children[0];var nm=e.textContent.trim();var cs=Array.from(r.children);var sh={};Object.keys(cd).forEach(function(ci){var colIdx=parseInt(ci,10);if(colIdx<cs.length){var c=cs[colIdx].textContent.trim().replace(/\\*+$/,"").trim().toUpperCase();if(c&&c.length>=2&&c!=="-"&&c!=="/"&&c!=="0"){var dn=cd[colIdx];var dateStr=ym+"-"+(dn<10?"0"+dn:dn);sh[dateStr]=c;}}});if(Object.keys(sh).length>0)cols.push({name:nm,shifts:sh});});var json=JSON.stringify({yearMonth:ym,monthLabel:ml,colleagues:cols});var ta=document.createElement("textarea");ta.value=json;ta.style.position="fixed";ta.style.top="0";ta.style.left="0";ta.style.opacity="0";document.body.appendChild(ta);ta.focus();ta.select();var ok=false;try{ok=document.execCommand("copy");}catch(e){}document.body.removeChild(ta);if(!ok&&navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(json);}alert("✅ Erfolg! "+cols.length+" Kollegen für "+ml+" kopiert!\\n\\nJetzt in der Schichten-App einfügen.");}catch(err){alert("Fehler im Lesezeichen: "+err.message);}})();`;

export default function TeamRoster() {
  // Current active yearMonth (defaults to current date or October 2026)
  const [currentYearMonth, setCurrentYearMonth] = useState(() => {
    const today = new Date();
    const todayYM = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const stored = getActiveTeamRoster(todayYM);
    if (stored && !stored.isEmptyTemplate) return todayYM;
    return '2026-10';
  });

  // Active roster data
  const [roster, setRoster] = useState(() => getActiveTeamRoster(currentYearMonth));
  
  // Selected date
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const ym = roster?.yearMonth || currentYearMonth;
    if (todayStr.startsWith(ym)) return todayStr;
    return `${ym}-05`;
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStation, setSelectedStation] = useState('ALL'); // 'ALL' | 'Sendling' | 'Hohenbrunn' | 'Obersendling'
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedBookmarklet, setCopiedBookmarklet] = useState(false);

  // Upload modal state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [isPasteMode, setIsPasteMode] = useState(true); // Default to paste tab for SIEDA
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
  const yearMonth = roster.yearMonth || currentYearMonth;

  // Month navigation handlers
  const handlePrevMonth = () => {
    const [y, m] = yearMonth.split('-').map(Number);
    const prevDate = new Date(y, m - 2, 1);
    const prevYM = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    switchMonth(prevYM);
  };

  const handleNextMonth = () => {
    const [y, m] = yearMonth.split('-').map(Number);
    const nextDate = new Date(y, m, 1);
    const nextYM = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
    switchMonth(nextYM);
  };

  const switchMonth = (newYM) => {
    setCurrentYearMonth(newYM);
    const loaded = getActiveTeamRoster(newYM);
    setRoster(loaded);
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (todayStr.startsWith(newYM)) {
      setSelectedDate(todayStr);
    } else {
      setSelectedDate(`${newYM}-01`);
    }
  };

  // Day navigation handlers
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
      setSelectedDate(`${yearMonth}-01`);
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

  // Station Counts for the currently selected day
  const stationCounts = useMemo(() => {
    const raw = roster.shiftsByDate?.[selectedDate] || [];
    const counts = { ALL: raw.length, Sendling: 0, Hohenbrunn: 0, Obersendling: 0 };
    raw.forEach(s => {
      const st = detectStation({ code: s.code, station: s.station });
      if (counts[st] !== undefined) counts[st]++;
      else counts.Sendling++;
    });
    return counts;
  }, [roster, selectedDate]);

  // Filtered and sorted shifts for selected date
  const currentDayShifts = useMemo(() => {
    const raw = roster.shiftsByDate?.[selectedDate] || [];
    const filtered = raw.filter(shift => {
      // 1. Station filter
      if (selectedStation !== 'ALL') {
        const st = detectStation({ code: shift.code, station: shift.station });
        if (st !== selectedStation) return false;
      }

      // 2. Search query filter
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
  }, [roster, selectedDate, searchQuery, selectedStation]);

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

  const handleCopyScript = () => {
    navigator.clipboard.writeText(SIEDA_EXTRACTOR_SCRIPT);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 3000);
  };

  const handleCopyBookmarklet = () => {
    navigator.clipboard.writeText(BOOKMARKLET_CODE);
    setCopiedBookmarklet(true);
    setTimeout(() => setCopiedBookmarklet(false), 3000);
  };

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
      if (!selectedDate.startsWith(parsedRoster.yearMonth)) {
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        if (todayStr.startsWith(parsedRoster.yearMonth)) {
          setSelectedDate(todayStr);
        } else {
          setSelectedDate(`${parsedRoster.yearMonth}-01`);
        }
      }

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
      if (!selectedDate.startsWith(parsedRoster.yearMonth)) {
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        if (todayStr.startsWith(parsedRoster.yearMonth)) {
          setSelectedDate(todayStr);
        } else {
          setSelectedDate(`${parsedRoster.yearMonth}-01`);
        }
      }

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

      {/* Top Header: Title, Month Selector & Upload Button */}
      <div className="team-roster-header">
        <h1 className="team-roster-title">
          <Users style={{ color: '#38bdf8' }} size={24} />
          <span>Wer hat Dienst?</span>
        </h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Month Stepper */}
          <div className="team-roster-month-stepper">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="team-roster-month-btn"
              title="Vorheriger Monat"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="team-roster-month-label">
              {roster.monthLabel || yearMonth}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              className="team-roster-month-btn"
              title="Nächster Monat"
            >
              <ChevronRight size={16} />
            </button>
          </div>

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
            title="Dienstplan importieren"
          >
            <UploadCloud size={16} />
            <span>Plan laden</span>
          </button>
        </div>
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

      {/* Station Filter Chips: Alle Wachen, Sendling, Hohenbrunn, Obersendling */}
      <div className="team-roster-station-chips">
        <button
          type="button"
          onClick={() => setSelectedStation('ALL')}
          className={`team-roster-station-chip ${selectedStation === 'ALL' ? 'active' : ''}`}
        >
          Alle Wachen ({stationCounts.ALL})
        </button>
        <button
          type="button"
          onClick={() => setSelectedStation('Sendling')}
          className={`team-roster-station-chip ${selectedStation === 'Sendling' ? 'active' : ''}`}
        >
          Sendling ({stationCounts.Sendling})
        </button>
        <button
          type="button"
          onClick={() => setSelectedStation('Hohenbrunn')}
          className={`team-roster-station-chip ${selectedStation === 'Hohenbrunn' ? 'active' : ''}`}
        >
          Hohenbrunn ({stationCounts.Hohenbrunn})
        </button>
        <button
          type="button"
          onClick={() => setSelectedStation('Obersendling')}
          className={`team-roster-station-chip ${selectedStation === 'Obersendling' ? 'active' : ''}`}
        >
          Obersendling ({stationCounts.Obersendling})
        </button>
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
                  {/* SIEDA Helper Card: Bookmarklet + Copy Command */}
                  <div className="team-roster-helper-card">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#38bdf8' }}>
                        ⚡ 1-Klick Abgriff aus dem SIEDA-Portal
                      </span>
                    </div>

                    <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '0 0 10px 0', lineHeight: 1.4 }}>
                      Ziehe diesen Button mit der Maus in Deine Lesezeichenleiste. Wenn Du auf der Dienstplan-Seite bist, reicht <strong>ein einziger Klick</strong> darauf, um den Plan fehlerfrei zu kopieren:
                    </p>

                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                      <a
                        href={BOOKMARKLET_CODE}
                        className="team-roster-bookmarklet-link"
                        title="Mit der Maus in die Lesezeichenleiste ziehen"
                        onClick={e => {
                          e.preventDefault();
                          handleCopyBookmarklet();
                        }}
                      >
                        <Bookmark size={14} />
                        <span>{copiedBookmarklet ? 'Lesezeichen-Code kopiert! ✅' : '📋 Dienstplan kopieren (In Leiste ziehen)'}</span>
                      </a>

                      <button
                        type="button"
                        onClick={handleCopyBookmarklet}
                        className="team-roster-station-chip"
                        style={{ fontSize: '11px', padding: '6px 10px' }}
                        title="Lesezeichen-Code in die Zwischenablage kopieren (z.B. für Safari)"
                      >
                        <Copy size={13} />
                        <span>{copiedBookmarklet ? 'Lesezeichen kopiert! ✅' : 'Lesezeichen-Code kopieren'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleCopyScript}
                        className="team-roster-copy-code-btn"
                        title="JavaScript-Befehl für Entwickler-Konsole kopieren"
                      >
                        <Copy size={13} />
                        <span>{copiedScript ? 'Konsolen-Befehl kopiert! ✅' : 'Befehl für Konsole kopieren'}</span>
                      </button>
                    </div>

                    <div style={{ fontSize: '11px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle2 size={12} />
                      <span>Danach einfach unten in das Feld klicken, <strong>Cmd + V</strong> drücken und einlesen!</span>
                    </div>
                  </div>

                  <textarea
                    value={pasteText}
                    onChange={e => setPasteText(e.target.value)}
                    placeholder="Kopierten Dienstplan hier mit Cmd + V einfügen..."
                    rows={6}
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
