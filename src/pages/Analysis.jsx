import React, { useState, useMemo } from 'react';
import { useStore } from '../context/StoreContext';
import {
    format, parseISO, startOfMonth, endOfMonth, isWithinInterval,
    eachMonthOfInterval, subMonths, getDaysInMonth, startOfYear,
    endOfYear, differenceInCalendarWeeks
} from 'date-fns';
import { de } from 'date-fns/locale';
import {
    BarChart2, Filter, Calendar as CalIcon, ChevronDown, Check,
    TrendingUp, TrendingDown, Clock, PieChart as PieIcon, X
} from 'lucide-react';
import {
    AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, BarChart, Bar
} from 'recharts';

// --- Colors ---
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

    // --- Filter State ---
    const [filterMode, setFilterMode] = useState('month'); // 'month', 'year', 'custom'
    const [baseDate, setBaseDate] = useState(new Date());

    // Custom Date Range
    const [customStart, setCustomStart] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [customEnd, setCustomEnd] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));

    // Detail Filters
    const [selectedTypes, setSelectedTypes] = useState([]); // IDs
    const [showFilters, setShowFilters] = useState(false);

    // --- Logic ---

    // 1. Determine active date range based on mode
    const { dateRange, rangeLabel, targetHours } = useMemo(() => {
        let start, end, label, target;

        if (filterMode === 'month') {
            start = startOfMonth(baseDate);
            end = endOfMonth(baseDate);
            label = format(baseDate, 'MMMM yyyy', { locale: de });

            const weeks = getDaysInMonth(baseDate) / 7;
            target = weeks * 7.8;

        } else if (filterMode === 'year') {
            start = startOfYear(baseDate);
            end = endOfYear(baseDate);
            label = format(baseDate, 'yyyy');

            // Rough approximation for year
            target = 52.14 * 7.8;

        } else {
            // Custom
            start = parseISO(customStart);
            end = parseISO(customEnd);
            label = 'Benutzerdefiniert';

            const diffDays = (end - start) / (1000 * 60 * 60 * 24) + 1;
            const weeks = diffDays / 7;
            target = weeks * 7.8;
        }

        return { dateRange: { start, end }, rangeLabel: label, targetHours: target };
    }, [filterMode, baseDate, customStart, customEnd]);

    // 2. Filter Data
    const filteredData = useMemo(() => {
        return store.shifts.filter(s => {
            const d = parseISO(s.date);
            // Date Check
            if (!isWithinInterval(d, dateRange)) return false;

            // Type ID Check (if specific types are selected)
            if (selectedTypes.length > 0 && !selectedTypes.includes(s.typeId)) return false;

            return true;
        });
    }, [store.shifts, dateRange, selectedTypes]);

    // 3. Calculate Stats
    const stats = useMemo(() => {
        let actual = 0;
        const typeCounts = {};
        const shiftsByDate = {}; // For Chart

        filteredData.forEach(s => {
            const dur = calculateDuration(s.startTime, s.endTime);
            actual += dur;

            // Type Count
            const tName = store.settings.shiftTypes.find(t => t.id === s.typeId)?.name || 'Unbekannt';
            typeCounts[tName] = (typeCounts[tName] || 0) + 1;

            // Chart Data Aggregation
            const dateKey = s.date;
            shiftsByDate[dateKey] = (shiftsByDate[dateKey] || 0) + dur;
        });

        // Chart Data Preparation
        const chartData = Object.entries(shiftsByDate)
            .map(([date, hours]) => ({ date, hours, label: format(parseISO(date), 'dd.MM') }))
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        // Distribution Data
        const distributionData = Object.entries(typeCounts).map(([name, value]) => ({ name, value }));

        return {
            actual,
            count: filteredData.length,
            chartData,
            distributionData
        };

    }, [filteredData, store.settings]);

    const delta = stats.actual - targetHours;
    const isPositive = delta >= 0;

    // --- Handlers ---
    const handleTypeToggle = (id) => {
        if (selectedTypes.includes(id)) {
            setSelectedTypes(prev => prev.filter(t => t !== id));
        } else {
            setSelectedTypes(prev => [...prev, id]);
        }
    };

    return (
        <div className="animate-in fade-in pb-24">

            {/* --- Filter / Header Section --- */}
            <div className="mb-6 sticky top-0 bg-app/95 backdrop-blur-md z-10 py-2 -mx-5 px-5 border-b border-white/5">
                <div className="flex justify-between items-center mb-2">
                    <h1 className="text-xl font-bold mb-0">Auswertung</h1>
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`p-2 rounded-full border ${showFilters ? 'bg-primary border-primary text-white' : 'bg-surface border-surface-highlight text-secondary'}`}
                    >
                        <Filter size={20} />
                    </button>
                </div>

                {/* Collapsible Filter Panel */}
                {showFilters && (
                    <div className="bg-surface rounded-xl p-4 mb-4 animate-in slide-in-from-top-2">
                        <div className="grid grid-cols-3 gap-2 mb-4">
                            <button onClick={() => setFilterMode('month')} className={`p-2 rounded-lg text-sm font-bold ${filterMode === 'month' ? 'bg-primary text-white' : 'bg-surface-highlight text-secondary'}`}>Monat</button>
                            <button onClick={() => setFilterMode('year')} className={`p-2 rounded-lg text-sm font-bold ${filterMode === 'year' ? 'bg-primary text-white' : 'bg-surface-highlight text-secondary'}`}>Jahr</button>
                            <button onClick={() => setFilterMode('custom')} className={`p-2 rounded-lg text-sm font-bold ${filterMode === 'custom' ? 'bg-primary text-white' : 'bg-surface-highlight text-secondary'}`}>Zeitraum</button>
                        </div>

                        {/* Sub-Controls based on Mode */}
                        {filterMode === 'month' && (
                            <input
                                type="month"
                                className="input-field mb-4"
                                value={format(baseDate, 'yyyy-MM')}
                                onChange={(e) => setBaseDate(parseISO(e.target.value))}
                            />
                        )}

                        {filterMode === 'year' && (
                            <div className="flex items-center justify-between bg-surface-highlight rounded-lg p-2 mb-4">
                                <button onClick={() => setBaseDate(subMonths(baseDate, 12))} className="p-2"><ChevronDown className="rotate-90" /></button>
                                <span className="font-bold">{format(baseDate, 'yyyy')}</span>
                                <button onClick={() => setBaseDate(addMonths(baseDate, 12))} className="p-2"><ChevronDown className="-rotate-90" /></button>
                            </div>
                        )}

                        {filterMode === 'custom' && (
                            <div className="flex gap-2 mb-4">
                                <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="input-field" />
                                <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="input-field" />
                            </div>
                        )}

                        {/* Type Filters */}
                        <h3 className="text-xs font-bold text-secondary uppercase tracking-wider mb-2">Schichtarten filtern</h3>
                        <div className="flex flex-wrap gap-2">
                            {store.settings.shiftTypes.map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => handleTypeToggle(t.id)}
                                    className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors flex items-center gap-1
                    ${selectedTypes.includes(t.id)
                                            ? 'bg-primary border-primary text-white'
                                            : 'bg-transparent border-surface-highlight text-secondary'}`
                                    }
                                >
                                    {t.name}
                                    {selectedTypes.includes(t.id) && <Check size={12} />}
                                </button>
                            ))}
                            {selectedTypes.length > 0 && (
                                <button onClick={() => setSelectedTypes([])} className="px-2 py-1 text-xs text-danger">Reset</button>
                            )}
                        </div>
                    </div>
                )}

                {/* Create summary label when filters hidden */}
                {!showFilters && (
                    <div className="flex justify-between items-end">
                        <span className="text-primary font-bold text-lg">{rangeLabel}</span>
                        {selectedTypes.length > 0 && <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded-full">{selectedTypes.length} Filter aktiv</span>}
                    </div>
                )}
            </div>

            {/* --- KPI Grid --- */}
            <div className="grid grid-cols-2 gap-3 mb-6">
                {/* Actual */}
                <div className="card p-4">
                    <span className="text-xs font-bold text-secondary uppercase block mb-1">Geleistet</span>
                    <span className="text-2xl font-bold text-white block">{stats.actual.toFixed(1)} <span className="text-sm text-secondary">h</span></span>
                </div>
                {/* Count */}
                <div className="card p-4">
                    <span className="text-xs font-bold text-secondary uppercase block mb-1">Schichten</span>
                    <span className="text-2xl font-bold text-white block">{stats.count}</span>
                </div>
                {/* Balance */}
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

            {/* --- Distribution Chart --- */}
            {stats.distributionData.length > 0 && (
                <div className="card p-4 mb-6">
                    <div className="flex items-center gap-2 mb-4">
                        <PieIcon size={16} className="text-primary" />
                        <h3 className="text-sm font-bold text-white mb-0">Verteilung Schichtarten</h3>
                    </div>
                    <div className="h-[200px] flex items-center">
                        <ResponsiveContainer width="50%" height="100%">
                            <PieChart>
                                <Pie
                                    data={stats.distributionData}
                                    dataKey="value"
                                    nameKey="name"
                                    innerRadius={40}
                                    outerRadius={60}
                                    paddingAngle={5}
                                >
                                    {stats.distributionData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
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

            {/* --- Timeline Chart --- */}
            <div className="card p-4 mb-6">
                <div className="flex items-center gap-2 mb-4">
                    <BarChart2 size={16} className="text-primary" />
                    <h3 className="text-sm font-bold text-white mb-0">Verlauf im Zeitraum</h3>
                </div>
                <div className="h-[200px] w-full">
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
                        <div className="h-full flex items-center justify-center text-secondary text-sm">
                            Keine Daten für diesen Zeitraum
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
}
