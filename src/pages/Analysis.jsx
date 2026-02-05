import React, { useState, useMemo } from 'react';
import { useStore } from '../context/StoreContext';
import {
    format, parseISO, startOfMonth, endOfMonth, isWithinInterval,
    startOfYear, endOfYear, addMonths, subMonths, isValid
} from 'date-fns';
import { de } from 'date-fns/locale';
import {
    Filter, X, Check, TrendingUp, TrendingDown, PieChart as PieIcon
} from 'lucide-react';
import {
    PieChart, Pie, Cell, BarChart, Bar, CartesianGrid, XAxis, Tooltip, ResponsiveContainer
} from 'recharts';

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
    const { store } = useStore();
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
                target = (end.getDate() / 7) * 7.8;
            } else if (mode === 'year') {
                start = startOfYear(baseDate);
                end = endOfYear(baseDate);
                label = format(baseDate, 'yyyy');
                target = 52.14 * 7.8;
            } else {
                start = parseISO(customStart);
                end = parseISO(customEnd);
                if (!isValid(start) || !isValid(end)) throw new Error('Invalid dates');
                label = 'Benutzerdefiniert';
                target = ((end - start) / (1000 * 60 * 60 * 24 * 7)) * 7.8;
            }
        } catch (e) {
            start = new Date(); end = new Date(); label = "Fehler"; target = 0;
        }
        return { dateRange: { start, end }, rangeLabel: label, targetHours };
    }, [activeFilter]);

    const filteredData = useMemo(() => {
        return store.shifts.filter(s => {
            if (!s.date) return false;
            try {
                const d = parseISO(s.date);
                if (!isValid(d)) return false;
                if (!isWithinInterval(d, dateRange)) return false;
                if (activeFilter.types.length > 0 && !activeFilter.types.includes(s.typeId)) return false;
                if (activeFilter.stations.length > 0 && !activeFilter.stations.includes(s.station)) return false;
                if (activeFilter.vehicles.length > 0 && !activeFilter.vehicles.includes(s.vehicle)) return false;
                return true;
            } catch (e) { return false; }
        });
    }, [store.shifts, dateRange, activeFilter]);

    const stats = useMemo(() => {
        let actual = 0;
        const typeCounts = {};
        const shiftsByDate = {};
        filteredData.forEach(s => {
            const dur = calculateDuration(s.startTime, s.endTime);
            actual += dur;
            const tName = store.settings.shiftTypes.find(t => t.id === s.typeId)?.name || 'Unbekannt';
            typeCounts[tName] = (typeCounts[tName] || 0) + 1;
            const dateKey = s.date;
            shiftsByDate[dateKey] = (shiftsByDate[dateKey] || 0) + dur;
        });
        const chartData = Object.entries(shiftsByDate)
            .map(([date, hours]) => ({ date, hours, label: format(parseISO(date), 'dd.MM') }))
            .sort((a, b) => new Date(a.date) - new Date(b.date));
        const distributionData = Object.entries(typeCounts).map(([name, value]) => ({ name, value }));
        return { actual, count: filteredData.length, chartData, distributionData };
    }, [filteredData, store.settings]);

    const delta = stats.actual - targetHours;
    const isPositive = delta >= 0;

    return (
        <div className="page-content">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h1>Auswertung</h1>
                    <div className="subtitle">{rangeLabel}</div>
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

            {/* Distribution Chart */}
            {stats.distributionData.length > 0 && (
                <div className="card-premium">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                        <PieIcon size={16} color="var(--color-primary)" />
                        <h3 className="text-label" style={{ margin: 0 }}>Verteilung</h3>
                    </div>
                    <div style={{ height: '200px', display: 'flex', alignItems: 'center' }}>
                        <ResponsiveContainer width="50%" height="100%">
                            <PieChart>
                                <Pie data={stats.distributionData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={60} paddingAngle={5}>
                                    {stats.distributionData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                </Pie>
                            </PieChart>
                        </ResponsiveContainer>
                        <div style={{ width: '50%', paddingLeft: '16px', fontSize: '12px' }}>
                            {stats.distributionData.map((entry, index) => (
                                <div key={index} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: COLORS[index % COLORS.length] }}></div>
                                        <span style={{ color: '#94a3b8', maxWidth: '80px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.name}</span>
                                    </div>
                                    <span style={{ fontWeight: 'bold' }}>{entry.value}x</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Timeline Chart */}
            <div className="card-premium">
                <div style={{ height: '200px' }}>
                    {stats.chartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                                <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} interval={'preserveStartEnd'} />
                                <Tooltip
                                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                    contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                                />
                                <Bar dataKey="hours" fill="#f97316" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                            Keine Daten vorhanden
                        </div>
                    )}
                </div>
            </div>

            {/* --- Filter Modal --- */}
            {isFilterOpen && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setIsFilterOpen(false)}>
                    <div className="modal-content">
                        <div className="modal-header">
                            <h2 style={{ margin: 0, color: 'white', fontSize: '18px' }}>Filteroptionen</h2>
                            <button className="close-btn" onClick={() => setIsFilterOpen(false)}><X /></button>
                        </div>
                        <div className="modal-body">
                            {/* Mode Selection */}
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

                            {/* Date Inputs */}
                            <div style={{ marginBottom: '24px' }}>
                                {tempFilter.mode === 'month' && (
                                    <input type="month" className="input-premium" value={format(tempFilter.baseDate, 'yyyy-MM')} onChange={e => setTempFilter(p => ({ ...p, baseDate: parseISO(e.target.value) }))} />
                                )}
                                {tempFilter.mode === 'year' && (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-surface-hover)', padding: '8px', borderRadius: '12px' }}>
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

                            {/* Type Filter */}
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

                            {/* Station Filter */}
                            <div style={{ marginBottom: '24px' }}>
                                <label className="text-label" style={{ marginBottom: '8px' }}>Wachen</label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {store.settings.stations.map(s => {
                                        const active = tempFilter.stations.includes(s);
                                        return (
                                            <button key={s} onClick={() => setTempFilter(p => ({ ...p, stations: active ? p.stations.filter(x => x !== s) : [...p.stations, s] }))}
                                                className={`filter-chip ${active ? 'active' : ''}`}>
                                                {s} {active && <Check size={14} />}
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
        </div>
    );
}
