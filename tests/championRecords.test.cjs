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

// JOS-856: the refresh publishes a vacant title as a record with no holder and no reign facts.
const vacantRecord = (overrides = {}) => ({
  titleName: 'WWE Speed Champion',
  championName: null,
  vacant: true,
  imageUrl: null,
  championshipDate: null,
  daysAsChampion: null,
  lastDefenseDate: null,
  daysSinceLastDefense: null,
  source: { wweUrl: '', cagematchUrl: 'https://www.cagematch.net/?id=5&nr=7550' },
  ...overrides,
});

test('a vacant champion record is accepted alongside held records', () => {
  assert.equal(isChampionRecords([record(), vacantRecord(), record({ titleName: 'NXT Champion' })]), true);
  assert.equal(isChampionRecords([vacantRecord()]), true);
});

test('a vacant champion record without source links is accepted', () => {
  const unsourced = vacantRecord();
  delete unsourced.source;
  assert.equal(isChampionRecords([unsourced]), true);
});

test('the committed snapshot is still accepted with a vacant record appended', () => {
  assert.equal(isChampionRecords([...committedSnapshot, vacantRecord()]), true);
});

const malformedVacant = {
  'a vacant title with a champion name': vacantRecord({ championName: 'Dragon Lee' }),
  'a vacant title with an empty champion name': vacantRecord({ championName: '' }),
  'a vacant title with a missing champion name': vacantRecord({ championName: undefined }),
  'a vacant title with a reign length': vacantRecord({ daysAsChampion: 12 }),
  'a vacant title with a missing reign length': vacantRecord({ daysAsChampion: undefined }),
  'a vacant title with an image URL': vacantRecord({ imageUrl: 'https://www.wwe.com/x.png' }),
  'a vacant title with a reign start date': vacantRecord({ championshipDate: 'September 11, 2026' }),
  'a vacant title with a last defense date': vacantRecord({ lastDefenseDate: 'October 30, 2026' }),
  'a vacant title with days since last defense': vacantRecord({ daysSinceLastDefense: 0 }),
  'a vacant title with a defense status': vacantRecord({ defenseStatus: 'unavailable' }),
  'a vacant title with a null defense status': vacantRecord({ defenseStatus: null }),
  'a vacant title with malformed sources': vacantRecord({ source: { cagematchUrl: 7550 } }),
  'a vacant title with a non-string title name': vacantRecord({ titleName: null }),
  'a vacant flag of false': vacantRecord({ vacant: false }),
  "a vacant flag of 'yes'": vacantRecord({ vacant: 'yes' }),
  'a null vacant flag': vacantRecord({ vacant: null }),
  'a null champion name without a vacant flag': vacantRecord({ vacant: undefined }),
  'a held record with a null champion name': record({ championName: null }),
  'a held record with a vacant flag': record({ vacant: true }),
  'a held record with a vacant flag of false': record({ vacant: false }),
};

for (const [kind, broken] of Object.entries(malformedVacant)) {
  test(`a snapshot with ${kind} is rejected`, () => {
    for (const [key, value] of Object.entries(broken)) {
      if (value === undefined) delete broken[key];
    }
    assert.equal(isChampionRecords([record(), broken]), false);
  });
}
