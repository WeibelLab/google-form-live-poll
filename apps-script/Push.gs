/**
 * Push: on each form submission, write that form's aggregate to Firebase
 * Realtime Database so the board updates in about 0.2 s.
 *
 * Path: /boards/<BOARD_KEY>/<course>/w<week>/<formId>  (aggregates only, never emails)
 * Database rules: public read on /boards/$key only, no client writes.
 * Writes use the script owner's OAuth token (scopes in appsscript.json).
 *
 * Database: Firebase project google-form-live-poll (ID form-live-poll).
 *
 * Google allows 20 triggers per script, so submit triggers cover only the
 * current and next week. syncTriggers runs daily at 6 am to move them.
 */

const FIREBASE_URL = 'https://form-live-poll-default-rtdb.firebaseio.com';

function fbPut_(path, data) {
  const props = PropertiesService.getScriptProperties();
  const base = props.getProperty('FIREBASE_URL') || FIREBASE_URL;
  const url = base.replace(/\/$/, '') + '/boards/' + props.getProperty('BOARD_KEY') + '/' + path + '.json';
  const r = UrlFetchApp.fetch(url, {
    method: 'put',
    contentType: 'application/json',
    payload: JSON.stringify(data),
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  });
  if (r.getResponseCode() !== 200) throw new Error('Firebase ' + r.getResponseCode() + ': ' + r.getContentText());
}

// Course and week of a form, from its folders: course folder / "Week NN (...)" / form.
function placeOfForm_(formId) {
  const weekFolder = DriveApp.getFileById(formId).getParents().next();
  const m = weekFolder.getName().match(/^Week (\d+)/);
  if (!m) return null;
  const c = courseByFolder_(weekFolder.getParents().next().getId());
  return c ? { c: c, week: Number(m[1]) } : null;
}

function pushForm_(formId) {
  const p = placeOfForm_(formId);
  if (!p) return;
  CacheService.getScriptCache().remove('data:' + p.c.folderId + ':' + p.week);
  const f = weekForms_(p.c.folderId, p.week).filter(function (x) { return x.id === formId; })[0];
  if (!f) return;
  fbPut_(p.c.slug + '/w' + p.week + '/' + formId, aggregateForm_(f));
}

// Installable trigger handler.
function onPollSubmit(e) {
  pushForm_(e.source.getId());
}

// Current week of a course = latest week folder whose date is on or before today.
function currentWeek_(c) {
  const folders = DriveApp.getFolderById(c.folderId).getFolders();
  const today = Utilities.formatDate(new Date(), 'America/Los_Angeles', 'yyyy-MM-dd');
  let best = 1;
  while (folders.hasNext()) {
    const m = folders.next().getName().match(/^Week (\d+) \((\d{4}-\d{2}-\d{2})\)/);
    if (m && m[2] <= today && Number(m[1]) > best) best = Number(m[1]);
  }
  return best;
}

// Submit triggers for the current and next week of every course (Google allows 20
// triggers per script), plus a daily resync at 6 am.
function syncTriggers() {
  const want = {};
  getCourses_().forEach(function (c) {
    const w = currentWeek_(c);
    [w, w + 1].forEach(function (wk) {
      try { weekForms_(c.folderId, wk).forEach(function (f) { want[f.id] = true; }); } catch (err) { /* no folder */ }
    });
  });
  const have = {};
  let daily = false;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onPollSubmit') {
      const id = t.getTriggerSourceId();
      if (want[id] && !have[id]) have[id] = true;
      else ScriptApp.deleteTrigger(t);
    }
    if (t.getHandlerFunction() === 'syncTriggers') daily = true;
  });
  const ids = Object.keys(want).slice(0, 17);
  ids.forEach(function (id) {
    if (!have[id]) ScriptApp.newTrigger('onPollSubmit').forForm(id).onFormSubmit().create();
    try { pushForm_(id); } catch (err) { /* push is best effort */ }
  });
  if (!daily) ScriptApp.newTrigger('syncTriggers').timeBased().everyDays(1).atHour(6).inTimezone('America/Los_Angeles').create();
  Logger.log('Submit triggers: ' + ids.length + ' forms.');
}
