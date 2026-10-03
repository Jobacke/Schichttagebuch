import React, { useState, useMemo } from 'react';
import { APP_VERSION } from '../version';
import { useAnalysisLogic } from '../hooks/useAnalysisLogic';
import { useStore } from '../context/StoreContext';
import { exportToPDF } from '../utils/pdfExport';
import { SHIFT_PRESETS } from '../utils/shiftPresets';

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

// Color mapper for shift types & codes (Unified across Calendar, Legend & Verteilung)
const getShiftColor = (typeName = '', code = '') => {
    const text = `${typeName} ${code}`.toLowerCase();
    if (text.includes('früh') || text.includes('rf') || text.includes('fm') || text.includes('fh') || text.includes('fo')) {
        return { color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.18)', border: 'rgba(56, 189, 248, 0.5)', label: 'Früh' };
    }
    if (text.includes('spät') || text.includes('rs') || text.includes('sm') || text.includes('sh') || text.includes('so')) {
        return { color: '#f97316', bg: 'rgba(249, 115, 22, 0.18)', border: 'rgba(249, 115, 22, 0.5)', label: 'Spät' };
    }
    if (text.includes('nacht') || text.includes('rn') || text.includes('nm') || text.includes('nh')) {
        return { color: '#a855f7', bg: 'rgba(168, 85, 247, 0.18)', border: 'rgba(168, 85, 247, 0.5)', label: 'Nacht' };
    }
    if (text.includes('tag') || text.includes('rt') || text.includes('t1') || text.includes('t2') || text.includes('t3') || text.includes('t4')) {
        return { color: '#facc15', bg: 'rgba(250, 204, 21, 0.18)', border: 'rgba(250, 204, 21, 0.5)', label: 'Tag' };
    }
    return { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.18)', border: 'rgba(34, 197, 94, 0.5)', label: typeName || 'Sonstige' };
};

// Helper: Resolve shift code, type name and color consistently
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

    const colorInfo = getShiftColor(rawType, rawCode);

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
                            {/* Day Number */}
                            <span style={{
                                fontSize: '11px',
                                fontWeight: hasShift ? 800 : (item.isWeekend ? 600 : 500),
                                color: hasShift ? '#f8fafc' : (item.isWeekend ? '#94a3b8' : '#475569'),
                                lineHeight: 1
                            }}>
                                {item.dayNum}
                            </span>

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
                                    </div>
                                    {(s.station || s.vehicle) && (
                                        <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                                            📍 {s.station} {s.vehicle ? `• ${s.vehicle}` : ''}
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

            {/* Legend */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                flexWrap: 'wrap',
                marginTop: '14px',
                paddingTop: '10px',
                borderTop: '1px solid rgba(255,255,255,0.05)',
                fontSize: '11px',
                color: '#94a3b8'
            }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#38bdf8' }} /> Früh
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#f97316' }} /> Spät
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#c084fc' }} /> Nacht
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#facc15' }} /> Tag
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#334155' }} /> Frei
                </span>
            </div>
        </div>
    );
}

