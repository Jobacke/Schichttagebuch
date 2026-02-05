import React, { createContext, useContext, useEffect, useState } from 'react';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import { collection, doc, setDoc, onSnapshot, query, orderBy, deleteDoc } from 'firebase/firestore';

const StoreContext = createContext();

const INITIAL_SETTINGS = {
  shiftTypes: [
    { id: 't1', name: 'Tagdienst' },
    { id: 't2', name: 'Nachtdienst' },
    { id: 't3', name: 'Zwischendienst' }
  ],
  shiftCodes: [
    { id: 'c1', code: 'T', hours: 12 },
    { id: 'c2', code: 'N', hours: 12 },
    { id: 'c3', code: 'K', hours: 8 }
  ],
  vehicles: ['R-RTW-1', 'R-NEF-1', 'R-KdoW-1'],
  callSigns: ['Florian 1/83/1', 'Florian 1/76/1', 'Florian 1/10/1'],
  stations: ['Hauptwache', 'Nordwache', 'Südwache']
};

export function StoreProvider({ children }) {
  const { currentUser } = useAuth();

  // State
  const [shifts, setShifts] = useState([]);
  const [settings, setSettings] = useState(INITIAL_SETTINGS);
  const [loading, setLoading] = useState(true);

  // --- Listener: Shifts ---
  useEffect(() => {
    if (!currentUser || !db) {
      setShifts([]);
      setLoading(false);
      return;
    }

    // Reference: users/{uid}/shifts
    const q = query(
      collection(db, `users/${currentUser.uid}/shifts`),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setShifts(data);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching shifts:", error);
    });

    return unsubscribe;
  }, [currentUser]);

  // --- Listener: Settings ---
  useEffect(() => {
    if (!currentUser || !db) return;

    // Reference: users/{uid}/data/settings (Single Document)
    const settingsRef = doc(db, `users/${currentUser.uid}/data`, 'settings');
    const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        setSettings(docSnap.data());
      } else {
        // Init if empty
        setDoc(settingsRef, INITIAL_SETTINGS).catch(e => console.error("Init Settings Failed", e));
      }
    });

    return unsubscribe;
  }, [currentUser]);

  // --- Actions ---

  const addShift = async (shift) => {
    if (!currentUser) return;
    try {
      const id = shift.id || crypto.randomUUID();
      await setDoc(doc(db, `users/${currentUser.uid}/shifts`, id), shift);
    } catch (e) {
      console.error("Add Shift Failed", e);
      alert("Fehler beim Speichern: " + e.message);
    }
  };

  const deleteShift = async (id) => {
    if (!currentUser) return;
    try {
      await deleteDoc(doc(db, `users/${currentUser.uid}/shifts`, id));
    } catch (e) {
      console.error("Delete Shift Failed", e);
    }
  };

  // Helper helper to update settings Doc
  const _updateSettingsDoc = async (newSettings) => {
    if (!currentUser) return;
    try {
      await setDoc(doc(db, `users/${currentUser.uid}/data`, 'settings'), newSettings);
    } catch (e) {
      console.error("Update Settings Failed", e);
    }
  };

  const updateSettings = (category, items) => {
    const newSettings = { ...settings, [category]: items };
    // Optimistic update
    setSettings(newSettings);
    _updateSettingsDoc(newSettings);
  };

  const addSettingItem = (category, item) => {
    const newCategory = [...settings[category], item];
    const newSettings = { ...settings, [category]: newCategory };
    setSettings(newSettings);
    _updateSettingsDoc(newSettings);
  };

  const removeSettingItem = (category, id) => {
    const newCategory = settings[category].filter(i => (i.id ? i.id !== id : i !== id));
    const newSettings = { ...settings, [category]: newCategory };
    setSettings(newSettings);
    _updateSettingsDoc(newSettings);
  };

  // Ensure store always has valid objects
  const safeStore = {
    shifts: shifts || [],
    settings: settings || INITIAL_SETTINGS
  };

  return (
    <StoreContext.Provider value={{ store: safeStore, addShift, deleteShift, updateSettings, addSettingItem, removeSettingItem, loading }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  return useContext(StoreContext);
}
