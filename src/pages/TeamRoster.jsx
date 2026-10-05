import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Users, ChevronLeft, ChevronRight, Search,
  UploadCloud, X, CheckCircle2, Sparkles, AlertCircle, FileText
} from 'lucide-react';
import {
  getActiveTeamRoster,
  saveActiveTeamRoster,
  runTeamRosterOcr,
  parseTeamRoster
} from '../utils/teamRosterParser';
import { parseCareManPdf } from '../utils/teamRosterPdfParser';
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

  // Handle File Upload (PDF or Image)
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setIsProcessing(true);
    setUploadProgress(15);

    try {
      let parsedRoster;

      // 1. PDF File Upload (Direct Vector Text - 100% Precision)
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        setUploadProgress(30);
        parsedRoster = await parseCareManPdf(file, p => {
          setUploadProgress(Math.min(85, 30 + Math.round(p * 0.5)));
        });
      } else {
        // 2. Image / Screenshot Upload (OCR)
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

  return (
    <div className="team-roster-container pb-28 max-w-lg mx-auto px-3">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-500 text-white px-5 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 backdrop-blur-md text-xs font-semibold animate-fadeIn">
          <CheckCircle2 size={16} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header: Title & Upload Button */}
      <div className="flex items-center justify-between gap-2 pt-2 pb-3">
        <div className="flex items-center gap-2">
          <Users className="text-sky-400" size={22} />
          <h1 className="text-xl font-bold text-white tracking-tight">
            Wer hat Dienst?
          </h1>
        </div>

        <button
          onClick={() => setIsUploadOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-sky-400 hover:text-sky-300 border border-slate-700 text-xs font-medium transition-all active:scale-95"
          title="Neuen Dienstplan hochladen"
        >
          <UploadCloud size={15} />
          <span>Plan laden</span>
        </button>
      </div>

      {/* Rock-solid Single-Row Date Stepper */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-2 px-3 mb-3 backdrop-blur-md flex items-center justify-between gap-2 shadow-sm">
        <button
          onClick={handlePrevDay}
          className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 active:scale-95 transition-all shrink-0"
          title="Vorheriger Tag"
        >
          <ChevronLeft size={20} />
        </button>

        <div className="flex items-center justify-center gap-2 min-w-0">
          <span className="text-sm font-bold text-white truncate">
            {formattedSelectedDate}
          </span>
          <span className="text-xs text-slate-400 shrink-0">
            • {currentDayShifts.length} im Dienst
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleToday}
            className="px-2 py-1 text-xs font-semibold rounded-lg bg-slate-800 text-sky-400 hover:bg-slate-700 active:scale-95 transition-all"
          >
            Heute
          </button>
          <button
            onClick={handleNextDay}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 active:scale-95 transition-all shrink-0"
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
          placeholder="Kollege oder Kürzel suchen..."
          className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500/50 transition-all"
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

      {/* Clean Flat List: Only Name & Shift Code */}
      <div className="space-y-1">
        {currentDayShifts.length === 0 ? (
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
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-800/60 shadow-sm">
            {currentDayShifts.map((shift, idx) => {
              const colorInfo = getShiftColor('', shift.code);
              const isJohannes = shift.name.toLowerCase().includes('backhaus');

              return (
                <div
                  key={`${shift.name}-${idx}`}
                  className={`flex items-center justify-between px-3.5 py-2.5 transition-colors ${
                    isJohannes
                      ? 'bg-sky-500/15'
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
        )}
      </div>

      {/* Upload Screenshot / PDF Modal */}
      {isUploadOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm p-5 shadow-2xl space-y-4">
            <div className="flex items-start justify-between pb-2 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <UploadCloud className="text-sky-400" size={18} />
                  Dienstplan laden
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  PDF (empfohlen) oder Screenshot auswählen
                </p>
              </div>
              <button
                onClick={() => {
                  if (!isProcessing) {
                    setIsUploadOpen(false);
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
                accept="application/pdf,image/*"
                className="hidden"
                onChange={handleFileChange}
              />

              <div className="space-y-1.5">
                <div className="flex justify-center gap-2 text-sky-400 mb-1">
                  <FileText size={24} />
                  <UploadCloud size={24} />
                </div>
                <div className="text-xs font-semibold text-slate-200">
                  CareMan Datei auswählen
                </div>
                <p className="text-[10px] text-slate-400">
                  <span className="text-emerald-400 font-medium">Tipp:</span> Als <strong className="text-white">PDF</strong> ausdrucken/speichern für 100% perfekte Erkennung!
                </p>
              </div>
            </div>

            {/* Processing Progress */}
            {isProcessing && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-slate-300">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Sparkles size={13} className="text-sky-400 animate-spin" />
                    Dienstplan wird eingelesen...
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
