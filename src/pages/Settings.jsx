import React, { useState } from 'react';
import { useStore } from '../context/StoreContext';
import {
    Trash2, Plus, ArrowRight, Clock, Tag, Truck, Hash, MapPin,
    Settings as SettingsIcon, Database, X, Check
} from 'lucide-react';

export default function Settings() {
    const { store, addSettingItem, removeSettingItem } = useStore();
    const [activeScreen, setActiveScreen] = useState(null); // null = Main, 'codes', 'types', 'stations', 'vehicles', 'callSigns'

    const goBack = () => setActiveScreen(null);

    // --- Main Menu ---
    if (!activeScreen) {
        return (
            <div className="animate-in slide-in-from-left-5 pb-24">
                <h1 className="text-3xl font-bold mb-6">Einstellungen</h1>

                {/* Dienstplan Section */}
                <h2 className="section-header">Dienstplan</h2>
                <div className="settings-group">
                    <MenuItem
                        icon={Clock}
                        color="text-orange-500"
                        label="Schichtkürzel & Zeiten"
                        value={`${store.settings.shiftCodes.length} Definiert`}
                        onClick={() => setActiveScreen('codes')}
                    />
                    <MenuItem
                        icon={Tag}
                        color="text-blue-400"
                        label="Schichtarten"
                        value={`${store.settings.shiftTypes.length} Arten`}
                        onClick={() => setActiveScreen('types')}
                        last
                    />
                </div>

                {/* Ressourcen Section */}
                <h2 className="section-header mt-8">Ressourcen</h2>
                <div className="settings-group">
                    <MenuItem
                        icon={MapPin}
                        color="text-red-400"
                        label="Wachen"
                        value={store.settings.stations.length}
                        onClick={() => setActiveScreen('stations')}
                    />
                    <MenuItem
                        icon={Truck}
                        color="text-emerald-400"
                        label="Fahrzeuge"
                        value={store.settings.vehicles.length}
                        onClick={() => setActiveScreen('vehicles')}
                    />
                    <MenuItem
                        icon={Hash}
                        color="text-purple-400"
                        label="Funkrufnamen"
                        value={store.settings.callSigns.length}
                        onClick={() => setActiveScreen('callSigns')}
                        last
                    />
                </div>

                {/* Footer Info */}
                <div className="mt-12 text-center opacity-30">
                    <Database size={32} className="mx-auto mb-2 text-secondary" />
                    <p className="text-xs">Version 2.1 <br /> Cloud Sync Aktiv</p>
                </div>
            </div>
        );
    }

    // --- Detail Screens ---
    return (
        <div className="animate-in slide-in-from-right-5 fixed inset-0 bg-app z-50 overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-app/80 backdrop-blur-md border-b border-white/5 p-4 flex items-center justify-between z-10">
                <button onClick={goBack} className="text-primary font-medium flex items-center gap-1">
                    <ChevronLeftIcon /> Einstellungen
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

// --- Icons ---
const ChevronLeftIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
);

// --- Components ---

function MenuItem({ icon: Icon, label, value, onClick, last, color }) {
    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-4 p-4 bg-surface hover:bg-surface-highlight transition-colors
        ${!last ? 'border-b border-white/5' : ''}
        first:rounded-t-xl last:rounded-b-xl
      `}
        >
            <div className={`p-1.5 rounded-md ${color} bg-white/5`}>
                <Icon size={20} />
            </div>
            <div className="flex-1 text-left">
                <span className="block text-base font-medium text-white">{label}</span>
            </div>
            <div className="flex items-center gap-2 text-secondary">
                <span className="text-sm">{value}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-50"><path d="M9 18l6-6-6-6" /></svg>
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
            {/* List */}
            <div className="bg-surface rounded-xl overflow-hidden divide-y divide-white/5">
                {codes.map(c => (
                    <div key={c.id} className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <span className="bg-primary/20 text-primary font-bold px-3 py-1 rounded-md min-w-[3rem] text-center">{c.code}</span>
                            <span className="text-white font-medium">{c.hours} Stunden</span>
                        </div>
                        <button onClick={() => onRemove(c.id)} className="text-danger p-2 hover:bg-danger/10 rounded-full">
                            <Trash2 size={18} />
                        </button>
                    </div>
                ))}
                {codes.length === 0 && <div className="p-8 text-center text-secondary">Keine Kürzel vorhanden.</div>}
            </div>

            {/* Add Button / Form */}
            {!isAdding ? (
                <button onClick={() => setIsAdding(true)} className="w-full py-3 bg-primary rounded-xl text-white font-bold flex items-center justify-center gap-2">
                    <Plus size={20} /> Neues Kürzel
                </button>
            ) : (
                <form onSubmit={handleSubmit} className="bg-surface rounded-xl p-4 animate-in fade-in zoom-in-95">
                    <h3 className="text-sm font-bold mb-3">Neues Schichtkürzel</h3>
                    <div className="flex gap-2 mb-3">
                        <input autoFocus placeholder="Kürzel (z.B. T1)" value={newCode} onChange={e => setNewCode(e.target.value)} className="input-field flex-1" />
                        <input type="number" placeholder="Std." value={newHours} onChange={e => setNewHours(e.target.value)} className="input-field w-24 text-center" />
                    </div>
                    <div className="flex gap-2">
                        <button type="button" onClick={() => setIsAdding(false)} className="btn bg-surface-highlight text-secondary flex-1 py-2">Abbrechen</button>
                        <button type="submit" className="btn btn-primary flex-1 py-2">Hinzufügen</button>
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
            <div className="bg-surface rounded-xl overflow-hidden divide-y divide-white/5">
                {data.map(item => (
                    <div key={item.id} className="p-4 flex items-center justify-between">
                        <span className="text-white font-medium">{item.name}</span>
                        <button onClick={() => onRemove(item.id)} className="text-danger p-2 hover:bg-danger/10 rounded-full">
                            <Trash2 size={18} />
                        </button>
                    </div>
                ))}
                {data.length === 0 && <div className="p-8 text-center text-secondary">Liste leer.</div>}
            </div>

            <form onSubmit={handleSubmit} className="flex gap-2">
                <input
                    value={val}
                    onChange={e => setVal(e.target.value)}
                    placeholder={placeholder}
                    className="input-field flex-1"
                />
                <button type="submit" className="bg-primary text-white p-3 rounded-lg"><Plus /></button>
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
            <div className="bg-surface rounded-xl overflow-hidden divide-y divide-white/5">
                {data.map((item, i) => (
                    <div key={i} className="p-4 flex items-center justify-between">
                        <span className="text-white font-medium">{item}</span>
                        <button onClick={() => onRemove(item)} className="text-danger p-2 hover:bg-danger/10 rounded-full">
                            <Trash2 size={18} />
                        </button>
                    </div>
                ))}
                {data.length === 0 && <div className="p-8 text-center text-secondary">Liste leer.</div>}
            </div>

            <form onSubmit={handleSubmit} className="flex gap-2">
                <input
                    value={val}
                    onChange={e => setVal(e.target.value)}
                    placeholder={placeholder}
                    className="input-field flex-1"
                />
                <button type="submit" className="bg-primary text-white p-3 rounded-lg"><Plus /></button>
            </form>
        </div>
    );
}
