import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '../firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';

const AuthContext = createContext();

const REQUIRE_PASSWORD_KEY = 'schichttagebuch_require_password';
const DEFAULT_JOHANNES_USER = {
    uid: 'johannes_default',
    email: 'backhaus.johannes@gmail.com',
    displayName: 'Johannes',
    isDefaultUser: true
};

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
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setFirebaseUser(user);
            if (user) {
                setForceLogin(false);
                try { localStorage.setItem('schichttagebuch_last_uid', user.uid); } catch {}
            }
            setLoading(false);
        });
        return unsubscribe;
    }, []);

    const setRequirePassword = (val) => {
        setPasswordRequiredStorage(val);
        setRequirePasswordState(Boolean(val));
    };

    const login = (email, password) => {
        setForceLogin(false);
        return signInWithEmailAndPassword(auth, email, password);
    };

    const register = (email, password) => {
        setForceLogin(false);
        return createUserWithEmailAndPassword(auth, email, password);
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
