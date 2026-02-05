import React, { useState } from 'react';
import { useStore } from '../context/StoreContext';
import {
    Trash2, Plus, Clock, Tag, Truck, Hash, MapPin,
    Database, ChevronLeft
} from 'lucide-react';

export default function Settings() {
    const { store, addSettingItem, removeSettingItem } = useStore();
    const [activeScreen, setActiveScreen] = useState(null);

    const goBack = () => setActiveScreen(null);

    if (!activeScreen) {
        return (
            <div className="animate-in slide-in-from-left-5 pb-24 px-4 pt-4">
                <h1 className="text-3xl font-bold mb-6">Einstellungen</h1>

                <h2 className="section-header">Dienstplan</h2>
                <div className="settings-group">
                    <MenuItem
                        icon={Clock}
                        iconColor="#f97316"
                        label="Schichtkürzel & Zeiten"
                        value={`${store.settings.shiftCodes.length} Definiert`}
                        onClick={() => setActiveScreen('codes')}
                    />
                    <MenuItem
                        icon={Tag}
                        iconColor="#38bdf8"
                        label="Schichtarten"
                        value={`${store.settings.shiftTypes.length} Arten`}
                        onClick={() => setActiveScreen('types')}
                        last
                    />
                </div>

                <h2 className="section-header mt-8">Ressourcen</h2>
                <div className="settings-group">
                    <MenuItem
                        icon={MapPin}
                        iconColor="#ef4444"
                        label="Wachen"
                        value={store.settings.stations.length}
                        onClick={() => setActiveScreen('stations')}
                    />
                    <MenuItem
                        icon={Truck}
                        iconColor="#22c55e"
                        label="Fahrzeuge"
                        value={store.settings.vehicles.length}
                        onClick={() => setActiveScreen('vehicles')}
                    />
                    <MenuItem
                        icon={Hash}
                        iconColor="#a855f7"
                        label="Funkrufnamen"
                        value={store.settings.callSigns.length}
                        onClick={() => setActiveScreen('callSigns')}
                        last
                    />
                </div>

                <div className="mt-12 text-center opacity-30">
                    <Database size={32} className="mx-auto mb-2 text-secondary" />
                    <p className="text-xs">Version 2.1 <br /> Cloud Sync Aktiv</p>
                </div>
            </div>
        );
    }

    return (
        <div className="animate-in slide-in-from-right-5 fixed inset-0 bg-app z-50 overflow-y-auto w-full h-full">
            <div className="sticky top-0 bg-app backdrop-blur-md border-b flex items-center justify-between z-10 p-4" style={{ backgroundColor: 'rgba(15, 23, 42, 0.9)' }}>
                <button onClick={goBack} className="text-primary font-medium flex items-center gap-1">
                    <ChevronLeft size={24} /> Einstellungen
                </button>
                <span className="font-bold text-white pr-8">
                    {activeScreen === 'codes' && 'Schichtkürzel'}
                    {activeScreen === 'types' && 'Schichtarten'}
                    {activeScreen === 'stations' && 'Wachen'}
                    {activeScreen === 'vehicles' && 'Fahrzeuge'}
                    {activeScreen === 'callSigns' && 'Funkrufnamen'}
                </span>
                <div className="w-4"></div>
            </div>

            <div className="p-4 safe-area-bottom">
                {activeScreen === 'codes' && (
                    <ShiftCodeManager
                        codes={store.settings.shiftCodes}
                        onAdd={(item) => addSettingItem('shiftCodes', item)}
                        onRemove={(id) => removeSettingItem('shiftCodes', id)}
                    />
                )}
                {activeScreen === 'types' && (
                    <SimpleListManager
                        data={store.settings.shiftTypes}
                        placeholder="Neue Schichtart..."
                        onAdd={(item) => addSettingItem('shiftTypes', item)}
                        onRemove={(id) => removeSettingItem('shiftTypes', id)}
                        type="shiftTypes"
                    />
                )}
                {['stations', 'vehicles', 'callSigns'].includes(activeScreen) && (
                    <SimpleStringListManager
                        data={store.settings[activeScreen]}
                        onAdd={(val) => addSettingItem(activeScreen, val)}
                        onRemove={(val) => removeSettingItem(activeScreen, val)}
                        placeholder="Neuer Eintrag..."
                    />
                )}
            </div>
        </div>
    );
}

