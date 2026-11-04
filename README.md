# LeadScout AI

**A sales research agent that runs in your browser.** Describe your product and your ideal customer. The agent finds accounts that fit, scores each one with reasons, researches it and writes a short outreach sequence that cites its sources. You review, edit and approve. **It never sends anything.**

**Live demo:** https://shaikbasha1437.github.io/leadscout-ai/ (no key, no sign-up; demo data is fictional)

## What it does

1. **You set the target.** Product (name, pitch, value points, proof points), ideal customer profile (industries, size, regions or countries, role titles, tech stack, hiring keywords, funding) and a sender identity and tone.
2. **The agent shows its plan and works through it step by step:** plan → find candidates → score fit → check the do-not-contact list → research each account → draft outreach → quality-check every draft. Each step shows what it did, live, and you can stop a run at any point.
3. **Fit score with reasons.** Every lead gets a 0–100 score from seven checks (industry, size, region, tech stack, a matching contact, hiring, recent funding), and each check says why it passed or failed. Scores are computed in code, never by a model.
4. **Research.** Numbered facts with sources (`F1`, `F2`…), recent signals, likely pain points (labelled as hypotheses, each tied to the facts it is based on) and likely stakeholders.
5. **Drafts that cite their research.** One email, one LinkedIn note (under 300 characters) and two follow-ups (day 4 and day 9). Every factual sentence carries a marker such as `[F4]` (account fact) or `[P2]` (your product's proof point). Click a marker to jump to its source. Markers are removed when you copy, open in your mail app, or export.
6. **Quality checks on every draft**, run locally:
   - **Unverified claims**: numbers, money, percentages, names and company events that don't appear in a cited source
   - Citations that point to a source that doesn't exist
   - Quotes from a source that contains hidden instructions (prompt injection)
   - **Spam words** ("act now", "guaranteed", "risk-free"…), ALL-CAPS and too many exclamation marks
   - **Overlong** emails, follow-ups, LinkedIn notes and subject lines
   - **Missing personalisation** (no name, no company, no account fact)
   - **Missing opt-out line**, a missing sender postal address (CAN-SPAM) and leftover placeholders like `{first_name}`
7. **Tone presets** (Friendly, Direct, Formal, Consultative), **Regenerate**, and **Edit**, which re-runs the checks live as you type.

**Leads table:** search, filter by status, flags and fit, and sort. Statuses: *new → researched → drafted → approved / skipped*. You can also add notes, use bulk skip or delete (with Undo), add leads by hand, **import a CSV** (it maps common headers, previews rows and blocks spreadsheet formulas) and **export to CSV or JSON**.

**Sequences:** a preview-only timeline of each approved sequence on working days. You choose the start date and cadence. It schedules nothing.

**Compliance:** CAN-SPAM, GDPR / UK GDPR and PECR, CASL, and the Australian Spam Act reminders, with links to the official guidance. There is a pre-send checklist and a **do-not-contact list** that accepts emails, domains (subdomains are matched too) and company names. A run skips matching leads, and adding an entry auto-skips matching leads (with Undo). These are reminders, **not legal advice**.

## Drafts only: nothing is ever sent

LeadScout has no server and no sending code. The most it does is:

- **Copy** a message to your clipboard, or
- **Open in mail app** (a `mailto:` link). Your own mail program opens a draft, and you decide whether to send it.

"Approve" only marks a lead approved in your browser. Exports include `sent: no` / `"sent": false` on every lead. Mail-app links are disabled for leads on the do-not-contact list.

## Demo mode vs live mode

| | Demo mode (default) | Live mode (your key) | In-browser model (WebLLM) |
| --- | --- | --- | --- |
| Key needed | No | Yes (not for local servers) | No |
| Accounts | 25 **fictional** companies | Your imported or added leads, the demo set (optional), and optional Tavily web search | Same as demo/live |
| Research and drafts | Deterministic local composer: the same input always gives the same output | Your model writes the summary, signals, pains and drafts from the numbered facts, and must cite them | A small model downloaded into the browser |
| Fit, do-not-contact, quality checks | Local | **Still local** | Local |
| Works offline | Yes | No | After download |
| Cost | Free | Shown per run (tokens × an editable price table) | Free |

**About the demo data.** All 25 demo companies, their people, job posts, funding rounds and news items are **made up**. They use `.example` domains (reserved, they can't resolve), and every person and outlet is labelled *fictional*. The demo never scrapes or contains real people's personal data. One demo news item ("Quillfeather") hides a prompt-injection attempt on purpose. The agent flags it, excludes it from drafts, and the quality check stops a draft that quotes it.

**What is simulated.** In demo mode the "search" step is a lookup in the fictional dataset. Research is assembled from that data by rules, and drafts come from templates filled with cited facts. Nothing is fetched from the web. The demo clock is fixed at 1 November 2026 so ages like "37 days ago" stay stable.

**Live providers:**

- **OpenAI** (Chat Completions, Bearer key)
- **Anthropic** (Messages API with the `anthropic-dangerous-direct-browser-access: true` header, which Anthropic requires for browser calls)
- **Google Gemini** (`generateContent`, key in the `x-goog-api-key` header, never in the URL)
- **Any OpenAI-compatible endpoint**: OpenRouter, Ollama, LM Studio, vLLM and others. Pick a preset or type a base URL.

If a model call fails or returns something unusable, that lead falls back to the local composer and its "How this was made" trace says so. Model output is validated: signals and pains that cite a fact that doesn't exist (or an injected one) are dropped. Stakeholder names that aren't in your lead data are removed, and the app adds the signature itself.

**Local servers:** browsers block calls to them unless they allow this site. For Ollama, start it with `OLLAMA_ORIGINS=https://shaikbasha1437.github.io ollama serve`. In LM Studio, turn on *Enable CORS*.

**Browser-call notes, tested November 2026:** see [Provider verification](#provider-verification) below.

### Web search: Tavily works, Brave doesn't

A web page can only call APIs that allow cross-origin (CORS) requests.

- **Tavily** allows browser calls (verified: its preflight returns `Access-Control-Allow-Origin`). With a Tavily key the agent can:
  - search the web for candidate companies. The model must cite a search result for each company it names, or the company is dropped.
  - search for recent news about each non-demo lead.
  - read the URLs you paste into a lead.
- **Brave Search API does not allow browser calls.** Its preflight (`OPTIONS`) returns 405 with no CORS headers, so it would need a server proxy. LeadScout has no server, so Brave is not offered.
- Without Tavily, pasted URLs are **not** opened (browsers block reading other sites). The trace says so. Paste the page text into the research notes instead.

Search finds companies, not people. LeadScout never looks up or scrapes personal data. Contacts come only from what you import or type.

### WebLLM (experimental, untested)

The in-browser model option uses WebLLM and needs WebGPU. **It has not been tested end to end**: the test machines had no GPU. Treat it as experimental. Expect small models to write weaker drafts.

## Privacy and keys

- Your API key (and Tavily key) is stored **only in this browser**: localStorage, or sessionStorage if you pick "this tab only". It is sent only to the provider you chose, straight from your browser.
- Keys are **never** put in URLs, share links, workspace exports, CSV or JSON exports, or the saved workspace. Everything that leaves the app first goes through a redactor that drops key fields and masks key-shaped strings, even a key pasted into a note. Tests check this.
- **Share link** carries only your product description, ideal customer profile and tone. It never includes leads, notes, sender details, settings or keys.
- Settings → Data: **Forget keys**, **Export / import workspace**, **Reset everything** (with Undo).

## Usability

- Every dialog closes with ✕, Cancel, Esc, a click outside, or the browser Back button. Required fields never block Cancel. Unsaved edits ask before they are discarded.
- Destructive actions (delete, skip, reset, re-run over existing drafts, removing a do-not-contact entry) show an **Undo** toast.
- Responsive down to small phones (the lead table turns into cards). Light and dark themes. Keyboard and screen-reader friendly.
- Installable PWA with relative paths. The service worker is network-first with a versioned cache, so demo mode works offline.

## Architecture

No build step, no dependencies, no server. Plain ES2020 in UMD modules that run in both the browser and Node.

```
js/agentkit/   shared agent toolkit: llm.js (providers, request/response, cost), keystore.js (keys + redaction),
               guard.js (injection detection, fencing), modal.js (modal stack + history), search.js (Tavily), webllm.js
js/data/       companies.js: the 25 fictional demo companies
js/lead/       text.js, icp.js (fit scoring), research.js (facts, signals, pains, stakeholders), compose.js (demo drafts, tones),
               quality.js (draft checks), compliance.js (rules, DNC, mailto), csv.js, live.js (model prompts + validation),
               agent.js (the step-by-step run), store.js (state, exports, share links)
js/ui.js, js/app.js, js/views/*.js, js/main.js   the interface
sw.js, manifest.webmanifest                      PWA
```

Rules stay in code: fit scoring, the do-not-contact check and quality checks never go through a model. Research facts and web results are fenced as untrusted data in prompts, and the model is told never to follow instructions inside them.

## Run locally and test

```bash
python3 -m http.server 8000     # then open http://localhost:8000
npm test                        # node --test test/  (Node 18+, no installs)
```

The tests use only mocked model and search calls with fake keys. They cover fit scoring, research, all four tones, every quality check, the do-not-contact list, CSV import/export, prompt building and output validation, the Tavily client, full agent runs (live and fallback, DNC, approved drafts kept, stop mid-run) and key redaction in saves, exports and share links.

## Provider verification

Checked on 2026-11-04 from the live origin (`https://shaikbasha1437.github.io`) in Chrome and Firefox, using **fake keys only**. "Readable" means the browser let the page read the provider's error reply, so CORS works and a real key should go through. No real key was used, so a successful generation was not observed for any provider.

| Provider | Browser result with a fake key | What it means |
|---|---|---|
| Anthropic | Readable: HTTP 401 `invalid x-api-key` | CORS works (LeadScout sends `anthropic-dangerous-direct-browser-access: true`). |
| Google Gemini | Readable: HTTP 400 `API key not valid` | CORS works. |
| OpenRouter (OpenAI-compatible) | Readable: HTTP 401 | CORS works. |
| OpenAI | Preflight allowed, but the 401 for a bad key has no CORS header, so the browser reports a network error | Could not be confirmed without a real key. The app says that a wrong key can look like a network error. |
| Ollama / LM Studio (local) | Not tested against a real server | Needs `OLLAMA_ORIGINS` or LM Studio's CORS switch. The live-mode flow was tested end to end against a local mock OpenAI-compatible server. |
| Tavily search | Readable: HTTP 401 | CORS works. |
| Brave Search | Blocked: preflight returns 405 with no CORS header | Can't be called from a browser page, so LeadScout doesn't offer it. |
| WebLLM (in-browser) | Untested | The option is there, but it hasn't been checked on real hardware. |

## Limits

- Demo data is fictional, and demo research is rule-based, not real research.
- Quality checks are heuristics. They catch invented numbers, names and events that aren't in a cited source, but they can't judge whether a sentence is persuasive or true in the real world. Read every draft.
- Live quality depends on your model and on what your leads and sources actually contain.
- Compliance reminders are general and not legal advice. Rules vary by country and change.
- Everything lives in this browser. Clearing site data deletes it, so export first.
- LeadScout never sends email, never posts to LinkedIn, and never schedules anything.

## License

MIT. See [LICENSE](LICENSE).
