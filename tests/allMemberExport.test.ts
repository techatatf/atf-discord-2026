import assert from 'node:assert/strict';
import { buildMemberCsv, sortMembers, filterMembersByWindow, exportFilename } from '../src/commands/allMemberExport';
import type { TimeUnit } from '../src/commands/allMemberExport';

async function test(name: string, fn: () => Promise<void> | void) {
  process.stdout.write(`  • ${name} ... `);
  try {
    await fn();
    console.log('ok');
  } catch (err) {
    console.log('FAIL');
    console.error(err);
    process.exitCode = 1;
  }
}

async function main() {
  console.log('allMemberExport');

  await test('empty members array produces header row only', () => {
    const csv = buildMemberCsv([]);
    assert.equal(csv, 'username,displayName,userId,joinedAt,roles');
  });

  await test('single member with all fields populated', () => {
    const csv = buildMemberCsv([{
      username: 'alice',
      displayName: 'Alice A',
      userId: '123',
      joinedAt: new Date('2025-01-15T10:30:00.000Z'),
      roles: ['Mentor', 'Staff'],
    }]);
    const lines = csv.split('\n');
    assert.equal(lines.length, 2);
    assert.equal(lines[1], 'alice,Alice A,123,2025-01-15T10:30:00.000Z,Mentor;Staff');
  });

  await test('null joinedAt produces empty string in that cell', () => {
    const csv = buildMemberCsv([{
      username: 'bob',
      displayName: 'Bob',
      userId: '456',
      joinedAt: null,
      roles: [],
    }]);
    const lines = csv.split('\n');
    assert.equal(lines[1], 'bob,Bob,456,,');
  });

  await test('roles with semicolons are inner-quoted per the issue spec', () => {
    const csv = buildMemberCsv([{
      username: 'carol',
      displayName: 'Carol',
      userId: '789',
      joinedAt: null,
      roles: ['Mentor', 'Q;A Lead'],
    }]);
    const lines = csv.split('\n');
    // Inner: Mentor;"Q;A Lead"  →  outer escapeCsvField wraps because of the quotes
    // The roles cell contains semicolons and quotes, so outer CSV escaping kicks in
    assert.equal(lines[1], 'carol,Carol,789,,"Mentor;""Q;A Lead"""');
  });

  await test('display name with commas is CSV-escaped', () => {
    const csv = buildMemberCsv([{
      username: 'dave',
      displayName: 'Dave, Jr.',
      userId: '101',
      joinedAt: null,
      roles: [],
    }]);
    const lines = csv.split('\n');
    assert.equal(lines[1], 'dave,"Dave, Jr.",101,,');
  });

  await test('multiple members produce one row each', () => {
    const csv = buildMemberCsv([
      { username: 'a', displayName: 'A', userId: '1', joinedAt: null, roles: [] },
      { username: 'b', displayName: 'B', userId: '2', joinedAt: null, roles: ['Staff'] },
    ]);
    const lines = csv.split('\n');
    assert.equal(lines.length, 3);
    assert.equal(lines[0], 'username,displayName,userId,joinedAt,roles');
    assert.equal(lines[1], 'a,A,1,,');
    assert.equal(lines[2], 'b,B,2,,Staff');
  });

  await test('role name with internal quotes gets doubled quotes in inner escaping', () => {
    const csv = buildMemberCsv([{
      username: 'eve',
      displayName: 'Eve',
      userId: '999',
      joinedAt: null,
      roles: ['Say "Hi"'],
    }]);
    const lines = csv.split('\n');
    assert.equal(lines[1], 'eve,Eve,999,,"""Say """"Hi"""""""');
  });
  await test('exportFilename returns members-full.csv for full mode', () => {
    assert.equal(exportFilename('full'), 'members-full.csv');
  });

  await test('exportFilename uses singular unit for amount=1 and plural for amount>1', () => {
    assert.equal(exportFilename('filtered', 'week', 1), 'members-last-1-week.csv');
    assert.equal(exportFilename('filtered', 'week', 3), 'members-last-3-weeks.csv');
    assert.equal(exportFilename('filtered', 'hour', 1), 'members-last-1-hour.csv');
    assert.equal(exportFilename('filtered', 'hour', 48), 'members-last-48-hours.csv');
    assert.equal(exportFilename('filtered', 'day', 1), 'members-last-1-day.csv');
    assert.equal(exportFilename('filtered', 'month', 2), 'members-last-2-months.csv');
  });

  await test('filterMembersByWindow includes member exactly on cutoff boundary', () => {
    const now = new Date('2025-06-15T12:00:00Z');
    const exactCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // exactly 1 week ago
    const members = [
      { username: 'boundary', displayName: 'B', userId: '1', joinedAt: exactCutoff, roles: [] },
      { username: 'before', displayName: 'Before', userId: '2', joinedAt: new Date(exactCutoff.getTime() - 1), roles: [] },
    ];
    const filtered = filterMembersByWindow(members, 'week', 1, now);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].username, 'boundary');
  });

  await test('filterMembersByWindow excludes null joinedAt members', () => {
    const now = new Date('2025-06-15T12:00:00Z');
    const members = [
      { username: 'recent', displayName: 'R', userId: '1', joinedAt: new Date('2025-06-14T00:00:00Z'), roles: [] },
      { username: 'unknown', displayName: 'U', userId: '2', joinedAt: null, roles: [] },
    ];
    const filtered = filterMembersByWindow(members, 'month', 1, now);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].username, 'recent');
  });

  await test('filterMembersByWindow includes members inside window and excludes those outside', () => {
    const now = new Date('2025-06-15T12:00:00Z');
    const members = [
      { username: 'recent', displayName: 'R', userId: '1', joinedAt: new Date('2025-06-14T00:00:00Z'), roles: [] },
      { username: 'old', displayName: 'O', userId: '2', joinedAt: new Date('2025-01-01T00:00:00Z'), roles: [] },
    ];
    const filtered = filterMembersByWindow(members, 'week', 1, now);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].username, 'recent');
  });

  await test('sortMembers puts null joinedAt members after all dated members', () => {
    const members = [
      { username: 'unknown1', displayName: 'U1', userId: '1', joinedAt: null, roles: [] },
      { username: 'known', displayName: 'K', userId: '2', joinedAt: new Date('2025-03-01T00:00:00Z'), roles: [] },
      { username: 'unknown2', displayName: 'U2', userId: '3', joinedAt: null, roles: [] },
    ];
    const sorted = sortMembers(members);
    assert.equal(sorted[0].username, 'known');
    assert.equal(sorted[1].joinedAt, null);
    assert.equal(sorted[2].joinedAt, null);
  });

  await test('sortMembers sorts dated members ascending by joinedAt', () => {
    const members = [
      { username: 'late', displayName: 'Late', userId: '2', joinedAt: new Date('2025-06-01T00:00:00Z'), roles: [] },
      { username: 'early', displayName: 'Early', userId: '1', joinedAt: new Date('2025-01-01T00:00:00Z'), roles: [] },
      { username: 'mid', displayName: 'Mid', userId: '3', joinedAt: new Date('2025-03-15T00:00:00Z'), roles: [] },
    ];
    const sorted = sortMembers(members);
    assert.deepEqual(sorted.map(m => m.username), ['early', 'mid', 'late']);
  });
}

main();
