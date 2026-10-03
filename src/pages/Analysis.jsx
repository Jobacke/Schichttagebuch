import React, { useState, useMemo } from 'react';
import { APP_VERSION } from '../version';
import { useAnalysisLogic } from '../hooks/useAnalysisLogic';
import { useStore } from '../context/StoreContext';
import { exportToPDF } from '../utils/pdfExport';
import { SHIFT_PRESETS } from '../utils/shiftPresets';
import { getShiftColor, STATION_THEMES, detectStation } from '../utils/shiftColors';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

// Helper for CSS Date controls
const addMonths = (date, n) => {
    const d = new Date(date);
    d.setMonth(d.getMonth() + n);
    return d;
};

// Helper: Duration between HH:MM and HH:MM
const calcDuration = (start, end) => {
    if (!start || !end) return '';
    try {
        const [sh, sm] = start.split(':').map(Number);
        const [eh, em] = end.split(':').map(Number);
        let sMin = sh * 60 + sm;
        let eMin = eh * 60 + em;
        if (eMin < sMin) eMin += 24 * 60;
        return ((eMin - sMin) / 60).toFixed(1);
    } catch { return ''; }
};

// Helper: Resolve shift code, type name and color consistently with station awareness
const resolveShiftDetails = (s, storeSettings) => {
    if (!s) return { code: '', rawCode: '', typeName: 'Dienst', colorInfo: getShiftColor('', '') };

    const codeObj = (storeSettings?.shiftCodes || []).find(c => c.id === s.codeId || (s.code && c.code === s.code));
    const typeObj = (storeSettings?.shiftTypes || []).find(t => t.id === s.typeId);

    let rawCode = s.code || codeObj?.code || '';
    if (!rawCode && s.codeId && typeof s.codeId === 'string' && s.codeId.startsWith('preset_')) {
        rawCode = s.codeId.replace('preset_', '');
    }

    const preset = rawCode ? (SHIFT_PRESETS[rawCode] || {}) : {};
    const rawType = s.shiftTypeName || typeObj?.name || codeObj?.shiftTypeName || preset.shiftTypeName || '';
    const station = s.station || preset.station || '';
    const vehicle = s.vehicle || preset.vehicle || '';

    const colorInfo = getShiftColor(rawType, rawCode, station, vehicle);

    // Derive concise display code (never 'DST')
    let displayCode = rawCode;
    if (!displayCode) {
        if (rawType.toLowerCase().includes('spät')) displayCode = 'Spät';
        else if (rawType.toLowerCase().includes('früh')) displayCode = 'Früh';
        else if (rawType.toLowerCase().includes('nacht')) displayCode = 'Nacht';
        else if (rawType.toLowerCase().includes('tag')) displayCode = 'Tag';
        else displayCode = rawType ? rawType.slice(0, 4) : 'Schicht';
    }

    return {
        code: displayCode,
        rawCode,
        typeName: rawType || 'Dienst',
        station: station || colorInfo.stationName,
        stationShort: colorInfo.stationShort,
        colorInfo
    };
};

