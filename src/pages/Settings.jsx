import React, { useState, useEffect } from 'react';
import { useStore } from '../context/StoreContext';
import {
    Plus, Clock, Tag, Truck, Hash, MapPin,
    Database, ChevronLeft, ChevronRight, Trash2, RotateCcw, Check, CalendarDays
} from 'lucide-react';
import { APP_VERSION } from '../version';

export default function Settings() {
    const {
        store,
        addSettingItem,
        removeSettingItem,
        updateWeeklyHours,
        setMonthlyTarget,
        removeMonthlyTarget
    } = useStore();
    const [activeScreen, setActiveScreen] = useState(null);

    const goBack = () => setActiveScreen(null);

    if (activeScreen) {
        return (
            <DetailScreen
                title={
                    activeScreen === 'targetHours' ? 'Sollstunden & Arbeitszeit' :
                        activeScreen === 'codes' ? 'Schichtkürzel' :
                            activeScreen === 'types' ? 'Schichtarten' :
                                activeScreen === 'stations' ? 'Wachen' :
                                    activeScreen === 'vehicles' ? 'Fahrzeuge' : 'Funkrufnamen'
                }
                onBack={goBack}
            >
                {activeScreen === 'targetHours' && (
                    <TargetHoursManager
                        defaultWeeklyHours={store.settings?.defaultWeeklyHours ?? 20}
                        monthlyTargets={store.settings?.monthlyTargets || {}}
                        onUpdateWeeklyHours={updateWeeklyHours}
                        onSetMonthlyTarget={setMonthlyTarget}
                        onRemoveMonthlyTarget={removeMonthlyTarget}
                    />
                )}
                {activeScreen === 'codes' && (
                    <CodeManager
                        data={store.settings.shiftCodes}
                        onAdd={(i) => addSettingItem('shiftCodes', i)}
                        onRemove={(id) => removeSettingItem('shiftCodes', id)}
                    />
                )}
                {activeScreen === 'types' && (
                    <SimpleManager
                        data={store.settings.shiftTypes}
                        type="object"
                        onAdd={(i) => addSettingItem('shiftTypes', i)}
                        onRemove={(id) => removeSettingItem('shiftTypes', id)}
                    />
                )}
                {['stations', 'vehicles', 'callSigns'].includes(activeScreen) && (
                    <SimpleManager
                        data={store.settings[activeScreen]}
                        type="string"
                        onAdd={(v) => addSettingItem(activeScreen, v)}
                        onRemove={(v) => removeSettingItem(activeScreen, v)}
                    />
                )}
            </DetailScreen>
        );
    }

    return (
        <div className="page-content">
            <h1>Einstellungen</h1>

            <h2>Dienstplan</h2>
            <div className="settings-list">
                <SettingsItem
                    icon={CalendarDays} color="#eab308" label="Sollstunden & Arbeitszeit"
                    value={`${store.settings?.defaultWeeklyHours ?? 20} h/Woche`} onClick={() => setActiveScreen('targetHours')}
                />
                <SettingsItem
                    icon={Clock} color="#f97316" label="Schichtkürzel & Zeiten"
                    value={store.settings.shiftCodes.length} onClick={() => setActiveScreen('codes')}
                />
                <SettingsItem
                    icon={Tag} color="#38bdf8" label="Schichtarten"
                    value={store.settings.shiftTypes.length} onClick={() => setActiveScreen('types')}
                />
            </div>

            <h2 style={{ marginTop: '32px' }}>Ressourcen</h2>
            <div className="settings-list">
                <SettingsItem
                    icon={MapPin} color="#ef4444" label="Wachen"
                    value={store.settings.stations.length} onClick={() => setActiveScreen('stations')}
                />
                <SettingsItem
                    icon={Truck} color="#22c55e" label="Fahrzeuge"
                    value={store.settings.vehicles.length} onClick={() => setActiveScreen('vehicles')}
                />
                <SettingsItem
                    icon={Hash} color="#a855f7" label="Funkrufnamen"
                    value={store.settings.callSigns.length} onClick={() => setActiveScreen('callSigns')}
                />
            </div>

            <div style={{ textAlign: 'center', marginTop: '40px', opacity: 0.4 }}>
                <Database size={24} style={{ margin: '0 auto 8px', display: 'block' }} />
                <small>Cloud Sync Aktiv • v{APP_VERSION}</small>
            </div>
        </div>
    );
}

