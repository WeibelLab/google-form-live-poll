# Handoff: live-poll, a Slido-style live poll board on Google Forms (CSE 291A)

You are starting the independent project `~/Projects/live-poll` (git repo, currently this file plus `prototype/`). Owner: Nadir Weibel (UC San Diego, CSE). Read this file fully before doing anything.

## Why this exists

CSE 291A Human-Centered AI (Fall 2026, ~120 students, Canvas course 77866, TA Weichen Liu, hybrid discussion Tuesdays 9:30-10:50am PT in Mosaic 0113 and on Zoom) wants live polls in class with Slido-like visuals (word clouds, bar charts updating on the projector), AND to know who answered so students get participation credit. Slido's free plan cannot export who answered (Week 0 had 44 participants; only aggregates are visible). AhaSlides is being evaluated separately by Nadir (account created; not part of this task unless he asks).

## What already exists (working prototype)

- **Three Google Forms, one per question** (Nadir wants one form per question). All: collect **verified** email, **limit 1 response**, **published restricted to UC San Diego** (Drive permission `domain ucsd.edu reader view=published`), each linked to its own response Sheet in Nadir's My Drive (root folder).

| # | Question | Type | Form ID | Responder URL | Response Sheet ID |
|---|---|---|---|---|---|
| 1 | What's your program? (Grad: CSE MS / Grad: CSE PhD / Grad: DSC / Grad: other program / Undergrad) | multiple choice → bars | 1St9bQnBNgMsvnYV1F_8KIu4tN-81GRU9lNvixkTfhJk | https://docs.google.com/forms/d/e/1FAIpQLSeurScVFJYBG0mKnDImlWVnL6BZzclBcU84I5mGdIV8Kzp3BA/viewform | 1FKJ9hAZ67l1MCp6SwZv_WuIj8oOvYQdTOAEYdnz9EuA (still has columns of two deleted questions and one test response from Nadir) |
| 2 | One word for why you're taking this class | text (Paragraph) → word cloud | 17uNfUDxR3tuG4xmlPXCCe-D9XRgc2h2-UC7Og-isruo | https://docs.google.com/forms/d/e/1FAIpQLSfmejHY0rTTwaMEMA749uFF0nZ4LFQZs7fAZdMA_E7lGWnjzQ/viewform | 1U6XILlrO8NZWj05Egx7liOap1yyN19wFXjQdclQztHs |
| 3 | An AI tool you use every day | text (Paragraph) → word cloud | 1ukqAZvqgRbpbo7tLb4YzozU4_t6pNQCCvBDO_Dzrrxc | https://docs.google.com/forms/d/e/1FAIpQLSdUw1RLQ8DhIKk0Rj4Xa2FWaCjfm4VmwPPV3SaeHYK2Qp1FhA/viewform | 1kYqQWKI82RZEOQ3FgNK0SWevoLaFQHWJB-pSZsud6i4 |

- **Local board** `prototype/live_poll.py` (copy of `~/Projects/canvas-rollover/tools/live_poll.py`, which stays the working fallback, launcher `~/Projects/canvas-rollover/bin/live-poll-cse291a-week0`, config `prototype/cse291a_week0.json`): Python HTTP server on 127.0.0.1:8765; reads each response Sheet with the Google Docs MCP OAuth token (`~/.google-docs-mcp/token.json`, read-only use, scopes include `drive` but NOT forms/spreadsheets-specific or script-run of FormApp); aggregates answers (no names/emails on screen); page polls `/data` every 1 s; slide per form with its own QR code; bars for multiple choice, word cloud (wordcloud2.js from cdnjs) for text, most common original spelling shown; keys ←/→/1-9 switch slide, Q toggles QR; `--credit out.csv` writes email + timestamp for credit; `demo` mode with sample data.
- **Measured latency** (2026-10-05): a row written to the response Sheet appears in the board data 1.2 s later, plus up to 1 s page poll. Google's Form → Sheet propagation adds its own delay on top (not yet measured; typically a few seconds). **Nadir says 6 s is too much. Target: an answer visible on the projector ≤ 2 s after the student taps Submit.**

## What Nadir wants now

