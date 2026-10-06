/**
 * Admin page: /exec?admin from the admin deployment (execute as owner,
 * access: anyone in the university domain). Only the script owner and the
 * emails in script property ADMINS can use it. Every function below checks
 * this again, so the public board deployment cannot reach them.
 */

const BOARD_BASE = 'https://weibellab.github.io/google-form-live-poll/';

function isAdmin_() {
  const me = (Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!me) return '';
  const owner = (Session.getEffectiveUser().getEmail() || '').toLowerCase();
  const admins = JSON.parse(PropertiesService.getScriptProperties().getProperty('ADMINS') || '[]');
  return (me === owner || admins.indexOf(me) >= 0) ? me : '';
}

function needAdmin_() {
  const me = isAdmin_();
  if (!me) throw new Error('Not authorized.');
  return me;
}

function adminPage_() {
  if (!isAdmin_()) {
    const who = Session.getActiveUser().getEmail() || 'not signed in';
    return HtmlService.createHtmlOutput('<p style="font-family:sans-serif">Live Poll admin: no access for ' + who +
      '. Ask the course owner to add you.</p>').setTitle('Live Poll Admin');
  }
  return HtmlService.createTemplateFromFile('admin').evaluate()
    .setTitle('Live Poll Admin').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function boardLink_(slug, week, n) {
  const key = PropertiesService.getScriptProperties().getProperty('BOARD_KEY');
  return BOARD_BASE + '?course=' + encodeURIComponent(slug) + '&week=' + week + (n ? '&q=' + n : '') + '#k=' + key;
}

// ---------- Page data ----------

function adminState() {
  const me = needAdmin_();
  const props = PropertiesService.getScriptProperties();
  const courses = getCourses_().map(function (c) {
    let cur = 1;
    try { cur = currentWeek_(c); } catch (e) { /* folder missing */ }
    return { slug: c.slug, title: c.title, name: c.name, start: c.start, weeks: c.weeks, domain: c.domain,
             folderUrl: 'https://drive.google.com/drive/folders/' + c.folderId, currentWeek: cur,
             boardLinks: Array.from({ length: c.weeks }, function (_, i) { return boardLink_(c.slug, i + 1); }) };
  });
  return { me: me, owner: Session.getEffectiveUser().getEmail(), courses: courses,
           admins: JSON.parse(props.getProperty('ADMINS') || '[]') };
}

// Questions of one week, with what the editor needs.
function adminWeek(slug, week) {
  needAdmin_();
  const c = course_(slug);
  CacheService.getScriptCache().remove('forms:' + c.folderId + ':' + week);
  let forms = [];
  try { forms = weekForms_(c.folderId, week); } catch (e) { return { questions: [], board: boardLink_(slug, week) }; }
  return {
    board: boardLink_(slug, week),
    questions: forms.map(function (f) {
      const file = DriveApp.getFileById(f.id);
      const m = file.getName().match(/^W\d+ Q(\d+)/);
      const form = FormApp.openById(f.id);
      return {
        n: m ? Number(m[1]) : null, formId: f.id, title: f.title, kind: f.kind, multi: !!f.multi, other: !!f.other,
        choices: f.choices, rows: f.rows || [], cols: f.cols || [], lo: f.lo, hi: f.hi, loLabel: f.loLabel || '', hiLabel: f.hiLabel || '',
        responses: form.getResponses().length, editUrl: form.getEditUrl(), url: f.url, board: boardLink_(slug, week, null),
      };
    }),
  };
}

// UI question -> spec for addItem_.
function specFromUi_(q) {
  const s = { q: String(q.title || '').trim() };
  if (!s.q) throw new Error('The question text is empty.');
  const lines = function (v) { return (v || []).map(function (x) { return String(x).trim(); }).filter(Boolean); };
  if (q.type === 'choice' || q.type === 'checkbox') {
    s.choices = lines(q.choices);
    if (s.choices.length < 2) throw new Error('Add at least two choices.');
    s.other = !!q.other;
    if (q.type === 'checkbox') { s.multi = true; if (Number(q.max) > 0) s.max = Number(q.max); }
  } else if (q.type === 'short') s.short = true;
  else if (q.type === 'scale') s.scale = [1, Number(q.hi) || 5, q.loLabel || 'Strongly disagree', q.hiLabel || 'Strongly agree'];
  else if (q.type === 'grid') {
    s.grid = { rows: lines(q.rows), cols: lines(q.cols) };
    if (!s.grid.rows.length || s.grid.cols.length < 2) throw new Error('A grid needs rows and at least two columns.');
  }
  return s;
}

function adminSaveQuestion(slug, week, n, q) {
  needAdmin_();
  setQuestion_(course_(slug), Number(week), Number(n), specFromUi_(q));
  return adminWeek(slug, week);
}

function adminAddQuestion(slug, week, q) {
  needAdmin_();
  const c = course_(slug);
  const cur = adminWeek(slug, week).questions;
  const n = cur.reduce(function (m, x) { return Math.max(m, x.n || 0); }, 0) + 1;
  setQuestion_(c, Number(week), n, specFromUi_(q));
  try { syncTriggers(); } catch (e) { /* live updates fall back to 3 s polling until 6 am */ }
  return adminWeek(slug, week);
}

// Move a question's form and its response Sheet to the Drive trash (restorable for 30 days).
function adminRemoveQuestion(slug, week, formId) {
  needAdmin_();
  const c = course_(slug);
  const file = DriveApp.getFileById(formId);
  const place = placeOfForm_(formId);
  if (!place || place.c.slug !== slug || place.week !== Number(week)) throw new Error('This form is not in ' + slug + ' week ' + week + '.');
  const sid = FormApp.openById(formId).getDestinationId();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onPollSubmit' && t.getTriggerSourceId() === formId) ScriptApp.deleteTrigger(t);
  });
  file.setTrashed(true);
  if (sid) { try { DriveApp.getFileById(sid).setTrashed(true); } catch (e) { /* Sheet already gone */ } }
  CacheService.getScriptCache().removeAll(['forms:' + c.folderId + ':' + week, 'data:' + c.folderId + ':' + week]);
  return adminWeek(slug, week);
}

