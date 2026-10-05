/**
 * Google Form Live Poll: course setup.
 * Creates one Google Form per question inside a week folder, with:
 * verified UCSD email, one response per person, sign-in required,
 * responders restricted to ucsd.edu, and a linked response Sheet.
 * Every form is a copy of a styled master form (Forms themes cannot be set by
 * script, but copies keep the theme). Run createStyleMaster once, style it, then
 * run setupAllWeeks.
 * Idempotent: a form whose file name already exists in the folder is skipped.
 * Writes manifest.json (IDs and responder URLs, no responses) to the course folder.
 */

const COURSE = {
  name: 'CSE 291A',
  folderId: '1hJejev5nmwiLTBaip6lp0uW7peNlXoIR', // Discussion Polls
  domain: 'ucsd.edu',
  weeks: {
    1: '1vONiapz314qphNss006gpKruJP6GSYR9',
    2: '10tt7a9aCyDlAlw3f1j2sEHUg880VylaQ',
    3: '1_Y6S-6pvk1gnZ1Ew21xgg-R92t1lDW8C',
    4: '1njOQJszHv8lWM5Bo3Nc51gu0Adkzv1x-',
    5: '1Vb3h-WeBVcd_aG4Ppu6VIjALg0CPj_Rd',
    6: '1GI0XGLPk-SB6FLSOCX4O2Q4GesLwzBSO',
    7: '166oulGwC8fNpY2mhnZD6YlNlX526cTr5',
    8: '1gQoYxO_UklLUaO1pYRXOSmswdsfHeQ7I',
    9: '1HRxKNbnSO0jxWXZ92w0UcwjDQom4Voz1',
    10: '1iaB9jt-JsjU0T5yTJH07zNrGpile5Ds6',
  },
};

const QUESTIONS = {
  1: [
    { q: "What's your program?", choices: ['Grad: CSE MS', 'Grad: CSE PhD', 'Grad: DSC', 'Grad: other program', 'Undergrad'] },
    { q: "One word for why you're taking this class", short: true },
    { q: 'An AI tool you use every day', short: true },
  ],
  2: [
    { q: "Now that we've seen some potential harms, what are the benefits of open sourcing a model?" },
    { q: 'Do you believe the pros outweigh the cons?', choices: ['Yes', 'No', 'It depends'] },
    { q: 'When should a model be open sourced?', choices: ['Always', 'After independent safety testing', 'Only for low-risk uses', 'Only to vetted researchers', 'Never'] },
  ],
};

// Weeks without listed questions get this template.
const TEMPLATE = [
  { q: 'Question 1 (edit me)', choices: ['Choice A', 'Choice B', 'Choice C'] },
  { q: 'Question 2 (edit me)', short: true },
  { q: 'Question 3 (edit me)', short: true },
];

const MASTER_NAME = '_Style master (do not delete)';

function createStyleMaster() {
  const root = DriveApp.getFolderById(COURSE.folderId);
  const it = root.getFilesByName(MASTER_NAME);
  let form;
  if (it.hasNext()) {
    form = FormApp.openById(it.next().getId());
  } else {
    form = FormApp.create(MASTER_NAME);
    form.setTitle('Sample question');
    form.addMultipleChoiceItem().setTitle('Sample question').setChoiceValues(['Choice A', 'Choice B']);
    form.setAcceptingResponses(false);
    DriveApp.getFileById(form.getId()).moveTo(root);
  }
  Logger.log('Style this form, then run setupAllWeeks: ' + form.getEditUrl());
  return form.getEditUrl();
}

function getMaster_() {
  const it = DriveApp.getFolderById(COURSE.folderId).getFilesByName(MASTER_NAME);
  if (!it.hasNext()) throw new Error('Run createStyleMaster first.');
  return it.next();
}

function setupAllWeeks() {
  getMaster_();
  const manifest = { course: COURSE.name, folderId: COURSE.folderId, weeks: {} };
  Object.keys(COURSE.weeks).forEach(function (w) {
    const qs = QUESTIONS[w] || TEMPLATE;
    manifest.weeks[w] = qs.map(function (spec, i) {
      return ensureForm_(Number(w), i + 1, spec);
    });
  });
  writeManifest_(manifest);
  Logger.log(JSON.stringify(manifest, null, 1));
}

