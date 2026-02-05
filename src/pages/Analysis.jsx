import React, { useState, useMemo } from 'react';
import { useStore } from '../context/StoreContext';
import {
    format, parseISO, startOfMonth, endOfMonth,
    startOfYear, endOfYear, addMonths, subMonths, isValid, isSameMonth
} from 'date-fns';
import { de } from 'date-fns/locale';
import {
    Filter, X, Check, TrendingUp, TrendingDown, PieChart as PieIcon, BarChart2
} from 'lucide-react';
// Recharts import removed for debugging
// import {
//    PieChart, Pie, Cell, BarChart, Bar, CartesianGrid, XAxis, Tooltip, ResponsiveContainer
// } from 'recharts';
import { APP_VERSION } from '../version';

const COLORS = ['#f97316', '#38bdf8', '#22c55e', '#eab308', '#ef4444', '#a855f7'];

function calculateDuration(start, end) {
    if (!start || !end) return 0;
    try {
        const [startH, startM] = start.split(':').map(Number);
        const [endH, endM] = end.split(':').map(Number);
        let startMinutes = startH * 60 + startM;
        let endMinutes = endH * 60 + endM;
        if (endMinutes < startMinutes) endMinutes += 24 * 60;
        return (endMinutes - startMinutes) / 60;
    } catch (e) {
        return 0;
    }
}

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
        stations: [],
        vehicles: []
    });

    const [activeFilter, setActiveFilter] = useState(tempFilter);

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
            stations: [],
            vehicles: []
        };
        setTempFilter(resetState);
        setActiveFilter(resetState);
        setIsFilterOpen(false);
    };

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
        return { dateRange: { start, end }, rangeLabel: label, targetHours };
    }, [activeFilter]);

    const filteredData = useMemo(() => {
        if (!store.shifts || store.shifts.length === 0) return [];

        return store.shifts.filter(s => {
            if (!s.date) return false;

            // 1. Date Check 
            let shiftDate;
            try {
                shiftDate = parseISO(s.date);
                if (!isValid(shiftDate)) return false;
            } catch (e) { return false; }

            if (activeFilter.mode === 'month') {
                if (!isSameMonth(shiftDate, activeFilter.baseDate)) return false;
            } else {
                if (shiftDate < dateRange.start || shiftDate > dateRange.end) return false;
            }

            // 2. Attribute Filters
            if (activeFilter.types.length > 0 && !activeFilter.types.includes(s.typeId)) return false;
            if (activeFilter.stations.length > 0 && !activeFilter.stations.includes(s.station)) return false;
            if (activeFilter.vehicles.length > 0 && !activeFilter.vehicles.includes(s.vehicle)) return false;

            return true;
        });
    }, [store.shifts, dateRange, activeFilter]);

    const stats = useMemo(() => {
        let actual = 0;
        const typeCounts = {};
        const shiftsByDate = {};

        filteredData.forEach(s => {
            const dur = calculateDuration(s.startTime, s.endTime);
            actual += dur;

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

    if (loading) {
        return (
            <div className="page-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
                <div style={{ color: 'var(--color-primary)' }}>Lädt Daten...</div>
            </div>
        );
    }

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

            {/* KPI Stats */}
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
                    <div>
                        <span className="text-label">Saldo (Plan: 7,8h)</span>
                        <span className="text-value" style={{ color: isPositive ? 'var(--color-success)' : 'var(--color-danger)' }}>
                            {delta > 0 ? '+' : ''}{delta.toFixed(1)} h
                        </span>
                    </div>
                    <div className={`trend-badge ${isPositive ? 'positive' : 'negative'}`}>
                        {isPositive ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
                    </div>
                </div>
            </div>

            {/* Charts or Empty State */}
            {filteredData.length === 0 ? (
                <div className="card-premium" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-text-muted)' }}>
                    <BarChart2 size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
                    <p style={{ margin: 0, fontWeight: '500' }}>Keine Schichten gefunden.</p>
                    <p style={{ fontSize: '12px', marginTop: '8px' }}>Prüfe den Filterzeitraum.</p>
                </div>
            ) : (
                <>
                    {/* CHARTS TEMPORARILY DISABLED FOR DEBUGGING */}
                    <div style={{ padding: '20px', textAlign: 'center' }}>Charts disabled for debugging</div>
                </>
            )}

            {/* --- Filter Modal --- */}
            {isFilterOpen && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setIsFilterOpen(false)}>
                    <div className="modal-content">
                        <div className="modal-header">
                            <h2 style={{ margin: 0, color: 'white', fontSize: '18px' }}>Filteroptionen</h2>
                            <button className="close-btn" onClick={() => setIsFilterOpen(false)}><X /></button>
                        </div>
                        <div className="modal-body">
                            <div style={{ marginBottom: '24px' }}>
                                <label className="text-label" style={{ marginBottom: '8px' }}>Zeitraum</label>
                                <div style={{ display: 'flex', background: 'var(--color-surface-hover)', borderRadius: '8px', padding: '4px' }}>
                                    {['month', 'year', 'custom'].map(m => (
                                        <button
                                            key={m}
                                            onClick={() => setTempFilter(p => ({ ...p, mode: m }))}
                                            className="btn-secondary"
                                            style={{
                                                flex: 1, padding: '8px', borderRadius: '6px', fontSize: '13px',
                                                background: tempFilter.mode === m ? 'var(--color-primary)' : 'transparent',
                                                color: tempFilter.mode === m ? 'white' : '#94a3b8',
                                                boxShadow: 'none'
                                            }}
                                        >
                                            {m === 'month' ? 'Monat' : m === 'year' ? 'Jahr' : 'Definiert'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div style={{ marginBottom: '24px' }}>
                                {tempFilter.mode === 'month' && (
                                    <input type="month" className="input-premium" value={format(tempFilter.baseDate, 'yyyy-MM')} onChange={e => setTempFilter(p => ({ ...p, baseDate: parseISO(e.target.value) }))} />
                                )}
                                {tempFilter.mode === 'year' && (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-surface-hover)', padding: '8px', borderRadius: '12px', color: 'white' }}>
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

                            <div style={{ marginBottom: '24px' }}>
                                <label className="text-label" style={{ marginBottom: '8px' }}>Schichtarten</label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {store.settings.shiftTypes.map(t => {
                                        const active = tempFilter.types.includes(t.id);
                                        return (
                                            <button key={t.id} onClick={() => setTempFilter(p => ({ ...p, types: active ? p.types.filter(id => id !== t.id) : [...p.types, t.id] }))}
                                                className={`filter-chip ${active ? 'active' : ''}`}>
                                                {t.name} {active && <Check size={14} />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button onClick={handleReset} className="btn-secondary" style={{ flex: 1 }}>Zurücksetzen</button>
                            <button onClick={handleApply} className="btn-primary" style={{ flex: 1 }}>Anwenden</button>
                        </div>
                    </div>
                </div>
            )}

            {/* DEBUG SECTION */}
            <div style={{
                position: 'fixed', bottom: '100px', left: '10px', right: '10px',
                padding: '16px', background: 'red', color: 'white', zIndex: 9999,
                borderRadius: '8px', fontWeight: 'bold', fontSize: '12px',
                boxShadow: '0 0 20px rgba(0,0,0,0.5)'
            }}>
                <h3>⚠️ DEBUG MODE v{APP_VERSION}</h3>
                <p>Status: {loading ? 'LOADING...' : 'READY'}</p>
                <p>Total Shifts: {store.shifts ? store.shifts.length : 'NULL'}</p>
                <p>Current Filtered: {filteredData.length}</p>
                <p>Build Time: {new Date().toLocaleTimeString()}</p>
            </div>
        </div>
    );
}
