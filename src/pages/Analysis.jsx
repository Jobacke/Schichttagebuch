import React, { useState, useMemo } from 'react';
import { useStore } from '../context/StoreContext';
import { APP_VERSION } from '../version';
import {
    format, parseISO, startOfMonth, endOfMonth,
    startOfYear, endOfYear, addMonths, subMonths, isValid, isSameMonth,
    differenceInMinutes
} from 'date-fns';
import { de } from 'date-fns/locale';
import {
    Filter, X, Check, TrendingUp, TrendingDown,
    PieChart as PieIcon, BarChart2, Calendar
} from 'lucide-react';

const COLORS = ['#f97316', '#38bdf8', '#22c55e', '#eab308', '#ef4444', '#a855f7'];

// --- Helper: Duration Calculation ---
// Helper to parse "HH:MM" and calculate duration in hours
function calculateDuration(start, end) {
    if (!start || !end) return 0;
    try {
        const [startH, startM] = start.split(':').map(Number);
        const [endH, endM] = end.split(':').map(Number);

        let startMinutes = startH * 60 + startM;
        let endMinutes = endH * 60 + endM;

        // Handle Night Shifts (crossing midnight)
        if (endMinutes < startMinutes) {
            endMinutes += 24 * 60;
        }

        return (endMinutes - startMinutes) / 60;
    } catch (e) {
        return 0;
    }
}

// --- Component: CSS Bar Chart ---
const SimpleBarChart = ({ data }) => {
    if (!data || data.length === 0) return null;
    const maxVal = Math.max(...data.map(d => d.hours));

    return (
        <div style={{ display: 'flex', alignItems: 'flex-end', height: '180px', gap: '4px', paddingTop: '20px' }}>
            {data.map((d, i) => {
                const heightPercent = maxVal > 0 ? (d.hours / maxVal) * 100 : 0;
                return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', width: '100%' }}>
                            <div style={{
                                width: '100%',
                                height: `${heightPercent}%`,
                                background: 'var(--color-primary)',
                                borderTopLeftRadius: '4px',
                                borderTopRightRadius: '4px',
                                opacity: 0.8,
                                minHeight: '4px'
                            }} />
                        </div>
                        <span style={{ fontSize: '10px', color: '#94a3b8', marginTop: '6px', transform: 'rotate(-45deg)', whiteSpace: 'nowrap' }}>
                            {d.label}
                        </span>
                    </div>
                );
            })}
        </div>
    );
};

