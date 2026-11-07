import { SHIFT_PRESETS } from './shiftPresets.js';

/**
 * Detect station from shift object, station string, code, or preset
 */
export function detectStation({ station = '', code = '', codeId = '', vehicle = '' } = {}) {
    const c = (code || (typeof codeId === 'string' && codeId.replace('preset_', '')) || '').toUpperCase().trim();
    const base = c.replace(/\*+$/, '').trim();
    if (base.endsWith('O') || base === 'RFO' || base === 'RSO' || base.startsWith('NFO') || base.startsWith('FFO')) return 'Obersendling';
    if (base.endsWith('H') || base.includes('HBN') || ['RFH', 'RTH', 'RT1H', 'RT2H', 'RSH', 'RNH', 'RHH', 'RCH'].includes(base)) return 'Hohenbrunn';
    if (base.endsWith('M') || base.includes('-M') || ['RFM', 'RSM', 'RNM', 'RT1M', 'RT2M', 'RT3M', 'RT4M', 'RS2M', 'RCM', 'RHM', 'DDM'].includes(base)) return 'Sendling';

    const st = (station || '').toLowerCase().trim();
    if (st.includes('ober') || st.includes('obs')) return 'Obersendling';
    if (st.includes('hohenbrunn') || st.includes('hbn')) return 'Hohenbrunn';
    if (st.includes('sendling') || st.includes('sen')) return 'Sendling';

    // Check presets
    const preset = SHIFT_PRESETS[c] || SHIFT_PRESETS[base];
    if (preset?.station) {
        const pst = preset.station.toLowerCase();
        if (pst.includes('ober')) return 'Obersendling';
        if (pst.includes('hohenbrunn')) return 'Hohenbrunn';
        if (pst.includes('sendling')) return 'Sendling';
    }

    const veh = (vehicle || '').toLowerCase();
    if (veh.includes('ober')) return 'Obersendling';
    if (veh.includes('hohenbrunn') || veh.includes('hbn')) return 'Hohenbrunn';
    if (veh.includes('sendling')) return 'Sendling';

    return 'Sendling'; // Default to Sendling
}

/**
 * Full Theme definitions for Wachen:
 * - Sendling: Retter-Blau (Klassisches Kobaltblau)
 * - Hohenbrunn: Smaragd-Grün (Frisches Grün)
 * - Obersendling: Bernstein-Gelb (Warmes Amber / Goldgelb)
 */
export const STATION_THEMES = {
    Sendling: {
        id: 'sendling',
        name: 'Wache Sendling',
        short: 'SEN',
        hueName: 'Retter-Blau',
        primaryHex: '#0284c7',
        color: '#38bdf8',
        primaryRGB: [2, 132, 199],
        badgeBg: 'rgba(2, 132, 199, 0.18)',
        badgeBorder: 'rgba(2, 132, 199, 0.45)'
    },
    Hohenbrunn: {
        id: 'hohenbrunn',
        name: 'Wache Hohenbrunn',
        short: 'HBN',
        hueName: 'Smaragd-Grün',
        primaryHex: '#10b981',
        color: '#34d399',
        primaryRGB: [16, 185, 129],
        badgeBg: 'rgba(16, 185, 129, 0.18)',
        badgeBorder: 'rgba(16, 185, 129, 0.45)'
    },
    Obersendling: {
        id: 'obersendling',
        name: 'Wache Obersendling',
        short: 'OBS',
        hueName: 'Bernstein-Gelb',
        primaryHex: '#eab308',
        color: '#facc15',
        primaryRGB: [234, 179, 8],
        badgeBg: 'rgba(234, 179, 8, 0.18)',
        badgeBorder: 'rgba(234, 179, 8, 0.45)'
    }
};

