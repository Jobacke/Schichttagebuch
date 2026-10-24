import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import { APP_VERSION } from '../version';
import { SHIFT_PRESETS } from '../utils/shiftPresets';
import { getPartnersForShiftFromRoster } from '../utils/teamRosterParser';

export default function Entry() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const editId = searchParams.get('id');
    const { store, addShift, deleteShift } = useStore();

    const today = new Date().toISOString().split('T')[0];

    const shiftPresets = SHIFT_PRESETS;


    const defaultBonus = store.settings?.defaultBonusAmount ?? 75;

    const [formData, setFormData] = useState({
        date: today,
        startTime: '07:00',
        endTime: '19:00',
        typeId: '',
        codeId: '',
        station: '',
        partner: '',
        vehicle: '',
        callSign: '',
        hasBonus: false,
        bonusAmount: defaultBonus
    });

    // Track whether a preset is active (to disable certain fields)
    const [isPresetActive, setIsPresetActive] = useState(false);

    // Load existing data if editing
    useEffect(() => {
        if (editId && store.shifts.length > 0) {
            const shiftToEdit = store.shifts.find(s => s.id === editId);
            if (shiftToEdit) {
                const codeObj = (store.settings?.shiftCodes || []).find(c => c.id === shiftToEdit.codeId || c.code === shiftToEdit.code);
                const codeStr = shiftToEdit.code || codeObj?.code || '';
                const autoPartner = (!shiftToEdit.partner || !shiftToEdit.partner.trim())
                    ? getPartnersForShiftFromRoster(shiftToEdit.date, codeStr)
                    : shiftToEdit.partner;

                setFormData({
                    ...shiftToEdit,
                    partner: autoPartner || '',
                    hasBonus: Boolean(shiftToEdit.hasBonus),
                    bonusAmount: shiftToEdit.bonusAmount !== undefined && shiftToEdit.bonusAmount !== null
                        ? shiftToEdit.bonusAmount
                        : (store.settings?.defaultBonusAmount ?? 75)
                });
            }
        } else {
            // Set defaults only for new entries
            if (store.settings.shiftTypes.length > 0 && !formData.typeId) {
                const firstCode = store.settings.shiftCodes[0];
                const autoPartner = firstCode ? getPartnersForShiftFromRoster(today, firstCode.code) : '';
                setFormData(prev => ({
                    ...prev,
                    typeId: store.settings.shiftTypes[0]?.id,
                    codeId: firstCode?.id,
                    station: store.settings.stations[0],
                    vehicle: store.settings.vehicles[0],
                    callSign: store.settings.callSigns[0],
                    partner: prev.partner || autoPartner || '',
                    bonusAmount: store.settings?.defaultBonusAmount ?? 75
                }));
            }
        }
    }, [editId, store.shifts, store.settings]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name === 'date') {
            const selectedCode = store.settings.shiftCodes.find(c => c.id === formData.codeId);
            const codeStr = selectedCode ? selectedCode.code : (formData.code || '');
            const autoPartner = codeStr ? getPartnersForShiftFromRoster(value, codeStr) : '';
            setFormData(prev => ({
                ...prev,
                date: value,
                partner: (!prev.partner || prev.partner.startsWith('mit ')) ? (autoPartner || prev.partner) : prev.partner
            }));
            return;
        }
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleChipSelect = (name, value) => {
        // Wenn ein Schicht-Kürzel ausgewählt wird, prüfe ob es ein Preset gibt
        if (name === 'codeId') {
            const selectedCode = store.settings.shiftCodes.find(c => c.id === value);
            if (selectedCode) {
                const preset = shiftPresets[selectedCode.code] || {};
                const startTime = selectedCode.startTime || preset.startTime;
                const endTime = selectedCode.endTime || preset.endTime;
                const station = selectedCode.station || preset.station;
                const vehicle = selectedCode.vehicle || preset.vehicle;
                const callSign = selectedCode.callSign || preset.callSign;
                const typeName = selectedCode.shiftTypeName || preset.shiftTypeName;
                const autoPartner = getPartnersForShiftFromRoster(formData.date, selectedCode.code);

                let typeId = formData.typeId;
                if (selectedCode.typeId) {
                    typeId = selectedCode.typeId;
                } else if (typeName) {
                    const matchingType = store.settings.shiftTypes.find(
                        t => t.name.toLowerCase() === typeName.toLowerCase()
                    );
                    if (matchingType) {
                        typeId = matchingType.id;
                    }
                }

                if (startTime || endTime || station || vehicle) {
                    setFormData(prev => ({
                        ...prev,
                        codeId: value,
                        typeId: typeId || prev.typeId,
                        startTime: startTime || prev.startTime,
                        endTime: endTime || prev.endTime,
                        station: station || prev.station,
                        vehicle: vehicle || prev.vehicle,
                        callSign: callSign || prev.callSign,
                        partner: (!prev.partner || prev.partner.startsWith('mit ')) ? (autoPartner || '') : prev.partner
                    }));
                    setIsPresetActive(true);
                    return;
                } else {
                    setIsPresetActive(false);
                }
            }
        }
        // Standard-Verhalten für andere Chips oder wenn kein Preset existiert
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const navigateToJournalMonth = (dateOrMonthStr) => {
        const ym = (dateOrMonthStr || searchParams.get('month') || formData.date || '').slice(0, 7);
        if (ym && /^\d{4}-\d{2}$/.test(ym)) {
            try {
                sessionStorage.setItem('schichttagebuch_journal_month', ym);
            } catch { /* ignore storage errors */ }
            navigate(`/journal?month=${ym}`);
        } else {
            navigate('/journal');
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const selectedCode = store.settings.shiftCodes.find(c => c.id === formData.codeId);
        const parsedBonus = parseFloat(formData.bonusAmount);
        const validBonusAmount = !isNaN(parsedBonus) && parsedBonus >= 0
            ? parsedBonus
            : (store.settings?.defaultBonusAmount ?? 75);
        const shiftData = {
            ...formData,
            hasBonus: Boolean(formData.hasBonus),
            bonusAmount: validBonusAmount,
            code: selectedCode ? selectedCode.code : (formData.code || ''),
            id: editId || crypto.randomUUID(),
            timestamp: editId ? formData.timestamp : Date.now(),
            updatedAt: Date.now()
        };
        addShift(shiftData);
        navigateToJournalMonth(shiftData.date);
    };

    const handleDelete = () => {
        if (confirm('Möchtest du diesen Eintrag wirklich unwiderruflich löschen?')) {
            const targetMonth = (formData.date || searchParams.get('month') || '').slice(0, 7);
            deleteShift(editId);
            navigateToJournalMonth(targetMonth);
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
                                disabled={isPresetActive}
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
                                disabled={isPresetActive}
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
                                    disabled={isPresetActive}
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
                            disabled={isPresetActive}
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
                            disabled={isPresetActive}
                        >
                            {store.settings.vehicles.map((v, i) => <option key={i} value={v}>{v}</option>)}
                        </select>
                        <select
                            name="callSign"
                            value={formData.callSign}
                            onChange={handleChange}
                            className="input-premium"
                            style={{ width: '100%' }}
                            disabled={isPresetActive}
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

                {/* Bonus Card */}
                <div
                    className="card-premium"
                    style={{
                        border: formData.hasBonus
                            ? '1px solid rgba(16, 185, 129, 0.5)'
                            : 'var(--glass-border)',
                        background: formData.hasBonus
                            ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(15, 23, 42, 0.85))'
                            : 'var(--color-surface)',
                        transition: 'all 0.2s ease'
                    }}
                >
                    <div
                        onClick={() => setFormData(prev => ({
                            ...prev,
                            hasBonus: !prev.hasBonus,
                            bonusAmount: prev.bonusAmount !== undefined && prev.bonusAmount !== '' ? prev.bonusAmount : defaultBonus
                        }))}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: 'pointer',
                            userSelect: 'none'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{
                                width: '24px',
                                height: '24px',
                                borderRadius: '7px',
                                border: formData.hasBonus ? '2px solid #10b981' : '2px solid #475569',
                                background: formData.hasBonus ? '#10b981' : 'transparent',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#fff',
                                fontWeight: 800,
                                fontSize: '14px',
                                transition: 'all 0.15s ease',
                                flexShrink: 0
                            }}>
                                {formData.hasBonus ? '✓' : ''}
                            </div>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '16px', fontWeight: 700, color: formData.hasBonus ? '#34d399' : 'var(--color-text-main)' }}>
                                        💰 Bonus-Schicht
                                    </span>
                                    {formData.hasBonus && (
                                        <span style={{
                                            fontSize: '12px',
                                            fontWeight: 700,
                                            background: 'rgba(16, 185, 129, 0.2)',
                                            color: '#34d399',
                                            border: '1px solid rgba(16, 185, 129, 0.4)',
                                            padding: '2px 8px',
                                            borderRadius: '6px'
                                        }}>
                                            +{Number(formData.bonusAmount || defaultBonus).toFixed(0)} €
                                        </span>
                                    )}
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                                    Haken setzen für Einspring-/Zusatz-Bonus (Standard: {defaultBonus} €)
                                </div>
                            </div>
                        </div>
                    </div>

                    {formData.hasBonus && (
                        <div style={{
                            marginTop: '14px',
                            paddingTop: '14px',
                            borderTop: '1px solid rgba(16, 185, 129, 0.25)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                                <label className="text-label" style={{ margin: 0, color: '#cbd5e1' }}>
                                    Bonus-Betrag (€)
                                </label>
                                <div style={{ position: 'relative', width: '130px' }}>
                                    <input
                                        type="number"
                                        step="1"
                                        min="0"
                                        name="bonusAmount"
                                        value={formData.bonusAmount}
                                        onChange={handleChange}
                                        className="input-premium"
                                        style={{
                                            width: '100%',
                                            marginBottom: 0,
                                            paddingRight: '30px',
                                            textAlign: 'right',
                                            fontWeight: 700,
                                            color: '#34d399',
                                            borderColor: 'rgba(16, 185, 129, 0.4)'
                                        }}
                                    />
                                    <span style={{
                                        position: 'absolute',
                                        right: '10px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        color: '#34d399',
                                        fontWeight: 700,
                                        pointerEvents: 'none'
                                    }}>
                                        €
                                    </span>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginRight: '4px' }}>Schnellwahl:</span>
                                {[50, 75, 100, 125, 150].map(amt => {
                                    const isActive = Number(formData.bonusAmount) === amt;
                                    return (
                                        <button
                                            key={amt}
                                            type="button"
                                            onClick={() => setFormData(prev => ({ ...prev, bonusAmount: amt }))}
                                            style={{
                                                padding: '4px 10px',
                                                borderRadius: '8px',
                                                fontSize: '12px',
                                                fontWeight: isActive ? 700 : 500,
                                                background: isActive ? '#10b981' : 'rgba(15, 23, 42, 0.7)',
                                                color: isActive ? '#0f172a' : '#94a3b8',
                                                border: isActive ? '1px solid #10b981' : '1px solid #334155',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {amt} €
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                <button type="submit" className="btn-primary" style={{ width: '100%', padding: '14px', fontSize: '16px', fontWeight: '600', marginTop: '8px' }}>
                    💾 {editId ? 'Änderungen speichern' : 'Speichern'}
                </button>
            </form>
        </div>
    );
}
