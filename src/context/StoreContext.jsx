import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
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

function resolveShiftCode(s, cfg) {
  if (s?.code && String(s.code).trim()) {
    return String(s.code).replace(/\*+$/, '').trim().toUpperCase();
  }
  if (s?.codeId && Array.isArray(cfg?.shiftCodes)) {
    const found = cfg.shiftCodes.find(c => c.id === s.codeId);
    if (found?.code) return String(found.code).replace(/\*+$/, '').trim().toUpperCase();
  }
  return '';
}

function getShiftDedupeKey(s, cfg) {
  const dateStr = String(s?.date || '').trim();
  const code = resolveShiftCode(s, cfg);
  if (code) return `${dateStr}__CODE_${code}`;
  return `${dateStr}__TIME_${s?.startTime || ''}_${s?.endTime || ''}_${s?.shiftTypeName || s?.typeId || ''}`;
}

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
  const [shiftsLoaded, setShiftsLoaded] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [rosterVersion, setRosterVersion] = useState(0);

  const shiftsRef = useRef([]);
  const settingsRef = useRef(INITIAL_SETTINGS);
  const isCleaningDuplicatesRef = useRef(false);

  const loading = Boolean(currentUser) && (!shiftsLoaded || !settingsLoaded);

  // --- Listener: Shifts ---
  useEffect(() => {
    if (!currentUser || !db) {
      shiftsRef.current = [];
      setShifts([]);
      setShiftsLoaded(true);
      return;
    }

    setShiftsLoaded(false);

    // Reference: users/{uid}/shifts
    const q = query(
      collection(db, `users/${currentUser.uid}/shifts`),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const rawData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

      // Group by (date, code) to automatically detect and clean any duplicate shifts
      const groups = new Map();
      rawData.forEach(item => {
        const key = getShiftDedupeKey(item, settingsRef.current);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
      });

      const dedupedData = [];
      const duplicateIdsToDelete = [];

      groups.forEach(group => {
        if (group.length === 1) {
          dedupedData.push(group[0]);
          return;
        }

        // Sort so the richest / most recently updated shift wins
        group.sort((a, b) => {
          const bonusDiff = Number(Boolean(b.hasBonus)) - Number(Boolean(a.hasBonus));
          if (bonusDiff !== 0) return bonusDiff;
          const partnerDiff = Number(Boolean(b.partner && b.partner.trim())) - Number(Boolean(a.partner && a.partner.trim()));
          if (partnerDiff !== 0) return partnerDiff;
          return (b.updatedAt || b.timestamp || 0) - (a.updatedAt || a.timestamp || 0);
        });

        const winner = { ...group[0] };
        for (let i = 1; i < group.length; i++) {
          const loser = group[i];
          if (!winner.hasBonus && loser.hasBonus) {
            winner.hasBonus = true;
            winner.bonusAmount = loser.bonusAmount;
          }
          if ((!winner.partner || !winner.partner.trim()) && loser.partner && loser.partner.trim()) {
            winner.partner = loser.partner;
          }
          if (loser.id && loser.id !== winner.id) {
            duplicateIdsToDelete.push(loser.id);
          }
        }
        dedupedData.push(winner);
      });

      shiftsRef.current = dedupedData;
      setShifts(dedupedData);
      setShiftsLoaded(true);

      // Automatically remove duplicate documents from Firestore in the background
      if (duplicateIdsToDelete.length > 0 && !isCleaningDuplicatesRef.current) {
        isCleaningDuplicatesRef.current = true;
        const cleanBatch = writeBatch(db);
        duplicateIdsToDelete.forEach(dupId => {
          cleanBatch.delete(doc(db, `users/${currentUser.uid}/shifts`, dupId));
        });
        cleanBatch.commit()
          .catch(err => console.warn('Auto-deduplication batch warning:', err))
          .finally(() => {
            isCleaningDuplicatesRef.current = false;
          });
      }
    }, (error) => {
      console.error("Error fetching shifts:", error);
      setShiftsLoaded(true);
    });

    return unsubscribe;
  }, [currentUser]);

  // --- Listener: Settings ---
  useEffect(() => {
    if (!currentUser || !db) {
      setSettingsLoaded(true);
      return;
    }

    setSettingsLoaded(false);

    // Reference: users/{uid}/data/settings (Single Document)
    const settingsRefDoc = doc(db, `users/${currentUser.uid}/data`, 'settings');
    const unsubscribe = onSnapshot(settingsRefDoc, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        settingsRef.current = data;
        setSettings(data);
      } else {
        // Init if empty
        settingsRef.current = INITIAL_SETTINGS;
        setDoc(settingsRefDoc, INITIAL_SETTINGS).catch(e => console.error("Init Settings Failed", e));
      }
      setSettingsLoaded(true);
    }, () => {
      setSettingsLoaded(true);
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
    if (!currentUser || !shift) return;
    try {
      const currentShifts = shiftsRef.current || shifts || [];
      const key = getShiftDedupeKey(shift, settingsRef.current);
      const existingSame = !shift.id
        ? currentShifts.find(e => getShiftDedupeKey(e, settingsRef.current) === key)
        : null;
      const id = shift.id || existingSame?.id || crypto.randomUUID();
      const docData = {
        ...shift,
        id,
        updatedAt: Date.now()
      };
      // Optimistically update shiftsRef so back-to-back calls see this shift
      const idx = currentShifts.findIndex(e => e.id === id);
      if (idx !== -1) {
        const copy = [...currentShifts];
        copy[idx] = docData;
        shiftsRef.current = copy;
      } else {
        shiftsRef.current = [docData, ...currentShifts];
      }
      await setDoc(doc(db, `users/${currentUser.uid}/shifts`, id), docData);
    } catch (e) {
      console.error("Add Shift Failed", e);
      alert("Fehler beim Speichern: " + e.message);
    }
  };

  const addShifts = async (shiftsArray, overwriteExistingDates = false, replaceMonthYearMonth = null) => {
    if (!currentUser || !shiftsArray || shiftsArray.length === 0) return true;

    // 1. Deduplicate incoming shiftsArray by (date, code) so we never write duplicates from a single call
    const dedupedIncomingMap = new Map();
    shiftsArray.forEach(s => {
      if (!s || !s.date) return;
      const key = getShiftDedupeKey(s, settingsRef.current);
      dedupedIncomingMap.set(key, s);
    });
    const cleanIncoming = Array.from(dedupedIncomingMap.values());
    if (cleanIncoming.length === 0) return true;

    const currentShifts = [...(shiftsRef.current || shifts || [])];
    const currentSettings = settingsRef.current || settings || INITIAL_SETTINGS;

    try {
      const batch = writeBatch(db);
      const dateToMatchedPairs = {};
      const deletedIds = new Set();

      if (overwriteExistingDates) {
        const datesToOverwrite = new Set(cleanIncoming.map(s => s.date));

        // If replaceMonthYearMonth is passed (or if all incoming shifts belong to a single YYYY-MM),
        // also remove any obsolete shifts in that month whose dates are no longer in cleanIncoming.
        const monthPrefix =
          replaceMonthYearMonth && /^\d{4}-\d{2}$/.test(replaceMonthYearMonth)
            ? replaceMonthYearMonth
            : null;

        if (monthPrefix) {
          currentShifts.forEach(s => {
            if (s.date && s.date.startsWith(monthPrefix) && !datesToOverwrite.has(s.date) && s.id) {
              deletedIds.add(s.id);
              batch.delete(doc(db, `users/${currentUser.uid}/shifts`, s.id));
            }
          });
        }

        // Group existing shifts on the target dates by date
        const existingByDate = {};
        currentShifts
          .filter(s => datesToOverwrite.has(s.date) && !deletedIds.has(s.id))
          .forEach(s => {
            if (!existingByDate[s.date]) existingByDate[s.date] = [];
            existingByDate[s.date].push(s);
          });

        // Group incoming shifts by date
        const incomingByDate = {};
        cleanIncoming.forEach(s => {
          if (!incomingByDate[s.date]) incomingByDate[s.date] = [];
          incomingByDate[s.date].push(s);
        });

        Object.keys(incomingByDate).forEach(date => {
          const existingList = existingByDate[date] ? [...existingByDate[date]] : [];
          const incomingList = incomingByDate[date];
          const matchedPairs = [];

          incomingList.forEach(inc => {
            const incCode = resolveShiftCode(inc, currentSettings);
            // First try to match existing shift with identical code to keep IDs / bonus settings
            const matchIdx = existingList.findIndex(
              e => resolveShiftCode(e, currentSettings) === incCode
            );
            if (matchIdx !== -1) {
              matchedPairs.push({ incoming: inc, prev: existingList.splice(matchIdx, 1)[0] });
            } else if (existingList.length > 0) {
              matchedPairs.push({ incoming: inc, prev: existingList.shift() });
            } else {
              matchedPairs.push({ incoming: inc, prev: null });
            }
          });

          // Any remaining existing shifts (or old duplicates) on this date are deleted
          existingList.forEach(extra => {
            if (extra.id) {
              deletedIds.add(extra.id);
              batch.delete(doc(db, `users/${currentUser.uid}/shifts`, extra.id));
            }
          });

          dateToMatchedPairs[date] = matchedPairs;
        });
      }

      const writtenShiftsById = new Map();

      cleanIncoming.forEach(shift => {
        let prevShift = null;
        if (overwriteExistingDates && dateToMatchedPairs[shift.date]) {
          const matchIdx = dateToMatchedPairs[shift.date].findIndex(p => p.incoming === shift);
          if (matchIdx !== -1) {
            prevShift = dateToMatchedPairs[shift.date].splice(matchIdx, 1)[0].prev;
          }
        } else {
          // Even when overwriteExistingDates is false, reuse existing document ID if same (date, code) or same id exists
          const key = getShiftDedupeKey(shift, currentSettings);
          prevShift =
            (shift.id && currentShifts.find(e => e.id === shift.id)) ||
            currentShifts.find(e => !deletedIds.has(e.id) && getShiftDedupeKey(e, currentSettings) === key) ||
            null;
        }

        const id = prevShift?.id || shift.id || crypto.randomUUID();
        const ref = doc(db, `users/${currentUser.uid}/shifts`, id);
        const docPayload = {
          ...shift,
          id,
          hasBonus: shift.hasBonus !== undefined ? shift.hasBonus : Boolean(prevShift?.hasBonus),
          bonusAmount: shift.bonusAmount !== undefined ? shift.bonusAmount : (prevShift?.bonusAmount ?? (currentSettings?.defaultBonusAmount ?? 75)),
          partner: shift.partner || prevShift?.partner || '',
          timestamp: prevShift?.timestamp || shift.timestamp || Date.now(),
          updatedAt: Date.now()
        };
        writtenShiftsById.set(id, docPayload);
        batch.set(ref, docPayload);
      });

      // Optimistically update shiftsRef.current before awaiting commit so concurrent calls never duplicate
      const nextShifts = currentShifts
        .filter(s => !deletedIds.has(s.id) && !writtenShiftsById.has(s.id))
        .concat(Array.from(writtenShiftsById.values()));
      shiftsRef.current = nextShifts;

      await batch.commit();
      return true;
    } catch (e) {
      console.warn("Batch failed, attempting fallback:", e);
      try {
        await Promise.all(cleanIncoming.map(shift => {
          const key = getShiftDedupeKey(shift, currentSettings);
          const existingSame = currentShifts.find(e => getShiftDedupeKey(e, currentSettings) === key);
          const id = shift.id || existingSame?.id || crypto.randomUUID();
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
    if (!currentUser) return settingsRef.current || settings;
    const baseSettings = settingsRef.current || settings || INITIAL_SETTINGS;
    let settingsUpdated = false;
    let currentCodes = [...(baseSettings?.shiftCodes || [])];
    let currentTypes = [...(baseSettings?.shiftTypes || [])];

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
        ...baseSettings,
        shiftCodes: currentCodes,
        shiftTypes: currentTypes
      };
      settingsRef.current = newSettings;
      setSettings(newSettings);
      await _updateSettingsDoc(newSettings);
      return newSettings;
    }
    return baseSettings;
  };

  const deleteShift = async (id) => {
    if (!currentUser) return;
    try {
      shiftsRef.current = (shiftsRef.current || []).filter(s => s.id !== id);
      await deleteDoc(doc(db, `users/${currentUser.uid}/shifts`, id));
      try { sessionStorage.setItem('careman_allow_reimport_after_tab_switch', '1'); } catch {}
    } catch (e) {
      console.error("Delete Shift Failed", e);
    }
  };

  const deleteShifts = async (shiftIds = []) => {
    if (!currentUser || !shiftIds || shiftIds.length === 0) return true;
    try {
      const idSet = new Set(shiftIds);
      shiftsRef.current = (shiftsRef.current || []).filter(s => !idSet.has(s.id));
      const batch = writeBatch(db);
      shiftIds.forEach(id => {
        batch.delete(doc(db, `users/${currentUser.uid}/shifts`, id));
      });
      await batch.commit();
      try { sessionStorage.setItem('careman_allow_reimport_after_tab_switch', '1'); } catch {}
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
    loading,
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
