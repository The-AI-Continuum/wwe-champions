const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { readFileSync } = require('node:fs');
const { isChampionRecords } = require('../src/champion.ts');

const committedSnapshot = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'public', 'champions.json'), 'utf8'),
);

const record = (overrides = {}) => ({
  titleName: 'Undisputed WWE Champion',
  championName: 'Sami Zayn',
  imageUrl: 'https://www.wwe.com/f/styles/wwe_1_1_540/public/2026/10/Sami_Zayn_PROFILE.png',
  championshipDate: 'September 11, 2026',
  daysAsChampion: 57,
  defenseStatus: 'known',
  lastDefenseDate: 'October 30, 2026',
  daysSinceLastDefense: 8,
  source: {
    wweUrl: 'https://www.wwe.com/superstars/sami-zayn',
    cagematchUrl: 'https://www.cagematch.net/?id=5&nr=20',
  },
  ...overrides,
});

test('the committed snapshot is accepted', () => {
  assert.ok(committedSnapshot.length > 0);
  assert.equal(isChampionRecords(committedSnapshot), true);
});

test('a vacant title and unavailable facts are accepted as nulls', () => {
  const vacant = record({
    championName: '',
    imageUrl: null,
    championshipDate: null,
    daysAsChampion: null,
    defenseStatus: 'unavailable',
    lastDefenseDate: null,
    daysSinceLastDefense: null,
    source: { wweUrl: '', cagematchUrl: '' },
  });
  assert.equal(isChampionRecords([vacant, record()]), true);
});

test('a legacy champion record without a defense status is accepted', () => {
  const legacy = record();
  delete legacy.defenseStatus;
  assert.equal(isChampionRecords([legacy]), true);
});

test('a champion record without source links is accepted', () => {
  const unsourced = record();
  delete unsourced.source;
  assert.equal(isChampionRecords([unsourced]), true);
  assert.equal(isChampionRecords([record({ source: {} })]), true);
});

test('a snapshot that is not a list of champion records is rejected', () => {
  assert.equal(isChampionRecords({ champions: [record()] }), false);
  assert.equal(isChampionRecords(null), false);
  assert.equal(isChampionRecords([record(), null]), false);
  assert.equal(isChampionRecords([record(), 'Sami Zayn']), false);
});

const malformed = {
  'a non-string title name': { titleName: 42 },
  'a missing champion name': { championName: undefined },
  'an object reign start date': { championshipDate: { month: 'September', day: 11 } },
  'an object last defense date': { lastDefenseDate: { date: 'October 30, 2026' } },
  'a missing reign start date': { championshipDate: undefined },
  'a string reign length': { daysAsChampion: '57' },
  'a string days since last defense': { daysSinceLastDefense: '8 days' },
  'a missing reign length': { daysAsChampion: undefined },
  'an unknown defense status': { defenseStatus: 'confirmed' },
  'a null defense status': { defenseStatus: null },
  'a non-string WWE source link': { source: { wweUrl: 7, cagematchUrl: 'https://www.cagematch.net/?id=5&nr=20' } },
  'a non-string Cagematch source link': { source: { wweUrl: 'https://www.wwe.com/superstars/sami-zayn', cagematchUrl: ['x'] } },
  'non-object sources': { source: 'https://www.wwe.com/superstars/sami-zayn' },
  'a non-string image URL': { imageUrl: { src: 'https://www.wwe.com/x.png' } },
  'a missing image URL': { imageUrl: undefined },
};

for (const [kind, overrides] of Object.entries(malformed)) {
  test(`a snapshot with ${kind} is rejected`, () => {
    const broken = record(overrides);
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete broken[key];
    }
    assert.equal(isChampionRecords([record(), broken]), false);
  });
}
