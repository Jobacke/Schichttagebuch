/**
 * Firestore storage for the calendar export state (one document per month):
 *   users/{uid}/data/calendarExport_YYYY-MM
 *
 * Why: on the iPhone the Home-Screen web app and Safari have SEPARATE localStorage.
 * The iOS Shortcut always returns to Safari (x-success), the CareMan sync also switches
 * contexts – so a purely local export history gets out of sync with the real
 * (iCloud-synced) calendar. Storing it in the user's account keeps all devices consistent.
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export function createFirestoreCalendarRemote(uid) {
  if (!uid || !db) return null;
  const ref = (yearMonth) => doc(db, `users/${uid}/data`, `calendarExport_${yearMonth}`);
  return {
    async loadMonth(yearMonth) {
      const snap = await getDoc(ref(yearMonth));
      return snap.exists() ? snap.data() : null;
    },
    async saveMonth(yearMonth, entry) {
      // JSON round trip removes undefined values (not allowed in Firestore)
      await setDoc(ref(yearMonth), JSON.parse(JSON.stringify(entry)));
    }
  };
}
