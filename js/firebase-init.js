/* ============================================================
   Pulse — firebase-init.js
   Initializes the Firebase app once and shares it between the
   Firestore sync module and the Google Auth module. If
   js/firebase-config.js hasn't been filled in, `enabled` is false
   and everything downstream falls back to local-only behavior.
   ============================================================ */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';

const cfg = window.FIREBASE_CONFIG || {};
export const enabled = Boolean(cfg.apiKey && cfg.projectId);
export const app = enabled ? initializeApp(cfg) : null;
