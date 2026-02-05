import React, { useState } from 'react';
import { APP_VERSION } from '../version';
import { useAnalysisLogic } from '../hooks/useAnalysisLogic';
import { useStore } from '../context/StoreContext';

// Helper for CSS Date controls
const addMonths = (date, n) => {
    const d = new Date(date);
    d.setMonth(d.getMonth() + n);
    return d;
};

// Component: Simple CSS Bar Chart
const CssBarChart = ({ data }) => {
    if (!data || data.length === 0) return null;
    const maxVal = Math.max(...data.map(d => d.hours)) || 1;

    return (
        <div style={{ display: 'flex', alignItems: 'flex-end', height: '150px', gap: '2px', paddingTop: '20px' }}>
            {data.map((d, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', width: '100%', padding: '0 1px' }}>
                        <div style={{
                            width: '100%',
                            height: `${(d.hours / maxVal) * 100}%`,
                            background: '#f97316',
                            borderTopLeftRadius: '2px',
                            borderTopRightRadius: '2px',
                            minHeight: '2px'
                        }} />
                    </div>
                </div>
            ))}
        </div>
    );
};

export default function Analysis() {
    const { store } = useStore();
    const [isFilterOpen, setIsFilterOpen] = useState(false);

    // Use the decoupled logic hook
    const logic = useAnalysisLogic();
    const {
        loading, label, target,
        filterMode, setFilterMode, baseDate, setBaseDate,
        customStart, setCustomStart, customEnd, setCustomEnd,
        selectedTypes, setSelectedTypes,
        selectedVehicles, setSelectedVehicles,
        stats, delta, isInvalid
    } = logic;

    const isPositive = delta >= 0;
    const colorClass = isPositive ? 'var(--color-success)' : 'var(--color-danger)';

    // Formatting Helpers
    const formatDateInput = (d) => {
        try { return d.toISOString().slice(0, 7); } catch { return ''; }
    };
    const handleMonthChange = (e) => {
        if (e.target.value) setBaseDate(new Date(e.target.value));
    };

    if (loading) return <div className="page-content center">Lade Daten...</div>;

    return (
        <div className="page-content">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                        Auswertung <span style={{ fontSize: '12px', color: 'var(--color-primary)', background: 'rgba(249, 115, 22, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>v{APP_VERSION}</span>
                    </h1>
                    <div className="subtitle" style={{ margin: 0, marginTop: '4px', color: isInvalid ? 'var(--color-danger)' : 'inherit' }}>{label}</div>
                </div>
                <button onClick={() => setIsFilterOpen(true)} className="btn-primary" style={{ padding: '8px 16px', fontSize: '14px', width: 'auto' }}>
                    Filter
                </button>
            </div>

            {/* KPI Cards */}
            <div className="stats-grid">
                <div className="stat-card">
                    <span className="text-label">Geleistet</span>
                    <span className="text-value">{stats.actual.toFixed(1)} h</span>
                </div>
                <div className="stat-card">
                    <span className="text-label">Schichten</span>
                    <span className="text-value">{stats.count}</span>
                </div>
                <div className="stat-card full-width" style={{ borderLeft: `4px solid ${colorClass}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <div>
                            <span className="text-label">Saldo (Soll: {target.toFixed(1)}h)</span>
                            <div className="text-value" style={{ color: colorClass }}>
                                {delta > 0 ? '+' : ''}{delta.toFixed(1)} h
                            </div>
                        </div>
                        <div style={{ fontSize: '24px' }}>{isPositive ? "📈" : "📉"}</div>
                    </div>
                </div>
            </div>

            {/* Charts */}
            {stats.count === 0 ? (
                <div className="card-premium center" style={{ padding: '40px', color: '#64748b' }}>
                    <div style={{ fontSize: '40px', marginBottom: '10px' }}>📊</div>
                    Keine Daten für diesen Zeitraum.
                </div>
            ) : (
                <>
                    <div className="card-premium">
                        <h3 className="text-label" style={{ margin: '0 0 10px 0' }}>📅 Verlauf (Tage)</h3>
                        <CssBarChart data={stats.chartData} />
                    </div>

                    <div className="card-premium">
                        <h3 className="text-label" style={{ margin: '0 0 10px 0' }}>🍰 Verteilung</h3>
                        {stats.distributionData.map((d, i) => (
                            <div key={i} style={{ marginBottom: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                                    <span>{d.name}</span>
                                    <strong>{d.value}</strong>
                                </div>
                                <div style={{ height: '6px', background: '#334155', borderRadius: '3px', marginTop: '4px', overflow: 'hidden' }}>
                                    <div style={{
                                        width: `${(d.value / stats.count) * 100}%`,
                                        height: '100%',
                                        background: ['#f97316', '#38bdf8', '#22c55e'][i % 3]
                                    }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* Filter Modal */}
            {isFilterOpen && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setIsFilterOpen(false)}>
                    <div className="modal-content">
                        <div className="modal-header">
                            <h3>Filter</h3>
                            <button className="close-btn" onClick={() => setIsFilterOpen(false)}>✕</button>
                        </div>
                        <div className="modal-body">
                            {/* Mode Toggle */}
                            <div style={{ display: 'flex', background: '#1e293b', borderRadius: '8px', padding: '4px', marginBottom: '16px' }}>
                                {['month', 'year', 'custom'].map(m => (
                                    <button
                                        key={m}
                                        onClick={() => setFilterMode(m)}
                                        style={{
                                            flex: 1, padding: '8px', borderRadius: '6px', border: 'none',
                                            background: filterMode === m ? 'var(--color-primary)' : 'transparent',
                                            color: filterMode === m ? 'white' : '#94a3b8'
                                        }}
                                    >
                                        {m === 'month' ? 'Monat' : m === 'year' ? 'Jahr' : 'Zeit'}
                                    </button>
                                ))}
                            </div>

                            {/* Controls */}
                            <div style={{ marginBottom: '20px' }}>
                                {filterMode === 'month' && (
                                    <input type="month" className="input-premium" style={{ width: '100%' }} value={formatDateInput(baseDate)} onChange={handleMonthChange} />
                                )}
                                {filterMode === 'year' && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1e293b', padding: '10px', borderRadius: '8px' }}>
                                        <button className="close-btn" onClick={() => setBaseDate(addMonths(baseDate, -12))}>&lt;</button>
                                        <strong>{baseDate.getFullYear()}</strong>
                                        <button className="close-btn" onClick={() => setBaseDate(addMonths(baseDate, 12))}>&gt;</button>
                                    </div>
                                )}
                                {filterMode === 'custom' && (
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input type="date" className="input-premium" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
                                        <input type="date" className="input-premium" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
                                    </div>
                                )}
                            </div>

                            {/* Types */}
                            <div style={{ marginBottom: '16px' }}>
                                <label className="text-label" style={{ display: 'block', marginBottom: '8px' }}>Schichtarten</label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {(store.settings?.shiftTypes || []).map(t => {
                                        const active = selectedTypes.includes(t.id);
                                        return (
                                            <button key={t.id}
                                                onClick={() => setSelectedTypes(active ? selectedTypes.filter(x => x !== t.id) : [...selectedTypes, t.id])}
                                                className={`filter-chip ${active ? 'active' : ''}`}
                                            >
                                                {t.name} {active && '✓'}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Vehicles */}
                            <div>
                                <label className="text-label" style={{ display: 'block', marginBottom: '8px' }}>Fahrzeuge</label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {(store.settings?.vehicles || []).map(v => {
                                        const active = selectedVehicles.includes(v);
                                        return (
                                            <button key={v}
                                                onClick={() => setSelectedVehicles(active ? selectedVehicles.filter(x => x !== v) : [...selectedVehicles, v])}
                                                className={`filter-chip ${active ? 'active' : ''}`}
                                            >
                                                {v} {active && '✓'}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button onClick={() => setIsFilterOpen(false)} className="btn-primary" style={{ width: '100%' }}>Fertig</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