// ---------- Answers ----------

function adminResponses(slug, week) {
  needAdmin_();
  return creditWeek_(course_(slug), Number(week)).all.map(function (r) {
    return { week: r.week, n: r.n, title: r.title, email: r.email, time: r.time.toISOString(),
             answer: r.answer, formId: r.formId, responseId: r.responseId };
  });
}

function adminDelete(slug, items) {
  needAdmin_();
  course_(slug);
  return deleteResponses_(items.map(function (r) { return { formId: r.formId, responseId: r.responseId, email: r.email, time: new Date(r.time) }; }));
}

function adminRefreshCredit(slug) {
  needAdmin_();
  return exportCredit_(course_(slug));
}

// ---------- New course ----------

function adminCreateCourse(d) {
  needAdmin_();
  const slug = String(d.slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!slug) throw new Error('Short name: letters, digits and dashes only.');
  const list = getCourses_();
  if (list.some(function (c) { return c.slug === slug; })) throw new Error('Short name "' + slug + '" is already used.');
  const m = String(d.folder || '').match(/folders\/([\w-]+)/) || String(d.folder || '').match(/^([\w-]{20,})$/);
  if (!m) throw new Error('Paste the link of the course folder in Google Drive.');
  const folder = DriveApp.getFolderById(m[1]);   // fails if the owner has no access
  if (list.some(function (c) { return c.folderId === m[1]; })) throw new Error('This folder is already used by another course.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.start || '')) throw new Error('First class date: YYYY-MM-DD.');
  const c = { slug: slug, title: String(d.title || slug).trim(), name: String(d.name || d.title || slug).trim(),
              folderId: folder.getId(), start: d.start, weeks: Math.max(1, Math.min(20, Number(d.weeks) || 10)),
              domain: String(d.domain || 'ucsd.edu').trim() };
  list.push(c);
  saveCourses_(list);
  const master = ensureMaster_(c);
  for (let w = 1; w <= c.weeks; w++) weekFolder_(c, w, true);
  return { slug: slug, masterUrl: 'https://docs.google.com/forms/d/' + master.getId() + '/edit', weeks: c.weeks };
}

// Called once per week by the page, so each call stays short.
function adminCreateWeekForms(slug, week, perWeek) {
  needAdmin_();
  const c = course_(slug);
  for (let n = 1; n <= Math.max(1, Math.min(6, Number(perWeek) || 3)); n++) ensureForm_(c, Number(week), n, templateSpec_(n));
  return week;
}

function adminSyncTriggers() {
  needAdmin_();
  syncTriggers();
  return true;
}

// ---------- Admins ----------

function adminSetAdmins(emails) {
  needAdmin_();
  const clean = (emails || []).map(function (e) { return String(e).trim().toLowerCase(); })
    .filter(function (e) { return /^[^@\s]+@[^@\s]+$/.test(e); });
  PropertiesService.getScriptProperties().setProperty('ADMINS', JSON.stringify(clean));
  return clean;
}
