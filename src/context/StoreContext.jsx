import React, { createContext, useContext, useEffect, useState } from 'react';

const StoreContext = createContext();

const INITIAL_DATA = {
  shifts: [],
  settings: {
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
  }
};

export function StoreProvider({ children }) {
  const [store, setStore] = useState(() => {
    const saved = localStorage.getItem('schicht_app_v1');
    return saved ? JSON.parse(saved) : INITIAL_DATA;
  });

  useEffect(() => {
    localStorage.setItem('schicht_app_v1', JSON.stringify(store));
  }, [store]);

  const addShift = (shift) => {
    setStore(prev => ({
      ...prev,
      shifts: [shift, ...prev.shifts] // Newest first
    }));
  };

  const deleteShift = (id) => {
    setStore(prev => ({
      ...prev,
      shifts: prev.shifts.filter(s => s.id !== id)
    }));
  };

  const updateSettings = (category, items) => {
    setStore(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        [category]: items
      }
    }));
  };

  const addSettingItem = (category, item) => {
    setStore(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        [category]: [...prev.settings[category], item]
      }
    }));
  };

  const removeSettingItem = (category, id) => {
    // Check if item has ID, otherwise filter by value string
    setStore(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        [category]: prev.settings[category].filter(i => (i.id ? i.id !== id : i !== id))
      }
    }));
  };

  return (
    <StoreContext.Provider value={{ store, addShift, deleteShift, updateSettings, addSettingItem, removeSettingItem }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  return useContext(StoreContext);
}
