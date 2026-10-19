# Sites deployment

Production URL: https://stock-now-chris.oakenelf10.chatgpt.site

Sites runs the React app and same-origin API in a Cloudflare Worker. The Express server remains available for standalone Node.js hosting. Both use Toss Securities Open API; Google News RSS supplies related news because Toss does not provide a news endpoint.

Set TOSS_CLIENT_ID and TOSS_CLIENT_SECRET as Sites runtime Secrets. Local .env files are not uploaded. No trading or account endpoints are implemented.

The DB D1 binding stores the one active Toss token with a refresh lease shared by Worker isolates. Schema migrations live in drizzle/ and are copied to dist/.openai/drizzle during build. Sites applies them during publication. No token is exposed through the app API.

Run npm test and npm run build. The build embeds React assets in dist/server/index.js and emits the hosting manifest and migrations. Always run the Vite build before build-worker.mjs to clear old output. Do not configure static-only hosting.

SSE supplies polled prices every 15 seconds, reconnects after 55 seconds and clears timers on disconnect. A successful health check does not verify upstream access: validate quotes, searches and chart history.

GitHub is the editable source mirror; pushing a GitHub commit alone does not deploy Sites. Preserve the current Site audience when publishing.
