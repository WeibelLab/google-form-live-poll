# google-form-live-poll

Slido-style live poll board on Google Forms for CSE 291A (Fall 2026). Owner: Nadir Weibel. TA: Weichen Liu (wel008). Background and original requirements: `HANDOFF.md`.

## Decisions (2026-10-05)

- **Repo:** https://github.com/WeibelLab/google-form-live-poll (public, created 2026-10-05). Pages from `main` `/docs`: https://weibellab.github.io/google-form-live-poll/
- **Architecture (Nadir 2026-10-05: board must be on GitHub Pages, nothing running on his machine, Claude clustering in the cloud):** board `docs/index.html` on Pages polls the Apps Script web app (`apps-script/Board.gs`, `doGet`), which reads responses directly from the forms (FormApp, no Sheet lag) and returns only aggregates. Web app: execute as Nadir, access Anyone, guarded by `BOARD_KEY` (script property). The key travels in the link hash `#k=` and is never in the repo. Board link: `https://weibellab.github.io/google-form-live-poll/?course=cse291a&week=N#k=BOARD_KEY`. Web app URL goes in `docs/config.js`. No Google Cloud project needed.
- **Themes:** paragraph questions get Claude themes (`claude-opus-5-5`, effort low, JSON schema output, server-side fallback default) computed in Apps Script when the answer count changes; API key in script property `ANTHROPIC_API_KEY` (entered by Nadir). Board key T toggles themes/words.
- **Credit:** `exportCredit(week)` writes tab `Week NN` (email, per-question timestamp, count) to private Sheet `Participation credit` in Discussion Polls.
- **Data stays in Google.** Emails never leave FormApp/Sheets; the endpoint returns aggregates only. The repo holds no student data and no keys. Drive IDs in the repo are fine: the files are private to Nadir and course staff.
- **Folder-driven.** Course root folder = "Discussion Polls" (`1hJejev5nmwiLTBaip6lp0uW7peNlXoIR`, inside `CSE291A - Fall 2026`). One subfolder per week. Every Google Form in a week folder becomes a slide, ordered by file name (`W02 Q1 - ...`). Any extra form added to the folder is picked up.
- **Chart by question type:** multiple choice gives bars; short text gives a word cloud of whole answers (Slido style); long text (paragraph) gives a word cloud of single words, later themes (clustering, method pending Nadir: Claude via Apps Script vs in-browser embeddings).
- **Form settings (all forms):** verified email, 1 response per user, sign-in required, responders limited to ucsd.edu (Drive permission `domain ucsd.edu reader view=published`, `anyone` removed), linked response Sheet in the same week folder.
- **Styling:** forms are copies of `_Style master (do not delete)` (`1d9aln0ApnGtvZZf8WYFwMrl7y2nYinL2sopTGWPGXGE`) in Discussion Polls, themed like the Canvas course: color `#13305a`, gold `#deb160`, header `assets/form-header.png` (1600x400, built from the Canvas course banner). Forms themes cannot be set by script; copies keep the theme.
- **Apps Script project** "Google Form Live Poll" (`1ojRVXz2w0fBclYeVjKqSgH47KNnZIJk2o5Qdq9Pr4cZ0a8ybjNnPbvNd`, owned by weibel@ucsd.edu, authorized 2026-10-05). Source: `apps-script/Setup.gs`. Functions: `createStyleMaster`, `setupAllWeeks` (idempotent, writes `manifest.json` with form IDs and responder URLs to Discussion Polls).
- **Wizard (planned):** Apps Script web app to set up a new course (folder, weeks, style, questions) with the same code.
- Week 1 = the three Week 0 example questions (program, why this class, AI tool). Week 2 questions from the Week 2 deck (open source). Weeks 3-10 = templates "(edit me)".

## Week folders

| Week | Date | Folder ID |
|---|---|---|
| 1 | 2026-09-29 | 1vONiapz314qphNss006gpKruJP6GSYR9 |
| 2 | 2026-10-06 | 10tt7a9aCyDlAlw3f1j2sEHUg880VylaQ |
| 3 | 2026-10-13 | 1_Y6S-6pvk1gnZ1Ew21xgg-R92t1lDW8C |
| 4 | 2026-10-20 | 1njOQJszHv8lWM5Bo3Nc51gu0Adkzv1x- |
| 5 | 2026-10-27 | 1Vb3h-WeBVcd_aG4Ppu6VIjALg0CPj_Rd |
| 6 | 2026-11-03 | 1GI0XGLPk-SB6FLSOCX4O2Q4GesLwzBSO |
| 7 | 2026-11-10 | 166oulGwC8fNpY2mhnZD6YlNlX526cTr5 |
| 8 | 2026-11-17 | 1gQoYxO_UklLUaO1pYRXOSmswdsfHeQ7I |
| 9 | 2026-11-24 | 1HRxKNbnSO0jxWXZ92w0UcwjDQom4Voz1 |
| 10 | 2026-12-01 | 1iaB9jt-JsjU0T5yTJH07zNrGpile5Ds6 |

## Constraints

- Ask Nadir before creating repos, Cloud/Firebase projects, or any OAuth consent; he clicks consent himself.
- No student emails or names in the repo, endpoints, logs or chat. Test with own responses, then delete them.
- No LaunchAgents/cron. No Canvas changes.
- Writing: short, direct, no em dashes.

## Open items

- Clustering method for long answers.
- Nadir to: run `createBoardKey`, add `ANTHROPIC_API_KEY`, deploy web app (Anyone), send web app URL. Then test with Week 1 (not Week 2) and measure latency; Nadir deletes the test response.
- aabroukh access confirmed OK by Nadir (2026-10-05).

## Current state

- 2026-10-05: 30 forms created and verified (theme, UCSD-only, verified email). `prototype/manifest_cse291a_fa26.json` holds all IDs. Local board configs `prototype/cse291a_weekNN.json`; Week 2 board tested against the real Sheets (0 responses). Hosted board, wizard, credit export UI and clustering not built yet.
