import React, { useState } from 'react';
import { useStore } from '../context/StoreContext';
import {
    Trash2, Plus, ChevronDown, ChevronUp, Clock, Tag, Truck, Hash, MapPin,
    Settings as SettingsIcon, LayoutGrid, Database
} from 'lucide-react';

export default function Settings() {
    const { store, addSettingItem, removeSettingItem } = useStore();

    return (
        <div className="animate-in fade-in pb-20">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-surface rounded-xl text-primary">
                    <SettingsIcon size={24} />
                </div>
                <div>
                    <h1 className="text-2xl font-bold mb-0 leading-tight">Einstellungen</h1>
                    <p className="text-secondary text-sm">Verwalte deine Stammdaten</p>
                </div>
            </div>

            <div className="space-y-4">
                {/* Gruppe 1: Schicht-Konfiguration */}
                <h2 className="text-xs font-bold text-tertiary uppercase tracking-wider px-2 mt-6 mb-2">Dienstplan</h2>

                <SettingsAccordion
                    icon={Clock}
                    title="Schichtkürzel & Zeiten"
                    subtitle={`${store.settings.shiftCodes.length} Kürzel definiert`}
                >
                    <ShiftCodeManager
                        codes={store.settings.shiftCodes}
                        onAdd={(item) => addSettingItem('shiftCodes', item)}
                        onRemove={(id) => removeSettingItem('shiftCodes', id)}
                    />
                </SettingsAccordion>

                <SettingsAccordion
                    icon={Tag}
                    title="Schichtarten"
                    subtitle="Tag, Nacht, Bereitschaft..."
                >
                    <SimpleListManager
                        data={store.settings.shiftTypes}
                        placeholder="Bezeichnung (z.B. Tagdienst)"
                        onAdd={(item) => addSettingItem('shiftTypes', item)} // Logic handling needs object creation inside
                        onRemove={(id) => removeSettingItem('shiftTypes', id)}
                        type="shiftTypes"
                    />
                </SettingsAccordion>

                {/* Gruppe 2: Ressourcen */}
                <h2 className="text-xs font-bold text-tertiary uppercase tracking-wider px-2 mt-6 mb-2">Ressourcen</h2>

                <SettingsAccordion
                    icon={MapPin}
                    title="Wachen"
                    subtitle="Standorte deiner Einsätze"
                >
                    <SimpleStringListManager
                        data={store.settings.stations}
                        onAdd={(val) => addSettingItem('stations', val)}
                        onRemove={(val) => removeSettingItem('stations', val)}
                        placeholder="Wachen-Name"
                    />
                </SettingsAccordion>

                <SettingsAccordion
                    icon={Truck}
                    title="Fahrzeuge"
                    subtitle="Einsatzfahrzeuge"
                >
                    <SimpleStringListManager
                        data={store.settings.vehicles}
                        onAdd={(val) => addSettingItem('vehicles', val)}
                        onRemove={(val) => removeSettingItem('vehicles', val)}
                        placeholder="Fahrzeug (z.B. RTW 1)"
                    />
                </SettingsAccordion>

                <SettingsAccordion
                    icon={Hash}
                    title="Funkrufnamen"
                    subtitle="Standard-Rufnamen"
                >
                    <SimpleStringListManager
                        data={store.settings.callSigns}
                        onAdd={(val) => addSettingItem('callSigns', val)}
                        onRemove={(val) => removeSettingItem('callSigns', val)}
                        placeholder="OPTA / Funkrufname"
                    />
                </SettingsAccordion>

                {/* Footer Info */}
                <div className="mt-8 text-center p-6 opacity-40">
                    <Database size={24} className="mx-auto mb-2 text-secondary" />
                    <p className="text-xs">Alle Daten werden sicher in deiner persönlichen Cloud-Datenbank gespeichert.</p>
                </div>
            </div>
        </div>
    );
}

// --- Sub Components ---

