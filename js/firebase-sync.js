/* ============================================================
   Pulse — firebase-sync.js
   Thin sync layer over Cloud Firestore. If js/firebase-config.js
   hasn't been filled in, this module quietly disables itself and
   the app falls back to local-only (per-browser) storage.
   ============================================================ */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot,
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const cfg = window.FIREBASE_CONFIG || {};
const boardId = window.PULSE_BOARD_ID || 'default-board';
const enabled = Boolean(cfg.apiKey && cfg.projectId);

let db = null;
let docRef = null;
let pushTimer = null;
let lastPushedJSON = null;

if (enabled){
  try{
    const app = initializeApp(cfg);
    db = getFirestore(app);
    docRef = doc(db, 'pulse_boards', boardId);
  }catch(err){
    console.error('Pulse: Firebase init failed, falling back to local-only.', err);
  }
}

/** One-time read on startup, before the live listener attaches. */
async function fetchInitial(){
  if (!docRef) return null;
  try{
    const snap = await getDoc(docRef);
    return snap.exists() ? snap.data().state : null;
  }catch(err){
    console.error('Pulse: could not reach Firestore, using local data.', err);
    return null;
  }
}

/** Debounced write-through so rapid edits (typing, drag-drop) don't spam Firestore. */
function push(state){
  if (!docRef) return;
  const json = JSON.stringify(state);
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    lastPushedJSON = json;
    setDoc(docRef, { state, updatedAt: Date.now() }).catch(err => {
      console.error('Pulse: sync failed, changes stayed local for now.', err);
    });
  }, 400);
}

/** Live subscription — fires whenever ANY developer's browser changes the board. */
function onRemoteChange(callback){
  if (!docRef) return () => {};
  return onSnapshot(docRef, (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();
    const json = JSON.stringify(data.state);
    if (json === lastPushedJSON) return; // ignore the echo of our own write
    callback(data.state);
  }, (err) => console.error('Pulse: live sync error.', err));
}

window.PulseSync = { enabled: Boolean(docRef), fetchInitial, push, onRemoteChange };
window.dispatchEvent(new Event('pulse-sync-ready'));