export default function Analysis() {
    const { store } = useStore();
    const [isFilterOpen, setIsFilterOpen] = useState(false);

    // Use the decoupled logic hook
    const logic = useAnalysisLogic();
    const {
        loading, label, target, weeklyRate,
        filterMode, setFilterMode, baseDate, setBaseDate,
        customStart, setCustomStart, customEnd, setCustomEnd,
        selectedTypes, setSelectedTypes,
        selectedVehicles, setSelectedVehicles,
        stats, delta, isInvalid, filteredData
    } = logic;

    const isPositive = delta >= 0;
    const colorClass = isPositive ? 'var(--color-success)' : 'var(--color-danger)';

    // Formatting Helpers
    const formatDateInput = (d) => {
        try { return d.toISOString().slice(0, 7); } catch { return ''; }
    };
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

    return (
        <div className="page-content">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                        Auswertung <span style={{ fontSize: '12px', color: 'var(--color-primary)', background: 'rgba(249, 115, 22, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>v{APP_VERSION}</span>
                    </h1>
                    <div className="subtitle" style={{ margin: 0, marginTop: '4px', color: isInvalid ? 'var(--color-danger)' : 'inherit' }}>{label}</div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={handleExportPDF} className="btn-secondary" style={{ padding: '8px 16px', fontSize: '14px', width: 'auto' }} title="Als PDF exportieren">
                        📄
                    </button>
                    <button onClick={() => setIsFilterOpen(true)} className="btn-primary" style={{ padding: '8px 16px', fontSize: '14px', width: 'auto' }}>
                        Filter
                    </button>
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

            {/* Filter Modal */}
            {isFilterOpen && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setIsFilterOpen(false)}>
                    <div className="modal-content">
                        <div className="modal-header">
                            <h3>Filter</h3>
                            <button className="close-btn" onClick={() => setIsFilterOpen(false)}>✕</button>
                        </div>
                        <div className="modal-body">
                            {/* Mode Toggle */}
                            <div style={{ display: 'flex', background: '#1e293b', borderRadius: '8px', padding: '4px', marginBottom: '16px' }}>
                                {['month', 'year', 'custom'].map(m => (
                                    <button
                                        key={m}
                                        onClick={() => setFilterMode(m)}
                                        style={{
                                            flex: 1, padding: '8px', borderRadius: '6px', border: 'none',
                                            background: filterMode === m ? 'var(--color-primary)' : 'transparent',
                                            color: filterMode === m ? 'white' : '#94a3b8'
                                        }}
                                    >
                                        {m === 'month' ? 'Monat' : m === 'year' ? 'Jahr' : 'Zeit'}
                                    </button>
                                ))}
                            </div>

                            {/* Controls */}
                            <div style={{ marginBottom: '20px' }}>
                                {filterMode === 'month' && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1e293b', padding: '10px', borderRadius: '8px' }}>
                                        <button className="close-btn" onClick={() => setBaseDate(addMonths(baseDate, -1))}>&lt;</button>
                                        <strong>{baseDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</strong>
                                        <button className="close-btn" onClick={() => setBaseDate(addMonths(baseDate, 1))}>&gt;</button>
                                    </div>
                                )}
                                {filterMode === 'year' && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1e293b', padding: '10px', borderRadius: '8px' }}>
                                        <button className="close-btn" onClick={() => setBaseDate(addMonths(baseDate, -12))}>&lt;</button>
                                        <strong>{baseDate.getFullYear()}</strong>
                                        <button className="close-btn" onClick={() => setBaseDate(addMonths(baseDate, 12))}>&gt;</button>
                                    </div>
                                )}
                                {filterMode === 'custom' && (
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input type="date" className="input-premium" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
                                        <input type="date" className="input-premium" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
                                    </div>
                                )}
                            </div>

                            {/* Types */}
                            <div style={{ marginBottom: '16px' }}>
                                <label className="text-label" style={{ display: 'block', marginBottom: '8px' }}>Schichtarten</label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {(store.settings?.shiftTypes || []).map(t => {
                                        const active = selectedTypes.includes(t.id);
                                        return (
                                            <button key={t.id}
                                                onClick={() => setSelectedTypes(active ? selectedTypes.filter(x => x !== t.id) : [...selectedTypes, t.id])}
                                                className={`filter-chip ${active ? 'active' : ''}`}
                                            >
                                                {t.name} {active && '✓'}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Vehicles */}
                            <div>
                                <label className="text-label" style={{ display: 'block', marginBottom: '8px' }}>Fahrzeuge</label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {(store.settings?.vehicles || []).map(v => {
                                        const active = selectedVehicles.includes(v);
                                        return (
                                            <button key={v}
                                                onClick={() => setSelectedVehicles(active ? selectedVehicles.filter(x => x !== v) : [...selectedVehicles, v])}
                                                className={`filter-chip ${active ? 'active' : ''}`}
                                            >
                                                {v} {active && '✓'}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button onClick={() => setIsFilterOpen(false)} className="btn-primary" style={{ width: '100%' }}>Fertig</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
