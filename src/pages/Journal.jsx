import React, { useState } from 'react';
import { useStore } from '../context/StoreContext';
import { useNavigate } from 'react-router-dom';
import { getDaysInMonth, startOfMonth, getDay, isSameDay, parseISO } from 'date-fns';
import {
    ChevronLeft, ChevronRight, PenSquare, MapPin, Sparkles,
    CheckCircle2, Trash2, CheckSquare, Square, X, AlertTriangle, Check,
    Calendar as CalendarIcon
} from 'lucide-react';
import CareManImportModal from '../components/CareManImportModal';
import IosCalendarExportModal from '../components/IosCalendarExportModal';
import { getShiftColor } from '../utils/shiftColors';

export default function Journal() {
    const { store, addShifts, ensureCodesAndTypes, deleteShifts } = useStore();
    const navigate = useNavigate();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(null);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [isCalendarExportModalOpen, setIsCalendarExportModalOpen] = useState(false);
    const [toastMessage, setToastMessage] = useState(null);

    // Multi-Selection & Bulk Delete State
    const [isSelectMode, setIsSelectMode] = useState(false);
    const [selectedShiftIds, setSelectedShiftIds] = useState(new Set());
    const [confirmDeleteModal, setConfirmDeleteModal] = useState(null); // { type: 'month' | 'selected', count: number, ids: string[], label: string }
    const [isDeleting, setIsDeleting] = useState(false);

    // --- Calendar Logic ---
    const daysInMonth = getDaysInMonth(currentDate);
    const firstDayOfMonth = startOfMonth(currentDate);
    // 0 = Sunday, 1 = Monday. We want Monday start. 
    const startDay = (getDay(firstDayOfMonth) + 6) % 7;

    const monthShifts = store.shifts.filter(s => {
        const d = parseISO(s.date);
        return d.getMonth() === currentDate.getMonth() && d.getFullYear() === currentDate.getFullYear();
    });

    const shiftsOnSelectedDate = selectedDate
        ? monthShifts.filter(s => isSameDay(parseISO(s.date), selectedDate))
        : [];

    const visibleShifts = selectedDate ? shiftsOnSelectedDate : monthShifts;

    const changeMonth = (delta) => {
        const newDate = new Date(currentDate);
        newDate.setMonth(newDate.getMonth() + delta);
        setCurrentDate(newDate);
        setSelectedDate(null);
        setSelectedShiftIds(new Set());
        setIsSelectMode(false);
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
    const currentMonthLabel = currentDate.toLocaleString('de-DE', { month: 'long', year: 'numeric' });

    // --- Multi-Select & Delete Actions ---
    const toggleSelectShift = (id) => {
        setSelectedShiftIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const allVisibleSelected = visibleShifts.length > 0 && visibleShifts.every(s => selectedShiftIds.has(s.id));

    const toggleSelectAll = () => {
        if (allVisibleSelected) {
            setSelectedShiftIds(new Set());
        } else {
            setSelectedShiftIds(new Set(visibleShifts.map(s => s.id)));
        }
    };

    const requestDeleteSelected = () => {
        if (selectedShiftIds.size === 0) return;
        setConfirmDeleteModal({
            type: 'selected',
            count: selectedShiftIds.size,
            ids: Array.from(selectedShiftIds),
            label: `${selectedShiftIds.size} ausgewählte ${selectedShiftIds.size === 1 ? 'Dienst' : 'Dienste'}`
        });
    };

    const requestDeleteMonth = () => {
        if (monthShifts.length === 0) return;
        setConfirmDeleteModal({
            type: 'month',
            count: monthShifts.length,
            ids: monthShifts.map(s => s.id),
            label: `alle ${monthShifts.length} Dienste im ${currentMonthLabel}`
        });
    };

    const executeDelete = async () => {
        if (!confirmDeleteModal) return;
        setIsDeleting(true);
        try {
            const { ids, label } = confirmDeleteModal;
            const success = await deleteShifts(ids);
            if (success) {
                setSelectedShiftIds(new Set());
                setIsSelectMode(false);
                setConfirmDeleteModal(null);
                setToastMessage(`${label} erfolgreich gelöscht.`);
                setTimeout(() => setToastMessage(null), 5000);
            }
        } finally {
            setIsDeleting(false);
        }
    };

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
            <div className="calendar-header" style={{ alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <img
                        src="/icon.png"
                        alt="Schichttagebuch Logo"
                        style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '11px',
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
                            flexShrink: 0
                        }}
                    />
                    <div>
                        <h1 style={{ margin: 0, fontSize: '24px', lineHeight: 1.15 }}>Übersicht</h1>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                            {monthShifts.length} {monthShifts.length === 1 ? 'Dienst' : 'Dienste'} im Monat
                        </span>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {monthShifts.length > 0 && (
                        <button
                            type="button"
                            onClick={() => setIsCalendarExportModalOpen(true)}
                            className="btn-secondary"
                            style={{
                                fontSize: '13px',
                                padding: '8px 12px',
                                borderRadius: '10px',
                                gap: '6px',
                                background: 'rgba(234, 179, 8, 0.14)',
                                color: '#facc15',
                                border: '1px solid rgba(234, 179, 8, 0.35)',
                                display: 'flex',
                                alignItems: 'center',
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                            title="In iOS Kalender („Familie“) übertragen"
                        >
                            <CalendarIcon size={16} />
                            iOS Kalender („Familie“)
                        </button>
                    )}
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
                        title="Dienstplan aus Screenshot oder Vorlage importieren"
                    >
                        <Sparkles size={16} />
                        Dienstplan importieren
                    </button>
                </div>
            </div>

            {/* Month Switcher Bar with Month Clear Option */}
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
                <div style={{ textAlign: 'center' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '15px' }}>
                        {currentMonthLabel}
                    </span>
                </div>
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

            {/* Shift List Header & Actions Bar */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '24px',
                marginBottom: '12px',
                flexWrap: 'wrap',
                gap: '8px'
            }}>
                <div>
                    <h2 style={{ margin: 0 }}>
                        {selectedDate
                            ? `Dienste am ${selectedDate.toLocaleDateString('de-DE')}`
                            : 'Alle Dienste im Monat'
                        }
                    </h2>
                </div>

                {/* Bulk Actions Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {selectedDate && (
                        <button
                            onClick={() => setSelectedDate(null)}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--color-primary)',
                                fontSize: '12px',
                                cursor: 'pointer',
                                fontWeight: 500,
                                marginRight: '8px'
                            }}
                        >
                            Alle anzeigen
                        </button>
                    )}

                    {monthShifts.length > 0 && !isSelectMode && (
                        <>
                            <button
                                type="button"
                                onClick={() => setIsSelectMode(true)}
                                className="filter-chip"
                                style={{
                                    fontSize: '12px',
                                    padding: '6px 10px',
                                    borderRadius: '8px',
                                    gap: '4px'
                                }}
                            >
                                <CheckSquare size={14} />
                                Auswählen
                            </button>

                            <button
                                type="button"
                                onClick={requestDeleteMonth}
                                className="filter-chip"
                                style={{
                                    fontSize: '12px',
                                    padding: '6px 10px',
                                    borderRadius: '8px',
                                    gap: '4px',
                                    color: 'var(--color-danger)',
                                    borderColor: 'rgba(239, 68, 68, 0.3)'
                                }}
                                title="Alle Dienste dieses Monats auf einmal löschen"
                            >
                                <Trash2 size={14} />
                                Monat leeren
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Selection Toolbar when isSelectMode is active */}
            {isSelectMode && (
                <div style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-primary)',
                    borderRadius: '12px',
                    padding: '10px 14px',
                    marginBottom: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '10px',
                    animation: 'fadeIn 0.2s ease-out'
                }}>
                    <button
                        type="button"
                        onClick={toggleSelectAll}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--color-text-main)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 600
                        }}
                    >
                        {allVisibleSelected ? <CheckSquare size={16} color="var(--color-primary)" /> : <Square size={16} />}
                        <span>{allVisibleSelected ? 'Keine auswählen' : 'Alle auswählen'}</span>
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                            <strong style={{ color: 'var(--color-primary)' }}>{selectedShiftIds.size}</strong> ausgewählt
                        </span>

                        <button
                            type="button"
                            onClick={requestDeleteSelected}
                            disabled={selectedShiftIds.size === 0}
                            style={{
                                background: selectedShiftIds.size > 0 ? 'var(--color-danger)' : 'rgba(239, 68, 68, 0.2)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '6px 12px',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: selectedShiftIds.size > 0 ? 'pointer' : 'not-allowed',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                opacity: selectedShiftIds.size > 0 ? 1 : 0.6
                            }}
                        >
                            <Trash2 size={14} />
                            Ausgewählte löschen ({selectedShiftIds.size})
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                setIsSelectMode(false);
                                setSelectedShiftIds(new Set());
                            }}
                            className="btn-secondary"
                            style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '8px' }}
                        >
                            Fertig
                        </button>
                    </div>
                </div>
            )}

            {/* Shift List Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {visibleShifts
                    .slice()
                    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || '').localeCompare(b.startTime || ''))
                    .map(shift => {
                        const code = store.settings.shiftCodes.find(c => c.id === shift.codeId || c.code === shift.code);
                        const displayCode = code ? code.code : (shift.code || 'Schicht');
                        const dayName = new Date(shift.date).toLocaleDateString('de-DE', { weekday: 'short' }).toUpperCase();
                        const dayNum = new Date(shift.date).getDate();
                        const isSelected = selectedShiftIds.has(shift.id);
                        const shiftCol = getShiftColor(shift.shiftTypeName || '', displayCode, shift.station, shift.vehicle);

                        return (
                            <div
                                key={shift.id}
                                className="card-premium"
                                onClick={() => {
                                    if (isSelectMode) {
                                        toggleSelectShift(shift.id);
                                    } else {
                                        navigate(`/add?id=${shift.id}`);
                                    }
                                }}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    cursor: 'pointer',
                                    padding: '12px',
                                    border: isSelected ? '1px solid var(--color-primary)' : 'var(--glass-border)',
                                    background: isSelected ? 'rgba(249, 115, 22, 0.08)' : 'var(--color-surface)',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                {/* Checkbox in select mode */}
                                {isSelectMode && (
                                    <div
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleSelectShift(shift.id);
                                        }}
                                        style={{ marginRight: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => toggleSelectShift(shift.id)}
                                            style={{
                                                width: '18px',
                                                height: '18px',
                                                accentColor: 'var(--color-primary)',
                                                cursor: 'pointer'
                                            }}
                                        />
                                    </div>
                                )}

                                {/* Date Box in station colors */}
                                <div style={{
                                    background: shiftCol.stationBg,
                                    color: shiftCol.stationColor,
                                    border: `1px solid ${shiftCol.stationBorder}`,
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
                                        <span style={{ fontSize: '16px', fontWeight: 'bold', color: shiftCol.color }}>
                                            {displayCode}
                                        </span>
                                        <span style={{ fontSize: '12px', background: '#334155', padding: '2px 8px', borderRadius: '4px', color: '#cbd5e1' }}>
                                            {shift.startTime} - {shift.endTime}
                                        </span>
                                    </div>
                                    {(shift.station || shift.vehicle) && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#94a3b8', flexWrap: 'wrap' }}>
                                            {shift.station && (
                                                <>
                                                    <MapPin size={12} color={shiftCol.stationColor} />
                                                    <span style={{ color: shiftCol.stationColor, fontWeight: 600 }}>{shift.station}</span>
                                                </>
                                            )}
                                            {shift.station && shift.vehicle && <span>•</span>}
                                            {shift.vehicle && <span>{shift.vehicle}</span>}
                                        </div>
                                    )}
                                    {shift.partner && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#38bdf8', fontWeight: 500, marginTop: '3px' }}>
                                            <span>👤 {shift.partner}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Single Delete or Edit Icon */}
                                {!isSelectMode && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '8px' }}>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setConfirmDeleteModal({
                                                    type: 'selected',
                                                    count: 1,
                                                    ids: [shift.id],
                                                    label: `den Dienst am ${new Date(shift.date).toLocaleDateString('de-DE')} (${displayCode})`
                                                });
                                            }}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                color: 'var(--color-text-muted)',
                                                cursor: 'pointer',
                                                padding: '6px'
                                            }}
                                            title="Diesen Dienst löschen"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                        <PenSquare size={16} style={{ opacity: 0.5, marginLeft: '4px' }} />
                                    </div>
                                )}
                            </div>
                        );
                    })}

                {visibleShifts.length === 0 && (
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

            {/* Confirm Delete Modal */}
            {confirmDeleteModal && (
                <div className="modal-overlay" style={{ alignItems: 'center' }}>
                    <div className="modal-content" style={{ maxWidth: '440px', borderRadius: '20px' }}>
                        <div className="modal-header" style={{ padding: '16px 20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--color-danger)' }}>
                                <AlertTriangle size={22} />
                                <h3 style={{ margin: 0, fontSize: '17px', color: 'var(--color-text-main)' }}>
                                    {confirmDeleteModal.type === 'month' ? 'Monatsdienstplan löschen?' : 'Dienste löschen?'}
                                </h3>
                            </div>
                            <button
                                className="close-btn"
                                onClick={() => setConfirmDeleteModal(null)}
                                disabled={isDeleting}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="modal-body" style={{ padding: '16px 20px', fontSize: '14px', lineHeight: 1.5, color: '#cbd5e1' }}>
                            Möchtest du wirklich <strong>{confirmDeleteModal.label}</strong> unwiderruflich aus der App löschen?
                        </div>

                        <div className="modal-footer" style={{ padding: '16px 20px' }}>
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => setConfirmDeleteModal(null)}
                                disabled={isDeleting}
                                style={{ flex: 1 }}
                            >
                                Abbrechen
                            </button>
                            <button
                                type="button"
                                onClick={executeDelete}
                                disabled={isDeleting}
                                style={{
                                    flex: 1,
                                    background: 'var(--color-danger)',
                                    color: 'white',
                                    border: 'none',
                                    padding: '12px 16px',
                                    borderRadius: 'var(--radius-button)',
                                    fontWeight: 600,
                                    fontSize: '14px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px'
                                }}
                            >
                                <Trash2 size={16} />
                                {isDeleting ? 'Wird gelöscht...' : 'Ja, löschen'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* CareMan Import Modal */}
            <CareManImportModal
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
                onImportSuccess={handleImportSuccess}
                store={store}
                addShifts={addShifts}
                ensureCodesAndTypes={ensureCodesAndTypes}
                initialYearMonth={currentYearMonthStr}
            />

            {/* iOS Calendar Export Modal */}
            <IosCalendarExportModal
                isOpen={isCalendarExportModalOpen}
                onClose={() => setIsCalendarExportModalOpen(false)}
                shifts={monthShifts}
                currentMonthLabel={currentMonthLabel}
                yearMonth={currentYearMonthStr}
                storeSettings={store.settings}
            />
        </div>
    );
}
