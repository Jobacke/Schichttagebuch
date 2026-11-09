import React, { useEffect, useState, useRef } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { CheckCircle2, Moon, Sun } from 'lucide-react';
import { APP_VERSION } from '../version';
import Navigation from './Navigation';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import {
    runOneClickCareManSync,
    importCareManPayloadAndSync,
    looksLikeCareManData
} from '../utils/oneClickCareManSync';

// Capture #careman=... hash or window.name payload early before any route redirects
if (typeof window !== 'undefined') {
    if (window.location.hash && window.location.hash.startsWith('#careman=')) {
        try {
            const rawEncoded = window.location.hash.slice('#careman='.length);
            const decoded = decodeURIComponent(rawEncoded);
            if (looksLikeCareManData(decoded)) {
                window.__PENDING_CAREMAN_IMPORT = decoded;
                try { sessionStorage.setItem('pending_careman_import', decoded); } catch {}
                try { localStorage.setItem('pending_careman_import', decoded); } catch {}
                try { sessionStorage.setItem('pending_careman_redirect_journal', '1'); } catch {}
                if (window.name && window.name.startsWith('CAREMAN_SYNC:')) {
                    window.name = '';
                }
                window.history.replaceState(null, '', window.location.pathname + window.location.search);
            }
        } catch (e) {
            console.warn('Could not decode #careman hash:', e);
        }
    }
    if (window.name && window.name.startsWith('CAREMAN_SYNC:')) {
        try {
            const rawJson = window.name.slice('CAREMAN_SYNC:'.length);
            window.name = '';
            if (looksLikeCareManData(rawJson)) {
                window.__PENDING_CAREMAN_IMPORT = rawJson;
                try { sessionStorage.setItem('pending_careman_import', rawJson); } catch {}
                try { localStorage.setItem('pending_careman_import', rawJson); } catch {}
                try { sessionStorage.setItem('pending_careman_redirect_journal', '1'); } catch {}
            }
        } catch (e) {
            console.warn('Could not read window.name CareMan payload:', e);
        }
    }
}

