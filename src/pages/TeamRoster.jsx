import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Users, ChevronLeft, ChevronRight, Search,
  UploadCloud, X, CheckCircle2, Sparkles, AlertCircle, FileText, FileCode, Clipboard, Copy, Bookmark,
  Calendar, Trash2, FolderOpen, Check, Cloud, RefreshCw
} from 'lucide-react';
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
  subscribeToCloudTeamRosters
} from '../utils/teamRosterParser';
import { useAuth } from '../context/AuthContext';
import { parseCareManPdf } from '../utils/teamRosterPdfParser';
import { parseCareManHtml } from '../utils/teamRosterHtmlParser';
import { getShiftColor, detectStation } from '../utils/shiftColors';

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
  const [cloudSyncing, setCloudSyncing] = useState(false);

  // Stored rosters list
  const [savedRosters, setSavedRosters] = useState(() => getSavedRosterSummaries());

  // Current active yearMonth (defaults to saved user choice or October 2026)
  const [currentYearMonth, setCurrentYearMonth] = useState(() => {
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

      // 2. Search query filter
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
  }, [roster, selectedDate, searchQuery, selectedStation]);

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
      setRoster(getActiveTeamRoster(parsedRoster.yearMonth));
      setSavedRosters(getSavedRosterSummaries());

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
      setToastMessage(`Dienstplan für ${parsedRoster.monthLabel} (Wache ${targetStation}) gespeichert (${parsedRoster.totalShifts} Schichten)!`);
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
      setRoster(getActiveTeamRoster(parsedRoster.yearMonth));
      setSavedRosters(getSavedRosterSummaries());

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
      setToastMessage(`Dienstplan für ${parsedRoster.monthLabel} (Wache ${targetStation}) übernommen (${parsedRoster.totalShifts} Schichten)!`);
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
    </div>
  );
}
