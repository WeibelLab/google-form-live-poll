/**
 * Google Form Live Poll: courses and forms.
 *
 * A course is one Google Drive folder (shared with the teaching team) with one
 * subfolder per week named "Week NN (YYYY-MM-DD)". Each Google Form in a week
 * folder is one poll question. Courses are listed in the script property
 * COURSES (managed by the admin page); CSE 291A Fall 2026 is the first entry.
 *
 * Every form is a copy of the course's styled master form (Forms themes cannot
 * be set by script, but copies keep the theme), with verified email, one
 * response per person, sign-in required, responders limited to the course
 * domain, and a linked response Sheet.
 */

const MASTER_NAME = '_Style master (do not delete)';
const SEED_COURSE = {
  slug: 'cse291a', title: 'CSE 291A: Human-Centered AI', name: 'CSE 291A',
  folderId: '1hJejev5nmwiLTBaip6lp0uW7peNlXoIR', start: '2026-09-29', weeks: 10, domain: 'ucsd.edu',
};
// Master form used as the style source for new courses (CSE 291A's).
const DEFAULT_MASTER_ID = '1d9aln0ApnGtvZZf8WYFwMrl7y2nYinL2sopTGWPGXGE';

// ---------- Course list ----------

function getCourses_() {
  const raw = PropertiesService.getScriptProperties().getProperty('COURSES');
  let list = null;
  try { list = raw ? JSON.parse(raw) : null; } catch (e) { list = null; }
  // Older format {slug: folderId} or nothing: start from the seed course.
  if (!Array.isArray(list)) list = [SEED_COURSE];
  return list;
}

function saveCourses_(list) {
  PropertiesService.getScriptProperties().setProperty('COURSES', JSON.stringify(list));
}

function course_(slug) {
  const c = getCourses_().filter(function (x) { return x.slug === slug; })[0];
  if (!c) throw new Error('unknown course ' + slug);
  return c;
}

function courseByFolder_(folderId) {
  return getCourses_().filter(function (x) { return x.folderId === folderId; })[0] || null;
}

function weekDate_(c, week) {
  const d = new Date(c.start + 'T12:00:00');
  d.setDate(d.getDate() + 7 * (week - 1));
  return Utilities.formatDate(d, 'America/Los_Angeles', 'yyyy-MM-dd');
}

function weekFolder_(c, week, create) {
  const prefix = 'Week ' + ('0' + week).slice(-2);
  const root = DriveApp.getFolderById(c.folderId);
  const it = root.getFolders();
  while (it.hasNext()) { const f = it.next(); if (f.getName().indexOf(prefix) === 0) return f; }
  if (!create) throw new Error('no folder for week ' + week);
  return root.createFolder(prefix + ' (' + weekDate_(c, week) + ')');
}

// ---------- Style master ----------

function getMaster_(c) {
  const it = DriveApp.getFolderById(c.folderId).getFilesByName(MASTER_NAME);
  if (!it.hasNext()) throw new Error('No style master in the course folder.');
  return it.next();
}

// New course: copy the default master (keeps its theme) into the course folder.
function ensureMaster_(c) {
  const root = DriveApp.getFolderById(c.folderId);
  const it = root.getFilesByName(MASTER_NAME);
  if (it.hasNext()) return it.next();
  return DriveApp.getFileById(DEFAULT_MASTER_ID).makeCopy(MASTER_NAME, root);
}

// ---------- Forms ----------

function formFile_(c, week, n) {
  const prefix = 'W' + ('0' + week).slice(-2) + ' Q' + n + ' - ';
  const files = weekFolder_(c, week).getFilesByType(MimeType.GOOGLE_FORMS);
  while (files.hasNext()) { const f = files.next(); if (f.getName().indexOf(prefix) === 0) return f; }
  return null;
}

// Create the form for question n of a week if missing (copy of the master, settings, response Sheet).
function ensureForm_(c, week, n, spec) {
  const folder = weekFolder_(c, week, true);
  const existing = formFile_(c, week, n);
  let form;
  if (existing) {
    form = FormApp.openById(existing.getId());
  } else {
    const fileName = 'W' + ('0' + week).slice(-2) + ' Q' + n + ' - ' + spec.q;
    form = FormApp.openById(getMaster_(c).makeCopy(fileName, folder).getId());
    form.getItems().forEach(function (it) { form.deleteItem(it); });
    addItem_(form, spec);
    form.setTitle(spec.q);
    form.setDescription((c.name || c.title) + ' Week ' + week + ' discussion poll. ' +
      'Your answer is recorded with your university email for participation credit. ' +
      'Only aggregated answers are shown in class.');
    const ss = SpreadsheetApp.create(fileName + ' (responses)');
    DriveApp.getFileById(ss.getId()).moveTo(folder);
    form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  }
  applySettings_(form, c.domain);
  return form;
}

