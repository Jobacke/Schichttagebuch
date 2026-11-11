import React, { useState, useMemo } from 'react';
import { getShiftBonusAmount } from '../context/StoreContext';
import { STATION_THEMES } from '../utils/shiftColors';
import { getIncomingNightShiftForDate } from '../utils/teamRosterParser';
import { calcDuration, resolveShiftDetails } from '../utils/shiftDisplay';

// Gemeinsame Monatskalender-Übersicht (Schicht-Rhythmus) für die Reiter „mein Plan“ und „Journal“
export default function ShiftRhythmCalendar({
    baseDate,
    filterMode = 'month',
    filteredData,
    allShifts,
    storeSettings,
    selectedDateStr: controlledSelectedDateStr,
    onSelectDate,
    showInspector = true
}) {
    // Optional gesteuerter Modus: Wenn onSelectDate übergeben wird, verwaltet die Elternkomponente die Tagesauswahl
    const [internalSelectedDateStr, setInternalSelectedDateStr] = useState(null);
    const isControlled = typeof onSelectDate === 'function';
    const selectedDateStr = isControlled ? (controlledSelectedDateStr ?? null) : internalSelectedDateStr;
    const setSelectedDateStr = isControlled ? onSelectDate : setInternalSelectedDateStr;

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
            {showInspector && selectedDayInfo && (
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
