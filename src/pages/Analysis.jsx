import React, { useState, useMemo } from 'react';
import { useStore } from '../context/StoreContext';
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval, addMonths, subMonths, eachMonthOfInterval, subMonths as subMonthsFn, getDaysInMonth } from 'date-fns';
import { de } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Clock, Activity, PieChart, BarChart2 } from 'lucide-react';
import {
    AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer
} from 'recharts';

function calculateDuration(start, end) {
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);

    let startMinutes = startH * 60 + startM;
    let endMinutes = endH * 60 + endM;

    if (endMinutes < startMinutes) endMinutes += 24 * 60; // Overnight

    return (endMinutes - startMinutes) / 60;
}

export default function Analysis() {
    const { store } = useStore();
    const [currentDate, setCurrentDate] = useState(new Date());

    // --- Monthly Stats Calculation ---
    const stats = useMemo(() => {
        const start = startOfMonth(currentDate);
        const end = endOfMonth(currentDate);
        const daysInMonth = getDaysInMonth(currentDate);
        const weeksInMonth = daysInMonth / 7;

        // NEW: Target based on 7.8h / week
        const targetHours = weeksInMonth * 7.8;

        const relevantShifts = store.shifts.filter(s =>
            isWithinInterval(parseISO(s.date), { start, end })
        );

        let actual = 0;
        const typeCount = {};
        const vehicleCount = {};

        relevantShifts.forEach(shift => {
            // Hours
            const duration = calculateDuration(shift.startTime, shift.endTime);
            actual += duration;

            // Counts by Type
            const typeName = store.settings.shiftTypes.find(t => t.id === shift.typeId)?.name || 'Unbekannt';
            typeCount[typeName] = (typeCount[typeName] || 0) + 1;

            // Counts by Vehicle
            if (shift.vehicle) {
                vehicleCount[shift.vehicle] = (vehicleCount[shift.vehicle] || 0) + 1;
            }
        });

        return {
            actual,
            target: targetHours,
            count: relevantShifts.length,
            types: Object.entries(typeCount).map(([name, count]) => ({ name, count })),
            vehicles: Object.entries(vehicleCount).map(([name, count]) => ({ name, count }))
        };
    }, [store.shifts, currentDate, store.settings]);

    // --- Trend Data (Last 6 Months) ---
    const trendData = useMemo(() => {
        const end = new Date();
        const start = subMonthsFn(end, 5);
        const months = eachMonthOfInterval({ start, end });

        return months.map(month => {
            const monthStart = startOfMonth(month);
            const monthEnd = endOfMonth(month);
            const days = getDaysInMonth(month);
            const target = (days / 7) * 7.8;

            let monthActual = 0;

            store.shifts.filter(s =>
                isWithinInterval(parseISO(s.date), { start: monthStart, end: monthEnd })
            ).forEach(shift => {
                monthActual += calculateDuration(shift.startTime, shift.endTime);
            });

            return {
                name: format(month, 'MMM', { locale: de }),
                actual: parseFloat(monthActual.toFixed(1)),
                target: parseFloat(target.toFixed(1))
            };
        });
    }, [store.shifts]);

    const delta = stats.actual - stats.target;
    const isPositive = delta >= 0;
    const percentage = stats.target > 0 ? Math.min((stats.actual / stats.target) * 100, 100) : 0;

    return (
        <div className="animate-in fade-in duration-500 pb-20">

            {/* Header Month Selector */}
            <div className="flex justify-between items-center mb-6">
                <h1>Auswertung</h1>
                <div className="flex items-center bg-surface rounded-full p-1 border border-surface-highlight">
                    <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-2 hover:text-primary transition-colors"><ChevronLeft size={20} /></button>
                    <span className="font-bold text-sm px-2 min-w-[100px] text-center">{format(currentDate, 'MMMM yyyy', { locale: de })}</span>
                    <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-2 hover:text-primary transition-colors"><ChevronRight size={20} /></button>
                </div>
            </div>

            {/* --- Main Dashboard Grid --- */}
            <div className="grid grid-cols-2 gap-4 mb-6">

                {/* Actual Hours */}
                <div className="card p-4 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Clock size={40} className="text-secondary" />
                    </div>
                    <div className="relative z-10">
                        <p className="text-xs font-bold text-secondary uppercase tracking-wider mb-1">Ist-Stunden</p>
                        <p className="text-3xl font-bold text-white mb-1">{stats.actual.toFixed(1)}</p>
                        <p className="text-xs text-tertiary">Geleistet</p>
                    </div>
                </div>

                {/* Target Hours */}
                <div className="card p-4 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Activity size={40} className="text-primary" />
                    </div>
                    <div className="relative z-10">
                        <p className="text-xs font-bold text-primary uppercase tracking-wider mb-1">Soll-Stunden</p>
                        <p className="text-3xl font-bold text-white mb-1">{stats.target.toFixed(1)}</p>
                        <p className="text-xs text-tertiary">Basis 7.8h/Wo</p>
                    </div>
                </div>

                {/* Saldo / Difference */}
                <div className="card col-span-2 p-5 flex items-center justify-between relative overflow-hidden">
                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${isPositive ? 'bg-success' : 'bg-danger'}`}></div>
                    <div>
                        <p className="text-xs font-bold text-tertiary uppercase tracking-wider mb-1">Monatssaldo</p>
                        <div className="flex items-baseline gap-2">
                            <span className={`text-4xl font-bold ${isPositive ? 'text-success' : 'text-danger'}`}>
                                {delta > 0 ? '+' : ''}{delta.toFixed(1)}
                            </span>
                            <span className="text-sm text-tertiary">Stunden</span>
                        </div>
                    </div>
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isPositive ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                        {isPositive ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
                    </div>
                </div>
            </div>

            {/* --- Progress Circle Section --- */}
            <div className="card p-5 mb-8">
                <div className="flex justify-between items-end mb-2">
                    <div>
                        <h3 className="text-sm font-bold text-white mb-1">Monatsziel Erreicht</h3>
                        <p className="text-xs text-tertiary">{percentage.toFixed(0)}% der Soll-Arbeitszeit</p>
                    </div>
                    <BarChart2 className="text-primary opacity-50" size={20} />
                </div>
                <div className="w-full bg-surface-highlight rounded-full h-3 overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-primary to-danger transition-all duration-1000 ease-out"
                        style={{ width: `${percentage}%` }}
                    />
                </div>
            </div>

            {/* --- Chart Section --- */}
            <h3 className="text-sm font-bold text-tertiary uppercase mb-4 px-1">Trendverlauf</h3>
            <div className="card p-4 h-[280px] w-full mb-8">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                        <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} dy={10} />
                        <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                            itemStyle={{ color: '#fff' }}
                        />
                        <Area type="monotone" dataKey="actual" stroke="#f97316" strokeWidth={3} fillOpacity={1} fill="url(#colorActual)" />
                        {/* Optional: Reference line for Target could be added here if needed per month */}
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* --- Detailed Breakdown --- */}
            <h3 className="text-sm font-bold text-tertiary uppercase mb-4 px-1">Details</h3>
            <div className="space-y-3">
                {stats.types.map((type, idx) => (
                    <div key={idx} className="card p-4 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-surface-highlight flex items-center justify-center text-secondary">
                                <PieChart size={16} />
                            </div>
                            <span className="font-medium text-white">{type.name}</span>
                        </div>
                        <span className="font-bold text-xl">{type.count}x</span>
                    </div>
                ))}
            </div>

        </div>
    );
}
