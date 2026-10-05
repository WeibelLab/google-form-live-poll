/**
 * Board backend: web app that returns ONLY aggregates (counts, words, themes)
 * for the forms in one week folder. Never returns emails.
 *
 * GET ?key=BOARD_KEY&course=cse291a&week=2            -> slides + aggregates
 * GET ?key=BOARD_KEY&course=cse291a&action=themes&form=FORM_ID -> Claude themes
 *
 * Script properties (Project Settings > Script properties):
 *   BOARD_KEY          long random string, part of the board link
 *   ANTHROPIC_API_KEY  for themes (optional)
 *   COURSES            JSON {"cse291a": "<Discussion Polls folder id>"} (defaults to COURSE below)
 */

const CLAUDE_MODEL = 'claude-opus-5-5';

function doGet(e) {
  const p = (e && e.parameter) || {};
  const props = PropertiesService.getScriptProperties();
  if (!p.key || p.key !== props.getProperty('BOARD_KEY')) return json_({ error: 'bad key' });
  try {
    const root = courseRoot_(p.course || 'cse291a');
    if (p.action === 'themes') return json_(themes_(root, p.form));
    return json_(weekData_(root, Number(p.week)));
  } catch (err) {
    return json_({ error: String(err.message || err) });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function courseRoot_(course) {
  const raw = PropertiesService.getScriptProperties().getProperty('COURSES');
  const map = raw ? JSON.parse(raw) : { cse291a: COURSE.folderId };
  if (!map[course]) throw new Error('unknown course');
  return map[course];
}

// Forms in the week folder, sorted by file name. Cached 30 s (new forms show up within 30 s).
function weekForms_(root, week) {
  const cache = CacheService.getScriptCache();
  const ck = 'forms:' + root + ':' + week;
  const hit = cache.get(ck);
  if (hit) return JSON.parse(hit);
  const prefix = 'Week ' + ('0' + week).slice(-2);
  const folders = DriveApp.getFolderById(root).getFolders();
  let folder = null;
  while (folders.hasNext()) {
    const f = folders.next();
    if (f.getName().indexOf(prefix) === 0) { folder = f; break; }
  }
  if (!folder) throw new Error('no folder for week ' + week);
  const out = [];
  const files = folder.getFilesByType(MimeType.GOOGLE_FORMS);
  while (files.hasNext()) {
    const f = files.next();
    out.push({ id: f.getId(), name: f.getName() });
  }
  out.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
  const forms = out.map(function (f) { return describeForm_(f.id); }).filter(Boolean);
  cache.put(ck, JSON.stringify(forms), 30);
  return forms;
}

// Supported question types and how the board shows them.
const T_ = FormApp.ItemType;
const KINDS_ = [T_.MULTIPLE_CHOICE, T_.CHECKBOX, T_.LIST, T_.TEXT, T_.PARAGRAPH_TEXT, T_.SCALE, T_.RATING, T_.GRID];

function describeForm_(id) {
  const form = FormApp.openById(id);
  const item = form.getItems().filter(function (it) { return KINDS_.indexOf(it.getType()) >= 0; })[0];
  if (!item) return null;
  const t = item.getType();
  const d = { id: id, itemId: item.getId(), title: item.getTitle(), kind: 'cloud', choices: [], url: form.getPublishedUrl() };
  const vals = function (cs) { return cs.map(function (c) { return c.getValue(); }); };
  if (t === T_.PARAGRAPH_TEXT) d.kind = 'long';
  else if (t === T_.MULTIPLE_CHOICE) { d.kind = 'bars'; d.choices = vals(item.asMultipleChoiceItem().getChoices()); }
  else if (t === T_.LIST) { d.kind = 'bars'; d.choices = vals(item.asListItem().getChoices()); }
  else if (t === T_.CHECKBOX) { d.kind = 'bars'; d.multi = true; d.choices = vals(item.asCheckboxItem().getChoices()); }
  else if (t === T_.SCALE) {
    const sc = item.asScaleItem();
    d.kind = 'scale'; d.lo = sc.getLowerBound(); d.hi = sc.getUpperBound();
    d.loLabel = sc.getLeftLabel() || ''; d.hiLabel = sc.getRightLabel() || '';
  } else if (t === T_.RATING) {
    const r = item.asRatingItem();
    d.kind = 'scale'; d.lo = 1; d.hi = r.getRatingScaleLevel(); d.loLabel = ''; d.hiLabel = ''; d.rating = true;
  } else if (t === T_.GRID) {
    const g = item.asGridItem();
    d.kind = 'grid'; d.rows = g.getRows(); d.cols = g.getColumns();
  }
  return d;
}

// One raw response per respondent for the item (string, string[] or grid array).
function raw_(form, itemId) {
  const out = [];
  form.getResponses().forEach(function (r) {
    r.getItemResponses().forEach(function (ir) {
      if (ir.getItem().getId() === itemId) out.push(ir.getResponse());
    });
  });
  return out;
}

function answers_(form, itemId) {
  const out = [];
  raw_(form, itemId).forEach(function (v) {
    if (Array.isArray(v)) v.forEach(function (x) { if (x) out.push(String(x)); });
    else if (v) out.push(String(v).trim());
  });
  return out;
}

function norm_(s) {
  return s.toLowerCase().replace(/[^\w\s\-+.#\/]/g, '').replace(/\s+/g, ' ').trim();
}

const STOP_ = ('a an the and or but of to in on for with at by from as is are was were be been being it its this that these those i we you they he she them our your their my me us not no yes so if then than can could should would will may might must do does did have has had more most less very also just about into over under because which who what when where how why all any some such other only own same too there here up out many much each both few one').split(' ');

function weekData_(root, week) {
  const cache = CacheService.getScriptCache();
  const ck = 'data:' + root + ':' + week;
  const hit = cache.get(ck);
  if (hit) return JSON.parse(hit);
  const slides = weekForms_(root, week).map(aggregateForm_);
  const out = { week: week, at: Date.now(), slides: slides };
  cache.put(ck, JSON.stringify(out), 1);
  return out;
}

// Aggregate one form (f from weekForms_). Counts and words only, never emails.
function aggregateForm_(f) {
  const at = Date.now();
  const form = FormApp.openById(f.id);
  const rs = form.getResponses();
  const last = rs.length ? rs[rs.length - 1].getTimestamp().getTime() : 0;
  const raw = raw_(form, f.itemId);
  const out = { formId: f.id, title: f.title, kind: f.kind, url: f.url, n: raw.length, at: at, last: last };
  const ans = [];
  raw.forEach(function (v) {
    if (Array.isArray(v)) v.forEach(function (x) { if (x) ans.push(String(x)); });
    else if (v) ans.push(String(v).trim());
  });
  if (f.kind === 'bars') {
    const c = {};
    ans.forEach(function (a) { c[a] = (c[a] || 0) + 1; });
    out.items = f.choices.map(function (o) { return [o, c[o] || 0]; });
    Object.keys(c).forEach(function (o) { if (f.choices.indexOf(o) < 0) out.items.push([o, c[o]]); });
    out.multi = !!f.multi;
  } else if (f.kind === 'scale') {
    const c = {}; let sum = 0;
    ans.forEach(function (a) { const v = Number(a); if (!isNaN(v)) { c[v] = (c[v] || 0) + 1; sum += v; } });
    out.items = [];
    for (let v = f.lo; v <= f.hi; v++) out.items.push([String(v), c[v] || 0]);
    out.avg = ans.length ? Math.round(10 * sum / ans.length) / 10 : null;
    out.lo = f.lo; out.hi = f.hi; out.loLabel = f.loLabel; out.hiLabel = f.hiLabel; out.rating = !!f.rating;
  } else if (f.kind === 'grid') {
    out.rows = f.rows; out.cols = f.cols;
    out.counts = f.rows.map(function () { return f.cols.map(function () { return 0; }); });
    raw.forEach(function (v) {
      (v || []).forEach(function (cell, ri) {
        const ci = f.cols.indexOf(cell);
        if (ri < f.rows.length && ci >= 0) out.counts[ri][ci]++;
      });
    });
    out.items = [];
  } else if (f.kind === 'long') {
    const c = {};
    ans.forEach(function (a) {
      (a.toLowerCase().match(/[a-z][a-z\-']+/g) || []).forEach(function (w) {
        if (w.length > 2 && STOP_.indexOf(w) < 0) c[w] = (c[w] || 0) + 1;
      });
    });
    out.items = Object.keys(c).map(function (w) { return [w, c[w]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 80);
  } else {
    const c = {}, shown = {};
    ans.forEach(function (a) {
      const k = norm_(a);
      if (!k) return;
      c[k] = (c[k] || 0) + 1;
      shown[k] = shown[k] || {};
      shown[k][a] = (shown[k][a] || 0) + 1;
    });
    out.items = Object.keys(c).map(function (k) {
      const best = Object.keys(shown[k]).sort(function (x, y) { return shown[k][y] - shown[k][x]; })[0];
      return [best, c[k]];
    }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 150);
  }
  return out;
}

// Themes for a long-text form. Recomputed only when the answer count changed.
function themes_(root, formId) {
  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) return { error: 'no api key' };
  const form = FormApp.openById(formId);
  if (DriveApp.getFileById(formId).getParents().next().getParents().next().getId() !== root) return { error: 'not in course' };
  const item = form.getItems(FormApp.ItemType.PARAGRAPH_TEXT)[0] || form.getItems(FormApp.ItemType.TEXT)[0];
  if (!item) return { error: 'no text item' };
  const ans = answers_(form, item.getId());
  const cache = CacheService.getScriptCache();
  const ck = 'themes:' + formId;
  const hit = cache.get(ck);
  if (hit) {
    const h = JSON.parse(hit);
    if (h.n === ans.length) return h;
  }
  if (ans.length < 3) return { n: ans.length, themes: [] };
  const prev = hit ? JSON.parse(hit).themes.map(function (t) { return t.label; }) : [];
  const res = callClaude_(apiKey, item.getTitle(), ans, prev);
  const out = { n: ans.length, at: Date.now(), themes: res };
  cache.put(ck, JSON.stringify(out), 600);
  return out;
}

function callClaude_(apiKey, question, answers, prevLabels) {
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['themes', 'assignments'],
    properties: {
      themes: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['label', 'summary', 'representative'],
          properties: {
            label: { type: 'string' },
            summary: { type: 'string' },
            representative: { type: 'integer' },
          },
        },
      },
      assignments: { type: 'array', items: { type: 'integer' } },
    },
  };
  const numbered = answers.map(function (a, i) { return i + ': ' + a.replace(/\s+/g, ' ').slice(0, 600); }).join('\n');
  const prompt =
    'Students in a graduate class answered this discussion question:\n"' + question + '"\n\n' +
    'Group the answers into 3 to 7 themes. For each theme give a short label (2 to 5 words), ' +
    'a one-sentence neutral summary, and the index of the single answer that best represents it. ' +
    'Then give "assignments": one theme index (0-based) per answer, in answer order, ' +
    'exactly ' + answers.length + ' integers. Do not invent content that is not in the answers. ' +
    (prevLabels.length ? 'Reuse these labels where they still fit, so the display stays stable: ' + prevLabels.join('; ') + '. ' : '') +
    '\n\nAnswers:\n' + numbered;
  const resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'server-side-fallback-2026-07-01',
    },
    payload: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 8000,
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: schema } },
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const body = JSON.parse(resp.getContentText());
  if (resp.getResponseCode() !== 200) throw new Error('Claude API ' + resp.getResponseCode() + ': ' + (body.error && body.error.message));
  if (body.stop_reason === 'refusal') throw new Error('Claude declined');
  const text = body.content.filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
  const parsed = JSON.parse(text);
  const counts = parsed.themes.map(function () { return 0; });
  parsed.assignments.slice(0, answers.length).forEach(function (t) { if (t >= 0 && t < counts.length) counts[t]++; });
  return parsed.themes.map(function (t, i) {
    const rep = answers[t.representative] !== undefined ? answers[t.representative] : '';
    return { label: t.label, summary: t.summary, count: counts[i], example: rep.slice(0, 300) };
  }).sort(function (a, b) { return b.count - a.count; });
}

