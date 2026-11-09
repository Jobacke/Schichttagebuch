import React, { useState, useMemo } from 'react';
import { useAnalysisLogic, resolveShiftTypeName } from '../hooks/useAnalysisLogic';
import { useStore, getShiftBonusAmount } from '../context/StoreContext';
import { exportToPDF } from '../utils/pdfExport';
import { SHIFT_PRESETS } from '../utils/shiftPresets';
import { getShiftColor, STATION_THEMES, detectStation } from '../utils/shiftColors';
import { getIncomingNightShiftForDate } from '../utils/teamRosterParser';
import { ChevronLeft, ChevronRight, X, SlidersHorizontal } from 'lucide-react';

// Helper for CSS Date controls
const addMonths = (date, n) => {
    const d = new Date(date);
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    return d;
};

// Helper: Duration between HH:MM and HH:MM
const calcDuration = (start, end) => {
    if (!start || !end) return '';
    try {
        const [sh, sm] = start.split(':').map(Number);
        const [eh, em] = end.split(':').map(Number);
        let sMin = sh * 60 + sm;
        let eMin = eh * 60 + em;
        if (eMin < sMin) eMin += 24 * 60;
        return ((eMin - sMin) / 60).toFixed(1);
    } catch { return ''; }
};

// Helper: Resolve shift code, type name and color consistently with station awareness
const resolveShiftDetails = (s, storeSettings) => {
    if (!s) return { code: '', rawCode: '', typeName: 'Dienst', colorInfo: getShiftColor('', '') };

    const codeObj = (storeSettings?.shiftCodes || []).find(c => c.id === s.codeId || (s.code && c.code === s.code));
    const typeObj = (storeSettings?.shiftTypes || []).find(t => t.id === s.typeId);

    let rawCode = s.code || codeObj?.code || '';
    if (!rawCode && s.codeId && typeof s.codeId === 'string' && s.codeId.startsWith('preset_')) {
        rawCode = s.codeId.replace('preset_', '');
    }

    const preset = rawCode ? (SHIFT_PRESETS[rawCode] || {}) : {};
    const rawType = s.shiftTypeName || typeObj?.name || codeObj?.shiftTypeName || preset.shiftTypeName || resolveShiftTypeName(s, storeSettings) || '';
    const station = s.station || preset.station || '';
    const vehicle = s.vehicle || preset.vehicle || '';

    const colorInfo = getShiftColor(rawType, rawCode, station, vehicle);

    // Derive concise display code (never 'DST')
    let displayCode = rawCode;
    if (!displayCode) {
        if (rawType.toLowerCase().includes('spät')) displayCode = 'Spät';
        else if (rawType.toLowerCase().includes('früh')) displayCode = 'Früh';
        else if (rawType.toLowerCase().includes('nacht')) displayCode = 'Nacht';
        else if (rawType.toLowerCase().includes('tag')) displayCode = 'Tag';
        else displayCode = rawType ? rawType.slice(0, 4) : 'Schicht';
    }

    return {
        code: displayCode,
        rawCode,
        typeName: rawType || 'Dienst',
        station: station || colorInfo.stationName,
        stationShort: colorInfo.stationShort,
        colorInfo
    };
};

