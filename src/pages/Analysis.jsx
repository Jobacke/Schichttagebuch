import React, { useState, useMemo } from 'react';
import { APP_VERSION } from '../version';
import { useAnalysisLogic } from '../hooks/useAnalysisLogic';
import { useStore, getShiftBonusAmount } from '../context/StoreContext';
import { exportToPDF } from '../utils/pdfExport';
import { SHIFT_PRESETS } from '../utils/shiftPresets';
import { getShiftColor, STATION_THEMES, detectStation } from '../utils/shiftColors';
import { ChevronLeft, ChevronRight, X, SlidersHorizontal } from 'lucide-react';

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

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // Handle YEAR mode
    if (filterMode === 'year') {
        const year = baseDate.getFullYear();
        const currentYear = now.getFullYear();
        const currentMonthIdx = now.getMonth();
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
                        let mBonusCount = 0;
                        let mBonusSum = 0;
                        monthShifts.forEach(s => {
                            const dur = parseFloat(calcDuration(s.startTime, s.endTime)) || 0;
                            mHours += dur;
                            const bAmt = getShiftBonusAmount(s, storeSettings);
                            if (bAmt > 0) {
                                mBonusCount++;
                                mBonusSum += bAmt;
                            }
                        });
                        const daysInM = new Date(year, mIdx + 1, 0).getDate();
                        const monthlyWeekly = storeSettings?.monthlyWeeklyHours?.[prefix] ?? storeSettings?.defaultWeeklyHours ?? 20;
                        const mTarget = (daysInM / 7) * Number(monthlyWeekly);
                        const hasShifts = monthShifts.length > 0;
                        const isCurrentMonth = year === currentYear && mIdx === currentMonthIdx;

                        return (
                            <div
                                key={mName}
                                style={{
                                    background: hasShifts ? '#1e293b' : '#0f172a',
                                    border: isCurrentMonth
                                        ? '1.5px solid #f97316'
                                        : (mBonusCount > 0 ? '1px solid rgba(250, 204, 21, 0.4)' : (hasShifts ? '1px solid #334155' : '1px solid rgba(255,255,255,0.03)')),
                                    boxShadow: isCurrentMonth ? '0 0 10px rgba(249, 115, 22, 0.25)' : 'none',
                                    borderRadius: '8px',
                                    padding: '8px 10px'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <span style={{ fontWeight: 700, fontSize: '13px', color: isCurrentMonth ? '#f97316' : (hasShifts ? '#f8fafc' : '#64748b') }}>{mName}</span>
                                        {isCurrentMonth && (
                                            <span style={{ fontSize: '9px', background: '#f97316', color: '#fff', padding: '1px 4px', borderRadius: '4px', fontWeight: 800 }}>
                                                Jetzt
                                            </span>
                                        )}
                                    </div>
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
                                {mBonusCount > 0 && (
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#facc15', marginTop: '3px' }}>
                                        💰 {mBonusCount}x ({mBonusSum.toFixed(0)} €)
                                    </div>
                                )}
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
        const isToday = dateStr === todayStr;
        days.push({
            empty: false,
            dayNum: d,
            dateStr,
            shifts: dayShifts,
            isWeekend,
            isToday,
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
                    const isToday = item.isToday;
                    const hasBonusDay = hasShift && item.shifts.some(sh => sh.hasBonus);

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
                                    : (isToday
                                        ? '2px solid #f97316'
                                        : (hasBonusDay ? '1px solid #facc15' : (hasShift ? `1px solid ${shiftColor.border}` : '1px solid #1e293b'))),
                                boxShadow: isSelected
                                    ? '0 0 10px rgba(56, 189, 248, 0.35)'
                                    : (isToday ? '0 0 10px rgba(249, 115, 22, 0.45)' : 'none')
                            }}
                            title={hasShift ? `${resolved.code} (${firstShift.startTime} - ${firstShift.endTime})${hasBonusDay ? ' • 💰 Bonus' : ''}${isToday ? ' • Heute' : ''}` : `Tag ${item.dayNum}: Frei${isToday ? ' • Heute' : ''}`}
                        >
                            {/* Day Number & Station Badge */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '0 2px' }}>
                                {isToday ? (
                                    <span style={{
                                        background: '#f97316',
                                        color: '#ffffff',
                                        borderRadius: '50%',
                                        width: '18px',
                                        height: '18px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '10.5px',
                                        fontWeight: 800,
                                        lineHeight: 1,
                                        boxShadow: '0 2px 5px rgba(249, 115, 22, 0.6)'
                                    }}>
                                        {item.dayNum}
                                    </span>
                                ) : (
                                    <span style={{
                                        fontSize: '11px',
                                        fontWeight: hasShift ? 800 : (item.isWeekend ? 600 : 500),
                                        color: hasShift ? '#f8fafc' : (item.isWeekend ? '#94a3b8' : '#475569'),
                                        lineHeight: 1
                                    }}>
                                        {item.dayNum}
                                    </span>
                                )}
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

                            {/* Shift Badge or Free Dot / Heute */}
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
                                    {resolved.code}{hasBonusDay ? '💰' : ''}
                                </div>
                            ) : isToday ? (
                                <div style={{
                                    fontSize: '9px',
                                    fontWeight: 800,
                                    color: '#f97316',
                                    lineHeight: 1,
                                    letterSpacing: '0.2px'
                                }}>
                                    Heute
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
                            📅 {selectedDayInfo.dateFormatted}{selectedDayInfo.dateStr === todayStr ? ' (Heute)' : ''}
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
                            const bAmt = getShiftBonusAmount(s, storeSettings);
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
                                        {bAmt > 0 && (
                                            <span style={{
                                                background: 'rgba(250, 204, 21, 0.15)',
                                                color: '#facc15',
                                                border: '1px solid rgba(250, 204, 21, 0.4)',
                                                padding: '1px 6px',
                                                borderRadius: '4px',
                                                fontSize: '11px',
                                                fontWeight: 800
                                            }}>
                                                💰 +{bAmt} € Bonus
                                            </span>
                                        )}
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
    const { store, toggleShiftBonus } = useStore();
    // Use the decoupled logic hook
    const logic = useAnalysisLogic();
    const {
        loading, label, target, weeklyRate,
        filterMode, setFilterMode, baseDate, setBaseDate,
        customStart, setCustomStart, customEnd, setCustomEnd,
        selectedTypes, setSelectedTypes,
        selectedVehicles, setSelectedVehicles,
        selectedStations, setSelectedStations,
        onlyBonus, setOnlyBonus,
        stats, bonusOverview, delta, isInvalid, filteredData
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

    const [showFilterModal, setShowFilterModal] = useState(false);
    const [showBonusModal, setShowBonusModal] = useState(false);

    if (loading) return <div className="page-content center">Lade Daten...</div>;

    const hasActiveFilters = selectedTypes.length > 0 || selectedVehicles.length > 0 || selectedStations.length > 0 || onlyBonus;
    const activeFilterCount = selectedTypes.length + selectedVehicles.length + selectedStations.length + (onlyBonus ? 1 : 0);

    return (
        <div className="page-content">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                        Auswertung <span style={{ fontSize: '12px', color: 'var(--color-primary)', background: 'rgba(249, 115, 22, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>v{APP_VERSION}</span>
                    </h1>
                </div>
            </div>

            {/* Compact Period & Filter Command Bar */}
            <div className="card-premium" style={{ padding: '12px 14px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    
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
                                    padding: '6px 13px',
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

                    {/* Right Side: Period Navigation + Filter PopUp Trigger */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginLeft: 'auto' }}>
                        {filterMode === 'month' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <button
                                    type="button"
                                    onClick={() => setBaseDate(addMonths(baseDate, -1))}
                                    style={{
                                        background: '#0f172a',
                                        border: '1px solid #334155',
                                        color: '#cbd5e1',
                                        borderRadius: '8px',
                                        padding: '6px 9px',
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
                                    fontSize: '14px',
                                    color: '#f8fafc',
                                    minWidth: '122px',
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
                                        padding: '6px 9px',
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
                                            padding: '5px 8px',
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <button
                                    type="button"
                                    onClick={() => setBaseDate(addMonths(baseDate, -12))}
                                    style={{
                                        background: '#0f172a',
                                        border: '1px solid #334155',
                                        color: '#cbd5e1',
                                        borderRadius: '8px',
                                        padding: '6px 9px',
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
                                    minWidth: '64px',
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
                                        padding: '6px 9px',
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
                                            padding: '5px 8px',
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <input
                                    type="date"
                                    value={customStart}
                                    onChange={(e) => setCustomStart(e.target.value)}
                                    style={{
                                        background: '#0f172a',
                                        border: '1px solid #334155',
                                        color: '#fff',
                                        borderRadius: '8px',
                                        padding: '6px 8px',
                                        fontSize: '12px'
                                    }}
                                />
                                <span style={{ color: '#64748b', fontSize: '12px' }}>bis</span>
                                <input
                                    type="date"
                                    value={customEnd}
                                    onChange={(e) => setCustomEnd(e.target.value)}
                                    style={{
                                        background: '#0f172a',
                                        border: '1px solid #334155',
                                        color: '#fff',
                                        borderRadius: '8px',
                                        padding: '6px 8px',
                                        fontSize: '12px'
                                    }}
                                />
                            </div>
                        )}

                        {/* Filter PopUp Trigger Button */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <button
                                type="button"
                                onClick={() => setShowFilterModal(true)}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    background: hasActiveFilters ? 'rgba(249, 115, 22, 0.15)' : '#0f172a',
                                    border: hasActiveFilters ? '1px solid rgba(249, 115, 22, 0.45)' : '1px solid #334155',
                                    color: hasActiveFilters ? '#f97316' : '#cbd5e1',
                                    borderRadius: '8px',
                                    padding: '6px 10px',
                                    fontSize: '12.5px',
                                    fontWeight: hasActiveFilters ? 700 : 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                                title="Schichten, Wachen & Fahrzeuge filtern"
                            >
                                <SlidersHorizontal size={14} />
                                <span>Filter{hasActiveFilters ? ` (${activeFilterCount})` : ''}</span>
                            </button>
                            {hasActiveFilters && (
                                <button
                                    type="button"
                                    onClick={() => { setSelectedTypes([]); setSelectedVehicles([]); setSelectedStations([]); setOnlyBonus(false); }}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        background: 'rgba(239, 68, 68, 0.12)',
                                        border: '1px solid rgba(239, 68, 68, 0.3)',
                                        color: '#ef4444',
                                        borderRadius: '8px',
                                        padding: '6px 7px',
                                        cursor: 'pointer'
                                    }}
                                    title="Alle Filter zurücksetzen"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Kalender / Schicht-Rhythmus direkt über den statistischen Werten */}
            <div className="card-premium">
                <ShiftRhythmCalendar
                    baseDate={baseDate}
                    filterMode={filterMode}
                    filteredData={filteredData}
                    storeSettings={store.settings}
                />
            </div>

            {/* KPI Cards Grid (Row 1: Geleistet | Schichten | Bonus, Row 2: Saldo | Dienstplan PDF) */}
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                <div className="stat-card" style={{ padding: '14px 12px' }}>
                    <span className="text-label">Geleistet</span>
                    <span className="text-value" style={{ fontSize: '22px' }}>{stats.actual.toFixed(1)} h</span>
                </div>
                <div className="stat-card" style={{ padding: '14px 12px' }}>
                    <span className="text-label">Schichten</span>
                    <span className="text-value" style={{ fontSize: '22px' }}>{stats.count}</span>
                </div>
                <div
                    className="stat-card"
                    onClick={() => setShowBonusModal(true)}
                    style={{
                        padding: '14px 12px',
                        cursor: 'pointer',
                        border: stats.bonusCount > 0 || onlyBonus ? '1px solid rgba(250, 204, 21, 0.45)' : undefined,
                        background: onlyBonus ? 'rgba(250, 204, 21, 0.12)' : undefined,
                        position: 'relative',
                        transition: 'all 0.15s ease'
                    }}
                    title="Klicken für detaillierte Bonus-Auswertung"
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '4px' }}>
                        <span className="text-label" style={{ color: stats.bonusCount > 0 ? '#facc15' : undefined, marginBottom: '4px' }}>
                            💰 Bonus ({stats.bonusCount}x)
                        </span>
                        <span style={{
                            fontSize: '10px',
                            color: '#fde047',
                            background: 'rgba(250, 204, 21, 0.14)',
                            padding: '1px 5px',
                            borderRadius: '4px',
                            fontWeight: 700
                        }}>
                            Details ↗
                        </span>
                    </div>
                    <span className="text-value" style={{ fontSize: '22px', color: stats.bonusCount > 0 ? '#facc15' : '#64748b' }}>
                        {stats.bonusTotalAmount.toFixed(0)} €
                    </span>
                </div>

                {/* Row 2 Left (span 2): Saldo */}
                <div className="stat-card" style={{ gridColumn: 'span 2', borderLeft: `4px solid ${colorClass}`, padding: '14px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <span className="text-label">Saldo (Soll: {target.toFixed(1)}h{filterMode === 'month' ? ` • ${weeklyRate}h/Woche` : ''})</span>
                        <div className="text-value" style={{ fontSize: '22px', color: colorClass }}>
                            {delta > 0 ? '+' : ''}{delta.toFixed(1)} h
                        </div>
                    </div>
                    <div style={{ fontSize: '22px' }}>{isPositive ? "📈" : "📉"}</div>
                </div>

                {/* Row 2 Right (span 1): Dienstplan PDF Button Card */}
                <button
                    type="button"
                    onClick={handleExportPDF}
                    className="stat-card"
                    style={{
                        gridColumn: 'span 1',
                        padding: '12px 10px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        background: 'rgba(56, 189, 248, 0.1)',
                        border: '1px solid rgba(56, 189, 248, 0.35)',
                        color: '#38bdf8',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        textAlign: 'center'
                    }}
                    title="Monatsdienstplan als PDF exportieren"
                >
                    <span style={{ fontSize: '22px', lineHeight: 1 }}>📄</span>
                    <span style={{ fontSize: '12.5px', fontWeight: 700, lineHeight: 1.2 }}>
                        Dienstplan PDF
                    </span>
                </button>
            </div>

            {/* PopUp Modal 1: Schichtfilter */}
            {showFilterModal && (
                <div
                    onClick={() => setShowFilterModal(false)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 2500,
                        background: 'rgba(2, 6, 23, 0.78)',
                        backdropFilter: 'blur(6px)',
                        WebkitBackdropFilter: 'blur(6px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '16px',
                        animation: 'fadeIn 0.18s ease-out'
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: '100%',
                            maxWidth: '480px',
                            maxHeight: '85vh',
                            overflowY: 'auto',
                            background: '#0f172a',
                            border: '1px solid #334155',
                            borderRadius: '18px',
                            padding: '18px',
                            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', paddingBottom: '10px', borderBottom: '1px solid #1e293b' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <SlidersHorizontal size={17} color="#f97316" />
                                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>
                                    Schichtfilter
                                </h3>
                                {hasActiveFilters && (
                                    <span style={{
                                        fontSize: '11px',
                                        background: 'rgba(249, 115, 22, 0.15)',
                                        color: '#f97316',
                                        padding: '2px 7px',
                                        borderRadius: '10px',
                                        fontWeight: 700
                                    }}>
                                        {activeFilterCount} aktiv
                                    </span>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowFilterModal(false)}
                                style={{
                                    background: '#1e293b',
                                    border: '1px solid #334155',
                                    color: '#94a3b8',
                                    borderRadius: '8px',
                                    padding: '4px 8px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center'
                                }}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Section 1: Schnellauswahl */}
                        <div style={{ marginBottom: '14px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                                Auswahl
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <button
                                    type="button"
                                    onClick={() => { setSelectedTypes([]); setSelectedVehicles([]); setSelectedStations([]); setOnlyBonus(false); }}
                                    style={{
                                        padding: '6px 12px',
                                        borderRadius: '20px',
                                        fontSize: '12.5px',
                                        fontWeight: !hasActiveFilters ? 700 : 500,
                                        background: !hasActiveFilters ? '#334155' : '#1e293b',
                                        border: !hasActiveFilters ? '1px solid #64748b' : '1px solid #334155',
                                        color: !hasActiveFilters ? '#f8fafc' : '#94a3b8',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Alle Schichten {!hasActiveFilters && '✓'}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setOnlyBonus(!onlyBonus)}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '5px',
                                        padding: '6px 12px',
                                        borderRadius: '20px',
                                        fontSize: '12.5px',
                                        fontWeight: onlyBonus ? 800 : 600,
                                        background: onlyBonus ? 'rgba(250, 204, 21, 0.18)' : '#1e293b',
                                        border: onlyBonus ? '1px solid #facc15' : '1px solid #334155',
                                        color: onlyBonus ? '#facc15' : '#94a3b8',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <span>💰</span>
                                    <span>Nur Bonus</span>
                                    {onlyBonus && <span>✓</span>}
                                </button>
                            </div>
                        </div>

                        {/* Section 2: Wachen */}
                        <div style={{ marginBottom: '14px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                                Wachen
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
                                                gap: '6px',
                                                padding: '6px 12px',
                                                borderRadius: '20px',
                                                fontSize: '12.5px',
                                                fontWeight: active ? 700 : 500,
                                                background: active ? theme.badgeBg : '#1e293b',
                                                border: active ? `1px solid ${theme.primaryHex}` : '1px solid #334155',
                                                color: active ? theme.primaryHex : '#cbd5e1',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: theme.primaryHex }} />
                                            <span>{stName}</span>
                                            {active && <span>✓</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Section 3: Schichtarten */}
                        <div style={{ marginBottom: '14px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                                Schichtarten
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {(store.settings?.shiftTypes || []).map(t => {
                                    const active = selectedTypes.includes(t.id);
                                    const shiftCol = getShiftColor(t.name, '');
                                    return (
                                        <button
                                            key={t.id}
                                            type="button"
                                            onClick={() => setSelectedTypes(active ? selectedTypes.filter(x => x !== t.id) : [...selectedTypes, t.id])}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                padding: '6px 12px',
                                                borderRadius: '20px',
                                                fontSize: '12.5px',
                                                fontWeight: active ? 700 : 500,
                                                background: active ? shiftCol.bg : '#1e293b',
                                                border: active ? `1px solid ${shiftCol.border}` : '1px solid #334155',
                                                color: active ? shiftCol.color : '#cbd5e1',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: shiftCol.color }} />
                                            <span>{t.name}</span>
                                            {active && <span>✓</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Section 4: Fahrzeuge */}
                        {(store.settings?.vehicles || []).length > 0 && (
                            <div style={{ marginBottom: '16px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                                    Fahrzeuge
                                </div>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {(store.settings?.vehicles || []).map(v => {
                                        const active = selectedVehicles.includes(v);
                                        return (
                                            <button
                                                key={v}
                                                type="button"
                                                onClick={() => setSelectedVehicles(active ? selectedVehicles.filter(x => x !== v) : [...selectedVehicles, v])}
                                                style={{
                                                    padding: '6px 11px',
                                                    borderRadius: '16px',
                                                    fontSize: '12px',
                                                    fontWeight: active ? 700 : 500,
                                                    background: active ? 'rgba(34, 197, 94, 0.15)' : '#1e293b',
                                                    border: active ? '1px solid #22c55e' : '1px solid #334155',
                                                    color: active ? '#22c55e' : '#94a3b8',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {v} {active && '✓'}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Modal Footer */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', paddingTop: '12px', borderTop: '1px solid #1e293b' }}>
                            {hasActiveFilters ? (
                                <button
                                    type="button"
                                    onClick={() => { setSelectedTypes([]); setSelectedVehicles([]); setSelectedStations([]); setOnlyBonus(false); }}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '5px',
                                        background: 'rgba(239, 68, 68, 0.12)',
                                        border: '1px solid rgba(239, 68, 68, 0.3)',
                                        color: '#ef4444',
                                        padding: '8px 12px',
                                        borderRadius: '10px',
                                        fontSize: '12.5px',
                                        fontWeight: 600,
                                        cursor: 'pointer'
                                    }}
                                >
                                    <X size={14} />
                                    <span>Filter zurücksetzen</span>
                                </button>
                            ) : <div />}

                            <button
                                type="button"
                                onClick={() => setShowFilterModal(false)}
                                style={{
                                    background: 'var(--color-primary)',
                                    border: 'none',
                                    color: '#ffffff',
                                    padding: '8px 18px',
                                    borderRadius: '10px',
                                    fontSize: '13px',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                }}
                            >
                                Fertig ({filteredData.length} {filteredData.length === 1 ? 'Dienst' : 'Dienste'})
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* PopUp Modal 2: 💰 Bonus-Auswertung */}
            {showBonusModal && (
                <div
                    onClick={() => setShowBonusModal(false)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 2500,
                        background: 'rgba(2, 6, 23, 0.78)',
                        backdropFilter: 'blur(6px)',
                        WebkitBackdropFilter: 'blur(6px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '16px',
                        animation: 'fadeIn 0.18s ease-out'
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: '100%',
                            maxWidth: '540px',
                            maxHeight: '85vh',
                            overflowY: 'auto',
                            background: '#0f172a',
                            border: '1px solid rgba(250, 204, 21, 0.4)',
                            borderRadius: '18px',
                            padding: '18px',
                            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.65)'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '14px', paddingBottom: '10px', borderBottom: '1px solid #1e293b' }}>
                            <h3 className="text-label" style={{ margin: 0, color: '#facc15', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span>💰 Bonus-Auswertung</span>
                                <span style={{
                                    fontSize: '11px',
                                    background: 'rgba(250, 204, 21, 0.15)',
                                    color: '#fde047',
                                    padding: '2px 7px',
                                    borderRadius: '6px',
                                    fontWeight: 700,
                                    textTransform: 'none'
                                }}>
                                    Standard: {store.settings?.defaultBonusAmount ?? 75} €
                                </span>
                            </h3>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <button
                                    type="button"
                                    onClick={() => setOnlyBonus(!onlyBonus)}
                                    style={{
                                        background: onlyBonus ? '#facc15' : 'rgba(250, 204, 21, 0.12)',
                                        color: onlyBonus ? '#0f172a' : '#facc15',
                                        border: '1px solid rgba(250, 204, 21, 0.4)',
                                        borderRadius: '8px',
                                        padding: '5px 10px',
                                        fontSize: '11.5px',
                                        fontWeight: 700,
                                        cursor: 'pointer'
                                    }}
                                >
                                    {onlyBonus ? '✓ Filter: Nur Bonus aktiv' : '🔍 Nur Bonus-Schichten filtern'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowBonusModal(false)}
                                    style={{
                                        background: '#1e293b',
                                        border: '1px solid #334155',
                                        color: '#94a3b8',
                                        borderRadius: '8px',
                                        padding: '5px 8px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center'
                                    }}
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Top Summary Boxes: Zeitraum | Jahr | Gesamt */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '8px', marginBottom: '14px' }}>
                            {/* Box 1: Gewählter Zeitraum */}
                            <div style={{
                                background: '#1e293b',
                                border: '1px solid rgba(250, 204, 21, 0.3)',
                                borderRadius: '8px',
                                padding: '10px 12px'
                            }}>
                                <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginBottom: '3px' }}>
                                    Gewählter Zeitraum ({label})
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                    <span style={{ fontSize: '20px', fontWeight: 800, color: '#facc15' }}>
                                        {stats.bonusTotalAmount.toFixed(0)} €
                                    </span>
                                    <span style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 700 }}>
                                        {stats.bonusCount} {stats.bonusCount === 1 ? 'Schicht' : 'Schichten'}
                                    </span>
                                </div>
                                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>
                                    {stats.bonusHours.toFixed(1)} Std. in Bonus-Schichten
                                </div>
                            </div>

                            {/* Box 2: Laufendes Jahr */}
                            <div style={{
                                background: '#1e293b',
                                border: '1px solid #334155',
                                borderRadius: '8px',
                                padding: '10px 12px'
                            }}>
                                <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginBottom: '3px' }}>
                                    Jahressumme {bonusOverview.year}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                    <span style={{ fontSize: '20px', fontWeight: 800, color: '#38bdf8' }}>
                                        {bonusOverview.yearBonusAmount.toFixed(0)} €
                                    </span>
                                    <span style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 700 }}>
                                        {bonusOverview.yearBonusCount} {bonusOverview.yearBonusCount === 1 ? 'Schicht' : 'Schichten'}
                                    </span>
                                </div>
                                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>
                                    {bonusOverview.yearBonusHours.toFixed(1)} Std. im Jahr {bonusOverview.year}
                                </div>
                            </div>

                            {/* Box 3: Alle Jahre / Gesamt */}
                            <div style={{
                                background: '#1e293b',
                                border: '1px solid #334155',
                                borderRadius: '8px',
                                padding: '10px 12px'
                            }}>
                                <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginBottom: '3px' }}>
                                    Gesamt (Alle Jahre)
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                    <span style={{ fontSize: '20px', fontWeight: 800, color: '#4ade80' }}>
                                        {bonusOverview.allTimeBonusAmount.toFixed(0)} €
                                    </span>
                                    <span style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 700 }}>
                                        {bonusOverview.allTimeBonusCount} {bonusOverview.allTimeBonusCount === 1 ? 'Schicht' : 'Schichten'}
                                    </span>
                                </div>
                                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>
                                    {bonusOverview.byYear.length > 0
                                        ? bonusOverview.byYear.map(y => `${y.year}: ${y.amount.toFixed(0)}€ (${y.count}x)`).join(' • ')
                                        : 'Noch keine Bonus-Schichten markiert'}
                                </div>
                            </div>
                        </div>

                        {/* Monthly Breakdown Grid (Jan - Dez for selected Year) */}
                        <div style={{ marginBottom: (stats.bonusByStation.length > 0 || stats.bonusByCode.length > 0) ? '12px' : 0 }}>
                            <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                                Monatsübersicht Bonus {bonusOverview.year}:
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(72px, 1fr))', gap: '6px' }}>
                                {bonusOverview.months.map((m) => {
                                    const isSelectedMonth = filterMode === 'month' && baseDate.getMonth() === m.monthIndex;
                                    const hasB = m.count > 0;
                                    return (
                                        <div
                                            key={m.key}
                                            onClick={() => {
                                                const newD = new Date(baseDate);
                                                newD.setMonth(m.monthIndex);
                                                setBaseDate(newD);
                                                setFilterMode('month');
                                            }}
                                            style={{
                                                background: hasB ? 'rgba(250, 204, 21, 0.1)' : '#1e293b',
                                                border: isSelectedMonth
                                                    ? '1.5px solid #38bdf8'
                                                    : (hasB ? '1px solid rgba(250, 204, 21, 0.4)' : '1px solid #334155'),
                                                borderRadius: '7px',
                                                padding: '6px 6px',
                                                textAlign: 'center',
                                                cursor: 'pointer'
                                            }}
                                            title={`${m.monthName} ${bonusOverview.year}: ${m.count}x Bonus (${m.amount.toFixed(0)} €)`}
                                        >
                                            <div style={{ fontSize: '11px', fontWeight: 700, color: hasB ? '#f8fafc' : '#64748b' }}>
                                                {m.monthName}
                                            </div>
                                            <div style={{ fontSize: '12px', fontWeight: 800, color: hasB ? '#facc15' : '#475569', marginTop: '2px' }}>
                                                {hasB ? `${m.amount.toFixed(0)} €` : '—'}
                                            </div>
                                            <div style={{ fontSize: '10px', color: hasB ? '#fde047' : '#475569' }}>
                                                {hasB ? `${m.count}x` : '0x'}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Breakdown by Wache & Kürzel in current period */}
                        {(stats.bonusByStation.length > 0 || stats.bonusByCode.length > 0) && (
                            <div style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: '12px',
                                paddingTop: '10px',
                                borderTop: '1px solid rgba(255,255,255,0.06)',
                                fontSize: '12px'
                            }}>
                                {stats.bonusByStation.length > 0 && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                        <span style={{ color: '#94a3b8', fontWeight: 600 }}>Nach Wache ({label}):</span>
                                        {stats.bonusByStation.map(bs => {
                                            const th = STATION_THEMES[bs.station] || STATION_THEMES.Sendling;
                                            return (
                                                <span key={bs.station} style={{
                                                    background: th.badgeBg,
                                                    color: th.primaryHex,
                                                    border: `1px solid ${th.badgeBorder}`,
                                                    padding: '2px 8px',
                                                    borderRadius: '6px',
                                                    fontSize: '11.5px',
                                                    fontWeight: 700
                                                }}>
                                                    {bs.station}: {bs.count}x ({bs.amount.toFixed(0)} €)
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
                                {stats.bonusByCode.length > 0 && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                        <span style={{ color: '#94a3b8', fontWeight: 600 }}>Nach Kürzel:</span>
                                        {stats.bonusByCode.map(bc => (
                                            <span key={bc.code} style={{
                                                background: '#1e293b',
                                                color: '#facc15',
                                                border: '1px solid rgba(250, 204, 21, 0.3)',
                                                padding: '2px 8px',
                                                borderRadius: '6px',
                                                fontSize: '11.5px',
                                                fontWeight: 700
                                            }}>
                                                {bc.code}: {bc.count}x ({bc.amount.toFixed(0)} €)
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Charts & Verteilung */}
            {stats.count === 0 ? (
                <div className="card-premium center" style={{ padding: '40px', color: '#64748b' }}>
                    <div style={{ fontSize: '40px', marginBottom: '10px' }}>📊</div>
                    Keine weiteren Daten für diesen Zeitraum vorhanden.
                </div>
            ) : (
                <>
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
                                const bAmt = getShiftBonusAmount(s, store.settings);
                                return (
                                    <div
                                        key={s.id}
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            padding: '10px 12px',
                                            background: '#1e293b',
                                            border: bAmt > 0 ? '1px solid rgba(250, 204, 21, 0.35)' : '1px solid transparent',
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
                                                {bAmt > 0 && (
                                                    <span style={{
                                                        background: 'rgba(250, 204, 21, 0.15)',
                                                        color: '#facc15',
                                                        border: '1px solid rgba(250, 204, 21, 0.4)',
                                                        padding: '1px 6px',
                                                        borderRadius: '4px',
                                                        fontSize: '11px',
                                                        fontWeight: 800
                                                    }}>
                                                        💰 +{bAmt} €
                                                    </span>
                                                )}
                                            </div>
                                            {s.partner && (
                                                <div style={{ color: '#38bdf8', fontSize: '12.5px', marginTop: '3px', fontWeight: 500 }}>
                                                    👤 {s.partner}
                                                </div>
                                            )}
                                        </div>

                                        {/* Quick Bonus Checkbox Button */}
                                        <button
                                            type="button"
                                            onClick={() => toggleShiftBonus(s)}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                padding: '4px 9px',
                                                borderRadius: '6px',
                                                fontSize: '11.5px',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                background: s.hasBonus ? 'rgba(250, 204, 21, 0.18)' : 'rgba(15, 23, 42, 0.6)',
                                                color: s.hasBonus ? '#facc15' : '#64748b',
                                                border: s.hasBonus ? '1px solid rgba(250, 204, 21, 0.5)' : '1px solid #334155',
                                                transition: 'all 0.15s ease'
                                            }}
                                            title={s.hasBonus ? `Bonus (${bAmt} €) deaktivieren` : `Bonus (${store.settings?.defaultBonusAmount ?? 75} €) aktivieren`}
                                        >
                                            <span>{s.hasBonus ? '☑' : '☐'}</span>
                                            <span>Bonus</span>
                                        </button>
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
