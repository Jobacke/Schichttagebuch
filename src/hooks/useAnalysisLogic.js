import { useState, useMemo } from 'react';
import { useStore, getShiftBonusAmount } from '../context/StoreContext';
import { detectStation } from '../utils/shiftColors';

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

export const getMonthlyWeeklyHours = (year, monthIndex0, settings) => {
    const yearMonth = `${year}-${String(monthIndex0 + 1).padStart(2, '0')}`;
    const monthlyWeeklyHours = settings?.monthlyWeeklyHours || {};
    if (monthlyWeeklyHours[yearMonth] !== undefined && monthlyWeeklyHours[yearMonth] !== '' && !isNaN(Number(monthlyWeeklyHours[yearMonth]))) {
        return Number(monthlyWeeklyHours[yearMonth]);
    }
    return Number(settings?.defaultWeeklyHours ?? 20);
};

export const getMonthlyTarget = (year, monthIndex0, settings) => {
    const weeklyHours = getMonthlyWeeklyHours(year, monthIndex0, settings);
    const daysInMonth = new Date(year, monthIndex0 + 1, 0).getDate();
    return (daysInMonth / 7) * weeklyHours;
};

export function useAnalysisLogic() {
    const { store, loading } = useStore();

    // Default Filter State
    const [filterMode, setFilterMode] = useState('month'); // 'month', 'year', 'custom'
    const [baseDate, setBaseDate] = useState(new Date());

    // Custom Range Inputs
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');

    // Filter Arrays & Bonus Toggle
    const [selectedTypes, setSelectedTypes] = useState([]);
    const [selectedVehicles, setSelectedVehicles] = useState([]);
    const [selectedStations, setSelectedStations] = useState([]);
    const [onlyBonus, setOnlyBonus] = useState(false);

    // Logic
    const { start, end, label, target, isInvalid } = useMemo(() => {
        let s, e, l, t, invalid = false;
        const now = baseDate;

        if (filterMode === 'month') {
            const range = getMonthRange(now);
            s = range.start;
            e = range.end;
            l = formatDate(now, { month: 'long', year: 'numeric' });
            t = getMonthlyTarget(now.getFullYear(), now.getMonth(), store.settings);
        } else if (filterMode === 'year') {
            const range = getYearRange(now);
            s = range.start;
            e = range.end;
            l = formatDate(now, { year: 'numeric' });
            const y = now.getFullYear();
            let yearTotal = 0;
            for (let m = 0; m < 12; m++) {
                yearTotal += getMonthlyTarget(y, m, store.settings);
            }
            t = yearTotal;
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
                const weeklyHours = Number(store.settings?.defaultWeeklyHours ?? 20);
                t = (diffDays / 7) * weeklyHours;
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
    }, [filterMode, baseDate, customStart, customEnd, store.settings]);

    const filteredData = useMemo(() => {
        if (!store.shifts) return [];
        return store.shifts.filter(s => {
            const d = parseDateString(s.date);
            if (!d) return false;

            // Range Check
            if (d < start || d > end) return false;

            // Bonus Filter Check
            if (onlyBonus && !s.hasBonus) return false;

            // Type Check
            if (selectedTypes.length > 0 && !selectedTypes.includes(s.typeId)) return false;

            // Vehicle Check
            if (selectedVehicles.length > 0 && !selectedVehicles.includes(s.vehicle)) return false;

            // Station Check
            if (selectedStations.length > 0) {
                const st = detectStation(s);
                if (!selectedStations.includes(st)) return false;
            }

            return true;
        });
    }, [store.shifts, start, end, onlyBonus, selectedTypes, selectedVehicles, selectedStations]);

    const stats = useMemo(() => {
        let actual = 0;
        let bonusCount = 0;
        let bonusTotalAmount = 0;
        let bonusHours = 0;
        const typeCounts = {};
        const shiftsByDate = {}; // date string -> hours
        const bonusByStationMap = {};
        const bonusByCodeMap = {};

        filteredData.forEach(s => {
            const dur = calculateDuration(s.startTime, s.endTime);
            actual += dur;

            const tName = (store.settings?.shiftTypes || []).find(t => t.id === s.typeId)?.name || 'Unbekannt';
            typeCounts[tName] = (typeCounts[tName] || 0) + 1;

            shiftsByDate[s.date] = (shiftsByDate[s.date] || 0) + dur;

            if (s.hasBonus) {
                const amt = getShiftBonusAmount(s, store.settings);
                bonusCount += 1;
                bonusTotalAmount += amt;
                bonusHours += dur;

                const st = detectStation(s);
                if (!bonusByStationMap[st]) bonusByStationMap[st] = { station: st, count: 0, amount: 0, hours: 0 };
                bonusByStationMap[st].count += 1;
                bonusByStationMap[st].amount += amt;
                bonusByStationMap[st].hours += dur;

                const codeStr = s.code || tName || 'Schicht';
                if (!bonusByCodeMap[codeStr]) bonusByCodeMap[codeStr] = { code: codeStr, count: 0, amount: 0 };
                bonusByCodeMap[codeStr].count += 1;
                bonusByCodeMap[codeStr].amount += amt;
            }
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

        const bonusByStation = Object.values(bonusByStationMap).sort((a, b) => b.amount - a.amount);
        const bonusByCode = Object.values(bonusByCodeMap).sort((a, b) => b.amount - a.amount);

        return {
            actual,
            count: filteredData.length,
            bonusCount,
            bonusTotalAmount,
            bonusHours,
            bonusByStation,
            bonusByCode,
            chartData,
            distributionData
        };
    }, [filteredData, store.settings]);

    // Annual & All-Time Bonus Overview (Monatliche und jährliche Auswertung)
    const bonusOverview = useMemo(() => {
        const year = baseDate.getFullYear();
        const monthNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
        const monthShortNames = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

        const months = Array.from({ length: 12 }, (_, mIdx) => ({
            monthIndex: mIdx,
            monthName: monthNames[mIdx],
            monthShort: monthShortNames[mIdx],
            yearMonth: `${year}-${String(mIdx + 1).padStart(2, '0')}`,
            count: 0,
            amount: 0,
            hours: 0,
            totalShiftsInMonth: 0
        }));

        let yearBonusCount = 0;
        let yearBonusAmount = 0;
        let yearBonusHours = 0;

        let allTimeBonusCount = 0;
        let allTimeBonusAmount = 0;
        const yearsMap = {}; // year -> { year, count, amount }

        (store.shifts || []).forEach(s => {
            if (!s.date) return;

            // Apply non-date filters if active (type, vehicle, station) so breakdown matches active resource filters
            if (selectedTypes.length > 0 && !selectedTypes.includes(s.typeId)) return;
            if (selectedVehicles.length > 0 && !selectedVehicles.includes(s.vehicle)) return;
            if (selectedStations.length > 0) {
                const st = detectStation(s);
                if (!selectedStations.includes(st)) return;
            }

            const [sYear, sMonth] = s.date.split('-').map(Number);
            if (sYear === year && sMonth >= 1 && sMonth <= 12) {
                months[sMonth - 1].totalShiftsInMonth += 1;
            }

            if (s.hasBonus) {
                const amt = getShiftBonusAmount(s, store.settings);
                const dur = calculateDuration(s.startTime, s.endTime);

                allTimeBonusCount += 1;
                allTimeBonusAmount += amt;

                if (sYear) {
                    if (!yearsMap[sYear]) yearsMap[sYear] = { year: sYear, count: 0, amount: 0 };
                    yearsMap[sYear].count += 1;
                    yearsMap[sYear].amount += amt;
                }

                if (sYear === year && sMonth >= 1 && sMonth <= 12) {
                    months[sMonth - 1].count += 1;
                    months[sMonth - 1].amount += amt;
                    months[sMonth - 1].hours += dur;
                    yearBonusCount += 1;
                    yearBonusAmount += amt;
                    yearBonusHours += dur;
                }
            }
        });

        const byYear = Object.values(yearsMap).sort((a, b) => b.year - a.year);

        return {
            year,
            months,
            yearBonusCount,
            yearBonusAmount,
            yearBonusHours,
            allTimeBonusCount,
            allTimeBonusAmount,
            byYear
        };
    }, [store.shifts, store.settings, baseDate, selectedTypes, selectedVehicles, selectedStations]);

    return {
        loading,
        start, end, label, target, isInvalid,
        filterMode, setFilterMode,
        baseDate, setBaseDate,
        customStart, setCustomStart,
        customEnd, setCustomEnd,
        selectedTypes, setSelectedTypes,
        selectedVehicles, setSelectedVehicles,
        selectedStations, setSelectedStations,
        onlyBonus, setOnlyBonus,
        stats,
        bonusOverview,
        delta: stats.actual - target,
        weeklyRate: filterMode === 'month'
            ? getMonthlyWeeklyHours(baseDate.getFullYear(), baseDate.getMonth(), store.settings)
            : Number(store.settings?.defaultWeeklyHours ?? 20),
        filteredData
    };
}
