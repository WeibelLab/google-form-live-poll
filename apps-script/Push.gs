/**
 * Push: on each form submission, write that form's aggregate to Firebase
 * Realtime Database so the board updates in about 0.2 s.
 *
 * Path: /boards/<BOARD_KEY>/<course>/w<week>/<formId>  (aggregates only, never emails)
 * Database rules: public read on /boards/$key only, no client writes.
 * Writes use the script owner's OAuth token (scopes in appsscript.json).
 *
 * Script property FIREBASE_URL, e.g. https://<project>-default-rtdb.firebaseio.com
 *
 * Google allows 20 triggers per script, so submit triggers cover only the
 * current and next week. syncTriggers runs daily at 6 am to move them.
 */

const PUSH_COURSE = 'cse291a';

function fbPut_(path, data) {
  const props = PropertiesService.getScriptProperties();
  const base = props.getProperty('FIREBASE_URL');
  if (!base) throw new Error('FIREBASE_URL not set');
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

// Week number from the parent folder name "Week NN (...)".
function weekOfForm_(formId) {
  const name = DriveApp.getFileById(formId).getParents().next().getName();
  const m = name.match(/^Week (\d+)/);
  return m ? Number(m[1]) : null;
}

function pushForm_(formId) {
  const week = weekOfForm_(formId);
  if (!week) return;
  const f = weekForms_(COURSE.folderId, week).filter(function (x) { return x.id === formId; })[0];
  if (!f) return;
  fbPut_(PUSH_COURSE + '/w' + week + '/' + formId, aggregateForm_(f));
}

// Installable trigger handler.
function onPollSubmit(e) {
  pushForm_(e.source.getId());
}

// Current week = latest week folder whose date (in its name) is on or before today.
function currentWeek_() {
  const folders = DriveApp.getFolderById(COURSE.folderId).getFolders();
  const today = Utilities.formatDate(new Date(), 'America/Los_Angeles', 'yyyy-MM-dd');
  let best = 1;
  while (folders.hasNext()) {
    const m = folders.next().getName().match(/^Week (\d+) \((\d{4}-\d{2}-\d{2})\)/);
    if (m && m[2] <= today && Number(m[1]) > best) best = Number(m[1]);
  }
  return best;
}

// Submit triggers for the given weeks (default: current and next), daily resync at 6 am.
function syncTriggers(weeks) {
  if (!Array.isArray(weeks)) {
    const w = currentWeek_();
    weeks = [w, w + 1];
  }
  const want = {};
  weeks.forEach(function (w) {
    try {
      weekForms_(COURSE.folderId, w).forEach(function (f) { want[f.id] = w; });
    } catch (err) { /* week folder missing */ }
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
  Object.keys(want).forEach(function (id) {
    if (!have[id]) ScriptApp.newTrigger('onPollSubmit').forForm(id).onFormSubmit().create();
    pushForm_(id);
  });
  if (!daily) ScriptApp.newTrigger('syncTriggers').timeBased().everyDays(1).atHour(6).inTimezone('America/Los_Angeles').create();
  Logger.log('Submit triggers for weeks ' + weeks.join(', ') + ': ' + Object.keys(want).length + ' forms.');
}

// For testing with Week 1 now.
function syncWeek1And2() { syncTriggers([1, 2]); }
