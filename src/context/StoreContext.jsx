import React, { createContext, useContext, useEffect, useState } from 'react';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import { collection, doc, setDoc, onSnapshot, query, orderBy, deleteDoc, writeBatch } from 'firebase/firestore';

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
  stations: ['Hauptwache', 'Nordwache', 'Südwache'],
  defaultWeeklyHours: 20,
  monthlyWeeklyHours: {}
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

  const addShifts = async (shiftsArray, overwriteExistingDates = false) => {
    if (!currentUser || !shiftsArray || shiftsArray.length === 0) return true;
    try {
      const batch = writeBatch(db);

      if (overwriteExistingDates) {
        const datesToOverwrite = new Set(shiftsArray.map(s => s.date));
        const existingToDelete = (shifts || []).filter(s => datesToOverwrite.has(s.date));
        existingToDelete.forEach(s => {
          batch.delete(doc(db, `users/${currentUser.uid}/shifts`, s.id));
        });
      }

      shiftsArray.forEach(shift => {
        const id = shift.id || crypto.randomUUID();
        const ref = doc(db, `users/${currentUser.uid}/shifts`, id);
        batch.set(ref, {
          ...shift,
          id,
          timestamp: shift.timestamp || Date.now()
        });
      });

      await batch.commit();
      return true;
    } catch (e) {
      console.warn("Batch failed, attempting fallback:", e);
      try {
        await Promise.all(shiftsArray.map(shift => {
          const id = shift.id || crypto.randomUUID();
          return setDoc(doc(db, `users/${currentUser.uid}/shifts`, id), {
            ...shift,
            id,
            timestamp: shift.timestamp || Date.now()
          });
        }));
        return true;
      } catch (err) {
        console.error("Batch Add Shifts Failed", err);
        alert("Fehler beim Speichern der Schichten: " + err.message);
        return false;
      }
    }
  };

  const ensureCodesAndTypes = async (requiredCodes = [], requiredTypes = []) => {
    if (!currentUser) return;
    let settingsUpdated = false;
    let currentCodes = [...(settings?.shiftCodes || [])];
    let currentTypes = [...(settings?.shiftTypes || [])];

    requiredCodes.forEach(rc => {
      const codeStr = typeof rc === 'string' ? rc : rc.code;
      const hoursNum = typeof rc === 'object' && rc.hours ? rc.hours : 8.2;
      if (codeStr && !currentCodes.some(c => c.code.toLowerCase() === codeStr.toLowerCase())) {
        currentCodes.push({
          id: crypto.randomUUID(),
          code: codeStr.toUpperCase(),
          hours: hoursNum
        });
        settingsUpdated = true;
      }
    });

    requiredTypes.forEach(rt => {
      const nameStr = typeof rt === 'string' ? rt : rt.name;
      if (nameStr && !currentTypes.some(t => t.name.toLowerCase() === nameStr.toLowerCase())) {
        currentTypes.push({
          id: crypto.randomUUID(),
          name: nameStr
        });
        settingsUpdated = true;
      }
    });

    if (settingsUpdated) {
      const newSettings = {
        ...settings,
        shiftCodes: currentCodes,
        shiftTypes: currentTypes
      };
      setSettings(newSettings);
      await _updateSettingsDoc(newSettings);
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

  const deleteShifts = async (shiftIds = []) => {
    if (!currentUser || !shiftIds || shiftIds.length === 0) return true;
    try {
      const batch = writeBatch(db);
      shiftIds.forEach(id => {
        batch.delete(doc(db, `users/${currentUser.uid}/shifts`, id));
      });
      await batch.commit();
      return true;
    } catch (e) {
      console.warn("Batch delete failed, attempting fallback:", e);
      try {
        await Promise.all(shiftIds.map(id => {
          return deleteDoc(doc(db, `users/${currentUser.uid}/shifts`, id));
        }));
        return true;
      } catch (err) {
        console.error("Delete Shifts Failed", err);
        alert("Fehler beim Löschen: " + err.message);
        return false;
      }
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
    const newCategory = (settings[category] || []).filter(i => (i.id ? i.id !== id : i !== id));
    const newSettings = { ...settings, [category]: newCategory };
    setSettings(newSettings);
    _updateSettingsDoc(newSettings);
  };

  const updateWeeklyHours = (hours) => {
    const num = parseFloat(hours);
    const newSettings = { ...settings, defaultWeeklyHours: isNaN(num) ? 0 : num };
    setSettings(newSettings);
    _updateSettingsDoc(newSettings);
  };

  const setMonthlyWeeklyHours = (yearMonth, hours) => {
    const num = parseFloat(hours);
    const currentMap = settings?.monthlyWeeklyHours || {};
    const updated = { ...currentMap, [yearMonth]: isNaN(num) ? 0 : num };
    const newSettings = { ...settings, monthlyWeeklyHours: updated };
    setSettings(newSettings);
    _updateSettingsDoc(newSettings);
  };

  const removeMonthlyWeeklyHours = (yearMonth) => {
    const currentMap = { ...(settings?.monthlyWeeklyHours || {}) };
    delete currentMap[yearMonth];
    const newSettings = { ...settings, monthlyWeeklyHours: currentMap };
    setSettings(newSettings);
    _updateSettingsDoc(newSettings);
  };

  // Ensure store always has valid objects
  const safeStore = {
    shifts: shifts || [],
    settings: {
      ...INITIAL_SETTINGS,
      ...(settings || {}),
      defaultWeeklyHours: settings?.defaultWeeklyHours !== undefined ? settings.defaultWeeklyHours : INITIAL_SETTINGS.defaultWeeklyHours,
      monthlyWeeklyHours: settings?.monthlyWeeklyHours || settings?.monthlyTargets || INITIAL_SETTINGS.monthlyWeeklyHours
    }
  };

  return (
    <StoreContext.Provider value={{
      store: safeStore,
      addShift,
      addShifts,
      ensureCodesAndTypes,
      deleteShift,
      deleteShifts,
      updateSettings,
      addSettingItem,
      removeSettingItem,
      updateWeeklyHours,
      setMonthlyWeeklyHours,
      removeMonthlyWeeklyHours,
      // Backward compatibility aliases
      setMonthlyTarget: setMonthlyWeeklyHours,
      removeMonthlyTarget: removeMonthlyWeeklyHours,
      loading
    }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  return useContext(StoreContext);
}
