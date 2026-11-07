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
  },
  'FFO': {
    code: 'FFO',
    shiftTypeName: 'Frühschicht',
    startTime: '07:54',
    endTime: '16:06',
    hours: 8.2,
    station: 'Wache Obersendling',
    vehicle: 'RTW Akkon Obersendling 71/1',
    callSign: 'Akkon Obersendling 71/1'
  },
  'NFO': {
    code: 'NFO',
    shiftTypeName: 'Nachtschicht',
    startTime: '22:54',
    endTime: '07:06',
    hours: 8.2,
    station: 'Wache Obersendling',
    vehicle: 'RTW Akkon Obersendling 71/1',
    callSign: 'Akkon Obersendling 71/1'
  },
  // Weitere Sendling / Hohenbrunn / Sonderdienst-Schichten
  'RCM': {
    code: 'RCM',
    shiftTypeName: 'Tagschicht',
    startTime: '08:54',
    endTime: '19:06',
    hours: 10.2,
    station: 'Wache Sendling',
    vehicle: 'RTW Akkon Sendling 71/1',
    callSign: 'Akkon Sendling 71/1'
  },
  'RHM': {
    code: 'RHM',
    shiftTypeName: 'Tagschicht',
    startTime: '08:54',
    endTime: '19:06',
    hours: 10.2,
    station: 'Wache Sendling',
    vehicle: 'RTW Akkon Sendling 71/1',
    callSign: 'Akkon Sendling 71/1'
  },
  'RS2M': {
    code: 'RS2M',
    shiftTypeName: 'Spätschicht',
    startTime: '14:54',
    endTime: '23:06',
    hours: 8.2,
    station: 'Wache Sendling',
    vehicle: 'RTW Akkon Sendling 71/2',
    callSign: 'Akkon Sendling 71/2'
  },
  'DDM': {
    code: 'DDM',
    shiftTypeName: 'Tagschicht',
    startTime: '08:54',
    endTime: '19:06',
    hours: 10.2,
    station: 'Wache Sendling',
    vehicle: 'RTW Akkon Sendling 71/1',
    callSign: 'Akkon Sendling 71/1'
  },
  'RHH': {
    code: 'RHH',
    shiftTypeName: 'Tagschicht',
    startTime: '08:54',
    endTime: '19:06',
    hours: 10.2,
    station: 'Wache Hohenbrunn',
    vehicle: 'RTW Akkon HBN 71/1',
    callSign: 'Akkon HBN 71/1'
  },
  'RCH': {
    code: 'RCH',
    shiftTypeName: 'Tagschicht',
    startTime: '08:54',
    endTime: '19:06',
    hours: 10.2,
    station: 'Wache Hohenbrunn',
    vehicle: 'RTW Akkon HBN 71/1',
    callSign: 'Akkon HBN 71/1'
  },
  'RDÜ': {
    code: 'RDÜ',
    shiftTypeName: 'Sonderdienst',
    startTime: '08:00',
    endTime: '16:00',
    hours: 8.0,
    station: 'Wache Sendling',
    vehicle: 'Sonderdienst',
    callSign: 'Sonderdienst'
  },
  'BDR': {
    code: 'BDR',
    shiftTypeName: 'Sonderdienst',
    startTime: '08:00',
    endTime: '16:00',
    hours: 8.0,
    station: 'Wache Sendling',
    vehicle: 'Sonderdienst',
    callSign: 'Sonderdienst'
  },
  'LGI': {
    code: 'LGI',
    shiftTypeName: 'Fortbildung',
    startTime: '08:00',
    endTime: '17:00',
    hours: 9.0,
    station: 'Wache Sendling',
    vehicle: 'Fortbildung',
    callSign: 'Fortbildung'
  },
  'ACLS': {
    code: 'ACLS',
    shiftTypeName: 'Fortbildung',
    startTime: '08:00',
    endTime: '17:00',
    hours: 9.0,
    station: 'Wache Sendling',
    vehicle: 'Fortbildung',
    callSign: 'Fortbildung'
  },
  'PALS': {
    code: 'PALS',
    shiftTypeName: 'Fortbildung',
    startTime: '08:00',
    endTime: '17:00',
    hours: 9.0,
    station: 'Wache Sendling',
    vehicle: 'Fortbildung',
    callSign: 'Fortbildung'
  },
  'SMT': {
    code: 'SMT',
    shiftTypeName: 'Fortbildung',
    startTime: '08:00',
    endTime: '17:00',
    hours: 9.0,
    station: 'Wache Sendling',
    vehicle: 'Fortbildung',
    callSign: 'Fortbildung'
  },
  'RAJ': {
    code: 'RAJ',
    shiftTypeName: 'Fortbildung',
    startTime: '08:00',
    endTime: '17:00',
    hours: 9.0,
    station: 'Wache Sendling',
    vehicle: 'Fortbildung',
    callSign: 'Fortbildung'
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
  { date: '2026-10-31', day: 31, code: 'RNM', weekday: 'Sa', startTime: '22:54', endTime: '08:06', hours: 9.2, isOvertime: true }
];

