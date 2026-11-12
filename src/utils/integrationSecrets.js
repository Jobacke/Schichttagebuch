/**
 * Private integration secrets of the signed-in user (never in the source code):
 *   users/{uid}/data/integrations  { githubBridgeToken, updatedAt }
 * Protected by the Firestore rules (only the owner can read/write users/{uid}/**).
 */
import { doc, getDoc, setDoc, deleteField } from 'firebase/firestore';
import { auth, db } from '../firebase';

function ref() {
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error('Nicht angemeldet.');
  return doc(db, `users/${uid}/data`, 'integrations');
}

export async function getBridgeToken() {
  try {
    const snap = await getDoc(ref());
    return snap.exists() ? String(snap.data().githubBridgeToken || '').trim() : '';
  } catch {
    return '';
  }
}

export async function saveBridgeToken(token) {
  const value = String(token || '').trim();
  await setDoc(
    ref(),
    { githubBridgeToken: value ? value : deleteField(), updatedAt: Date.now() },
    { merge: true }
  );
}
