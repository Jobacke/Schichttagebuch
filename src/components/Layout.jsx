import React, { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import Navigation from './Navigation';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import {
    runOneClickCareManSync,
    importCareManPayloadAndSync,
    looksLikeCareManData
} from '../utils/oneClickCareManSync';

// Capture #careman=... hash early before any route redirects
if (typeof window !== 'undefined' && window.location.hash && window.location.hash.startsWith('#careman=')) {
    try {
        const rawEncoded = window.location.hash.slice('#careman='.length);
        const decoded = decodeURIComponent(rawEncoded);
        if (looksLikeCareManData(decoded)) {
            sessionStorage.setItem('pending_careman_import', decoded);
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
    } catch (e) {
        console.warn('Could not decode #careman hash:', e);
    }
}

export default function Layout() {
    const { currentUser } = useAuth();
    const { store, addShifts, deleteShifts, ensureCodesAndTypes } = useStore();
    const [autoImportToast, setAutoImportToast] = useState(null);

    useEffect(() => {
        if (!currentUser || store?.loading) return;

        const checkAndRunHashOrPending = async () => {
            const hasHash = window.location.hash && window.location.hash.startsWith('#careman=');
            let hasPending = false;
            try {
                hasPending = Boolean(sessionStorage.getItem('pending_careman_import'));
            } catch {
                /* ignore */
            }
            if (!hasHash && !hasPending) return;

            try {
                const res = await runOneClickCareManSync({
                    currentUser,
                    store,
                    addShifts,
                    deleteShifts,
                    ensureCodesAndTypes
                });
                if (res && res.message) {
                    setAutoImportToast(res.message);
                    setTimeout(() => setAutoImportToast(null), 7000);
                }
            } catch (err) {
                console.error('Auto CareMan import failed:', err);
            }
        };

        const handleWindowMessage = async (event) => {
            const data = event?.data;
            if (!data || data.type !== 'CAREMAN_LIVE_SYNC_RESULT' || !data.payload) return;
            try {
                const rawText = typeof data.payload === 'string' ? data.payload : JSON.stringify(data.payload);
                if (!looksLikeCareManData(rawText)) return;
                const res = await importCareManPayloadAndSync({
                    rawText,
                    sourceLabel: 'live-autopilot',
                    currentUser,
                    store,
                    addShifts,
                    deleteShifts,
                    ensureCodesAndTypes
                });
                if (res && res.message) {
                    setAutoImportToast(res.message);
                    setTimeout(() => setAutoImportToast(null), 7000);
                }
            } catch (err) {
                console.error('Live postMessage CareMan sync failed:', err);
            }
        };

        checkAndRunHashOrPending();
        window.addEventListener('hashchange', checkAndRunHashOrPending);
        window.addEventListener('message', handleWindowMessage);
        return () => {
            window.removeEventListener('hashchange', checkAndRunHashOrPending);
            window.removeEventListener('message', handleWindowMessage);
        };
    }, [currentUser, store?.loading]);

    return (
        <div className="app-container">
            {autoImportToast && (
                <div style={{
                    position: 'fixed',
                    top: '18px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 5000,
                    background: 'linear-gradient(135deg, #059669, #10b981)',
                    color: 'white',
                    padding: '12px 18px',
                    borderRadius: '16px',
                    fontSize: '13px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    maxWidth: '92vw',
                    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.45)',
                    border: '1px solid rgba(255, 255, 255, 0.25)'
                }}>
                    <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
                    <span>{autoImportToast}</span>
                </div>
            )}
            <main style={{ flex: 1, width: '100%', maxWidth: '600px', margin: '0 auto' }}>
                <Outlet />
            </main>
            <Navigation />
        </div>
    );
}
