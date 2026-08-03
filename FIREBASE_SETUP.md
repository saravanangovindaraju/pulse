# Setting up shared, live data for Pulse

By default Pulse stores data in each browser's local storage —
nothing is shared. This guide turns on a real shared board (via a
free Firebase/Firestore project) and gets it onto a URL your whole
team — including through SharePoint — can open.

Two separate steps: **(1) shared data**, **(2) a URL everyone can open**.

---

## 1. Create a Firebase project (free)

1. Go to https://console.firebase.google.com → **Add project** → give it
   any name (e.g. `pulse-team`) → you can skip Google Analytics.
2. In the left menu: **Build → Firestore Database → Create database**.
   - Choose a location close to your team.
   - Start in **production mode** (we'll paste in a locked-down rule below —
     don't leave it in the wide-open "test mode" long-term).
3. Left menu → **Project settings** (gear icon) → scroll to **Your apps** →
   click the **Web** icon (`</>`) → register an app (any nickname, no need
   for Firebase Hosting yet) → copy the `firebaseConfig` object it shows you.

## 2. Paste your config into the app

Open `js/firebase-config.js` in the app folder and fill in the values you
just copied:

```js
window.FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "pulse-team.firebaseapp.com",
  projectId: "pulse-team",
  storageBucket: "pulse-team.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef",
};
window.PULSE_BOARD_ID = "default-board"; // change if you want separate boards
```

That's it on the code side — the app auto-detects this and switches from
local-only to live shared mode (you'll see "Synced — shared board" at the
bottom of the left sidebar).

## 3. Lock down Firestore security rules

In Firebase console → **Firestore Database → Rules**, replace the default
with this — it only allows access to Pulse's own data, nothing else in
your project:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /pulse_boards/{boardId} {
      allow read, write: if true;
    }
  }
}
```

**Note:** this has no login check — anyone who has the app's URL and config
can read/write the board. That's fine for an internal tool behind a
private URL, but if you want it locked to your company's accounts, say the
word and I'll wire up Firebase Authentication (e.g. restricted to your
company's email domain) — the rule would then become
`allow read, write: if request.auth.token.email.matches('.*@yourcompany[.]com$');`.

---

## 4. Get a URL your team can open (including from SharePoint)

SharePoint document libraries won't execute custom HTML/JS apps directly —
uploaded `.html` files get sanitized rather than run. So the app needs to
be hosted somewhere real, and then **linked or embedded** from your
SharePoint site. Easiest free option, using the same Firebase project:

### Option A — Firebase Hosting (recommended, ties into what you just set up)

```bash
npm install -g firebase-tools
firebase login
cd pulse-pwa
firebase init hosting   # choose your project, public dir = "." , single-page app = No
firebase deploy
```

You'll get a URL like `https://pulse-team.web.app`. That's your shared app URL.

### Option B — Any static host

Netlify, Vercel, GitHub Pages, or Azure Static Web Apps all work the same
way — drag-and-drop or connect the folder, they give you a public HTTPS URL.

### Put it on your SharePoint site

Once you have that URL:
- **Simplest:** add a link/tile to it from your SharePoint site's Quick Links.
- **Embedded:** on a SharePoint page, add the **Embed** web part and paste
  the URL — the app will render inline inside the SharePoint page, while
  actually running from its real host and syncing through Firestore.

Every developer who opens that link — whether from SharePoint, a bookmark,
or the installed PWA on their phone — sees and edits the same live board.

---

## Notes

- Until you fill in `firebase-config.js`, the app works exactly as before
  (local-only, per-browser) — nothing breaks if you want to hold off on this.
- The whole board syncs as one document, so it comfortably handles a small-to-mid
  size team's data; if you ever need per-collection queries or finer-grained
  permissions per developer, that's a follow-up restructure, not a rewrite.
