import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import { Save, Clock, MapPin, Ticket, User, Ambulance, Radio } from 'lucide-react';
import { format } from 'date-fns';

export default function Entry() {
    const navigate = useNavigate();
    const { store, addShift } = useStore();
    const today = format(new Date(), 'yyyy-MM-dd');

    const [formData, setFormData] = useState({
        date: today,
        startTime: '07:00',
        endTime: '19:00',
        typeId: store.settings.shiftTypes[0]?.id || '',
        codeId: store.settings.shiftCodes[0]?.id || '',
        station: store.settings.stations[0] || '',
        partner: '',
        vehicle: store.settings.vehicles[0] || '',
        callSign: store.settings.callSigns[0] || ''
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const newShift = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            ...formData
        };
        addShift(newShift);
        navigate('/');
    };

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h1 className="mb-6">Neue Schicht</h1>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Date & Time Section */}
                <section className="glass-panel p-5 space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Clock className="text-[var(--primary)]" size={20} />
                        <h2 className="m-0 text-lg font-semibold">Zeitraum</h2>
                    </div>

                    <div>
                        <label>Datum</label>
                        <input
                            type="date"
                            name="date"
                            value={formData.date}
                            onChange={handleChange}
                            className="input-field"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label>Beginn</label>
                            <input
                                type="time"
                                name="startTime"
                                value={formData.startTime}
                                onChange={handleChange}
                                className="input-field"
                                required
                            />
                        </div>
                        <div>
                            <label>Ende</label>
                            <input
                                type="time"
                                name="endTime"
                                value={formData.endTime}
                                onChange={handleChange}
                                className="input-field"
                                required
                            />
                        </div>
                    </div>
                </section>

                {/* Details Section */}
                <section className="glass-panel p-5 space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Ticket className="text-[var(--accent)]" size={20} />
                        <h2 className="m-0 text-lg font-semibold">Details</h2>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label>Schichtart</label>
                            <select name="typeId" value={formData.typeId} onChange={handleChange} className="input-field">
                                {store.settings.shiftTypes.map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label>Kürzel (Soll)</label>
                            <select name="codeId" value={formData.codeId} onChange={handleChange} className="input-field">
                                {store.settings.shiftCodes.map(c => (
                                    <option key={c.id} value={c.id}>{c.code} ({c.hours}h)</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="flex items-center gap-2"><MapPin size={14} /> Wache</label>
                        <select name="station" value={formData.station} onChange={handleChange} className="input-field">
                            {store.settings.stations.map((s, i) => (
                                <option key={i} value={s}>{s}</option>
                            ))}
                            <option value="other">Andere...</option>
                        </select>
                    </div>
                </section>

                {/* Resources Section */}
                <section className="glass-panel p-5 space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Ambulance className="text-[var(--danger)]" size={20} />
                        <h2 className="m-0 text-lg font-semibold">Ressourcen</h2>
                    </div>

                    <div>
                        <label className="flex items-center gap-2"><User size={14} /> TeampartnerIn</label>
                        <input
                            type="text"
                            name="partner"
                            value={formData.partner}
                            onChange={handleChange}
                            placeholder="Name eingeben"
                            className="input-field"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="flex items-center gap-2"><Ambulance size={14} /> Kennzeichen</label>
                            <select name="vehicle" value={formData.vehicle} onChange={handleChange} className="input-field">
                                {store.settings.vehicles.map((v, i) => <option key={i} value={v}>{v}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="flex items-center gap-2"><Radio size={14} /> Funkrufname</label>
                            <select name="callSign" value={formData.callSign} onChange={handleChange} className="input-field">
                                {store.settings.callSigns.map((c, i) => <option key={i} value={c}>{c}</option>)}
                            </select>
                        </div>
                    </div>
                </section>

                <button type="submit" className="btn btn-primary w-full mt-8">
                    <Save size={20} />
                    Schicht speichern
                </button>
                <div className="h-8"></div>
            </form>
        </div>
    );
}
