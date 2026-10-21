const test = require('node:test');
const assert = require('node:assert/strict');
const { statusMessage } = require('../src/statusMessage.ts');

const ready = (count) => ({ status: 'ready', champions: Array.from({ length: count }, () => ({})) });

test('a completed snapshot announces its count and unavailable freshness', () => {
  const message = statusMessage(ready(18), { status: 'unavailable' });
  assert.match(message, /18 championship records/);
  assert.match(message, /update time unavailable/i);
  assert.doesNotMatch(message, /loading|no champions/i);
});

test('known freshness does not manufacture an unavailable warning', () => {
  const message = statusMessage(ready(1), { status: 'known', updatedAt: '2026-10-20T08:00:00Z' });
  assert.match(message, /1 championship record loaded/);
  assert.doesNotMatch(message, /records|unavailable/i);
});

test('empty and failed snapshots have distinct outcomes and a reload action', () => {
  const empty = statusMessage({ status: 'empty' }, { status: 'unavailable' });
  const failed = statusMessage({ status: 'error', message: 'Champion data could not be loaded. Use Reload snapshot to try again.' }, { status: 'unavailable' });
  assert.match(empty, /no champion records/i);
  assert.match(failed, /could not be loaded/i);
  assert.match(failed, /Reload snapshot/);
  assert.notEqual(empty, failed);
});

test('initial loading does not announce an empty or completed snapshot', () => {
  assert.equal(statusMessage({ status: 'loading' }, { status: 'pending' }), '');
});
