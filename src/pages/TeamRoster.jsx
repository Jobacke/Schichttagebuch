import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Users, ChevronLeft, ChevronRight, Search,
  UploadCloud, X, CheckCircle2, Sparkles, AlertCircle, AlertTriangle, FileText, FileCode, Clipboard, Copy, Bookmark,
  Calendar, Trash2, FolderOpen, Check, Cloud, RefreshCw, SlidersHorizontal
} from 'lucide-react';
import IosCalendarExportModal from '../components/IosCalendarExportModal';
import {
  getActiveTeamRoster,
  saveStationTeamRoster,
  getSavedRosterSummaries,
  deleteStationTeamRoster,
  deleteTeamRoster,
  detectRosterStation,
  ROSTER_STATIONS,
  runTeamRosterOcr,
  parseTeamRoster,
  saveStationTeamRosterToCloud,
  deleteStationTeamRosterFromCloud,
  deleteTeamRosterFromCloud,
  syncTeamRostersWithCloud,
  subscribeToCloudTeamRosters,
  getPartnersForShiftFromRoster,
  extractPersonalShiftsFromRoster
} from '../utils/teamRosterParser';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { buildShiftFromPreset, getPresetForCode } from '../utils/shiftPresets';
import { parseCareManPdf } from '../utils/teamRosterPdfParser';
import { parseCareManHtml } from '../utils/teamRosterHtmlParser';
import { getShiftColor, detectStation, STATION_THEMES } from '../utils/shiftColors';

const SIEDA_EXTRACTOR_SCRIPT = `(() => {
  let year = 2026;
  let month = 10;
  const urlMatch = window.location.href.match(/date=(\\d{4})-(\\d{1,2})/);
  if (urlMatch) {
    year = parseInt(urlMatch[1], 10);
    month = parseInt(urlMatch[2], 10);
  } else {
    const monthNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
    const pageText = document.body ? document.body.innerText : '';
    const textMatch = pageText.match(/(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\\s+(\\d{4})/i);
    if (textMatch) {
      const idx = monthNames.findIndex(m => m.toLowerCase() === textMatch[1].toLowerCase());
      if (idx !== -1) {
        month = idx + 1;
        year = parseInt(textMatch[2], 10);
      }
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
  let mCount = 0, oCount = 0, hCount = 0;

  rows.forEach(r => {
    const nameEl = r.querySelector('.employee-cell') || r.children[0];
    const name = nameEl.textContent.trim();
    const cells = Array.from(r.children);
    const shifts = {};

    let asteriskCount = 0;
    colToDay.forEach((dayNum, colIdx) => {
      if (colIdx < cells.length) {
        const cell = cells[colIdx];
        const rawText = (cell.innerText || cell.textContent || '').trim();
        const textWithoutSpace = rawText.replace(/\\s+/g, '').toUpperCase();
        const hasAsterisk = textWithoutSpace.includes('*') ||
          Boolean(cell.innerHTML && cell.innerHTML.includes('*')) ||
          Boolean(cell.getAttribute('title') && cell.getAttribute('title').includes('*')) ||
          Boolean(cell.getAttribute('aria-label') && cell.getAttribute('aria-label').includes('*')) ||
          Boolean(cell.querySelector('[matbadge], .mat-badge, .mat-badge-content, [class*="star"], [class*="asterisk"]'));

        const baseCode = textWithoutSpace.replace(/[^A-Z0-9\\-]/g, '');
        if (baseCode && baseCode.length >= 2 && baseCode !== 'FREI' && baseCode !== '00') {
          const finalCode = hasAsterisk ? \`\${baseCode}*\` : baseCode;
          if (hasAsterisk) asteriskCount++;
          const dateStr = \`\${yearMonth}-\${String(dayNum).padStart(2, '0')}\`;
          shifts[dateStr] = finalCode;
          if (baseCode.endsWith('M') || baseCode.includes('-M') || ['RFM', 'RSM', 'RNM', 'RT1M', 'RT2M', 'RT3M', 'RT4M', 'RS2M', 'RCM', 'RHM', 'DDM'].includes(baseCode)) mCount++;
          else if (baseCode.endsWith('O') || baseCode === 'RFO' || baseCode === 'RSO' || baseCode.startsWith('NFO') || baseCode.startsWith('FFO')) oCount++;
          else if (baseCode.endsWith('H') || baseCode.includes('HBN') || ['RFH', 'RTH', 'RT1H', 'RT2H', 'RSH', 'RNH', 'RHH'].includes(baseCode)) hCount++;
        }
      }
    });

    if (Object.keys(shifts).length > 0) {
      colleagues.push({ name, shifts });
    }
  });

  let station = 'Sendling';
  if (oCount > mCount && oCount > hCount) station = 'Obersendling';
  else if (hCount > mCount && hCount > oCount) station = 'Hohenbrunn';

  const result = { yearMonth, monthLabel, station, colleagues };
  copy(JSON.stringify(result));
  alert(\`✅ Erfolg! \${colleagues.length} Kollegen für \${monthLabel} (Wache \${station}) kopiert!\\n(Dienste mit Sonderkürzel *: \${asteriskCount})\\n\\nJetzt in der Schichten-App einfügen.\`);
})();`;

const BOOKMARKLET_CODE = `javascript:(function(){try{var y=2026,m=10;var um=window.location.href.match(/date=(\\d{4})-(\\d{1,2})/);if(um){y=parseInt(um[1],10);m=parseInt(um[2],10);}else{var mn=["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];var tx=document.body?document.body.innerText:"";var tm=tx.match(/(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\\s+(\\d{4})/i);if(tm){var fi=mn.findIndex(function(x){return x.toLowerCase()===tm[1].toLowerCase();});if(fi!==-1){m=fi+1;y=parseInt(tm[2],10);}}}var mn=["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];var ym=y+"-"+(m<10?"0"+m:m);var ml=mn[m-1]+" "+y;var t=document.querySelector("table.mat-table")||document.querySelector("table");if(!t){return alert("Keine Dienstplan-Tabelle gefunden! Bitte stelle sicher, dass die Monatsansicht geöffnet ist.");}var hRow=t.querySelector("thead tr")||t.querySelector("tr");var headers=Array.from(hRow?hRow.children:[]).map(function(c){return c.textContent.trim();});var cd={};headers.forEach(function(x,i){var n=x.match(/\\d+/);if(n){var d=parseInt(n[0],10);if(d>=1&&d<=31)cd[i]=d;}});var rs=Array.from(document.querySelectorAll("tr")).filter(function(r){var e=r.querySelector(".employee-cell")||r.children[0];var tx=e?e.textContent.trim():"";return tx.indexOf(",")!==-1&&!tx.match(/\\d{2,}/);});var cols=[];var mc=0,oc=0,hc=0,ac=0;rs.forEach(function(r){var e=r.querySelector(".employee-cell")||r.children[0];var nm=e.textContent.trim();var cs=Array.from(r.children);var sh={};Object.keys(cd).forEach(function(ci){var colIdx=parseInt(ci,10);if(colIdx<cs.length){var cl=cs[colIdx];var rt=(cl.innerText||cl.textContent||"").trim();var tw=rt.replace(/\\s+/g,"").toUpperCase();var ha=tw.indexOf("*")!==-1||(cl.innerHTML&&cl.innerHTML.indexOf("*")!==-1)||(cl.getAttribute("title")&&cl.getAttribute("title").indexOf("*")!==-1)||(cl.getAttribute("aria-label")&&cl.getAttribute("aria-label").indexOf("*")!==-1)||Boolean(cl.querySelector("[matbadge],.mat-badge,.mat-badge-content,[class*='star'],[class*='asterisk']"));var bc=tw.replace(/[^A-Z0-9\\-]/g,"");if(bc&&bc.length>=2&&bc!=="FREI"&&bc!=="00"){var fc=ha?(bc+"*"):bc;if(ha)ac++;var dn=cd[colIdx];var dateStr=ym+"-"+(dn<10?"0"+dn:dn);sh[dateStr]=fc;if(bc.endsWith("M")||bc.indexOf("-M")!==-1)mc++;else if(bc.endsWith("O")||bc==="FFO"||bc==="NFO")oc++;else if(bc.endsWith("H")||["RFH","RTH","RT1H","RT2H","RSH","RNH","RHH"].indexOf(bc)!==-1)hc++;}}});if(Object.keys(sh).length>0)cols.push({name:nm,shifts:sh});});var st="Sendling";if(oc>mc&&oc>hc)st="Obersendling";else if(hc>mc&&hc>oc)st="Hohenbrunn";var json=JSON.stringify({yearMonth:ym,monthLabel:ml,station:st,colleagues:cols});var ta=document.createElement("textarea");ta.value=json;ta.style.position="fixed";ta.style.top="0";ta.style.left="0";ta.style.opacity="0";document.body.appendChild(ta);ta.focus();ta.select();var ok=false;try{ok=document.execCommand("copy");}catch(e){}document.body.removeChild(ta);if(!ok&&navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(json);}alert("✅ Erfolg! "+cols.length+" Kollegen für "+ml+" (Wache "+st+") kopiert!\\n(Dienste mit Sonderkürzel *: "+ac+")\\n\\nJetzt in der Schichten-App einfügen.");}catch(err){alert("Fehler im Lesezeichen: "+err.message);}})();`;