function MenuItem({ icon: Icon, label, value, onClick, last, iconColor }) {
    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-4 p-4 bg-surface hover:bg-surface-highlight transition-colors
        ${!last ? 'border-b' : ''}
      `}
        >
            <div className="p-1.5 rounded-md bg-white/5" style={{ color: iconColor }}>
                <Icon size={20} />
            </div>
            <div className="flex-1 text-left">
                <span className="block text-base font-medium text-white">{label}</span>
            </div>
            <div className="flex items-center gap-2 text-secondary">
                <span className="text-sm">{value}</span>
                <ChevronLeft size={16} className="opacity-50 rotate-180" />
            </div>
        </button>
    );
}

function ShiftCodeManager({ codes, onAdd, onRemove }) {
    const [isAdding, setIsAdding] = useState(false);
    const [newCode, setNewCode] = useState('');
    const [newHours, setNewHours] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!newCode.trim() || !newHours) return;
        onAdd({ id: crypto.randomUUID(), code: newCode.trim(), hours: parseFloat(newHours) });
        setNewCode('');
        setNewHours('');
        setIsAdding(false);
    };

    return (
        <div className="space-y-4">
            <div className="bg-surface rounded-xl overflow-hidden divide-y">
                {codes.map(c => (
                    <div key={c.id} className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <span className="bg-primary text-white font-bold px-3 py-1 rounded-md min-w-[3rem] text-center" style={{ backgroundColor: 'rgba(249, 115, 22, 0.2)', color: '#f97316' }}>{c.code}</span>
                            <span className="text-white font-medium">{c.hours} Stunden</span>
                        </div>
                        <button onClick={() => onRemove(c.id)} className="text-danger p-2 rounded-full">
                            <Trash2 size={18} />
                        </button>
                    </div>
                ))}
                {codes.length === 0 && <div className="p-8 text-center text-secondary">Keine Kürzel vorhanden.</div>}
            </div>

            {!isAdding ? (
                <button onClick={() => setIsAdding(true)} className="w-full py-3 bg-primary rounded-xl text-white font-bold flex items-center justify-center gap-2 mt-4">
                    <Plus size={20} /> Neues Kürzel
                </button>
            ) : (
                <form onSubmit={handleSubmit} className="bg-surface rounded-xl p-4 mt-4">
                    <h3 className="text-sm font-bold mb-3">Neues Schichtkürzel</h3>
                    <div className="flex gap-2 mb-3">
                        <input autoFocus placeholder="Kürzel (z.B. T1)" value={newCode} onChange={e => setNewCode(e.target.value)} className="input-field flex-1" />
                        <input type="number" placeholder="Std." value={newHours} onChange={e => setNewHours(e.target.value)} className="input-field w-24 text-center" />
                    </div>
                    <div className="flex gap-2">
                        <button type="button" onClick={() => setIsAdding(false)} className="btn bg-surface-highlight text-secondary flex-1 py-2 rounded-lg">Abbrechen</button>
                        <button type="submit" className="btn bg-primary text-white flex-1 py-2 rounded-lg">Hinzufügen</button>
                    </div>
                </form>
            )}
        </div>
    );
}

function SimpleListManager({ data, placeholder, onAdd, onRemove, type }) {
    const [val, setVal] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!val.trim()) return;
        if (type === 'shiftTypes') onAdd({ id: crypto.randomUUID(), name: val.trim() });
        setVal('');
    };

    return (
        <div className="space-y-4">
            <div className="bg-surface rounded-xl overflow-hidden divide-y">
                {data.map(item => (
                    <div key={item.id} className="p-4 flex items-center justify-between">
                        <span className="text-white font-medium">{item.name}</span>
                        <button onClick={() => onRemove(item.id)} className="text-danger p-2 rounded-full">
                            <Trash2 size={18} />
                        </button>
                    </div>
                ))}
                {data.length === 0 && <div className="p-8 text-center text-secondary">Liste leer.</div>}
            </div>

            <form onSubmit={handleSubmit} className="flex gap-2 mt-4">
                <input
                    value={val}
                    onChange={e => setVal(e.target.value)}
                    placeholder={placeholder}
                    className="input-field flex-1"
                />
                <button type="submit" className="bg-primary text-white p-3 rounded-lg"><Plus size={20} /></button>
            </form>
        </div>
    );
}

function SimpleStringListManager({ data, placeholder, onAdd, onRemove }) {
    const [val, setVal] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!val.trim()) return;
        onAdd(val.trim());
        setVal('');
    };

    return (
        <div className="space-y-4">
            <div className="bg-surface rounded-xl overflow-hidden divide-y">
                {data.map((item, i) => (
                    <div key={i} className="p-4 flex items-center justify-between">
                        <span className="text-white font-medium">{item}</span>
                        <button onClick={() => onRemove(item)} className="text-danger p-2 rounded-full">
                            <Trash2 size={18} />
                        </button>
                    </div>
                ))}
                {data.length === 0 && <div className="p-8 text-center text-secondary">Liste leer.</div>}
            </div>

            <form onSubmit={handleSubmit} className="flex gap-2 mt-4">
                <input
                    value={val}
                    onChange={e => setVal(e.target.value)}
                    placeholder={placeholder}
                    className="input-field flex-1"
                />
                <button type="submit" className="bg-primary text-white p-3 rounded-lg"><Plus size={20} /></button>
            </form>
        </div>
    );
}
