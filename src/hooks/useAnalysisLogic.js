import { useState, useMemo } from 'react';
import { useStore } from '../context/StoreContext';

// --- Native Helpers ---
const formatDate = (date, options) => new Intl.DateTimeFormat('de-DE', options).format(date);

const getMonthRange = (date) => {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    return { start, end };
};

const getYearRange = (date) => {
    const start = new Date(date.getFullYear(), 0, 1);
    const end = new Date(date.getFullYear(), 11, 31);
    return { start, end };
};

const parseDate = (str) => {
    if (!str) return null;
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
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
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [selectedTypes, setSelectedTypes] = useState([]);

    // Logic
    const { start, end, label, target } = useMemo(() => {
        let s, e, l, t;
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
            s = parseDate(customStart);
            e = parseDate(customEnd);
            if (!s || !e) {
                const r = getMonthRange(new Date());
                s = r.start; e = r.end;
                l = 'Ungültig';
            } else {
                l = 'Zeitraum';
            }
            if (s && e) {
                const diffDays = Math.ceil(Math.abs(e - s) / (1000 * 60 * 60 * 24));
                t = (diffDays / 7) * 7.8;
            } else {
                t = 0;
            }
        }
        return { start: s, end: e, label: l, target: t };
    }, [filterMode, baseDate, customStart, customEnd]);

    const filteredData = useMemo(() => {
        if (!store.shifts) return [];
        return store.shifts.filter(s => {
            const d = parseDate(s.date);
            if (!d) return false;

            // Range Check
            if (d < start || d > end) return false;

            // Type Check
            if (selectedTypes.length > 0 && !selectedTypes.includes(s.typeId)) return false;

            return true;
        });
    }, [store.shifts, start, end, selectedTypes]);

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
            .map(([d, h]) => ({
                label: formatDate(new Date(d), { day: '2-digit' }) + '.',
                hours: h,
                date: d
            }))
            .sort((a, b) => a.date.localeCompare(b.date));

        const distributionData = Object.entries(typeCounts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);

        return { actual, count: filteredData.length, chartData, distributionData };
    }, [filteredData, store.settings]);

    return {
        loading,
        start, end, label, target,
        filterMode, setFilterMode,
        baseDate, setBaseDate,
        customStart, setCustomStart,
        customEnd, setCustomEnd,
        selectedTypes, setSelectedTypes,
        stats,
        delta: stats.actual - target
    };
}
