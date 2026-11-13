# Verba

Your personal AI writing & translation assistant — a **Chrome extension** that works on any website, a **web dashboard**, and a small **backend API** that talks to the translation/AI providers you choose (free tiers and self-hosted options first).

Select text anywhere → a floating toolbar appears → **Translate, Fix grammar, Rewrite, Change tone, Summarize, Smart reply** or any custom assistant → tweak the result (restyle a translation as *Funny*, *Professional*, *Casual*…) → **Replace** it in place or **Copy**.

```
apps/
  backend/     Express + TypeScript API (providers, fallback, history, settings, usage)
  web/         React + Vite + Tailwind + Redux Toolkit dashboard
  extension/   Chrome Manifest V3 extension (React popup/options, Shadow-DOM toolbar)
packages/
  shared/      Typed API contract, languages, catalogs, provider metadata, diff
```

---

## Quick start (local)

Requires **Node 20+** (tested on Node 22) and Chrome 116+.

```bash
npm install
npm run dev            # backend on http://localhost:8787 + dashboard on http://localhost:5173
```

On first start the backend prints a boxed **access token** and **connection code** (stored in `apps/backend/data/secrets.json`). Lost it? `npm run token -w @verba/backend`.

1. Open http://localhost:5173 → paste the connection code (or URL + token) → **Connect**.
2. **Translation works immediately** via MyMemory (no key).
3. For grammar, rewriting, smart replies, assistants, *styled* translations and romanized input like Hinglish (“hi kese ho tu”), add **one AI provider** in **Settings → API Providers**:
   - **Google Gemini** — free key at https://aistudio.google.com/apikey
   - **Groq** — free key at https://console.groq.com/keys
   - **Ollama** — fully local & free: install from https://ollama.com, `ollama pull llama3.2`, enable it.
   Click **Test connection** to verify. Keys are encrypted (AES-256-GCM) on your server and never sent back to the browser.

### Install the Chrome extension

```bash
npm run build:extension        # → apps/extension/dist
npm run package:extension      # → apps/extension/release/verba-extension-v0.1.0.zip
```

1. Chrome → `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `apps/extension/dist`.
2. Dashboard → **Settings → Extension** → copy the connection code.
3. Extension icon → **Settings** → paste the code → **Connect**.

The extension then works on its own — the dashboard tab can be closed. Settings (languages, tone, toolbar buttons, disabled sites, custom assistants) are shared with the dashboard through the backend and re-synced every 15 minutes or on **Sync now**.

**Shortcuts** (change at `chrome://extensions/shortcuts`): `Alt+Shift+V` popup · `Alt+Shift+A` toolbar · `Alt+Shift+T` translate · `Alt+Shift+G` fix grammar. Right-click menu: Translate / Fix grammar / Rewrite / Summarize / Open AI assistant.

---

## Providers & fallback

Providers are tried in priority order; if one fails or times out the next is used. Styled translations and all AI tools require an AI model provider.

| Provider | Type | Key | Free tier (verify — limits change) |
|---|---|---|---|
| MyMemory | translation | none (email optional) | ~5k chars/day, ~50k with email |
| LibreTranslate | translation | self-hosted URL | unlimited self-hosted (`docker run -p 5000:5000 libretranslate/libretranslate`) |
| Azure Translator | translation | yes + region | F0: 2M chars/month |
| Google Cloud Translation | translation | yes | 500k chars/month |
| DeepL | translation | yes (`:fx` = free) | 500k chars/month |
| AI model (LLM) | translation | uses your AI provider | — |
| Gemini / Groq / OpenRouter | AI | yes | rate-limited free tiers |
| OpenAI | AI | yes | paid |
| Ollama / any OpenAI-compatible | AI | base URL | local, unlimited |

Keys can also come from env vars (see `apps/backend/.env.example`).

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | backend + dashboard with hot reload |
| `npm run dev:extension` | rebuild the extension on change (reload it in `chrome://extensions`) |
| `npm run build` | production build of backend, dashboard and extension |
| `npm run package:extension` | build + ZIP for the Chrome Web Store |
| `npm test` | all unit tests (shared, backend, extension) |
| `npm run typecheck` / `npm run lint` | static checks |

> **Windows note:** the repo pins Rollup to its WASM build (`@rollup/wasm-node`) because Windows Smart App Control blocks Rollup’s unsigned native binary. No action needed.

---

## Deployment

**Backend (Render / Railway / Docker)**
- Render: `render.yaml` is a ready Blueprint. Docker: `docker build -f apps/backend/Dockerfile -t verba-api .` (mount `/data`).
- Required env in production: `VERBA_ACCESS_TOKEN` (long random string), `VERBA_ENCRYPTION_KEY` (32 bytes, e.g. `openssl rand -hex 32`), `CORS_ORIGINS=https://your-dashboard.vercel.app`, `TRUST_PROXY=true` behind a proxy.
- Free hosts have ephemeral disks → use **Supabase**: run `apps/backend/supabase/schema.sql` in the SQL editor, then set `STORAGE=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Always serve the API over **HTTPS**.

**Dashboard (Vercel)** — import the repo, set the root directory to `apps/web` (uses `apps/web/vercel.json`), optionally set `VITE_API_URL` to your API URL.

**Extension** — connect it to the deployed API with a new connection code; Chrome will ask for permission to reach that origin (only localhost is pre-granted). For the Web Store, upload the ZIP from `npm run package:extension`.

---

## Privacy & security

- Text leaves the browser **only when you click an action**, and only the selected/submitted text. Nothing is read or sent while typing or browsing.
- Password, credit-card and one-time-code fields are ignored. Generated text is never sent or submitted automatically; Replace always requires a click.
- The content script cannot reach provider or history endpoints — the background worker enforces an allow-list; only extension pages can.
- API keys live only on the backend, encrypted at rest; responses expose a masked preview (`••••a1b2`).
- History can be disabled, auto-expired (retention days) or cleared at any time. Usage counters are kept without text.
- The access token is stored in `chrome.storage.local` (extension) and `localStorage` (dashboard) on your device — treat the connection code like a password.

## Known limitations

- **Google Docs** draws text on a canvas: selection replacement isn’t possible there (results are copy-only).
- Some rich editors (X, WhatsApp, LinkedIn) can reject programmatic edits; Verba then copies the result and tells you to paste — it never pretends it succeeded.
- Chrome exposes no selection for `email`/`number` inputs, so the toolbar can’t appear in those.
- Voice typing uses the browser’s speech service (Chrome/Edge send audio to their servers).
- File storage is single-process; use Supabase for multi-instance deployments.
