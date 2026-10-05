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
