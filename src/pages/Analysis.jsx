import React, { useState, useMemo } from 'react';
import { useStore } from '../context/StoreContext';
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval, addMonths, subMonths } from 'date-fns';
import { de } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Clock, Target } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

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
    const [currentDate, setCurrentDate] = useState(new Date());

    const stats = useMemo(() => {
        const start = startOfMonth(currentDate);
        const end = endOfMonth(currentDate);

        const relevantShifts = store.shifts.filter(s =>
            isWithinInterval(parseISO(s.date), { start, end })
        );

        let actual = 0;
        let target = 0;

        relevantShifts.forEach(shift => {
            const duration = calculateDuration(shift.startTime, shift.endTime);
            const code = store.settings.shiftCodes.find(c => c.id === shift.codeId);

            actual += duration;
            target += (code?.hours || 0); // Default to 0, though "Soll" implies it exists
        });

        return { actual, target, count: relevantShifts.length };
    }, [store.shifts, currentDate]);

    const delta = stats.actual - stats.target;
    const isPositive = delta >= 0;

    const chartData = [
        { name: 'Soll', hours: stats.target },
        { name: 'Ist', hours: stats.actual },
    ];

    return (
        <div className="animate-in fade-in zoom-in-95 duration-500">
            <h1 className="mb-6">Auswertung</h1>

            {/* Month Selector */}
            <div className="flex items-center justify-between mb-8 glass-panel p-2">
                <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-2 rounded-full hover:bg-white/10">
                    <ChevronLeft />
                </button>
                <span className="font-bold text-lg capitalize">
                    {format(currentDate, 'MMMM yyyy', { locale: de })}
                </span>
                <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-2 rounded-full hover:bg-white/10">
                    <ChevronRight />
                </button>
            </div>

            {/* KPI Grid */}
            <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="glass-panel p-4 flex flex-col items-center justify-center text-center">
                    <span className="text-[var(--text-muted)] text-xs uppercase mb-1 flex items-center gap-1"><Clock size={12} /> Ist</span>
                    <span className="text-2xl font-bold">{stats.actual.toFixed(1)}h</span>
                </div>
                <div className="glass-panel p-4 flex flex-col items-center justify-center text-center">
                    <span className="text-[var(--text-muted)] text-xs uppercase mb-1 flex items-center gap-1"><Target size={12} /> Soll</span>
                    <span className="text-2xl font-bold">{stats.target.toFixed(1)}h</span>
                </div>
                <div className={`glass-panel p-4 col-span-2 flex items-center justify-between px-8 ${isPositive ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                    <span className="text-sm font-semibold opacity-80">Differenz</span>
                    <div className="flex items-center gap-2">
                        {isPositive ? <TrendingUp size={24} className="text-green-400" /> : <TrendingDown size={24} className="text-red-400" />}
                        <span className={`text-3xl font-bold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                            {delta > 0 ? '+' : ''}{delta.toFixed(1)}h
                        </span>
                    </div>
                </div>
            </div>

            {/* Chart */}
            <div className="glass-panel p-6 h-[250px] w-full">
                <h3 className="mb-4 text-sm font-semibold text-[var(--text-muted)]">Vergleich</h3>
                <ResponsiveContainer width="100%" height="80%">
                    <BarChart data={chartData} layout="vertical">
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={40} tick={{ fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                        <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }} />
                        <Bar dataKey="hours" radius={[0, 4, 4, 0]} barSize={30}>
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={index === 0 ? '#38bdf8' : (entry.hours >= stats.target ? '#22c55e' : '#ef4444')} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
