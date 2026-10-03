import React, { useState } from 'react';
import { useStore } from '../context/StoreContext';
import { useNavigate } from 'react-router-dom';
import { getDaysInMonth, startOfMonth, getDay, isSameDay, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight, PenSquare, MapPin, Sparkles, CheckCircle2 } from 'lucide-react';
import CareManImportModal from '../components/CareManImportModal';

export default function Journal() {
    const { store, addShifts, ensureCodesAndTypes } = useStore();
    const navigate = useNavigate();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(null);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [toastMessage, setToastMessage] = useState(null);

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

    const handleImportSuccess = (yearMonth, count) => {
        const [y, m] = yearMonth.split('-').map(Number);
        setCurrentDate(new Date(y, m - 1, 1));
        setSelectedDate(null);
        const monthLabel = new Date(y, m - 1, 1).toLocaleString('de-DE', { month: 'long', year: 'numeric' });
        setToastMessage(`${count} Schichten für ${monthLabel} erfolgreich eingetragen!`);
        setTimeout(() => setToastMessage(null), 6000);
    };

    const currentYearMonthStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

    return (
        <div className="page-content">
            {/* Toast Notification */}
            {toastMessage && (
                <div style={{
                    background: 'rgba(34, 197, 94, 0.15)',
                    border: '1px solid rgba(34, 197, 94, 0.4)',
                    color: 'var(--color-success)',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    fontSize: '14px',
                    fontWeight: 500,
                    animation: 'fadeIn 0.2s ease-out'
                }}>
                    <CheckCircle2 size={18} />
                    <span>{toastMessage}</span>
                </div>
            )}

            {/* Header */}
            <div className="calendar-header" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h1 style={{ margin: 0 }}>Übersicht</h1>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        {monthShifts.length} {monthShifts.length === 1 ? 'Dienst' : 'Dienste'} im Monat
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                        type="button"
                        onClick={() => setIsImportModalOpen(true)}
                        className="btn-primary"
                        style={{
                            fontSize: '13px',
                            padding: '8px 12px',
                            borderRadius: '10px',
                            gap: '6px'
                        }}
                        title="Dienstplan aus CareMan oder Screenshot importieren"
                    >
                        <Sparkles size={16} />
                        Dienstplan importieren
                    </button>
                </div>
            </div>

            {/* Month Switcher Bar */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'var(--color-surface)',
                borderRadius: '12px',
                padding: '8px 12px',
                marginBottom: '16px',
                border: 'var(--glass-border)'
            }}>
                <button className="btn-icon" onClick={() => changeMonth(-1)} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-main)', cursor: 'pointer', padding: '6px' }}>
                    <ChevronLeft size={20} />
                </button>
                <span style={{ fontWeight: 'bold', fontSize: '15px' }}>
                    {currentDate.toLocaleString('de-DE', { month: 'long', year: 'numeric' })}
                </span>
                <button className="btn-icon" onClick={() => changeMonth(1)} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-main)', cursor: 'pointer', padding: '6px' }}>
                    <ChevronRight size={20} />
                </button>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px', marginBottom: '12px' }}>
                <h2 style={{ margin: 0 }}>
                    {selectedDate
                        ? `Dienste am ${selectedDate.toLocaleDateString('de-DE')}`
                        : 'Alle Dienste im Monat'
                    }
                </h2>
                {selectedDate && (
                    <button
                        onClick={() => setSelectedDate(null)}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--color-primary)',
                            fontSize: '12px',
                            cursor: 'pointer',
                            fontWeight: 500
                        }}
                    >
                        Alle anzeigen
                    </button>
                )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {(selectedDate ? shiftsOnSelectedDate : monthShifts)
                    .sort((a, b) => new Date(b.date) - new Date(a.date)) // Sort newest first
                    .map(shift => {
                        const code = store.settings.shiftCodes.find(c => c.id === shift.codeId || c.code === shift.code);
                        const displayCode = code ? code.code : (shift.code || 'Schicht');
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
                                        <span style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--color-primary)' }}>
                                            {displayCode}
                                        </span>
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
                    <div style={{
                        padding: '30px 20px',
                        textAlign: 'center',
                        color: 'var(--color-text-muted)',
                        background: 'var(--color-surface)',
                        borderRadius: '16px',
                        border: 'var(--glass-border)'
                    }}>
                        <div style={{ marginBottom: '12px', fontSize: '14px' }}>Keine Einträge für diesen Monat vorhanden.</div>
                        <button
                            type="button"
                            className="btn-primary"
                            onClick={() => setIsImportModalOpen(true)}
                            style={{ margin: '0 auto', fontSize: '13px', padding: '8px 16px' }}
                        >
                            <Sparkles size={16} />
                            Dienstplan für diesen Monat importieren
                        </button>
                    </div>
                )}
            </div>

            {/* CareMan Import Modal */}
            <CareManImportModal
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
                onImportSuccess={handleImportSuccess}
                store={store}
                addShifts={addShifts}
                ensureCodesAndTypes={ensureCodesAndTypes}
                initialYearMonth={currentYearMonthStr.startsWith('2026-11') ? '2026-11' : currentYearMonthStr}
            />
        </div>
    );
}