1. **Hosted, not local.** He asked for "deploy it on GitHub instead of local". Constraint: student emails are FERPA-protected (UC P3); response Sheets must never be public. A static GitHub Pages site cannot read private Sheets by itself. Propose the architecture with a recommendation and get Nadir's OK before building. Candidates:
   - **A. Code on GitHub + Google Apps Script backend.** An Apps Script project (owned by Nadir, source managed in the repo with `clasp`) with an `onFormSubmit` trigger per form that writes aggregated counts (never emails) to a small store, and a web app endpoint returning aggregates as JSON. Board page on GitHub Pages fetches it. Latency is bounded by the trigger (usually ~1 s) plus polling.
   - **B. Push-based realtime:** `onFormSubmit` trigger → Firebase Realtime Database / Firestore (aggregates only) → board listens with the Firebase SDK (sub-second updates). Free tier is enough. Requires a Firebase project (Nadir must create/authorize).
   - **C. Everything inside Apps Script** (HtmlService board, access "anyone at UCSD"), code still versioned on GitHub. Simplest auth story, but polling latency like A.
   Whichever: the public surface may expose only aggregates (counts per choice, word frequencies). Consider protecting the endpoint with an unguessable per-course key. Free text is shown on the projector anyway, so aggregated words are acceptable.
2. **Weekly templates, starting tomorrow (Tuesday 2026-10-06, Week 2 discussion).** One board per week: Week 2 Oct 6, Week 3 Oct 13, Week 4 Oct 20, Week 5 Oct 27, Week 6 Nov 3, Week 7 Nov 10, Week 8 Nov 17, Week 9 Nov 24, Week 10 Dec 1. The actual questions per week come from Nadir/Weichen; ask them (the "Reflection Question" slides in each week's deck in Drive `Teaching/UCSD/HCAI (DSC266R - CSE291A)/CSE291A - Fall 2026/Slides/` are possible sources, but confirm). Week 0's three forms above are the first example. If the hosted version cannot be ready for tomorrow 9:30am, make sure the local prototype can run Week 2 (new forms + config) as a fallback, and say so early.
3. **Weichen must be able to add questions without code.** Proposed design (confirm with Nadir): a **control Google Sheet** "CSE 291A Live Polls" with one row per question: week, order, question text, type (multiple choice/word cloud), choices, form ID, responder URL, response sheet ID, active. An Apps Script custom menu ("Live Polls → Add question") creates the form from the row: FormApp `create`, `setEmailCollectionType(VERIFIED)`, `setLimitOneResponsePerUser(true)`, `setRequireLogin(true)` (domain only; verify it maps to the UCSD restriction and the publish state), `setDestination(SPREADSHEET, …)`, installs the submit trigger, and fills the IDs back into the row. The board reads the control sheet to know which slides to show per week (`?week=2`), each slide with its own QR. Adding a question = adding a row and clicking the menu item. Document this for Weichen in a short how-to.
4. **Credit export:** per week, a list of UCSD emails who answered each question (from the response Sheets), written to a private Sheet tab or CSV for grading. Never on the public board.
5. **Latency ≤ 2 s** end to end (see above). Measure it with a real form submission once deployed and report the number.

## Hard constraints

- **Ask Nadir before**: creating the GitHub repository (which account/org, public vs private; GitHub Pages on a private repo needs a paid plan; the HXI lab org may be `WeibelLab`), creating any Firebase/Google Cloud project, and any OAuth consent or Apps Script authorization (Nadir clicks those himself; never type passwords or approve consent screens for him).
- No student emails or names in the repo, in public endpoints, in logs, or pasted into this conversation. Test with synthetic data or your own test responses, and delete test responses afterwards (from both the form and the response Sheet).
- No system-level automation on Nadir's Mac (no LaunchAgents/cron). Apps Script/Firebase triggers in the cloud are fine. Do not modify `~/.google-docs-mcp/token.json`.
- No changes to Canvas (that is the separate `~/Projects/canvas-rollover` project); if a Canvas page should link the board, propose it.
- Writing style for anything Nadir or students read: short, direct, no em dashes, no rhetorical flourish.
- Keep a `CLAUDE.md` in this repo updated after each decision (decision, parameters, IDs, current state), plus a `README.md` for Weichen.

## Start with

A short plan for Nadir: chosen architecture (A/B/C) with the reason, what Nadir must click/authorize, how Weichen adds a question, the plan for tomorrow's Week 2 (hosted or local fallback), and the questions you need from him. Wait for his OK before creating repos, cloud projects or forms.
