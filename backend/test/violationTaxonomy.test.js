const test = require('node:test');
const assert = require('node:assert/strict');
const { SEVERITY_BY_EVENT, HUMAN_LABEL_BY_EVENT } = require('../controllers/proctoringController');

const KNOWN_EVENT_TYPES = [
  'multiple_faces',
  'no_face',
  'looking_away',
  'looking_down',
  'window_blur',
  'fullscreen_exit',
  'alt_f4_blocked',
  'f11_blocked',
  'windows_key_blocked',
  'alt_tab_blocked',
  'start_menu_blocked',
  'close_tab_blocked',
  'reload_blocked',
  'devtools_blocked',
  'minimize_blocked'
];

const VALID_SEVERITIES = new Set(['low', 'medium', 'high']);

test('every known event type has a severity assigned', () => {
  for (const type of KNOWN_EVENT_TYPES) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(SEVERITY_BY_EVENT, type),
      `missing severity for event type "${type}"`
    );
  }
});

test('every severity value is one of low/medium/high', () => {
  for (const [type, severity] of Object.entries(SEVERITY_BY_EVENT)) {
    assert.ok(VALID_SEVERITIES.has(severity), `"${type}" has invalid severity "${severity}"`);
  }
});

test('every severity-mapped event also has a human-readable label', () => {
  for (const type of Object.keys(SEVERITY_BY_EVENT)) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(HUMAN_LABEL_BY_EVENT, type),
      `"${type}" has a severity but no human label`
    );
    assert.ok(HUMAN_LABEL_BY_EVENT[type].length > 0, `"${type}" has an empty human label`);
  }
});

test('multiple_faces and window/fullscreen tamper events are rated high severity', () => {
  // These are the events that most directly indicate active cheating or an
  // attempt to leave the exam window; regressing them to a lower severity
  // would silently weaken the teacher's live view.
  assert.equal(SEVERITY_BY_EVENT.multiple_faces, 'high');
  assert.equal(SEVERITY_BY_EVENT.window_blur, 'high');
  assert.equal(SEVERITY_BY_EVENT.fullscreen_exit, 'high');
  assert.equal(SEVERITY_BY_EVENT.alt_f4_blocked, 'high');
});

test('reportEvent rejects any event_type not in the severity table (see controller)', () => {
  // reportEvent() in proctoringController.js gates on
  // Object.prototype.hasOwnProperty.call(SEVERITY_BY_EVENT, event_type) before
  // accepting a report — this just documents/pins that invariant at the data level.
  assert.equal(Object.prototype.hasOwnProperty.call(SEVERITY_BY_EVENT, 'made_up_event'), false);
});