// --- Sub-Components ---

function SettingsItem({ icon: Icon, color, label, value, onClick }) {
    return (
        <button className="settings-item" onClick={onClick}>
            <div className="settings-icon" style={{ color: color }}>
                <Icon size={20} />
            </div>
            <div style={{ flex: 1, fontWeight: 500 }}>{label}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-muted)' }}>
                <span style={{ fontSize: '12px' }}>{value}</span>
                <ChevronRight size={16} />
            </div>
        </button>
    );
}

function DetailScreen({ title, onBack, children }) {
    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'var(--color-bg)', zIndex: 2000,
            display: 'flex', flexDirection: 'column'
        }}>
            <div style={{
                height: '60px', borderBottom: '1px solid var(--color-border)',
                display: 'flex', alignItems: 'center', padding: '0 16px',
                background: 'rgba(15,23,42,0.9)', backdropFilter: 'blur(10px)'
            }}>
                <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', fontSize: '16px', padding: 0 }}>
                    <ChevronLeft /> Zurück
                </button>
                <span style={{ fontWeight: 'bold', flex: 1, textAlign: 'center', marginRight: '60px' }}>{title}</span>
            </div>
            <div style={{ padding: '16px', overflowY: 'auto', paddingBottom: '100px' }}>
                {children}
            </div>
        </div>
    );
}

