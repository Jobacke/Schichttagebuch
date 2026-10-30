import React, { createContext, useContext, useEffect, useState } from 'react';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import { collection, doc, setDoc, onSnapshot, query, orderBy, deleteDoc, writeBatch } from 'firebase/firestore';
import { syncTeamRostersWithCloud, subscribeToCloudTeamRosters } from '../utils/teamRosterParser';

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
  monthlyWeeklyHours: {},
  defaultBonusAmount: 75
};

export function getShiftBonusAmount(shift, settings) {
  if (!shift || !shift.hasBonus) return 0;
  const custom = parseFloat(shift.bonusAmount);
  if (!isNaN(custom) && custom >= 0) return custom;
  const def = parseFloat(settings?.defaultBonusAmount);
  return !isNaN(def) && def >= 0 ? def : 75;
}

export function StoreProvider({ children }) {
  const { currentUser } = useAuth();

  // State
  const [shifts, setShifts] = useState([]);
  const [settings, setSettings] = useState(INITIAL_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [rosterVersion, setRosterVersion] = useState(0);

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

  // --- Listener: Cloud Team Rosters Real-Time Sync ---
  useEffect(() => {
    if (!currentUser || !db) return;

    // 1. Initial sync of rosters from Cloud Firestore into localStorage
    syncTeamRostersWithCloud(currentUser)
      .then(() => setRosterVersion(v => v + 1))
      .catch(err => console.error('Initial team rosters sync error:', err));

    // 2. Real-time subscription to team_rosters collection
    const unsubscribe = subscribeToCloudTeamRosters(currentUser, () => {
      setRosterVersion(v => v + 1);
    });

    return unsubscribe;
  }, [currentUser]);

  // --- Actions ---

  const addShift = async (shift) => {
    if (!currentUser) return;
    try {
      const id = shift.id || crypto.randomUUID();
      await setDoc(doc(db, `users/${currentUser.uid}/shifts`, id), {
        ...shift,
        id,
        updatedAt: Date.now()
      });
    } catch (e) {
      console.error("Add Shift Failed", e);
      alert("Fehler beim Speichern: " + e.message);
    }
  };

  const addShifts = async (shiftsArray, overwriteExistingDates = false) => {
    if (!currentUser || !shiftsArray || shiftsArray.length === 0) return true;
    try {
      const batch = writeBatch(db);
      const dateToMatchedPairs = {};

      if (overwriteExistingDates) {
        const datesToOverwrite = new Set(shiftsArray.map(s => s.date));
        
        // Group existing shifts by date
        const existingByDate = {};
        (shifts || []).filter(s => datesToOverwrite.has(s.date)).forEach(s => {
          if (!existingByDate[s.date]) existingByDate[s.date] = [];
          existingByDate[s.date].push(s);
        });

        // Group incoming shifts by date
        const incomingByDate = {};
        shiftsArray.forEach(s => {
          if (!incomingByDate[s.date]) incomingByDate[s.date] = [];
          incomingByDate[s.date].push(s);
        });

        Object.keys(incomingByDate).forEach(date => {
          const existingList = existingByDate[date] ? [...existingByDate[date]] : [];
          const incomingList = incomingByDate[date];
          const matchedPairs = [];

          incomingList.forEach(inc => {
            // First try to match existing shift with identical code to keep IDs / bonus settings
            const matchIdx = existingList.findIndex(e => e.code === inc.code);
            if (matchIdx !== -1) {
              matchedPairs.push({ incoming: inc, prev: existingList.splice(matchIdx, 1)[0] });
            } else if (existingList.length > 0) {
              matchedPairs.push({ incoming: inc, prev: existingList.shift() });
            } else {
              matchedPairs.push({ incoming: inc, prev: null });
            }
          });

          // Any remaining existing shifts on this date not present in incoming list are deleted
          existingList.forEach(extra => {
            batch.delete(doc(db, `users/${currentUser.uid}/shifts`, extra.id));
          });

          dateToMatchedPairs[date] = matchedPairs;
        });
      }

      shiftsArray.forEach(shift => {
        let prevShift = null;
        if (overwriteExistingDates && dateToMatchedPairs[shift.date]) {
          const matchIdx = dateToMatchedPairs[shift.date].findIndex(p => p.incoming === shift);
          if (matchIdx !== -1) {
            prevShift = dateToMatchedPairs[shift.date].splice(matchIdx, 1)[0].prev;
          }
        }

        const id = prevShift?.id || shift.id || crypto.randomUUID();
        const ref = doc(db, `users/${currentUser.uid}/shifts`, id);
        batch.set(ref, {
          ...shift,
          id,
          hasBonus: shift.hasBonus !== undefined ? shift.hasBonus : Boolean(prevShift?.hasBonus),
          bonusAmount: shift.bonusAmount !== undefined ? shift.bonusAmount : (prevShift?.bonusAmount ?? (settings?.defaultBonusAmount ?? 75)),
          partner: shift.partner || prevShift?.partner || '',
          timestamp: prevShift?.timestamp || shift.timestamp || Date.now(),
          updatedAt: Date.now()
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
            timestamp: shift.timestamp || Date.now(),
            updatedAt: Date.now()
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

  const updateSettingItem = (category, updatedItem) => {
    const list = settings[category] || [];
    const newCategory = list.map(item => {
      if (item && item.id && updatedItem && updatedItem.id && item.id === updatedItem.id) {
        return { ...item, ...updatedItem };
      }
      return item;
    });
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

  const updateDefaultBonusAmount = (amount) => {
    const num = parseFloat(amount);
    const validAmount = !isNaN(num) && num >= 0 ? num : 75;
    const newSettings = { ...settings, defaultBonusAmount: validAmount };
    setSettings(newSettings);
    _updateSettingsDoc(newSettings);
  };

  const toggleShiftBonus = async (shift, customAmount = null) => {
    if (!currentUser || !shift || !shift.id) return;
    try {
      const nextHasBonus = !shift.hasBonus;
      const defaultAmt = parseFloat(settings?.defaultBonusAmount);
      const fallbackAmt = !isNaN(defaultAmt) && defaultAmt >= 0 ? defaultAmt : 75;
      const nextBonusAmount = nextHasBonus
        ? (customAmount !== null && !isNaN(parseFloat(customAmount)) ? parseFloat(customAmount) : (shift.bonusAmount ?? fallbackAmt))
        : (shift.bonusAmount ?? fallbackAmt);

      const updatedShift = {
        ...shift,
        hasBonus: nextHasBonus,
        bonusAmount: nextBonusAmount
      };
      await setDoc(doc(db, `users/${currentUser.uid}/shifts`, shift.id), updatedShift);
    } catch (e) {
      console.error("Toggle Shift Bonus Failed", e);
    }
  };

  const updateAllBonusShiftsAmount = async (newAmount) => {
    if (!currentUser) return 0;
    const num = parseFloat(newAmount);
    if (isNaN(num) || num < 0) return 0;
    const bonusShifts = (shifts || []).filter(s => s.hasBonus);
    if (bonusShifts.length === 0) return 0;
    try {
      const batch = writeBatch(db);
      bonusShifts.forEach(s => {
        const ref = doc(db, `users/${currentUser.uid}/shifts`, s.id);
        batch.set(ref, { ...s, bonusAmount: num });
      });
      await batch.commit();
      return bonusShifts.length;
    } catch (e) {
      console.error("Update All Bonus Shifts Failed", e);
      return 0;
    }
  };

  // Ensure store always has valid objects
  const safeStore = {
    shifts: shifts || [],
    settings: {
      ...INITIAL_SETTINGS,
      ...(settings || {}),
      defaultWeeklyHours: settings?.defaultWeeklyHours !== undefined ? settings.defaultWeeklyHours : INITIAL_SETTINGS.defaultWeeklyHours,
      monthlyWeeklyHours: settings?.monthlyWeeklyHours || settings?.monthlyTargets || INITIAL_SETTINGS.monthlyWeeklyHours,
      defaultBonusAmount: settings?.defaultBonusAmount !== undefined ? Number(settings.defaultBonusAmount) : INITIAL_SETTINGS.defaultBonusAmount
    },
    rosterVersion
  };

  return (
    <StoreContext.Provider value={{
      store: safeStore,
      rosterVersion,
      addShift,
      addShifts,
      ensureCodesAndTypes,
      deleteShift,
      deleteShifts,
      updateSettings,
      updateSettingItem,
      addSettingItem,
      removeSettingItem,
      updateWeeklyHours,
      setMonthlyWeeklyHours,
      removeMonthlyWeeklyHours,
      updateDefaultBonusAmount,
      toggleShiftBonus,
      updateAllBonusShiftsAmount,
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
