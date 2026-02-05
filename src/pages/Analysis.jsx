import React, { useState, useMemo } from 'react';
import { useStore } from '../context/StoreContext';
import {
    format, parseISO, startOfMonth, endOfMonth, isWithinInterval,
    startOfYear, endOfYear, addMonths, subMonths
} from 'date-fns';
import { de } from 'date-fns/locale';
import {
    BarChart2, Filter, X, Check,
    TrendingUp, TrendingDown, PieChart as PieIcon, ChevronDown
} from 'lucide-react';
import {
    PieChart, Pie, Cell, BarChart, Bar, CartesianGrid, XAxis, Tooltip, ResponsiveContainer
} from 'recharts';

const COLORS = ['#f97316', '#38bdf8', '#22c55e', '#eab308', '#ef4444', '#a855f7'];

function calculateDuration(start, end) {
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    let startMinutes = startH * 60 + startM;
    let endMinutes = endH * 60 + endM;
    if (endMinutes < startMinutes) endMinutes += 24 * 60;
    return (endMinutes - startMinutes) / 60;
}

export default function Analysis() {
    const { store } = useStore();
    const [isFilterOpen, setIsFilterOpen] = useState(false);

    // --- Filter State ---
    const [tempFilter, setTempFilter] = useState({
        mode: 'month', // 'month', 'year', 'custom'
        baseDate: new Date(),
        customStart: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        customEnd: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
        types: [],
        stations: [],
        vehicles: []
    });

    const [activeFilter, setActiveFilter] = useState(tempFilter);

    // Apply Filter Logic
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

    // --- Logic Execution (based on activeFilter) ---
    const { dateRange, rangeLabel, targetHours } = useMemo(() => {
        let start, end, label, target;
        const { mode, baseDate, customStart, customEnd } = activeFilter;

        if (mode === 'month') {
            start = startOfMonth(baseDate);
            end = endOfMonth(baseDate);
            label = format(baseDate, 'MMMM yyyy', { locale: de });
            target = (end.getDate() / 7) * 7.8; // Approx logic
        } else if (mode === 'year') {
            start = startOfYear(baseDate);
            end = endOfYear(baseDate);
            label = format(baseDate, 'yyyy');
            target = 52.14 * 7.8;
        } else {
            start = parseISO(customStart);
            end = parseISO(customEnd);
            label = 'Benutzerdefiniert';
            target = ((end - start) / (1000 * 60 * 60 * 24 * 7)) * 7.8;
        }
        return { dateRange: { start, end }, rangeLabel: label, targetHours };
    }, [activeFilter]);

    const filteredData = useMemo(() => {
        return store.shifts.filter(s => {
            const d = parseISO(s.date);
            if (!isWithinInterval(d, dateRange)) return false;
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
        <div className="animate-in fade-in pb-24">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-xl font-bold mb-0">Auswertung</h1>
                    <p className="text-primary text-sm font-medium">{rangeLabel}</p>
                </div>
                <button onClick={() => { setTempFilter(activeFilter); setIsFilterOpen(true); }} className="btn-primary px-4 py-2 rounded-full flex items-center gap-2 text-sm">
                    <Filter size={16} /> Filter
                </button>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="card p-4">
                    <span className="text-xs font-bold text-secondary uppercase block mb-1">Geleistet</span>
                    <span className="text-2xl font-bold text-white block">{stats.actual.toFixed(1)} <span className="text-sm text-secondary">h</span></span>
                </div>
                <div className="card p-4">
                    <span className="text-xs font-bold text-secondary uppercase block mb-1">Schichten</span>
                    <span className="text-2xl font-bold text-white block">{stats.count}</span>
                </div>
                <div className={`card col-span-2 p-4 flex items-center justify-between border-l-4 ${isPositive ? 'border-l-success' : 'border-l-danger'}`}>
                    <div>
                        <span className="text-xs font-bold text-secondary uppercase block mb-1">Saldo (Plan: 7,8h/W)</span>
                        <span className={`text-3xl font-bold ${isPositive ? 'text-success' : 'text-danger'}`}>
                            {delta > 0 ? '+' : ''}{delta.toFixed(1)} <span className="text-sm opacity-60">h</span>
                        </span>
                    </div>
                    <div className={`p-3 rounded-full ${isPositive ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                        {isPositive ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
                    </div>
                </div>
            </div>

            {/* Charts */}
            {stats.distributionData.length > 0 && (
                <div className="card p-4 mb-6">
                    <div className="flex items-center gap-2 mb-4">
                        <PieIcon size={16} className="text-primary" />
                        <h3 className="text-sm font-bold text-white mb-0">Verteilung</h3>
                    </div>
                    <div className="h-[200px] flex items-center">
                        <ResponsiveContainer width="50%" height="100%">
                            <PieChart>
                                <Pie data={stats.distributionData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={60} paddingAngle={5}>
                                    {stats.distributionData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                </Pie>
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="w-[50%] space-y-2 text-xs">
                            {stats.distributionData.map((entry, index) => (
                                <div key={index} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                                        <span className="text-secondary truncate max-w-[80px]">{entry.name}</span>
                                    </div>
                                    <span className="font-bold text-white">{entry.value}x</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* --- Filter Modal (Overlay) --- */}
            {isFilterOpen && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="bg-surface w-full max-w-md h-[85vh] sm:h-auto sm:rounded-2xl rounded-t-2xl flex flex-col animate-in slide-in-from-bottom-10 overflow-hidden">

                        {/* Modal Header */}
                        <div className="p-4 border-b border-white/10 flex justify-between items-center">
                            <h2 className="text-lg font-bold m-0">Filteroptionen</h2>
                            <button onClick={() => setIsFilterOpen(false)}><X className="text-secondary" /></button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-4 overflow-y-auto flex-1 space-y-6">

                            {/* 1. Zeitraum */}
                            <div>
                                <label className="text-xs font-bold text-secondary uppercase mb-2 block">Zeitraum</label>
                                <div className="flex bg-surface-highlight p-1 rounded-lg mb-3">
                                    {['month', 'year', 'custom'].map(m => (
                                        <button
                                            key={m}
                                            onClick={() => setTempFilter(p => ({ ...p, mode: m }))}
                                            className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${tempFilter.mode === m ? 'bg-primary text-white shadow-md' : 'text-secondary'}`}
                                        >
                                            {m === 'month' ? 'Monat' : m === 'year' ? 'Jahr' : 'Definiert'}
                                        </button>
                                    ))}
                                </div>

                                {tempFilter.mode === 'month' && (
                                    <input type="month" className="input-field w-full" value={format(tempFilter.baseDate, 'yyyy-MM')} onChange={e => setTempFilter(p => ({ ...p, baseDate: parseISO(e.target.value) }))} />
                                )}
                                {tempFilter.mode === 'year' && (
                                    <div className="flex items-center justify-between bg-surface-highlight rounded-lg p-2">
                                        <button onClick={() => setTempFilter(p => ({ ...p, baseDate: subMonths(p.baseDate, 12) }))} className="p-2"><ChevronDown className="rotate-90 text-secondary" /></button>
                                        <span className="font-bold">{format(tempFilter.baseDate, 'yyyy')}</span>
                                        <button onClick={() => setTempFilter(p => ({ ...p, baseDate: addMonths(p.baseDate, 12) }))} className="p-2"><ChevronDown className="-rotate-90 text-secondary" /></button>
                                    </div>
                                )}
                                {tempFilter.mode === 'custom' && (
                                    <div className="flex gap-2">
                                        <input type="date" className="input-field" value={tempFilter.customStart} onChange={e => setTempFilter(p => ({ ...p, customStart: e.target.value }))} />
                                        <input type="date" className="input-field" value={tempFilter.customEnd} onChange={e => setTempFilter(p => ({ ...p, customEnd: e.target.value }))} />
                                    </div>
                                )}
                            </div>

                            {/* 2. Schichtarten */}
                            <div>
                                <label className="text-xs font-bold text-secondary uppercase mb-2 block">Schichtarten</label>
                                <div className="flex flex-wrap gap-2">
                                    {store.settings.shiftTypes.map(t => {
                                        const active = tempFilter.types.includes(t.id);
                                        return (
                                            <button key={t.id} onClick={() => setTempFilter(p => ({ ...p, types: active ? p.types.filter(id => id !== t.id) : [...p.types, t.id] }))}
                                                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors flex items-center gap-2 ${active ? 'bg-primary border-primary text-white' : 'bg-surface border-white/10 text-secondary'}`}>
                                                {t.name} {active && <Check size={14} />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 3. Wachen */}
                            <div>
                                <label className="text-xs font-bold text-secondary uppercase mb-2 block">Wachen</label>
                                <div className="flex flex-wrap gap-2">
                                    {store.settings.stations.map(s => {
                                        const active = tempFilter.stations.includes(s);
                                        return (
                                            <button key={s} onClick={() => setTempFilter(p => ({ ...p, stations: active ? p.stations.filter(x => x !== s) : [...p.stations, s] }))}
                                                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors flex items-center gap-2 ${active ? 'bg-primary border-primary text-white' : 'bg-surface border-white/10 text-secondary'}`}>
                                                {s} {active && <Check size={14} />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 border-t border-white/10 flex gap-3 bg-surface pb-8 sm:pb-4">
                            <button onClick={handleReset} className="flex-1 py-3 font-bold text-secondary rounded-xl hover:bg-white/5 transition-colors">Zurücksetzen</button>
                            <button onClick={handleApply} className="flex-1 py-3 font-bold bg-primary text-white rounded-xl shadow-lg shadow-primary/25">Anwenden</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