function CodeManager({ data, onAdd, onRemove }) {
    const [code, setCode] = useState('');
    const [hours, setHours] = useState('');

    const handleAdd = () => {
        if (!code || !hours) return;
        onAdd({ id: crypto.randomUUID(), code, hours: parseFloat(hours) });
        setCode(''); setHours('');
    };

    return (
        <>
            <div className="settings-list" style={{ marginBottom: '24px' }}>
                {data.map(item => (
                    <div key={item.id} className="settings-item" style={{ cursor: 'default' }}>
                        <span style={{ background: 'var(--color-surface-hover)', padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold', minWidth: '40px', textAlign: 'center', color: 'var(--color-primary)' }}>{item.code}</span>
                        <span style={{ flex: 1, marginLeft: '12px' }}>{item.hours} Std</span>
                        <button onClick={() => onRemove(item.id)} style={{ color: 'var(--color-text-muted)', background: 'none', border: 'none' }}><Trash2 size={18} /></button>
                    </div>
                ))}
                {data.length === 0 && <div style={{ padding: '16px', textAlign: 'center', color: '#64748b' }}>Keine Kürzel</div>}
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
                <input placeholder="Kürzel" value={code} onChange={e => setCode(e.target.value)} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #334155', background: '#0f172a', color: 'white' }} />
                <input placeholder="Std" type="number" value={hours} onChange={e => setHours(e.target.value)} style={{ width: '80px', padding: '12px', borderRadius: '12px', border: '1px solid #334155', background: '#0f172a', color: 'white' }} />
                <button onClick={handleAdd} className="btn-primary" style={{ width: 'auto' }}><Plus /></button>
            </div>
        </>
    );
}

function SimpleManager({ data, type, onAdd, onRemove }) {
    const [val, setVal] = useState('');

    const handleAdd = () => {
        if (!val) return;
        if (type === 'object') onAdd({ id: crypto.randomUUID(), name: val });
        else onAdd(val);
        setVal('');
    };

    return (
        <>
            <div className="settings-list" style={{ marginBottom: '24px' }}>
                {data.map((item, i) => (
                    <div key={i} className="settings-item" style={{ cursor: 'default' }}>
                        <span style={{ flex: 1 }}>{type === 'object' ? item.name : item}</span>
                        <button onClick={() => onRemove(type === 'object' ? item.id : item)} style={{ color: 'var(--color-text-muted)', background: 'none', border: 'none' }}><Trash2 size={18} /></button>
                    </div>
                ))}
                {data.length === 0 && <div style={{ padding: '16px', textAlign: 'center', color: '#64748b' }}>Liste leer</div>}
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
                <input placeholder="Neuer Eintrag" value={val} onChange={e => setVal(e.target.value)} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #334155', background: '#0f172a', color: 'white' }} />
                <button onClick={handleAdd} className="btn-primary" style={{ width: 'auto' }}><Plus /></button>
            </div>
        </>
    );
}

function TargetHoursManager({ defaultWeeklyHours, monthlyTargets, onUpdateWeeklyHours, onSetMonthlyTarget, onRemoveMonthlyTarget }) {
    const [weeklyHours, setWeeklyHours] = useState(defaultWeeklyHours.toString());
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [savedNotice, setSavedNotice] = useState(false);

    // Sync input if external defaultWeeklyHours changes
    useEffect(() => {
        setWeeklyHours(defaultWeeklyHours.toString());
    }, [defaultWeeklyHours]);

    const handleWeeklySave = (val) => {
        const num = parseFloat(val);
        if (!isNaN(num) && num >= 0) {
            onUpdateWeeklyHours(num);
            setSavedNotice(true);
            setTimeout(() => setSavedNotice(false), 2000);
        }
    };

    const currentWeekly = parseFloat(weeklyHours) || 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* 1. Default Weekly Target Card */}
            <div style={{ background: 'var(--color-surface)', padding: '16px', borderRadius: '16px', border: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <Clock size={18} color="var(--color-primary)" />
                    <strong style={{ fontSize: '15px' }}>Standard-Wochenarbeitszeit</strong>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', margin: '0 0 16px 0', lineHeight: 1.4 }}>
                    Dient als Berechnungsgrundlage für alle Monate. Das Monatssoll wird automatisch anhand der tatsächlichen Kalendertage des jeweiligen Monats hochgerechnet.
                </p>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                        <input
                            type="number"
                            step="0.5"
                            min="0"
                            value={weeklyHours}
                            onChange={(e) => setWeeklyHours(e.target.value)}
                            onBlur={() => handleWeeklySave(weeklyHours)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleWeeklySave(weeklyHours); }}
                            style={{
                                width: '100%',
                                padding: '12px 85px 12px 14px',
                                borderRadius: '12px',
                                border: '1px solid #334155',
                                background: '#0f172a',
                                color: 'white',
                                fontSize: '16px',
                                fontWeight: 600
                            }}
                            placeholder="z.B. 20"
                        />
                        <span style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', fontSize: '13px', pointerEvents: 'none' }}>
                            Std./Woche
                        </span>
                    </div>
                    <button
                        onClick={() => handleWeeklySave(weeklyHours)}
                        className="btn-primary"
                        style={{ width: 'auto', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                        {savedNotice ? <Check size={18} /> : 'Speichern'}
                    </button>
                </div>
            </div>

            {/* 2. Monthly Override Section */}
            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Monatskontingente ({selectedYear})</h3>
                        <small style={{ color: 'var(--color-text-muted)' }}>Automatisch berechnet oder manuell anpassbar</small>
                    </div>
                    {/* Year Selector */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#1e293b', padding: '4px 8px', borderRadius: '10px', border: '1px solid var(--color-border)' }}>
                        <button
                            onClick={() => setSelectedYear(y => y - 1)}
                            style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
                            title="Vorheriges Jahr"
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <span style={{ fontWeight: 700, fontSize: '14px', minWidth: '42px', textAlign: 'center' }}>
                            {selectedYear}
                        </span>
                        <button
                            onClick={() => setSelectedYear(y => y + 1)}
                            style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
                            title="Nächstes Jahr"
                        >
                            <ChevronRight size={18} />
                        </button>
                    </div>
                </div>

                <div className="settings-list" style={{ gap: '8px' }}>
                    {Array.from({ length: 12 }).map((_, monthIndex) => {
                        const monthName = new Date(selectedYear, monthIndex, 1).toLocaleDateString('de-DE', { month: 'long' });
                        const yearMonth = `${selectedYear}-${String(monthIndex + 1).padStart(2, '0')}`;
                        const daysInMonth = new Date(selectedYear, monthIndex + 1, 0).getDate();
                        const autoHours = ((daysInMonth / 7) * currentWeekly).toFixed(1);

                        const hasCustom = monthlyTargets[yearMonth] !== undefined && monthlyTargets[yearMonth] !== '' && !isNaN(Number(monthlyTargets[yearMonth]));

                        return (
                            <MonthTargetRow
                                key={yearMonth}
                                monthName={monthName}
                                daysInMonth={daysInMonth}
                                autoHours={autoHours}
                                hasCustom={hasCustom}
                                customValue={hasCustom ? monthlyTargets[yearMonth] : ''}
                                onSave={(val) => onSetMonthlyTarget(yearMonth, val)}
                                onReset={() => onRemoveMonthlyTarget(yearMonth)}
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function MonthTargetRow({ monthName, daysInMonth, autoHours, hasCustom, customValue, onSave, onReset }) {
    const [val, setVal] = useState(hasCustom ? customValue.toString() : '');
    const [isEditing, setIsEditing] = useState(false);

    useEffect(() => {
        setVal(hasCustom ? customValue.toString() : '');
    }, [hasCustom, customValue]);

    const handleBlurOrSave = () => {
        setIsEditing(false);
        if (val === '' || val === null) {
            if (hasCustom) onReset();
        } else {
            const num = parseFloat(val);
            if (!isNaN(num) && num >= 0) {
                onSave(num);
            } else if (hasCustom) {
                onReset();
            }
        }
    };

    return (
        <div className="settings-item" style={{ cursor: 'default', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
            <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 600, fontSize: '15px' }}>{monthName}</span>
                    {hasCustom ? (
                        <span style={{ fontSize: '11px', background: 'rgba(249, 115, 22, 0.15)', color: 'var(--color-primary)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                            Manuell
                        </span>
                    ) : (
                        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                            {daysInMonth} Tage
                        </span>
                    )}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                    {hasCustom ? `Auto-Berechnung wäre: ${autoHours} h` : `Auto: ${daysInMonth} Tage / 7 × Wochensoll`}
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ position: 'relative', width: '100px' }}>
                    <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={isEditing ? val : (hasCustom ? customValue : autoHours)}
                        onFocus={() => {
                            setIsEditing(true);
                            if (!hasCustom) setVal(autoHours);
                        }}
                        onChange={(e) => setVal(e.target.value)}
                        onBlur={handleBlurOrSave}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                        style={{
                            width: '100%',
                            padding: '8px 24px 8px 10px',
                            borderRadius: '8px',
                            border: hasCustom ? '1px solid var(--color-primary)' : '1px solid #334155',
                            background: '#0f172a',
                            color: hasCustom ? 'var(--color-primary)' : 'white',
                            fontSize: '14px',
                            fontWeight: 600,
                            textAlign: 'right'
                        }}
                    />
                    <span style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', fontSize: '12px', pointerEvents: 'none' }}>
                        h
                    </span>
                </div>

                {hasCustom && (
                    <button
                        onClick={onReset}
                        title="Auf automatische Hochrechnung zurücksetzen"
                        style={{
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            color: 'var(--color-danger)',
                            borderRadius: '8px',
                            padding: '6px 8px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center'
                        }}
                    >
                        <RotateCcw size={16} />
                    </button>
                )}
            </div>
        </div>
    );
}
