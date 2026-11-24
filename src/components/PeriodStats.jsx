import React, { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import { getShiftColor, STATION_THEMES, detectStation } from '../utils/shiftColors';
import { calcDuration } from '../utils/shiftDisplay';

// Gemeinsamer Auswertungsblock: Geleistet | Schichten | Bonus | Saldo + Verteilung + Bonus-Auswertung (PopUp)
export default function PeriodStats({
    stats,
    target,
    delta,
    weeklyRate,
    filterMode = 'month',
    label,
    baseDate,
    bonusOverview,
    filteredData,
    storeSettings,
    onlyBonus = false,
    setOnlyBonus,
    onSelectMonth
}) {
    const [showBonusModal, setShowBonusModal] = useState(false);

    const isPositive = delta >= 0;
    const colorClass = isPositive ? 'var(--color-success)' : 'var(--color-danger)';

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
            .filter(([, count]) => count > 0)
            .map(([st, count]) => ({
                station: st,
                count,
                hours: hours[st],
                theme: STATION_THEMES[st] || STATION_THEMES.Sendling
            }))
            .sort((a, b) => b.count - a.count);
    }, [filteredData]);

    return (
        <>
            {/* Kompakter Auswertungsblock: Zeile 1 Geleistet | Schichten | Bonus (einzeilig), Zeile 2 Saldo (einzeilig) */}
            <div className="period-stats-wrap">
                <div className="period-kpi-row">
                    <div className="stat-card period-kpi-card">
                        <span className="period-kpi-label">Geleistet</span>
                        <span className="period-kpi-value">{stats.actual.toFixed(1)}h</span>
                    </div>

                    <div className="stat-card period-kpi-card">
                        <span className="period-kpi-label">Schichten</span>
                        <span className="period-kpi-value">{stats.count}</span>
                    </div>

                    <button
                        type="button"
                        className={`stat-card period-kpi-card period-kpi-bonus${stats.bonusCount > 0 ? ' has-bonus' : ''}${onlyBonus ? ' is-filtered' : ''}`}
                        onClick={() => setShowBonusModal(true)}
                        title="Klicken für detaillierte Bonus-Auswertung"
                    >
                        <span className="period-kpi-label period-kpi-bonus-label">
                            <span>💰</span>
                            <span>Bonus</span>
                            {stats.bonusCount > 0 && (
                                <span className="period-kpi-bonus-count">({stats.bonusCount}x)</span>
                            )}
                        </span>
                        <span className="period-kpi-value period-kpi-bonus-val">
                            {stats.bonusTotalAmount.toFixed(0)}€
                        </span>
                        <span className="period-kpi-arrow" aria-hidden="true">↗</span>
                    </button>
                </div>

                {/* Zeile 2 (volle Breite, einzeilig): Saldo */}
                <div
                    className="stat-card period-saldo-card"
                    style={{ borderLeft: `4px solid ${colorClass}` }}
                >
                    <div className="period-saldo-left">
                        <span className="period-saldo-title">Saldo</span>
                        <span className="period-saldo-meta">
                            Soll {target.toFixed(1)}h{filterMode === 'month' ? ` · ${weeklyRate}h/Wo` : ''}
                        </span>
                    </div>
                    <div className="period-saldo-right">
                        <span className="period-saldo-value" style={{ color: colorClass }}>
                            {delta > 0 ? '+' : ''}{delta.toFixed(1)} h
                        </span>
                        <span className="period-saldo-icon" aria-hidden="true">{isPositive ? '📈' : '📉'}</span>
                    </div>
                </div>
            </div>

            {/* Verteilung */}
            {stats.count > 0 && (
                <div className="card-premium period-dist-card">
                    <h3 className="text-label" style={{ margin: '0 0 10px 0' }}>🍰 Verteilung</h3>

                    {/* Wachen-Verteilung (Eigenständige Farbstruktur) */}
                    {stationDistribution.length > 0 && (
                        <div style={{ marginBottom: '12px' }}>
                            <span style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>
                                Einsätze nach Wachen:
                            </span>
                            {stationDistribution.map((st) => (
                                <div key={st.station} style={{ marginBottom: '6px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', alignItems: 'center' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: st.theme.primaryHex }} />
                                            <span style={{ fontWeight: 600 }}>{st.theme.name}</span>
                                        </span>
                                        <span style={{ fontSize: '11.5px', color: 'var(--c-text-muted)' }}>
                                            <strong style={{ color: st.theme.primaryHex, fontSize: '12.5px', marginRight: '4px' }}>
                                                {st.count} {st.count === 1 ? 'Schicht' : 'Schichten'}
                                            </strong>
                                            ({st.hours.toFixed(1)} h)
                                        </span>
                                    </div>
                                    <div style={{ height: '5px', background: 'var(--c-surface-3)', borderRadius: '3px', marginTop: '3px', overflow: 'hidden' }}>
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
                        <span style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>
                            Schichtarten:
                        </span>
                        {stats.distributionData.map((d, i) => {
                            const shiftCol = getShiftColor(d.name, '');
                            return (
                                <div key={i} style={{ marginBottom: '7px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', alignItems: 'center' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ width: '7px', height: '7px', borderRadius: '2px', background: shiftCol.color }} />
                                            <span>{d.name}</span>
                                        </span>
                                        <strong style={{ color: shiftCol.color }}>{d.value}</strong>
                                    </div>
                                    <div style={{ height: '5px', background: 'var(--c-surface-3)', borderRadius: '3px', marginTop: '3px', overflow: 'hidden' }}>
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
                                    Standard: {storeSettings?.defaultBonusAmount ?? 75} €
                                </span>
                            </h3>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {typeof setOnlyBonus === 'function' && (
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
                                )}
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
                                                if (typeof onSelectMonth === 'function') onSelectMonth(m.monthIndex);
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

        </>
    );
}
