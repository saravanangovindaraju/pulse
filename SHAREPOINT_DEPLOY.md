# Deploying Pulse to SharePoint

SharePoint document libraries sanitize uploaded `.html` files and won't
execute their JavaScript — so "deploy to SharePoint" in practice means:
**host the app on a real web address, then surface that address inside
SharePoint.** This doc covers both the hosting step and the two ways to
surface it, plus configuration and troubleshooting.

Prerequisite: you've followed `FIREBASE_SETUP.md` and `js/firebase-config.js`
has your real project values in it (needed for the shared/live board —
skip that if you're fine with each person having local-only data).

---

## Step 1 — Deploy the static files somewhere public

### Option A: Firebase Hosting (recommended — reuses the project you already made)

From the `pulse-pwa` folder:

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only hosting
```

This repo already includes `firebase.json` (hosting config with correct
caching headers for the service worker) and `.firebaserc` — just open
`.firebaserc` and replace `YOUR-FIREBASE-PROJECT-ID` with your actual
project ID first (find it in Firebase console → Project settings).

You'll get a URL back that looks like:

```
https://YOUR-PROJECT-ID.web.app
```

Open it directly in a browser first and confirm it works standalone
(sidebar should say "Synced — shared board") before touching SharePoint.

### Option B: Any other static host

Netlify, Vercel, GitHub Pages, Azure Static Web Apps — all work by
pointing them at this folder and deploying. Any of these give you the
same thing: a public HTTPS URL. Skip to Step 2 once you have it.

---

## Step 2 — Surface it in SharePoint

You have two options, from simplest to most "native."

### Option 1 — Embed web part (simplest, no admin permissions needed)

1. Open the SharePoint site → the page you want it on → **Edit**.
2. Click **+** to add a web part → search **Embed**.
3. Paste your app URL (e.g. `https://your-project.web.app`) → **Insert**.
4. Resize the web part (drag the bottom edge) so the app has room —
   at least 700px tall is comfortable.
5. **Republish** the page.

This works out of the box — the "Embed" web part uses a sandboxed
`<iframe>` and does **not** require your tenant's "Custom Script" setting
to be enabled (that restriction only applies to older Script Editor /
Content Editor web parts).

**Tradeoff:** running inside an iframe means the browser won't offer the
"Install app" PWA prompt, and some browsers restrict service workers
inside third-party iframes. Data sync still works fine either way (that's
plain network calls to Firestore, unrelated to the iframe).

### Option 2 — Direct link / tile (best experience, still "in SharePoint")

Add a link to the app from:
- **Quick Links** web part or the site's nav — label it "Pulse",
  point it at your app URL, and set it to open in a **new tab**.
- Or the **Hero**/**Tiles** web part for a bigger visual entry point.

Opening in a full new tab (rather than an iframe) gives developers the
full experience — the "Install app" prompt, offline support, and no
iframe restrictions — while still being one click away from your
SharePoint site. This is what I'd recommend as the main path, with the
Embed web part (Option 1) as a nice-to-have "at a glance" view.

### Option 3 — Native SPFx web part (advanced)

If you want it to feel like a first-class SharePoint web part (inherits
SharePoint's theme, shows in the App Catalog, can be pushed to sites via
policy) rather than an embedded iframe, that means packaging it as a
**SharePoint Framework (SPFx)** solution — a `.sppkg` file uploaded to
your tenant's App Catalog. That's a heavier lift: Node.js + Yeoman SPFx
tooling, a build/bundle step, and a tenant admin to approve the app
catalog upload. It's genuinely doable (the SPFx web part would just embed
this same app in an iframe internally, so none of the app code changes),
but it's a separate project from what's here. Let me know if you want me
to scaffold that SPFx wrapper next.

---

## Configuration checklist — is it actually working?

- [ ] Opening the hosted URL directly (not through SharePoint) shows the
      app and the sidebar says **"Synced — shared board"**, not "Local only."
- [ ] Open the URL in two different browsers (or one normal + one private
      window) side by side. Drag a card in one — it should move in the
      other within ~1 second without refreshing.
- [ ] Open it through the SharePoint page/link and confirm the same thing.
- [ ] Check Firebase console → Firestore Database → you should see a
      `pulse_boards` collection with one document holding your data.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Sidebar says "Local only — not shared" | `js/firebase-config.js` still has empty strings — fill in your real project config and redeploy. |
| Sidebar says "Sync error" | Check the browser console; usually a Firestore security rule blocking access, or `projectId` typo'd in the config. |
| Embed web part shows a blank box | Some tenants block iframes via tenant-wide CSP; use Option 2 (direct link) instead. |
| Changes don't show on other machines | Confirm both machines are pointed at the **same deployed URL** — a stale local copy of the files won't sync with the hosted one. |
| "Install app" button never appears | Expected inside the Embed web part's iframe — install from the direct link (Option 2) instead. |
