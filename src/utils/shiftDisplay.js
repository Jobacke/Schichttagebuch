import { resolveShiftTypeName } from '../hooks/useAnalysisLogic';
import { SHIFT_PRESETS } from './shiftPresets';
import { getShiftColor } from './shiftColors';

// Helper: Duration between HH:MM and HH:MM
export const calcDuration = (start, end) => {
    if (!start || !end) return '';
    try {
        const [sh, sm] = start.split(':').map(Number);
        const [eh, em] = end.split(':').map(Number);
        let sMin = sh * 60 + sm;
        let eMin = eh * 60 + em;
        if (eMin < sMin) eMin += 24 * 60;
        return ((eMin - sMin) / 60).toFixed(1);
    } catch { return ''; }
};

// Helper: Resolve shift code, type name and color consistently with station awareness
export const resolveShiftDetails = (s, storeSettings) => {
    if (!s) return { code: '', rawCode: '', typeName: 'Dienst', colorInfo: getShiftColor('', '') };

    const codeObj = (storeSettings?.shiftCodes || []).find(c => c.id === s.codeId || (s.code && c.code === s.code));
    const typeObj = (storeSettings?.shiftTypes || []).find(t => t.id === s.typeId);

    let rawCode = s.code || codeObj?.code || '';
    if (!rawCode && s.codeId && typeof s.codeId === 'string' && s.codeId.startsWith('preset_')) {
        rawCode = s.codeId.replace('preset_', '');
    }

    const preset = rawCode ? (SHIFT_PRESETS[rawCode] || {}) : {};
    const rawType = s.shiftTypeName || typeObj?.name || codeObj?.shiftTypeName || preset.shiftTypeName || resolveShiftTypeName(s, storeSettings) || '';
    const station = s.station || preset.station || '';
    const vehicle = s.vehicle || preset.vehicle || '';

    const colorInfo = getShiftColor(rawType, rawCode, station, vehicle);

    // Derive concise display code (never 'DST')
    let displayCode = rawCode;
    if (!displayCode) {
        if (rawType.toLowerCase().includes('spät')) displayCode = 'Spät';
        else if (rawType.toLowerCase().includes('früh')) displayCode = 'Früh';
        else if (rawType.toLowerCase().includes('nacht')) displayCode = 'Nacht';
        else if (rawType.toLowerCase().includes('tag')) displayCode = 'Tag';
        else displayCode = rawType ? rawType.slice(0, 4) : 'Schicht';
    }

    return {
        code: displayCode,
        rawCode,
        typeName: rawType || 'Dienst',
        station: station || colorInfo.stationName,
        stationShort: colorInfo.stationShort,
        colorInfo
    };
};
