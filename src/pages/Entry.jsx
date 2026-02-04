import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import { Save, Clock, MapPin, Truck, ChevronLeft } from 'lucide-react';
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

    const handleChipSelect = (name, value) => {
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
        <div className="animate-in slide-in-from-bottom-5">
            <div className="flex items-center gap-2 mb-6">
                <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-secondary"><ChevronLeft /></button>
                <h1 className="mb-0">Neue Schicht</h1>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">

                {/* Date & Time Card */}
                <section className="card">
                    <div className="flex items-center gap-2 mb-4 text-primary">
                        <Clock size={18} />
                        <h2 className="mb-0 text-base">Zeitraum</h2>
                    </div>

                    <div className="input-wrapper">
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
                        <div className="input-wrapper">
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
                        <div className="input-wrapper">
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

                {/* Shift Type Chips */}
                <section className="card">
                    <label>Schichtart</label>
                    <div className="chip-grid mb-4">
                        {store.settings.shiftTypes.map(t => (
                            <div
                                key={t.id}
                                className={`chip ${formData.typeId === t.id ? 'active' : ''}`}
                                onClick={() => handleChipSelect('typeId', t.id)}
                            >
                                {t.name}
                            </div>
                        ))}
                    </div>

                    <label>Kürzel (Sollzeit)</label>
                    <div className="chip-grid">
                        {store.settings.shiftCodes.map(c => (
                            <div
                                key={c.id}
                                className={`chip ${formData.codeId === c.id ? 'active' : ''}`}
                                onClick={() => handleChipSelect('codeId', c.id)}
                            >
                                {c.code} <span className="opacity-60 text-xs">({c.hours}h)</span>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Resources Card */}
                <section className="card">
                    <div className="flex items-center gap-2 mb-4 text-secondary">
                        <Truck size={18} />
                        <h2 className="mb-0 text-base">Einsatzmittel</h2>
                    </div>

                    <div className="input-wrapper">
                        <label>Wache</label>
                        <select name="station" value={formData.station} onChange={handleChange} className="input-field">
                            {store.settings.stations.map((s, i) => <option key={i} value={s}>{s}</option>)}
                        </select>
                    </div>

                    <div className="input-wrapper">
                        <label>Fahrzeug & Kennzeichen</label>
                        <select name="vehicle" value={formData.vehicle} onChange={handleChange} className="input-field mb-2">
                            {store.settings.vehicles.map((v, i) => <option key={i} value={v}>{v}</option>)}
                        </select>
                        <select name="callSign" value={formData.callSign} onChange={handleChange} className="input-field">
                            {store.settings.callSigns.map((c, i) => <option key={i} value={c}>{c}</option>)}
                        </select>
                    </div>

                    <div className="input-wrapper">
                        <label>PartnerIn</label>
                        <input
                            type="text"
                            name="partner"
                            value={formData.partner}
                            onChange={handleChange}
                            placeholder="Name..."
                            className="input-field"
                        />
                    </div>
                </section>

                <button type="submit" className="btn btn-primary mb-8">
                    <Save size={20} />
                    <span>Speichern</span>
                </button>
            </form>
        </div>
    );
}
