/**
 * Calendar entries always carry the CURRENT PartnerIn from the active team roster
 * (the same rule the Journal cards use): automatically filled partners ("mit ..." or empty)
 * are recalculated at the moment of the calendar transfer, so a short-term change of
 * colleagues in CareMan reliably reaches the calendar. A partner typed in by hand
 * (not starting with "mit ") is kept.
 */
import { getPartnersForShiftFromRoster } from './teamRosterParser';

function resolveCode(shift, storeSettings) {
  if (shift?.code) return String(shift.code);
  const codeObj = (storeSettings?.shiftCodes || []).find(c => c.id === shift?.codeId);
  return codeObj?.code ? String(codeObj.code) : '';
}

export function isAutoPartner(partner) {
  const p = String(partner || '').trim();
  return !p || p.startsWith('mit ');
}

export function withCurrentPartners(shifts = [], storeSettings = {}) {
  return (shifts || []).map(s => {
    if (!s || !s.date || !isAutoPartner(s.partner)) return s;
    const code = resolveCode(s, storeSettings);
    if (!code) return s;
    let detected = '';
    try {
      detected = getPartnersForShiftFromRoster(s.date, code) || '';
    } catch {
      detected = '';
    }
    if (!detected || detected === String(s.partner || '').trim()) return s;
    return { ...s, partner: detected };
  });
}
