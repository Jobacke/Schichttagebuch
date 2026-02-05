import React, { useState } from 'react';
import { useStore } from '../context/StoreContext';
import { useNavigate } from 'react-router-dom';
import { getDaysInMonth, startOfMonth, getDay, isSameDay, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight, PenSquare, MapPin } from 'lucide-react';

export default function Journal() {
    const { store } = useStore();
    const navigate = useNavigate();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(null);

    // --- Calendar Logic ---
    const daysInMonth = getDaysInMonth(currentDate);
    const firstDayOfMonth = startOfMonth(currentDate);
    // 0 = Sunday, 1 = Monday. We want Monday start. 
    // If getDay returns 0 (Sun), we need 6 empty slots. If 1 (Mon), 0 empty.
    const startDay = (getDay(firstDayOfMonth) + 6) % 7;

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
        <div className="page-content">
            {/* Header */}
            <div className="calendar-header">
                <h1>Übersicht</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button className="btn-icon" onClick={() => changeMonth(-1)}><ChevronLeft size={20} /></button>
                    <span style={{ fontWeight: 'bold', minWidth: '120px', textAlign: 'center' }}>
                        {currentDate.toLocaleString('de-DE', { month: 'long', year: 'numeric' })}
                    </span>
                    <button className="btn-icon" onClick={() => changeMonth(1)}><ChevronRight size={20} /></button>
                </div>
            </div>

            {/* Calendar Grid */}
            <div className="calendar-wrapper">
                <div className="calendar-grid">
                    {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(day => (
                        <div key={day} className="day-cell header">{day}</div>
                    ))}

                    {/* Empty Padding Cells */}
                    {Array.from({ length: startDay }).map((_, i) => (
                        <div key={`empty-${i}`} className="day-cell empty" />
                    ))}

                    {/* Actual Days */}
                    {Array.from({ length: daysInMonth }).map((_, i) => {
                        const dayNum = i + 1;
                        const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), dayNum);
                        const hasShift = monthShifts.some(s => isSameDay(parseISO(s.date), date));
                        const isSelected = selectedDate && isSameDay(date, selectedDate);

                        return (
                            <div
                                key={dayNum}
                                className={`day-cell ${hasShift ? 'has-shift' : ''} ${isSelected ? 'selected' : ''}`}
                                onClick={() => setSelectedDate(date)}
                            >
                                {dayNum}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Shift List */}
            <h2 style={{ marginTop: '24px' }}>
                {selectedDate
                    ? `Dienste am ${selectedDate.toLocaleDateString('de-DE')}`
                    : 'Alle Dienste im Monat'
                }
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {(selectedDate ? shiftsOnSelectedDate : monthShifts)
                    .sort((a, b) => new Date(b.date) - new Date(a.date)) // Sort newest first
                    .map(shift => {
                        const code = store.settings.shiftCodes.find(c => c.id === shift.codeId);
                        const dayName = new Date(shift.date).toLocaleDateString('de-DE', { weekday: 'short' }).toUpperCase();
                        const dayNum = new Date(shift.date).getDate();

                        return (
                            <div
                                key={shift.id}
                                className="card-premium"
                                onClick={() => navigate(`/add?id=${shift.id}`)}
                                style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '12px' }}
                            >
                                {/* Date Box */}
                                <div style={{
                                    background: 'rgba(249, 115, 22, 0.15)',
                                    color: 'var(--color-primary)',
                                    borderRadius: '12px',
                                    minWidth: '50px',
                                    height: '50px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    marginRight: '16px'
                                }}>
                                    <span style={{ fontSize: '10px', fontWeight: 'bold' }}>{dayName}</span>
                                    <span style={{ fontSize: '18px', fontWeight: 'bold', lineHeight: 1 }}>{dayNum}</span>
                                </div>

                                {/* Details */}
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <span style={{ fontSize: '16px', fontWeight: 'bold' }}>{code ? code.code : 'Schicht'}</span>
                                        <span style={{ fontSize: '12px', background: '#334155', padding: '2px 8px', borderRadius: '4px', color: '#cbd5e1' }}>
                                            {shift.startTime} - {shift.endTime}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#94a3b8' }}>
                                        <MapPin size={12} />
                                        <span>{shift.station}</span>
                                        <span>•</span>
                                        <span>{shift.vehicle}</span>
                                    </div>
                                </div>

                                {/* Edit Icon */}
                                <PenSquare size={16} style={{ marginLeft: '8px', opacity: 0.5 }} />
                            </div>
                        );
                    })}

                {(selectedDate ? shiftsOnSelectedDate : monthShifts).length === 0 && (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                        Keine Einträge vorhanden.
                    </div>
                )}
            </div>
        </div>
    );
}
