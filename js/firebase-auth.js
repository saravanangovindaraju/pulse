/* ============================================================
   Pulse — firebase-auth.js
   Google sign-in via Firebase Authentication. Exposes
   window.PulseAuth for the classic-script app.js to use.
   Quietly disables itself if Firebase isn't configured, or if the
   "Google" sign-in provider hasn't been turned on in the Firebase
   console — the app falls back to local device identity either way.
   ============================================================ */

import { enabled as firebaseEnabled, app } from './firebase-init.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';

let auth = null;
if (firebaseEnabled){
  try{ auth = getAuth(app); }
  catch(err){ console.error('Pulse: Firebase Auth init failed.', err); }
}

async function signInWithGoogle(){
  if (!auth) throw new Error('Firebase is not configured.');
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  const u = result.user;
  return { uid: u.uid, email: u.email, name: u.displayName, photoURL: u.photoURL };
}

async function signOutUser(){
  if (!auth) return;
  await signOut(auth);
}

function onAuthChange(callback){
  if (!auth) return () => {};
  return onAuthStateChanged(auth, (u) => {
    callback(u ? { uid: u.uid, email: u.email, name: u.displayName, photoURL: u.photoURL } : null);
  });
}

window.PulseAuth = { enabled: Boolean(auth), signInWithGoogle, signOutUser, onAuthChange };
window.dispatchEvent(new Event('pulse-auth-ready'));
