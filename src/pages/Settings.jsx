import React, { useState, useEffect } from 'react';
import { useStore } from '../context/StoreContext';
import {
    Plus, Clock, Tag, Truck, Hash, MapPin,
    Database, ChevronLeft, ChevronRight, Trash2, RotateCcw, Check, CalendarDays,
    PenSquare, X
} from 'lucide-react';
import { SHIFT_PRESETS } from '../utils/shiftPresets';
import { APP_VERSION } from '../version';

export default function Settings() {
    const {
        store,
        addSettingItem,
        updateSettingItem,
        removeSettingItem,
        updateWeeklyHours,
        setMonthlyWeeklyHours,
        removeMonthlyWeeklyHours
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
                        monthlyWeeklyHours={store.settings?.monthlyWeeklyHours || {}}
                        onUpdateWeeklyHours={updateWeeklyHours}
                        onSetMonthlyWeeklyHours={setMonthlyWeeklyHours}
                        onRemoveMonthlyWeeklyHours={removeMonthlyWeeklyHours}
                    />
                )}
                {activeScreen === 'codes' && (
                    <CodeManager
                        data={store.settings.shiftCodes}
                        storeSettings={store.settings}
                        onAdd={(i) => addSettingItem('shiftCodes', i)}
                        onUpdate={(i) => updateSettingItem('shiftCodes', i)}
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

function CodeEditModal({ isOpen, initialData, onClose, onSave, storeSettings }) {
    if (!isOpen) return null;

    const isNew = !initialData?.code;

    const [formData, setFormData] = useState(() => {
        const preset = initialData?.code ? (SHIFT_PRESETS[initialData.code] || {}) : {};
        return {
            id: initialData?.id || crypto.randomUUID(),
            code: initialData?.code || '',
            hours: initialData?.hours !== undefined && initialData?.hours !== null ? initialData.hours : (preset.hours ?? 8.2),
            startTime: initialData?.startTime || preset.startTime || '07:00',
            endTime: initialData?.endTime || preset.endTime || '19:00',
            typeId: initialData?.typeId || '',
            shiftTypeName: initialData?.shiftTypeName || preset.shiftTypeName || '',
            station: initialData?.station || preset.station || '',
            vehicle: initialData?.vehicle || preset.vehicle || '',
            callSign: initialData?.callSign || preset.callSign || ''
        };
    });

    // Helper to calculate hours between startTime and endTime
    const calculateHours = (start, end) => {
        if (!start || !end) return 0;
        try {
            const [sH, sM] = start.split(':').map(Number);
            const [eH, eM] = end.split(':').map(Number);
            let startMin = sH * 60 + sM;
            let endMin = eH * 60 + eM;
            if (endMin < startMin) endMin += 24 * 60;
            return Math.round(((endMin - startMin) / 60) * 10) / 10;
        } catch {
            return 0;
        }
    };

    const handleApplyCalculatedHours = () => {
        const calc = calculateHours(formData.startTime, formData.endTime);
        if (calc > 0) {
            setFormData(prev => ({ ...prev, hours: calc }));
        }
    };

    const handleSave = (e) => {
        e.preventDefault();
        if (!formData.code.trim()) return;

        // Find shiftTypeName if typeId chosen
        let typeName = formData.shiftTypeName;
        if (formData.typeId) {
            const matched = (storeSettings.shiftTypes || []).find(t => t.id === formData.typeId);
            if (matched) typeName = matched.name;
        }

        onSave({
            ...formData,
            code: formData.code.trim().toUpperCase(),
            hours: parseFloat(formData.hours) || 0,
            shiftTypeName: typeName
        });
        onClose();
    };

    return (
        <div className="modal-overlay" style={{ alignItems: 'center', zIndex: 3000 }}>
            <div className="modal-content" style={{ maxWidth: '520px', borderRadius: '20px', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
                <div className="modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            background: 'rgba(249, 115, 22, 0.15)',
                            color: 'var(--color-primary)',
                            padding: '8px',
                            borderRadius: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <Clock size={20} />
                        </div>
                        <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--color-text-main)' }}>
                            {isNew ? 'Neues Schichtkürzel anlegen' : `Kürzel bearbeiten: ${formData.code}`}
                        </h3>
                    </div>
                    <button className="close-btn" onClick={onClose} type="button">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSave} style={{ overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Kürzel & Schichtart */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                            <label className="text-label" style={{ display: 'block', marginBottom: '6px' }}>
                                Schichtkürzel *
                            </label>
                            <input
                                className="input-premium"
                                style={{ marginBottom: 0, textTransform: 'uppercase', fontWeight: 'bold' }}
                                value={formData.code}
                                onChange={e => setFormData({ ...formData, code: e.target.value })}
                                placeholder="z.B. RFO, T1, N"
                                required
                            />
                        </div>
                        <div>
                            <label className="text-label" style={{ display: 'block', marginBottom: '6px' }}>
                                Schichtart
                            </label>
                            <select
                                className="input-premium"
                                style={{ marginBottom: 0 }}
                                value={formData.typeId || (storeSettings.shiftTypes || []).find(t => t.name === formData.shiftTypeName)?.id || ''}
                                onChange={e => {
                                    const tId = e.target.value;
                                    const tObj = (storeSettings.shiftTypes || []).find(t => t.id === tId);
                                    setFormData({
                                        ...formData,
                                        typeId: tId,
                                        shiftTypeName: tObj ? tObj.name : formData.shiftTypeName
                                    });
                                }}
                            >
                                <option value="">-- Schichtart wählen --</option>
                                {(storeSettings.shiftTypes || []).map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Dienstzeiten: Start & Ende */}
                    <div>
                        <label className="text-label" style={{ display: 'block', marginBottom: '6px' }}>
                            Dienstzeiten (Beginn & Ende)
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div>
                                <input
                                    type="time"
                                    className="input-premium"
                                    style={{ marginBottom: 0 }}
                                    value={formData.startTime}
                                    onChange={e => setFormData({ ...formData, startTime: e.target.value })}
                                    required
                                />
                                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px', display: 'block' }}>Beginn</span>
                            </div>
                            <div>
                                <input
                                    type="time"
                                    className="input-premium"
                                    style={{ marginBottom: 0 }}
                                    value={formData.endTime}
                                    onChange={e => setFormData({ ...formData, endTime: e.target.value })}
                                    required
                                />
                                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px', display: 'block' }}>Ende</span>
                            </div>
                        </div>
                    </div>

                    {/* Arbeitszeit (Stunden) */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <label className="text-label" style={{ margin: 0 }}>
                                Arbeitszeit (Stunden) *
                            </label>
                            <button
                                type="button"
                                onClick={handleApplyCalculatedHours}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--color-primary)',
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                    fontWeight: 500,
                                    padding: 0
                                }}
                            >
                                Aus Zeiten berechnen ({calculateHours(formData.startTime, formData.endTime)} h)
                            </button>
                        </div>
                        <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="48"
                            className="input-premium"
                            style={{ marginBottom: 0 }}
                            value={formData.hours}
                            onChange={e => setFormData({ ...formData, hours: e.target.value })}
                            placeholder="z.B. 8.2 oder 12.0"
                            required
                        />
                        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px', display: 'block' }}>
                            Wird für die Soll/Ist-Arbeitszeitberechnung im Monat herangezogen.
                        </span>
                    </div>

                    {/* Standard-Wache & Fahrzeug (optional) */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                            <label className="text-label" style={{ display: 'block', marginBottom: '6px' }}>
                                Standard-Wache (opt.)
                            </label>
                            <select
                                className="input-premium"
                                style={{ marginBottom: 0 }}
                                value={formData.station}
                                onChange={e => setFormData({ ...formData, station: e.target.value })}
                            >
                                <option value="">-- Keine Wache --</option>
                                {(storeSettings.stations || []).map((st, i) => (
                                    <option key={i} value={st}>{st}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-label" style={{ display: 'block', marginBottom: '6px' }}>
                                Standard-Fahrzeug (opt.)
                            </label>
                            <select
                                className="input-premium"
                                style={{ marginBottom: 0 }}
                                value={formData.vehicle}
                                onChange={e => setFormData({ ...formData, vehicle: e.target.value })}
                            >
                                <option value="">-- Kein Fahrzeug --</option>
                                {(storeSettings.vehicles || []).map((v, i) => (
                                    <option key={i} value={v}>{v}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Buttons */}
                    <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                        <button
                            type="button"
                            className="btn-secondary"
                            onClick={onClose}
                            style={{ flex: 1 }}
                        >
                            Abbrechen
                        </button>
                        <button
                            type="submit"
                            className="btn-primary"
                            style={{ flex: 1, gap: '6px' }}
                        >
                            <Check size={18} />
                            Speichern
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function CodeManager({ data = [], storeSettings = {}, onAdd, onUpdate, onRemove }) {
    const [editingItem, setEditingItem] = useState(null);
    const [isCreatingNew, setIsCreatingNew] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const filteredList = data.filter(item => {
        if (!searchTerm.trim()) return true;
        const q = searchTerm.toLowerCase();
        const preset = SHIFT_PRESETS[item.code] || {};
        const code = (item.code || '').toLowerCase();
        const type = (item.shiftTypeName || preset.shiftTypeName || '').toLowerCase();
        const station = (item.station || preset.station || '').toLowerCase();
        return code.includes(q) || type.includes(q) || station.includes(q);
    });

    const handleSaveItem = (itemData) => {
        if (isCreatingNew) {
            onAdd(itemData);
            setIsCreatingNew(false);
        } else {
            onUpdate(itemData);
            setEditingItem(null);
        }
    };

    return (
        <div>
            {/* Top Toolbar: Search & Add Button */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <input
                    type="text"
                    placeholder="Kürzel oder Schichtart suchen..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="input-premium"
                    style={{ flex: 1, minWidth: '180px', marginBottom: 0 }}
                />
                <button
                    type="button"
                    onClick={() => setIsCreatingNew(true)}
                    className="btn-primary"
                    style={{
                        padding: '10px 16px',
                        fontSize: '13px',
                        borderRadius: '12px',
                        gap: '6px',
                        whiteSpace: 'nowrap'
                    }}
                >
                    <Plus size={16} />
                    Neues Kürzel
                </button>
            </div>

            {/* Shift Codes List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
                {filteredList.map(item => {
                    const preset = SHIFT_PRESETS[item.code] || {};
                    const effectiveCode = item.code || '';
                    const effectiveHours = item.hours !== undefined && item.hours !== null ? item.hours : (preset.hours ?? 8.2);
                    const effectiveStart = item.startTime || preset.startTime || '';
                    const effectiveEnd = item.endTime || preset.endTime || '';
                    const effectiveType = item.shiftTypeName || preset.shiftTypeName || '';
                    const effectiveStation = item.station || preset.station || '';
                    const effectiveVehicle = item.vehicle || preset.vehicle || '';

                    return (
                        <div
                            key={item.id}
                            className="card-premium"
                            onClick={() => setEditingItem(item)}
                            style={{
                                padding: '12px 14px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '12px',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                border: '1px solid #334155',
                                background: '#1e293b'
                            }}
                        >
                            {/* Code Badge */}
                            <div style={{
                                background: 'rgba(249, 115, 22, 0.15)',
                                color: '#f97316',
                                border: '1px solid rgba(249, 115, 22, 0.35)',
                                padding: '6px 10px',
                                borderRadius: '8px',
                                fontWeight: 'bold',
                                fontSize: '15px',
                                minWidth: '55px',
                                textAlign: 'center',
                                flexShrink: 0
                            }}>
                                {effectiveCode}
                            </div>

                            {/* Details */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: 600, fontSize: '14px', color: '#f8fafc' }}>
                                        {effectiveType || 'Schicht'}
                                    </span>
                                    <span style={{
                                        background: '#334155',
                                        color: '#facc15',
                                        padding: '1px 6px',
                                        borderRadius: '4px',
                                        fontSize: '11px',
                                        fontWeight: 600
                                    }}>
                                        {effectiveHours} Std
                                    </span>
                                </div>

                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    color: '#94a3b8',
                                    fontSize: '12px',
                                    marginTop: '3px',
                                    flexWrap: 'wrap'
                                }}>
                                    {effectiveStart && effectiveEnd ? (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#cbd5e1' }}>
                                            <Clock size={12} style={{ color: '#f97316' }} />
                                            {effectiveStart} - {effectiveEnd} Uhr
                                        </span>
                                    ) : (
                                        <span style={{ color: '#64748b', fontStyle: 'italic' }}>Keine festen Zeiten</span>
                                    )}

                                    {effectiveStation && (
                                        <span>• {effectiveStation}</span>
                                    )}

                                    {effectiveVehicle && (
                                        <span>• {effectiveVehicle}</span>
                                    )}
                                </div>
                            </div>

                            {/* Actions */}
                            <div
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}
                                onClick={e => e.stopPropagation()}
                            >
                                <button
                                    type="button"
                                    onClick={() => setEditingItem(item)}
                                    style={{
                                        background: 'rgba(56, 189, 248, 0.12)',
                                        border: '1px solid rgba(56, 189, 248, 0.3)',
                                        color: '#38bdf8',
                                        padding: '7px',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                    title="Schichtkürzel bearbeiten"
                                >
                                    <PenSquare size={16} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onRemove(item.id)}
                                    style={{
                                        background: 'rgba(239, 68, 68, 0.12)',
                                        border: '1px solid rgba(239, 68, 68, 0.3)',
                                        color: '#ef4444',
                                        padding: '7px',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                    title="Schichtkürzel löschen"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    );
                })}

                {filteredList.length === 0 && (
                    <div style={{
                        padding: '32px 16px',
                        textAlign: 'center',
                        color: '#64748b',
                        background: '#1e293b',
                        borderRadius: '12px'
                    }}>
                        Keine Schichtkürzel gefunden.
                    </div>
                )}
            </div>

            {/* Edit / Create Modal */}
            {(editingItem || isCreatingNew) && (
                <CodeEditModal
                    isOpen={true}
                    initialData={editingItem}
                    onClose={() => {
                        setEditingItem(null);
                        setIsCreatingNew(false);
                    }}
                    onSave={handleSaveItem}
                    storeSettings={storeSettings}
                />
            )}
        </div>
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

function TargetHoursManager({ defaultWeeklyHours, monthlyWeeklyHours, onUpdateWeeklyHours, onSetMonthlyWeeklyHours, onRemoveMonthlyWeeklyHours }) {
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

    const currentDefaultWeekly = parseFloat(weeklyHours) || 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* 1. Default Weekly Target Card */}
            <div style={{ background: 'var(--color-surface)', padding: '16px', borderRadius: '16px', border: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <Clock size={18} color="var(--color-primary)" />
                    <strong style={{ fontSize: '15px' }}>Standard-Wochenarbeitszeit (Default)</strong>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', margin: '0 0 16px 0', lineHeight: 1.4 }}>
                    Gilt für alle Monate, für die keine abweichende Wochenarbeitszeit festgelegt wurde. Das Monatssoll wird für jeden Monat automatisch auf Basis der Kalendertage hochgerechnet.
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
                        <small style={{ color: 'var(--color-text-muted)' }}>Wochenstunden pro Monat individuell einstellbar</small>
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

                        const customVal = monthlyWeeklyHours?.[yearMonth];
                        const hasCustom = customVal !== undefined && customVal !== '' && !isNaN(Number(customVal));

                        return (
                            <MonthTargetRow
                                key={yearMonth}
                                monthName={monthName}
                                daysInMonth={daysInMonth}
                                defaultWeekly={currentDefaultWeekly}
                                hasCustom={hasCustom}
                                customWeekly={hasCustom ? Number(customVal) : null}
                                onSave={(val) => onSetMonthlyWeeklyHours(yearMonth, val)}
                                onReset={() => onRemoveMonthlyWeeklyHours(yearMonth)}
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function MonthTargetRow({ monthName, daysInMonth, defaultWeekly, hasCustom, customWeekly, onSave, onReset }) {
    const activeWeekly = hasCustom ? customWeekly : defaultWeekly;
    const monthlyTotal = ((daysInMonth / 7) * activeWeekly).toFixed(1);

    const [val, setVal] = useState(hasCustom ? customWeekly.toString() : '');
    const [isEditing, setIsEditing] = useState(false);

    useEffect(() => {
        setVal(hasCustom ? customWeekly.toString() : '');
    }, [hasCustom, customWeekly]);

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
        <div className="settings-item" style={{ cursor: 'default', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', gap: '12px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: '15px' }}>{monthName}</span>
                    {hasCustom ? (
                        <span style={{ fontSize: '11px', background: 'rgba(249, 115, 22, 0.15)', color: 'var(--color-primary)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                            {activeWeekly} h/Woche
                        </span>
                    ) : (
                        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                            Standard ({defaultWeekly} h/W)
                        </span>
                    )}
                </div>
                <div style={{ marginTop: '3px', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                    <span style={{ fontSize: '16px', fontWeight: 700, color: hasCustom ? 'var(--color-primary)' : 'var(--color-text-main)' }}>
                        {monthlyTotal} h
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        Soll ({daysInMonth} Tage / 7 × {activeWeekly}h)
                    </span>
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <div style={{ position: 'relative', width: '110px' }}>
                    <input
                        type="number"
                        step="0.5"
                        min="0"
                        placeholder={`${defaultWeekly}`}
                        value={isEditing ? val : (hasCustom ? customWeekly : '')}
                        onFocus={() => {
                            setIsEditing(true);
                            if (!hasCustom) setVal(defaultWeekly.toString());
                        }}
                        onChange={(e) => setVal(e.target.value)}
                        onBlur={handleBlurOrSave}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                        style={{
                            width: '100%',
                            padding: '8px 46px 8px 10px',
                            borderRadius: '8px',
                            border: hasCustom ? '1px solid var(--color-primary)' : '1px solid #334155',
                            background: '#0f172a',
                            color: hasCustom ? 'var(--color-primary)' : 'white',
                            fontSize: '14px',
                            fontWeight: 600,
                            textAlign: 'right'
                        }}
                    />
                    <span style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', fontSize: '11px', pointerEvents: 'none' }}>
                        h/W
                    </span>
                </div>

                {hasCustom && (
                    <button
                        onClick={onReset}
                        title="Auf Standard-Wochenstunden zurücksetzen"
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
