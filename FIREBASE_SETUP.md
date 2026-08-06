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

## 3. Turn on Google Sign-In

1. Firebase console → **Build → Authentication → Get started**.
2. **Sign-in method** tab → click **Google** → toggle **Enable** → pick a
   support email → **Save**.
3. Still in Authentication → **Settings → Authorized domains** → **Add
   domain** → add whatever domain you'll actually open the app from
   (e.g. `your-project.web.app` for Firebase Hosting, or
   `yourname.github.io` for GitHub Pages). `localhost` is already allowed
   by default, which is why sign-in works during local testing.

That's it on the Firebase side — no code changes needed. Once your
`firebase-config.js` has real values, the "Sign in with Google" button
appears automatically on the login screen instead of the fallback name
picker.

**How people get matched to a name:** if a developer's `email` field
(set from **Team → Add team member**, or edited directly in Firestore)
matches the Google account's email, they're recognized as that person.
If nobody matches, Pulse automatically creates a new (non-admin) profile
for them using their Google name — an existing admin can promote them to
admin afterwards from the Resource Utilization table.

## 4. Lock down Firestore security rules

In Firebase console → **Firestore Database → Rules**, replace the default
with this — it only allows access to Pulse's own data, nothing else in
your project, and (once step 3 is done) requires a signed-in Google
account:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /pulse_boards/{boardId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Want it locked to just your company's accounts rather than any Google
account? Use this instead, swapping in your real domain:

```
allow read, write: if request.auth != null
  && request.auth.token.email.matches('.*@yourcompany[.]com$');
```

**If you skip Google Sign-In entirely:** the app still works fine with
the device-only name picker — just use the original open rule
(`allow read, write: if true;`) since there's no `request.auth` to check
against in that case.

---

## 5. Get a URL your team can open (including from SharePoint)

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
