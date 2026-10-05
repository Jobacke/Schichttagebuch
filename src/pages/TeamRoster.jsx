import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Users, ChevronLeft, ChevronRight, Search,
  UploadCloud, X, CheckCircle2, Sparkles, AlertCircle
} from 'lucide-react';
import {
  getActiveTeamRoster,
  saveActiveTeamRoster,
  runTeamRosterOcr,
  parseTeamRoster
} from '../utils/teamRosterParser';
import { getShiftColor } from '../utils/shiftColors';

export default function TeamRoster() {
  // Active roster data (defaults to verified October 2026 data)
  const [roster, setRoster] = useState(() => getActiveTeamRoster('2026-10'));
  
  // Selected date (defaults to today if within month, otherwise 2026-10-16 or 2026-10-05)
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const ym = roster?.yearMonth || '2026-10';
    if (todayStr.startsWith(ym)) return todayStr;
    return `${ym}-16`;
  });

  const [searchQuery, setSearchQuery] = useState('');

  // Upload modal state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const fileInputRef = useRef(null);
  const dateInputRef = useRef(null);

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
      setSelectedDate(`${yearMonth}-16`);
    }
  };

  // Filtered shifts for selected date
  const currentDayShifts = useMemo(() => {
    const raw = roster.shiftsByDate?.[selectedDate] || [];
    return raw.filter(shift => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        shift.name.toLowerCase().includes(q) ||
        shift.code.toLowerCase().includes(q)
      );
    });
  }, [roster, selectedDate, searchQuery]);

  // Group shifts by simple shift category (Früh, Tag, Spät, Nacht, Sonstige)
  const groupedShifts = useMemo(() => {
    const groups = [
      { key: 'frueh', label: 'Frühdienst', items: [] },
      { key: 'tag', label: 'Tagschicht', items: [] },
      { key: 'spaat', label: 'Spätdienst', items: [] },
      { key: 'nacht', label: 'Nachtdienst', items: [] },
      { key: 'sonstig', label: 'Fortbildung / Sonstige', items: [] }
    ];

    currentDayShifts.forEach(shift => {
      const code = (shift.code || '').toUpperCase();
      const type = (shift.shiftTypeName || '').toLowerCase();

      if (type.includes('nacht') || code.includes('RN') || code.endsWith('NM') || code.endsWith('NH')) {
        groups[3].items.push(shift);
      } else if (type.includes('spät') || code.includes('RS') || code.includes('RT2') || code.includes('RT4') || code.endsWith('SM') || code.endsWith('SH') || code.endsWith('SO')) {
        groups[2].items.push(shift);
      } else if (type.includes('tag') || code.includes('RT1') || code.includes('RT3') || code === 'RTH') {
        groups[1].items.push(shift);
      } else if (type.includes('früh') || code.includes('RF') || code.endsWith('FM') || code.endsWith('FH') || code.endsWith('FO')) {
        groups[0].items.push(shift);
      } else {
        groups[4].items.push(shift);
      }
    });

    return groups.filter(g => g.items.length > 0);
  }, [currentDayShifts]);

  // Total colleagues on duty for selected day
  const dutyCount = useMemo(() => {
    const raw = roster.shiftsByDate?.[selectedDate] || [];
    return raw.filter(s => !s.isVacation).length;
  }, [roster, selectedDate]);

  // Formatted date string
  const formattedSelectedDate = useMemo(() => {
    try {
      const d = new Date(selectedDate + 'T12:00:00');
      return d.toLocaleDateString('de-DE', {
        weekday: 'short',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  // Handle Screenshot Upload
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setIsProcessing(true);
    setUploadProgress(10);

    try {
      const previewUrl = URL.createObjectURL(file);
      setUploadPreview(previewUrl);

      setUploadProgress(25);
      const ocrText = await runTeamRosterOcr(file, progress => {
        setUploadProgress(Math.min(90, 25 + Math.round(progress * 0.7)));
      });

      setUploadProgress(95);
      const parsedRoster = parseTeamRoster(ocrText, yearMonth);
      setUploadProgress(100);

      setRoster(parsedRoster);
      saveActiveTeamRoster(parsedRoster);

      setIsUploadOpen(false);
      setIsProcessing(false);
      setUploadProgress(null);
      setToastMessage(`Dienstplan für ${parsedRoster.monthLabel} aktualisiert (${parsedRoster.totalShifts} Schichten)!`);
    } catch (err) {
      console.error('Upload Error:', err);
      setUploadError('Erkennungsfehler: Bitte prüfe das Bildformat.');
      setIsProcessing(false);
    }
  };

  return (
    <div className="team-roster-container pb-28 max-w-xl mx-auto px-2">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-500/95 text-white px-5 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 backdrop-blur-md text-xs font-semibold animate-fadeIn">
          <CheckCircle2 size={16} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header: Title & Upload Button */}
      <div className="flex items-center justify-between gap-2 pt-1 pb-3">
        <div className="flex items-center gap-2">
          <Users className="text-sky-400" size={22} />
          <h1 className="text-xl font-bold text-white tracking-tight">
            Wer hat Dienst?
          </h1>
        </div>

        <button
          onClick={() => setIsUploadOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-sky-400 hover:text-sky-300 border border-slate-700 text-xs font-medium transition-all active:scale-95"
          title="Neuen Dienstplan hochladen"
        >
          <UploadCloud size={15} />
          <span>Plan laden</span>
        </button>
      </div>

      {/* Clean Date Stepper Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-2.5 mb-3 backdrop-blur-md flex items-center justify-between gap-1 shadow-sm">
        <button
          onClick={handlePrevDay}
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 active:scale-95 transition-all shrink-0"
          title="Vorheriger Tag"
        >
          <ChevronLeft size={20} />
        </button>

        {/* Clickable Date Display with hidden native date input */}
        <div
          onClick={() => dateInputRef.current?.showPicker ? dateInputRef.current.showPicker() : dateInputRef.current?.focus()}
          className="flex-1 text-center cursor-pointer py-1 px-2 rounded-xl hover:bg-slate-800/50 transition-colors relative"
          title="Klicken, um Datum zu wählen"
        >
          <input
            ref={dateInputRef}
            type="date"
            value={selectedDate}
            onChange={e => e.target.value && setSelectedDate(e.target.value)}
            className="absolute inset-0 opacity-0 pointer-events-none w-full h-full"
          />
          <div className="text-sm font-bold text-white flex items-center justify-center gap-1.5">
            <span>{formattedSelectedDate}</span>
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-0.5">
            {dutyCount} {dutyCount === 1 ? 'Kollege' : 'Kollegen'} im Dienst
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleToday}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-800 text-sky-400 hover:bg-slate-700 active:scale-95 transition-all"
          >
            Heute
          </button>
          <button
            onClick={handleNextDay}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 active:scale-95 transition-all shrink-0"
            title="Nächster Tag"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Slim Search Input */}
      <div className="relative mb-3">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Kollege oder Schichtkürzel suchen..."
          className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500/50 transition-all"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Clean Reduced List: Grouped by Shift, Only Name & Shift Code */}
      <div className="space-y-4">
        {groupedShifts.length === 0 ? (
          <div className="text-center py-12 bg-slate-900/40 border border-slate-800/60 rounded-2xl p-6">
            <p className="text-xs text-slate-400 font-medium">
              {searchQuery
                ? `Keine Treffer für "${searchQuery}".`
                : 'Für diesen Tag sind keine Dienste eingetragen.'}
            </p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="mt-2 text-xs text-sky-400 hover:underline"
              >
                Suche zurücksetzen
              </button>
            )}
          </div>
        ) : (
          groupedShifts.map(group => (
            <div key={group.key} className="space-y-1.5">
              {/* Minimal Section Label */}
              <div className="flex items-center justify-between px-1 text-xs text-slate-400 font-semibold">
                <span>{group.label}</span>
                <span className="text-[11px] text-slate-500 font-normal">
                  {group.items.length}
                </span>
              </div>

              {/* Rows: Just Name and Shift Code */}
              <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl overflow-hidden divide-y divide-slate-800/60 shadow-sm">
                {group.items.map((shift, idx) => {
                  const colorInfo = getShiftColor(shift.shiftTypeName, shift.code, shift.station);
                  const isJohannes = shift.name.toLowerCase().includes('backhaus');

                  return (
                    <div
                      key={`${shift.name}-${idx}`}
                      className={`flex items-center justify-between px-3.5 py-2.5 transition-colors ${
                        isJohannes
                          ? 'bg-sky-500/10 hover:bg-sky-500/15'
                          : 'hover:bg-slate-800/40'
                      }`}
                    >
                      {/* Colleague Name */}
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <span className={`text-sm truncate ${isJohannes ? 'font-bold text-sky-300' : 'font-medium text-slate-200'}`}>
                          {shift.name}
                        </span>
                        {isJohannes && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-500 text-white font-extrabold shrink-0">
                            Du
                          </span>
                        )}
                      </div>

                      {/* Shift Code Badge with Station Color */}
                      <span
                        className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg border shrink-0 tracking-wide"
                        style={{
                          background: colorInfo.bg,
                          color: colorInfo.color,
                          borderColor: colorInfo.border
                        }}
                      >
                        {shift.code}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Upload Screenshot Modal */}
      {isUploadOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm p-5 shadow-2xl space-y-4">
            <div className="flex items-start justify-between pb-2 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <UploadCloud className="text-sky-400" size={18} />
                  Dienstplan-Screenshot
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Neuen CareMan Monatsplan hochladen
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
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            {/* Drop / Select Area */}
            <div
              onClick={() => !isProcessing && fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all ${
                isProcessing
                  ? 'border-sky-500/50 bg-sky-500/5'
                  : 'border-slate-700 hover:border-sky-500/60 bg-slate-950/40'
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
                <img
                  src={uploadPreview}
                  alt="Preview"
                  className="max-h-32 mx-auto rounded-xl border border-slate-700 object-contain shadow-md"
                />
              ) : (
                <div className="space-y-1.5">
                  <UploadCloud size={24} className="mx-auto text-sky-400" />
                  <div className="text-xs font-semibold text-slate-200">
                    Bild auswählen
                  </div>
                  <p className="text-[10px] text-slate-500">
                    CareMan Monatsplan (PNG, JPG)
                  </p>
                </div>
              )}
            </div>

            {/* Processing Progress */}
            {isProcessing && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-slate-300">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Sparkles size={13} className="text-sky-400 animate-spin" />
                    Wird verarbeitet...
                  </span>
                  <span className="font-mono text-sky-400 font-bold">{uploadProgress}%</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-sky-500 h-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Error Message */}
            {uploadError && (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Modal Actions */}
            <div className="pt-1 flex justify-end">
              <button
                disabled={isProcessing}
                onClick={() => {
                  setIsUploadOpen(false);
                  setUploadPreview(null);
                  setUploadError(null);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold disabled:opacity-50"
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
