import React, { useState, useMemo } from 'react';
import { useStore } from '../context/StoreContext';
import { APP_VERSION } from '../version';
import {
    format, parseISO, startOfMonth, endOfMonth, isValid
} from 'date-fns';
import { de } from 'date-fns/locale';

export default function Analysis() {
    const { store } = useStore();

    // --- Minimal Filter State ---
    const [month, setMonth] = useState(new Date());

    // --- Logic ---
    const filteredData = useMemo(() => {
        if (!store.shifts) return [];
        return store.shifts.filter(s => {
            if (!s.date) return false;
            try {
                const d = parseISO(s.date);
                return d.getMonth() === month.getMonth() && d.getFullYear() === month.getFullYear();
            } catch (e) { return false; }
        });
    }, [store.shifts, month]);

    const totalHours = useMemo(() => {
        return filteredData.reduce((acc, s) => {
            // Simplified duration calc
            if (!s.startTime || !s.endTime) return acc;
            const [h1, m1] = s.startTime.split(':').map(Number);
            const [h2, m2] = s.endTime.split(':').map(Number);
            let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
            if (diff < 0) diff += 24 * 60;
            return acc + (diff / 60);
        }, 0);
    }, [filteredData]);

    return (
        <div style={{ padding: '20px', color: 'white', textAlign: 'center' }}>
            <h1>Auswertung v{APP_VERSION}</h1>

            <div style={{ margin: '20px 0', padding: '20px', background: '#1e293b', borderRadius: '12px' }}>
                <h2>Statistik für {format(month, 'MMMM yyyy', { locale: de })}</h2>
                <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#f97316' }}>
                    {totalHours.toFixed(1)} Stunden
                </p>
                <p>Anzahl Dienste: {filteredData.length}</p>
            </div>

            <div style={{ textAlign: 'left', marginTop: '20px' }}>
                <h3>Rohdaten (Debug):</h3>
                <pre style={{ background: '#0f172a', padding: '10px', borderRadius: '8px', fontSize: '10px', overflowX: 'auto' }}>
                    {JSON.stringify(filteredData.map(s => ({ date: s.date, type: s.typeId })), null, 2)}
                </pre>
            </div>
        </div>
    );
}
