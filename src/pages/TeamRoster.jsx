import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Users, Calendar as CalendarIcon, ChevronLeft, ChevronRight,
  Search, UploadCloud, Clock, MapPin, X, CheckCircle2,
  Sparkles, Filter, Eye, Sun, Moon, Sunrise, Sunset,
  GraduationCap, Palmtree, ArrowRight, UserCheck
} from 'lucide-react';
import {
  getActiveTeamRoster,
  saveActiveTeamRoster,
  runTeamRosterOcr,
  parseTeamRoster
} from '../utils/teamRosterParser';
import { getShiftColor, STATION_THEMES } from '../utils/shiftColors';

export default function TeamRoster() {
  // Current active roster (defaults to October 2026 verified data)
  const [roster, setRoster] = useState(() => getActiveTeamRoster('2026-10'));
  
  // Selected date: Default to 2026-10-05 (or today if October 2026)
  const [selectedDate, setSelectedDate] = useState('2026-10-05');
  const [selectedStation, setSelectedStation] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('daily'); // 'daily' | 'colleagues'
  const [selectedColleague, setSelectedColleague] = useState(null);

  // Upload Modal State
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const dayStripRef = useRef(null);
  const fileInputRef = useRef(null);

  // Auto-scroll active day capsule into view
  useEffect(() => {
    if (dayStripRef.current) {
      const activeEl = dayStripRef.current.querySelector('.day-pill.active');
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [selectedDate]);

  // Toast timer
  useEffect(() => {
    if (toastMessage) {
      const t = setTimeout(() => setToastMessage(null), 4000);
      return () => clearTimeout(t);
    }
  }, [toastMessage]);

  // Current month days count
  const daysInMonth = roster.daysInMonth || 31;
  const yearMonth = roster.yearMonth || '2026-10';

  // Available days array
  const daysList = useMemo(() => {
    return Array.from({ length: daysInMonth }, (_, i) => {
      const dayNum = i + 1;
      const dateStr = `${yearMonth}-${String(dayNum).padStart(2, '0')}`;
      const d = new Date(yearMonth + '-' + String(dayNum).padStart(2, '0') + 'T12:00:00');
      const weekdayShort = d.toLocaleDateString('de-DE', { weekday: 'short' });
      const shiftsOnDay = roster.shiftsByDate?.[dateStr] || [];
      return {
        dayNum,
        dateStr,
        weekdayShort,
        dutyCount: shiftsOnDay.filter(s => !s.isVacation).length,
        totalCount: shiftsOnDay.length
      };
    });
  }, [roster, yearMonth, daysInMonth]);

  // Date stepper handlers
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
    // If today is in current roster's month, jump to today, else day 1 or 5
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (todayStr.startsWith(yearMonth)) {
      setSelectedDate(todayStr);
    } else {
      setSelectedDate(`${yearMonth}-05`);
    }
  };

  // Shifts for selected date, filtered by station and search
  const currentDayShifts = useMemo(() => {
    const raw = roster.shiftsByDate?.[selectedDate] || [];
    return raw.filter(shift => {
      // Station filter
      if (selectedStation !== 'ALL') {
        if (!shift.station.toLowerCase().includes(selectedStation.toLowerCase())) {
          return false;
        }
      }
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = shift.name.toLowerCase().includes(q);
        const matchesCode = shift.code.toLowerCase().includes(q);
        const matchesType = (shift.shiftTypeName || '').toLowerCase().includes(q);
        if (!matchesName && !matchesCode && !matchesType) return false;
      }
      return true;
    });
  }, [roster, selectedDate, selectedStation, searchQuery]);

  // Categorize shifts for the selected date into intuitive emergency service shift groups
  const categorizedShifts = useMemo(() => {
    const groups = {
      frueh: { title: 'Frühschicht', subtitle: '06:54 – 15:06', icon: Sunrise, items: [], color: '#38bdf8' },
      tag: { title: 'Tagschicht', subtitle: '08:54 – 19:06', icon: Sun, items: [], color: '#10b981' },
      spaat: { title: 'Spätschicht', subtitle: '14:54 – 23:06 / 00:06', icon: Sunset, items: [], color: '#818cf8' },
      nacht: { title: 'Nachtschicht', subtitle: '22:54 – 07:06', icon: Moon, items: [], color: '#a78bfa' },
      fortbildung: { title: 'Fortbildung & Kurse', subtitle: 'ACLS, PALS, Seminare', icon: GraduationCap, items: [], color: '#ec4899' },
      sonstig: { title: 'Sonderdienste', subtitle: 'FSJ, Sonderaufgaben', icon: Sparkles, items: [], color: '#f59e0b' },
      abwesend: { title: 'Urlaub / Abwesend', subtitle: 'Freistellung', icon: Palmtree, items: [], color: '#94a3b8' }
    };

    currentDayShifts.forEach(shift => {
      const type = (shift.shiftTypeName || '').toLowerCase();
      const code = (shift.code || '').toUpperCase();

      if (shift.isVacation || type.includes('urlaub') || type.includes('freistellung')) {
        groups.abwesend.items.push(shift);
      } else if (shift.isTraining || type.includes('fortbildung') || ['ACLS', 'PALS', 'SMT', 'RAJ'].some(k => code.includes(k))) {
        groups.fortbildung.items.push(shift);
      } else if (type.includes('nacht') || code.includes('RN') || code.endsWith('NM') || code.endsWith('NH')) {
        groups.nacht.items.push(shift);
      } else if (type.includes('spät') || code.includes('RS') || code.includes('RT2') || code.includes('RT4') || code.endsWith('SM') || code.endsWith('SH') || code.endsWith('SO')) {
        groups.spaat.items.push(shift);
      } else if (type.includes('tag') || code.includes('RT1') || code.includes('RT3') || code === 'RTH') {
        groups.tag.items.push(shift);
      } else if (type.includes('früh') || code.includes('RF') || code.endsWith('FM') || code.endsWith('FH') || code.endsWith('FO')) {
        groups.frueh.items.push(shift);
      } else {
        groups.sonstig.items.push(shift);
      }
    });

    return Object.entries(groups).filter(([_, group]) => group.items.length > 0);
  }, [currentDayShifts]);

  // Colleague directory data for the monthly search view
  const allColleaguesList = useMemo(() => {
    const list = roster.colleagues || [];
    return list.filter(c => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return c.name.toLowerCase().includes(q);
    });
  }, [roster, searchQuery]);

  // Station counts for badge filters
  const stationCounts = useMemo(() => {
    const all = (roster.shiftsByDate?.[selectedDate] || []).filter(s => !s.isVacation);
    return {
      all: all.length,
      sendling: all.filter(s => s.station.toLowerCase().includes('sendling')).length,
      hohenbrunn: all.filter(s => s.station.toLowerCase().includes('hohenbrunn')).length,
      obersendling: all.filter(s => s.station.toLowerCase().includes('obersendling')).length
    };
  }, [roster, selectedDate]);

  // Handle Screenshot Upload & OCR
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setIsProcessing(true);
    setUploadProgress(5);

    try {
      // Preview
      const previewUrl = URL.createObjectURL(file);
      setUploadPreview(previewUrl);

      // OCR
      setUploadProgress(15);
      const ocrText = await runTeamRosterOcr(file, progress => {
        setUploadProgress(Math.min(90, 15 + Math.round(progress * 0.75)));
      });

      setUploadProgress(92);
      // Parse
      const parsedRoster = parseTeamRoster(ocrText, yearMonth);
      setUploadProgress(100);

      // Save into state and local storage
      setRoster(parsedRoster);
      saveActiveTeamRoster(parsedRoster);

      setIsUploadOpen(false);
      setIsProcessing(false);
      setUploadProgress(null);
      setToastMessage(`Dienstplan für ${parsedRoster.monthLabel} aktualisiert (${parsedRoster.totalColleagues} Kollegen, ${parsedRoster.totalShifts} Schichten)!`);
    } catch (err) {
      console.error('Upload Error:', err);
      setUploadError('Fehler bei der Texterkennung: ' + (err.message || 'Bitte prüfe das Bildformat.'));
      setIsProcessing(false);
    }
  };

  // Formatted date string for header
  const formattedSelectedDate = useMemo(() => {
    try {
      const d = new Date(selectedDate + 'T12:00:00');
      return d.toLocaleDateString('de-DE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  return (
    <div className="team-roster-container pb-28">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-500/90 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 backdrop-blur-md border border-emerald-400/30 text-sm font-medium animate-fadeIn">
          <CheckCircle2 size={18} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <Users className="text-sky-400" size={26} />
              Team-Dienstplan
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">
              {roster.monthLabel || 'Oktober 2026'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Tägliche Übersicht aller Wachen, RTWs und Kollegen im Dienst
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* View Mode Switcher */}
          <div className="inline-flex rounded-xl p-1 bg-slate-800/80 border border-slate-700/60 text-xs">
            <button
              onClick={() => setViewMode('daily')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                viewMode === 'daily'
                  ? 'bg-sky-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Tagesansicht
            </button>
            <button
              onClick={() => setViewMode('colleagues')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                viewMode === 'colleagues'
                  ? 'bg-sky-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Kollegen ({roster.totalColleagues || 79})
            </button>
          </div>

          {/* Upload Button */}
          <button
            onClick={() => setIsUploadOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-sky-500/20 to-indigo-500/20 text-sky-300 border border-sky-500/30 hover:border-sky-400/60 text-xs font-semibold shadow-sm transition-all active:scale-95"
            title="Neuen Screenshot einlesen"
          >
            <UploadCloud size={16} />
            <span className="hidden sm:inline">Plan aktualisieren</span>
          </button>
        </div>
      </div>

      {/* Date Navigation & Calendar Strip (Daily Mode) */}
      {viewMode === 'daily' && (
        <div className="mb-5 space-y-3">
          {/* Stepper Bar */}
          <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800/80 rounded-2xl p-2 px-3 backdrop-blur-md shadow-sm">
            <button
              onClick={handlePrevDay}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 active:scale-95 transition-all"
              title="Vorheriger Tag"
            >
              <ChevronLeft size={20} />
            </button>

            <div className="text-center flex-1 mx-2">
              <div className="text-sm font-bold text-white flex items-center justify-center gap-2">
                <span>{formattedSelectedDate}</span>
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {stationCounts.all} Kollegen heute im Dienst
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={handleToday}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-800 text-sky-400 border border-sky-500/20 hover:bg-sky-500/10 active:scale-95 transition-all"
              >
                Heute
              </button>
              <button
                onClick={handleNextDay}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 active:scale-95 transition-all"
                title="Nächster Tag"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>

          {/* Horizontal Day Strip */}
          <div
            ref={dayStripRef}
            className="flex gap-2 overflow-x-auto pb-2 scrollbar-none snap-x"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {daysList.map(item => {
              const isActive = item.dateStr === selectedDate;
              return (
                <button
                  key={item.dateStr}
                  onClick={() => setSelectedDate(item.dateStr)}
                  className={`day-pill shrink-0 flex flex-col items-center justify-center min-w-[52px] py-2 px-1.5 rounded-2xl border transition-all text-center snap-center ${
                    isActive
                      ? 'bg-sky-500 text-white border-sky-400 shadow-md shadow-sky-500/20 active'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <span className={`text-[10px] font-semibold tracking-wider uppercase ${isActive ? 'text-sky-100' : 'text-slate-500'}`}>
                    {item.weekdayShort}
                  </span>
                  <span className={`text-base font-extrabold my-0.5 ${isActive ? 'text-white' : 'text-slate-200'}`}>
                    {item.dayNum}
                  </span>
                  <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-medium ${
                    isActive
                      ? 'bg-sky-600/70 text-white'
                      : 'bg-slate-800 text-slate-400'
                  }`}>
                    {item.dutyCount}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="space-y-3 mb-5">
        {/* Search Bar */}
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Kollege suchen (z.B. Katja, Felix, Thilo, Backhaus)..."
            className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500/60 focus:ring-1 focus:ring-sky-500/30 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Station Filter Pills (Only in daily view) */}
        {viewMode === 'daily' && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <button
              onClick={() => setSelectedStation('ALL')}
              className={`px-3 py-1.5 rounded-xl font-medium border transition-all ${
                selectedStation === 'ALL'
                  ? 'bg-slate-200 text-slate-900 border-white shadow-sm'
                  : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Alle Wachen ({stationCounts.all})
            </button>
            <button
              onClick={() => setSelectedStation('Sendling')}
              className={`px-3 py-1.5 rounded-xl font-medium border flex items-center gap-1.5 transition-all ${
                selectedStation === 'Sendling'
                  ? 'bg-sky-500 text-white border-sky-400 shadow-sm'
                  : 'bg-slate-900/60 border-sky-500/20 text-sky-400 hover:bg-sky-500/10'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              Sendling ({stationCounts.sendling})
            </button>
            <button
              onClick={() => setSelectedStation('Hohenbrunn')}
              className={`px-3 py-1.5 rounded-xl font-medium border flex items-center gap-1.5 transition-all ${
                selectedStation === 'Hohenbrunn'
                  ? 'bg-emerald-500 text-white border-emerald-400 shadow-sm'
                  : 'bg-slate-900/60 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Hohenbrunn ({stationCounts.hohenbrunn})
            </button>
            <button
              onClick={() => setSelectedStation('Obersendling')}
              className={`px-3 py-1.5 rounded-xl font-medium border flex items-center gap-1.5 transition-all ${
                selectedStation === 'Obersendling'
                  ? 'bg-amber-500 text-white border-amber-400 shadow-sm'
                  : 'bg-slate-900/60 border-amber-500/20 text-amber-400 hover:bg-amber-500/10'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              Obersendling ({stationCounts.obersendling})
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {viewMode === 'daily' ? (
        /* DAILY SHIFTS VIEW */
        <div className="space-y-6">
          {categorizedShifts.length === 0 ? (
            <div className="text-center py-16 bg-slate-900/40 border border-slate-800/80 rounded-3xl p-8 backdrop-blur-md">
              <CalendarIcon size={36} className="mx-auto text-slate-600 mb-3" />
              <h3 className="text-base font-semibold text-slate-300">Keine Dienste gefunden</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                {searchQuery
                  ? `Keine Schichten für die Suche "${searchQuery}" an diesem Tag.`
                  : 'Für das gewählte Datum sind keine Dienste für diesen Filter eingetragen.'}
              </p>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="mt-4 px-3.5 py-1.5 text-xs rounded-xl bg-slate-800 text-sky-400 hover:bg-slate-700"
                >
                  Suche zurücksetzen
                </button>
              )}
            </div>
          ) : (
            categorizedShifts.map(([key, group]) => {
              const GroupIcon = group.icon;
              return (
                <div key={key} className="space-y-2.5">
                  {/* Category Header */}
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <div
                        className="p-1.5 rounded-lg border"
                        style={{
                          background: `${group.color}15`,
                          borderColor: `${group.color}30`,
                          color: group.color
                        }}
                      >
                        <GroupIcon size={16} />
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-white tracking-wide">
                          {group.title}
                        </h2>
                        <span className="text-[11px] text-slate-400">
                          {group.subtitle}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-300 border border-slate-700/50">
                      {group.items.length} {group.items.length === 1 ? 'Kollege' : 'Kollegen'}
                    </span>
                  </div>

                  {/* Cards Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {group.items.map((shift, idx) => {
                      const colorInfo = getShiftColor(shift.shiftTypeName, shift.code, shift.station);
                      const isJohannes = shift.name.toLowerCase().includes('backhaus');

                      return (
                        <div
                          key={`${shift.name}-${idx}`}
                          onClick={() => {
                            const found = (roster.colleagues || []).find(c => c.name === shift.name);
                            if (found) setSelectedColleague(found);
                          }}
                          className={`p-3.5 rounded-2xl border transition-all cursor-pointer backdrop-blur-md active:scale-[0.99] hover:border-slate-600 ${
                            isJohannes
                              ? 'bg-gradient-to-r from-sky-950/40 to-slate-900/90 border-sky-400/50 shadow-md shadow-sky-500/10'
                              : 'bg-slate-900/70 border-slate-800/80'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-sm text-white truncate">
                                  {shift.name}
                                </span>
                                {isJohannes && (
                                  <span className="text-[10px] px-2 py-0.2 rounded-full bg-sky-500 text-white font-extrabold shadow-sm">
                                    Du
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2 text-xs text-slate-400 mt-1.5">
                                <span className="flex items-center gap-1">
                                  <Clock size={12} className="text-slate-500" />
                                  {shift.startTime} – {shift.endTime}
                                </span>
                                <span>•</span>
                                <span className="flex items-center gap-1 truncate">
                                  <MapPin size={12} className="text-slate-500" />
                                  {shift.station.replace('Wache ', '')}
                                </span>
                              </div>
                            </div>

                            {/* Shift Code Badge */}
                            <div className="text-right shrink-0">
                              <span
                                className="inline-block text-xs font-black px-2.5 py-1 rounded-xl border shadow-sm tracking-wider"
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
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* COLLEAGUES DIRECTORY VIEW */
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1 text-xs text-slate-400">
            <span>{allColleaguesList.length} Kollegen im Dienstplan erfasst</span>
            <span>Klicke auf einen Namen für Details</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {allColleaguesList.map(colleague => {
              const shiftEntries = Object.entries(colleague.shifts || {});
              const isJohannes = colleague.name.toLowerCase().includes('backhaus');

              return (
                <div
                  key={colleague.name}
                  onClick={() => setSelectedColleague(colleague)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer backdrop-blur-md active:scale-[0.99] hover:border-slate-600 ${
                    isJohannes
                      ? 'bg-gradient-to-r from-sky-950/40 to-slate-900/90 border-sky-400/50 shadow-md shadow-sky-500/10'
                      : 'bg-slate-900/70 border-slate-800/80'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-white truncate">
                          {colleague.name}
                        </span>
                        {isJohannes && (
                          <span className="text-[10px] px-2 py-0.2 rounded-full bg-sky-500 text-white font-extrabold">
                            Du
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400 block mt-0.5">
                        {shiftEntries.length} {shiftEntries.length === 1 ? 'Schicht' : 'Schichten'} im Monat
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs font-semibold px-2 py-1 rounded-xl bg-slate-800 text-slate-300 border border-slate-700">
                        {shiftEntries.length}
                      </span>
                      <ArrowRight size={14} className="text-slate-500" />
                    </div>
                  </div>

                  {/* Mini Preview of Codes */}
                  <div className="flex gap-1 overflow-x-auto mt-2.5 pt-1 border-t border-slate-800/60 scrollbar-none">
                    {shiftEntries.slice(0, 7).map(([date, code]) => {
                      const colorInfo = getShiftColor('', code);
                      const day = parseInt(date.split('-')[2], 10);
                      return (
                        <span
                          key={date}
                          className="text-[9px] px-1.5 py-0.5 rounded-md font-mono font-bold shrink-0 border"
                          style={{
                            background: colorInfo.bg,
                            color: colorInfo.color,
                            borderColor: colorInfo.border
                          }}
                        >
                          {day}. {code}
                        </span>
                      );
                    })}
                    {shiftEntries.length > 7 && (
                      <span className="text-[9px] text-slate-500 px-1 py-0.5 shrink-0">
                        +{shiftEntries.length - 7}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Colleague Detail Modal */}
      {selectedColleague && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 max-h-[90vh] flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <UserCheck className="text-sky-400" size={20} />
                  {selectedColleague.name}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Dienstplan {roster.monthLabel || 'Oktober 2026'}
                </p>
              </div>
              <button
                onClick={() => setSelectedColleague(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            {/* Shifts List */}
            <div className="flex-1 overflow-y-auto py-4 space-y-2.5">
              {Object.entries(selectedColleague.shifts || {}).length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500">
                  Keine Schichten für diesen Monat eingetragen.
                </div>
              ) : (
                Object.entries(selectedColleague.shifts || {})
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([date, code]) => {
                    const colorInfo = getShiftColor('', code);
                    const d = new Date(date + 'T12:00:00');
                    const dayFormatted = d.toLocaleDateString('de-DE', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short'
                    });

                    return (
                      <div
                        key={date}
                        className="flex items-center justify-between p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60 text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-slate-700/60 flex items-center justify-center font-bold text-slate-200">
                            {date.split('-')[2]}
                          </div>
                          <div>
                            <span className="font-semibold text-white block">
                              {dayFormatted}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {colorInfo.stationName}
                            </span>
                          </div>
                        </div>

                        <span
                          className="font-bold font-mono px-2.5 py-1 rounded-xl border text-xs"
                          style={{
                            background: colorInfo.bg,
                            color: colorInfo.color,
                            borderColor: colorInfo.border
                          }}
                        >
                          {code}
                        </span>
                      </div>
                    );
                  })
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedColleague(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Screenshot Modal */}
      {isUploadOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <UploadCloud className="text-sky-400" size={22} />
                  Dienstplan-Screenshot hochladen
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Lade den CareMan Monatsplan als Screenshot hoch, um die Team-Übersicht automatisch zu aktualisieren.
                </p>
              </div>
              <button
                onClick={() => {
                  if (!isProcessing) {
                    setIsUploadOpen(false);
                    setUploadPreview(null);
                    setUploadError(null);
                  }
                }}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            {/* Upload Box */}
            <div
              onClick={() => !isProcessing && fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer ${
                isProcessing
                  ? 'border-sky-500/50 bg-sky-500/5'
                  : 'border-slate-700 hover:border-sky-500/60 bg-slate-950/40 hover:bg-slate-800/30'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />

              {uploadPreview ? (
                <div className="space-y-3">
                  <img
                    src={uploadPreview}
                    alt="Preview"
                    className="max-h-40 mx-auto rounded-xl border border-slate-700 object-contain shadow-md"
                  />
                  <p className="text-xs text-slate-400">
                    Klicke zum Auswählen einer anderen Datei
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center mx-auto">
                    <UploadCloud size={24} />
                  </div>
                  <div className="text-sm font-semibold text-slate-200">
                    Screenshot auswählen oder hierher ziehen
                  </div>
                  <p className="text-xs text-slate-500">
                    Unterstützt PNG, JPG, WebP aus CareMan
                  </p>
                </div>
              )}
            </div>

            {/* Progress Bar */}
            {isProcessing && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span className="flex items-center gap-2 font-medium">
                    <Sparkles size={14} className="text-sky-400 animate-spin" />
                    Texterkennung & Analyse läuft...
                  </span>
                  <span className="font-mono text-sky-400 font-bold">{uploadProgress}%</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700">
                  <div
                    className="bg-gradient-to-r from-sky-500 to-indigo-500 h-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Error Message */}
            {uploadError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                {uploadError}
              </div>
            )}

            {/* Modal Actions */}
            <div className="pt-2 flex justify-end gap-2">
              <button
                disabled={isProcessing}
                onClick={() => {
                  setIsUploadOpen(false);
                  setUploadPreview(null);
                  setUploadError(null);
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold disabled:opacity-50"
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
