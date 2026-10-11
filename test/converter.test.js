'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const C = require('../converter');

const sample = fs.readFileSync(path.join(__dirname, 'fixtures', 'cstimer_sample.txt'), 'utf8');

test('reads every session with its name and scramble type, in csTimer order', () => {
  const sessions = C.readSessions(sample, 'cubic');
  assert.deepEqual(sessions.map((s) => [s.id, s.name, s.scrType, s.solves.length]), [
    ['1', '3x3 main', '333', 3],
    ['3', 'OH', '333oh', 1],
    ['2', 'Square-1', 'sqrs', 1],
    ['4', 'Session 4', '333', 1],
    ['5', 'zbll practice', 'zbll', 1],
  ]);
});

test('maps scramble types per target app', () => {
  assert.equal(C.mapScrType('333oh', 'cubic'), '333oh');
  assert.equal(C.mapScrType('333oh', 'twisty'), '333');
  assert.equal(C.mapScrType('444bld', 'twisty'), '444');
  assert.equal(C.mapScrType('222o', 'cubic'), '222');
  assert.equal(C.mapScrType('pyrl4e', 'twisty'), 'pyra');
  assert.equal(C.mapScrType('zbll', 'cubic'), 'other');
  assert.equal(C.mapScrType('zbll', 'twisty'), '333');
  assert.equal(C.mapScrType('sq1h', 'cubic'), 'sq1');
  assert.equal(C.mapScrType('sq2', 'cubic'), 'other');
});

test('unknown types use the "other" puzzle with the Cubic Timer category style', () => {
  const s = C.readSessions(sample, 'cubic').find((x) => x.id === '5');
  assert.equal(s.puzzle, 'other');
  assert.equal(s.category, 'zbll_zbll practice');
  const t = C.readSessions(sample, 'twisty').find((x) => x.id === '5');
  assert.equal(t.puzzle, '333');
  assert.equal(t.category, 'zbll practice');
});

test('converts penalties, adds +2 to the time, and converts seconds to milliseconds', () => {
  const ok = C.convertSolve([[0, 12345], 'R U', '', 1700000000], '333', 'a');
  assert.equal(ok.time, 12345);
  assert.equal(ok.penalty, 0);
  assert.equal(ok.date, 1700000000000);

  const plus2 = C.convertSolve([[2000, 12345], 'R U', '', 1700000000], '333', 'a');
  assert.equal(plus2.time, 14345);
  assert.equal(plus2.penalty, 1);

  const dnf = C.convertSolve([[-1, 12345], 'R U', '', 1700000000], '333', 'a');
  assert.equal(dnf.time, 12345);
  assert.equal(dnf.penalty, 2);
});

test('stores multi-phase splits in the comment, like Cubic Timer does', () => {
  // Total 30s; cumulative marks 30s, 18s, 7.5s (last phase first).
  const s = C.convertSolve([[0, 30000, 18000, 7500], 'R', 'nice', 1700000000], '333', 'a');
  assert.equal(s.comment, 'P1: 7.50\nP2: 10.50\nP3: 12.00\nnice');
});

test('fixes Square-1 and Megaminx scrambles for the tnoodle images', () => {
  assert.equal(C.convertSolve([[0, 1], '(1,0)/(3,3)/', '', 1], 'sq1', 'a').scramble, '(1,0) /(3,3) /');
  assert.equal(C.convertSolve([[0, 1], "  R++ D-- U'\n  R-- D++ U", '', 1], 'mega', 'a').scramble,
    "R++ D-- U'\nR-- D++ U");
});

test('skips broken records and counts them', () => {
  const sessions = C.readSessions({
    session1: [[[0, 1000], 'R', '', 1], 'garbage', [[0, 'x'], 'R', '', 1]],
    properties: { sessionData: '{"1":{"name":"a","opt":{}}}' },
  });
  const result = C.convertSessions(sessions);
  assert.equal(result.solves.length, 1);
  assert.equal(result.skipped, 2);
});

test('numbers sessions that would merge into the same category', () => {
  const sessions = C.readSessions({
    session1: [], session2: [],
    properties: { sessionData: { 1: { name: 'x', opt: {} }, 2: { name: 'x', opt: {} } } },
  });
  assert.deepEqual(sessions.map((s) => s.category), ['x', 'x (2)']);
});

test('writes the backup format with ; separators and \\ escapes', () => {
  const csv = C.toBackupCsv([{
    puzzle: '333', category: 'a"b', time: 1, date: 2, scramble: 'R', penalty: 0, comment: 'c\\d\ne',
  }]);
  assert.equal(csv,
    '"Puzzle";"Category";"Time(millis)";"Date(millis)";"Scramble";"Penalty";"Comment"\n' +
    '"333";"a\\"b";"1";"2";"R";"0";"c\\\\d\ne"\n');
});

test('full conversion of the sample file', () => {
  const result = C.convert(sample, 'cubic');
  assert.equal(result.solveCount, 7);
  assert.equal(result.skipped, 0);
  const lines = result.csv.trimEnd().split('\n');
  assert.equal(lines[0], '"Puzzle";"Category";"Time(millis)";"Date(millis)";"Scramble";"Penalty";"Comment"');
  // Oldest solve first.
  assert.equal(lines[1], '"333";"3x3 main";"10500";"1600000000000";"R U R\' U\'";"0";""');
});

test('rejects files that are not csTimer exports', () => {
  assert.throws(() => C.readSessions('not json'), /not a csTimer export/);
  assert.throws(() => C.readSessions('{"foo":1}'), /No csTimer sessions/);
});

