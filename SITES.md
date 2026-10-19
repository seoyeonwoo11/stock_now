# Sites deployment

Production URL: https://stock-now-chris.oakenelf10.chatgpt.site

Sites runs the API as a Cloudflare Worker, rather than starting the Express Node.js listener. The existing Express server remains available for standalone Node.js hosting. `server/worker.mjs` preserves the API paths and shares the Yahoo and demo providers. SSE updates every 15 seconds (5 seconds for demo), reconnects after a bounded 55-second session, and clears timers on disconnect.

Run `npm ci`, `npm test`, and `npm run build`. The build embeds the React assets in `dist/server/index.js` and emits `dist/.openai/hosting.json` for Sites packaging. Do not configure static-only hosting: it would omit the API.

The GitHub repository is the editable source mirror. Publishing a GitHub commit is not an automatic Sites deployment; use the Sites source synchronization and version/deployment workflow to publish subsequent changes. Site access starts owner-private.

Verified before deployment: nine existing API/provider tests, TypeScript, React production build, and actual Yahoo requests for Samsung search, Apple quote, Samsung chart (73 points), and PLTR search outside the local catalog. All live responses used Yahoo data, not demo fixtures. Provider prices may be delayed or reflect the last market session.