export default function Layout() {
    const { currentUser } = useAuth();
    const { store, addShifts, deleteShifts, ensureCodesAndTypes } = useStore();
    const [autoImportToast, setAutoImportToast] = useState(null);
    const [theme, setTheme] = useState(() =>
        (typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark') ? 'dark' : 'light'
    );

    // Darstellung (Hell = Johanniter-CI, Dunkel = Nachtdienst) – rein optisch
    useEffect(() => {
        document.documentElement.dataset.theme = theme;
        try { localStorage.setItem('schichttagebuch_theme', theme); } catch { /* ignore */ }
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', theme === 'dark' ? '#0F1114' : '#FFFFFF');
    }, [theme]);
    const navigate = useNavigate();
    const location = useLocation();

    const latestRef = useRef({ currentUser, store, addShifts, deleteShifts, ensureCodesAndTypes, location, navigate });
    useEffect(() => {
        latestRef.current = { currentUser, store, addShifts, deleteShifts, ensureCodesAndTypes, location, navigate };
    });

    const isImportingRef = useRef(false);
    const hasLeftTabRef = useRef(false);
    const lastHashImportTimeRef = useRef(0);

    useEffect(() => {
        if (!currentUser || store?.loading) return;

        const showToast = (msg) => {
            if (!msg) return;
            setAutoImportToast(msg);
            setTimeout(() => setAutoImportToast(null), 7000);
        };

        const checkAndRunHashOrPending = async () => {
            if (isImportingRef.current) return;
            const hasHash = window.location.hash && window.location.hash.startsWith('#careman=');
            let hasPending = Boolean(window.__PENDING_CAREMAN_IMPORT);
            try {
                hasPending = hasPending || Boolean(
                    sessionStorage.getItem('pending_careman_import') ||
                    localStorage.getItem('pending_careman_import')
                );
            } catch {
                /* ignore */
            }
            if (!hasHash && !hasPending) return;

            isImportingRef.current = true;
            lastHashImportTimeRef.current = Date.now();
            try {
                const ctx = latestRef.current;
                const res = await runOneClickCareManSync({
                    currentUser: ctx.currentUser,
                    store: ctx.store,
                    addShifts: ctx.addShifts,
                    deleteShifts: ctx.deleteShifts,
                    ensureCodesAndTypes: ctx.ensureCodesAndTypes
                });
                if (res && res.message) {
                    showToast(res.message);
                }
                try { sessionStorage.removeItem('pending_careman_redirect_journal'); } catch {}
                if (res?.yearMonth) {
                    ctx.navigate(`/journal?month=${res.yearMonth}`, { replace: true });
                }
            } catch (err) {
                console.error('Auto CareMan import failed:', err);
            } finally {
                isImportingRef.current = false;
            }
        };

        const checkClipboardOnTabReturn = async (isInitialMount = false) => {
            if (isImportingRef.current) return;
            if (Date.now() - lastHashImportTimeRef.current < 12000) return;
            if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') return;

            try {
                const clipText = await navigator.clipboard.readText();
                if (!clipText || !looksLikeCareManData(clipText)) return;

                const trimmed = clipText.trim();
                const lastImported = localStorage.getItem('careman_last_imported_clip') || '';
                const ctx = latestRef.current;

                let viewedJournalMonth = null;
                try {
                    viewedJournalMonth = sessionStorage.getItem('schichttagebuch_journal_month');
                } catch {
                    /* ignore */
                }

                // Determine target month in clipboard if JSON
                let clipYearMonth = null;
                if (trimmed.startsWith('{')) {
                    try {
                        const parsed = JSON.parse(trimmed);
                        clipYearMonth = parsed?.yearMonth || parsed?.rosters?.[0]?.yearMonth || null;
                    } catch {
                        /* ignore */
                    }
                }

                const effectiveCheckMonth = viewedJournalMonth || clipYearMonth;
                const monthShiftCount = effectiveCheckMonth
                    ? (ctx.store?.shifts || []).filter(s => s.date && s.date.startsWith(effectiveCheckMonth)).length
                    : -1;

                let allowAfterDelete = false;
                try {
                    allowAfterDelete = sessionStorage.getItem('careman_allow_reimport_after_tab_switch') === '1';
                } catch {
                    /* ignore */
                }

                // Import if clipboard has new CareMan payload OR if month is empty on mount/return OR if returning after deleting shifts
                const isNewPayload = trimmed !== lastImported;
                const isEmptyMonth = (hasLeftTabRef.current || isInitialMount) && monthShiftCount === 0;
                const isReturningAfterDelete = hasLeftTabRef.current && allowAfterDelete;

                if (!isNewPayload && !isEmptyMonth && !isReturningAfterDelete) return;

                isImportingRef.current = true;
                hasLeftTabRef.current = false;
                try {
                    sessionStorage.removeItem('careman_allow_reimport_after_tab_switch');
                } catch {
                    /* ignore */
                }

                const res = await importCareManPayloadAndSync({
                    rawText: trimmed,
                    preferredYearMonth: viewedJournalMonth,
                    currentUser: ctx.currentUser,
                    store: ctx.store,
                    addShifts: ctx.addShifts,
                    deleteShifts: ctx.deleteShifts,
                    ensureCodesAndTypes: ctx.ensureCodesAndTypes
                });

                if (res && res.message) {
                    showToast(res.message);
                }
            } catch {
                // Clipboard read not permitted without click or empty -> ignore silently
            } finally {
                isImportingRef.current = false;
            }
        };

        const handleWindowMessage = async (event) => {
            const data = event?.data;
            if (!data || data.type !== 'CAREMAN_LIVE_SYNC_RESULT' || !data.payload) return;
            if (isImportingRef.current) return;
            isImportingRef.current = true;
            try {
                const rawText = typeof data.payload === 'string' ? data.payload : JSON.stringify(data.payload);
                if (!looksLikeCareManData(rawText)) return;
                const ctx = latestRef.current;
                const res = await importCareManPayloadAndSync({
                    rawText,
                    currentUser: ctx.currentUser,
                    store: ctx.store,
                    addShifts: ctx.addShifts,
                    deleteShifts: ctx.deleteShifts,
                    ensureCodesAndTypes: ctx.ensureCodesAndTypes
                });
                if (res && res.message) {
                    showToast(res.message);
                }
            } catch (err) {
                console.error('Live postMessage CareMan sync failed:', err);
            } finally {
                isImportingRef.current = false;
            }
        };

        const onWindowBlur = () => {
            hasLeftTabRef.current = true;
        };

        const onWindowFocus = () => {
            checkAndRunHashOrPending();
            checkClipboardOnTabReturn();
        };

        const onVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                hasLeftTabRef.current = true;
            } else if (document.visibilityState === 'visible') {
                checkAndRunHashOrPending();
                checkClipboardOnTabReturn();
            }
        };

        checkAndRunHashOrPending();
        checkClipboardOnTabReturn(true);
        window.addEventListener('hashchange', checkAndRunHashOrPending);
        window.addEventListener('careman-autopilot-ready', checkAndRunHashOrPending);
        window.addEventListener('message', handleWindowMessage);
        window.addEventListener('blur', onWindowBlur);
        window.addEventListener('focus', onWindowFocus);
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => {
            window.removeEventListener('hashchange', checkAndRunHashOrPending);
            window.removeEventListener('careman-autopilot-ready', checkAndRunHashOrPending);
            window.removeEventListener('message', handleWindowMessage);
            window.removeEventListener('blur', onWindowBlur);
            window.removeEventListener('focus', onWindowFocus);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, [currentUser, store?.loading]);

    return (
        <div className="app-container">
            {autoImportToast && (
                <div style={{
                    position: 'fixed',
                    top: 'calc(14px + env(safe-area-inset-top))',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 5000,
                    background: 'linear-gradient(135deg, var(--c-success-deep), var(--c-success-strong))',
                    color: 'white',
                    padding: '12px 18px',
                    borderRadius: '999px',
                    fontSize: '13px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    maxWidth: '92vw',
                    boxShadow: 'var(--shadow-float)',
                    animation: 'riseIn 0.35s var(--ease-out)',
                    border: '1px solid rgb(var(--rgb-overlay) / 0.25)'
                }}>
                    <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
                    <span>{autoImportToast}</span>
                </div>
            )}
            <header className="app-topbar">
                <div className="app-topbar-inner">
                    <div className="app-brand">
                        <img src="/logo.svg?v=5" alt="" className="app-brand-logo" />
                        <div className="app-brand-text">
                            <span className="app-brand-title">Schichttagebuch</span>
                            <span className="app-brand-sub">Rettungsdienst · Dienstplan</span>
                        </div>
                    </div>
                    <span className="app-version-chip">v{APP_VERSION}</span>
                    <button
                        type="button"
                        className="icon-btn"
                        onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
                        aria-label={theme === 'dark' ? 'Helle Darstellung' : 'Dunkle Darstellung'}
                        title={theme === 'dark' ? 'Helle Darstellung' : 'Dunkle Darstellung (Nachtdienst)'}
                    >
                        {theme === 'dark' ? <Sun /> : <Moon />}
                    </button>
                </div>
            </header>
            <main style={{ flex: 1, width: '100%', maxWidth: '600px', margin: '0 auto' }}>
                <Outlet />
            </main>
            <Navigation />
        </div>
    );
}
