/**
 * Private integration secrets of the signed-in user:
 *   users/{uid}/data/integrations  { githubBridgeToken, updatedAt }
 * Includes a local cache of the user's own token + Board vault sync.
 * There is deliberately NO built-in fallback token: the repository is public, so any token
 * in the source code (even obfuscated) can be read by anyone.
 */
import { doc, getDoc, setDoc, deleteField } from 'firebase/firestore';
import { auth, db } from '../firebase';

const LOCAL_TOKEN_KEY = 'schichttagebuch_bridge_token_v1';

function getLocalCachedToken() {
  try {
    return (localStorage.getItem(LOCAL_TOKEN_KEY) || '').trim();
  } catch {
    return '';
  }
}

function setLocalCachedToken(val) {
  const clean = String(val || '').trim();
  try {
    if (clean) {
      localStorage.setItem(LOCAL_TOKEN_KEY, clean);
    } else {
      localStorage.removeItem(LOCAL_TOKEN_KEY);
    }
  } catch {}
  try {
    if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
      window.parent.postMessage(
        clean
          ? { type: 'board-storage-set', key: LOCAL_TOKEN_KEY, value: clean }
          : { type: 'board-storage-remove', key: LOCAL_TOKEN_KEY },
        '*'
      );
    }
  } catch {}
}

function ref() {
  const uid = auth?.currentUser?.uid;
  if (!uid) return null;
  return doc(db, `users/${uid}/data`, 'integrations');
}

export async function getBridgeToken() {
  try {
    const docRef = ref();
    if (docRef) {
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const cloudTok = String(snap.data().githubBridgeToken || '').trim();
        if (cloudTok) {
          setLocalCachedToken(cloudTok);
          return cloudTok;
        }
      }
    }
  } catch {
    // Fallback to local cache / default token below
  }
  return getLocalCachedToken();
}

export async function saveBridgeToken(token) {
  const value = String(token || '').trim();
  setLocalCachedToken(value);
  const docRef = ref();
  if (docRef) {
    await setDoc(
      docRef,
      { githubBridgeToken: value ? value : deleteField(), updatedAt: Date.now() },
      { merge: true }
    );
  }
}
