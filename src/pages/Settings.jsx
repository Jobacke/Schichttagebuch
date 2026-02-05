import React, { useState } from 'react';
import { useStore } from '../context/StoreContext';
import {
    Plus, Clock, Tag, Truck, Hash, MapPin,
    Database, ChevronLeft, ChevronRight, Trash2
} from 'lucide-react';

export default function Settings() {
    const { store, addSettingItem, removeSettingItem } = useStore();
    const [activeScreen, setActiveScreen] = useState(null);

    const goBack = () => setActiveScreen(null);

    if (activeScreen) {
        return (
            <DetailScreen
                title={
                    activeScreen === 'codes' ? 'Schichtkürzel' :
                        activeScreen === 'types' ? 'Schichtarten' :
                            activeScreen === 'stations' ? 'Wachen' :
                                activeScreen === 'vehicles' ? 'Fahrzeuge' : 'Funkrufnamen'
                }
                onBack={goBack}
            >
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
                <small>Cloud Sync Aktiv • v2.2</small>
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