export default function Analysis() {
    const { store, loading } = useStore();
    const [isFilterOpen, setIsFilterOpen] = useState(false);

    // --- Filter State ---
    const [tempFilter, setTempFilter] = useState({
        mode: 'month',
        baseDate: new Date(),
        customStart: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        customEnd: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
        types: [],
    });
    const [activeFilter, setActiveFilter] = useState(tempFilter);

    // --- Actions ---
    const handleApply = () => {
        setActiveFilter(tempFilter);
        setIsFilterOpen(false);
    };

    const handleReset = () => {
        const resetState = {
            mode: 'month',
            baseDate: new Date(),
            customStart: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
            customEnd: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
            types: [],
        };
        setTempFilter(resetState);
        setActiveFilter(resetState);
        setIsFilterOpen(false);
    };

    // --- Logic: Date Range & Labels ---
    const { dateRange, rangeLabel, targetHours } = useMemo(() => {
        let start, end, label, target;
        const { mode, baseDate, customStart, customEnd } = activeFilter;

        try {
            if (mode === 'month') {
                start = startOfMonth(baseDate);
                end = endOfMonth(baseDate);
                label = format(baseDate, 'MMMM yyyy', { locale: de });
                const daysInMonth = end.getDate();
                target = (daysInMonth / 7) * 7.8;
            } else if (mode === 'year') {
                start = startOfYear(baseDate);
                end = endOfYear(baseDate);
                label = format(baseDate, 'yyyy');
                target = 52.14 * 7.8;
            } else {
                start = parseISO(customStart);
                end = parseISO(customEnd);
                if (!isValid(start) || !isValid(end)) {
                    start = startOfMonth(new Date());
                    end = endOfMonth(new Date());
                    label = 'Ungültig';
                } else {
                    label = 'Benutzerdefiniert';
                }
                const diffTime = Math.abs(end - start);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                target = (diffDays / 7) * 7.8;
            }
        } catch (e) {
            start = new Date(); end = new Date(); label = "Fehler"; target = 0;
        }

        return { dateRange: { start, end }, rangeLabel, targetHours };
    }, [activeFilter]);

    // --- Logic: Filtering ---
    const filteredData = useMemo(() => {
        if (!store.shifts || store.shifts.length === 0) return [];

        return store.shifts.filter(s => {
            if (!s.date) return false;
            let shiftDate;
            try {
                shiftDate = parseISO(s.date);
                if (!isValid(shiftDate)) return false;
            } catch (e) { return false; }

            // Date Filter
            if (activeFilter.mode === 'month') {
                if (!isSameMonth(shiftDate, activeFilter.baseDate)) return false;
            } else {
                if (shiftDate < dateRange.start || shiftDate > dateRange.end) return false;
            }

            // Type Filter
            if (activeFilter.types.length > 0 && !activeFilter.types.includes(s.typeId)) return false;

            return true;
        });
    }, [store.shifts, dateRange, activeFilter]);

    // --- Logic: Stats Calculation ---
    const stats = useMemo(() => {
        let actual = 0;
        const typeCounts = {};
        const shiftsByDate = {};

        filteredData.forEach(s => {
            const dur = calculateDuration(s.startTime, s.endTime);
            actual += dur;

            // Safe Access for Type Name
            const typeObj = (store.settings?.shiftTypes || []).find(t => t.id === s.typeId);
            const tName = typeObj ? typeObj.name : 'Unbekannt';

            typeCounts[tName] = (typeCounts[tName] || 0) + 1;

            const dateKey = s.date;
            shiftsByDate[dateKey] = (shiftsByDate[dateKey] || 0) + dur;
        });

        const chartData = Object.entries(shiftsByDate)
            .map(([date, hours]) => ({ date, hours, label: format(parseISO(date), 'dd.') }))
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        const distributionData = Object.entries(typeCounts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);

        return { actual, count: filteredData.length, chartData, distributionData };
    }, [filteredData, store.settings]);

    const delta = stats.actual - targetHours;
    const isPositive = delta >= 0;

    return (
        <div className="page-content">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                        Auswertung <span style={{ fontSize: '12px', color: 'var(--color-primary)', background: 'rgba(249, 115, 22, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>v{APP_VERSION}</span>
                    </h1>
                    <div className="subtitle" style={{ margin: 0, marginTop: '4px' }}>{rangeLabel}</div>
                </div>
                <button onClick={() => { setTempFilter(activeFilter); setIsFilterOpen(true); }} className="btn-primary" style={{ padding: '8px 16px', fontSize: '14px', width: 'auto' }}>
                    <Filter size={16} /> Filter
                </button>
            </div>

            {/* KPI Cards */}
            <div className="stats-grid">
                <div className="stat-card">
                    <span className="text-label">Geleistet</span>
                    <span className="text-value">{stats.actual.toFixed(1)} <span style={{ fontSize: '14px', color: '#94a3b8' }}>h</span></span>
                </div>
                <div className="stat-card">
                    <span className="text-label">Schichten</span>
                    <span className="text-value">{stats.count}</span>
                </div>
                <div className="stat-card full-width" style={{ borderLeft: `4px solid ${isPositive ? 'var(--color-success)' : 'var(--color-danger)'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <div>
                            <span className="text-label">Saldo (Plan: {targetHours.toFixed(1)}h)</span>
                            <div className="text-value" style={{ color: isPositive ? 'var(--color-success)' : 'var(--color-danger)' }}>
                                {delta > 0 ? '+' : ''}{delta.toFixed(1)} h
                            </div>
                        </div>
                        {isPositive ? <TrendingUp size={24} color="var(--color-success)" /> : <TrendingDown size={24} color="var(--color-danger)" />}
                    </div>
                </div>
            </div>

            {/* Content or Empty */}
            {filteredData.length === 0 ? (
                <div className="card-premium" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-text-muted)' }}>
                    <BarChart2 size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
                    <p style={{ margin: 0, fontWeight: '500' }}>Keine Schichten gefunden.</p>
                </div>
            ) : (
                <>
                    {/* Native CSS Charts */}
                    {/* 1. Timeline Chart */}
                    <div className="card-premium">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                            <Calendar size={16} color="var(--color-primary)" />
                            <h3 className="text-label" style={{ margin: 0 }}>Verlauf</h3>
                        </div>
                        <SimpleBarChart data={stats.chartData} />
                    </div>

                    {/* 2. Distribution List */}
                    <div className="card-premium">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                            <PieIcon size={16} color="var(--color-primary)" />
                            <h3 className="text-label" style={{ margin: 0 }}>Verteilung</h3>
                        </div>
                        {stats.distributionData.map((d, i) => (
                            <div key={i} style={{ marginBottom: '12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '4px' }}>
                                    <span>{d.name}</span>
                                    <span style={{ fontWeight: 'bold' }}>{d.value}</span>
                                </div>
                                <div style={{ height: '6px', background: '#334155', borderRadius: '3px', overflow: 'hidden' }}>
                                    <div style={{
                                        width: `${(d.value / stats.count) * 100}%`,
                                        height: '100%',
                                        background: COLORS[i % COLORS.length]
                                    }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* --- Filter Modal --- */}
            {isFilterOpen && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setIsFilterOpen(false)}>
                    <div className="modal-content">
                        <div className="modal-header">
                            <h2 style={{ margin: 0, color: 'white', fontSize: '18px' }}>Filter</h2>
                            <button className="close-btn" onClick={() => setIsFilterOpen(false)}><X /></button>
                        </div>
                        <div className="modal-body">
                            {/* Mode Selection */}
                            <div style={{ display: 'flex', background: 'var(--color-surface-hover)', borderRadius: '8px', padding: '4px', marginBottom: '20px' }}>
                                {['month', 'year', 'custom'].map(m => (
                                    <button
                                        key={m}
                                        onClick={() => setTempFilter(p => ({ ...p, mode: m }))}
                                        className="btn-secondary"
                                        style={{
                                            flex: 1, padding: '8px', borderRadius: '6px', fontSize: '13px',
                                            background: tempFilter.mode === m ? 'var(--color-primary)' : 'transparent',
                                            color: tempFilter.mode === m ? 'white' : '#94a3b8',
                                            boxShadow: 'none',
                                            border: 'none'
                                        }}
                                    >
                                        {m === 'month' ? 'Monat' : m === 'year' ? 'Jahr' : 'Zeitraum'}
                                    </button>
                                ))}
                            </div>

                            {/* Date Inputs */}
                            <div style={{ marginBottom: '24px' }}>
                                {tempFilter.mode === 'month' && (
                                    <input type="month" className="input-premium" style={{ width: '100%' }} value={format(tempFilter.baseDate, 'yyyy-MM')} onChange={e => setTempFilter(p => ({ ...p, baseDate: parseISO(e.target.value) }))} />
                                )}
                                {tempFilter.mode === 'year' && (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-surface-hover)', padding: '12px', borderRadius: '12px', color: 'white' }}>
                                        <button className="close-btn" onClick={() => setTempFilter(p => ({ ...p, baseDate: subMonths(p.baseDate, 12) }))}>&lt;</button>
                                        <span style={{ fontWeight: 'bold' }}>{format(tempFilter.baseDate, 'yyyy')}</span>
                                        <button className="close-btn" onClick={() => setTempFilter(p => ({ ...p, baseDate: addMonths(p.baseDate, 12) }))}>&gt;</button>
                                    </div>
                                )}
                                {tempFilter.mode === 'custom' && (
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input type="date" className="input-premium" value={tempFilter.customStart} onChange={e => setTempFilter(p => ({ ...p, customStart: e.target.value }))} />
                                        <input type="date" className="input-premium" value={tempFilter.customEnd} onChange={e => setTempFilter(p => ({ ...p, customEnd: e.target.value }))} />
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button onClick={handleReset} className="btn-secondary" style={{ flex: 1 }}>Reset</button>
                            <button onClick={handleApply} className="btn-primary" style={{ flex: 1 }}>Anzeigen</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
