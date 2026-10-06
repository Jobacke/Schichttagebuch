import { SHIFT_PRESETS } from './shiftPresets.js';

/**
 * Detect station from shift object, station string, code, or preset
 */
export function detectStation({ station = '', code = '', codeId = '', vehicle = '' } = {}) {
    const st = (station || '').toLowerCase().trim();
    if (st.includes('ober') || st.includes('obs')) return 'Obersendling';
    if (st.includes('hohenbrunn') || st.includes('hbn')) return 'Hohenbrunn';
    if (st.includes('sendling') || st.includes('sen')) return 'Sendling';

    const c = (code || (typeof codeId === 'string' && codeId.replace('preset_', '')) || '').toUpperCase().trim();
    const base = c.replace(/\*+$/, '').trim();
    if (base.endsWith('O') || base === 'RFO' || base === 'RSO' || base.startsWith('NFO') || base.startsWith('FFO')) return 'Obersendling';
    if (base.endsWith('H') || base.includes('HBN') || ['RFH', 'RTH', 'RT1H', 'RT2H', 'RSH', 'RNH', 'RHH'].includes(base)) return 'Hohenbrunn';
    if (base.endsWith('M') || base.includes('-M') || ['RFM', 'RSM', 'RNM', 'RT1M', 'RT2M', 'RT3M', 'RT4M', 'RS2M', 'RCM', 'RHM', 'DDM'].includes(base)) return 'Sendling';

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
 * - Sendling: Blaue Farbstruktur (Klassisches Retterblau / Indigo)
 * - Hohenbrunn: Grüne Farbstruktur (Smaragd / Mint / Waldgrün)
 * - Obersendling: Orange / Bernstein Farbstruktur (Warmes Amber / Koralle)
 */
export const STATION_THEMES = {
    Sendling: {
        id: 'sendling',
        name: 'Wache Sendling',
        short: 'SEN',
        hueName: 'Blau / Indigo',
        primaryHex: '#38bdf8',
        primaryRGB: [2, 132, 199],
        badgeBg: 'rgba(56, 189, 248, 0.15)',
        badgeBorder: 'rgba(56, 189, 248, 0.4)',
        shifts: {
            frueh: {
                color: '#38bdf8',
                bg: 'rgba(56, 189, 248, 0.18)',
                border: 'rgba(56, 189, 248, 0.5)',
                pdf: { r: 2, g: 132, b: 199, bgR: 240, bgG: 249, bgB: 255, borderR: 125, borderG: 211, borderB: 252 }
            },
            tag: {
                color: '#60a5fa',
                bg: 'rgba(96, 165, 250, 0.18)',
                border: 'rgba(96, 165, 250, 0.5)',
                pdf: { r: 37, g: 99, b: 235, bgR: 239, bgG: 246, bgB: 255, borderR: 147, borderG: 197, borderB: 253 }
            },
            spaat: {
                color: '#818cf8',
                bg: 'rgba(129, 140, 248, 0.18)',
                border: 'rgba(129, 140, 248, 0.5)',
                pdf: { r: 79, g: 70, b: 229, bgR: 238, bgG: 242, bgB: 255, borderR: 165, borderG: 180, borderB: 252 }
            },
            nacht: {
                color: '#a78bfa',
                bg: 'rgba(167, 139, 250, 0.18)',
                border: 'rgba(167, 139, 250, 0.5)',
                pdf: { r: 109, g: 40, b: 217, bgR: 245, bgG: 243, bgB: 255, borderR: 199, borderG: 210, borderB: 254 }
            },
            default: {
                color: '#38bdf8',
                bg: 'rgba(56, 189, 248, 0.18)',
                border: 'rgba(56, 189, 248, 0.5)',
                pdf: { r: 2, g: 132, b: 199, bgR: 240, bgG: 249, bgB: 255, borderR: 125, borderG: 211, borderB: 252 }
            }
        }
    },
    Hohenbrunn: {
        id: 'hohenbrunn',
        name: 'Wache Hohenbrunn',
        short: 'HBN',
        hueName: 'Smaragd / Grün',
        primaryHex: '#10b981',
        primaryRGB: [16, 185, 129],
        badgeBg: 'rgba(16, 185, 129, 0.15)',
        badgeBorder: 'rgba(16, 185, 129, 0.4)',
        shifts: {
            frueh: {
                color: '#34d399',
                bg: 'rgba(52, 211, 153, 0.18)',
                border: 'rgba(52, 211, 153, 0.5)',
                pdf: { r: 16, g: 185, b: 129, bgR: 236, bgG: 253, bgB: 245, borderR: 110, borderG: 231, borderB: 183 }
            },
            tag: {
                color: '#10b981',
                bg: 'rgba(16, 185, 129, 0.18)',
                border: 'rgba(16, 185, 129, 0.5)',
                pdf: { r: 5, g: 150, b: 105, bgR: 236, bgG: 253, bgB: 245, borderR: 110, borderG: 231, borderB: 183 }
            },
            spaat: {
                color: '#059669',
                bg: 'rgba(5, 150, 105, 0.20)',
                border: 'rgba(5, 150, 105, 0.55)',
                pdf: { r: 4, g: 120, b: 87, bgR: 236, bgG: 253, bgB: 245, borderR: 110, borderG: 231, borderB: 183 }
            },
            nacht: {
                color: '#14b8a6',
                bg: 'rgba(20, 184, 166, 0.18)',
                border: 'rgba(20, 184, 166, 0.5)',
                pdf: { r: 13, g: 148, b: 136, bgR: 240, bgG: 253, bgB: 250, borderR: 153, borderG: 246, borderB: 228 }
            },
            default: {
                color: '#10b981',
                bg: 'rgba(16, 185, 129, 0.18)',
                border: 'rgba(16, 185, 129, 0.5)',
                pdf: { r: 5, g: 150, b: 105, bgR: 236, bgG: 253, bgB: 245, borderR: 110, borderG: 231, borderB: 183 }
            }
        }
    },
    Obersendling: {
        id: 'obersendling',
        name: 'Wache Obersendling',
        short: 'OBS',
        hueName: 'Orange / Bernstein',
        primaryHex: '#f97316',
        primaryRGB: [234, 88, 12],
        badgeBg: 'rgba(249, 115, 22, 0.15)',
        badgeBorder: 'rgba(249, 115, 22, 0.4)',
        shifts: {
            frueh: {
                color: '#fbbf24',
                bg: 'rgba(251, 191, 36, 0.18)',
                border: 'rgba(251, 191, 36, 0.5)',
                pdf: { r: 217, g: 119, b: 6, bgR: 254, bgG: 252, bgB: 232, borderR: 253, borderG: 224, borderB: 71 }
            },
            tag: {
                color: '#f59e0b',
                bg: 'rgba(245, 158, 11, 0.18)',
                border: 'rgba(245, 158, 11, 0.5)',
                pdf: { r: 180, g: 83, b: 9, bgR: 254, bgG: 243, bgB: 199, borderR: 252, borderG: 211, borderB: 77 }
            },
            spaat: {
                color: '#f97316',
                bg: 'rgba(249, 115, 22, 0.18)',
                border: 'rgba(249, 115, 22, 0.5)',
                pdf: { r: 234, g: 88, b: 12, bgR: 255, bgG: 247, bgB: 237, borderR: 253, borderG: 186, borderB: 116 }
            },
            nacht: {
                color: '#ea580c',
                bg: 'rgba(234, 88, 12, 0.18)',
                border: 'rgba(234, 88, 12, 0.5)',
                pdf: { r: 194, g: 65, b: 12, bgR: 255, bgG: 241, bgB: 242, borderR: 254, borderG: 205, borderB: 211 }
            },
            default: {
                color: '#f97316',
                bg: 'rgba(249, 115, 22, 0.18)',
                border: 'rgba(249, 115, 22, 0.5)',
                pdf: { r: 234, g: 88, b: 12, bgR: 255, bgG: 247, bgB: 237, borderR: 253, borderG: 186, borderB: 116 }
            }
        }
    }
};

export function getShiftThemeKey(typeName = '', code = '') {
    const text = `${typeName} ${code}`.toLowerCase().replace(/\*+$/, '');
    if (text.includes('früh') || text.includes('rf') || text.includes('fm') || text.includes('fh') || text.includes('fo')) return 'frueh';
    if (text.includes('spät') || text.includes('rs') || text.includes('sm') || text.includes('sh') || text.includes('so')) return 'spaat';
    if (text.includes('nacht') || text.includes('rn') || text.includes('nm') || text.includes('nh')) return 'nacht';
    if (text.includes('tag') || text.includes('rt') || text.includes('t1') || text.includes('t2') || text.includes('t3') || text.includes('t4')) return 'tag';
    return 'default';
}

/**
 * Returns UI styling info for Web (CSS colors)
 */
export function getShiftColor(typeName = '', code = '', station = '', vehicle = '') {
    const stName = detectStation({ station, code, vehicle });
    const theme = STATION_THEMES[stName] || STATION_THEMES.Sendling;
    const shiftKey = getShiftThemeKey(typeName, code);
    const shiftTheme = theme.shifts[shiftKey] || theme.shifts.default;

    return {
        color: shiftTheme.color,
        bg: shiftTheme.bg,
        border: shiftTheme.border,
        stationName: theme.name,
        stationShort: theme.short,
        stationColor: theme.primaryHex,
        stationBg: theme.badgeBg,
        stationBorder: theme.badgeBorder,
        label: `${typeName || code} (${theme.short})`
    };
}

/**
 * Returns PDF RGB values for High-Quality Print
 */
export function getShiftColorRGB(typeName = '', code = '', station = '', vehicle = '') {
    const stName = detectStation({ station, code, vehicle });
    const theme = STATION_THEMES[stName] || STATION_THEMES.Sendling;
    const shiftKey = getShiftThemeKey(typeName, code);
    const shiftTheme = theme.shifts[shiftKey] || theme.shifts.default;

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
        stationName: theme.name,
        stationShort: theme.short,
        stationPrimaryRGB: theme.primaryRGB,
        label: `${typeName || code} (${theme.short})`
    };
}
