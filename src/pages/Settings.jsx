import React, { useState } from 'react';
import { useStore } from '../context/StoreContext';
import { Plus, Trash, Save, X } from 'lucide-react';

export default function Settings() {
    const { store, addSettingItem, removeSettingItem } = useStore();
    const [activeSection, setActiveSection] = useState(null);

    // Helper forms state
    const [newType, setNewType] = useState('');
    const [newCode, setNewCode] = useState({ code: '', hours: 12 });
    const [newVehicle, setNewVehicle] = useState('');
    const [newCallSign, setNewCallSign] = useState('');
    const [newStation, setNewStation] = useState('');

    const renderSection = (title, items, renderItem, renderForm) => (
        <div className="glass-panel p-4 mb-6">
            <h3 className="text-lg font-bold mb-4 flex justify-between items-center">
                {title}
                <span className="text-xs bg-white/10 px-2 py-1 rounded-full">{items.length}</span>
            </h3>
            <div className="space-y-2 mb-4 max-h-[200px] overflow-y-auto">
                {items.map((item, idx) => (
                    <div key={item.id || item} className="flex justify-between items-center bg-[var(--bg-dark)]/50 p-3 rounded-lg">
                        {renderItem(item)}
                        <button
                            onClick={() => {
                                if (confirm('Wirklich löschen?')) {
                                    // Determine proper ID or Value to delete
                                    const idToRemove = item.id || item;
                                    // Needs to map title to store key... actually I'll pass the key directly
                                    // This is a bit tricky with the generic renderer, I'll hardcode the key in the call
                                }
                            }}
                            className="text-[var(--danger)]/80 hover:text-[var(--danger)] p-1"
                        >
                            <Trash size={16} />
                        </button>
                    </div>
                ))}
            </div>
            {renderForm}
        </div>
    );

    return (
        <div className="animate-in fade-in slide-in-from-right-4 duration-500 pb-10">
            <h1 className="mb-6">Einstellungen</h1>

            {/* Shift Codes (Complex) */}
            <div className="glass-panel p-4 mb-6">
                <h3 className="font-bold mb-4">Schichtkürzel & Sollzeit</h3>
                <div className="space-y-2 mb-4">
                    {store.settings.shiftCodes.map(c => (
                        <div key={c.id} className="flex justify-between items-center bg-[color-mix(in_srgb,var(--bg-dark),transparent_50%)] p-3 rounded-lg">
                            <div>
                                <span className="font-bold text-[var(--primary)]">{c.code}</span>
                                <span className="ml-2 text-sm text-[var(--text-muted)]">{c.hours}h</span>
                            </div>
                            <button onClick={() => removeSettingItem('shiftCodes', c.id)} className="text-red-400"><Trash size={16} /></button>
                        </div>
                    ))}
                </div>
                <div className="flex gap-2">
                    <input
                        placeholder="Kürzel (z.B. T1)"
                        value={newCode.code}
                        onChange={e => setNewCode({ ...newCode, code: e.target.value })}
                        className="input-field w-24"
                    />
                    <input
                        type="number"
                        placeholder="Std"
                        value={newCode.hours}
                        onChange={e => setNewCode({ ...newCode, hours: parseFloat(e.target.value) })}
                        className="input-field w-20"
                    />
                    <button
                        onClick={() => {
                            if (newCode.code) {
                                addSettingItem('shiftCodes', { id: crypto.randomUUID(), ...newCode });
                                setNewCode({ code: '', hours: 12 });
                            }
                        }}
                        className="btn btn-primary p-2"
                    ><Plus size={20} /></button>
                </div>
            </div>

            {/* Shift Types */}
            <div className="glass-panel p-4 mb-6">
                <h3 className="font-bold mb-4">Schichtarten</h3>
                <div className="space-y-2 mb-4">
                    {store.settings.shiftTypes.map(t => (
                        <div key={t.id} className="flex justify-between items-center bg-[color-mix(in_srgb,var(--bg-dark),transparent_50%)] p-3 rounded-lg">
                            <span>{t.name}</span>
                            <button onClick={() => removeSettingItem('shiftTypes', t.id)} className="text-red-400"><Trash size={16} /></button>
                        </div>
                    ))}
                </div>
                <div className="flex gap-2">
                    <input
                        placeholder="Neu (z.B. Tagdienst)"
                        value={newType}
                        onChange={e => setNewType(e.target.value)}
                        className="input-field"
                    />
                    <button
                        onClick={() => {
                            if (newType) {
                                addSettingItem('shiftTypes', { id: crypto.randomUUID(), name: newType });
                                setNewType('');
                            }
                        }}
                        className="btn btn-primary p-2"
                    ><Plus size={20} /></button>
                </div>
            </div>

            {/* Vehicles (String Array) */}
            <SimpleStringList
                title="Fahrzeuge"
                data={store.settings.vehicles}
                onAdd={val => addSettingItem('vehicles', val)}
                onRemove={val => removeSettingItem('vehicles', val)}
            />

            {/* CallSigns (String Array) */}
            <SimpleStringList
                title="Funkrufnamen"
                data={store.settings.callSigns}
                onAdd={val => addSettingItem('callSigns', val)}
                onRemove={val => removeSettingItem('callSigns', val)}
            />

            {/* Stations (String Array) */}
            <SimpleStringList
                title="Wachen"
                data={store.settings.stations}
                onAdd={val => addSettingItem('stations', val)}
                onRemove={val => removeSettingItem('stations', val)}
            />
        </div>
    );
}

function SimpleStringList({ title, data, onAdd, onRemove }) {
    const [val, setVal] = useState('');
    return (
        <div className="glass-panel p-4 mb-6">
            <h3 className="font-bold mb-4">{title}</h3>
            <div className="space-y-2 mb-4 max-h-[150px] overflow-y-auto">
                {data.map((item, i) => (
                    <div key={i} className="flex justify-between items-center bg-[color-mix(in_srgb,var(--bg-dark),transparent_50%)] p-3 rounded-lg">
                        <span>{item}</span>
                        <button onClick={() => onRemove(item)} className="text-red-400"><Trash size={16} /></button>
                    </div>
                ))}
            </div>
            <div className="flex gap-2">
                <input
                    placeholder="Neu..."
                    value={val}
                    onChange={e => setVal(e.target.value)}
                    className="input-field"
                />
                <button
                    onClick={() => { if (val) { onAdd(val); setVal(''); } }}
                    className="btn btn-primary p-2"
                ><Plus size={20} /></button>
            </div>
        </div>
    );
}