// Component: Modern Month Calendar & Shift Rhythm Grid
function ShiftRhythmCalendar({ baseDate, filterMode, filteredData, storeSettings }) {
    const [selectedDateStr, setSelectedDateStr] = useState(null);

    // Group shifts by date string YYYY-MM-DD
    const shiftsByDate = useMemo(() => {
        const map = {};
        (filteredData || []).forEach(s => {
            if (!s.date) return;
            if (!map[s.date]) map[s.date] = [];
            map[s.date].push(s);
        });
        return map;
    }, [filteredData]);

    // Handle YEAR mode
    if (filterMode === 'year') {
        const year = baseDate.getFullYear();
        const monthNames = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
        return (
            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '13px', color: '#94a3b8' }}>Jahresübersicht {year}</span>
                    <span style={{ fontSize: '12px', background: 'rgba(249, 115, 22, 0.15)', color: '#f97316', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>
                        {filteredData.length} Schichten gesamt
                    </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
                    {monthNames.map((mName, mIdx) => {
                        const mStr = String(mIdx + 1).padStart(2, '0');
                        const prefix = `${year}-${mStr}`;
                        const monthShifts = filteredData.filter(s => s.date?.startsWith(prefix));
                        let mHours = 0;
                        monthShifts.forEach(s => {
                            const dur = parseFloat(calcDuration(s.startTime, s.endTime)) || 0;
                            mHours += dur;
                        });
                        const daysInM = new Date(year, mIdx + 1, 0).getDate();
                        const monthlyWeekly = storeSettings?.monthlyWeeklyHours?.[prefix] ?? storeSettings?.defaultWeeklyHours ?? 20;
                        const mTarget = (daysInM / 7) * Number(monthlyWeekly);
                        const hasShifts = monthShifts.length > 0;

                        return (
                            <div
                                key={mName}
                                style={{
                                    background: hasShifts ? '#1e293b' : '#0f172a',
                                    border: hasShifts ? '1px solid #334155' : '1px solid rgba(255,255,255,0.03)',
                                    borderRadius: '8px',
                                    padding: '8px 10px'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <span style={{ fontWeight: 700, fontSize: '13px', color: hasShifts ? '#f8fafc' : '#64748b' }}>{mName}</span>
                                    {hasShifts && (
                                        <span style={{ fontSize: '11px', background: '#334155', color: '#facc15', padding: '1px 5px', borderRadius: '4px', fontWeight: 600 }}>
                                            {monthShifts.length} {monthShifts.length === 1 ? 'Dst' : 'Dste'}
                                        </span>
                                    )}
                                </div>
                                <div style={{ fontSize: '12px', fontWeight: 600, color: hasShifts ? '#38bdf8' : '#475569' }}>
                                    {mHours.toFixed(1)} h
                                    <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'normal', marginLeft: '4px' }}>
                                        / {mTarget.toFixed(0)}h
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    // MONTH mode (standard view)
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // Monday-first weekday: Monday=0 ... Sunday=6
    const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;

    const days = [];
    for (let i = 0; i < firstDay; i++) {
        days.push({ empty: true, key: `empty-${i}` });
    }
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayShifts = shiftsByDate[dateStr] || [];
        const isWeekend = ((firstDay + d - 1) % 7) >= 5;
        days.push({
            empty: false,
            dayNum: d,
            dateStr,
            shifts: dayShifts,
            isWeekend,
            key: dateStr
        });
    }

    const shiftDaysCount = Object.keys(shiftsByDate).length;
    const freeDaysCount = Math.max(0, daysInMonth - shiftDaysCount);

    const selectedDayData = selectedDateStr ? days.find(d => !d.empty && d.dateStr === selectedDateStr) : null;
    let selectedDayInfo = null;
    if (selectedDayData) {
        const dObj = new Date(selectedDayData.dateStr);
        selectedDayInfo = {
            dateStr: selectedDayData.dateStr,
            dateFormatted: dObj.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }),
            shifts: selectedDayData.shifts
        };
    }

    return (
        <div>
            {/* Header: Title & Counter Pills */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                <h3 className="text-label" style={{ margin: 0 }}>📅 Schicht-Rhythmus</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{
                        background: 'rgba(249, 115, 22, 0.15)',
                        color: '#f97316',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 700
                    }}>
                        {filteredData.length} {filteredData.length === 1 ? 'Schicht' : 'Schichten'}
                    </span>
                    <span style={{
                        background: 'rgba(148, 163, 184, 0.12)',
                        color: '#94a3b8',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600
                    }}>
                        {freeDaysCount} Tage frei
                    </span>
                </div>
            </div>

            {/* Weekday Labels Header */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '6px' }}>
                {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((wd, i) => (
                    <div
                        key={wd}
                        style={{
                            textAlign: 'center',
                            fontSize: '11px',
                            fontWeight: 700,
                            color: i >= 5 ? '#f97316' : '#64748b',
                            padding: '2px 0'
                        }}
                    >
                        {wd}
                    </div>
                ))}
            </div>

            {/* Calendar Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                {days.map(item => {
                    if (item.empty) {
                        return <div key={item.key} style={{ minHeight: '46px', opacity: 0 }} />;
                    }

                    const hasShift = item.shifts && item.shifts.length > 0;
                    const firstShift = hasShift ? item.shifts[0] : null;
                    const resolved = hasShift ? resolveShiftDetails(firstShift, storeSettings) : null;
                    const shiftColor = resolved?.colorInfo;
                    const isSelected = selectedDateStr === item.dateStr;

                    return (
                        <div
                            key={item.key}
                            onClick={() => setSelectedDateStr(isSelected ? null : item.dateStr)}
                            style={{
                                minHeight: '46px',
                                padding: '4px 2px',
                                borderRadius: '8px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                background: hasShift ? shiftColor.bg : (item.isWeekend ? 'rgba(30, 41, 59, 0.4)' : '#0f172a'),
                                border: isSelected
                                    ? '2px solid #38bdf8'
                                    : (hasShift ? `1px solid ${shiftColor.border}` : '1px solid #1e293b'),
                                boxShadow: isSelected ? '0 0 10px rgba(56, 189, 248, 0.35)' : 'none'
                            }}
                            title={hasShift ? `${resolved.code} (${firstShift.startTime} - ${firstShift.endTime})` : `Tag ${item.dayNum}: Frei`}
                        >
                            {/* Day Number & Station Badge */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '0 2px' }}>
                                <span style={{
                                    fontSize: '11px',
                                    fontWeight: hasShift ? 800 : (item.isWeekend ? 600 : 500),
                                    color: hasShift ? '#f8fafc' : (item.isWeekend ? '#94a3b8' : '#475569'),
                                    lineHeight: 1
                                }}>
                                    {item.dayNum}
                                </span>
                                {hasShift && (
                                    <span style={{
                                        fontSize: '8px',
                                        fontWeight: 800,
                                        color: shiftColor.stationColor,
                                        background: shiftColor.stationBg,
                                        padding: '1px 3px',
                                        borderRadius: '3px',
                                        lineHeight: 1
                                    }}>
                                        {resolved.stationShort}
                                    </span>
                                )}
                            </div>

                            {/* Shift Badge or Free Dot */}
                            {hasShift ? (
                                <div style={{
                                    fontSize: '10px',
                                    fontWeight: 800,
                                    color: shiftColor.color,
                                    lineHeight: 1,
                                    marginTop: '2px',
                                    maxWidth: '100%',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    textAlign: 'center'
                                }}>
                                    {resolved.code}
                                </div>
                            ) : (
                                <div style={{
                                    width: '4px',
                                    height: '4px',
                                    borderRadius: '50%',
                                    background: '#1e293b',
                                    marginBottom: '2px'
                                }} />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Selected Day Inspector */}
            {selectedDayInfo && (
                <div style={{
                    marginTop: '12px',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    background: selectedDayInfo.shifts.length > 0 ? '#1e293b' : 'rgba(15, 23, 42, 0.6)',
                    border: selectedDayInfo.shifts.length > 0 ? '1px solid #334155' : '1px dashed #334155'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: selectedDayInfo.shifts.length > 0 ? '8px' : 0 }}>
                        <span style={{ fontWeight: 700, fontSize: '13px', color: '#f8fafc' }}>
                            📅 {selectedDayInfo.dateFormatted}
                        </span>
                        <button
                            type="button"
                            onClick={() => setSelectedDateStr(null)}
                            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '2px 6px', fontSize: '14px' }}
                            title="Schließen"
                        >
                            ✕
                        </button>
                    </div>

                    {selectedDayInfo.shifts.length === 0 ? (
                        <div style={{ fontSize: '12.5px', color: '#94a3b8', fontStyle: 'italic', paddingTop: '4px' }}>
                            🌴 Dienstfrei – kein Einsatz an diesem Tag
                        </div>
                    ) : (
                        selectedDayInfo.shifts.map((s, idx) => {
                            const dur = calcDuration(s.startTime, s.endTime);
                            const resolvedShift = resolveShiftDetails(s, storeSettings);
                            const shiftCol = resolvedShift.colorInfo;
                            return (
                                <div key={s.id || idx} style={{ marginTop: idx > 0 ? '10px' : 0, borderTop: idx > 0 ? '1px solid #334155' : 'none', paddingTop: idx > 0 ? '8px' : 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <span style={{
                                            background: shiftCol.bg,
                                            color: shiftCol.color,
                                            border: `1px solid ${shiftCol.border}`,
                                            padding: '2px 7px',
                                            borderRadius: '5px',
                                            fontSize: '12px',
                                            fontWeight: 800
                                        }}>
                                            {resolvedShift.code}
                                        </span>
                                        <span style={{ fontWeight: 600, fontSize: '13px', color: '#f1f5f9' }}>
                                            {resolvedShift.typeName}
                                        </span>
                                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                                            🕒 {s.startTime} – {s.endTime} Uhr {dur ? `(${dur} Std)` : ''}
                                        </span>
                                        <span style={{
                                            background: shiftCol.stationBg,
                                            color: shiftCol.stationColor,
                                            border: `1px solid ${shiftCol.stationBorder}`,
                                            padding: '1px 6px',
                                            borderRadius: '4px',
                                            fontSize: '11px',
                                            fontWeight: 700
                                        }}>
                                            📍 {resolvedShift.station}
                                        </span>
                                    </div>
                                    {s.vehicle && (
                                        <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                                            🚑 {s.vehicle}
                                        </div>
                                    )}
                                    {s.partner && (
                                        <div style={{ fontSize: '12px', color: '#38bdf8', marginTop: '3px', fontWeight: 500 }}>
                                            👤 {s.partner}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* Legend: Wachen Farbstruktur */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '14px',
                flexWrap: 'wrap',
                marginTop: '14px',
                paddingTop: '10px',
                borderTop: '1px solid rgba(255,255,255,0.05)',
                fontSize: '11px',
                color: '#94a3b8'
            }}>
                <span style={{ fontWeight: 600, color: '#64748b' }}>Farbstruktur:</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: STATION_THEMES.Sendling.primaryHex }} />
                    <span>Sendling (Blau)</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: STATION_THEMES.Hohenbrunn.primaryHex }} />
                    <span>Hohenbrunn (Grün)</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: STATION_THEMES.Obersendling.primaryHex }} />
                    <span>Obersendling (Orange)</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#334155' }} />
                    <span>Dienstfrei</span>
                </span>
            </div>
        </div>
    );
}

export default function Analysis() {
    const { store } = useStore();
    // Use the decoupled logic hook
    const logic = useAnalysisLogic();
    const {
        loading, label, target, weeklyRate,
        filterMode, setFilterMode, baseDate, setBaseDate,
        customStart, setCustomStart, customEnd, setCustomEnd,
        selectedTypes, setSelectedTypes,
        selectedVehicles, setSelectedVehicles,
        selectedStations, setSelectedStations,
        stats, delta, isInvalid, filteredData
    } = logic;

    const isPositive = delta >= 0;
    const colorClass = isPositive ? 'var(--color-success)' : 'var(--color-danger)';

    const isCurrentMonth = useMemo(() => {
        const now = new Date();
        return baseDate.getFullYear() === now.getFullYear() && baseDate.getMonth() === now.getMonth();
    }, [baseDate]);

    const isCurrentYear = useMemo(() => {
        const now = new Date();
        return baseDate.getFullYear() === now.getFullYear();
    }, [baseDate]);

    const stationDistribution = useMemo(() => {
        const counts = { Sendling: 0, Hohenbrunn: 0, Obersendling: 0 };
        const hours = { Sendling: 0, Hohenbrunn: 0, Obersendling: 0 };
        (filteredData || []).forEach(s => {
            const st = detectStation(s);
            const dur = parseFloat(calcDuration(s.startTime, s.endTime)) || 0;
            counts[st] = (counts[st] || 0) + 1;
            hours[st] = (hours[st] || 0) + dur;
        });
        return Object.entries(counts)
            .filter(([_, count]) => count > 0)
            .map(([st, count]) => ({
                station: st,
                count,
                hours: hours[st],
                theme: STATION_THEMES[st] || STATION_THEMES.Sendling
            }))
            .sort((a, b) => b.count - a.count);
    }, [filteredData]);

    const handleExportPDF = () => {
        exportToPDF({
            label,
            stats,
            delta,
            target,
            filteredData,
            filterMode,
            baseDate,
            storeSettings: store.settings,
            shiftTypes: store.settings?.shiftTypes || [],
            shiftCodes: store.settings?.shiftCodes || []
        });
    };

    if (loading) return <div className="page-content center">Lade Daten...</div>;

    const hasActiveFilters = selectedTypes.length > 0 || selectedVehicles.length > 0 || selectedStations.length > 0;

    return (
        <div className="page-content">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                        Auswertung <span style={{ fontSize: '12px', color: 'var(--color-primary)', background: 'rgba(249, 115, 22, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>v{APP_VERSION}</span>
                    </h1>
                </div>
                <button
                    onClick={handleExportPDF}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: 'rgba(56, 189, 248, 0.12)',
                        border: '1px solid rgba(56, 189, 248, 0.35)',
                        color: '#38bdf8',
                        padding: '8px 14px',
                        borderRadius: '10px',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                    }}
                    title="Monatsdienstplan als PDF exportieren"
                >
                    <span>📄</span>
                    <span>Dienstplan PDF</span>
                </button>
            </div>

            {/* Modern Inline Period & Filter Command Bar */}
            <div className="card-premium" style={{ padding: '14px 16px', marginBottom: '18px' }}>
                {/* Row 1: Mode Switcher & Direct Date Navigation */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
                    
                    {/* Segmented Mode Selector: Monat | Jahr | Zeitraum */}
                    <div style={{
                        display: 'inline-flex',
                        background: '#0f172a',
                        padding: '3px',
                        borderRadius: '10px',
                        border: '1px solid #334155'
                    }}>
                        {[
                            { id: 'month', label: 'Monat' },
                            { id: 'year', label: 'Jahr' },
                            { id: 'custom', label: 'Zeitraum' }
                        ].map(m => (
                            <button
                                key={m.id}
                                type="button"
                                onClick={() => setFilterMode(m.id)}
                                style={{
                                    padding: '6px 14px',
                                    borderRadius: '7px',
                                    border: 'none',
                                    background: filterMode === m.id ? 'var(--color-primary)' : 'transparent',
                                    color: filterMode === m.id ? '#ffffff' : '#94a3b8',
                                    fontWeight: filterMode === m.id ? 700 : 500,
                                    fontSize: '13px',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>

                    {/* Period Navigation Controls */}
                    {filterMode === 'month' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
                                type="button"
                                onClick={() => setBaseDate(addMonths(baseDate, -1))}
                                style={{
                                    background: '#0f172a',
                                    border: '1px solid #334155',
                                    color: '#cbd5e1',
                                    borderRadius: '8px',
                                    padding: '6px 10px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center'
                                }}
                                title="Vorheriger Monat"
                            >
                                <ChevronLeft size={16} />
                            </button>

                            <div style={{
                                fontWeight: 700,
                                fontSize: '15px',
                                color: '#f8fafc',
                                minWidth: '130px',
                                textAlign: 'center'
                            }}>
                                {baseDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}
                            </div>

                            <button
                                type="button"
                                onClick={() => setBaseDate(addMonths(baseDate, 1))}
                                style={{
                                    background: '#0f172a',
                                    border: '1px solid #334155',
                                    color: '#cbd5e1',
                                    borderRadius: '8px',
                                    padding: '6px 10px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center'
                                }}
                                title="Nächster Monat"
                            >
                                <ChevronRight size={16} />
                            </button>

                            {!isCurrentMonth && (
                                <button
                                    type="button"
                                    onClick={() => setBaseDate(new Date())}
                                    style={{
                                        background: 'rgba(249, 115, 22, 0.12)',
                                        border: '1px solid rgba(249, 115, 22, 0.3)',
                                        color: '#f97316',
                                        borderRadius: '8px',
                                        padding: '5px 9px',
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        cursor: 'pointer'
                                    }}
                                    title="Zum aktuellen Monat springen"
                                >
                                    Heute
                                </button>
                            )}
                        </div>
                    )}

                    {filterMode === 'year' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
                                type="button"
                                onClick={() => setBaseDate(addMonths(baseDate, -12))}
                                style={{
                                    background: '#0f172a',
                                    border: '1px solid #334155',
                                    color: '#cbd5e1',
                                    borderRadius: '8px',
                                    padding: '6px 10px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center'
                                }}
                                title="Vorheriges Jahr"
                            >
                                <ChevronLeft size={16} />
                            </button>

                            <div style={{
                                fontWeight: 700,
                                fontSize: '15px',
                                color: '#f8fafc',
                                minWidth: '70px',
                                textAlign: 'center'
                            }}>
                                {baseDate.getFullYear()}
                            </div>

                            <button
                                type="button"
                                onClick={() => setBaseDate(addMonths(baseDate, 12))}
                                style={{
                                    background: '#0f172a',
                                    border: '1px solid #334155',
                                    color: '#cbd5e1',
                                    borderRadius: '8px',
                                    padding: '6px 10px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center'
                                }}
                                title="Nächstes Jahr"
                            >
                                <ChevronRight size={16} />
                            </button>

                            {!isCurrentYear && (
                                <button
                                    type="button"
                                    onClick={() => setBaseDate(new Date())}
                                    style={{
                                        background: 'rgba(249, 115, 22, 0.12)',
                                        border: '1px solid rgba(249, 115, 22, 0.3)',
                                        color: '#f97316',
                                        borderRadius: '8px',
                                        padding: '5px 9px',
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        cursor: 'pointer'
                                    }}
                                >
                                    Dieses Jahr
                                </button>
                            )}
                        </div>
                    )}

                    {filterMode === 'custom' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <input
                                type="date"
                                value={customStart}
                                onChange={(e) => setCustomStart(e.target.value)}
                                style={{
                                    background: '#0f172a',
                                    border: '1px solid #334155',
                                    color: '#fff',
                                    borderRadius: '8px',
                                    padding: '6px 10px',
                                    fontSize: '12px'
                                }}
                            />
                            <span style={{ color: '#64748b' }}>bis</span>
                            <input
                                type="date"
                                value={customEnd}
                                onChange={(e) => setCustomEnd(e.target.value)}
                                style={{
                                    background: '#0f172a',
                                    border: '1px solid #334155',
                                    color: '#fff',
                                    borderRadius: '8px',
                                    padding: '6px 10px',
                                    fontSize: '12px'
                                }}
                            />
                        </div>
                    )}
                </div>

                {/* Row 2: Instant Filter Chips Bar (Shift Types & Vehicles) */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px',
                    paddingTop: '10px',
                    borderTop: '1px solid #334155'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', marginRight: '2px' }}>
                            Schichten:
                        </span>

                        {/* "Alle" Chip */}
                        <button
                            type="button"
                            onClick={() => { setSelectedTypes([]); setSelectedVehicles([]); setSelectedStations([]); }}
                            style={{
                                padding: '4px 10px',
                                borderRadius: '20px',
                                fontSize: '12px',
                                fontWeight: !hasActiveFilters ? 700 : 500,
                                background: !hasActiveFilters ? '#334155' : 'transparent',
                                border: !hasActiveFilters ? '1px solid #475569' : '1px solid #334155',
                                color: !hasActiveFilters ? '#f8fafc' : '#94a3b8',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            Alle
                        </button>

                        {/* Wachen Chips */}
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: '4px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Wachen:</span>
                            {['Sendling', 'Hohenbrunn', 'Obersendling'].map(stName => {
                                const theme = STATION_THEMES[stName];
                                const active = selectedStations.includes(stName);
                                return (
                                    <button
                                        key={stName}
                                        type="button"
                                        onClick={() => setSelectedStations(active ? selectedStations.filter(x => x !== stName) : [...selectedStations, stName])}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            padding: '3px 8px',
                                            borderRadius: '16px',
                                            fontSize: '11px',
                                            fontWeight: active ? 700 : 500,
                                            background: active ? theme.badgeBg : 'transparent',
                                            border: active ? `1px solid ${theme.primaryHex}` : '1px solid #334155',
                                            color: active ? theme.primaryHex : '#94a3b8',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: theme.primaryHex }} />
                                        <span>{stName}</span>
                                        {active && <span style={{ fontSize: '10px' }}>✓</span>}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Shift Type Chips */}
                        {(store.settings?.shiftTypes || []).map(t => {
                            const active = selectedTypes.includes(t.id);
                            const shiftCol = getShiftColor(t.name, '');
                            return (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setSelectedTypes(active ? selectedTypes.filter(x => x !== t.id) : [...selectedTypes, t.id])}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '5px',
                                        padding: '4px 10px',
                                        borderRadius: '20px',
                                        fontSize: '12px',
                                        fontWeight: active ? 700 : 500,
                                        background: active ? shiftCol.bg : 'transparent',
                                        border: active ? `1px solid ${shiftCol.border}` : '1px solid #334155',
                                        color: active ? shiftCol.color : '#94a3b8',
                                        boxShadow: active ? `0 0 8px ${shiftCol.border}` : 'none',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: shiftCol.color }} />
                                    <span>{t.name}</span>
                                    {active && <span style={{ fontSize: '10px' }}>✓</span>}
                                </button>
                            );
                        })}

                        {/* Vehicles if configured */}
                        {(store.settings?.vehicles || []).length > 0 && (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: '4px' }}>
                                <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Fahrzeuge:</span>
                                {(store.settings?.vehicles || []).map(v => {
                                    const active = selectedVehicles.includes(v);
                                    return (
                                        <button
                                            key={v}
                                            type="button"
                                            onClick={() => setSelectedVehicles(active ? selectedVehicles.filter(x => x !== v) : [...selectedVehicles, v])}
                                            style={{
                                                padding: '3px 8px',
                                                borderRadius: '16px',
                                                fontSize: '11px',
                                                fontWeight: active ? 700 : 500,
                                                background: active ? 'rgba(34, 197, 94, 0.15)' : 'transparent',
                                                border: active ? '1px solid #22c55e' : '1px solid #334155',
                                                color: active ? '#22c55e' : '#64748b',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {v} {active && '✓'}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Reset Button (Visible when filters are active) */}
                    {hasActiveFilters && (
                        <button
                            type="button"
                            onClick={() => { setSelectedTypes([]); setSelectedVehicles([]); setSelectedStations([]); }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid rgba(239, 68, 68, 0.25)',
                                color: '#ef4444',
                                padding: '4px 8px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                cursor: 'pointer'
                            }}
                            title="Alle Filter zurücksetzen"
                        >
                            <X size={12} />
                            <span>Filter aufheben ({selectedTypes.length + selectedVehicles.length + selectedStations.length})</span>
                        </button>
                    )}
                </div>
            </div>

            {/* KPI Cards */}
            <div className="stats-grid">
                <div className="stat-card">
                    <span className="text-label">Geleistet</span>
                    <span className="text-value">{stats.actual.toFixed(1)} h</span>
                </div>
                <div className="stat-card">
                    <span className="text-label">Schichten</span>
                    <span className="text-value">{stats.count}</span>
                </div>
                <div className="stat-card full-width" style={{ borderLeft: `4px solid ${colorClass}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <div>
                            <span className="text-label">Saldo (Soll: {target.toFixed(1)}h{filterMode === 'month' ? ` • ${weeklyRate}h/Woche` : ''})</span>
                            <div className="text-value" style={{ color: colorClass }}>
                                {delta > 0 ? '+' : ''}{delta.toFixed(1)} h
                            </div>
                        </div>
                        <div style={{ fontSize: '24px' }}>{isPositive ? "📈" : "📉"}</div>
                    </div>
                </div>
            </div>

            {/* Charts */}
            {stats.count === 0 ? (
                <div className="card-premium center" style={{ padding: '40px', color: '#64748b' }}>
                    <div style={{ fontSize: '40px', marginBottom: '10px' }}>📊</div>
                    Keine Daten für diesen Zeitraum.
                </div>
            ) : (
                <>
                    <div className="card-premium">
                        <ShiftRhythmCalendar
                            baseDate={baseDate}
                            filterMode={filterMode}
                            filteredData={filteredData}
                            storeSettings={store.settings}
                        />
                    </div>

                    <div className="card-premium">
                        <h3 className="text-label" style={{ margin: '0 0 12px 0' }}>🍰 Verteilung</h3>

                        {/* Wachen-Verteilung (Eigenständige Farbstruktur) */}
                        {stationDistribution.length > 0 && (
                            <div style={{ marginBottom: '16px' }}>
                                <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '8px' }}>
                                    Einsätze nach Wachen:
                                </span>
                                {stationDistribution.map((st) => (
                                    <div key={st.station} style={{ marginBottom: '8px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', alignItems: 'center' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: st.theme.primaryHex }} />
                                                <span style={{ fontWeight: 600 }}>{st.theme.name}</span>
                                            </span>
                                            <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                                                <strong style={{ color: st.theme.primaryHex, fontSize: '13px', marginRight: '4px' }}>
                                                    {st.count} {st.count === 1 ? 'Schicht' : 'Schichten'}
                                                </strong>
                                                ({st.hours.toFixed(1)} h)
                                            </span>
                                        </div>
                                        <div style={{ height: '6px', background: '#334155', borderRadius: '3px', marginTop: '4px', overflow: 'hidden' }}>
                                            <div style={{
                                                width: `${(st.count / stats.count) * 100}%`,
                                                height: '100%',
                                                background: st.theme.primaryHex,
                                                borderRadius: '3px'
                                            }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Schichtarten-Verteilung */}
                        <div>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '8px' }}>
                                Schichtarten:
                            </span>
                            {stats.distributionData.map((d, i) => {
                                const shiftCol = getShiftColor(d.name, '');
                                return (
                                    <div key={i} style={{ marginBottom: '10px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', alignItems: 'center' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: shiftCol.color }} />
                                                <span>{d.name}</span>
                                            </span>
                                            <strong style={{ color: shiftCol.color }}>{d.value}</strong>
                                        </div>
                                        <div style={{ height: '6px', background: '#334155', borderRadius: '3px', marginTop: '4px', overflow: 'hidden' }}>
                                            <div style={{
                                                width: `${(d.value / stats.count) * 100}%`,
                                                height: '100%',
                                                background: shiftCol.color,
                                                borderRadius: '3px'
                                            }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="card-premium">
                        <h3 className="text-label" style={{ margin: '0 0 12px 0' }}>📋 Schichten im Detail ({filteredData.length})</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {[...filteredData].sort((a, b) => a.date.localeCompare(b.date)).map((s, index) => {
                                const resolvedShift = resolveShiftDetails(s, store.settings);
                                const d = new Date(s.date);
                                const dateFormatted = d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
                                return (
                                    <div
                                        key={s.id}
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            padding: '10px 12px',
                                            background: '#1e293b',
                                            borderRadius: '8px',
                                            fontSize: '13px',
                                            flexWrap: 'wrap',
                                            gap: '6px'
                                        }}
                                    >
                                        <div style={{ flex: 1, minWidth: '200px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, flexWrap: 'wrap' }}>
                                                <span style={{ color: '#64748b', fontSize: '11px', minWidth: '16px' }}>#{index + 1}</span>
                                                <span style={{ color: 'var(--color-primary)' }}>{dateFormatted}</span>
                                                {resolvedShift.code && (
                                                    <span style={{
                                                        background: resolvedShift.colorInfo.bg,
                                                        color: resolvedShift.colorInfo.color,
                                                        border: `1px solid ${resolvedShift.colorInfo.border}`,
                                                        padding: '1px 6px',
                                                        borderRadius: '4px',
                                                        fontSize: '11px',
                                                        fontWeight: 700
                                                    }}>
                                                        {resolvedShift.code}
                                                    </span>
                                                )}
                                                <span style={{ color: '#f1f5f9' }}>{resolvedShift.typeName}</span>
                                                <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 'normal' }}>({s.startTime} - {s.endTime})</span>
                                                <span style={{
                                                    background: resolvedShift.colorInfo.stationBg,
                                                    color: resolvedShift.colorInfo.stationColor,
                                                    border: `1px solid ${resolvedShift.colorInfo.stationBorder}`,
                                                    padding: '1px 6px',
                                                    borderRadius: '4px',
                                                    fontSize: '11px',
                                                    fontWeight: 700
                                                }}>
                                                    📍 {resolvedShift.station}
                                                </span>
                                                {s.vehicle && (
                                                    <span style={{ color: '#94a3b8', fontSize: '11.5px', fontWeight: 'normal' }}>
                                                        🚑 {s.vehicle}
                                                    </span>
                                                )}
                                            </div>
                                            {s.partner && (
                                                <div style={{ color: '#38bdf8', fontSize: '12.5px', marginTop: '3px', fontWeight: 500 }}>
                                                    👤 {s.partner}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}

        </div>
    );
}
