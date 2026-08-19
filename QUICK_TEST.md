# Quick test (no Firebase account, no deployment)

Fastest way to see it running — pick whichever you have installed:

### Node.js (no install needed, this repo includes a tiny server)

```bash
cd pulse-pwa
node serve.js
```

### Or, if you have npm but not the file above

```bash
npx serve pulse-pwa
```

Then open **http://localhost:8000** (the terminal will print the exact
URL either way).

(A local server is required either way — the app uses JS modules and a
service worker, which browsers block from running off a plain
double-clicked `file://` page.)

## Want to see the "shared board" behavior too, with zero setup?

You don't need Firebase configured to try this part. Open the same
localhost URL in **two browser tabs side by side**. Drag a ticket card to
a different column, or check off a checklist item, in one tab — it
updates in the other tab within a second, automatically. That's the same
live-sync experience developers will get across machines once Firebase is
configured (`FIREBASE_SETUP.md`) — the two-tab version just uses the
browser's local storage instead of the network, so it works immediately
with no account needed.

Note: this two-tab trick only syncs tabs on the *same browser on the same
machine*. To test real cross-device/cross-browser sync, you do need the
5-minute Firebase setup in `FIREBASE_SETUP.md`.
