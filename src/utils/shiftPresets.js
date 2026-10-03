// Schicht-Presets: Definiert automatische Werte für Schicht-Kürzel
export const SHIFT_PRESETS = {
  // Hohenbrunn Schichten
  'RFH': {
    code: 'RFH',
    shiftTypeName: 'Frühschicht',
    startTime: '06:54',
    endTime: '15:06',
    hours: 8.2,
    station: 'Wache Hohenbrunn',
    vehicle: 'RTW Akkon Hohenbrunn 71/1',
    callSign: 'Akkon Hohenbrunn 71/1'
  },
  'RTH': {
    code: 'RTH',
    shiftTypeName: 'Tagschicht',
    startTime: '08:54',
    endTime: '19:06',
    hours: 10.2,
    station: 'Wache Hohenbrunn',
    vehicle: 'RTW Akkon HBN 71/2',
    callSign: 'Akkon HBN 71/2'
  },
  'RT1H': {
    code: 'RT1H',
    shiftTypeName: 'Tagschicht',
    startTime: '08:54',
    endTime: '15:06',
    hours: 6.2,
    station: 'Wache Hohenbrunn',
    vehicle: 'RTW Akkon HBN 71/2',
    callSign: 'Akkon HBN 71/2'
  },
  'RT2H': {
    code: 'RT2H',
    shiftTypeName: 'Tagschicht',
    startTime: '14:54',
    endTime: '21:06',
    hours: 6.2,
    station: 'Wache Hohenbrunn',
    vehicle: 'RTW Akkon HBN 71/2',
    callSign: 'Akkon HBN 71/2'
  },
  'RSH': {
    code: 'RSH',
    shiftTypeName: 'Spätschicht',
    startTime: '14:54',
    endTime: '23:06',
    hours: 8.2,
    station: 'Wache Hohenbrunn',
    vehicle: 'RTW Akkon HBN 71/1',
    callSign: 'Akkon HBN 71/1'
  },
  'RNH': {
    code: 'RNH',
    shiftTypeName: 'Nachtschicht',
    startTime: '22:54',
    endTime: '07:06',
    hours: 8.2,
    station: 'Wache Hohenbrunn',
    vehicle: 'RTW Akkon HBN 71/1',
    callSign: 'Akkon HBN 71/1'
  },
  // Sendling Schichten
  'RFM': {
    code: 'RFM',
    shiftTypeName: 'Frühschicht',
    startTime: '06:54',
    endTime: '15:06',
    hours: 8.2,
    station: 'Wache Sendling',
    vehicle: 'RTW Akkon Sendling 71/1',
    callSign: 'Akkon Sendling 71/1'
  },
  'RSM': {
    code: 'RSM',
    shiftTypeName: 'Spätschicht',
    startTime: '14:54',
    endTime: '23:06',
    hours: 8.2,
    station: 'Wache Sendling',
    vehicle: 'RTW Akkon Sendling 71/1',
    callSign: 'Akkon Sendling 71/1'
  },
  'RNM': {
    code: 'RNM',
    shiftTypeName: 'Nachtschicht',
    startTime: '22:54',
    endTime: '07:06',
    hours: 8.2,
    station: 'Wache Sendling',
    vehicle: 'RTW Akkon Sendling 71/1',
    callSign: 'Akkon Sendling 71/1'
  },
  'RT1M': {
    code: 'RT1M',
    shiftTypeName: 'Frühschicht',
    startTime: '06:54',
    endTime: '15:06',
    hours: 8.2,
    station: 'Wache Sendling',
    vehicle: 'RTW Akkon Sendling 71/2',
    callSign: 'Akkon Sendling 71/2'
  },
  'RT2M': {
    code: 'RT2M',
    shiftTypeName: 'Spätschicht',
    startTime: '14:54',
    endTime: '23:06',
    hours: 8.2,
    station: 'Wache Sendling',
    vehicle: 'RTW Akkon Sendling 71/2',
    callSign: 'Akkon Sendling 71/2'
  },
  'RT3M': {
    code: 'RT3M',
    shiftTypeName: 'Frühschicht',
    startTime: '06:54',
    endTime: '15:36',
    hours: 8.7,
    station: 'Wache Sendling',
    vehicle: 'RTW Akkon Sendling 71/2',
    callSign: 'Akkon Sendling 71/2'
  },
  'RT4M': {
    code: 'RT4M',
    shiftTypeName: 'Spätschicht',
    startTime: '15:24',
    endTime: '00:06',
    hours: 8.7,
    station: 'Wache Sendling',
    vehicle: 'RTW Akkon Sendling 71/2',
    callSign: 'Akkon Sendling 71/2'
  },
  // Obersendling Schichten
  'RFO': {
    code: 'RFO',
    shiftTypeName: 'Frühschicht',
    startTime: '07:54',
    endTime: '16:06',
    hours: 8.2,
    station: 'Wache Obersendling',
    vehicle: 'RTW Akkon Obersendling 71/1',
    callSign: 'Akkon Obersendling 71/1'
  },
  'RSO': {
    code: 'RSO',
    shiftTypeName: 'Spätschicht',
    startTime: '15:54',
    endTime: '00:06',
    hours: 8.2,
    station: 'Wache Obersendling',
    vehicle: 'RTW Akkon Obersendling 71/1',
    callSign: 'Akkon Obersendling 71/1'
  }
};