test('reads a backup written by Cubic Timer (quoted header, \\ escapes, multi-line comment)', () => {
  const text =
    '"Puzzle";"Category";"Time(millis)";"Date(millis)";"Scramble";"Penalty";"Comment"\n' +
    '"333";"Normal";"9870";"1700000000000";"R U";"1";"he said \\"go\\" \\\\o/\nnext line"\n' +
    '"sq1";"Normal";"25000";"1700000001000";"(1,0) /";"0";""\n';
  const { solves, errors } = C.parseBackup(text);
  assert.equal(errors, 0);
  assert.deepEqual(solves[0], {
    puzzle: '333', category: 'Normal', time: 9870, date: 1700000000000,
    scramble: 'R U', penalty: 1, comment: 'he said "go" \\o/\nnext line',
  });
  assert.equal(solves[1].puzzle, 'sq1');
});

test('reads a backup written by Twisty Timer (plain header, Windows line ends)', () => {
  const text =
    'Puzzle,Category,Time(millis),Date(millis),Scramble,Penalty,Comment\r\n' +
    '"222";"Normal";"3210";"1600000000000";"R U2 F";"0";"nice"\r\n';
  const { solves } = C.parseBackup(text);
  assert.equal(solves.length, 1);
  assert.equal(solves[0].comment, 'nice');
  assert.equal(solves[0].time, 3210);
});

test('round-trips the backup the converter writes', () => {
  const written = C.convert(sample, 'cubic');
  const { solves, errors } = C.parseBackup(written.csv);
  assert.equal(errors, 0);
  assert.deepEqual(solves, written.solves);
});

test('counts backup rows the apps would reject', () => {
  const text =
    '"Puzzle";"Category";"Time(millis)";"Date(millis)";"Scramble";"Penalty";"Comment"\n' +
    '"333";"Normal";"12.5";"1";"R";"0";""\n' +
    '"333";"Normal";"1"\n' +
    '\n' +
    '"333";"Normal";"1000";"1";"R";"0";""\n';
  const { solves, errors } = C.parseBackup(text);
  assert.equal(solves.length, 1);
  assert.equal(errors, 3);
});

test('rejects a file that is not an app backup', () => {
  assert.throws(() => C.parseBackup(sample), /not a Cubic Timer or Twisty Timer backup/);
});

test('merges csTimer solves into an existing backup and leaves out duplicates', () => {
  const backup =
    '"Puzzle";"Category";"Time(millis)";"Date(millis)";"Scramble";"Penalty";"Comment"\n' +
    // Same solve as the first csTimer solve in the sample, with a different comment.
    '"333";"3x3 main";"10500";"1600000000000";"R U R\' U\'";"0";"edited on phone"\n' +
    '"333";"Normal";"8000";"1500000000000";"F";"0";""\n';
  const result = C.convert(sample, 'cubic', backup);
  assert.equal(result.existing, 2);
  assert.equal(result.added, 6);
  assert.equal(result.duplicates, 1);
  assert.equal(result.solveCount, 8);
  // The backup's own copy wins, and the result is sorted by date.
  assert.equal(result.solves[0].category, 'Normal');
  assert.equal(result.solves[1].comment, 'edited on phone');
});

test('merging the same csTimer export twice adds nothing the second time', () => {
  const first = C.convert(sample, 'cubic');
  const second = C.convert(sample, 'cubic', first.csv);
  assert.equal(second.added, 0);
  assert.equal(second.csv, first.csv);
});

test('lists existing categories per puzzle', () => {
  const map = C.categoriesByPuzzle([
    { puzzle: '333', category: 'Normal' }, { puzzle: '333', category: 'OH' },
    { puzzle: '222', category: 'Normal' }, { puzzle: '333', category: 'Normal' },
  ]);
  assert.deepEqual(map, { 333: ['Normal', 'OH'], 222: ['Normal'] });
});

test('a solve is the same solve when the millisecond date and the raw time match', () => {
  const csTimer = [
    { puzzle: '333', category: '3x3 main', time: 12000, date: 1600000000000, scramble: 'R', penalty: 0, comment: '' },
    // Same solve, copied into a second csTimer session.
    { puzzle: '333', category: 'copy', time: 12000, date: 1600000000000, scramble: 'R', penalty: 0, comment: '' },
    // Same date and time as a backup solve that has a +2 in the app.
    { puzzle: '333oh', category: 'OH', time: 20000, date: 1600000005000, scramble: 'U', penalty: 0, comment: '' },
    // Same time, one second later: a different solve.
    { puzzle: '333', category: '3x3 main', time: 12000, date: 1600000001000, scramble: 'F', penalty: 0, comment: '' },
  ];
  const backup = [
    // Moved to another category and given a +2 in the app.
    { puzzle: '333', category: 'Normal', time: 22000, date: 1600000005000, scramble: 'U', penalty: 1, comment: '' },
    // Two different solves from a .txt import that share a date. Both stay.
    { puzzle: '333fmc', category: 'Normal', time: 30000, date: 1500000000000, scramble: '', penalty: 0, comment: '' },
    { puzzle: '333fmc', category: 'Normal', time: 30000, date: 1500000000000, scramble: '', penalty: 0, comment: '' },
  ];
  const result = C.mergeSolves(backup, csTimer);
  assert.equal(result.added, 2);
  assert.equal(result.duplicates, 2);
  assert.equal(result.solves.length, 5);
});

test('duplicates inside the csTimer file are left out without a backup too', () => {
  const data = JSON.parse(sample);
  data.session6 = [data.session1[0]];
  const result = C.convert(data, 'cubic');
  assert.equal(result.duplicates, 1);
  assert.equal(result.solveCount, 7);
});