function applySettings_(form, domain) {
  // Copies start unpublished; response settings need a published form.
  if (form.setPublished && !form.isPublished()) form.setPublished(true);
  form.setEmailCollectionType(FormApp.EmailCollectionType.VERIFIED);
  form.setRequireLogin(true);
  form.setLimitOneResponsePerUser(true);
  form.setAllowResponseEdits(false);
  form.setShowLinkToRespondAgain(false);
  form.setAcceptingResponses(true);
  restrictResponders_(form.getId(), domain || 'ucsd.edu');
}

// Responders: course domain only. Removes any "anyone" access, adds domain published-reader.
function restrictResponders_(fileId, domain) {
  const base = 'https://www.googleapis.com/drive/v3/files/' + fileId + '/permissions';
  const headers = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
  const list = JSON.parse(UrlFetchApp.fetch(base + '?fields=permissions(id,type,domain,view)&supportsAllDrives=true', { headers: headers }).getContentText());
  let hasDomain = false;
  (list.permissions || []).forEach(function (p) {
    if (p.type === 'anyone') UrlFetchApp.fetch(base + '/' + p.id + '?supportsAllDrives=true', { method: 'delete', headers: headers });
    if (p.type === 'domain' && p.domain === domain && p.view === 'published') hasDomain = true;
  });
  if (!hasDomain) {
    UrlFetchApp.fetch(base + '?supportsAllDrives=true', {
      method: 'post', headers: headers, contentType: 'application/json',
      payload: JSON.stringify({ type: 'domain', domain: domain, role: 'reader', view: 'published' }),
    });
  }
}

// Set the question of form n in a week (creates the form if missing). Refuses forms with responses.
function setQuestion_(c, week, n, spec) {
  const form = ensureForm_(c, week, n, spec);
  if (form.getResponses().length) throw new Error('W' + week + ' Q' + n + ' already has responses. Delete them first or add a new question.');
  form.getItems().forEach(function (it) { form.deleteItem(it); });
  addItem_(form, spec);
  form.setTitle(spec.q);
  const prefix = 'W' + ('0' + week).slice(-2) + ' Q' + n + ' - ';
  DriveApp.getFileById(form.getId()).setName(prefix + spec.q);
  const sid = form.getDestinationId();
  if (sid) DriveApp.getFileById(sid).setName(prefix + spec.q + ' (responses)');
  CacheService.getScriptCache().remove('forms:' + c.folderId + ':' + week);
  return form;
}

// Template for a new course: per week, Q1 multiple choice, Q2 short answer, then paragraphs.
function templateSpec_(n) {
  if (n === 1) return { q: 'Question 1 (edit me)', choices: ['Choice A', 'Choice B', 'Choice C'], other: true };
  if (n === 2) return { q: 'Question 2 (edit me)', short: true };
  return { q: 'Question ' + n + ' (edit me)' };
}

/**
 * Weekly questions (from the discussion slides, reframed for live polls on
 * 2026-10-05). Types: choices (multiple choice), short (word cloud),
 * long (paragraph, Claude themes), scale [lo, hi, leftLabel, rightLabel], grid {rows, cols}.
 */
