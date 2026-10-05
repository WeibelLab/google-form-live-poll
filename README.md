# Google Form Live Poll

Live polls for class discussions, built on Google Forms. Students scan a QR code, sign in with their UCSD account and answer on their phone. The projector shows the results live: bars, word clouds, agreement scales, grids, and themes for open answers grouped by Claude. Every answer is stored with the student's verified UCSD email, so participation credit comes out of a Google Sheet.

- Board: https://weibellab.github.io/google-form-live-poll/
- Demo with sample data: https://weibellab.github.io/google-form-live-poll/?course=cse291a&demo=1
- Used in: CSE 291A Human-Centered AI, Fall 2026 (Nadir Weibel, TA Weichen Liu)

![Board showing a multiple choice question](docs/img/board-q1.png)

## Contents

1. [How it works](#how-it-works)
2. [Where the data lives: the course folder](#where-the-data-lives-the-course-folder)
3. [Class instances](#class-instances)
4. [For TAs: running a class](#for-tas-running-a-class)
5. [For TAs: preparing the questions](#for-tas-preparing-the-questions)
6. [Question types and what the board shows](#question-types-and-what-the-board-shows)
7. [Removing answers](#removing-answers-tests-duplicates-inappropriate-text)
8. [Participation credit](#participation-credit)
9. [Setting up a new course](#setting-up-a-new-course)
10. [Privacy](#privacy)
11. [Troubleshooting](#troubleshooting)
12. [Repository layout](#repository-layout)

## How it works

```
 Student phone                Google (instructor's account)                     Projector
 ─────────────                ──────────────────────────────                    ─────────
 QR code ──> Google Form ──> responses (email + answer) ──> Apps Script ──┬──> Firebase ──> Board on GitHub Pages
             (UCSD sign-in)        │                        (on submit)   │    (counts only)  (updates in ~2 s)
                                   │                                      └──> web endpoint (counts only, fallback)
                                   └──> Participation credit Sheet (emails, private)
```

- **One Google Form per question.** Forms live in a Drive folder per week.
- **Apps Script** (project "Google Form Live Poll", owned by the instructor) runs on each submission, counts the answers and writes the counts to **Firebase**. It also serves the same counts from a web endpoint, which the board uses as a fallback, and computes Claude themes for open answers.
- **The board** is a static page on GitHub Pages. It reads only counts, never emails. It needs the board key, which is part of the link.
- **Credit** is written by the same script to a private Google Sheet.

Measured on 2026-10-05: an answer appears on the board about 2 s after the student taps Submit.

## Where the data lives: the course folder

Everything for one course is in **one Google Drive folder**, the *course folder*. For CSE 291A Fall 2026 it is:

`My Drive / Documents / Teaching / UCSD / HCAI (DSC266R - CSE291A) / CSE291A - Fall 2026 / Discussion Polls`
(folder ID `1hJejev5nmwiLTBaip6lp0uW7peNlXoIR`)

Inside it:

```
Discussion Polls/                          <- course folder
  Week 01 (2026-09-29)/                    <- one folder per week, name must start with "Week NN"
    W01 Q1 - What's your program?          <- Google Form (one question)
    W01 Q1 - What's your program? (responses)   <- its response Sheet
    W01 Q2 - ...
  Week 02 (2026-10-06)/
  ...
  Week 10 (2026-12-01)/
  _Style master (do not delete)            <- styled form that every new form is copied from
  form-header.png                          <- header image used in the master form's theme
  Participation credit                     <- Sheet with the credit export (private)
  Board links (staff only)                 <- Doc with the board link for every week
  manifest.json                            <- IDs of all forms (written by the setup script)
```

**How the system knows this folder.** The folder ID is set in two places in the Apps Script project:

- `apps-script/Setup.gs` (called `Code.gs` in the Apps Script editor), `COURSE.folderId` (and `COURSE.weeks`, the week folder IDs). Used to create forms and to export credit.
- The board link's `course=cse291a` is mapped to the same folder ID (script property `COURSES`, defaulting to `COURSE.folderId`).

The board itself never stores folder IDs. It asks the script for "course cse291a, week 2", and the script looks for the subfolder whose name starts with `Week 02` inside the course folder.

**Rules that make the board work**

- Week folders are named `Week NN (YYYY-MM-DD)`, with the date of the class. The date tells the daily job which week is current.
- Form file names start with `WNN QN - `. The board shows the forms in file-name order.
- Every form in a week folder becomes a slide, including forms added later.

## Class instances

A *class instance* (for example "CSE 291A Fall 2026") is one course folder plus a short name used in links (`cse291a`). Today the system runs one instance, CSE 291A Fall 2026, from the instructor's Apps Script project.

To run another instance from the same script:

1. Create its course folder with week subfolders (or use the wizard, see below).
2. Add it to the script property `COURSES`, for example `{"cse291a": "<folder id>", "cse291b-wi27": "<folder id>"}` (Apps Script editor, Project Settings, Script properties).
3. Use `course=cse291b-wi27` in its board links.

Current limits, being addressed by the setup wizard (in progress):

- Form creation (`setupAllWeeks`), credit export and the submit triggers still read the single `COURSE` block in `Setup.gs`. A second instance needs its own block until the wizard replaces it with a course list.
- Google allows 20 triggers per script. Each instance uses 6 (current and next week, 3 forms each), so one script can serve about 3 instances at a time.

A different instructor can also run a fully separate copy: their own Apps Script project from this repo, their own Firebase project, and the same board page with their own web endpoint in `docs/config.js`.

## For TAs: running a class

**Before class (2 minutes)**

1. Open the Doc **Board links (staff only)** in the course folder and copy the link for this week.
2. Open it on the classroom computer. Check that the questions are the right ones and show 0 responses.

**In class**

- The discussion slides have a **Live poll ▶** button on each poll slide. Click it during the slideshow to open the board on that question.

  ![Live poll button on a discussion slide](docs/img/slide-button.png)

- Students scan the QR code on the right and answer. Results update in about 2 seconds.
- Switch questions with the **‹ 1 2 3 ›** buttons at the top, the arrow keys, a presentation clicker, or keys 1-9.
- **Q** hides or shows the QR code. **T** switches an open question between Claude themes and a word cloud.
- Add `&q=2` to a link (before `#k=`) to open it on question 2.

**After class**

- Nothing to do. Credit is in the Participation credit Sheet (see below).

## For TAs: preparing the questions

The questions for Weeks 1-10 are already in the forms. To change one:

1. Open the week folder and the form (for example `W05 Q2 - ...`).
2. Edit the question. Pick the type that gives the display you want (see the next section).
3. Change the form title at the top to the same text, and rename the file so it still starts with `W05 Q2 - `.
4. Leave Settings and Publish alone: verified email, one response, UCSD only.

To **add a question** to a week:

1. In Drive, right-click a form of that week, **Make a copy**, keep it in the same folder.
2. Rename it `W05 Q4 - <question>` and edit the question.
3. In the copy, **Responses**, **Link to Sheets**, create a new spreadsheet.
4. **Publish**: responders UC San Diego only. **Settings**: collect verified emails, limit to 1 response.

The new slide shows up on the board within 30 seconds. Live updates within 2 seconds start the next morning (the daily job adds the submit trigger); until then the board refreshes it every 3 seconds.

Tips for good poll questions:

- One idea per question. A slide with three sub-questions becomes three forms.
- Use multiple choice or a scale for opinions, Short answer for one word, Paragraph for one open question per week.
- Activities ("explore this website", "read this document") don't poll well. Ask about the result instead ("What surprised you…").

## Question types and what the board shows

The board picks the display from the question type in Google Forms.

| Type in Google Forms | Board |
|---|---|
| Multiple choice, Dropdown | Bars with % and count, in the form's order |
| Checkboxes | Bars, % of students who picked each option |
| Short answer | Word cloud of whole answers ("Claude Code" stays one item) |
| Paragraph | Claude themes: 3 to 7 groups with a summary and one real answer each. **T** switches to a word cloud. |
| Linear scale | Bars per point, the average, and the end labels |
| Rating (stars) | Same as linear scale, with stars |
| Multiple choice grid | One stacked bar per row |

Not used for live polls: Date, Time, File upload, Checkbox grid.

| Multiple choice | Linear scale |
|---|---|
| ![Bars](docs/img/board-q1.png) | ![Scale](docs/img/board-q3.png) |
| **Multiple choice grid** | **Paragraph (Claude themes)** |
| ![Grid](docs/img/board-q4.png) | ![Themes](docs/img/board-q5.png) |

## Removing answers (tests, duplicates, inappropriate text)

The board and the credit export read responses from the **form**, not from the linked Sheet. The Sheet is a copy.

1. Open the form, **Responses**.
   - One answer: **Individual** tab, find the response, trash icon.
   - All answers (for example after testing): **⋮**, **Delete all responses**.
2. Delete the matching rows in the linked response Sheet, so the copy matches. Deleting in one place does not change the other.
3. The board updates within about 3 seconds. Run `exportCreditAllWeeks` to refresh the credit Sheet right away, or wait for the hourly refresh.

A student whose response was deleted can answer that form again.

## Participation credit

The Sheet **Participation credit** in the course folder has:

- **Summary**: one row per student, the number of questions answered each week, weeks participated, total.
- **Week NN**: one row per student, the time of each answer.

To refresh it: Apps Script editor, open `Board.gs`, pick `exportCreditAllWeeks`, **Run**. To refresh it every hour automatically, run `installCreditTrigger` once.

## Setting up a new course

Until the wizard is finished, setup is done in the Apps Script editor by the instructor (about 15 minutes):

1. **Course folder.** Create the folder and week subfolders `Week 01 (date)` … in Drive.
2. **Script.** Open the Apps Script project (or create one and add the files in `apps-script/`). In `Setup.gs` set `COURSE` (name, folder ID, week folder IDs) and the questions (`QUESTIONS`, `WEEK_QUESTIONS`).
3. **Style.** Run `createStyleMaster`. Open the master form, palette icon: header image, color, background. Every form is copied from it, so this is done once.
4. **Forms.** Run `setupAllWeeks` (creates 3 forms per week with all settings and a response Sheet), then `applyWeekQuestions` for the weekly questions.
5. **Board key.** Run `createBoardKey`. Copy `BOARD_KEY` from Project Settings, Script properties.
6. **Claude themes (optional).** Add the script property `ANTHROPIC_API_KEY` (from console.anthropic.com).
7. **Web endpoint.** Deploy, New deployment, Web app, execute as Me, access Anyone. Put the URL in `docs/config.js` (`api`).
8. **Firebase.** Create a Firebase project and a Realtime Database (locked mode). Set the rules from `firebase/database.rules.json`. Put the database URL in `docs/config.js` (`firebase`) and in `Push.gs`.
9. **Triggers.** Run `syncTriggers` once. It installs the submit triggers for the current and next week and a daily job at 6 am that moves them along.
10. **Links.** Board link per week: `https://weibellab.github.io/google-form-live-poll/?course=<course>&week=<N>#k=<BOARD_KEY>`.

After any code change: save in the editor, then **Deploy, Manage deployments, edit, New version, Deploy** so the web endpoint runs the new code. The URL stays the same.

## Privacy

- Student emails stay in the instructor's Google Forms and Sheets (UC P3 data, FERPA). They are never in this repository, in Firebase, in the web endpoint or on the board.
- The board shows counts, words, themes and one example answer per theme. Answers are visible on the projector anyway.
- Firebase and the web endpoint only answer with the board key. The key is in the link after `#`, which browsers don't send to GitHub.
- Claude themes send answer text only (no names, no emails) to the Claude API from Apps Script.
- Forms are restricted to UC San Diego accounts. Google requires students to tick "Record my email" for verified email collection; that tick is what makes credit reliable.

## Troubleshooting

| Problem | Fix |
|---|---|
| Board says "bad key" | The link is missing part of the key after `#k=`. Copy it again from the Board links Doc. |
| A question doesn't show | Check the form is in the right week folder, its name starts with `WNN QN - `, and its type is in the table above. Wait 30 s. |
| Answers appear after about 3 s instead of 2 s | The form has no submit trigger yet (new form, or week not current). Run `syncTriggers` or wait for the 6 am job. |
| Themes don't appear | Fewer than 3 answers, or `ANTHROPIC_API_KEY` missing. Press T for the word cloud. |
| GitHub Pages is down | On a Mac: `python3 -m http.server 8770 --directory docs` in this repo, then use `http://localhost:8770/` instead of the GitHub address in the link. |
| A student can't open the form | They must sign in with their UCSD Google account (not a personal Gmail). |

## Repository layout

```
docs/                 board (GitHub Pages): index.html, config.js, img/
apps-script/          Apps Script project: Setup.gs (forms), Board.gs (endpoint, themes, credit), Push.gs (Firebase), appsscript.json
firebase/             database rules
prototype/            first local version (Python), kept as a fallback
assets/               form header image
HANDOFF.md            original requirements
CLAUDE.md             decisions and current state
```