// CareMan Monatsdienstplan aus Screenshot (Istplan): November 2026 für "Backhaus, Johannes"
export const CAREMAN_NOVEMBER_2026_BACKHAUS = [
  { day: 4, code: 'RFM', weekday: 'Mi', startTime: '06:54', endTime: '15:06' },
  { day: 5, code: 'RT2M', weekday: 'Do', startTime: '14:54', endTime: '23:06' },
  { day: 6, code: 'RT4M', weekday: 'Fr', startTime: '15:24', endTime: '00:06' },
  { day: 9, code: 'RT2M', weekday: 'Mo', startTime: '14:54', endTime: '23:06' },
  { day: 10, code: 'RT2M', weekday: 'Di', startTime: '14:54', endTime: '23:06' },
  { day: 11, code: 'RT2M', weekday: 'Mi', startTime: '14:54', endTime: '23:06' },
  { day: 20, code: 'RT3M', weekday: 'Fr', startTime: '06:54', endTime: '15:36' },
  { day: 24, code: 'RSM', weekday: 'Di', startTime: '14:54', endTime: '23:06' },
  { day: 25, code: 'RNM', weekday: 'Mi', startTime: '22:54', endTime: '07:06' },
  { day: 26, code: 'RNM', weekday: 'Do', startTime: '22:54', endTime: '07:06' },
  { day: 30, code: 'RT1M', weekday: 'Mo', startTime: '06:54', endTime: '15:06' }
];

// Dienste am Monatsanfang / Ende Vormonat (Oktober 2026) aus Istplan
export const CAREMAN_OCTOBER_2026_EXTRA = [
  { date: '2026-10-29', day: 29, code: 'RFM', weekday: 'Do', startTime: '06:54', endTime: '15:06' },
  { date: '2026-10-30', day: 30, code: 'RFM', weekday: 'Fr', startTime: '06:54', endTime: '15:06' },
  { date: '2026-10-31', day: 31, code: 'RNM', weekday: 'Sa', startTime: '22:54', endTime: '07:06' }
];

export function getPresetForCode(rawCode) {
  if (!rawCode) return null;
  const clean = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return SHIFT_PRESETS[clean] || null;
}

export function buildShiftFromPreset({ dateStr, code, storeSettings = {} }) {
  const preset = getPresetForCode(code);
  const cleanCode = code ? code.trim().toUpperCase() : '';

  // Match or create codeId
  const foundCode = (storeSettings.shiftCodes || []).find(
    c => c.code.toUpperCase() === cleanCode
  );
  const codeId = foundCode ? foundCode.id : (preset ? `preset_${cleanCode}` : '');

  // Match typeId
  const typeName = preset?.shiftTypeName || 'Tagdienst';
  const foundType = (storeSettings.shiftTypes || []).find(
    t => t.name.toLowerCase() === typeName.toLowerCase()
  );
  const typeId = foundType ? foundType.id : (storeSettings.shiftTypes?.[0]?.id || 't1');

  return {
    id: crypto.randomUUID(),
    date: dateStr,
    code: cleanCode,
    codeId: codeId,
    typeId: typeId,
    shiftTypeName: typeName,
    startTime: preset?.startTime || '07:00',
    endTime: preset?.endTime || '19:00',
    station: preset?.station || storeSettings.stations?.[0] || 'Wache Sendling',
    vehicle: preset?.vehicle || storeSettings.vehicles?.[0] || 'RTW Akkon Sendling 71/1',
    callSign: preset?.callSign || storeSettings.callSigns?.[0] || 'Akkon Sendling 71/1',
    partner: '',
    timestamp: Date.now()
  };
}