function SettingsAccordion({ icon: Icon, title, subtitle, children }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="card overflow-hidden transition-all duration-300 border border-white/5">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-4 text-left"
            >
                <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg transition-colors ${isOpen ? 'bg-primary text-white' : 'bg-surface-highlight text-secondary'}`}>
                        <Icon size={20} />
                    </div>
                    <div>
                        <span className="block font-semibold text-lg">{title}</span>
                        <span className="block text-xs text-secondary">{subtitle}</span>
                    </div>
                </div>
                <div className={`transition-transform duration-300 ${isOpen ? 'rotate-180 text-primary' : 'text-secondary'}`}>
                    <ChevronDown />
                </div>
            </button>

            {/* Content Area */}
            <div className={`
        transition-all duration-300 ease-in-out border-t border-white/5
        ${isOpen ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}
      `}>
                <div className="p-4 bg-black/10">
                    {children}
                </div>
            </div>
        </div>
    );
}

function ShiftCodeManager({ codes, onAdd, onRemove }) {
    const [newCode, setNewCode] = useState('');
    const [newHours, setNewHours] = useState('');

    const handleSubmit = () => {
        if (!newCode.trim() || !newHours) return;
        onAdd({
            id: crypto.randomUUID(),
            code: newCode.trim(),
            hours: parseFloat(newHours)
        });
        setNewCode('');
        setNewHours('');
    };

    return (
        <div>
            <div className="grid grid-cols-[1fr_auto_auto] gap-2 mb-4">
                {codes.map(c => (
                    <React.Fragment key={c.id}>
                        <div className="bg-surface-highlight rounded px-3 py-2 flex items-center font-bold text-white border border-white/5">
                            {c.code}
                        </div>
                        <div className="bg-surface-highlight rounded px-3 py-2 flex items-center text-secondary border border-white/5">
                            {c.hours}h
                        </div>
                        <button onClick={() => onRemove(c.id)} className="p-2 text-danger hover:bg-danger/10 rounded">
                            <Trash2 size={16} />
                        </button>
                    </React.Fragment>
                ))}
                {codes.length === 0 && <div className="col-span-3 text-center text-sm text-secondary italic py-2">Keine Kürzel definiert</div>}
            </div>

            <div className="flex gap-2 p-2 bg-surface rounded-lg">
                <input
                    placeholder="Kürzel (T1)"
                    className="bg-transparent text-white w-full outline-none px-2"
                    value={newCode}
                    onChange={e => setNewCode(e.target.value)}
                />
                <div className="w-px bg-white/10 my-1"></div>
                <input
                    type="number"
                    placeholder="Std."
                    className="bg-transparent text-white w-20 outline-none px-2 text-center"
                    value={newHours}
                    onChange={e => setNewHours(e.target.value)}
                />
                <button onClick={handleSubmit} className="bg-primary hover:bg-primary-dark text-white p-2 rounded-md transition-colors">
                    <Plus size={18} />
                </button>
            </div>
        </div>
    );
}

function SimpleListManager({ data, placeholder, onAdd, onRemove, type }) {
    const [val, setVal] = useState('');

    const handleAdd = () => {
        if (!val.trim()) return;
        // For object based lists (ShiftTypes)
        if (type === 'shiftTypes') {
            onAdd({ id: crypto.randomUUID(), name: val.trim() });
        }
        setVal('');
    };

    return (
        <div>
            <div className="space-y-2 mb-4">
                {data.map(item => (
                    <div key={item.id} className="flex justify-between items-center bg-surface-highlight border border-white/5 rounded px-3 py-2">
                        <span>{item.name}</span>
                        <button onClick={() => onRemove(item.id)} className="text-danger hover:bg-danger/10 p-1.5 rounded">
                            <Trash2 size={16} />
                        </button>
                    </div>
                ))}
                {data.length === 0 && <div className="text-center text-sm text-secondary italic">Keine Einträge</div>}
            </div>
            <div className="flex gap-2 bg-surface p-2 rounded-lg">
                <input
                    placeholder={placeholder}
                    className="bg-transparent text-white w-full outline-none px-2"
                    value={val}
                    onChange={e => setVal(e.target.value)}
                />
                <button onClick={handleAdd} className="bg-primary hover:bg-primary-dark text-white p-2 rounded-md transition-colors">
                    <Plus size={18} />
                </button>
            </div>
        </div>
    );
}

function SimpleStringListManager({ data, placeholder, onAdd, onRemove }) {
    const [val, setVal] = useState('');

    const handleAdd = () => {
        if (!val.trim()) return;
        onAdd(val.trim());
        setVal('');
    };

    return (
        <div>
            <div className="flex flex-wrap gap-2 mb-4">
                {data.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 bg-surface-highlight border border-white/5 text-sm rounded-full px-3 py-1.5 pl-4">
                        {item}
                        <button onClick={() => onRemove(item)} className="text-secondary hover:text-danger">
                            <Trash2 size={12} />
                        </button>
                    </div>
                ))}
                {data.length === 0 && <div className="text-center text-sm text-secondary italic w-full">Keine Einträge</div>}
            </div>
            <div className="flex gap-2 bg-surface p-2 rounded-lg">
                <input
                    placeholder={placeholder}
                    className="bg-transparent text-white w-full outline-none px-2"
                    value={val}
                    onChange={e => setVal(e.target.value)}
                />
                <button onClick={handleAdd} className="bg-primary hover:bg-primary-dark text-white p-2 rounded-md transition-colors">
                    <Plus size={18} />
                </button>
            </div>
        </div>
    );
}