/**
 * Credit export (private). Sheet "Participation credit" in the course folder:
 *   - tab "Summary": one row per student, per week the number of questions
 *     answered, and the number of weeks with at least one answer
 *   - tab "Week NN": email, response time per question, number answered
 * Run exportCreditAllWeeks from the editor, or installCreditTrigger once to
 * refresh it every hour.
 */
function creditWeek_(week) {
  const forms = weekForms_(COURSE.folderId, week);
  const byEmail = {};
  forms.forEach(function (f, i) {
    FormApp.openById(f.id).getResponses().forEach(function (r) {
      const em = (r.getRespondentEmail() || '').toLowerCase();
      if (!em) return;
      byEmail[em] = byEmail[em] || forms.map(function () { return ''; });
      byEmail[em][i] = r.getTimestamp();
    });
  });
  return { forms: forms, byEmail: byEmail };
}

function creditSheet_() {
  const folder = DriveApp.getFolderById(COURSE.folderId);
  const it = folder.getFilesByName('Participation credit');
  if (it.hasNext()) return SpreadsheetApp.open(it.next());
  const ss = SpreadsheetApp.create('Participation credit');
  DriveApp.getFileById(ss.getId()).moveTo(folder);
  return ss;
}

function writeTab_(ss, name, head, rows) {
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clear();
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
  if (rows.length) sh.getRange(2, 1, rows.length, head.length).setValues(rows);
  sh.setFrozenRows(1);
  return sh;
}

