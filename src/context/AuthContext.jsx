import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '../firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { postToBoard, isEmbedded, isFromBoard } from '../utils/boardBridge';

const AuthContext = createContext();

const REQUIRE_PASSWORD_KEY = 'schichttagebuch_require_password';
const AUTO_AUTH_KEY = 'schichttagebuch_auto_auth_v1';
const DEFAULT_JOHANNES_USER = {
    uid: 'johannes_default',
    email: 'johannes@vjbackhaus.com',
    displayName: 'Johannes',
    isDefaultUser: true
};

// Synchronously absorb #board_schicht_auth=... from Board parent window if present
(function absorbBoardHashAuth() {
    if (typeof window === 'undefined') return;
    try {
        const hash = window.location.hash || '';
        const m = hash.match(/[#&]board_schicht_auth=([^&]+)/);
        if (m) {
            const raw = decodeURIComponent(m[1]);
            if (raw) {
                localStorage.setItem(AUTO_AUTH_KEY, raw);
            }
            const cleaned = hash
                .replace(/([#&])board_schicht_auth=[^&]+&?/, '$1')
                .replace(/[?&]+$/, '');
            window.history.replaceState({}, document.title, window.location.pathname + window.location.search + (cleaned === '#' ? '' : cleaned));
        }
    } catch {}
})();

function saveAutoAuth(email, password) {
    if (!email || !password) return;
    try {
        const encoded = btoa(unescape(encodeURIComponent(JSON.stringify({ e: email.trim(), p: password }))));
        localStorage.setItem(AUTO_AUTH_KEY, encoded);
        postToBoard({ type: 'board-storage-set', key: AUTO_AUTH_KEY, value: encoded });
    } catch {}
}

function getSavedAutoAuth() {
    try {
        const raw = localStorage.getItem(AUTO_AUTH_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(decodeURIComponent(escape(atob(raw))));
        if (parsed && parsed.e && parsed.p) return parsed;
    } catch {}
    return null;
}

export function isPasswordRequired() {
    try { return localStorage.getItem(REQUIRE_PASSWORD_KEY) === 'true'; } catch { return false; }
}

export function setPasswordRequiredStorage(val) {
    try {
        if (val) localStorage.setItem(REQUIRE_PASSWORD_KEY, 'true');
        else localStorage.removeItem(REQUIRE_PASSWORD_KEY);
    } catch {}
}

export function AuthProvider({ children }) {
    const [firebaseUser, setFirebaseUser] = useState(null);
    const [requirePassword, setRequirePasswordState] = useState(() => isPasswordRequired());
    const [forceLogin, setForceLogin] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!auth) {
            setLoading(false);
            return;
        }
        let autoLoginAttempted = false;
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                setFirebaseUser(user);
                setForceLogin(false);
                try {
                    localStorage.setItem('schichttagebuch_last_uid', user.uid);
                    if (user.email) localStorage.setItem('schichttagebuch_last_email', user.email);
                } catch {}
                setLoading(false);
                return;
            }
            if (!autoLoginAttempted && !isPasswordRequired()) {
                autoLoginAttempted = true;
                const saved = getSavedAutoAuth();
                if (saved) {
                    try {
                        await signInWithEmailAndPassword(auth, saved.e, saved.p);
                        return;
                    } catch {
                        // Fall through to default user if background sign-in fails
                    }
                }
            }
            setFirebaseUser(null);
            setLoading(false);
        });
        return unsubscribe;
    }, []);

    useEffect(() => {
        if (!isEmbedded()) return;
        const onMessage = async (event) => {
            if (!isFromBoard(event)) return;
            const data = event.data;
            if (!data || typeof data !== 'object') return;
            if (data.type === 'board-storage-value' && data.key === AUTO_AUTH_KEY && data.value) {
                try {
                    localStorage.setItem(AUTO_AUTH_KEY, data.value);
                    if (!auth?.currentUser && !isPasswordRequired()) {
                        const saved = getSavedAutoAuth();
                        if (saved) {
                            await signInWithEmailAndPassword(auth, saved.e, saved.p);
                        }
                    }
                } catch {}
            }
        };
        window.addEventListener('message', onMessage);
        postToBoard({ type: 'board-storage-get', key: AUTO_AUTH_KEY });
        return () => window.removeEventListener('message', onMessage);
    }, []);

    const setRequirePassword = (val) => {
        setPasswordRequiredStorage(val);
        setRequirePasswordState(Boolean(val));
    };

    const login = async (email, password) => {
        setForceLogin(false);
        const cred = await signInWithEmailAndPassword(auth, email, password);
        saveAutoAuth(email, password);
        return cred;
    };

    const register = async (email, password) => {
        setForceLogin(false);
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        saveAutoAuth(email, password);
        return cred;
    };

    const logout = async () => {
        setForceLogin(true);
        if (firebaseUser) {
            await signOut(auth);
        }
    };

    const skipLogin = () => {
        setForceLogin(false);
        setRequirePassword(false);
    };

    const currentUser = firebaseUser || ((!requirePassword && !forceLogin) ? DEFAULT_JOHANNES_USER : null);

    return (
        <AuthContext.Provider value={{
            currentUser,
            firebaseUser,
            requirePassword,
            setRequirePassword,
            skipLogin,
            login,
            register,
            logout,
            loading
        }}>
            {!loading && children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
