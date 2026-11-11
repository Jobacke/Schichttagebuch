import React, { useState, useMemo, useEffect } from 'react';
import { useAnalysisLogic } from '../hooks/useAnalysisLogic';
import { useStore, getShiftBonusAmount } from '../context/StoreContext';
import { exportToPDF } from '../utils/pdfExport';
import { getShiftColor, STATION_THEMES } from '../utils/shiftColors';
import { resolveShiftDetails } from '../utils/shiftDisplay';
import { openCareManLiveWindow } from '../utils/oneClickCareManSync';
import ShiftRhythmCalendar from '../components/ShiftRhythmCalendar';
import { ChevronLeft, ChevronRight, X, SlidersHorizontal, ExternalLink } from 'lucide-react';

// Helper for CSS Date controls
const addMonths = (date, n) => {
    const d = new Date(date);
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    return d;
};

export default function Analysis() {
    const { store, toggleShiftBonus } = useStore();
    // Use the decoupled logic hook
    const logic = useAnalysisLogic();
    const {
        loading, label, target,
        filterMode, setFilterMode, baseDate, setBaseDate,
        customStart, setCustomStart, customEnd, setCustomEnd,
        selectedTypes, setSelectedTypes,
        selectedVehicles, setSelectedVehicles,
        selectedStations, setSelectedStations,
        onlyBonus, setOnlyBonus,
        stats, delta, filteredData
    } = logic;

    const isCurrentMonth = useMemo(() => {
        const now = new Date();
        return baseDate.getFullYear() === now.getFullYear() && baseDate.getMonth() === now.getMonth();
    }, [baseDate]);

    const isCurrentYear = useMemo(() => {
        const now = new Date();
        return baseDate.getFullYear() === now.getFullYear();
    }, [baseDate]);

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

    // Monat für „DP mit neuestem Stand laden“ (immer der aktuell gewählte Monat)
    const currentYearMonthStr = `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, '0')}`;
    const currentMonthLabel = baseDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

    // Nach einem 1-Klick-CareMan-Import auf den importierten Monat springen
    useEffect(() => {
        const onSynced = (e) => {
            const ym = e?.detail?.yearMonth;
            if (ym && /^\d{4}-\d{2}$/.test(ym)) {
                const [y, m] = ym.split('-').map(Number);
                setBaseDate(new Date(y, m - 1, 1));
                setFilterMode('month');
            }
        };
        window.addEventListener('careman-oneclick-synced', onSynced);
        return () => window.removeEventListener('careman-oneclick-synced', onSynced);
    }, [setBaseDate, setFilterMode]);

    if (loading) return <div className="page-content center">Lade Daten...</div>;

    const hasActiveFilters = selectedTypes.length > 0 || selectedVehicles.length > 0 || selectedStations.length > 0 || onlyBonus;
    const activeFilterCount = selectedTypes.length + selectedVehicles.length + selectedStations.length + (onlyBonus ? 1 : 0);

    return (
        <div className="page-content">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                        Mein Plan
                    </h1>
                </div>
                <DpLoadButton yearMonth={currentYearMonthStr} monthLabel={currentMonthLabel} />
            </div>

            {/* Compact Period & Filter Command Bar */}
            <div className="card-premium" style={{ padding: '8px 10px', marginBottom: '16px' }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '8px',
                    rowGap: '8px',
                    flexWrap: 'wrap'
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
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', flexWrap: 'wrap', marginLeft: 'auto', minWidth: 0, maxWidth: '100%' }}>
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

            {/* Kalender / Schicht-Rhythmus */}
            <div className="card-premium">
                <ShiftRhythmCalendar
                    baseDate={baseDate}
                    filterMode={filterMode}
                    filteredData={filteredData}
                    allShifts={store.shifts}
                    storeSettings={store.settings}
                />
            </div>

            {/* Dienstplan PDF – bleibt oben */}
            <button
                type="button"
                onClick={handleExportPDF}
                className="stat-card"
                style={{
                    width: '100%',
                    marginBottom: '16px',
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    background: 'rgb(var(--rgb-info) / 0.1)',
                    border: '1px solid rgb(var(--rgb-info) / 0.35)',
                    color: 'var(--c-info)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    textAlign: 'center'
                }}
                title="Monatsdienstplan als PDF exportieren"
            >
                <span style={{ fontSize: '20px', lineHeight: 1 }}>📄</span>
                <span style={{ fontSize: '15px', fontWeight: 700, lineHeight: 1.2 }}>
                    Dienstplan PDF
                </span>
            </button>

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

            {/* Dienste im Detail */}
            {stats.count === 0 ? (
                <div className="card-premium center" style={{ padding: '40px', color: 'var(--c-text-subtle)' }}>
                    <div style={{ fontSize: '40px', marginBottom: '10px' }}>📊</div>
                    Keine weiteren Daten für diesen Zeitraum vorhanden.
                </div>
            ) : (
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
            )}

        </div>
    );
}

// Button „DP mit neuestem Stand laden“ – identisch zum Reiter Journal
function DpLoadButton({ yearMonth, monthLabel }) {
    return (
        <button
            type="button"
            onClick={() => openCareManLiveWindow(yearMonth)}
            style={{
                background: 'linear-gradient(135deg, var(--c-success-deep), var(--c-success-strong))',
                color: '#ffffff',
                border: '1px solid rgb(var(--rgb-success) / 0.55)',
                fontWeight: 800,
                padding: '8px 13px',
                borderRadius: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                fontSize: '12.5px',
                whiteSpace: 'nowrap',
                boxShadow: '0 3px 12px rgb(var(--rgb-success) / 0.3)',
                transition: 'all 0.15s ease',
                flexShrink: 0
            }}
            title={`Neueste Dienstpläne für "Rettungswache München", "Rettungswache Obersendling" & "Rettungswache Hohenbrunn" (${monthLabel}) laden`}
        >
            <ExternalLink size={15} />
            <span>⚡ DP mit neuestem Stand laden</span>
        </button>
    );
}
