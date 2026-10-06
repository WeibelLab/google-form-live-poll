# google-form-live-poll

Slido-style live poll board on Google Forms for CSE 291A (Fall 2026). Owner: Nadir Weibel. TA: Weichen Liu (wel008). Background and original requirements: `HANDOFF.md`.

## Decisions (2026-10-05)

- **Repo:** https://github.com/WeibelLab/google-form-live-poll (public, created 2026-10-05). Pages from `main` `/docs`: https://weibellab.github.io/google-form-live-poll/
- **Architecture (Nadir 2026-10-05: board must be on GitHub Pages, nothing running on his machine, Claude clustering in the cloud):** board `docs/index.html` on Pages polls the Apps Script web app (`apps-script/Board.gs`, `doGet`), which reads responses directly from the forms (FormApp, no Sheet lag) and returns only aggregates. Web app: execute as Nadir, access Anyone, guarded by `BOARD_KEY` (script property). The key travels in the link hash `#k=` and is never in the repo. Board link: `https://weibellab.github.io/google-form-live-poll/?course=cse291a&week=N#k=BOARD_KEY`. Web app URL goes in `docs/config.js`. No Google Cloud project needed.
- **Themes:** paragraph questions get Claude themes (`claude-opus-5-5`, effort low, JSON schema output, server-side fallback default) computed in Apps Script when the answer count changes; API key in script property `ANTHROPIC_API_KEY` (entered by Nadir). Board key T toggles themes/words.
- **Credit:** `exportCreditAllWeeks` writes private Sheet `Participation credit` in Discussion Polls: tab `Summary` (per student: questions answered per week, weeks participated, total) plus tabs `Week NN` (email, per-question timestamp). `installCreditTrigger` refreshes it hourly (cloud trigger).
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
- 2026-10-05 Week 1 test (Nadir's own response, W01 Q1 "Grad: CSE PhD"): verified email recorded, second attempt shows "You've already responded". Latency Submit -> endpoint data: 3.2 s (response readable server-side after ~1.2 s; each web app round trip ~2.0 s). Target 2 s not met with polling; push (onFormSubmit -> Firebase RTDB) proposed. Test response still to be deleted by Nadir.
- 2026-10-05 Firebase push live: project google-form-live-poll (ID form-live-poll), RTDB https://form-live-poll-default-rtdb.firebaseio.com, rules: root closed, /boards/$key readable when key length >= 64, no client writes. Submit triggers installed for weeks 1-2 via `syncWeek1And2`, daily `syncTriggers` at 6 am PT keeps current + next week (20-trigger limit). Measured: Google response timestamp -> Firebase event 1.9 s (trigger 1.2 s of it); board renders ~0.1 s later. Board falls back to web app polling every 3 s.
- Board UI: question buttons in header, clicker keys, `&q=N` start question.
- GitHub Pages blocked by GitHub Actions incident (2026-10-05 afternoon); local preview: `.claude/launch.json` "board" serves docs/ on 127.0.0.1:8770.
- 2026-10-05 Question types: board supports multiple choice, dropdown, checkboxes (% of students), short answer (whole-answer cloud), paragraph (Claude themes), linear scale and rating (bars + average), multiple choice grid (stacked bars). Web app redeployed as Version 2 (same URL).
- 2026-10-05 Weeks 3-10 questions: extracted from the Discuss / Reflection slides, reframed for polling (`WEEK_QUESTIONS` in Setup.gs), applied with `applyWeekQuestions` (24 forms, only forms without responses are touched). Nadir approved ("go ahead").
- 2026-10-05 Slides: "Live poll ▶" button (navy, gold border, bottom right, hyperlink to board with &q=N) added to Discuss/Reflection slides in Weeks 3-10 via python-pptx (`buttons.py` logic: Week->slide->question map). Backups in Slides/Backup 2026-10-05 (before live poll buttons)/. Week 2 pending: deck open in PowerPoint.
- Board links for all weeks: Doc "Board links (staff only)" in Discussion Polls (1diD725gKNd4Z13Unb6Alyx0ealg-LfTkveA7RfTwBWY).
- README rewritten for TAs and admins, demo mode `?demo=1`, screenshots in docs/img.
- Open: multi-course registry and setup wizard (COURSE block in Setup.gs and PUSH_COURSE in Push.gs are single-course); remove temporary `zzDebug` from Code.gs in the editor.
- 2026-10-05 evening: choices revised from last year's "Discussion Highlights" slides (CSE291A FA25, DSC266R WI25/WI26 in the HCAI Drive folder). "Other" option on most multiple-choice questions (board shows typed answers as one "Other" bar, text not displayed). Week 2 now in WEEK_QUESTIONS (Q3 new choices). Week 3 Q1 checkboxes (max 2). Week 4 Q2 uses the course's problem-framing pitfalls. Week 9 Q4 added (political affiliation as protected attribute). Web app Version 3. Local prototype configs (prototype/cse291a_weekNN.json) are now outdated; hosted board is the fallback-free path.
- 2026-10-05 Admin page (wizard): Admin.gs + admin.html, served by doGet(?admin) from a second deployment "Admin page (UCSD only)" (execute as Nadir, access anyone within UC San Diego): https://script.google.com/a/macros/ucsd.edu/s/AKfycbwQ_D73yvzjz_Gg3jpo7DlhbH8wI4HGrCRUN6s7Bs1btouSh-GG8cDjeluvSUYun_3x/exec?admin . Access: owner + script property ADMINS (Admins tab). Tabs: Questions (edit/add per week; locked when answers exist), Answers (load, delete selected from form + response Sheet), Board links, New course (folders + style master copy, then forms per week, then syncTriggers), Admins. Tested 2026-10-05: page loads, Week 1 questions and answers listed.
- Courses are now a list in script property COURSES (seeded with cse291a); Setup/Board/Push are course-generic (course found from a form's grandparent folder). Public board deployment still Version 3 (older single-course code, works); admin deployment is Version 4. Update the public deployment to the newest version after class on 2026-10-06. Triggers run the newest saved code.
- README rewritten around the shared course folder and the admin page.
- 2026-10-05 Admin: Remove question (form + response Sheet to Drive trash, trigger removed, warns if answers) and Add question installs its trigger immediately. Admin deployment Version 6.
- 2026-10-06 Class instances: course field `term` (cse291a = "Fall 2026", in SEED_COURSE; no forms touched), dropdown label "title (term)", Board links tab edits title/term (slug fixed). New course: Term + "Copy questions from" (copies questions/types/choices per week via describeForm_ -> specFromForm_, never answers). syncTriggers skips courses ended more than a week ago (courseEnded_). Board shows title + term when the endpoint sends `course` (public deployment still Version 3, which doesn't; board falls back to config.js title). Admin deployment Version 7. Verified 2026-10-06 morning: Week 2 board loads, endpoint and Firebase return the 3 Week 2 forms.
