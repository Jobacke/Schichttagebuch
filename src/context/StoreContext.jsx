import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import { collection, doc, setDoc, onSnapshot, query, orderBy, deleteDoc, writeBatch } from 'firebase/firestore';
import {
  syncTeamRostersWithCloud,
  subscribeToCloudTeamRosters,
  getActiveTeamRoster,
  extractPersonalShiftsFromRoster,
  getPartnersForShiftFromRoster,
  isValidPersonalShiftCode
} from '../utils/teamRosterParser';
import { SHIFT_PRESETS, getPresetForCode, buildShiftFromPreset, CAREMAN_NOVEMBER_2026_BACKHAUS } from '../utils/shiftPresets';

const StoreContext = createContext();

const REAL_SHIFT_TYPES = [
  { id: 'type_frueh', name: 'Frühschicht' },
  { id: 'type_tag', name: 'Tagschicht' },
  { id: 'type_spaat', name: 'Spätschicht' },
  { id: 'type_nacht', name: 'Nachtschicht' },
  { id: 'type_fobi', name: 'Fortbildung' },
  { id: 'type_sonder', name: 'Sonderdienst' }
];

const REAL_STATIONS = [
  'Wache Sendling',
  'Wache Obersendling',
  'Wache Hohenbrunn'
];

const REAL_VEHICLES = [
  'RTW Akkon Sendling 71/1',
  'RTW Akkon Sendling 71/2',
  'RTW Akkon Obersendling 71/1',
  'RTW Akkon Hohenbrunn 71/1',
  'RTW Akkon HBN 71/1',
  'RTW Akkon HBN 71/2',
  'KTW Akkon Sendling 72/1',
  'KTW Akkon Sendling 72/2',
  'KTW Akkon Sendling 72/3'
];

const REAL_CALL_SIGNS = [
  'Akkon Sendling 71/1',
  'Akkon Sendling 71/2',
  'Akkon Obersendling 71/1',
  'Akkon Hohenbrunn 71/1',
  'Akkon HBN 71/1',
  'Akkon HBN 71/2',
  'Akkon Sendling 72/1',
  'Akkon Sendling 72/2',
  'Akkon Sendling 72/3'
];

const REAL_SHIFT_CODES = Object.values(SHIFT_PRESETS).map(p => ({
  id: `preset_${p.code}`,
  code: p.code,
  hours: p.hours,
  startTime: p.startTime,
  endTime: p.endTime,
  shiftTypeName: p.shiftTypeName,
  station: p.station,
  vehicle: p.vehicle,
  callSign: p.callSign
}));

const INITIAL_SETTINGS = {
  shiftTypes: REAL_SHIFT_TYPES,
  shiftCodes: REAL_SHIFT_CODES,
  vehicles: REAL_VEHICLES,
  callSigns: REAL_CALL_SIGNS,
  stations: REAL_STATIONS,
  defaultWeeklyHours: 20,
  monthlyWeeklyHours: {},
  defaultBonusAmount: 75
};

const FANTASY_STATIONS = new Set(['Hauptwache', 'Nordwache', 'Südwache']);
const FANTASY_VEHICLES = new Set(['R-RTW-1', 'R-NEF-1', 'R-KdoW-1']);
const FANTASY_CALL_SIGNS = new Set(['Florian 1/83/1', 'Florian 1/76/1', 'Florian 1/10/1']);
const FANTASY_SHIFT_TYPES = new Set(['tagdienst', 'nachtdienst', 'zwischendienst']);
const FANTASY_SHIFT_CODES = new Set(['T', 'N', 'K']);

function sanitizeAndMigrateSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  let changed = false;

  // 1. Stations
  const rawStations = Array.isArray(src.stations) ? src.stations : [];
  const filteredStations = rawStations.filter(st => st && !FANTASY_STATIONS.has(st));
  if (filteredStations.length !== rawStations.length) changed = true;
  const stationSet = new Set(filteredStations);
  REAL_STATIONS.forEach(st => {
    if (!stationSet.has(st)) {
      filteredStations.push(st);
      stationSet.add(st);
      changed = true;
    }
  });

  // 2. Vehicles
  const rawVehicles = Array.isArray(src.vehicles) ? src.vehicles : [];
  const filteredVehicles = rawVehicles.filter(v => v && !FANTASY_VEHICLES.has(v));
  if (filteredVehicles.length !== rawVehicles.length) changed = true;
  const vehicleSet = new Set(filteredVehicles);
  REAL_VEHICLES.forEach(v => {
    if (!vehicleSet.has(v)) {
      filteredVehicles.push(v);
      vehicleSet.add(v);
      changed = true;
    }
  });

  // 3. CallSigns
  const rawCallSigns = Array.isArray(src.callSigns) ? src.callSigns : [];
  const filteredCallSigns = rawCallSigns.filter(cs => cs && !FANTASY_CALL_SIGNS.has(cs));
  if (filteredCallSigns.length !== rawCallSigns.length) changed = true;
  const callSignSet = new Set(filteredCallSigns);
  REAL_CALL_SIGNS.forEach(cs => {
    if (!callSignSet.has(cs)) {
      filteredCallSigns.push(cs);
      callSignSet.add(cs);
      changed = true;
    }
  });

  // 4. ShiftTypes
  const rawTypes = Array.isArray(src.shiftTypes) ? src.shiftTypes : [];
  const seenTypeNames = new Set();
  const filteredTypes = [];
  rawTypes.forEach(t => {
    const nameStr = String(t?.name || '').trim();
    const lower = nameStr.toLowerCase();
    if (!nameStr || FANTASY_SHIFT_TYPES.has(lower) || seenTypeNames.has(lower)) {
      changed = true;
      return;
    }
    seenTypeNames.add(lower);
    filteredTypes.push({ id: t.id || `type_${lower}`, name: nameStr });
  });
  REAL_SHIFT_TYPES.forEach(rt => {
    const lower = rt.name.toLowerCase();
    if (!seenTypeNames.has(lower)) {
      seenTypeNames.add(lower);
      filteredTypes.push(rt);
      changed = true;
    }
  });

  // 5. ShiftCodes
  const rawCodes = Array.isArray(src.shiftCodes) ? src.shiftCodes : [];
  const seenCodes = new Set();
  const filteredCodes = [];
  rawCodes.forEach(c => {
    const codeStr = String(c?.code || '').trim().toUpperCase();
    if (!codeStr || FANTASY_SHIFT_CODES.has(codeStr) || !isValidPersonalShiftCode(codeStr) || seenCodes.has(codeStr)) {
      changed = true;
      return;
    }
    seenCodes.add(codeStr);
    const preset = SHIFT_PRESETS[codeStr] || getPresetForCode(codeStr) || {};
    const enriched = {
      ...c,
      id: c.id || `preset_${codeStr}`,
      code: codeStr,
      hours: c.hours ?? preset.hours ?? 8.2,
      startTime: c.startTime || preset.startTime || '06:54',
      endTime: c.endTime || preset.endTime || '15:06',
      shiftTypeName: (!c.shiftTypeName || FANTASY_SHIFT_TYPES.has(String(c.shiftTypeName).toLowerCase()))
        ? (preset.shiftTypeName || 'Frühschicht')
        : c.shiftTypeName,
      station: (!c.station || FANTASY_STATIONS.has(c.station))
        ? (preset.station || 'Wache Sendling')
        : c.station,
      vehicle: (!c.vehicle || FANTASY_VEHICLES.has(c.vehicle))
        ? (preset.vehicle || 'RTW Akkon Sendling 71/1')
        : c.vehicle,
      callSign: (!c.callSign || FANTASY_CALL_SIGNS.has(c.callSign))
        ? (preset.callSign || 'Akkon Sendling 71/1')
        : c.callSign
    };
    if (
      enriched.startTime !== c.startTime ||
      enriched.endTime !== c.endTime ||
      enriched.station !== c.station ||
      enriched.vehicle !== c.vehicle ||
      enriched.callSign !== c.callSign ||
      enriched.shiftTypeName !== c.shiftTypeName
    ) {
      changed = true;
    }
    filteredCodes.push(enriched);
  });
  REAL_SHIFT_CODES.forEach(rc => {
    if (!seenCodes.has(rc.code)) {
      seenCodes.add(rc.code);
      filteredCodes.push(rc);
      changed = true;
    }
  });

  const cleaned = {
    ...INITIAL_SETTINGS,
    ...src,
    stations: filteredStations,
    vehicles: filteredVehicles,
    callSigns: filteredCallSigns,
    shiftTypes: filteredTypes,
    shiftCodes: filteredCodes,
    defaultWeeklyHours: src.defaultWeeklyHours !== undefined ? Number(src.defaultWeeklyHours) : INITIAL_SETTINGS.defaultWeeklyHours,
    monthlyWeeklyHours: src.monthlyWeeklyHours || src.monthlyTargets || INITIAL_SETTINGS.monthlyWeeklyHours,
    defaultBonusAmount: src.defaultBonusAmount !== undefined ? Number(src.defaultBonusAmount) : INITIAL_SETTINGS.defaultBonusAmount
  };

  return { cleaned, changed };
}

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
  // true once the shifts came from the server (not only from the local cache)
  const [shiftsSynced, setShiftsSynced] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [rosterVersion, setRosterVersion] = useState(0);

  const shiftsRef = useRef([]);
  const settingsRef = useRef(INITIAL_SETTINGS);
  const isCleaningDuplicatesRef = useRef(false);
  const pendingOptimisticWritesRef = useRef(new Map());
  const pendingOptimisticDeletesRef = useRef(new Set());

  const loading = Boolean(currentUser) && (!shiftsLoaded || !settingsLoaded);

  // --- Listener: Shifts ---
  useEffect(() => {
    if (!currentUser || !db) {
      shiftsRef.current = [];
      setShifts([]);
      setShiftsLoaded(true);
      return;
    }

    const shiftsCacheKey = `schichttagebuch_cache_shifts_${currentUser.uid}`;
    let hydratedFromCache = false;
    setShiftsSynced(false);
    try {
      const rawCache = localStorage.getItem(shiftsCacheKey);
      if (rawCache) {
        const parsedCache = JSON.parse(rawCache);
        if (Array.isArray(parsedCache)) {
          shiftsRef.current = parsedCache;
          setShifts(parsedCache);
          setShiftsLoaded(true);
          hydratedFromCache = true;
        }
      }
    } catch {
      /* ignore cache read error */
    }
    if (!hydratedFromCache) {
      setShiftsLoaded(false);
    }

    // Reference: users/{uid}/shifts
    const q = query(
      collection(db, `users/${currentUser.uid}/shifts`),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.metadata?.fromCache) setShiftsSynced(true);
      const rawSnapshotDocs = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(d => !pendingOptimisticDeletesRef.current.has(d.id));

      // Merge any in-flight optimistic writes so a fast page-load import never flickers
      const mergedMap = new Map();
      rawSnapshotDocs.forEach(d => mergedMap.set(d.id, d));
      pendingOptimisticWritesRef.current.forEach((optShift, optId) => {
        if (!pendingOptimisticDeletesRef.current.has(optId)) {
          mergedMap.set(optId, optShift);
        }
      });
      const rawData = Array.from(mergedMap.values());

      // Group by (date, code) to automatically detect and clean any duplicate shifts
      const groups = new Map();
      rawData.forEach(item => {
        const key = getShiftDedupeKey(item, settingsRef.current);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
      });

      const dedupedData = [];
      const duplicateIdsToDelete = [];
      const shiftsToUpsertInCleanup = [];

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

      // Self-heal shifts corrupted by the v2.2.23 Istplan start-hour bug or the v2.2.26 non-shift holiday/KW/-- bug
      const ghostIdsSet = new Set();
      const hourDaysSet = new Set([6, 7, 8, 14, 15, 19, 22]);
      const monthsWithGarbage = new Set();

      dedupedData.forEach(s => {
        const code = resolveShiftCode(s, settingsRef.current);
        if (code && !isValidPersonalShiftCode(code)) {
          ghostIdsSet.add(s.id);
          duplicateIdsToDelete.push(s.id);
          const ym = (s.date || '').slice(0, 7);
          if (/^\d{4}-\d{2}$/.test(ym)) monthsWithGarbage.add(ym);
          return;
        }
        // Automatically repair any valid shift that previously got fantasy fallback values ("Hauptwache" / "R-RTW-1" / "Florian..." / "Tagdienst")
        if (
          code &&
          (!s.station ||
            FANTASY_STATIONS.has(s.station) ||
            FANTASY_VEHICLES.has(s.vehicle) ||
            FANTASY_CALL_SIGNS.has(s.callSign) ||
            FANTASY_SHIFT_TYPES.has(String(s.shiftTypeName || '').toLowerCase()))
        ) {
          const preset = getPresetForCode(code);
          if (preset && preset.station && !FANTASY_STATIONS.has(preset.station)) {
            s.station = preset.station;
            s.vehicle = preset.vehicle || s.vehicle;
            s.callSign = preset.callSign || s.callSign;
            s.shiftTypeName = preset.shiftTypeName || s.shiftTypeName;
            shiftsToUpsertInCleanup.push({ ...s, updatedAt: Date.now() });
          }
        }
      });

      const byMonth = new Map();
      dedupedData.forEach(s => {
        const ym = (s.date || '').slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(ym)) return;
        if (!byMonth.has(ym)) byMonth.set(ym, []);
        byMonth.get(ym).push(s);
      });

      byMonth.forEach((mShifts, ym) => {
        const roster = getActiveTeamRoster(ym);
        const hasFullRoster = (roster?.colleagues?.length || 0) >= 5;
        let validPersonal = hasFullRoster ? extractPersonalShiftsFromRoster(ym, roster) : [];

        if (validPersonal.length === 0 && ym === '2026-11') {
          validPersonal = CAREMAN_NOVEMBER_2026_BACKHAUS.map(item => ({
            date: `2026-11-${String(item.day).padStart(2, '0')}`,
            code: item.code,
            startTime: item.startTime,
            endTime: item.endTime
          }));
        }

        if (validPersonal.length > 0) {
          const validDateCodeSet = new Set(validPersonal.map(p => `${p.date}_${p.code.toUpperCase()}`));
          const validDatesMap = new Map();
          validPersonal.forEach(p => validDatesMap.set(p.date, p));
          let monthHadGhost = monthsWithGarbage.has(ym);

          mShifts.forEach(s => {
            if (ghostIdsSet.has(s.id)) return;
            const code = resolveShiftCode(s, settingsRef.current);
            const dayNum = parseInt((s.date || '').split('-')[2], 10);
            const startHour = parseInt((s.startTime || '').split(':')[0], 10);
            const isExactValid = validDateCodeSet.has(`${s.date}_${code}`);

            if (!isExactValid && ym === '2026-11' && hourDaysSet.has(dayNum) && dayNum === startHour) {
              monthHadGhost = true;
              const expectedOnDate = validDatesMap.get(s.date);
              if (!expectedOnDate) {
                // Ghost shift on a free day (e.g. 14.11. RSM, 15.11. RT4M, 22.11. RNM)
                ghostIdsSet.add(s.id);
                duplicateIdsToDelete.push(s.id);
              } else if (expectedOnDate.code.toUpperCase() !== code) {
                // Wrong shift code on a real workday (e.g. 06.11. RFM instead of RT4M)
                const alreadyHasExpected = mShifts.some(
                  other => other.id !== s.id && other.date === s.date && resolveShiftCode(other, settingsRef.current) === expectedOnDate.code.toUpperCase()
                );
                if (alreadyHasExpected) {
                  ghostIdsSet.add(s.id);
                  duplicateIdsToDelete.push(s.id);
                } else {
                  const partnerStr = getPartnersForShiftFromRoster(s.date, expectedOnDate.code, roster) || '';
                  const rebuilt = buildShiftFromPreset({
                    dateStr: s.date,
                    code: expectedOnDate.code,
                    partner: partnerStr,
                    storeSettings: settingsRef.current
                  });
                  const fixedShift = {
                    ...s,
                    ...rebuilt,
                    id: s.id,
                    hasBonus: Boolean(s.hasBonus),
                    bonusAmount: s.bonusAmount ?? (settingsRef.current?.defaultBonusAmount ?? 75),
                    partner: partnerStr,
                    updatedAt: Date.now()
                  };
                  Object.assign(s, fixedShift);
                  shiftsToUpsertInCleanup.push(fixedShift);
                }
              }
            } else if (isExactValid) {
              // Check if personalTimes start-hour bug overwrote the time of a valid shift (e.g. 06.11. RT4M given 06:54 - 15:06)
              const preset = getPresetForCode(code);
              let needsUpsert = false;
              if (preset && preset.startTime && s.startTime && s.startTime !== preset.startTime) {
                const presetHour = parseInt(preset.startTime.split(':')[0], 10);
                if (Math.abs(startHour - presetHour) >= 6 && dayNum === startHour) {
                  monthHadGhost = true;
                  s.startTime = preset.startTime;
                  s.endTime = preset.endTime;
                  needsUpsert = true;
                }
              }
              const detectedPartner = getPartnersForShiftFromRoster(s.date, code, roster) || '';
              const curPartner = (s.partner || '').trim();
              if (detectedPartner && curPartner !== detectedPartner && (!curPartner || curPartner.startsWith('mit '))) {
                s.partner = detectedPartner;
                needsUpsert = true;
              }
              if (needsUpsert) {
                shiftsToUpsertInCleanup.push({ ...s, updatedAt: Date.now() });
              }
            }
          });

          // If this month was hit by the Istplan start-hour bug, ensure all valid personal shifts for this month are present
          if (monthHadGhost) {
            validPersonal.forEach(vp => {
              const vpCode = vp.code.toUpperCase();
              const existsNow = mShifts.some(
                s => !ghostIdsSet.has(s.id) && s.date === vp.date && resolveShiftCode(s, settingsRef.current) === vpCode
              );
              if (!existsNow) {
                const partnerStr = vp.partner || getPartnersForShiftFromRoster(vp.date, vpCode, roster) || '';
                const rebuilt = buildShiftFromPreset({
                  dateStr: vp.date,
                  code: vpCode,
                  partner: partnerStr,
                  storeSettings: settingsRef.current
                });
                const restored = {
                  ...rebuilt,
                  startTime: vp.startTime || rebuilt.startTime,
                  endTime: vp.endTime || rebuilt.endTime,
                  partner: partnerStr,
                  updatedAt: Date.now()
                };
                dedupedData.push(restored);
                shiftsToUpsertInCleanup.push(restored);
              }
            });
          }
        } else if (mShifts.length > 0 && mShifts.length <= 6) {
          // If a month has no full roster and ALL shifts in that month sit on their start-time hour (6, 14, 15, 22), remove them
          const allMatchStartHour = mShifts.every(s => {
            const dNum = parseInt((s.date || '').split('-')[2], 10);
            const sHour = parseInt((s.startTime || '').split(':')[0], 10);
            return hourDaysSet.has(dNum) && dNum === sHour;
          });
          if (allMatchStartHour) {
            mShifts.forEach(s => {
              ghostIdsSet.add(s.id);
              duplicateIdsToDelete.push(s.id);
            });
          }
        }
      });

      const finalShifts = dedupedData.filter(s => !ghostIdsSet.has(s.id));

      shiftsRef.current = finalShifts;
      setShifts(finalShifts);
      setShiftsLoaded(true);
      try {
        localStorage.setItem(shiftsCacheKey, JSON.stringify(finalShifts));
      } catch {
        /* ignore storage quota error */
      }

      // Automatically remove duplicate/ghost documents and repair overwritten shifts in Firestore in the background
      if ((duplicateIdsToDelete.length > 0 || shiftsToUpsertInCleanup.length > 0) && !isCleaningDuplicatesRef.current) {
        isCleaningDuplicatesRef.current = true;
        const cleanBatch = writeBatch(db);
        duplicateIdsToDelete.forEach(dupId => {
          cleanBatch.delete(doc(db, `users/${currentUser.uid}/shifts`, dupId));
        });
        shiftsToUpsertInCleanup.forEach(fixed => {
          cleanBatch.set(doc(db, `users/${currentUser.uid}/shifts`, fixed.id), fixed);
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

    const settingsCacheKey = `schichttagebuch_cache_settings_${currentUser.uid}`;
    let hydratedSettingsFromCache = false;
    try {
      const rawSettingsCache = localStorage.getItem(settingsCacheKey);
      if (rawSettingsCache) {
        const parsedSettings = JSON.parse(rawSettingsCache);
        if (parsedSettings && typeof parsedSettings === 'object') {
          const { cleaned } = sanitizeAndMigrateSettings(parsedSettings);
          settingsRef.current = cleaned;
          setSettings(cleaned);
          setSettingsLoaded(true);
          hydratedSettingsFromCache = true;
        }
      }
    } catch {
      /* ignore cache read error */
    }
    if (!hydratedSettingsFromCache) {
      setSettingsLoaded(false);
    }

    // Reference: users/{uid}/data/settings (Single Document)
    const settingsRefDoc = doc(db, `users/${currentUser.uid}/data`, 'settings');
    const unsubscribe = onSnapshot(settingsRefDoc, (docSnap) => {
      if (docSnap.exists()) {
        const rawData = docSnap.data();
        const { cleaned, changed } = sanitizeAndMigrateSettings(rawData);
        if (changed) {
          setDoc(settingsRefDoc, cleaned).catch(() => {});
        }
        settingsRef.current = cleaned;
        setSettings(cleaned);
        try {
          localStorage.setItem(settingsCacheKey, JSON.stringify(cleaned));
        } catch {
          /* ignore */
        }
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

    let unsubscribe = () => {};
    // Defer heavy team_rosters collection snapshot slightly so shifts & settings finish loading first
    const timer = setTimeout(() => {
      unsubscribe = subscribeToCloudTeamRosters(currentUser, () => {
        setRosterVersion(v => v + 1);
      });
    }, 350);

    const onLocalSync = () => setRosterVersion(v => v + 1);
    if (typeof window !== 'undefined') {
      window.addEventListener('careman-oneclick-synced', onLocalSync);
    }

    return () => {
      clearTimeout(timer);
      unsubscribe();
      if (typeof window !== 'undefined') {
        window.removeEventListener('careman-oneclick-synced', onLocalSync);
      }
    };
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

      const bonusByDateCode = new Map();

      if (overwriteExistingDates) {
        const datesToOverwrite = new Set(cleanIncoming.map(s => s.date));

        // If replaceMonthYearMonth is passed, wipe ALL existing shifts in that month first
        // (preserving only user-set bonus flags by date+code) and then insert the fresh month shifts cleanly!
        const monthPrefix =
          replaceMonthYearMonth && /^\d{4}-\d{2}$/.test(replaceMonthYearMonth)
            ? replaceMonthYearMonth
            : null;

        if (monthPrefix) {
          currentShifts.forEach(s => {
            if (s.date && s.date.startsWith(monthPrefix)) {
              const bKey = `${s.date}_${resolveShiftCode(s, currentSettings)}`;
              if (s.hasBonus) {
                bonusByDateCode.set(bKey, { hasBonus: true, bonusAmount: s.bonusAmount });
              }
              if (s.id) {
                deletedIds.add(s.id);
                batch.delete(doc(db, `users/${currentUser.uid}/shifts`, s.id));
              }
            }
          });
        }

        // Group any remaining existing shifts on the target dates by date (when replaceMonthYearMonth is not set)
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

        const savedBonus = bonusByDateCode.get(`${shift.date}_${resolveShiftCode(shift, currentSettings)}`);
        const id = prevShift?.id || shift.id || crypto.randomUUID();
        const ref = doc(db, `users/${currentUser.uid}/shifts`, id);
        const docPayload = {
          ...shift,
          id,
          hasBonus: shift.hasBonus !== undefined ? shift.hasBonus : Boolean(prevShift?.hasBonus || savedBonus?.hasBonus),
          bonusAmount: shift.bonusAmount !== undefined ? shift.bonusAmount : (prevShift?.bonusAmount ?? savedBonus?.bonusAmount ?? (currentSettings?.defaultBonusAmount ?? 75)),
          partner: shift.partner !== undefined ? shift.partner : (prevShift?.partner || ''),
          timestamp: prevShift?.timestamp || shift.timestamp || Date.now(),
          updatedAt: Date.now()
        };
        writtenShiftsById.set(id, docPayload);
        batch.set(ref, docPayload);
      });

      // Track optimistic writes & deletes so an in-flight Firestore snapshot never reverts them
      deletedIds.forEach(delId => {
        pendingOptimisticDeletesRef.current.add(delId);
        pendingOptimisticWritesRef.current.delete(delId);
      });
      writtenShiftsById.forEach((docPayload, docId) => {
        pendingOptimisticDeletesRef.current.delete(docId);
        pendingOptimisticWritesRef.current.set(docId, docPayload);
      });

      // Optimistically update shiftsRef.current AND React state immediately (0ms UI update!)
      const nextShifts = currentShifts
        .filter(s => !deletedIds.has(s.id) && !writtenShiftsById.has(s.id))
        .concat(Array.from(writtenShiftsById.values()));
      shiftsRef.current = nextShifts;
      setShifts(nextShifts);
      try {
        localStorage.setItem(`schichttagebuch_cache_shifts_${currentUser.uid}`, JSON.stringify(nextShifts));
      } catch {
        /* ignore */
      }

      // Commit to Firestore asynchronously so the Journal UI renders in < 10ms without waiting on network latency
      batch.commit()
        .then(() => {
          setTimeout(() => {
            deletedIds.forEach(delId => pendingOptimisticDeletesRef.current.delete(delId));
            writtenShiftsById.forEach((_, docId) => pendingOptimisticWritesRef.current.delete(docId));
          }, 4000);
        })
        .catch(e => {
          console.warn("Batch failed, attempting fallback:", e);
          Promise.all(cleanIncoming.map(shift => {
            const key = getShiftDedupeKey(shift, currentSettings);
            const existingSame = currentShifts.find(el => getShiftDedupeKey(el, currentSettings) === key);
            const id = shift.id || existingSame?.id || crypto.randomUUID();
            return setDoc(doc(db, `users/${currentUser.uid}/shifts`, id), {
              ...shift,
              id,
              timestamp: shift.timestamp || Date.now(),
              updatedAt: Date.now()
            });
          })).catch(err => {
            console.error("Batch Add Shifts Failed", err);
          });
        });
      return true;
    } catch (e) {
      console.error("Prepare Shifts Failed", e);
      return false;
    }
  };

  const ensureCodesAndTypes = async (requiredCodes = [], requiredTypes = []) => {
    if (!currentUser) return settingsRef.current || settings;
    const { cleaned: baseSettings } = sanitizeAndMigrateSettings(settingsRef.current || settings || INITIAL_SETTINGS);
    let settingsUpdated = false;
    let currentCodes = [...(baseSettings?.shiftCodes || [])];
    let currentTypes = [...(baseSettings?.shiftTypes || [])];

    requiredCodes.forEach(rc => {
      const codeStr = (typeof rc === 'string' ? rc : rc.code || '').trim().toUpperCase();
      if (!codeStr || FANTASY_SHIFT_CODES.has(codeStr) || !isValidPersonalShiftCode(codeStr)) return;
      const preset = SHIFT_PRESETS[codeStr] || getPresetForCode(codeStr) || {};
      const hoursNum = typeof rc === 'object' && rc.hours ? rc.hours : (preset.hours ?? 8.2);
      if (!currentCodes.some(c => c.code.toLowerCase() === codeStr.toLowerCase())) {
        currentCodes.push({
          id: `preset_${codeStr}`,
          code: codeStr,
          hours: hoursNum,
          startTime: preset.startTime || '06:54',
          endTime: preset.endTime || '15:06',
          shiftTypeName: preset.shiftTypeName || 'Frühschicht',
          station: preset.station || 'Wache Sendling',
          vehicle: preset.vehicle || 'RTW Akkon Sendling 71/1',
          callSign: preset.callSign || 'Akkon Sendling 71/1'
        });
        settingsUpdated = true;
      }
    });

    requiredTypes.forEach(rt => {
      const nameStr = (typeof rt === 'string' ? rt : rt.name || '').trim();
      if (!nameStr || FANTASY_SHIFT_TYPES.has(nameStr.toLowerCase())) return;
      if (!currentTypes.some(t => t.name.toLowerCase() === nameStr.toLowerCase())) {
        currentTypes.push({
          id: `type_${nameStr.toLowerCase()}`,
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
      try {
        localStorage.setItem(`schichttagebuch_cache_settings_${currentUser.uid}`, JSON.stringify(newSettings));
      } catch {
        /* ignore */
      }
      _updateSettingsDoc(newSettings).catch(err => console.error("Update settings failed:", err));
      return newSettings;
    }
    return baseSettings;
  };

  const deleteShift = async (id) => {
    if (!currentUser) return;
    try {
      pendingOptimisticDeletesRef.current.add(id);
      pendingOptimisticWritesRef.current.delete(id);
      const next = (shiftsRef.current || []).filter(s => s.id !== id);
      shiftsRef.current = next;
      setShifts(next);
      try {
        localStorage.setItem(`schichttagebuch_cache_shifts_${currentUser.uid}`, JSON.stringify(next));
      } catch {}
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
      shiftIds.forEach(id => {
        pendingOptimisticDeletesRef.current.add(id);
        pendingOptimisticWritesRef.current.delete(id);
      });
      const next = (shiftsRef.current || []).filter(s => !idSet.has(s.id));
      shiftsRef.current = next;
      setShifts(next);
      try {
        localStorage.setItem(`schichttagebuch_cache_shifts_${currentUser.uid}`, JSON.stringify(next));
        sessionStorage.setItem('careman_allow_reimport_after_tab_switch', '1');
      } catch {}
      const batch = writeBatch(db);
      shiftIds.forEach(id => {
        batch.delete(doc(db, `users/${currentUser.uid}/shifts`, id));
      });
      batch.commit()
        .then(() => {
          setTimeout(() => {
            shiftIds.forEach(id => pendingOptimisticDeletesRef.current.delete(id));
          }, 4000);
        })
        .catch(e => {
          console.warn("Batch delete failed, attempting fallback:", e);
          Promise.all(shiftIds.map(id => deleteDoc(doc(db, `users/${currentUser.uid}/shifts`, id)))).catch(err => {
            console.error("Delete Shifts Failed", err);
          });
        });
      return true;
    } catch (e) {
      console.error("Prepare Delete Shifts Failed", e);
      return false;
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
    shiftsSynced,
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