function ensureForm_(week, n, spec) {
  const folder = DriveApp.getFolderById(COURSE.weeks[week]);
  const ww = ('0' + week).slice(-2);
  const fileName = 'W' + ww + ' Q' + n + ' - ' + spec.q;
  const existing = folder.getFilesByName(fileName);
  let form;
  if (existing.hasNext()) {
    form = FormApp.openById(existing.next().getId());
  } else {
    form = FormApp.openById(getMaster_().makeCopy(fileName, folder).getId());
    form.getItems().forEach(function (it) { form.deleteItem(it); });
    form.setTitle(spec.q);
    form.setDescription(COURSE.name + ' Week ' + week + ' discussion poll. ' +
      'Your answer is recorded with your UCSD email for participation credit. ' +
      'Only aggregated answers are shown in class.');
    if (spec.choices) {
      form.addMultipleChoiceItem().setTitle(spec.q).setChoiceValues(spec.choices).setRequired(true);
    } else if (spec.short) {
      form.addTextItem().setTitle(spec.q).setRequired(true);
    } else {
      form.addParagraphTextItem().setTitle(spec.q).setRequired(true);
    }
    const ss = SpreadsheetApp.create(fileName + ' (responses)');
    DriveApp.getFileById(ss.getId()).moveTo(folder);
    form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  }
  applySettings_(form);
  return {
    n: n,
    question: spec.q,
    type: spec.choices ? 'choice' : 'text',
    formId: form.getId(),
    url: form.getPublishedUrl(),
    sheetId: form.getDestinationId(),
  };
}

function applySettings_(form) {
  // Copies start unpublished; response settings need a published form.
  if (form.setPublished && !form.isPublished()) form.setPublished(true);
  form.setEmailCollectionType(FormApp.EmailCollectionType.VERIFIED);
  form.setRequireLogin(true);
  form.setLimitOneResponsePerUser(true);
  form.setAllowResponseEdits(false);
  form.setShowLinkToRespondAgain(false);
  form.setAcceptingResponses(true);
  restrictResponders_(form.getId());
}

// Responders: ucsd.edu only. Removes any "anyone" access, adds domain published-reader.
function restrictResponders_(fileId) {
  const base = 'https://www.googleapis.com/drive/v3/files/' + fileId + '/permissions';
  const headers = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
  const list = JSON.parse(UrlFetchApp.fetch(base + '?fields=permissions(id,type,domain,view)', { headers: headers }).getContentText());
  let hasDomain = false;
  (list.permissions || []).forEach(function (p) {
    if (p.type === 'anyone') {
      UrlFetchApp.fetch(base + '/' + p.id, { method: 'delete', headers: headers });
    }
    if (p.type === 'domain' && p.domain === COURSE.domain && p.view === 'published') hasDomain = true;
  });
  if (!hasDomain) {
    UrlFetchApp.fetch(base, {
      method: 'post', headers: headers, contentType: 'application/json',
      payload: JSON.stringify({ type: 'domain', domain: COURSE.domain, role: 'reader', view: 'published' }),
    });
  }
}

function writeManifest_(manifest) {
  const folder = DriveApp.getFolderById(COURSE.folderId);
  const it = folder.getFilesByName('manifest.json');
  const body = JSON.stringify(manifest, null, 1);
  if (it.hasNext()) it.next().setContent(body);
  else folder.createFile('manifest.json', body, 'application/json');
}

/**
 * Weekly questions (from the discussion slides, reframed for live polls on
 * 2026-10-05). Types: choices (multiple choice), short (word cloud),
 * long (paragraph, Claude themes), scale [lo, hi, leftLabel, rightLabel], grid {rows, cols}.
 */