// Component: Modern Month Calendar & Shift Rhythm Grid
function ShiftRhythmCalendar({ baseDate, filterMode, filteredData, allShifts, storeSettings }) {
    const [selectedDateStr, setSelectedDateStr] = useState(null);

    // Group shifts by date string YYYY-MM-DD
    const shiftsByDate = useMemo(() => {
        const map = {};
        (filteredData || []).forEach(s => {
            if (!s.date) return;
            if (!map[s.date]) map[s.date] = [];
            map[s.date].push(s);
        });
        return map;
    }, [filteredData]);

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // Handle YEAR mode
    if (filterMode === 'year') {
        const year = baseDate.getFullYear();
        const currentYear = now.getFullYear();
        const currentMonthIdx = now.getMonth();
        const monthNames = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
        return (
            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--c-text-muted)' }}>Jahresübersicht {year}</span>
                    <span style={{ fontSize: '12px', background: 'rgb(var(--rgb-primary) / 0.15)', color: 'var(--c-primary)', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>
                        {filteredData.length} Schichten gesamt
                    </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
                    {monthNames.map((mName, mIdx) => {
                        const mStr = String(mIdx + 1).padStart(2, '0');
                        const prefix = `${year}-${mStr}`;
                        const monthShifts = filteredData.filter(s => s.date?.startsWith(prefix));
                        let mHours = 0;
                        let mBonusCount = 0;
                        let mBonusSum = 0;
                        monthShifts.forEach(s => {
                            const dur = parseFloat(calcDuration(s.startTime, s.endTime)) || 0;
                            mHours += dur;
                            const bAmt = getShiftBonusAmount(s, storeSettings);
                            if (bAmt > 0) {
                                mBonusCount++;
                                mBonusSum += bAmt;
                            }
                        });
                        const daysInM = new Date(year, mIdx + 1, 0).getDate();
                        const monthlyWeekly = storeSettings?.monthlyWeeklyHours?.[prefix] ?? storeSettings?.defaultWeeklyHours ?? 20;
                        const mTarget = (daysInM / 7) * Number(monthlyWeekly);
                        const hasShifts = monthShifts.length > 0;
                        const isCurrentMonth = year === currentYear && mIdx === currentMonthIdx;

                        return (
                            <div
                                key={mName}
                                style={{
                                    background: hasShifts ? 'var(--c-surface)' : 'var(--c-bg)',
                                    border: isCurrentMonth
                                        ? '1.5px solid var(--c-primary)'
                                        : (mBonusCount > 0 ? '1px solid rgb(var(--rgb-warning) / 0.4)' : (hasShifts ? '1px solid var(--c-surface-3)' : '1px solid rgb(var(--rgb-overlay) / 0.03)')),
                                    boxShadow: isCurrentMonth ? '0 0 10px rgb(var(--rgb-primary) / 0.25)' : 'none',
                                    borderRadius: '8px',
                                    padding: '8px 10px'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <span style={{ fontWeight: 700, fontSize: '13px', color: isCurrentMonth ? 'var(--c-primary)' : (hasShifts ? 'var(--c-text)' : 'var(--c-text-subtle)') }}>{mName}</span>
                                        {isCurrentMonth && (
                                            <span style={{ fontSize: '9px', background: 'var(--c-primary)', color: '#fff', padding: '1px 4px', borderRadius: '4px', fontWeight: 800 }}>
                                                Jetzt
                                            </span>
                                        )}
                                    </div>
                                    {hasShifts && (
                                        <span style={{ fontSize: '11px', background: 'var(--c-surface-3)', color: 'var(--c-warning)', padding: '1px 5px', borderRadius: '4px', fontWeight: 600 }}>
                                            {monthShifts.length} {monthShifts.length === 1 ? 'Dst' : 'Dste'}
                                        </span>
                                    )}
                                </div>
                                <div style={{ fontSize: '12px', fontWeight: 600, color: hasShifts ? 'var(--c-info)' : 'var(--c-border-strong)' }}>
                                    {mHours.toFixed(1)} h
                                    <span style={{ fontSize: '10px', color: 'var(--c-text-subtle)', fontWeight: 'normal', marginLeft: '4px' }}>
                                        / {mTarget.toFixed(0)}h
                                    </span>
                                </div>
                                {mBonusCount > 0 && (
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--c-warning)', marginTop: '3px' }}>
                                        💰 {mBonusCount}x ({mBonusSum.toFixed(0)} €)
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    // MONTH mode (standard view)
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // Monday-first weekday: Monday=0 ... Sunday=6
    const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;

    const days = [];
    for (let i = 0; i < firstDay; i++) {
        days.push({ empty: true, key: `empty-${i}` });
    }
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayShifts = shiftsByDate[dateStr] || [];
        const isWeekend = ((firstDay + d - 1) % 7) >= 5;
        const isToday = dateStr === todayStr;
        const incomingNightShift = getIncomingNightShiftForDate(dateStr, allShifts);
        days.push({
            empty: false,
            dayNum: d,
            dateStr,
            shifts: dayShifts,
            incomingNightShift,
            isWeekend,
            isToday,
            key: dateStr
        });
    }

    const shiftDaysCount = Object.keys(shiftsByDate).length;
    const freeDaysCount = Math.max(0, daysInMonth - shiftDaysCount);
    const nightShiftEndDaysCount = days.filter(d => !d.empty && d.incomingNightShift && (!d.shifts || d.shifts.length === 0)).length;

    const selectedDayData = selectedDateStr ? days.find(d => !d.empty && d.dateStr === selectedDateStr) : null;
    let selectedDayInfo = null;
    if (selectedDayData) {
        const dObj = new Date(selectedDayData.dateStr);
        selectedDayInfo = {
            dateStr: selectedDayData.dateStr,
            dateFormatted: dObj.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }),
            shifts: selectedDayData.shifts,
            incomingNightShift: selectedDayData.incomingNightShift
        };
    }

    return (
        <div>
            {/* Header: Title & Counter Pills */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                <h3 className="text-label" style={{ margin: 0 }}>📅 Schicht-Rhythmus</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{
                        background: 'rgb(var(--rgb-primary) / 0.15)',
                        color: 'var(--c-primary)',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 700
                    }}>
                        {filteredData.length} {filteredData.length === 1 ? 'Schicht' : 'Schichten'}
                    </span>
                    {nightShiftEndDaysCount > 0 && (
                        <span style={{
                            background: 'rgb(var(--rgb-violet) / 0.15)',
                            color: 'var(--c-violet)',
                            border: '1px solid rgb(var(--rgb-violet) / 0.35)',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 700
                        }}>
                            🌙 {nightShiftEndDaysCount}x Nacht-Ende
                        </span>
                    )}
                    <span style={{
                        background: 'rgb(var(--rgb-muted) / 0.12)',
                        color: 'var(--c-text-muted)',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600
                    }}>
                        {Math.max(0, freeDaysCount - nightShiftEndDaysCount)} Tage frei
                    </span>
                </div>
            </div>

            {/* Weekday Labels Header */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '6px' }}>
                {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((wd, i) => (
                    <div
                        key={wd}
                        style={{
                            textAlign: 'center',
                            fontSize: '11px',
                            fontWeight: 700,
                            color: i >= 5 ? 'var(--c-primary)' : 'var(--c-text-subtle)',
                            padding: '2px 0'
                        }}
                    >
                        {wd}
                    </div>
                ))}
            </div>

            {/* Calendar Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                {days.map(item => {
                    if (item.empty) {
                        return <div key={item.key} style={{ minHeight: '46px', opacity: 0 }} />;
                    }

                    const hasShift = item.shifts && item.shifts.length > 0;
                    const firstShift = hasShift ? item.shifts[0] : null;
                    const resolved = hasShift ? resolveShiftDetails(firstShift, storeSettings) : null;
                    const shiftColor = resolved?.colorInfo;
                    const isSelected = selectedDateStr === item.dateStr;
                    const isToday = item.isToday;
                    const hasBonusDay = hasShift && item.shifts.some(sh => sh.hasBonus);
                    const incomingNightShift = item.incomingNightShift;

                    return (
                        <div
                            key={item.key}
                            onClick={() => setSelectedDateStr(isSelected ? null : item.dateStr)}
                            style={{
                                minHeight: '46px',
                                padding: '4px 2px',
                                borderRadius: '8px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                background: hasShift
                                    ? shiftColor.bg
                                    : (incomingNightShift ? 'rgb(var(--rgb-violet-deep) / 0.22)' : (item.isWeekend ? 'rgb(var(--rgb-surface) / 0.4)' : 'var(--c-bg)')),
                                border: isSelected
                                    ? '2px solid var(--c-info)'
                                    : (isToday
                                        ? '2px solid var(--c-primary)'
                                        : (hasBonusDay
                                            ? '1px solid var(--c-warning)'
                                            : (hasShift
                                                ? `1px solid ${shiftColor.border}`
                                                : (incomingNightShift ? '1px solid rgb(var(--rgb-violet) / 0.4)' : '1px solid var(--c-surface)')))),
                                boxShadow: isSelected
                                    ? '0 0 10px rgb(var(--rgb-info) / 0.35)'
                                    : (isToday
                                        ? '0 0 10px rgb(var(--rgb-primary) / 0.45)'
                                        : (incomingNightShift ? '0 0 6px rgb(var(--rgb-violet) / 0.15)' : 'none'))
                            }}
                            title={hasShift
                                ? `${resolved.code} (${firstShift.startTime} - ${firstShift.endTime})${hasBonusDay ? ' • 💰 Bonus' : ''}${isToday ? ' • Heute' : ''}`
                                : (incomingNightShift
                                    ? `Tag ${item.dayNum}: Nachtschicht-Ende bis ${incomingNightShift.endTime} Uhr (${incomingNightShift.code} vom Vortag, danach frei)${isToday ? ' • Heute' : ''}`
                                    : `Tag ${item.dayNum}: Frei${isToday ? ' • Heute' : ''}`)}
                        >
                            {/* Day Number & Station Badge */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '0 2px' }}>
                                {isToday ? (
                                    <span style={{
                                        background: 'var(--c-primary)',
                                        color: '#ffffff',
                                        borderRadius: '50%',
                                        width: '18px',
                                        height: '18px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '10.5px',
                                        fontWeight: 800,
                                        lineHeight: 1,
                                        boxShadow: '0 2px 5px rgb(var(--rgb-primary) / 0.6)'
                                    }}>
                                        {item.dayNum}
                                    </span>
                                ) : (
                                    <span style={{
                                        fontSize: '11px',
                                        fontWeight: hasShift ? 800 : (item.isWeekend ? 600 : 500),
                                        color: hasShift ? 'var(--c-text)' : (item.isWeekend ? 'var(--c-text-muted)' : 'var(--c-border-strong)'),
                                        lineHeight: 1
                                    }}>
                                        {item.dayNum}
                                    </span>
                                )}
                                {hasShift && (
                                    <span style={{
                                        fontSize: '8px',
                                        fontWeight: 800,
                                        color: shiftColor.stationColor,
                                        background: shiftColor.stationBg,
                                        padding: '1px 3px',
                                        borderRadius: '3px',
                                        lineHeight: 1
                                    }}>
                                        {resolved.stationShort}
                                    </span>
                                )}
                                {!hasShift && incomingNightShift && (
                                    <span style={{
                                        fontSize: '7.5px',
                                        fontWeight: 800,
                                        color: 'var(--c-violet)',
                                        background: 'rgb(var(--rgb-violet) / 0.2)',
                                        padding: '1px 3px',
                                        borderRadius: '3px',
                                        lineHeight: 1
                                    }}>
                                        ENDE
                                    </span>
                                )}
                            </div>

                            {/* Shift Badge or Free Dot / Heute */}
                            {hasShift ? (
                                <div style={{
                                    fontSize: '10px',
                                    fontWeight: 800,
                                    color: shiftColor.color,
                                    lineHeight: 1,
                                    marginTop: '2px',
                                    maxWidth: '100%',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    textAlign: 'center'
                                }}>
                                    {resolved.code}{hasBonusDay ? '💰' : ''}
                                </div>
                            ) : incomingNightShift ? (
                                <div style={{
                                    fontSize: '8.5px',
                                    fontWeight: 700,
                                    color: 'var(--c-violet)',
                                    lineHeight: 1,
                                    marginTop: '2px',
                                    textAlign: 'center',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    maxWidth: '100%'
                                }}>
                                    🌙 {incomingNightShift.endTime}
                                </div>
                            ) : isToday ? (
                                <div style={{
                                    fontSize: '9px',
                                    fontWeight: 800,
                                    color: 'var(--c-primary)',
                                    lineHeight: 1,
                                    letterSpacing: '0.2px'
                                }}>
                                    Heute
                                </div>
                            ) : (
                                <div style={{
                                    width: '4px',
                                    height: '4px',
                                    borderRadius: '50%',
                                    background: 'var(--c-surface)',
                                    marginBottom: '2px'
                                }} />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Selected Day Inspector */}
            {selectedDayInfo && (
                <div style={{
                    marginTop: '12px',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    background: selectedDayInfo.shifts.length > 0
                        ? 'var(--c-surface)'
                        : (selectedDayInfo.incomingNightShift ? 'rgb(var(--rgb-violet-deep) / 0.25)' : 'rgb(var(--rgb-bg) / 0.6)'),
                    border: selectedDayInfo.shifts.length > 0
                        ? '1px solid var(--c-surface-3)'
                        : (selectedDayInfo.incomingNightShift ? '1px solid rgb(var(--rgb-violet) / 0.4)' : '1px dashed var(--c-surface-3)')
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: (selectedDayInfo.shifts.length > 0 || selectedDayInfo.incomingNightShift) ? '8px' : 0 }}>
                        <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--c-text)' }}>
                            📅 {selectedDayInfo.dateFormatted}{selectedDayInfo.dateStr === todayStr ? ' (Heute)' : ''}
                        </span>
                        <button
                            type="button"
                            onClick={() => setSelectedDateStr(null)}
                            style={{ background: 'none', border: 'none', color: 'var(--c-text-subtle)', cursor: 'pointer', padding: '2px 6px', fontSize: '14px' }}
                            title="Schließen"
                        >
                            ✕
                        </button>
                    </div>

                    {selectedDayInfo.incomingNightShift && selectedDayInfo.shifts.length > 0 && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            background: 'rgb(var(--rgb-violet) / 0.12)',
                            border: '1px solid rgb(var(--rgb-violet) / 0.3)',
                            borderRadius: '6px',
                            padding: '4px 8px',
                            marginBottom: '10px',
                            fontSize: '12px',
                            color: 'var(--c-violet)'
                        }}>
                            <span style={{ fontWeight: 800 }}>🌙 {selectedDayInfo.incomingNightShift.code}</span>
                            <span>{((selectedDayInfo.incomingNightShift.shiftTypeName || '').toLowerCase().includes('spät') || (selectedDayInfo.incomingNightShift.code || '').startsWith('RT')) ? 'Spätschicht-Ende' : 'Nachtschicht-Ende'} um {selectedDayInfo.incomingNightShift.endTime} Uhr{selectedDayInfo.incomingNightShift.isOvertime ? ' (inkl. Überstunde)' : ''} (aus Vortag)</span>
                        </div>
                    )}

                    {selectedDayInfo.shifts.length === 0 ? (
                        selectedDayInfo.incomingNightShift ? (() => {
                            const isIncSpät = (selectedDayInfo.incomingNightShift.shiftTypeName || '').toLowerCase().includes('spät') || (selectedDayInfo.incomingNightShift.code || '').startsWith('RT');
                            const folgetagTitle = isIncSpät ? 'Spätschicht-Folgetag' : 'Nachtschicht-Folgetag';
                            const shiftWord = isIncSpät ? 'Spätschicht' : 'Nachtschicht';

                            return (
                                <div style={{ fontSize: '12.5px', color: 'var(--c-text-soft)', paddingTop: '2px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                                        <span style={{
                                            background: 'rgb(var(--rgb-violet) / 0.25)',
                                            color: 'var(--c-violet)',
                                            border: '1px solid rgb(var(--rgb-violet) / 0.45)',
                                            padding: '2px 8px',
                                            borderRadius: '5px',
                                            fontSize: '12px',
                                            fontWeight: 800
                                        }}>
                                            🌙 {selectedDayInfo.incomingNightShift.code}
                                        </span>
                                        <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--c-text)' }}>
                                            {folgetagTitle}
                                        </span>
                                        <span style={{ fontSize: '12px', color: 'var(--c-text-soft)' }}>
                                            🕒 Dienstende um {selectedDayInfo.incomingNightShift.endTime} Uhr{selectedDayInfo.incomingNightShift.isOvertime ? ' (inkl. Überstunde)' : ''}
                                        </span>
                                        {selectedDayInfo.incomingNightShift.station && (
                                            <span style={{
                                                background: 'rgb(var(--rgb-bg) / 0.8)',
                                                color: 'var(--c-text-muted)',
                                                border: '1px solid var(--c-surface-3)',
                                                padding: '1px 6px',
                                                borderRadius: '4px',
                                                fontSize: '11px',
                                                fontWeight: 600
                                            }}>
                                                📍 {selectedDayInfo.incomingNightShift.station}
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'var(--c-text-muted)', fontStyle: 'italic' }}>
                                        🛌 Dienstende der {shiftWord} vom Vortag um {selectedDayInfo.incomingNightShift.endTime} Uhr{selectedDayInfo.incomingNightShift.isOvertime ? ' (inkl. Überstunde)' : ''} – danach frei
                                    </div>
                                </div>
                            );
                        })() : (
                            <div style={{ fontSize: '12.5px', color: 'var(--c-text-muted)', fontStyle: 'italic', paddingTop: '4px' }}>
                                🌴 Dienstfrei – kein Einsatz an diesem Tag
                            </div>
                        )
                    ) : (
                        selectedDayInfo.shifts.map((s, idx) => {
                            const dur = calcDuration(s.startTime, s.endTime);
                            const resolvedShift = resolveShiftDetails(s, storeSettings);
                            const shiftCol = resolvedShift.colorInfo;
                            const bAmt = getShiftBonusAmount(s, storeSettings);
                            return (
                                <div key={s.id || idx} style={{ marginTop: idx > 0 ? '10px' : 0, borderTop: idx > 0 ? '1px solid var(--c-surface-3)' : 'none', paddingTop: idx > 0 ? '8px' : 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <span style={{
                                            background: shiftCol.bg,
                                            color: shiftCol.color,
                                            border: `1px solid ${shiftCol.border}`,
                                            padding: '2px 7px',
                                            borderRadius: '5px',
                                            fontSize: '12px',
                                            fontWeight: 800
                                        }}>
                                            {resolvedShift.code}
                                        </span>
                                        <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--c-text)' }}>
                                            {resolvedShift.typeName}
                                        </span>
                                        <span style={{ fontSize: '12px', color: 'var(--c-text-muted)' }}>
                                            🕒 {s.startTime} – {s.endTime} Uhr {dur ? `(${dur} Std)` : ''}
                                        </span>
                                        <span style={{
                                            background: shiftCol.stationBg,
                                            color: shiftCol.stationColor,
                                            border: `1px solid ${shiftCol.stationBorder}`,
                                            padding: '1px 6px',
                                            borderRadius: '4px',
                                            fontSize: '11px',
                                            fontWeight: 700
                                        }}>
                                            📍 {resolvedShift.station}
                                        </span>
                                        {bAmt > 0 && (
                                            <span style={{
                                                background: 'rgb(var(--rgb-warning) / 0.15)',
                                                color: 'var(--c-warning)',
                                                border: '1px solid rgb(var(--rgb-warning) / 0.4)',
                                                padding: '1px 6px',
                                                borderRadius: '4px',
                                                fontSize: '11px',
                                                fontWeight: 800
                                            }}>
                                                💰 +{bAmt} € Bonus
                                            </span>
                                        )}
                                    </div>
                                    {s.vehicle && (
                                        <div style={{ fontSize: '12px', color: 'var(--c-text-muted)', marginTop: '4px' }}>
                                            🚑 {s.vehicle}
                                        </div>
                                    )}
                                    {s.partner && (
                                        <div style={{ fontSize: '12px', color: 'var(--c-info)', marginTop: '3px', fontWeight: 500 }}>
                                            👤 {s.partner}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* Legend: Wachen Farbstruktur */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '14px',
                flexWrap: 'wrap',
                marginTop: '14px',
                paddingTop: '10px',
                borderTop: '1px solid rgb(var(--rgb-overlay) / 0.05)',
                fontSize: '11px',
                color: 'var(--c-text-muted)'
            }}>
                <span style={{ fontWeight: 700, color: 'var(--c-text-subtle)' }}>Wachen:</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: STATION_THEMES.Sendling.primaryHex }} />
                    <span>Sendling (Blau)</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: STATION_THEMES.Hohenbrunn.primaryHex }} />
                    <span>Hohenbrunn (Grün)</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: STATION_THEMES.Obersendling.primaryHex }} />
                    <span>Obersendling (Bernstein)</span>
                </span>

                <span style={{ fontWeight: 700, color: 'var(--c-text-subtle)', marginLeft: '6px' }}>Schichten:</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#06b6d4' }} />
                    <span>Früh (Cyan)</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#f97316' }} />
                    <span>Spät (Orange)</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#a855f7' }} />
                    <span>Nacht (Lila)</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#3b82f6' }} />
                    <span>Tag (Blau)</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#c084fc' }} />
                    <span>Nacht-Ende</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: 'var(--c-text-subtle)' }} />
                    <span>Dienstfrei</span>
                </span>
            </div>
        </div>
    );
}

export default function Analysis() {
    const { store, toggleShiftBonus } = useStore();
    // Use the decoupled logic hook
    const logic = useAnalysisLogic();
    const {
        loading, label, target, weeklyRate,
        filterMode, setFilterMode, baseDate, setBaseDate,
        customStart, setCustomStart, customEnd, setCustomEnd,
        selectedTypes, setSelectedTypes,
        selectedVehicles, setSelectedVehicles,
        selectedStations, setSelectedStations,
        onlyBonus, setOnlyBonus,
        stats, bonusOverview, delta, isInvalid, filteredData
    } = logic;

    const isPositive = delta >= 0;
    const colorClass = isPositive ? 'var(--color-success)' : 'var(--color-danger)';

    const isCurrentMonth = useMemo(() => {
        const now = new Date();
        return baseDate.getFullYear() === now.getFullYear() && baseDate.getMonth() === now.getMonth();
    }, [baseDate]);

    const isCurrentYear = useMemo(() => {
        const now = new Date();
        return baseDate.getFullYear() === now.getFullYear();
    }, [baseDate]);

    const stationDistribution = useMemo(() => {
        const counts = { Sendling: 0, Hohenbrunn: 0, Obersendling: 0 };
        const hours = { Sendling: 0, Hohenbrunn: 0, Obersendling: 0 };
        (filteredData || []).forEach(s => {
            const st = detectStation(s);
            const dur = parseFloat(calcDuration(s.startTime, s.endTime)) || 0;
            counts[st] = (counts[st] || 0) + 1;
            hours[st] = (hours[st] || 0) + dur;
        });
        return Object.entries(counts)
            .filter(([_, count]) => count > 0)
            .map(([st, count]) => ({
                station: st,
                count,
                hours: hours[st],
                theme: STATION_THEMES[st] || STATION_THEMES.Sendling
            }))
            .sort((a, b) => b.count - a.count);
    }, [filteredData]);

    const handleExportPDF = () => {
        exportToPDF({
            label,
            stats,
            delta,
            target,
            filteredData,
            filterMode,
            baseDate,
            storeSettings: store.settings,
            shiftTypes: store.settings?.shiftTypes || [],
            shiftCodes: store.settings?.shiftCodes || [],
            allShifts: store.shifts || []
        });
    };

    const [showFilterModal, setShowFilterModal] = useState(false);
    const [showBonusModal, setShowBonusModal] = useState(false);

    if (loading) return <div className="page-content center">Lade Daten...</div>;

    const hasActiveFilters = selectedTypes.length > 0 || selectedVehicles.length > 0 || selectedStations.length > 0 || onlyBonus;
    const activeFilterCount = selectedTypes.length + selectedVehicles.length + selectedStations.length + (onlyBonus ? 1 : 0);

    return (
        <div className="page-content">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                        Auswertung
                    </h1>
                </div>
            </div>

            {/* Compact Period & Filter Command Bar */}
            <div className="card-premium" style={{ padding: '8px 12px', marginBottom: '16px', overflowX: 'auto' }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '8px',
                    flexWrap: 'nowrap',
                    minWidth: 'fit-content'
                }}>
                    
                    {/* Segmented Mode Selector: Monat | Jahr | Zeitraum */}
                    <div style={{
                        display: 'inline-flex',
                        background: 'var(--c-bg)',
                        padding: '3px',
                        borderRadius: '9px',
                        border: '1px solid var(--c-surface-3)',
                        flexShrink: 0
                    }}>
                        {[
                            { id: 'month', label: 'Monat' },
                            { id: 'year', label: 'Jahr' },
                            { id: 'custom', label: 'Zeitraum' }
                        ].map(m => (
                            <button
                                key={m.id}
                                type="button"
                                onClick={() => setFilterMode(m.id)}
                                style={{
                                    padding: '5px 10px',
                                    borderRadius: '7px',
                                    border: 'none',
                                    background: filterMode === m.id ? 'var(--color-primary)' : 'transparent',
                                    color: filterMode === m.id ? '#ffffff' : 'var(--c-text-muted)',
                                    fontWeight: filterMode === m.id ? 700 : 500,
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>

                    {/* Right Side: Period Navigation + Filter PopUp Trigger */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap', marginLeft: 'auto', flexShrink: 0 }}>
                        {filterMode === 'month' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                                <button
                                    type="button"
                                    onClick={() => setBaseDate(addMonths(baseDate, -1))}
                                    style={{
                                        background: 'var(--c-bg)',
                                        border: '1px solid var(--c-surface-3)',
                                        color: 'var(--c-text-soft)',
                                        borderRadius: '7px',
                                        padding: '5px 7px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center'
                                    }}
                                    title="Vorheriger Monat"
                                >
                                    <ChevronLeft size={15} />
                                </button>

                                <div style={{
                                    fontWeight: 700,
                                    fontSize: '13.5px',
                                    color: 'var(--c-text)',
                                    padding: '0 4px',
                                    whiteSpace: 'nowrap',
                                    textAlign: 'center'
                                }}>
                                    {baseDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setBaseDate(addMonths(baseDate, 1))}
                                    style={{
                                        background: 'var(--c-bg)',
                                        border: '1px solid var(--c-surface-3)',
                                        color: 'var(--c-text-soft)',
                                        borderRadius: '7px',
                                        padding: '5px 7px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center'
                                    }}
                                    title="Nächster Monat"
                                >
                                    <ChevronRight size={15} />
                                </button>

                                {!isCurrentMonth && (
                                    <button
                                        type="button"
                                        onClick={() => setBaseDate(new Date())}
                                        style={{
                                            background: 'rgb(var(--rgb-primary) / 0.12)',
                                            border: '1px solid rgb(var(--rgb-primary) / 0.3)',
                                            color: 'var(--c-primary)',
                                            borderRadius: '7px',
                                            padding: '4px 7px',
                                            fontSize: '11px',
                                            fontWeight: 700,
                                            whiteSpace: 'nowrap',
                                            cursor: 'pointer'
                                        }}
                                        title="Zum aktuellen Monat springen"
                                    >
                                        Heute
                                    </button>
                                )}
                            </div>
                        )}

                        {filterMode === 'year' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                                <button
                                    type="button"
                                    onClick={() => setBaseDate(addMonths(baseDate, -12))}
                                    style={{
                                        background: 'var(--c-bg)',
                                        border: '1px solid var(--c-surface-3)',
                                        color: 'var(--c-text-soft)',
                                        borderRadius: '7px',
                                        padding: '5px 7px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center'
                                    }}
                                    title="Vorheriges Jahr"
                                >
                                    <ChevronLeft size={15} />
                                </button>

                                <div style={{
                                    fontWeight: 700,
                                    fontSize: '14px',
                                    color: 'var(--c-text)',
                                    padding: '0 4px',
                                    whiteSpace: 'nowrap',
                                    textAlign: 'center'
                                }}>
                                    {baseDate.getFullYear()}
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setBaseDate(addMonths(baseDate, 12))}
                                    style={{
                                        background: 'var(--c-bg)',
                                        border: '1px solid var(--c-surface-3)',
                                        color: 'var(--c-text-soft)',
                                        borderRadius: '7px',
                                        padding: '5px 7px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center'
                                    }}
                                    title="Nächstes Jahr"
                                >
                                    <ChevronRight size={15} />
                                </button>

                                {!isCurrentYear && (
                                    <button
                                        type="button"
                                        onClick={() => setBaseDate(new Date())}
                                        style={{
                                            background: 'rgb(var(--rgb-primary) / 0.12)',
                                            border: '1px solid rgb(var(--rgb-primary) / 0.3)',
                                            color: 'var(--c-primary)',
                                            borderRadius: '7px',
                                            padding: '4px 7px',
                                            fontSize: '11px',
                                            fontWeight: 700,
                                            whiteSpace: 'nowrap',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Dieses Jahr
                                    </button>
                                )}
                            </div>
                        )}

                        {filterMode === 'custom' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <input
                                    type="date"
                                    value={customStart}
                                    onChange={(e) => setCustomStart(e.target.value)}
                                    style={{
                                        background: 'var(--c-bg)',
                                        border: '1px solid var(--c-surface-3)',
                                        color: 'var(--c-text)',
                                        borderRadius: '8px',
                                        padding: '6px 8px',
                                        fontSize: '12px'
                                    }}
                                />
                                <span style={{ color: 'var(--c-text-subtle)', fontSize: '12px' }}>bis</span>
                                <input
                                    type="date"
                                    value={customEnd}
                                    onChange={(e) => setCustomEnd(e.target.value)}
                                    style={{
                                        background: 'var(--c-bg)',
                                        border: '1px solid var(--c-surface-3)',
                                        color: 'var(--c-text)',
                                        borderRadius: '8px',
                                        padding: '6px 8px',
                                        fontSize: '12px'
                                    }}
                                />
                            </div>
                        )}

                        {/* Filter PopUp Trigger Button */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                            <button
                                type="button"
                                onClick={() => setShowFilterModal(true)}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    background: hasActiveFilters ? 'rgb(var(--rgb-primary) / 0.15)' : 'var(--c-bg)',
                                    border: hasActiveFilters ? '1px solid rgb(var(--rgb-primary) / 0.45)' : '1px solid var(--c-surface-3)',
                                    color: hasActiveFilters ? 'var(--c-primary)' : 'var(--c-text-soft)',
                                    borderRadius: '7px',
                                    padding: '5px 8px',
                                    fontSize: '12px',
                                    fontWeight: hasActiveFilters ? 700 : 600,
                                    whiteSpace: 'nowrap',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                                title="Schichten, Wachen & Fahrzeuge filtern"
                            >
                                <SlidersHorizontal size={13} />
                                <span>Filter{hasActiveFilters ? ` (${activeFilterCount})` : ''}</span>
                            </button>
                            {hasActiveFilters && (
                                <button
                                    type="button"
                                    onClick={() => { setSelectedTypes([]); setSelectedVehicles([]); setSelectedStations([]); setOnlyBonus(false); }}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        background: 'rgb(var(--rgb-danger) / 0.12)',
                                        border: '1px solid rgb(var(--rgb-danger) / 0.3)',
                                        color: 'var(--c-danger)',
                                        borderRadius: '8px',
                                        padding: '6px 7px',
                                        cursor: 'pointer'
                                    }}
                                    title="Alle Filter zurücksetzen"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Kalender / Schicht-Rhythmus direkt über den statistischen Werten */}
            <div className="card-premium">
                <ShiftRhythmCalendar
                    baseDate={baseDate}
                    filterMode={filterMode}
                    filteredData={filteredData}
                    allShifts={store.shifts}
                    storeSettings={store.settings}
                />
            </div>

            {/* KPI Cards Grid (Row 1: Geleistet | Schichten | Bonus, Row 2: Saldo | Dienstplan PDF) */}
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                <div className="stat-card" style={{ padding: '14px 12px' }}>
                    <span className="text-label">Geleistet</span>
                    <span className="text-value" style={{ fontSize: '22px' }}>{stats.actual.toFixed(1)} h</span>
                </div>
                <div className="stat-card" style={{ padding: '14px 12px' }}>
                    <span className="text-label">Schichten</span>
                    <span className="text-value" style={{ fontSize: '22px' }}>{stats.count}</span>
                </div>
                <div
                    className="stat-card"
                    onClick={() => setShowBonusModal(true)}
                    style={{
                        padding: '14px 12px',
                        cursor: 'pointer',
                        border: stats.bonusCount > 0 || onlyBonus ? '1px solid rgb(var(--rgb-warning) / 0.45)' : undefined,
                        background: onlyBonus ? 'rgb(var(--rgb-warning) / 0.12)' : undefined,
                        position: 'relative',
                        transition: 'all 0.15s ease'
                    }}
                    title="Klicken für detaillierte Bonus-Auswertung"
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '4px' }}>
                        <span className="text-label" style={{ color: stats.bonusCount > 0 ? 'var(--c-warning)' : undefined, marginBottom: '4px' }}>
                            💰 Bonus ({stats.bonusCount}x)
                        </span>
                        <span style={{
                            fontSize: '10px',
                            color: 'var(--c-warning)',
                            background: 'rgb(var(--rgb-warning) / 0.14)',
                            padding: '1px 5px',
                            borderRadius: '4px',
                            fontWeight: 700
                        }}>
                            Details ↗
                        </span>
                    </div>
                    <span className="text-value" style={{ fontSize: '22px', color: stats.bonusCount > 0 ? 'var(--c-warning)' : 'var(--c-text-subtle)' }}>
                        {stats.bonusTotalAmount.toFixed(0)} €
                    </span>
                </div>

                {/* Row 2 Left (span 2): Saldo */}
                <div className="stat-card" style={{ gridColumn: 'span 2', borderLeft: `4px solid ${colorClass}`, padding: '14px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <span className="text-label">Saldo (Soll: {target.toFixed(1)}h{filterMode === 'month' ? ` • ${weeklyRate}h/Woche` : ''})</span>
                        <div className="text-value" style={{ fontSize: '22px', color: colorClass }}>
                            {delta > 0 ? '+' : ''}{delta.toFixed(1)} h
                        </div>
                    </div>
                    <div style={{ fontSize: '22px' }}>{isPositive ? "📈" : "📉"}</div>
                </div>

                {/* Row 2 Right (span 1): Dienstplan PDF Button Card */}
                <button
                    type="button"
                    onClick={handleExportPDF}
                    className="stat-card"
                    style={{
                        gridColumn: 'span 1',
                        padding: '12px 10px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        background: 'rgb(var(--rgb-info) / 0.1)',
                        border: '1px solid rgb(var(--rgb-info) / 0.35)',
                        color: 'var(--c-info)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        textAlign: 'center'
                    }}
                    title="Monatsdienstplan als PDF exportieren"
                >
                    <span style={{ fontSize: '22px', lineHeight: 1 }}>📄</span>
                    <span style={{ fontSize: '12.5px', fontWeight: 700, lineHeight: 1.2 }}>
                        Dienstplan PDF
                    </span>
                </button>
            </div>

            {/* PopUp Modal 1: Schichtfilter */}
            {showFilterModal && (
                <div
                    onClick={() => setShowFilterModal(false)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 2500,
                        background: 'rgb(var(--rgb-deep) / 0.78)',
                        backdropFilter: 'blur(6px)',
                        WebkitBackdropFilter: 'blur(6px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '16px',
                        animation: 'fadeIn 0.18s ease-out'
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: '100%',
                            maxWidth: '480px',
                            maxHeight: '85vh',
                            overflowY: 'auto',
                            background: 'var(--c-bg)',
                            border: '1px solid var(--c-surface-3)',
                            borderRadius: '18px',
                            padding: '18px',
                            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', paddingBottom: '10px', borderBottom: '1px solid var(--c-surface)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <SlidersHorizontal size={17} style={{ color: 'var(--c-primary)' }} />
                                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--c-text)' }}>
                                    Schichtfilter
                                </h3>
                                {hasActiveFilters && (
                                    <span style={{
                                        fontSize: '11px',
                                        background: 'rgb(var(--rgb-primary) / 0.15)',
                                        color: 'var(--c-primary)',
                                        padding: '2px 7px',
                                        borderRadius: '10px',
                                        fontWeight: 700
                                    }}>
                                        {activeFilterCount} aktiv
                                    </span>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowFilterModal(false)}
                                style={{
                                    background: 'var(--c-surface)',
                                    border: '1px solid var(--c-surface-3)',
                                    color: 'var(--c-text-muted)',
                                    borderRadius: '8px',
                                    padding: '4px 8px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center'
                                }}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Section 1: Schnellauswahl */}
                        <div style={{ marginBottom: '14px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--c-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                                Auswahl
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <button
                                    type="button"
                                    onClick={() => { setSelectedTypes([]); setSelectedVehicles([]); setSelectedStations([]); setOnlyBonus(false); }}
                                    style={{
                                        padding: '6px 12px',
                                        borderRadius: '20px',
                                        fontSize: '12.5px',
                                        fontWeight: !hasActiveFilters ? 700 : 500,
                                        background: !hasActiveFilters ? 'var(--c-surface-3)' : 'var(--c-surface)',
                                        border: !hasActiveFilters ? '1px solid var(--c-text-subtle)' : '1px solid var(--c-surface-3)',
                                        color: !hasActiveFilters ? 'var(--c-text)' : 'var(--c-text-muted)',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Alle Schichten {!hasActiveFilters && '✓'}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setOnlyBonus(!onlyBonus)}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '5px',
                                        padding: '6px 12px',
                                        borderRadius: '20px',
                                        fontSize: '12.5px',
                                        fontWeight: onlyBonus ? 800 : 600,
                                        background: onlyBonus ? 'rgb(var(--rgb-warning) / 0.18)' : 'var(--c-surface)',
                                        border: onlyBonus ? '1px solid var(--c-warning)' : '1px solid var(--c-surface-3)',
                                        color: onlyBonus ? 'var(--c-warning)' : 'var(--c-text-muted)',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <span>💰</span>
                                    <span>Nur Bonus</span>
                                    {onlyBonus && <span>✓</span>}
                                </button>
                            </div>
                        </div>

                        {/* Section 2: Wachen */}
                        <div style={{ marginBottom: '14px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--c-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                                Wachen
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {['Sendling', 'Hohenbrunn', 'Obersendling'].map(stName => {
                                    const theme = STATION_THEMES[stName];
                                    const active = selectedStations.includes(stName);
                                    return (
                                        <button
                                            key={stName}
                                            type="button"
                                            onClick={() => setSelectedStations(active ? selectedStations.filter(x => x !== stName) : [...selectedStations, stName])}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                padding: '6px 12px',
                                                borderRadius: '20px',
                                                fontSize: '12.5px',
                                                fontWeight: active ? 700 : 500,
                                                background: active ? theme.badgeBg : 'var(--c-surface)',
                                                border: active ? `1px solid ${theme.primaryHex}` : '1px solid var(--c-surface-3)',
                                                color: active ? theme.primaryHex : 'var(--c-text-soft)',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: theme.primaryHex }} />
                                            <span>{stName}</span>
                                            {active && <span>✓</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Section 3: Schichtarten */}
                        <div style={{ marginBottom: '14px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--c-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                                Schichtarten
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {(store.settings?.shiftTypes || []).map(t => {
                                    const active = selectedTypes.includes(t.id);
                                    const shiftCol = getShiftColor(t.name, '');
                                    return (
                                        <button
                                            key={t.id}
                                            type="button"
                                            onClick={() => setSelectedTypes(active ? selectedTypes.filter(x => x !== t.id) : [...selectedTypes, t.id])}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                padding: '6px 12px',
                                                borderRadius: '20px',
                                                fontSize: '12.5px',
                                                fontWeight: active ? 700 : 500,
                                                background: active ? shiftCol.bg : 'var(--c-surface)',
                                                border: active ? `1px solid ${shiftCol.border}` : '1px solid var(--c-surface-3)',
                                                color: active ? shiftCol.color : 'var(--c-text-soft)',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: shiftCol.color }} />
                                            <span>{t.name}</span>
                                            {active && <span>✓</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Section 4: Fahrzeuge */}
                        {(store.settings?.vehicles || []).length > 0 && (
                            <div style={{ marginBottom: '16px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--c-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                                    Fahrzeuge
                                </div>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {(store.settings?.vehicles || []).map(v => {
                                        const active = selectedVehicles.includes(v);
                                        return (
                                            <button
                                                key={v}
                                                type="button"
                                                onClick={() => setSelectedVehicles(active ? selectedVehicles.filter(x => x !== v) : [...selectedVehicles, v])}
                                                style={{
                                                    padding: '6px 11px',
                                                    borderRadius: '16px',
                                                    fontSize: '12px',
                                                    fontWeight: active ? 700 : 500,
                                                    background: active ? 'rgb(var(--rgb-success) / 0.15)' : 'var(--c-surface)',
                                                    border: active ? '1px solid var(--c-success)' : '1px solid var(--c-surface-3)',
                                                    color: active ? 'var(--c-success)' : 'var(--c-text-muted)',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {v} {active && '✓'}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Modal Footer */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', paddingTop: '12px', borderTop: '1px solid var(--c-surface)' }}>
                            {hasActiveFilters ? (
                                <button
                                    type="button"
                                    onClick={() => { setSelectedTypes([]); setSelectedVehicles([]); setSelectedStations([]); setOnlyBonus(false); }}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '5px',
                                        background: 'rgb(var(--rgb-danger) / 0.12)',
                                        border: '1px solid rgb(var(--rgb-danger) / 0.3)',
                                        color: 'var(--c-danger)',
                                        padding: '8px 12px',
                                        borderRadius: '10px',
                                        fontSize: '12.5px',
                                        fontWeight: 600,
                                        cursor: 'pointer'
                                    }}
                                >
                                    <X size={14} />
                                    <span>Filter zurücksetzen</span>
                                </button>
                            ) : <div />}

                            <button
                                type="button"
                                onClick={() => setShowFilterModal(false)}
                                style={{
                                    background: 'var(--color-primary)',
                                    border: 'none',
                                    color: '#ffffff',
                                    padding: '8px 18px',
                                    borderRadius: '10px',
                                    fontSize: '13px',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                }}
                            >
                                Fertig ({filteredData.length} {filteredData.length === 1 ? 'Dienst' : 'Dienste'})
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* PopUp Modal 2: 💰 Bonus-Auswertung */}
            {showBonusModal && (
                <div
                    onClick={() => setShowBonusModal(false)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 2500,
                        background: 'rgb(var(--rgb-deep) / 0.78)',
                        backdropFilter: 'blur(6px)',
                        WebkitBackdropFilter: 'blur(6px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '16px',
                        animation: 'fadeIn 0.18s ease-out'
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: '100%',
                            maxWidth: '540px',
                            maxHeight: '85vh',
                            overflowY: 'auto',
                            background: 'var(--c-bg)',
                            border: '1px solid rgb(var(--rgb-warning) / 0.4)',
                            borderRadius: '18px',
                            padding: '18px',
                            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.65)'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '14px', paddingBottom: '10px', borderBottom: '1px solid var(--c-surface)' }}>
                            <h3 className="text-label" style={{ margin: 0, color: 'var(--c-warning)', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span>💰 Bonus-Auswertung</span>
                                <span style={{
                                    fontSize: '11px',
                                    background: 'rgb(var(--rgb-warning) / 0.15)',
                                    color: 'var(--c-warning)',
                                    padding: '2px 7px',
                                    borderRadius: '6px',
                                    fontWeight: 700,
                                    textTransform: 'none'
                                }}>
                                    Standard: {store.settings?.defaultBonusAmount ?? 75} €
                                </span>
                            </h3>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <button
                                    type="button"
                                    onClick={() => setOnlyBonus(!onlyBonus)}
                                    style={{
                                        background: onlyBonus ? 'var(--c-warning)' : 'rgb(var(--rgb-warning) / 0.12)',
                                        color: onlyBonus ? 'var(--c-bg)' : 'var(--c-warning)',
                                        border: '1px solid rgb(var(--rgb-warning) / 0.4)',
                                        borderRadius: '8px',
                                        padding: '5px 10px',
                                        fontSize: '11.5px',
                                        fontWeight: 700,
                                        cursor: 'pointer'
                                    }}
                                >
                                    {onlyBonus ? '✓ Filter: Nur Bonus aktiv' : '🔍 Nur Bonus-Schichten filtern'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowBonusModal(false)}
                                    style={{
                                        background: 'var(--c-surface)',
                                        border: '1px solid var(--c-surface-3)',
                                        color: 'var(--c-text-muted)',
                                        borderRadius: '8px',
                                        padding: '5px 8px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center'
                                    }}
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Top Summary Boxes: Zeitraum | Jahr | Gesamt */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '8px', marginBottom: '14px' }}>
                            {/* Box 1: Gewählter Zeitraum */}
                            <div style={{
                                background: 'var(--c-surface)',
                                border: '1px solid rgb(var(--rgb-warning) / 0.3)',
                                borderRadius: '8px',
                                padding: '10px 12px'
                            }}>
                                <div style={{ fontSize: '11px', color: 'var(--c-text-muted)', fontWeight: 600, marginBottom: '3px' }}>
                                    Gewählter Zeitraum ({label})
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                    <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--c-warning)' }}>
                                        {stats.bonusTotalAmount.toFixed(0)} €
                                    </span>
                                    <span style={{ fontSize: '12px', color: 'var(--c-text-soft)', fontWeight: 700 }}>
                                        {stats.bonusCount} {stats.bonusCount === 1 ? 'Schicht' : 'Schichten'}
                                    </span>
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--c-text-subtle)', marginTop: '3px' }}>
                                    {stats.bonusHours.toFixed(1)} Std. in Bonus-Schichten
                                </div>
                            </div>

                            {/* Box 2: Laufendes Jahr */}
                            <div style={{
                                background: 'var(--c-surface)',
                                border: '1px solid var(--c-surface-3)',
                                borderRadius: '8px',
                                padding: '10px 12px'
                            }}>
                                <div style={{ fontSize: '11px', color: 'var(--c-text-muted)', fontWeight: 600, marginBottom: '3px' }}>
                                    Jahressumme {bonusOverview.year}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                    <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--c-info)' }}>
                                        {bonusOverview.yearBonusAmount.toFixed(0)} €
                                    </span>
                                    <span style={{ fontSize: '12px', color: 'var(--c-text-soft)', fontWeight: 700 }}>
                                        {bonusOverview.yearBonusCount} {bonusOverview.yearBonusCount === 1 ? 'Schicht' : 'Schichten'}
                                    </span>
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--c-text-subtle)', marginTop: '3px' }}>
                                    {bonusOverview.yearBonusHours.toFixed(1)} Std. im Jahr {bonusOverview.year}
                                </div>
                            </div>

                            {/* Box 3: Alle Jahre / Gesamt */}
                            <div style={{
                                background: 'var(--c-surface)',
                                border: '1px solid var(--c-surface-3)',
                                borderRadius: '8px',
                                padding: '10px 12px'
                            }}>
                                <div style={{ fontSize: '11px', color: 'var(--c-text-muted)', fontWeight: 600, marginBottom: '3px' }}>
                                    Gesamt (Alle Jahre)
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                    <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--c-success)' }}>
                                        {bonusOverview.allTimeBonusAmount.toFixed(0)} €
                                    </span>
                                    <span style={{ fontSize: '12px', color: 'var(--c-text-soft)', fontWeight: 700 }}>
                                        {bonusOverview.allTimeBonusCount} {bonusOverview.allTimeBonusCount === 1 ? 'Schicht' : 'Schichten'}
                                    </span>
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--c-text-subtle)', marginTop: '3px' }}>
                                    {bonusOverview.byYear.length > 0
                                        ? bonusOverview.byYear.map(y => `${y.year}: ${y.amount.toFixed(0)}€ (${y.count}x)`).join(' • ')
                                        : 'Noch keine Bonus-Schichten markiert'}
                                </div>
                            </div>
                        </div>

                        {/* Monthly Breakdown Grid (Jan - Dez for selected Year) */}
                        <div style={{ marginBottom: (stats.bonusByStation.length > 0 || stats.bonusByCode.length > 0) ? '12px' : 0 }}>
                            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                                Monatsübersicht Bonus {bonusOverview.year}:
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(72px, 1fr))', gap: '6px' }}>
                                {bonusOverview.months.map((m) => {
                                    const isSelectedMonth = filterMode === 'month' && baseDate.getMonth() === m.monthIndex;
                                    const hasB = m.count > 0;
                                    return (
                                        <div
                                            key={m.key}
                                            onClick={() => {
                                                const newD = new Date(baseDate);
                                                newD.setDate(1);
                                                newD.setMonth(m.monthIndex);
                                                setBaseDate(newD);
                                                setFilterMode('month');
                                            }}
                                            style={{
                                                background: hasB ? 'rgb(var(--rgb-warning) / 0.1)' : 'var(--c-surface)',
                                                border: isSelectedMonth
                                                    ? '1.5px solid var(--c-info)'
                                                    : (hasB ? '1px solid rgb(var(--rgb-warning) / 0.4)' : '1px solid var(--c-surface-3)'),
                                                borderRadius: '7px',
                                                padding: '6px 6px',
                                                textAlign: 'center',
                                                cursor: 'pointer'
                                            }}
                                            title={`${m.monthName} ${bonusOverview.year}: ${m.count}x Bonus (${m.amount.toFixed(0)} €)`}
                                        >
                                            <div style={{ fontSize: '11px', fontWeight: 700, color: hasB ? 'var(--c-text)' : 'var(--c-text-subtle)' }}>
                                                {m.monthName}
                                            </div>
                                            <div style={{ fontSize: '12px', fontWeight: 800, color: hasB ? 'var(--c-warning)' : 'var(--c-border-strong)', marginTop: '2px' }}>
                                                {hasB ? `${m.amount.toFixed(0)} €` : '—'}
                                            </div>
                                            <div style={{ fontSize: '10px', color: hasB ? 'var(--c-warning)' : 'var(--c-border-strong)' }}>
                                                {hasB ? `${m.count}x` : '0x'}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Breakdown by Wache & Kürzel in current period */}
                        {(stats.bonusByStation.length > 0 || stats.bonusByCode.length > 0) && (
                            <div style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: '12px',
                                paddingTop: '10px',
                                borderTop: '1px solid rgb(var(--rgb-overlay) / 0.06)',
                                fontSize: '12px'
                            }}>
                                {stats.bonusByStation.length > 0 && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                        <span style={{ color: 'var(--c-text-muted)', fontWeight: 600 }}>Nach Wache ({label}):</span>
                                        {stats.bonusByStation.map(bs => {
                                            const th = STATION_THEMES[bs.station] || STATION_THEMES.Sendling;
                                            return (
                                                <span key={bs.station} style={{
                                                    background: th.badgeBg,
                                                    color: th.primaryHex,
                                                    border: `1px solid ${th.badgeBorder}`,
                                                    padding: '2px 8px',
                                                    borderRadius: '6px',
                                                    fontSize: '11.5px',
                                                    fontWeight: 700
                                                }}>
                                                    {bs.station}: {bs.count}x ({bs.amount.toFixed(0)} €)
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
                                {stats.bonusByCode.length > 0 && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                        <span style={{ color: 'var(--c-text-muted)', fontWeight: 600 }}>Nach Kürzel:</span>
                                        {stats.bonusByCode.map(bc => (
                                            <span key={bc.code} style={{
                                                background: 'var(--c-surface)',
                                                color: 'var(--c-warning)',
                                                border: '1px solid rgb(var(--rgb-warning) / 0.3)',
                                                padding: '2px 8px',
                                                borderRadius: '6px',
                                                fontSize: '11.5px',
                                                fontWeight: 700
                                            }}>
                                                {bc.code}: {bc.count}x ({bc.amount.toFixed(0)} €)
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Charts & Verteilung */}
            {stats.count === 0 ? (
                <div className="card-premium center" style={{ padding: '40px', color: 'var(--c-text-subtle)' }}>
                    <div style={{ fontSize: '40px', marginBottom: '10px' }}>📊</div>
                    Keine weiteren Daten für diesen Zeitraum vorhanden.
                </div>
            ) : (
                <>
                    <div className="card-premium">
                        <h3 className="text-label" style={{ margin: '0 0 12px 0' }}>🍰 Verteilung</h3>

                        {/* Wachen-Verteilung (Eigenständige Farbstruktur) */}
                        {stationDistribution.length > 0 && (
                            <div style={{ marginBottom: '16px' }}>
                                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '8px' }}>
                                    Einsätze nach Wachen:
                                </span>
                                {stationDistribution.map((st) => (
                                    <div key={st.station} style={{ marginBottom: '8px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', alignItems: 'center' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: st.theme.primaryHex }} />
                                                <span style={{ fontWeight: 600 }}>{st.theme.name}</span>
                                            </span>
                                            <span style={{ fontSize: '12px', color: 'var(--c-text-muted)' }}>
                                                <strong style={{ color: st.theme.primaryHex, fontSize: '13px', marginRight: '4px' }}>
                                                    {st.count} {st.count === 1 ? 'Schicht' : 'Schichten'}
                                                </strong>
                                                ({st.hours.toFixed(1)} h)
                                            </span>
                                        </div>
                                        <div style={{ height: '6px', background: 'var(--c-surface-3)', borderRadius: '3px', marginTop: '4px', overflow: 'hidden' }}>
                                            <div style={{
                                                width: `${(st.count / stats.count) * 100}%`,
                                                height: '100%',
                                                background: st.theme.primaryHex,
                                                borderRadius: '3px'
                                            }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Schichtarten-Verteilung */}
                        <div>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '8px' }}>
                                Schichtarten:
                            </span>
                            {stats.distributionData.map((d, i) => {
                                const shiftCol = getShiftColor(d.name, '');
                                return (
                                    <div key={i} style={{ marginBottom: '10px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', alignItems: 'center' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: shiftCol.color }} />
                                                <span>{d.name}</span>
                                            </span>
                                            <strong style={{ color: shiftCol.color }}>{d.value}</strong>
                                        </div>
                                        <div style={{ height: '6px', background: 'var(--c-surface-3)', borderRadius: '3px', marginTop: '4px', overflow: 'hidden' }}>
                                            <div style={{
                                                width: `${(d.value / stats.count) * 100}%`,
                                                height: '100%',
                                                background: shiftCol.color,
                                                borderRadius: '3px'
                                            }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="card-premium">
                        <h3 className="text-label" style={{ margin: '0 0 12px 0' }}>📋 Schichten im Detail ({filteredData.length})</h3>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(235px, 1fr))',
                            gap: '10px',
                            alignItems: 'stretch'
                        }}>
                            {[...filteredData].sort((a, b) => a.date.localeCompare(b.date)).map((s, index) => {
                                const resolvedShift = resolveShiftDetails(s, store.settings);
                                const d = new Date(s.date);
                                const dateFormatted = d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
                                const bAmt = getShiftBonusAmount(s, store.settings);
                                return (
                                    <div
                                        key={s.id}
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'space-between',
                                            padding: '10px 12px',
                                            background: 'var(--c-surface)',
                                            border: bAmt > 0 ? '1px solid rgb(var(--rgb-warning) / 0.4)' : `1px solid ${resolvedShift.colorInfo.border}44`,
                                            borderLeft: `3px solid ${resolvedShift.colorInfo.color}`,
                                            borderRadius: '10px',
                                            fontSize: '12.5px',
                                            gap: '8px'
                                        }}
                                    >
                                        {/* Top Row: #Index, Date, Shift Code, Time + Bonus button */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', minWidth: 0 }}>
                                                <span style={{ color: 'var(--c-text-subtle)', fontSize: '10.5px', fontWeight: 700 }}>#{index + 1}</span>
                                                <span style={{ color: 'var(--color-primary)', fontWeight: 800, fontSize: '13px' }}>{dateFormatted}</span>
                                                <span style={{
                                                    background: resolvedShift.colorInfo.bg,
                                                    color: resolvedShift.colorInfo.color,
                                                    border: `1px solid ${resolvedShift.colorInfo.border}`,
                                                    padding: '1px 6px',
                                                    borderRadius: '5px',
                                                    fontSize: '11px',
                                                    fontWeight: 800
                                                }}>
                                                    {resolvedShift.code || resolvedShift.typeName}
                                                </span>
                                                <span style={{
                                                    color: 'var(--c-text-soft)',
                                                    fontSize: '11px',
                                                    background: 'var(--c-bg)',
                                                    padding: '1px 5px',
                                                    borderRadius: '4px',
                                                    fontWeight: 600,
                                                    whiteSpace: 'nowrap'
                                                }}>
                                                    {s.startTime}–{s.endTime}
                                                </span>
                                            </div>

                                            {/* Quick Bonus Checkbox Button */}
                                            <button
                                                type="button"
                                                onClick={() => toggleShiftBonus(s)}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '3px',
                                                    padding: '3px 7px',
                                                    borderRadius: '5px',
                                                    fontSize: '10.5px',
                                                    fontWeight: 700,
                                                    cursor: 'pointer',
                                                    background: s.hasBonus ? 'rgb(var(--rgb-warning) / 0.18)' : 'rgb(var(--rgb-bg) / 0.6)',
                                                    color: s.hasBonus ? 'var(--c-warning)' : 'var(--c-text-subtle)',
                                                    border: s.hasBonus ? '1px solid rgb(var(--rgb-warning) / 0.5)' : '1px solid var(--c-surface-3)',
                                                    transition: 'all 0.15s ease',
                                                    flexShrink: 0
                                                }}
                                                title={s.hasBonus ? `Bonus (${bAmt} €) deaktivieren` : `Bonus (${store.settings?.defaultBonusAmount ?? 75} €) aktivieren`}
                                            >
                                                <span>{s.hasBonus ? '☑' : '☐'}</span>
                                                <span>{bAmt > 0 ? `+${bAmt}€` : 'Bonus'}</span>
                                            </button>
                                        </div>

                                        {/* Bottom Row: Station, Vehicle, Partner */}
                                        <div style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '4px',
                                            paddingTop: '6px',
                                            borderTop: '1px solid rgb(var(--rgb-surface-3) / 0.45)'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                <span style={{
                                                    background: resolvedShift.colorInfo.stationBg,
                                                    color: resolvedShift.colorInfo.stationColor,
                                                    border: `1px solid ${resolvedShift.colorInfo.stationBorder}`,
                                                    padding: '1px 6px',
                                                    borderRadius: '4px',
                                                    fontSize: '10.5px',
                                                    fontWeight: 700
                                                }}>
                                                    📍 {resolvedShift.station}
                                                </span>
                                                {s.vehicle && (
                                                    <span style={{ color: 'var(--c-text-muted)', fontSize: '11.5px', fontWeight: 500 }}>
                                                        🚑 {s.vehicle}
                                                    </span>
                                                )}
                                            </div>
                                            {s.partner && (
                                                <div style={{ color: 'var(--c-info)', fontSize: '12px', fontWeight: 600, lineHeight: 1.3 }}>
                                                    👤 {s.partner.toLowerCase().startsWith('mit ') ? s.partner : `mit ${s.partner}`}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}

        </div>
    );
}
