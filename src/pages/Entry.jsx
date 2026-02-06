import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import { APP_VERSION } from '../version';

export default function Entry() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const editId = searchParams.get('id');
    const { store, addShift, deleteShift } = useStore();

    const today = new Date().toISOString().split('T')[0];

    const [formData, setFormData] = useState({
        date: today,
        startTime: '07:00',
        endTime: '19:00',
        typeId: '',
        codeId: '',
        station: '',
        partner: '',
        vehicle: '',
        callSign: ''
    });

    // Load existing data if editing
    useEffect(() => {
        if (editId && store.shifts.length > 0) {
            const shiftToEdit = store.shifts.find(s => s.id === editId);
            if (shiftToEdit) {
                setFormData(shiftToEdit);
            }
        } else {
            // Set defaults only for new entries
            if (store.settings.shiftTypes.length > 0 && !formData.typeId) {
                setFormData(prev => ({
                    ...prev,
                    typeId: store.settings.shiftTypes[0]?.id,
                    codeId: store.settings.shiftCodes[0]?.id,
                    station: store.settings.stations[0],
                    vehicle: store.settings.vehicles[0],
                    callSign: store.settings.callSigns[0]
                }));
            }
        }
    }, [editId, store.shifts, store.settings]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleChipSelect = (name, value) => {
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const shiftData = {
            ...formData,
            id: editId || crypto.randomUUID(),
            timestamp: editId ? formData.timestamp : Date.now()
        };
        addShift(shiftData);
        navigate('/');
    };

    const handleDelete = () => {
        if (confirm('Möchtest du diesen Eintrag wirklich unwiderruflich löschen?')) {
            deleteShift(editId);
            navigate('/');
        }
    };

    return (
        <div className="page-content">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                        {editId ? 'Eintrag bearbeiten' : 'Neue Schicht'}
                        <span style={{ fontSize: '12px', color: 'var(--color-primary)', background: 'rgba(249, 115, 22, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>v{APP_VERSION}</span>
                    </h1>
                    <div className="subtitle" style={{ margin: '4px 0 0 0' }}>
                        {editId ? 'Änderungen vornehmen' : 'Dienst erfassen'}
                    </div>
                </div>
                {editId && (
                    <button
                        onClick={handleDelete}
                        style={{
                            padding: '10px',
                            background: 'rgba(239, 68, 68, 0.1)',
                            color: 'var(--color-danger)',
                            border: 'none',
                            borderRadius: '12px',
                            cursor: 'pointer',
                            fontSize: '24px'
                        }}
                    >
                        🗑️
                    </button>
                )}
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* Date & Time Card */}
                <div className="card-premium">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                        <span style={{ fontSize: '18px' }}>🕐</span>
                        <h3 className="text-label" style={{ margin: 0 }}>Zeitraum</h3>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <label className="text-label" style={{ marginBottom: '8px' }}>Datum</label>
                        <input
                            type="date"
                            name="date"
                            value={formData.date}
                            onChange={handleChange}
                            className="input-premium"
                            style={{ width: '100%' }}
                            required
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                            <label className="text-label" style={{ marginBottom: '8px' }}>Beginn</label>
                            <input
                                type="time"
                                name="startTime"
                                value={formData.startTime}
                                onChange={handleChange}
                                className="input-premium"
                                style={{ width: '100%' }}
                                required
                            />
                        </div>
                        <div>
                            <label className="text-label" style={{ marginBottom: '8px' }}>Ende</label>
                            <input
                                type="time"
                                name="endTime"
                                value={formData.endTime}
                                onChange={handleChange}
                                className="input-premium"
                                style={{ width: '100%' }}
                                required
                            />
                        </div>
                    </div>
                </div>

                {/* Shift Type Card */}
                <div className="card-premium">
                    <div style={{ marginBottom: '16px' }}>
                        <label className="text-label" style={{ marginBottom: '8px' }}>Schichtart</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {store.settings.shiftTypes.map(t => (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => handleChipSelect('typeId', t.id)}
                                    className={`filter-chip ${formData.typeId === t.id ? 'active' : ''}`}
                                >
                                    {t.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="text-label" style={{ marginBottom: '8px' }}>Kürzel (Sollzeit)</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {store.settings.shiftCodes.map(c => (
                                <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => handleChipSelect('codeId', c.id)}
                                    className={`filter-chip ${formData.codeId === c.id ? 'active' : ''}`}
                                >
                                    {c.code} <span style={{ opacity: 0.6, fontSize: '11px' }}>({c.hours}h)</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Resources Card */}
                <div className="card-premium">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                        <span style={{ fontSize: '18px' }}>🚑</span>
                        <h3 className="text-label" style={{ margin: 0 }}>Einsatzmittel</h3>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <label className="text-label" style={{ marginBottom: '8px' }}>Wache</label>
                        <select
                            name="station"
                            value={formData.station}
                            onChange={handleChange}
                            className="input-premium"
                            style={{ width: '100%' }}
                        >
                            {store.settings.stations.map((s, i) => <option key={i} value={s}>{s}</option>)}
                        </select>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <label className="text-label" style={{ marginBottom: '8px' }}>Fahrzeug & Kennzeichen</label>
                        <select
                            name="vehicle"
                            value={formData.vehicle}
                            onChange={handleChange}
                            className="input-premium"
                            style={{ width: '100%', marginBottom: '8px' }}
                        >
                            {store.settings.vehicles.map((v, i) => <option key={i} value={v}>{v}</option>)}
                        </select>
                        <select
                            name="callSign"
                            value={formData.callSign}
                            onChange={handleChange}
                            className="input-premium"
                            style={{ width: '100%' }}
                        >
                            {store.settings.callSigns.map((c, i) => <option key={i} value={c}>{c}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="text-label" style={{ marginBottom: '8px' }}>PartnerIn</label>
                        <input
                            type="text"
                            name="partner"
                            value={formData.partner}
                            onChange={handleChange}
                            placeholder="Name..."
                            className="input-premium"
                            style={{ width: '100%' }}
                        />
                    </div>
                </div>

                <button type="submit" className="btn-primary" style={{ width: '100%', padding: '14px', fontSize: '16px', fontWeight: '600', marginTop: '8px' }}>
                    💾 {editId ? 'Änderungen speichern' : 'Speichern'}
                </button>
            </form>
        </div>
    );
}