/**
 * Universal, High-Contrast Shift Type Colors:
 * - Frühschicht: Helles Türkis / Cyan (Morgendämmerung)
 * - Tagschicht: Royalblau (Vollmond / Tag)
 * - Spätschicht: Warmes Abend-Orange / Sunset (Abendrot)
 * - Nachtschicht: Tiefes Nacht-Violett / Lila (Mondschein)
 * - Nacht-Ende: Sanftes Flieder / Lavendel
 * - Fortbildung: Koralle / Rose
 * - Dienstfrei: Schiefergrau
 */
export const SHIFT_TYPE_COLORS = {
    frueh: {
        id: 'frueh',
        name: 'Frühschicht',
        color: '#06b6d4', // Vibrant Cyan / Türkis
        bg: 'rgba(6, 182, 212, 0.16)',
        border: 'rgba(6, 182, 212, 0.45)',
        badgeBg: 'rgba(6, 182, 212, 0.22)',
        pdf: { r: 8, g: 145, b: 178, bgR: 236, bgG: 254, bgB: 255, borderR: 103, borderG: 232, borderB: 249 }
    },
    tag: {
        id: 'tag',
        name: 'Tagschicht',
        color: '#3b82f6', // Royal Blue
        bg: 'rgba(59, 130, 246, 0.16)',
        border: 'rgba(59, 130, 246, 0.45)',
        badgeBg: 'rgba(59, 130, 246, 0.22)',
        pdf: { r: 37, g: 99, b: 235, bgR: 239, bgG: 246, bgB: 255, borderR: 147, borderG: 197, borderB: 253 }
    },
    spaat: {
        id: 'spaat',
        name: 'Spätschicht',
        color: '#f97316', // Warm Sunset Amber-Orange
        bg: 'rgba(249, 115, 22, 0.16)',
        border: 'rgba(249, 115, 22, 0.45)',
        badgeBg: 'rgba(249, 115, 22, 0.22)',
        pdf: { r: 234, g: 88, b: 12, bgR: 255, bgG: 247, bgB: 237, borderR: 253, borderG: 186, borderB: 116 }
    },
    nacht: {
        id: 'nacht',
        name: 'Nachtschicht',
        color: '#a855f7', // Deep Midnight Purple
        bg: 'rgba(168, 85, 247, 0.18)',
        border: 'rgba(168, 85, 247, 0.48)',
        badgeBg: 'rgba(168, 85, 247, 0.25)',
        pdf: { r: 147, g: 51, b: 234, bgR: 245, bgG: 243, bgB: 255, borderR: 216, borderG: 180, borderB: 254 }
    },
    nachtEnde: {
        id: 'nachtEnde',
        name: 'Nachtschicht-Ende',
        color: '#c084fc', // Soft Lilac / Lavendel
        bg: 'rgba(168, 85, 247, 0.14)',
        border: 'rgba(168, 85, 247, 0.35)',
        badgeBg: 'rgba(168, 85, 247, 0.25)',
        pdf: { r: 168, g: 85, b: 247, bgR: 250, bgG: 245, bgB: 255, borderR: 216, borderG: 180, borderB: 254 }
    },
    fortbildung: {
        id: 'fortbildung',
        name: 'Fortbildung',
        color: '#ec4899', // Pink / Rose
        bg: 'rgba(236, 72, 153, 0.16)',
        border: 'rgba(236, 72, 153, 0.45)',
        badgeBg: 'rgba(236, 72, 153, 0.22)',
        pdf: { r: 219, g: 39, b: 119, bgR: 253, bgG: 242, bgB: 248, borderR: 244, borderG: 114, borderB: 182 }
    },
    default: {
        id: 'default',
        name: 'Dienst',
        color: '#3b82f6',
        bg: 'rgba(59, 130, 246, 0.16)',
        border: 'rgba(59, 130, 246, 0.45)',
        badgeBg: 'rgba(59, 130, 246, 0.22)',
        pdf: { r: 37, g: 99, b: 235, bgR: 239, bgG: 246, bgB: 255, borderR: 147, borderG: 197, borderB: 253 }
    }
};

