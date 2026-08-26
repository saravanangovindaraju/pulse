/* ============================================================
   Pulse — Firebase configuration
   ============================================================
   Fill this in with YOUR Firebase project's config to enable
   shared, real-time data across every developer who opens the app.

   Where to get these values:
     1. https://console.firebase.google.com → Create project (free)
     2. Build → Firestore Database → Create database → Start in
        "test mode" for now (or use the security rules in FIREBASE_SETUP.md)
     3. Project settings (gear icon) → General → "Your apps" →
        Add app → Web (</>) → copy the firebaseConfig object below

   Leave apiKey / projectId blank to run Pulse in local-only
   mode (each browser keeps its own private data, nothing shared).
   ============================================================ */

window.FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};

// Change this if you want more than one independent board sharing
// the same Firebase project (e.g. one per team).
window.PULSE_BOARD_ID = "default-board";
