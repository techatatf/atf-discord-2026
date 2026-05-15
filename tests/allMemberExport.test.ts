import assert from 'node:assert/strict';
import { buildMemberCsv } from '../src/commands/allMemberExport';

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
}

main();
