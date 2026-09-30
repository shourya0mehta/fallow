# Fallow browser extension

Manifest V3. Load unpacked from `chrome://extensions` (Developer mode on), pointing at this folder. The extension talks only to the Fallow app on your machine (`http://localhost:3000` by default; change it in the extension's options).

- `chat.js` runs on chatgpt.com, claude.ai, gemini.google.com and the app's `/demo/chat` page. It intercepts the send action, asks `/api/assess`, shows the verdict card, and logs what you chose.
- `pause.js` runs everywhere and shows the pause only on hostnames in your Settings list. It never runs on the app itself, except `/demo/feed`.
- `background.js` is the only piece that calls the app, so page CORS rules never apply. Settings are cached for a minute.
- Snoozes (30 minutes after "Continue") and mutes (an hour after "Quiet on this site") live in `chrome.storage.local`; clear them from the options page.

Test it end to end with `npm run test:extension` from the repo root while the app is running.