function exportCreditAllWeeks() {
  const ss = creditSheet_();
  const weeks = Object.keys(COURSE.weeks).map(Number).sort(function (a, b) { return a - b; });
  const summary = {};
  weeks.forEach(function (w, wi) {
    const c = creditWeek_(w);
    const tab = 'Week ' + ('0' + w).slice(-2);
    const head = ['email'].concat(c.forms.map(function (f) { return f.title; })).concat(['answered']);
    const rows = Object.keys(c.byEmail).sort().map(function (em) {
      const cols = c.byEmail[em];
      const n = cols.filter(function (x) { return x !== ''; }).length;
      summary[em] = summary[em] || weeks.map(function () { return 0; });
      summary[em][wi] = n;
      return [em].concat(cols).concat([n]);
    });
    writeTab_(ss, tab, head, rows);
  });
  const head = ['email'].concat(weeks.map(function (w) { return 'Week ' + w; })).concat(['weeks participated', 'questions answered']);
  const rows = Object.keys(summary).sort().map(function (em) {
    const v = summary[em];
    return [em].concat(v).concat([v.filter(function (n) { return n > 0; }).length, v.reduce(function (a, b) { return a + b; }, 0)]);
  });
  const sh = writeTab_(ss, 'Summary', head, rows);
  ss.setActiveSheet(sh);
  ss.moveActiveSheet(1);
  const def = ss.getSheetByName('Sheet1');
  if (def) ss.deleteSheet(def);
  Logger.log(rows.length + ' students. ' + ss.getUrl());
  return ss.getUrl();
}

function installCreditTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'exportCreditAllWeeks') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('exportCreditAllWeeks').timeBased().everyHours(1).create();
  Logger.log('Credit sheet refreshes every hour.');
}

// One-time: create the board key. Shown in the execution log.
function createBoardKey() {
  const props = PropertiesService.getScriptProperties();
  let k = props.getProperty('BOARD_KEY');
  if (!k) {
    k = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('BOARD_KEY', k);
  }
  Logger.log('BOARD_KEY set (' + k.length + ' chars).');
}
