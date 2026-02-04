import React from 'react';
import { useStore } from '../context/StoreContext';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { Trash2, Clock, MapPin } from 'lucide-react';

function calculateDuration(start, end) {
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);

    let startMinutes = startH * 60 + startM;
    let endMinutes = endH * 60 + endM;

    if (endMinutes < startMinutes) {
        endMinutes += 24 * 60; // Overnight
    }

    return (endMinutes - startMinutes) / 60;
}

export default function Journal() {
    const { store, deleteShift } = useStore();

    // Sort by date desc
    const sortedShifts = [...store.shifts].sort((a, b) =>
        new Date(b.date + 'T' + b.startTime) - new Date(a.date + 'T' + a.startTime)
    );

    // Group by Month
    const grouped = sortedShifts.reduce((acc, shift) => {
        const key = format(parseISO(shift.date), 'MMMM yyyy', { locale: de });
        if (!acc[key]) acc[key] = [];
        acc[key].push(shift);
        return acc;
    }, {});

    if (store.shifts.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] text-[var(--text-muted)]">
                <div className="text-6xl mb-4">🚑</div>
                <p>Keine Einträge vorhanden.</p>
                <p className="text-sm mt-2">Starte mit dem (+) Button.</p>
            </div>
        );
    }

    return (
        <div className="animate-in fade-in duration-500 pb-8">
            <h1 className="sticky top-0 bg-[var(--bg-dark)]/90 backdrop-blur-md z-10 py-4 -mt-4 mb-4 border-b border-white/5">
                Journal
            </h1>

            {Object.entries(grouped).map(([month, shifts]) => (
                <div key={month} className="mb-8">
                    <h3 className="text-[var(--primary)] font-bold mb-4 ml-1 uppercase tracking-wider text-sm">
                        {month}
                    </h3>

                    <div className="space-y-3">
                        {shifts.map(shift => {
                            const duration = calculateDuration(shift.startTime, shift.endTime);
                            const shiftCode = store.settings.shiftCodes.find(c => c.id === shift.codeId);

                            return (
                                <div key={shift.id} className="glass-panel p-4 relative group transition-transform active:scale-[0.98]">
                                    <div className="flex justify-between items-start">

                                        {/* Date Box */}
                                        <div className="flex flex-col items-center bg-[rgba(255,255,255,0.1)] rounded-lg p-2 min-w-[60px]">
                                            <span className="text-xs font-bold text-[var(--text-muted)]">
                                                {format(parseISO(shift.date), 'EEE', { locale: de })}
                                            </span>
                                            <span className="text-xl font-bold">
                                                {format(parseISO(shift.date), 'dd')}
                                            </span>
                                        </div>

                                        {/* Info */}
                                        <div className="flex-1 ml-4">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="font-bold text-lg text-white">
                                                    {shiftCode ? shiftCode.code : '?'}
                                                    <span className="mx-2 text-[var(--text-muted)] text-sm font-normal">
                                                        | {shift.callSign}
                                                    </span>
                                                </span>
                                                <span className={`text-sm font-mono px-2 py-1 rounded ${duration > (shiftCode?.hours || 0) ? 'bg-green-500/20 text-green-400' : 'bg-white/10'
                                                    }`}>
                                                    {duration.toFixed(2)}h
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
                                                <span className="flex items-center gap-1">
                                                    <Clock size={12} /> {shift.startTime} - {shift.endTime}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <MapPin size={12} /> {shift.station}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Delete Button (visible on hover or swipe - simplified here) */}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); if (confirm('Löschen?')) deleteShift(shift.id); }}
                                        className="absolute top-2 right-2 p-2 opacity-0 group-hover:opacity-100 transition-opacity text-[var(--danger)]"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}
