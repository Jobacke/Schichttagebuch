import { useState, useMemo } from 'react';
import { useStore } from '../context/StoreContext';

// --- Native Helpers ---
const formatDate = (date, options) => new Intl.DateTimeFormat('de-DE', options).format(date);

// Helper to make "YYYY-MM-DD" into a local midnight Date
const parseDateString = (str) => {
    if (!str) return null;
    const [y, m, d] = str.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d); // Local Midnight
};

const getMonthRange = (date) => {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
};

const getYearRange = (date) => {
    const start = new Date(date.getFullYear(), 0, 1);
    const end = new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);
    return { start, end };
};

function calculateDuration(start, end) {
    if (!start || !end) return 0;
    try {
        const [startH, startM] = start.split(':').map(Number);
        const [endH, endM] = end.split(':').map(Number);
        let startMinutes = startH * 60 + startM;
        let endMinutes = endH * 60 + endM;
        if (endMinutes < startMinutes) endMinutes += 24 * 60;
        return (endMinutes - startMinutes) / 60;
    } catch { return 0; }
}

export function useAnalysisLogic() {
    const { store, loading } = useStore();

    // Default Filter State
    const [filterMode, setFilterMode] = useState('month'); // 'month', 'year', 'custom'
    const [baseDate, setBaseDate] = useState(new Date());

    // Custom Range Inputs
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');

    // Filter Arrays
    const [selectedTypes, setSelectedTypes] = useState([]);
    const [selectedVehicles, setSelectedVehicles] = useState([]);

    // Logic
    const { start, end, label, target, isInvalid } = useMemo(() => {
        let s, e, l, t, invalid = false;
        const now = baseDate;

        if (filterMode === 'month') {
            const range = getMonthRange(now);
            s = range.start;
            e = range.end;
            l = formatDate(now, { month: 'long', year: 'numeric' });
            t = (e.getDate() / 7) * 7.8;
        } else if (filterMode === 'year') {
            const range = getYearRange(now);
            s = range.start;
            e = range.end;
            l = formatDate(now, { year: 'numeric' });
            t = 52.14 * 7.8;
        } else {
            // Custom Mode
            s = parseDateString(customStart);
            e = parseDateString(customEnd);

            if (s && e) {
                // Set end to end of day
                e.setHours(23, 59, 59, 999);

                l = `${formatDate(s, { day: '2-digit', month: '2-digit', year: '2-digit' })} - ${formatDate(e, { day: '2-digit', month: '2-digit', year: '2-digit' })}`;

                const diffMs = Math.abs(e - s);
                const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                t = (diffDays / 7) * 7.8;
            } else {
                // Fallback / Invalid State
                const r = getMonthRange(new Date());
                s = r.start; e = r.end; // Fallback to current month internally to prevent null pointer
                l = 'Bitte Zeitraum wählen';
                t = 0;
                invalid = true;
            }
        }
        return { start: s, end: e, label: l, target: t, isInvalid: invalid };
    }, [filterMode, baseDate, customStart, customEnd]);

    const filteredData = useMemo(() => {
        if (!store.shifts) return [];
        return store.shifts.filter(s => {
            const d = parseDateString(s.date);
            if (!d) return false;

            // Range Check
            if (d < start || d > end) return false;

            // Type Check
            if (selectedTypes.length > 0 && !selectedTypes.includes(s.typeId)) return false;

            // Vehicle Check
            if (selectedVehicles.length > 0 && !selectedVehicles.includes(s.vehicle)) return false;

            return true;
        });
    }, [store.shifts, start, end, selectedTypes, selectedVehicles]);

    const stats = useMemo(() => {
        let actual = 0;
        const typeCounts = {};
        const shiftsByDate = {}; // date string -> hours

        filteredData.forEach(s => {
            const dur = calculateDuration(s.startTime, s.endTime);
            actual += dur;

            const tName = (store.settings?.shiftTypes || []).find(t => t.id === s.typeId)?.name || 'Unbekannt';
            typeCounts[tName] = (typeCounts[tName] || 0) + 1;

            shiftsByDate[s.date] = (shiftsByDate[s.date] || 0) + dur;
        });

        // Prepare simple arrays for UI
        const chartData = Object.entries(shiftsByDate)
            .map(([dStr, h]) => {
                const d = parseDateString(dStr);
                return {
                    label: d ? formatDate(d, { day: '2-digit' }) + '.' : '??',
                    hours: h,
                    date: dStr
                };
            })
            .sort((a, b) => a.date.localeCompare(b.date));

        const distributionData = Object.entries(typeCounts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);

        return { actual, count: filteredData.length, chartData, distributionData };
    }, [filteredData, store.settings]);

    return {
        loading,
        start, end, label, target, isInvalid,
        filterMode, setFilterMode,
        baseDate, setBaseDate,
        customStart, setCustomStart,
        customEnd, setCustomEnd,
        selectedTypes, setSelectedTypes,
        selectedVehicles, setSelectedVehicles,
        stats,
        delta: stats.actual - target,
        filteredData
    };
}