// Backwards compatibility for any property accessing STATION_THEMES.shifts
Object.values(STATION_THEMES).forEach(th => {
    th.shifts = SHIFT_TYPE_COLORS;
});

export function getShiftThemeKey(typeName = '', code = '') {
    const raw = `${typeName} ${code}`.toLowerCase().replace(/\*+$/, '').trim();
    const cleanCode = (code || '').toUpperCase().replace(/\*+$/, '').trim();

    if (raw.includes('nacht') || cleanCode.startsWith('RN') || cleanCode.endsWith('NM') || cleanCode.endsWith('NH') || cleanCode.endsWith('NO') || cleanCode.startsWith('NF')) {
        return 'nacht';
    }
    if (raw.includes('spät') || cleanCode.startsWith('RS') || cleanCode.endsWith('SM') || cleanCode.endsWith('SH') || cleanCode.endsWith('SO') || ['RT2M', 'RT4M', 'RT2H', 'RT4H', 'RT2O', 'RT4O'].includes(cleanCode)) {
        return 'spaat';
    }
    if (raw.includes('früh') || cleanCode.startsWith('RF') || cleanCode.endsWith('FM') || cleanCode.endsWith('FH') || cleanCode.endsWith('FO')) {
        return 'frueh';
    }
    if (raw.includes('tag') || cleanCode.startsWith('RT') || cleanCode.startsWith('RD') || ['RT1M', 'RT3M', 'RT1H', 'RT3H', 'RTH'].includes(cleanCode)) {
        return 'tag';
    }
    if (raw.includes('fortbildung') || ['PALS', 'ACLS', 'SMT', 'RAJ', 'LGI'].some(k => cleanCode.includes(k))) {
        return 'fortbildung';
    }
    return 'default';
}

/**
 * Returns UI styling info for Web (CSS colors)
 */
export function getShiftColor(typeName = '', code = '', station = '', vehicle = '') {
    const stName = detectStation({ station, code, vehicle });
    const stationTheme = STATION_THEMES[stName] || STATION_THEMES.Sendling;
    const shiftKey = getShiftThemeKey(typeName, code);
    const shiftTheme = SHIFT_TYPE_COLORS[shiftKey] || SHIFT_TYPE_COLORS.default;

    return {
        color: shiftTheme.color,
        bg: shiftTheme.bg,
        border: shiftTheme.border,
        stationName: stationTheme.name,
        stationShort: stationTheme.short,
        stationColor: stationTheme.color || stationTheme.primaryHex,
        stationBg: stationTheme.badgeBg,
        stationBorder: stationTheme.badgeBorder,
        label: `${typeName || code} (${stationTheme.short})`
    };
}

/**
 * Returns PDF RGB values for High-Quality Print
 */
export function getShiftColorRGB(typeName = '', code = '', station = '', vehicle = '') {
    const stName = detectStation({ station, code, vehicle });
    const stationTheme = STATION_THEMES[stName] || STATION_THEMES.Sendling;
    const shiftKey = getShiftThemeKey(typeName, code);
    const shiftTheme = SHIFT_TYPE_COLORS[shiftKey] || SHIFT_TYPE_COLORS.default;

    return {
        r: shiftTheme.pdf.r,
        g: shiftTheme.pdf.g,
        b: shiftTheme.pdf.b,
        bgR: shiftTheme.pdf.bgR,
        bgG: shiftTheme.pdf.bgG,
        bgB: shiftTheme.pdf.bgB,
        borderR: shiftTheme.pdf.borderR,
        borderG: shiftTheme.pdf.borderG,
        borderB: shiftTheme.pdf.borderB,
        stationName: stationTheme.name,
        stationShort: stationTheme.short,
        stationPrimaryRGB: stationTheme.primaryRGB,
        label: `${typeName || code} (${stationTheme.short})`
    };
}