const AGREE = [1, 5, 'Strongly disagree', 'Strongly agree'];
const WEEK_QUESTIONS = {
  3: [
    { q: 'How can users be integrated into the bias mitigation process?' },
    { q: 'How helpful would each governance structure be for bias mitigation?',
      grid: { rows: ['Internal ethics board', 'Independent external audit', 'Government regulation', 'User or community advisory panel', 'Open public scrutiny'],
              cols: ['Not helpful', 'Somewhat helpful', 'Very helpful'] } },
    { q: 'Should creatives adapt and reskill to work alongside AI systems?',
      choices: ["Yes, it's necessary", 'Yes, with consent and pay protections', 'Only if they choose to', 'No, limit AI use instead'] },
  ],
  4: [
    { q: "In one word: a problem you've experienced that AI could help with", short: true },
    { q: 'Which pitfall is most likely to sink an AI solution?',
      choices: ['Biased or missing data', 'Solves the wrong problem', "Users don't trust it", 'Privacy risk', 'Too costly to maintain'] },
    { q: 'What question should you ask before deciding a problem needs AI?' },
  ],
  5: [
    { q: 'At which automation level does responsibility shift most from the driver to the system?',
      choices: ['Level 1-2 (driver assistance)', 'Level 3 (conditional)', 'Level 4 (high)', 'Level 5 (full)'] },
    { q: 'Which concern grows most as driving automation increases?',
      choices: ['Safety', 'Accountability', 'Privacy', 'Fairness', 'Transparency'] },
    { q: 'Which always-on consideration changes most as cars become more autonomous, and why?' },
  ],
  6: [
    { q: 'Observing users for needfinding on dating apps is...',
      choices: ['Fine with consent', 'Fine only with anonymized data', 'Too invasive in most cases', 'Never acceptable'] },
    { q: 'In one word: a daily interaction that matters to you', short: true },
    { q: 'How would you resolve a gap between what you find meaningful and what a user finds meaningful?' },
  ],
  7: [
    { q: 'Many false positives are an acceptable price for avoiding a single false negative in TSA screening.', scale: AGREE },
    { q: 'Who should set the acceptable false positive rate?',
      choices: ['TSA / government', 'Engineers who build the system', 'Travelers and the public', 'An independent oversight body'] },
    { q: 'What would make false positives less harmful to travelers?' },
  ],
  8: [
    { q: 'For the North-America-only plant dataset, what is cheaper?',
      choices: ['Diverse data from the start', 'Fixing it after launch', 'About the same', 'Depends on the harm caused'] },
    { q: 'The benefits of tracking employee demographic data outweigh the risks.', scale: AGREE },
    { q: 'What risk of collecting demographic data worries you most?' },
  ],
  9: [
    { q: 'In one word: an attribute missing from the protected list', short: true },
    { q: 'To correct a biased model, what would you change first?',
      choices: ['Collect more representative data', 'Reweight or resample the data', 'Use a different fairness metric', 'Adjust decision thresholds', 'Remove sensitive features'] },
    { q: 'What surprised you when exploring word embeddings in WebVectors?' },
  ],
  10: [
    { q: "Was Facebook's emotional contagion experiment ethical?", choices: ['Yes', 'No', 'Legal but not ethical', 'Not sure'] },
    { q: 'Should users be told about studies beforehand, even if the results are less accurate?',
      choices: ['Always', 'Only after the study', 'Only for higher-risk studies', 'No'] },
    { q: 'What is missing from the 2023 AI executive order?' },
  ],
};

function addItem_(form, spec) {
  if (spec.choices) form.addMultipleChoiceItem().setTitle(spec.q).setChoiceValues(spec.choices).setRequired(true);
  else if (spec.scale) form.addScaleItem().setTitle(spec.q).setBounds(spec.scale[0], spec.scale[1]).setLabels(spec.scale[2], spec.scale[3]).setRequired(true);
  else if (spec.grid) form.addGridItem().setTitle(spec.q).setRows(spec.grid.rows).setColumns(spec.grid.cols).setRequired(true);
  else if (spec.short) form.addTextItem().setTitle(spec.q).setRequired(true);
  else form.addParagraphTextItem().setTitle(spec.q).setRequired(true);
}

// Rewrite the question of each form WNN Qn in weeks 3-10. Skips forms that already have responses.
function applyWeekQuestions() {
  const log = [];
  Object.keys(WEEK_QUESTIONS).forEach(function (w) {
    const folder = DriveApp.getFolderById(COURSE.weeks[w]);
    const ww = ('0' + w).slice(-2);
    WEEK_QUESTIONS[w].forEach(function (spec, i) {
      const prefix = 'W' + ww + ' Q' + (i + 1) + ' - ';
      const files = folder.getFilesByType(MimeType.GOOGLE_FORMS);
      let file = null;
      while (files.hasNext()) { const f = files.next(); if (f.getName().indexOf(prefix) === 0) { file = f; break; } }
      if (!file) { log.push(prefix + 'missing'); return; }
      const form = FormApp.openById(file.getId());
      if (form.getResponses().length) { log.push(prefix + 'has responses, skipped'); return; }
      form.getItems().forEach(function (it) { form.deleteItem(it); });
      addItem_(form, spec);
      form.setTitle(spec.q);
      file.setName(prefix + spec.q);
      const sid = form.getDestinationId();
      if (sid) DriveApp.getFileById(sid).setName(prefix + spec.q + ' (responses)');
      log.push(prefix + 'ok');
    });
  });
  CacheService.getScriptCache().removeAll(Object.keys(COURSE.weeks).map(function (w) { return 'forms:' + COURSE.folderId + ':' + w; }));
  Logger.log(log.join('\n'));
}
