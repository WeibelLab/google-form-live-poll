# Google Form Live Poll

Live poll board for class discussions, built on Google Forms. One Google Form per question. Students scan a QR code, sign in with their UCSD account and answer. The projector shows live results: bars for multiple choice, a word cloud for text. Student emails stay in the response Sheets in Drive and are used only for participation credit.

## For the TA: change or add a question (no code)

All forms are in Drive: `CSE291A - Fall 2026 / Discussion Polls / Week NN (date)`. Each week has three forms (`WNN Q1`, `Q2`, `Q3`), each with its response Sheet.

**Edit a template question**
1. Open the form (for example `W03 Q1 - Question 1 (edit me)`).
2. Change the question text and the form title at the top to the same text. Keep the type: Multiple choice gives bars, Short answer gives a word cloud of whole answers, Paragraph gives a word cloud of single words.
3. Rename the file in Drive so the name starts with `W03 Q1 - ` followed by the question. The board orders slides by file name.

**Add a fourth question**
1. In Drive, right-click any form of that week, then **Make a copy**. Keep it in the same week folder.
2. Rename it `WNN Q4 - <question>` and edit the question.
3. In the copy, open **Responses**, then **Link to Sheets**, and create a new spreadsheet.
4. Check **Settings**: Collect email addresses set to Verified, Limit to 1 response on. Check **Publish**: responders limited to UC San Diego.

The board picks up every form in the week folder.

## Running the board

Hosted version (GitHub Pages) is in progress. Until then the local board runs on Nadir's Mac:

```bash
~/Projects/canvas-rollover/.venv/bin/python prototype/live_poll.py --config prototype/cse291a_week02.json
```

Then open http://127.0.0.1:8765 on the projector. Keys: ← → or 1-9 change question, Q shows or hides the QR code.

## Credit export

```bash
~/Projects/canvas-rollover/.venv/bin/python prototype/live_poll.py SHEET_ID --credit week02_q1.csv
```

Writes email and timestamp for each response. Keep the CSV private; `*.csv` is git-ignored.