const AGREE = [1, 5, 'Strongly disagree', 'Strongly agree'];
// Choices informed by last year's "Discussion Highlights" slides (CSE 291A FA25, DSC 266R WI25/WI26).
const WEEK_QUESTIONS = {
  2: [
    { q: "Now that we've seen some potential harms, what are the benefits of open sourcing a model?" },
    { q: 'Do you believe the pros outweigh the cons?', choices: ['Yes', 'No', 'It depends'], other: true },
    { q: 'When should a model be open sourced?', other: true,
      choices: ['Always, openness outweighs the risks', 'After an independent safety review', 'In stages, smaller or safer versions first',
                'Case by case, depending on benefits and safeguards', 'Only to vetted researchers', 'Never for highly capable models'] },
  ],
  3: [
    { q: 'How can users be part of the bias mitigation process? (pick up to 2)', multi: true, max: 2, other: true,
      choices: ['Feedback and reporting tools', 'Participatory co-design', 'Diverse user testing', 'User education and AI literacy', 'Community advisory panels'] },
    { q: 'How helpful would each governance structure be for bias mitigation?',
      grid: { rows: ['Multi-stakeholder board (ethicists, developers, users, legal)', 'Independent external audits', 'Government regulation',
                     'Community representatives', 'Risk frameworks (e.g. NIST AI RMF)'],
              cols: ['Not helpful', 'Somewhat helpful', 'Very helpful'] } },
    { q: 'Should creatives adapt and reskill to work alongside AI systems?', other: true,
      choices: ["Yes, it's necessary", 'Yes, with consent and pay protections', 'Only if they choose to', 'No, limit AI use instead'] },
  ],
  4: [
    { q: "In one word: a problem you've experienced that AI could help with", short: true },
    { q: 'Which problem-framing pitfall do you fall into most?', other: true,
      choices: ['Solutioneering', 'Anchoring', 'Wishlisting', 'Presuming', 'Catastrophizing', 'Buzzwording', 'Hamstringing'] },
    { q: 'What question should you ask before deciding a problem needs AI?' },
  ],
  5: [
    { q: 'Up to which automation level would you ride in a self-driving car today?',
      choices: ['Level 2 (partial)', 'Level 3 (conditional)', 'Level 4 (high)', 'Level 5 (full)', 'None'] },
    { q: 'What is your biggest concern as driving automation increases?', other: true,
      choices: ['Edge cases and unpredictability', 'Accountability for accidents', 'Transparency of decisions', 'Security and hacking', 'Job loss', 'Losing driving skills'] },
    { q: 'Which always-on consideration changes most as cars become more autonomous, and why?' },
  ],
  6: [
    { q: 'Observing users for needfinding on dating apps is...', other: true,
      choices: ['Fine with consent', 'Fine only with anonymized data', 'Too invasive in most cases', 'Never acceptable'] },
    { q: 'In one word: a daily interaction that matters to you', short: true },
    { q: 'How would you resolve a gap between what you find meaningful and what a user finds meaningful?' },
  ],
  7: [
    { q: 'Many false positives are an acceptable price for avoiding a single false negative in TSA screening.', scale: AGREE },
    { q: 'Who should set the acceptable false positive rate?', other: true,
      choices: ['TSA / government', 'Engineers who build the system', 'Travelers and the public', 'An independent oversight body'] },
    { q: 'What would make false positives less harmful to travelers?' },
  ],
  8: [
    { q: 'For the North-America-only plant dataset, what is cheaper?', other: true,
      choices: ['Diverse data from the start', 'Fixing it after launch', 'About the same', 'Depends on the harm caused'] },
    { q: 'The benefits of tracking employee demographic data outweigh the risks.', scale: AGREE },
    { q: 'What risk of collecting demographic data worries you most?' },
  ],
  9: [
    { q: 'In one word: an attribute missing from the protected list', short: true },
    { q: 'To correct a biased model, what would you change first?', other: true,
      choices: ['Collect more representative data', 'Reweight or resample the data', 'Use a different fairness metric', 'Adjust decision thresholds', 'Remove sensitive features'] },
    { q: 'What surprised you when exploring word embeddings in WebVectors?' },
    { q: 'Should political affiliation be a protected attribute?',
      choices: ['Yes', 'No', 'Only for employment and housing', 'Not sure'] },
  ],
  10: [
    { q: "Was Facebook's emotional contagion experiment ethical?", choices: ['Yes', 'No', 'Legal but not ethical', 'Not sure'] },
    { q: 'Should users be told about studies beforehand, even if the results are less accurate?', other: true,
      choices: ['Always, with informed consent', 'Yes, but not the exact timing', 'Only afterwards (debrief)', 'Only for higher-risk studies', 'No'] },
    { q: 'What is missing from the 2023 AI executive order?' },
  ],
};

function addItem_(form, spec) {
  if (spec.choices && spec.multi) {
    const cb = form.addCheckboxItem().setTitle(spec.q).setChoiceValues(spec.choices).showOtherOption(!!spec.other).setRequired(true);
    if (spec.max) cb.setValidation(FormApp.createCheckboxValidation().requireSelectAtMost(spec.max).build());
  }
  else if (spec.choices) form.addMultipleChoiceItem().setTitle(spec.q).setChoiceValues(spec.choices).showOtherOption(!!spec.other).setRequired(true);
  else if (spec.scale) form.addScaleItem().setTitle(spec.q).setBounds(spec.scale[0], spec.scale[1]).setLabels(spec.scale[2], spec.scale[3]).setRequired(true);
  else if (spec.grid) form.addGridItem().setTitle(spec.q).setRows(spec.grid.rows).setColumns(spec.grid.cols).setRequired(true);
  else if (spec.short) form.addTextItem().setTitle(spec.q).setRequired(true);
  else form.addParagraphTextItem().setTitle(spec.q).setRequired(true);
}

// CSE 291A: apply WEEK_QUESTIONS (from the slides). Skips forms that already have responses.
function applyWeekQuestions() {
  const c = course_('cse291a');
  const log = [];
  Object.keys(WEEK_QUESTIONS).forEach(function (w) {
    WEEK_QUESTIONS[w].forEach(function (spec, i) {
      try { setQuestion_(c, Number(w), i + 1, spec); log.push('W' + w + ' Q' + (i + 1) + ' ok'); }
      catch (e) { log.push('W' + w + ' Q' + (i + 1) + ': ' + e.message); }
    });
  });
  Logger.log(log.join('\n'));
}