export default function TeamRoster() {
  const { currentUser } = useAuth();
  const { store, addShifts, ensureCodesAndTypes } = useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [isSyncingPersonal, setIsSyncingPersonal] = useState(false);
  const [isCalendarExportModalOpen, setIsCalendarExportModalOpen] = useState(() => searchParams.get('openCalendarExport') === '1');
  const [calendarJustCleared, setCalendarJustCleared] = useState(() => searchParams.get('cleared') === '1');

  // Stored rosters list
  const [savedRosters, setSavedRosters] = useState(() => getSavedRosterSummaries());

  // Current active yearMonth (defaults to URL param, saved user choice or October 2026)
  const [currentYearMonth, setCurrentYearMonth] = useState(() => {
    const paramMonth = searchParams.get('month');
    if (paramMonth && /^\d{4}-\d{2}$/.test(paramMonth)) return paramMonth;
    const saved = localStorage.getItem('schichten_selected_year_month');
    if (saved) {
      const r = getActiveTeamRoster(saved);
      if (r && !r.isEmptyTemplate) return saved;
    }
    const today = new Date();
    const todayYM = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const stored = getActiveTeamRoster(todayYM);
    if (stored && !stored.isEmptyTemplate) return todayYM;
    return '2026-10';
  });

  // Active roster data
  const [roster, setRoster] = useState(() => getActiveTeamRoster(currentYearMonth));

  // Auto-sync with Firebase Cloud Firestore on login and listen for changes
  useEffect(() => {
    if (!currentUser) return;

    // 1. Initial bidirectional synchronization
    syncTeamRostersWithCloud(currentUser)
      .then(() => {
        setSavedRosters(getSavedRosterSummaries());
        setRoster(getActiveTeamRoster(currentYearMonth));
      })
      .catch(err => {
        console.error('Initial team roster cloud sync failed:', err);
      });

    // 2. Real-time listener for rosters updated on other devices (e.g. Mac <-> iPhone)
    const unsubscribe = subscribeToCloudTeamRosters(currentUser, () => {
      setSavedRosters(getSavedRosterSummaries());
      setRoster(getActiveTeamRoster(currentYearMonth));
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [currentUser, currentYearMonth]);

  const handleManualCloudSync = async () => {
    if (!currentUser) {
      setToastMessage('Bitte zuerst anmelden für die Cloud-Synchronisation.');
      return;
    }
    setCloudSyncing(true);
    try {
      const res = await syncTeamRostersWithCloud(currentUser);
      setSavedRosters(getSavedRosterSummaries());
      setRoster(getActiveTeamRoster(currentYearMonth));
      setToastMessage(`☁️ Cloud synchronisiert: ${res.totalCloud || 0} Pläne bereit!`);
    } catch (err) {
      console.error('Manual sync failed:', err);
      setToastMessage('Fehler bei der Cloud-Synchronisation.');
    } finally {
      setCloudSyncing(false);
    }
  };
  
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
  const [selectedShiftGroup, setSelectedShiftGroup] = useState('ALL'); // 'ALL' | 'Frühdienst' | 'Tagschicht' | 'Spätdienst' | 'Nachtdienst' | 'Sonderdienste' | 'Fortbildung' | 'Urlaub / Abwesend'
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showJumpModal, setShowJumpModal] = useState(false);
  const [uploadStationOverride, setUploadStationOverride] = useState('AUTO'); // 'AUTO' | 'Sendling' | 'Obersendling' | 'Hohenbrunn'
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedBookmarklet, setCopiedBookmarklet] = useState(false);

  // Upload modal state: activeModalTab can be 'paste' | 'file' | 'saved'
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [activeModalTab, setActiveModalTab] = useState('paste');
  const [uploadProgress, setUploadProgress] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
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

  const switchMonth = (newYM, targetDate = null) => {
    setCurrentYearMonth(newYM);
    localStorage.setItem('schichten_selected_year_month', newYM);
    const loaded = getActiveTeamRoster(newYM);
    setRoster(loaded);
    if (targetDate) {
      setSelectedDate(targetDate);
    } else {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      if (todayStr.startsWith(newYM)) {
        setSelectedDate(todayStr);
      } else {
        setSelectedDate(`${newYM}-01`);
      }
    }
  };

  const handleDeleteStationRoster = (ym, st) => {
    if (window.confirm(`Dienstplan für ${ym} (Wache ${st}) wirklich löschen?`)) {
      deleteStationTeamRoster(ym, st);
      if (currentUser) {
        deleteStationTeamRosterFromCloud(ym, st, currentUser).catch(err => {
          console.error('Cloud delete failed:', err);
        });
      }
      const updated = getSavedRosterSummaries();
      setSavedRosters(updated);
      setRoster(getActiveTeamRoster(currentYearMonth));
      setToastMessage(`Dienstplan für Wache ${st} gelöscht.`);
    }
  };

  const handleDeleteMonthRoster = (ym) => {
    if (window.confirm(`Alle Dienstpläne für ${ym} (alle Wachen) wirklich löschen?`)) {
      deleteTeamRoster(ym);
      if (currentUser) {
        deleteTeamRosterFromCloud(ym, currentUser).catch(err => {
          console.error('Cloud delete failed:', err);
        });
      }
      const updated = getSavedRosterSummaries();
      setSavedRosters(updated);
      if (currentYearMonth === ym) {
        const fallback = updated[0]?.yearMonth || '2026-10';
        switchMonth(fallback);
      }
      setToastMessage(`Dienstpläne für ${ym} gelöscht.`);
    }
  };

  // Day navigation handlers
  const handlePrevDay = () => {
    const currentDay = parseInt(selectedDate.split('-')[2], 10);
    if (currentDay > 1) {
      setSelectedDate(`${yearMonth}-${String(currentDay - 1).padStart(2, '0')}`);
    } else {
      const [y, m] = yearMonth.split('-').map(Number);
      const prevDate = new Date(y, m - 1, 0); // last day of prev month
      const prevYM = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
      const lastDayStr = `${prevYM}-${String(prevDate.getDate()).padStart(2, '0')}`;
      switchMonth(prevYM, lastDayStr);
    }
  };

  const handleNextDay = () => {
    const currentDay = parseInt(selectedDate.split('-')[2], 10);
    if (currentDay < daysInMonth) {
      setSelectedDate(`${yearMonth}-${String(currentDay + 1).padStart(2, '0')}`);
    } else {
      const [y, m] = yearMonth.split('-').map(Number);
      const nextDate = new Date(y, m, 1);
      const nextYM = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
      const firstDayStr = `${nextYM}-01`;
      switchMonth(nextYM, firstDayStr);
    }
  };

  const handleToday = () => {
    const today = new Date();
    const todayYM = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const todayStr = `${todayYM}-${String(today.getDate()).padStart(2, '0')}`;
    if (yearMonth !== todayYM) {
      switchMonth(todayYM, todayStr);
    } else {
      setSelectedDate(todayStr);
    }
  };

  function getShiftRank(code = '') {
    const c = (code || '').toUpperCase().trim().replace(/\*+$/, '');
    if (c.startsWith('RF') || c === 'RT1M' || c === 'RT3M' || c === 'RT1H') return 10;
    if (c.startsWith('RT') && !c.includes('2') && !c.includes('4')) return 20;
    if (c === 'RTH') return 20;
    if (c.startsWith('RS') || c === 'RT2M' || c === 'RT4M' || c === 'RT2H') return 30;
    if (c.startsWith('RN')) return 40;
    if (['ACLS', 'PALS', 'SMT', 'RAJ', 'PRX'].some(k => c.includes(k))) return 50;
    if (['V030', 'VS30', 'V-B', 'V07', 'VFU', 'UDN'].some(k => c.includes(k))) return 60;
    return 70;
  }

  function getShiftCodeSortPriority(code = '') {
    const c = (code || '').toUpperCase().trim().replace(/\*+$/, '');

    // 1. Frühdienste (06:00 / 06:30 / 07:00)
    if (c === 'RFM') return 100;
    if (c === 'RFH') return 102;
    if (c === 'RFO' || c === 'FFO') return 104;
    if (c.startsWith('RF')) return 106;

    if (c === 'RT1M') return 110;
    if (c === 'RT1H') return 112;
    if (c === 'RT1O') return 114;
    if (c.startsWith('RT1')) return 116;

    if (c === 'RT3M') return 120;
    if (c === 'RT3H') return 122;
    if (c.startsWith('RT3')) return 124;

    // 2. Tagschichten
    if (c === 'RTM') return 200;
    if (c === 'RTH') return 202;
    if (c === 'RHH') return 204;
    if (c === 'DDM') return 210;
    if (c === 'ID2') return 220;
    if (c === 'BDR') return 230;
    if (c === 'RCM') return 240;

    // 3. Spätdienste
    if (c === 'RT2M') return 300;
    if (c === 'RT2H') return 302;
    if (c.startsWith('RT2')) return 304;

    // 3. Spätdienste Forts.
    if (c === 'RT4M') return 310;
    if (c === 'RT4H') return 312;
    if (c.startsWith('RT4')) return 314;

    if (c === 'RSM') return 320;
    if (c === 'RSH') return 322;
    if (c === 'RSO') return 324;
    if (c === 'RS2M') return 326;
    if (c === 'RS4') return 328;
    if (c.startsWith('RS')) return 330;

    // 4. Nachtdienste
    if (c === 'RNM') return 400;
    if (c === 'RNH') return 402;
    if (c === 'RNO' || c === 'NFO') return 404;
    if (c.startsWith('RN')) return 406;

    // 5. Sonderdienste
    if (c === 'S24') return 500;
    if (c === 'SW1') return 510;
    if (c === 'RZF') return 520;
    if (c === 'R-SAN') return 530;
    if (c === 'F-M' || c === 'C-M' || c === 'R-M') return 540;

    // 6. Fortbildung
    if (c === 'ACLS') return 600;
    if (c === 'PALS') return 610;
    if (c === 'SMT') return 620;
    if (c === 'RAJ') return 630;
    if (c === 'PRX') return 640;

    // 7. Abwesenheit / Urlaub
    if (c === 'VS30' || c === 'V030') return 700;
    if (c === 'V-B') return 710;
    if (c === 'V07' || c === 'V07-B' || c === 'V07-b') return 720;
    if (c === 'VFU') return 730;
    if (c === 'UDN') return 740;
    if (c.startsWith('V')) return 750;

    return 800;
  }

  function getShiftGroupName(code = '') {
    const c = (code || '').toUpperCase().trim().replace(/\*+$/, '');
    if (c.startsWith('RF') || c === 'RT1M' || c === 'RT3M' || c === 'RT1H') return 'Frühdienst';
    if (c.startsWith('RT') && !c.includes('2') && !c.includes('4')) return 'Tagschicht';
    if (c === 'RTH') return 'Tagschicht';
    if (c.startsWith('RS') || c === 'RT2M' || c === 'RT4M' || c === 'RT2H') return 'Spätdienst';
    if (c.startsWith('RN')) return 'Nachtdienst';
    if (['ACLS', 'PALS', 'SMT', 'RAJ', 'PRX'].some(k => c.includes(k))) return 'Fortbildung';
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
  // Sorted strictly by shift code hierarchy, and secondarily by colleague name
  const currentDayShifts = useMemo(() => {
    const raw = roster.shiftsByDate?.[selectedDate] || [];
    const filtered = raw.filter(shift => {
      // 1. Station filter
      if (selectedStation !== 'ALL') {
        const st = detectStation({ code: shift.code, station: shift.station });
        if (st !== selectedStation) return false;
      }

      // 2. Shift group filter
      if (selectedShiftGroup !== 'ALL') {
        if (getShiftGroupName(shift.code) !== selectedShiftGroup) return false;
      }

      // 3. Search query filter
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        shift.name.toLowerCase().includes(q) ||
        shift.code.toLowerCase().includes(q)
      );
    });

    return [...filtered].sort((a, b) => {
      // 1. Schichtgruppen-Rang (Frühdienst -> Tagschicht -> Spätdienst -> Nachtdienst etc.)
      const rA = getShiftRank(a.code);
      const rB = getShiftRank(b.code);
      if (rA !== rB) return rA - rB;

      // 2. Rettungsschichtkürzel-Priorität (RFM vor RT1M vor RT3M; RT2M vor RT4M vor RSM; RNM vor RNH etc.)
      const pA = getShiftCodeSortPriority(a.code);
      const pB = getShiftCodeSortPriority(b.code);
      if (pA !== pB) return pA - pB;

      // 3. Alphabetischer Schichtcode
      const codeComp = a.code.localeCompare(b.code);
      if (codeComp !== 0) return codeComp;

      // 4. Kollegenname alphabetisch (bei identischem Schichtkürzel)
      return a.name.localeCompare(b.name, 'de');
    });
  }, [roster, selectedDate, searchQuery, selectedStation, selectedShiftGroup]);

  // Staffing Analysis: Jedes reguläre Schichtkürzel ohne '*' muss mindestens 2x vorkommen
  const staffingAnalysis = useMemo(() => {
    const raw = roster.shiftsByDate?.[selectedDate] || [];
    const shiftsToCheck = selectedStation === 'ALL'
      ? raw
      : raw.filter(s => detectStation({ code: s.code, station: s.station }) === selectedStation);

    const regularCounts = {}; // baseCode -> Anzahl regulär besetzt (ohne '*')
    const starCounts = {};    // baseCode -> Anzahl mit '*' (Zusatzkraft/3. Person)
    const colleaguesByCode = {}; // baseCode -> Array von Kollegennamen

    shiftsToCheck.forEach(shift => {
      const fullCode = (shift.code || '').trim();
      if (!fullCode || fullCode === '/' || fullCode === 'FREI' || fullCode === '00' || fullCode === '-') return;

      const baseCode = fullCode.replace(/\*+$/, '').trim().toUpperCase();
      const hasAsterisk = fullCode.includes('*');

      // Abwesenheiten (Urlaub) und Fortbildung ausschließen
      const group = getShiftGroupName(baseCode);
      if (group === 'Urlaub / Abwesend' || group === 'Fortbildung') return;
      if (baseCode.startsWith('V') || baseCode.startsWith('U') || baseCode === 'KRANK') return;

      if (hasAsterisk) {
        starCounts[baseCode] = (starCounts[baseCode] || 0) + 1;
      } else {
        regularCounts[baseCode] = (regularCounts[baseCode] || 0) + 1;
        if (!colleaguesByCode[baseCode]) colleaguesByCode[baseCode] = [];
        colleaguesByCode[baseCode].push(shift.name);
      }
    });

    const allRelevantCodes = new Set([
      ...Object.keys(regularCounts),
      ...Object.keys(starCounts)
    ]);

    const understaffed = [];
    const fullyStaffed = [];
    const understaffedCodes = new Set();

    allRelevantCodes.forEach(code => {
      const count = regularCounts[code] || 0;
      const stars = starCounts[code] || 0;
      const item = {
        code,
        count,
        stars,
        missing: Math.max(0, 2 - count),
        colleagues: colleaguesByCode[code] || [],
        group: getShiftGroupName(code),
        station: detectStation({ code })
      };

      if (count < 2) {
        understaffed.push(item);
        understaffedCodes.add(code);
      } else {
        fullyStaffed.push(item);
      }
    });

    // Sortierung nach Schichtrang und Priorität
    understaffed.sort((a, b) => {
      const rA = getShiftRank(a.code);
      const rB = getShiftRank(b.code);
      if (rA !== rB) return rA - rB;
      const pA = getShiftCodeSortPriority(a.code);
      const pB = getShiftCodeSortPriority(b.code);
      if (pA !== pB) return pA - pB;
      return a.code.localeCompare(b.code);
    });

    return {
      totalEvaluated: allRelevantCodes.size,
      understaffed,
      fullyStaffed,
      understaffedCodes,
      hasUnderstaffed: understaffed.length > 0
    };
  }, [roster, selectedDate, selectedStation]);

  // All displayable months (combining saved plans with currently viewed month)
  const allDisplayMonths = useMemo(() => {
    const map = new Map();
    savedRosters.forEach(r => map.set(r.yearMonth, r));
    if (!map.has(yearMonth)) {
      const [y, m] = yearMonth.split('-').map(Number);
      const mNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
      map.set(yearMonth, {
        yearMonth,
        monthLabel: `${mNames[m - 1]} ${y}`,
        totalColleagues: 0,
        totalShifts: 0,
        hasData: false
      });
    }
    return Array.from(map.values()).sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
  }, [savedRosters, yearMonth]);

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

  // Sync URL query params when returning from iOS Shortcut (?month=YYYY-MM&openCalendarExport=1&cleared=1)
  useEffect(() => {
    const paramMonth = searchParams.get('month');
    if (paramMonth && /^\d{4}-\d{2}$/.test(paramMonth) && paramMonth !== currentYearMonth) {
      setCurrentYearMonth(paramMonth);
      localStorage.setItem('schichten_selected_year_month', paramMonth);
      setRoster(getActiveTeamRoster(paramMonth));
    }
    if (searchParams.get('openCalendarExport') === '1') {
      setIsCalendarExportModalOpen(true);
      if (searchParams.get('cleared') === '1') {
        setCalendarJustCleared(true);
      }
    }
  }, [searchParams]);

  // Personal shifts for Backhaus, Johannes in the currently viewed month
  const myRosterShifts = useMemo(() => {
    return extractPersonalShiftsFromRoster(yearMonth, roster);
  }, [yearMonth, roster]);

  // Shifts prepared for the iOS Calendar Export Modal (uses Journal shifts if already transferred, or builds from Team Roster)
  const calendarExportShifts = useMemo(() => {
    const journalMonthShifts = (store?.shifts || []).filter(s => s.date && s.date.startsWith(yearMonth));
    if (journalMonthShifts.length > 0) {
      return journalMonthShifts.map(s => {
        const codeObj = (store?.settings?.shiftCodes || []).find(c => c.id === s.codeId || c.code === s.code);
        const codeStr = s.code || codeObj?.code || '';
        const detectedPartner = codeStr ? getPartnersForShiftFromRoster(s.date, codeStr, roster) : '';
        return {
          ...s,
          partner: s.partner || detectedPartner || ''
        };
      });
    }

    return myRosterShifts.map(s => {
      const partnerStr = s.partner || getPartnersForShiftFromRoster(s.date, s.code, roster) || '';
      const base = buildShiftFromPreset({
        dateStr: s.date,
        code: s.code,
        partner: partnerStr,
        storeSettings: store?.settings
      });
      return {
        ...base,
        id: `shift_${s.date}_${s.code}`,
        startTime: s.startTime || base.startTime,
        endTime: s.endTime || base.endTime,
        partner: partnerStr
      };
    });
  }, [store?.shifts, store?.settings, yearMonth, myRosterShifts, roster]);

  // Automatically update partner field ("mit ...") on existing shifts in Journal for a given month
  const autoSyncExistingJournalPartners = async (targetYearMonth, activeRoster) => {
    if (!store?.shifts || !addShifts || !targetYearMonth) return 0;
    const monthShifts = store.shifts.filter(s => s.date && s.date.startsWith(targetYearMonth));
    if (monthShifts.length === 0) return 0;

    const toUpdate = [];
    monthShifts.forEach(s => {
      const codeObj = (store.settings?.shiftCodes || []).find(c => c.id === s.codeId || c.code === s.code);
      const codeStr = s.code || codeObj?.code || '';
      if (!codeStr) return;
      const detectedPartner = getPartnersForShiftFromRoster(s.date, codeStr, activeRoster);
      if (detectedPartner && s.partner !== detectedPartner) {
        toUpdate.push({
          ...s,
          partner: detectedPartner
        });
      }
    });

    if (toUpdate.length > 0) {
      await addShifts(toUpdate, false);
    }
    return toUpdate.length;
  };

  // 1-Click: Transfer personal shifts (including automatic "mit ..." PartnerIn) into Journal
  const handleTransferPersonalScheduleToJournal = async () => {
    if (myRosterShifts.length === 0 || isSyncingPersonal) return;
    setIsSyncingPersonal(true);
    try {
      const requiredCodes = [];
      const requiredTypes = [];

      myRosterShifts.forEach(s => {
        const preset = s.preset || getPresetForCode(s.code);
        if (s.code) {
          requiredCodes.push({ code: s.code, hours: preset?.hours || 8.2 });
        }
        if (preset?.shiftTypeName) {
          requiredTypes.push({ name: preset.shiftTypeName });
        }
      });

      if (ensureCodesAndTypes) {
        await ensureCodesAndTypes(requiredCodes, requiredTypes);
      }

      const newShifts = myRosterShifts.map(s => {
        const partnerStr = s.partner || getPartnersForShiftFromRoster(s.date, s.code, roster) || '';
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

      const ok = await addShifts(newShifts, true);
      if (ok) {
        const withPartners = newShifts.filter(s => s.partner).length;
        setToastMessage(
          `✅ ${newShifts.length} eigene Dienste für ${roster.monthLabel} ins Journal übernommen (${withPartners}x PartnerIn „mit ...“ automatisch eingetragen)!`
        );
      }
    } catch (err) {
      console.error('Error transferring personal schedule:', err);
    } finally {
      setIsSyncingPersonal(false);
    }
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
      const targetStation = uploadStationOverride !== 'AUTO' ? uploadStationOverride : (parsedRoster.station || detectRosterStation(parsedRoster));
      saveStationTeamRoster(parsedRoster, targetStation);
      if (currentUser) {
        saveStationTeamRosterToCloud(parsedRoster, targetStation, currentUser).catch(err => {
          console.error('Cloud save failed:', err);
        });
      }
      setCurrentYearMonth(parsedRoster.yearMonth);
      localStorage.setItem('schichten_selected_year_month', parsedRoster.yearMonth);
      const activeCombined = getActiveTeamRoster(parsedRoster.yearMonth);
      setRoster(activeCombined);
      setSavedRosters(getSavedRosterSummaries());

      // Automatically sync partner names ("mit ...") onto any existing Journal shifts in this month
      const updatedPartnerCount = await autoSyncExistingJournalPartners(parsedRoster.yearMonth, activeCombined);

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
      setToastMessage(
        `Dienstplan für ${parsedRoster.monthLabel} (Wache ${targetStation}) gespeichert (${parsedRoster.totalShifts} Schichten${updatedPartnerCount > 0 ? `, ${updatedPartnerCount}x PartnerIn im Journal ergänzt` : ''})!`
      );
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
      const targetStation = uploadStationOverride !== 'AUTO' ? uploadStationOverride : (parsedRoster.station || detectRosterStation(parsedRoster));
      saveStationTeamRoster(parsedRoster, targetStation);
      if (currentUser) {
        saveStationTeamRosterToCloud(parsedRoster, targetStation, currentUser).catch(err => {
          console.error('Cloud save failed:', err);
        });
      }
      setCurrentYearMonth(parsedRoster.yearMonth);
      localStorage.setItem('schichten_selected_year_month', parsedRoster.yearMonth);
      const activeCombined = getActiveTeamRoster(parsedRoster.yearMonth);
      setRoster(activeCombined);
      setSavedRosters(getSavedRosterSummaries());

      // Automatically sync partner names ("mit ...") onto any existing Journal shifts in this month
      const updatedPartnerCount = await autoSyncExistingJournalPartners(parsedRoster.yearMonth, activeCombined);

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
      setActiveModalTab('paste');
      setToastMessage(
        `Dienstplan für ${parsedRoster.monthLabel} (Wache ${targetStation}) übernommen (${parsedRoster.totalShifts} Schichten${updatedPartnerCount > 0 ? `, ${updatedPartnerCount}x PartnerIn im Journal ergänzt` : ''})!`
      );
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
          {/* Month Stepper with Interactive Month Picker */}
          <div className="team-roster-month-stepper">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="team-roster-month-btn"
              title="Vorheriger Monat"
            >
              <ChevronLeft size={16} />
            </button>
            <select
              value={yearMonth}
              onChange={e => switchMonth(e.target.value)}
              className="team-roster-month-select"
              title="Monat auswählen"
            >
              {allDisplayMonths.map(m => (
                <option key={m.yearMonth} value={m.yearMonth}>
                  {m.monthLabel} {m.hasData ? `(${m.totalColleagues} Kollege${m.totalColleagues === 1 ? '' : 'n'})` : ''}
                </option>
              ))}
            </select>
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

      {/* Single-Row Date Stepper (Click on Date = Jump Modal, Filter Button integrated) */}
      {(() => {
        const hasSearch = Boolean(searchQuery.trim());
        const hasTeamFilter = selectedStation !== 'ALL' || selectedShiftGroup !== 'ALL' || hasSearch;
        const activeCount = (selectedStation !== 'ALL' ? 1 : 0) + (selectedShiftGroup !== 'ALL' ? 1 : 0) + (hasSearch ? 1 : 0);

        return (
          <div className="team-roster-stepper">
            <button
              type="button"
              onClick={handlePrevDay}
              className="team-roster-stepper-btn"
              title="Vorheriger Tag"
            >
              <ChevronLeft size={20} />
            </button>

            <div
              onClick={() => setShowJumpModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                minWidth: 0,
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: '8px',
                transition: 'background 0.15s ease'
              }}
              title="Klicken, um direkt zu einem Datum zu springen"
            >
              <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text-main)', whiteSpace: 'nowrap' }}>
                {formattedSelectedDate}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                • {currentDayShifts.length} im Dienst
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => setShowFilterModal(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: hasTeamFilter ? 'rgba(14, 165, 233, 0.18)' : 'rgba(255, 255, 255, 0.05)',
                  border: hasTeamFilter ? '1px solid rgba(56, 189, 248, 0.5)' : '1px solid var(--color-border)',
                  color: hasTeamFilter ? '#38bdf8' : 'var(--color-text-main)',
                  fontSize: '12px',
                  fontWeight: hasTeamFilter ? 700 : 600,
                  padding: '6px 10px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                title="Nach Kollege, Kürzel, Wache oder Schichtgruppe filtern"
              >
                <SlidersHorizontal size={13} />
                <span>Filter{hasTeamFilter ? ` (${activeCount})` : ''}</span>
              </button>

              {hasTeamFilter && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedStation('ALL');
                    setSelectedShiftGroup('ALL');
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(239, 68, 68, 0.14)',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    color: '#ef4444',
                    padding: '6px 7px',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                  title="Alle Filter & Suche zurücksetzen"
                >
                  <X size={13} />
                </button>
              )}

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
        );
      })()}

      {/* PopUp Modal 1: "Springe zu" Datum-Auswahl */}
      {showJumpModal && (() => {
        const [y, m] = yearMonth.split('-').map(Number);
        const totalDays = new Date(y, m, 0).getDate();
        const firstWeekday = (new Date(y, m - 1, 1).getDay() + 6) % 7; // Mo=0 ... So=6
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const myShiftsMap = {};
        myRosterShifts.forEach(s => { myShiftsMap[s.date] = s.code; });

        const calendarCells = [];
        for (let i = 0; i < firstWeekday; i++) {
          calendarCells.push({ empty: true, key: `e-${i}` });
        }
        for (let d = 1; d <= totalDays; d++) {
          const dStr = `${yearMonth}-${String(d).padStart(2, '0')}`;
          const dayRosterShifts = roster.shiftsByDate?.[dStr] || [];
          const myCode = myShiftsMap[dStr] || null;
          const isWeekend = ((firstWeekday + d - 1) % 7) >= 5;
          calendarCells.push({
            empty: false,
            dayNum: d,
            dateStr: dStr,
            shiftCount: dayRosterShifts.length,
            myCode,
            isWeekend,
            isSelected: selectedDate === dStr,
            isToday: todayStr === dStr,
            key: dStr
          });
        }

        return (
          <div
            onClick={() => setShowJumpModal(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 3100,
              background: 'rgba(2, 6, 23, 0.78)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
              animation: 'fadeIn 0.18s ease-out'
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: '420px',
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '18px',
                padding: '18px',
                boxShadow: '0 20px 50px rgba(0, 0, 0, 0.65)'
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '10px', borderBottom: '1px solid #1e293b' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={17} color="#fb923c" />
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>
                    Springe zu Datum
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowJumpModal(false)}
                  style={{
                    background: '#1e293b',
                    border: '1px solid #334155',
                    color: '#94a3b8',
                    borderRadius: '8px',
                    padding: '4px 8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Month Bar inside Modal */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={handlePrevMonth}
                    style={{
                      background: '#1e293b',
                      border: '1px solid #334155',
                      color: '#cbd5e1',
                      borderRadius: '8px',
                      padding: '5px 8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc', minWidth: '120px', textAlign: 'center' }}>
                    {roster.monthLabel || yearMonth}
                  </span>
                  <button
                    type="button"
                    onClick={handleNextMonth}
                    style={{
                      background: '#1e293b',
                      border: '1px solid #334155',
                      color: '#cbd5e1',
                      borderRadius: '8px',
                      padding: '5px 8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    handleToday();
                    setShowJumpModal(false);
                  }}
                  style={{
                    background: 'rgba(14, 165, 233, 0.15)',
                    border: '1px solid rgba(56, 189, 248, 0.35)',
                    color: '#38bdf8',
                    borderRadius: '8px',
                    padding: '5px 10px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Heute
                </button>
              </div>

              {/* Weekday Headers */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '6px' }}>
                {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((wd, i) => (
                  <div
                    key={wd}
                    style={{
                      textAlign: 'center',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: i >= 5 ? '#fb923c' : '#64748b'
                    }}
                  >
                    {wd}
                  </div>
                ))}
              </div>

              {/* 1-Click Day Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '5px', marginBottom: '14px' }}>
                {calendarCells.map(cell => {
                  if (cell.empty) {
                    return <div key={cell.key} style={{ minHeight: '44px' }} />;
                  }
                  const myShiftColor = cell.myCode ? getShiftColor('', cell.myCode) : null;
                  return (
                    <button
                      key={cell.key}
                      type="button"
                      onClick={() => {
                        setSelectedDate(cell.dateStr);
                        setShowJumpModal(false);
                      }}
                      style={{
                        minHeight: '44px',
                        padding: '4px 2px',
                        borderRadius: '9px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '2px',
                        cursor: 'pointer',
                        background: cell.isSelected
                          ? 'rgba(14, 165, 233, 0.25)'
                          : cell.myCode
                            ? myShiftColor.bg
                            : (cell.isWeekend ? 'rgba(30, 41, 59, 0.6)' : '#1e293b'),
                        border: cell.isSelected
                          ? '2px solid #38bdf8'
                          : cell.isToday
                            ? '1.5px solid #fb923c'
                            : cell.myCode
                              ? `1px solid ${myShiftColor.border}`
                              : '1px solid #334155',
                        color: '#f8fafc',
                        transition: 'all 0.12s ease'
                      }}
                    >
                      <span style={{
                        fontSize: '12.5px',
                        fontWeight: cell.isSelected || cell.isToday || cell.myCode ? 800 : 600,
                        color: cell.isSelected ? '#38bdf8' : (cell.isToday ? '#fb923c' : '#f8fafc'),
                        lineHeight: 1.1
                      }}>
                        {cell.dayNum}
                      </span>
                      {cell.myCode ? (
                        <span style={{
                          fontSize: '9px',
                          fontWeight: 800,
                          color: myShiftColor.color,
                          lineHeight: 1
                        }}>
                          {cell.myCode}
                        </span>
                      ) : cell.shiftCount > 0 ? (
                        <span style={{
                          fontSize: '9px',
                          color: '#64748b',
                          lineHeight: 1
                        }}>
                          {cell.shiftCount}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              {/* Direct Date Input Fallback */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                paddingTop: '10px',
                borderTop: '1px solid #1e293b'
              }}>
                <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>
                  Direktes Datum:
                </span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) return;
                    const targetYM = val.slice(0, 7);
                    if (targetYM !== yearMonth) {
                      switchMonth(targetYM, val);
                    } else {
                      setSelectedDate(val);
                    }
                    setShowJumpModal(false);
                  }}
                  style={{
                    background: '#1e293b',
                    border: '1px solid #334155',
                    color: '#f8fafc',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    fontSize: '12.5px',
                    fontFamily: 'inherit'
                  }}
                />
              </div>
            </div>
          </div>
        );
      })()}

      {/* PopUp Modal 2: Team-Filter (Kollege/Kürzel, Wachen & Schichtgruppen) */}
      {showFilterModal && (() => {
        const hasTeamFilter = selectedStation !== 'ALL' || selectedShiftGroup !== 'ALL' || Boolean(searchQuery.trim());
        const shiftGroups = ['Frühdienst', 'Tagschicht', 'Spätdienst', 'Nachtdienst', 'Sonderdienste', 'Fortbildung', 'Urlaub / Abwesend'];

        return (
          <div
            onClick={() => setShowFilterModal(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 3100,
              background: 'rgba(2, 6, 23, 0.78)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
              animation: 'fadeIn 0.18s ease-out'
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: '440px',
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '18px',
                padding: '18px',
                boxShadow: '0 20px 50px rgba(0, 0, 0, 0.65)'
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', paddingBottom: '10px', borderBottom: '1px solid #1e293b' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <SlidersHorizontal size={17} color="#38bdf8" />
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>
                    Team-Filter & Suche
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowFilterModal(false)}
                  style={{
                    background: '#1e293b',
                    border: '1px solid #334155',
                    color: '#94a3b8',
                    borderRadius: '8px',
                    padding: '4px 8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Section 0: Kollege oder Kürzel suchen */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                  Kollege oder Kürzel suchen
                </div>
                <div style={{ position: 'relative' }}>
                  <Search
                    size={16}
                    style={{
                      position: 'absolute',
                      left: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: '#64748b',
                      pointerEvents: 'none'
                    }}
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Name oder Kürzel (z.B. RFM, RTH)..."
                    style={{
                      width: '100%',
                      padding: '10px 34px 10px 36px',
                      borderRadius: '12px',
                      background: '#1e293b',
                      border: searchQuery.trim() ? '1px solid #38bdf8' : '1px solid #334155',
                      color: '#f8fafc',
                      fontSize: '13.5px',
                      fontFamily: 'inherit',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      style={{
                        position: 'absolute',
                        right: '8px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'transparent',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        padding: '4px'
                      }}
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
              </div>

              {/* Section 1: Wachen */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                  Wachen ({formattedSelectedDate})
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setSelectedStation('ALL')}
                    style={{
                      padding: '7px 12px',
                      borderRadius: '20px',
                      fontSize: '12.5px',
                      fontWeight: selectedStation === 'ALL' ? 700 : 500,
                      background: selectedStation === 'ALL' ? 'rgba(14, 165, 233, 0.2)' : '#1e293b',
                      border: selectedStation === 'ALL' ? '1px solid #38bdf8' : '1px solid #334155',
                      color: selectedStation === 'ALL' ? '#38bdf8' : '#cbd5e1',
                      cursor: 'pointer'
                    }}
                  >
                    Alle Wachen ({stationCounts.ALL}) {selectedStation === 'ALL' && '✓'}
                  </button>

                  {['Sendling', 'Hohenbrunn', 'Obersendling'].map(stName => {
                    const theme = STATION_THEMES[stName] || STATION_THEMES.Sendling;
                    const active = selectedStation === stName;
                    return (
                      <button
                        key={stName}
                        type="button"
                        onClick={() => setSelectedStation(active ? 'ALL' : stName)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '7px 12px',
                          borderRadius: '20px',
                          fontSize: '12.5px',
                          fontWeight: active ? 700 : 500,
                          background: active ? theme.badgeBg : '#1e293b',
                          border: active ? `1px solid ${theme.primaryHex}` : '1px solid #334155',
                          color: active ? theme.primaryHex : '#cbd5e1',
                          cursor: 'pointer'
                        }}
                      >
                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: theme.primaryHex }} />
                        <span>{stName} ({stationCounts[stName] || 0})</span>
                        {active && <span>✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Section 2: Schichtgruppen */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                  Schichtgruppe
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setSelectedShiftGroup('ALL')}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '20px',
                      fontSize: '12.5px',
                      fontWeight: selectedShiftGroup === 'ALL' ? 700 : 500,
                      background: selectedShiftGroup === 'ALL' ? '#334155' : '#1e293b',
                      border: selectedShiftGroup === 'ALL' ? '1px solid #64748b' : '1px solid #334155',
                      color: selectedShiftGroup === 'ALL' ? '#f8fafc' : '#94a3b8',
                      cursor: 'pointer'
                    }}
                  >
                    Alle Gruppen {selectedShiftGroup === 'ALL' && '✓'}
                  </button>

                  {shiftGroups.map(grp => {
                    const active = selectedShiftGroup === grp;
                    return (
                      <button
                        key={grp}
                        type="button"
                        onClick={() => setSelectedShiftGroup(active ? 'ALL' : grp)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '20px',
                          fontSize: '12.5px',
                          fontWeight: active ? 700 : 500,
                          background: active ? 'rgba(56, 189, 248, 0.18)' : '#1e293b',
                          border: active ? '1px solid #38bdf8' : '1px solid #334155',
                          color: active ? '#38bdf8' : '#cbd5e1',
                          cursor: 'pointer'
                        }}
                      >
                        {grp} {active && '✓'}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', paddingTop: '12px', borderTop: '1px solid #1e293b' }}>
                {hasTeamFilter ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedStation('ALL');
                      setSelectedShiftGroup('ALL');
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      background: 'rgba(239, 68, 68, 0.12)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: '#ef4444',
                      padding: '8px 12px',
                      borderRadius: '10px',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <X size={14} />
                    <span>Filter zurücksetzen</span>
                  </button>
                ) : <div />}

                <button
                  type="button"
                  onClick={() => setShowFilterModal(false)}
                  style={{
                    background: '#0284c7',
                    border: 'none',
                    color: '#ffffff',
                    padding: '8px 18px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Fertig ({currentDayShifts.length} im Dienst)
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Staffing Evaluation Box (Mind. 2x Besetzung pro regulärem Schichtkürzel ohne *) */}
      {staffingAnalysis.totalEvaluated > 0 && (
        <div className={`team-roster-staffing-box ${staffingAnalysis.hasUnderstaffed ? 'warning' : 'success'}`}>
          <div className="team-roster-staffing-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {staffingAnalysis.hasUnderstaffed ? (
                <>
                  <AlertTriangle size={17} style={{ color: '#f59e0b', flexShrink: 0 }} />
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#f59e0b' }}>
                    Fehlende Besetzung ({staffingAnalysis.understaffed.length})
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} style={{ color: '#10b981', flexShrink: 0 }} />
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#10b981' }}>
                    Alle Schichten voll besetzt (mind. 2x)
                  </span>
                </>
              )}
            </div>
            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
              {staffingAnalysis.hasUnderstaffed ? 'Mind. 2 Personen ohne *' : `${staffingAnalysis.totalEvaluated} Kürzel geprüft`}
            </span>
          </div>

          {staffingAnalysis.hasUnderstaffed && (
            <div className="team-roster-staffing-chips">
              {staffingAnalysis.understaffed.map(item => {
                const isSelected = searchQuery.toUpperCase() === item.code;
                return (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => setSearchQuery(isSelected ? '' : item.code)}
                    className={`team-roster-staffing-pill ${isSelected ? 'selected' : ''}`}
                    title={`Klicken zum Filtern nach ${item.code} (${item.colleagues.join(', ') || 'Kein Kollege eingeteilt'})`}
                  >
                    <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                      {item.count}x {item.code}
                    </span>
                    {item.stars > 0 && (
                      <span className="pill-star-note" title={`${item.stars}x ${item.code}* als Zusatzkraft`}>
                        (+{item.stars}*)
                      </span>
                    )}
                    {selectedStation === 'ALL' && (
                      <span style={{
                        fontSize: '10px',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        background: item.station === 'Hohenbrunn' ? 'rgba(16, 185, 129, 0.2)' :
                                    item.station === 'Obersendling' ? 'rgba(245, 158, 11, 0.2)' :
                                    'rgba(56, 189, 248, 0.2)',
                        color: item.station === 'Hohenbrunn' ? '#34d399' :
                               item.station === 'Obersendling' ? '#fbbf24' :
                               '#38bdf8',
                        fontWeight: 600
                      }}>
                        {item.station}
                      </span>
                    )}
                    <span className="pill-missing">
                      fehlt {item.missing}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 1-Click Personal Schedule + Automatic PartnerIn Sync & Calendar Export Bar */}
      {(myRosterShifts.length > 0 || calendarExportShifts.length > 0) && (() => {
        const count = myRosterShifts.length || calendarExportShifts.length;
        const countText = `${count} ${count === 1 ? 'Dienst' : 'Dienste'}`;
        return (
          <div style={{
            background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.14), rgba(15, 23, 42, 0.85))',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            borderRadius: '14px',
            padding: '12px 14px',
            marginBottom: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={16} style={{ color: '#38bdf8', flexShrink: 0 }} />
              <div style={{ fontSize: '13px', color: 'var(--color-text-main)', fontWeight: 600 }}>
                Dein Dienstplan ({countText}, {roster.monthLabel})
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {calendarExportShifts.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsCalendarExportModalOpen(true)}
                  style={{
                    flex: 1,
                    minWidth: '150px',
                    justifyContent: 'center',
                    background: 'rgba(234, 179, 8, 0.14)',
                    color: '#facc15',
                    border: '1px solid rgba(234, 179, 8, 0.38)',
                    borderRadius: '9px',
                    padding: '8px 12px',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    whiteSpace: 'nowrap'
                  }}
                  title="Persönliche Dienste dieses Monats als .ics-Datei in den Kalender übertragen"
                >
                  <Calendar size={14} />
                  <span>In Kalender übertragen</span>
                </button>
              )}
              {myRosterShifts.length > 0 && (
                <button
                  type="button"
                  disabled={isSyncingPersonal}
                  onClick={handleTransferPersonalScheduleToJournal}
                  style={{
                    flex: 1,
                    minWidth: '150px',
                    justifyContent: 'center',
                    background: '#0284c7',
                    color: 'white',
                    border: 'none',
                    borderRadius: '9px',
                    padding: '8px 12px',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: isSyncingPersonal ? 'default' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    whiteSpace: 'nowrap',
                    boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)'
                  }}
                  title="Persönliche Schichten inklusive PartnerIn ins Journal eintragen"
                >
                  <Check size={14} />
                  <span>{isSyncingPersonal ? 'Wird übertragen...' : 'Ins Journal übernehmen'}</span>
                </button>
              )}
            </div>
          </div>
        );
      })()}

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
              const johannesPartnerStr = isJohannes ? getPartnersForShiftFromRoster(selectedDate, shift.code, roster) : '';

              return (
                <React.Fragment key={`${shift.name}-${idx}`}>
                  {isNewGroup && (
                    <div className="team-roster-group-header">
                      {group}
                    </div>
                  )}
                  <div className={`team-roster-row ${isJohannes ? 'is-user' : ''}`}>
                    {/* Colleague Name */}
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, paddingRight: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
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
                      {isJohannes && johannesPartnerStr && (
                        <span style={{
                          fontSize: '11.5px',
                          color: '#7dd3fc',
                          fontWeight: 600,
                          marginTop: '2px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          👤 {johannesPartnerStr}
                        </span>
                      )}
                    </div>

                    {/* Shift Code Badge with Station Color and Understaffed Indicator */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      {!shift.code.includes('*') && staffingAnalysis.understaffedCodes.has((shift.code || '').trim().toUpperCase()) && (
                        <span
                          className="team-roster-staffing-tag"
                          title="In dieser Schicht fehlt ein Kollege bzw. eine Kollegin (nur 1x besetzt)"
                        >
                          ⚠️ 1x
                        </span>
                      )}
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
                    setActiveModalTab('paste');
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
                  onClick={() => { setActiveModalTab('paste'); setUploadError(null); }}
                  style={{
                    flex: 1,
                    padding: '8px 4px',
                    borderRadius: '8px',
                    border: activeModalTab === 'paste' ? '1px solid rgba(14, 165, 233, 0.4)' : 'none',
                    background: activeModalTab === 'paste' ? 'rgba(14, 165, 233, 0.2)' : 'transparent',
                    color: activeModalTab === 'paste' ? '#38bdf8' : 'var(--color-text-muted)',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Clipboard size={13} />
                  <span>SIEDA einfügen</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveModalTab('file'); setUploadError(null); }}
                  style={{
                    flex: 1,
                    padding: '8px 4px',
                    borderRadius: '8px',
                    border: activeModalTab === 'file' ? '1px solid rgba(14, 165, 233, 0.4)' : 'none',
                    background: activeModalTab === 'file' ? 'rgba(14, 165, 233, 0.2)' : 'transparent',
                    color: activeModalTab === 'file' ? '#38bdf8' : 'var(--color-text-muted)',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <FileCode size={13} />
                  <span>Datei laden</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveModalTab('saved'); setUploadError(null); }}
                  style={{
                    flex: 1,
                    padding: '8px 4px',
                    borderRadius: '8px',
                    border: activeModalTab === 'saved' ? '1px solid rgba(14, 165, 233, 0.4)' : 'none',
                    background: activeModalTab === 'saved' ? 'rgba(14, 165, 233, 0.2)' : 'transparent',
                    color: activeModalTab === 'saved' ? '#38bdf8' : 'var(--color-text-muted)',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <FolderOpen size={13} />
                  <span>Pläne ({savedRosters.filter(r => r.hasData).length})</span>
                </button>
              </div>

              {activeModalTab === 'file' ? (
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
              ) : activeModalTab === 'paste' ? (
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
                        <span>{copiedBookmarklet ? 'Lesezeichen kopiert! ✅' : '📋 Dienstplan kopieren'}</span>
                      </a>

                      <button
                        type="button"
                        onClick={handleCopyBookmarklet}
                        className="team-roster-station-chip"
                        style={{ fontSize: '11px', padding: '6px 10px' }}
                        title="Lesezeichen-Code in die Zwischenablage kopieren (z.B. für Safari)"
                      >
                        <Copy size={13} />
                        <span>{copiedBookmarklet ? 'Code kopiert! ✅' : 'Lesezeichen-Code kopieren'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleCopyScript}
                        className="team-roster-copy-code-btn"
                        title="JavaScript-Befehl für Entwickler-Konsole kopieren"
                      >
                        <Copy size={13} />
                        <span>{copiedScript ? 'Befehl kopiert! ✅' : 'Befehl für Konsole kopieren'}</span>
                      </button>
                    </div>

                    <div style={{ fontSize: '11px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle2 size={12} />
                      <span>Danach einfach unten in das Feld klicken, <strong>Cmd + V</strong> drücken und einlesen!</span>
                    </div>
                  </div>

                  {/* Station Selector Chip Bar */}
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '5px' }}>
                      Wachen-Zuordnung:
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {[
                        { id: 'AUTO', label: '⚡ Auto-Erkennung' },
                        { id: 'Sendling', label: 'Sendling (M)' },
                        { id: 'Obersendling', label: 'Obersendling (O)' },
                        { id: 'Hohenbrunn', label: 'Hohenbrunn (H)' }
                      ].map(opt => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setUploadStationOverride(opt.id)}
                          style={{
                            flex: 1,
                            padding: '6px 4px',
                            borderRadius: '8px',
                            border: uploadStationOverride === opt.id ? '1px solid rgba(14, 165, 233, 0.4)' : '1px solid var(--color-border)',
                            background: uploadStationOverride === opt.id ? 'rgba(14, 165, 233, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                            color: uploadStationOverride === opt.id ? '#38bdf8' : 'var(--color-text-muted)',
                            fontSize: '11px',
                            fontWeight: uploadStationOverride === opt.id ? 700 : 500,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
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
              ) : (
                /* Stored Rosters Tab */
                <div>
                  {/* Cloud Sync Status Card */}
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.12), rgba(99, 102, 241, 0.12))',
                    border: '1px solid rgba(14, 165, 233, 0.3)',
                    borderRadius: '12px',
                    padding: '12px',
                    marginBottom: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <div style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '8px',
                          background: 'rgba(14, 165, 233, 0.2)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#38bdf8',
                          flexShrink: 0
                        }}>
                          <Cloud size={16} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-main)' }}>
                            Cloud-Synchronisation
                          </div>
                          <div style={{
                            fontSize: '10px',
                            color: 'var(--color-text-muted)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}>
                            {currentUser ? `${currentUser.email} (aktiv)` : 'Nicht angemeldet'}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleManualCloudSync}
                        disabled={cloudSyncing || !currentUser}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          background: 'rgba(14, 165, 233, 0.25)',
                          border: '1px solid rgba(14, 165, 233, 0.4)',
                          color: '#38bdf8',
                          padding: '5px 10px',
                          borderRadius: '8px',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: cloudSyncing || !currentUser ? 'default' : 'pointer',
                          opacity: cloudSyncing || !currentUser ? 0.6 : 1,
                          flexShrink: 0
                        }}
                      >
                        <RefreshCw size={12} className={cloudSyncing ? 'spin-animation' : ''} />
                        <span>{cloudSyncing ? 'Synchronisiere...' : 'Jetzt abgleichen'}</span>
                      </button>
                    </div>

                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', lineHeight: 1.35 }}>
                      Pläne werden automatisch verschlüsselt in deinem Account gespeichert und sofort mit deinem iPhone und allen Geräten synchronisiert.
                    </div>
                  </div>

                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '10px', lineHeight: 1.4 }}>
                    Drei Wachen pro Monat unabhängig gespeichert (Sendling, Obersendling, Hohenbrunn):
                  </div>

                  <div style={{ maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {savedRosters.map(sr => {
                      const isActive = sr.yearMonth === currentYearMonth;
                      return (
                        <div
                          key={sr.yearMonth}
                          style={{
                            background: isActive ? 'rgba(14, 165, 233, 0.08)' : 'rgba(15, 23, 42, 0.7)',
                            border: isActive ? '1px solid rgba(14, 165, 233, 0.4)' : '1px solid var(--color-border)',
                            borderRadius: '14px',
                            padding: '12px 14px'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontWeight: 700, fontSize: '13px', color: isActive ? '#38bdf8' : 'var(--color-text-main)' }}>
                                {sr.monthLabel}
                              </span>
                              {isActive && (
                                <span style={{
                                  fontSize: '10px',
                                  background: '#0284c7',
                                  color: 'white',
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  fontWeight: 800
                                }}>
                                  Aktiv
                                </span>
                              )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {!isActive && sr.hasData && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    switchMonth(sr.yearMonth);
                                    setIsUploadOpen(false);
                                  }}
                                  className="team-roster-today-btn"
                                  style={{ fontSize: '11px', padding: '4px 10px' }}
                                >
                                  Monat öffnen
                                </button>
                              )}
                              {!sr.isPreset && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMonthRoster(sr.yearMonth)}
                                  style={{
                                    background: 'rgba(239, 68, 68, 0.15)',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    color: '#f87171',
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center'
                                  }}
                                  title="Ganzen Monat löschen"
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* 3 Stations Breakdown */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px' }}>
                            {sr.stations.map(stInfo => {
                              const stationTheme = stInfo.station === 'Sendling' ? '#38bdf8' : (stInfo.station === 'Hohenbrunn' ? '#34d399' : '#fb923c');
                              return (
                                <div
                                  key={stInfo.station}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '6px 10px',
                                    background: 'rgba(255, 255, 255, 0.03)',
                                    borderRadius: '8px',
                                    fontSize: '11px'
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{
                                      width: '7px',
                                      height: '7px',
                                      borderRadius: '50%',
                                      background: stInfo.hasData ? stationTheme : '#64748b'
                                    }} />
                                    <span style={{ fontWeight: 600, color: 'var(--color-text-main)' }}>
                                      Wache {stInfo.station}
                                    </span>
                                    <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
                                      ({stInfo.station === 'Sendling' ? 'M' : (stInfo.station === 'Hohenbrunn' ? 'H' : 'O')})
                                    </span>
                                  </div>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '11px', color: stInfo.hasData ? 'var(--color-text-muted)' : '#64748b' }}>
                                      {stInfo.hasData ? `${stInfo.totalColleagues} Kollege${stInfo.totalColleagues === 1 ? '' : 'n'} · ${stInfo.totalShifts} Dienste` : 'Kein Plan'}
                                    </span>
                                    {stInfo.hasData && !stInfo.isPreset && (
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteStationRoster(sr.yearMonth, stInfo.station)}
                                        style={{
                                          background: 'transparent',
                                          border: 'none',
                                          color: '#f87171',
                                          cursor: 'pointer',
                                          padding: '2px',
                                          display: 'flex',
                                          alignItems: 'center'
                                        }}
                                        title={`Dienstplan ${stInfo.station} löschen`}
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
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

      {/* iOS Calendar Export Modal */}
      <IosCalendarExportModal
        isOpen={isCalendarExportModalOpen}
        onClose={() => {
          setIsCalendarExportModalOpen(false);
          setCalendarJustCleared(false);
          if (searchParams.get('openCalendarExport') || searchParams.get('cleared')) {
            setSearchParams({ month: yearMonth });
          }
        }}
        shifts={calendarExportShifts}
        currentMonthLabel={roster.monthLabel || yearMonth}
        yearMonth={yearMonth}
        storeSettings={store?.settings}
        initialCleared={calendarJustCleared}
      />
    </div>
  );
}
