import React, { useState } from 'react';
import { useStore } from '../context/StoreContext';
import { useNavigate } from 'react-router-dom';
import { formatDate, getDaysInMonth, startOfMonth, getDay, isSameDay, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, MapPin, Clock, PenSquare } from 'lucide-react';

export default function Journal() {
    const { store } = useStore();
    const navigate = useNavigate();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(null);

    // Calendar Logic
    const daysInMonth = getDaysInMonth(currentDate);
    const firstDayOfMonth = startOfMonth(currentDate);
    const startDay = (getDay(firstDayOfMonth) + 6) % 7; // Adjust for Monday start

    const monthShifts = store.shifts.filter(s => {
        const d = parseISO(s.date);
        return d.getMonth() === currentDate.getMonth() && d.getFullYear() === currentDate.getFullYear();
    });

    const shiftsOnSelectedDate = selectedDate
        ? monthShifts.filter(s => isSameDay(parseISO(s.date), selectedDate))
        : [];

    const changeMonth = (delta) => {
        const newDate = new Date(currentDate);
        newDate.setMonth(newDate.getMonth() + delta);
        setCurrentDate(newDate);
        setSelectedDate(null);
    };

    return (
        <div>
            <div className="flex-between mb-4">
                <h1>Übersicht</h1>
                <div className="flex items-center gap-4 bg-surface rounded-full px-4 py-2" style={{ background: 'var(--bg-surface)', borderRadius: '24px', padding: '8px 16px' }}>
                    <button onClick={() => changeMonth(-1)}><ChevronLeft size={20} /></button>
                    <span className="font-bold capitalize">{currentDate.toLocaleString('de-DE', { month: 'long', year: 'numeric' })}</span>
                    <button onClick={() => changeMonth(1)}><ChevronRight size={20} /></button>
                </div>
            </div>

            {/* Calendar View */}
            <div className="card mb-4">
                <div className="calendar-grid">
                    {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(day => (
                        <div key={day} className="calendar-day-header">{day}</div>
                    ))}

                    {/* Empty cells for padding */}
                    {Array.from({ length: startDay }).map((_, i) => (
                        <div key={`empty-${i}`} className="calendar-day empty" />
                    ))}

                    {/* Days */}
                    {Array.from({ length: daysInMonth }).map((_, i) => {
                        const dayNum = i + 1;
                        const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), dayNum);
                        const hasShift = monthShifts.some(s => isSameDay(parseISO(s.date), date));
                        const isSelected = selectedDate && isSameDay(date, selectedDate);

                        return (
                            <div
                                key={dayNum}
                                className={`calendar-day ${hasShift ? 'has-shift' : ''} ${isSelected ? 'selected' : ''}`}
                                onClick={() => setSelectedDate(date)}
                            >
                                {dayNum}
                                {hasShift && <div className="shift-dot" />}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* List View */}
            <div>
                <div className="flex-between mb-2">
                    <h2 className="text-secondary text-sm opacity-70 mb-0">
                        {selectedDate
                            ? `Einträge am ${selectedDate.toLocaleDateString('de-DE')}`
                            : 'Aktuelle Schichten'
                        }
                    </h2>
                </div>

                <div className="space-y-4" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {(selectedDate ? shiftsOnSelectedDate : monthShifts).sort((a, b) => new Date(b.date) - new Date(a.date)).map(shift => {
                        const code = store.settings.shiftCodes.find(c => c.id === shift.codeId);

                        return (
                            <div
                                key={shift.id}
                                onClick={() => navigate(`/add?id=${shift.id}`)}
                                className="card relative group active:scale-[0.98] cursor-pointer"
                                style={{ display: 'flex', alignItems: 'center', padding: '16px' }}
                            >
                                {/* Edit Hint Icon */}
                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-secondary">
                                    <PenSquare size={16} />
                                </div>

                                <div style={{
                                    backgroundColor: 'rgba(249, 115, 22, 0.15)',
                                    color: 'var(--primary)',
                                    borderRadius: '12px',
                                    width: '50px',
                                    height: '50px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    marginRight: '16px',
                                    flexShrink: 0
                                }}>
                                    <span style={{ fontSize: '10px', fontWeight: 'bold' }}>
                                        {new Date(shift.date).toLocaleDateString('de-DE', { weekday: 'short' }).toUpperCase()}
                                    </span>
                                    <span style={{ fontSize: '18px', fontWeight: 'bold', lineHeight: '1' }}>
                                        {new Date(shift.date).getDate()}
                                    </span>
                                </div>

                                <div style={{ flex: 1 }}>
                                    <div className="flex-between mb-1">
                                        <span className="font-bold text-lg">{code ? code.code : 'Schicht'}</span>
                                        <span style={{ fontSize: '12px', opacity: 0.6, background: '#334155', padding: '2px 8px', borderRadius: '4px' }}>
                                            {shift.startTime} - {shift.endTime}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3 text-secondary" style={{ fontSize: '13px' }}>
                                        <span className="flex items-center gap-1"><MapPin size={12} /> {shift.station}</span>
                                        <span>•</span>
                                        <span>{shift.vehicle}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {(selectedDate ? shiftsOnSelectedDate : monthShifts).length === 0 && (
                        <div className="text-center py-8 text-secondary">
                            Keine Schichten gefunden.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
