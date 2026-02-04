import React, { useState } from 'react';
import { useStore } from '../context/StoreContext';
import { Trash2, Plus, Save, Clock, Truck, Hash, MapPin, Tag } from 'lucide-react';

export default function Settings() {
    const { store, addSettingItem, removeSettingItem } = useStore();

    // Local state for inputs
    const [newCode, setNewCode] = useState({ code: '', hours: '' });
    const [newType, setNewType] = useState('');
    const [newVehicle, setNewVehicle] = useState('');
    const [newCallSign, setNewCallSign] = useState('');
    const [newStation, setNewStation] = useState('');

    // Generic Add Handler
    const handleAddString = (category, value, setter) => {
        if (!value.trim()) return;
        addSettingItem(category, value.trim());
        setter('');
    };

    const handleAddCode = () => {
        if (!newCode.code.trim() || !newCode.hours) return;
        addSettingItem('shiftCodes', {
            id: crypto.randomUUID(),
            code: newCode.code.trim(),
            hours: parseFloat(newCode.hours)
        });
        setNewCode({ code: '', hours: '' });
    };

    const handleAddType = () => {
        if (!newType.trim()) return;
        addSettingItem('shiftTypes', {
            id: crypto.randomUUID(),
            name: newType.trim()
        });
        setNewType('');
    };

    return (
        <div className="animate-in slide-in-from-right-4">
            <h1 className="mb-6">Einstellungen</h1>

            {/* --- Schichtkürzel --- */}
            <section className="card mb-6">
                <div className="flex items-center gap-2 mb-4 text-primary">
                    <Clock size={20} />
                    <h2 className="mb-0 text-lg">Schichtkürzel & Zeiten</h2>
                </div>

                <div className="space-y-3 mb-6">
                    {store.settings.shiftCodes.map(item => (
                        <div key={item.id} className="flex-between bg-app p-3 rounded-lg border border-surface-highlight">
                            <div className="flex items-center gap-3">
                                <div className="bg-surface font-bold px-3 py-1 rounded text-primary">{item.code}</div>
                                <span className="text-sm text-secondary">{item.hours} Std.</span>
                            </div>
                            <button
                                onClick={() => removeSettingItem('shiftCodes', item.id)}
                                className="text-danger p-2 hover:bg-surface rounded-full transition-colors"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    ))}
                </div>

                <div className="flex gap-3 items-end">
                    <div className="flex-1 input-wrapper mb-0">
                        <label>Kürzel</label>
                        <input
                            placeholder="z.B. T1"
                            value={newCode.code}
                            onChange={e => setNewCode({ ...newCode, code: e.target.value })}
                            className="input-field"
                        />
                    </div>
                    <div className="w-24 input-wrapper mb-0">
                        <label>Stunden</label>
                        <input
                            type="number"
                            placeholder="12"
                            value={newCode.hours}
                            onChange={e => setNewCode({ ...newCode, hours: e.target.value })}
                            className="input-field"
                        />
                    </div>
                    <button onClick={handleAddCode} className="btn btn-primary w-auto aspect-square p-0 flex-center">
                        <Plus size={24} />
                    </button>
                </div>
            </section>

            {/* --- Schichtarten --- */}
            <section className="card mb-6">
                <div className="flex items-center gap-2 mb-4 text-secondary">
                    <Tag size={20} />
                    <h2 className="mb-0 text-lg">Schichtarten</h2>
                </div>

                <div className="space-y-3 mb-6">
                    {store.settings.shiftTypes.map(item => (
                        <div key={item.id} className="flex-between bg-app p-3 rounded-lg border border-surface-highlight">
                            <span className="font-medium">{item.name}</span>
                            <button
                                onClick={() => removeSettingItem('shiftTypes', item.id)}
                                className="text-danger p-2 hover:bg-surface rounded-full transition-colors"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    ))}
                </div>

                <div className="flex gap-3 items-end">
                    <div className="flex-1 input-wrapper mb-0">
                        <label>Bezeichnung</label>
                        <input
                            placeholder="z.B. Tagdienst"
                            value={newType}
                            onChange={e => setNewType(e.target.value)}
                            className="input-field"
                        />
                    </div>
                    <button onClick={handleAddType} className="btn btn-primary w-auto aspect-square p-0 flex-center">
                        <Plus size={24} />
                    </button>
                </div>
            </section>

            {/* --- Resources Wrapper --- */}
            <h3 className="text-secondary text-sm font-bold uppercase tracking-wider mb-4 mt-8 px-2">Ressourcen</h3>

            {/* Vehicles */}
            <StringListSection
                icon={Truck}
                title="Fahrzeuge"
                data={store.settings.vehicles}
                value={newVehicle}
                setValue={setNewVehicle}
                onAdd={() => handleAddString('vehicles', newVehicle, setNewVehicle)}
                onRemove={(item) => removeSettingItem('vehicles', item)}
                placeholder="z.B. R-RTW-1"
            />

            {/* Call Signs */}
            <StringListSection
                icon={Hash}
                title="Funkrufnamen"
                data={store.settings.callSigns}
                value={newCallSign}
                setValue={setNewCallSign}
                onAdd={() => handleAddString('callSigns', newCallSign, setNewCallSign)}
                onRemove={(item) => removeSettingItem('callSigns', item)}
                placeholder="z.B. Florian 1/83/1"
            />

            {/* Stations */}
            <StringListSection
                icon={MapPin}
                title="Wachen"
                data={store.settings.stations}
                value={newStation}
                setValue={setNewStation}
                onAdd={() => handleAddString('stations', newStation, setNewStation)}
                onRemove={(item) => removeSettingItem('stations', item)}
                placeholder="z.B. Hauptwache"
            />

            <div className="h-20"></div>
        </div>
    );
}

// Sub-Component for simple string lists
function StringListSection({ icon: Icon, title, data, value, setValue, onAdd, onRemove, placeholder }) {
    return (
        <section className="card mb-4">
            <div className="flex items-center gap-2 mb-4 text-secondary">
                <Icon size={18} />
                <h2 className="mb-0 text-base">{title}</h2>
            </div>

            <div className="flex flex-wrap gap-2 mb-6">
                {data.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 bg-app px-3 py-2 rounded-lg border border-surface-highlight text-sm">
                        <span>{item}</span>
                        <button
                            onClick={() => onRemove(item)}
                            className="text-white/40 hover:text-danger ml-1 transition-colors"
                            title="Löschen"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                ))}
            </div>

            <div className="flex gap-3 items-end">
                <div className="flex-1 input-wrapper mb-0">
                    <input
                        placeholder={placeholder}
                        value={value}
                        onChange={e => setValue(e.target.value)}
                        className="input-field"
                    />
                </div>
                <button onClick={onAdd} className="btn btn-primary w-auto aspect-square p-0 flex-center">
                    <Plus size={24} />
                </button>
            </div>
        </section>
    );
}