export function getPresetForCode(rawCode) {
  if (!rawCode) return null;
  const clean = rawCode.trim().toUpperCase().replace(/[^A-ZÄÖÜ0-9\-]/g, '');
  if (clean === 'RD') return SHIFT_PRESETS['RDÜ'] || null;
  if (SHIFT_PRESETS[clean]) return SHIFT_PRESETS[clean];

  // Dynamischer Fallback anhand der Stations-Endung (M = Sendling, O = Obersendling, H = Hohenbrunn)
  if (!clean) return null;
  let station = 'Wache Sendling';
  let vehicle = 'RTW Akkon Sendling 71/1';
  let callSign = 'Akkon Sendling 71/1';
  if (clean.endsWith('H') || clean.startsWith('RH') || clean.includes('HBN')) {
    station = 'Wache Hohenbrunn';
    vehicle = 'RTW Akkon HBN 71/1';
    callSign = 'Akkon HBN 71/1';
  } else if (clean.endsWith('O') || clean.startsWith('RO') || clean.includes('OBS') || clean.endsWith('FO')) {
    station = 'Wache Obersendling';
    vehicle = 'RTW Akkon Obersendling 71/1';
    callSign = 'Akkon Obersendling 71/1';
  } else if (clean.startsWith('K')) {
    const ktwNum = clean.match(/\d/)?.[0] || '1';
    vehicle = clean.endsWith('H') ? `KTW Akkon HBN 72/${ktwNum}` : `KTW Akkon Sendling 72/${ktwNum}`;
    callSign = clean.endsWith('H') ? `Akkon HBN 72/${ktwNum}` : `Akkon Sendling 72/${ktwNum}`;
  } else if (clean.includes('2') || clean.includes('4') || clean.includes('3') || clean.includes('1')) {
    vehicle = 'RTW Akkon Sendling 71/2';
    callSign = 'Akkon Sendling 71/2';
  }

  let shiftTypeName = 'Tagdienst';
  let startTime = '08:54';
  let endTime = '19:06';
  let hours = 8.2;

  if (clean.includes('RN') || clean.includes('KN') || clean.endsWith('NM') || clean.endsWith('NH') || clean.endsWith('NO') || clean.startsWith('NF')) {
    shiftTypeName = 'Nachtschicht';
    startTime = '22:54';
    endTime = '07:06';
  } else if (clean.includes('RF') || clean.includes('KF') || clean.endsWith('FM') || clean.endsWith('FH') || clean.endsWith('FO') || clean === 'RT1M' || clean === 'RT3M') {
    shiftTypeName = 'Frühschicht';
    startTime = clean.endsWith('O') ? '07:54' : '06:54';
    endTime = clean.endsWith('O') ? '16:06' : (clean.includes('3') ? '15:36' : '15:06');
  } else if (clean.includes('RS') || clean.includes('KS') || clean.endsWith('SM') || clean.endsWith('SH') || clean.endsWith('SO') || clean.includes('RT2') || clean.includes('RT4')) {
    shiftTypeName = 'Spätschicht';
    startTime = clean.endsWith('O') ? '15:54' : (clean.startsWith('KS') ? '15:54' : (clean.includes('4') ? '15:24' : '14:54'));
    endTime = (clean.endsWith('O') || clean.includes('4')) ? '00:06' : (clean.startsWith('KS') ? '22:36' : '23:06');
  }

  return {
    code: clean,
    shiftTypeName,
    startTime,
    endTime,
    hours,
    station,
    vehicle,
    callSign
  };
}

export function buildShiftFromPreset({ dateStr, code, partner = '', storeSettings = {} }) {
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
    startTime: preset?.startTime || '06:54',
    endTime: preset?.endTime || '15:06',
    station: preset?.station || 'Wache Sendling',
    vehicle: preset?.vehicle || 'RTW Akkon Sendling 71/1',
    callSign: preset?.callSign || 'Akkon Sendling 71/1',
    partner: partner || '',
    timestamp: Date.now()
  };
}
