import React, { useState, useMemo } from 'react';
import { useStore } from '../context/StoreContext';
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval, addMonths, subMonths, eachMonthOfInterval, subMonths as subMonthsFn } from 'date-fns';
import { de } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Clock, Target, Activity, PieChart } from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
    AreaChart, Area, CartesianGrid
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
    const monthlyStats = useMemo(() => {
        const start = startOfMonth(currentDate);
        const end = endOfMonth(currentDate);

        const relevantShifts = store.shifts.filter(s =>
            isWithinInterval(parseISO(s.date), { start, end })
        );

        let actual = 0;
        let target = 0;
        const typeCount = {};
        const vehicleCount = {};

        relevantShifts.forEach(shift => {
            // Hours
            const duration = calculateDuration(shift.startTime, shift.endTime);
            const code = store.settings.shiftCodes.find(c => c.id === shift.codeId);
            actual += duration;
            target += (code?.hours || 0);

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
            target,
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

            let monthActual = 0;
            let monthTarget = 0;

            store.shifts.filter(s =>
                isWithinInterval(parseISO(s.date), { start: monthStart, end: monthEnd })
            ).forEach(shift => {
                monthActual += calculateDuration(shift.startTime, shift.endTime);
                const code = store.settings.shiftCodes.find(c => c.id === shift.codeId);
                monthTarget += (code?.hours || 0);
            });

            return {
                name: format(month, 'MMM', { locale: de }),
                saldo: (monthActual - monthTarget).toFixed(1),
                actual: monthActual.toFixed(1)
            };
        });
    }, [store.shifts, store.settings]);

    const delta = monthlyStats.actual - monthlyStats.target;
    const isPositive = delta >= 0;
    const percentage = monthlyStats.target > 0 ? Math.min((monthlyStats.actual / monthlyStats.target) * 100, 100) : 0;

    return (
        <div className="animate-in slide-in-from-bottom-4 pb-20">
            <div className="flex-between mb-6">
                <h1>Auswertung</h1>
                <div className="flex items-center gap-4 bg-surface rounded-full px-4 py-2" style={{ background: 'var(--bg-surface)', borderRadius: '24px', padding: '8px 16px' }}>
                    <button onClick={() => setCurrentDate(subMonths(currentDate, 1))}><ChevronLeft size={20} /></button>
                    <span className="font-bold capitalize text-sm">{format(currentDate, 'MMMM yyyy', { locale: de })}</span>
                    <button onClick={() => setCurrentDate(addMonths(currentDate, 1))}><ChevronRight size={20} /></button>
                </div>
            </div>

            {/* --- Main KPI Cards --- */}
            <div className="grid grid-cols-2 gap-4 mb-6">
                {/* Actual */}
                <div className="card text-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
                    <span className="text-secondary text-xs font-bold uppercase block mb-1">Ist-Stunden</span>
                    <span className="text-3xl font-bold text-white">{monthlyStats.actual.toFixed(1)}</span>
                    <span className="text-xs text-secondary/60 mt-1 block">Geleistet</span>
                </div>

                {/* Target */}
                <div className="card text-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-secondary" />
                    <span className="text-secondary text-xs font-bold uppercase block mb-1">Soll-Stunden</span>
                    <span className="text-3xl font-bold text-white">{monthlyStats.target.toFixed(1)}</span>
                    <span className="text-xs text-secondary/60 mt-1 block">Plan</span>
                </div>

                {/* Saldo Big Card */}
                <div className="card col-span-2 flex items-center justify-between p-6 relative overflow-hidden">
                    <div className={`absolute top-0 bottom-0 right-0 w-24 opacity-10 ${isPositive ? 'bg-success' : 'bg-danger'} blur-xl transform translate-x-10`} />

                    <div>
                        <span className="text-secondary text-xs font-bold uppercase mb-1 flex items-center gap-1">
                            <Activity size={14} /> Monatssaldo
                        </span>
                        <div className={`text-4xl font-bold ${isPositive ? 'text-success' : 'text-danger'} flex items-center gap-2`}>
                            {delta > 0 ? '+' : ''}{delta.toFixed(2)} <span className="text-lg text-secondary/50">h</span>
                        </div>
                    </div>

                    <div className={`p-4 rounded-full ${isPositive ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                        {isPositive ? <TrendingUp size={32} /> : <TrendingDown size={32} />}
                    </div>
                </div>
            </div>

            {/* --- Progress Bar --- */}
            <div className="card mb-6">
                <div className="flex-between mb-2">
                    <span className="text-xs font-bold text-secondary">Monatsziel</span>
                    <span className="text-xs font-bold text-primary">{percentage.toFixed(0)}%</span>
                </div>
                <div className="h-4 bg-surface-highlight rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-primary to-orange-400 transition-all duration-1000"
                        style={{ width: `${percentage}%` }}
                    />
                </div>
            </div>

            {/* --- Stats Detail Grid --- */}
            <h3 className="text-secondary text-sm font-bold uppercase tracking-wider mb-4 px-2">Details</h3>
            <div className="grid grid-cols-2 gap-4 mb-8">
                <StatBox title="Schichten" value={monthlyStats.count} icon={Clock} />
                {monthlyStats.types.map((t, i) => (
                    <StatBox key={i} title={t.name} value={t.count} icon={PieChart} color="text-blue-400" />
                ))}
            </div>

            {/* --- Trend Chart --- */}
            <h3 className="text-secondary text-sm font-bold uppercase tracking-wider mb-4 px-2">Trend (6 Monate)</h3>
            <div className="card h-[250px] w-full p-2">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData}>
                        <defs>
                            <linearGradient id="colorSaldo" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                        <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                        <YAxis hide />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#fff' }}
                            itemStyle={{ color: '#fff' }}
                            labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
                        />
                        <Area type="monotone" dataKey="actual" stroke="#f97316" strokeWidth={2} fill="url(#colorSaldo)" dot={{ fill: '#f97316', r: 3 }} name="Stunden" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

        </div>
    );
}

// Small Helper Component
function StatBox({ title, value, icon: Icon, color }) {
    return (
        <div className="card flex items-center gap-3 p-4">
            <div className={`p-2 rounded-lg bg-surface-highlight ${color || 'text-secondary'}`}>
                <Icon size={18} />
            </div>
            <div>
                <span className="block text-xl font-bold">{value}</span>
                <span className="text-xs text-secondary opacity-80">{title}</span>
            </div>
        </div>
    );
}
