import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildOutputCsv, parseCsv } from '../src/invite/csv';
import { InviteCreator, runBulkInviteLoop } from '../src/invite/bulk';

const FIXTURES = path.join(__dirname, 'fixtures');

function makeFakeChannel(opts: { failIndex?: number; delayMs?: number; failAfter?: number; failMessage?: string } = {}): InviteCreator & { callCount: number } {
  let counter = 0;
  return {
    callCount: 0,
    async createInvite() {
      this.callCount++;
      if (opts.delayMs) await new Promise(r => setTimeout(r, opts.delayMs));
      if (opts.failIndex !== undefined && counter === opts.failIndex) {
        counter++;
        throw new Error(opts.failMessage ?? 'simulated failure');
      }
      if (opts.failAfter !== undefined && counter >= opts.failAfter) {
        counter++;
        throw new Error(opts.failMessage ?? 'simulated failure');
      }
      const code = `CODE${counter++}`;
      return { code, url: `https://discord.gg/${code}` };
    },
  };
}

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
  console.log('parseCsv');

  await test('parses valid fixture with roles and existing links', () => {
    const content = fs.readFileSync(path.join(FIXTURES, 'bulk-invite-valid.csv'), 'utf-8');
    const { rows, errors } = parseCsv(content);

    assert.deepEqual(errors, []);
    assert.equal(rows.length, 5);

    assert.equal(rows[0].reason, 'Student cohort Q2');
    assert.equal(rows[0].maxUses, 1);
    assert.equal(rows[0].maxAge, 7);
    assert.equal(rows[0].role, 'student');
    assert.equal(rows[0].existingLink, undefined);

    assert.equal(rows[1].role, 'mentor');
    assert.equal(rows[1].maxUses, 5);

    assert.equal(rows[2].role, 'student');

    assert.equal(rows[3].existingLink, 'https://discord.gg/EXISTING123');

    assert.equal(rows[4].reason, 'Student with quotes cohort, A');
    assert.equal(rows[4].role, 'student');
  });

  await test('reports errors for invalid fixture', () => {
    const content = fs.readFileSync(path.join(FIXTURES, 'bulk-invite-invalid.csv'), 'utf-8');
    const { rows, errors } = parseCsv(content);

    assert.equal(rows.length, 1);
    assert.ok(errors.length >= 3, `expected 3+ errors, got ${errors.length}: ${errors.join('; ')}`);
    assert.ok(errors.some(e => e.includes('role')), 'expected role error');
    assert.ok(errors.some(e => e.includes('max-uses')), 'expected max-uses error');
    assert.ok(errors.some(e => e.includes('reason')), 'expected reason error');
  });

  await test('normalizes header variations (case, separators, plurals)', () => {
    const csv = 'Reason,Max Uses,Max_Age,Role,Invite Links\nTest,1,7,student,';
    const { rows, errors } = parseCsv(csv);
    assert.deepEqual(errors, []);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].reason, 'Test');
    assert.equal(rows[0].maxUses, 1);
    assert.equal(rows[0].maxAge, 7);
    assert.equal(rows[0].role, 'student');
  });

  await test('handles uppercase and underscore header variants', () => {
    const csv = 'REASON,MAX_USES,MAX_AGE,ROLE,INVITE_LINK\nTest,2,14,mentor,';
    const { rows, errors } = parseCsv(csv);
    assert.deepEqual(errors, []);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].maxUses, 2);
    assert.equal(rows[0].maxAge, 14);
    assert.equal(rows[0].role, 'mentor');
  });

  await test('detects duplicate columns that normalize to the same field', () => {
    const csv = 'reason,Reason,max-uses\nTest,Test2,1';
    const { rows, errors } = parseCsv(csv);
    assert.equal(rows.length, 0);
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes('Duplicate column'));
  });

  await test('preserves original headers in parse result', () => {
    const csv = 'Reason,Max Uses,Max_Age,Role,Invite Links\nTest,1,7,student,';
    const result = parseCsv(csv);
    assert.deepEqual(result.originalHeaders, ['Reason', 'Max Uses', 'Max_Age', 'Role', 'Invite Links']);
  });

  await test('returns raw untrimmed fields for extra columns', () => {
    const csv = 'reason,max-uses,max-age,notes,invite-link\nTest,1,7, extra spaces ,';
    const result = parseCsv(csv);
    assert.deepEqual(result.errors, []);
    assert.equal(result.rawRows[0][3], ' extra spaces ');
  });

  console.log('runBulkInviteLoop');

  await test('creates invites for non-existing rows, skips existing', async () => {
    const content = fs.readFileSync(path.join(FIXTURES, 'bulk-invite-valid.csv'), 'utf-8');
    const { rows } = parseCsv(content);
    const channel = makeFakeChannel();

    const start = Date.now();
    const result = await runBulkInviteLoop(channel, rows);
    const elapsed = Date.now() - start;

    assert.ok(elapsed < 1000, `loop should terminate quickly, took ${elapsed}ms`);
    assert.equal(result.created, 4);
    assert.equal(result.skipped, 1);
    assert.equal(result.failed, 0);
    assert.equal(channel.callCount, 4);

    assert.equal(result.roleAssignments.length, 4);
    assert.equal(result.roleAssignments[0].role, 'student');
    assert.equal(result.roleAssignments[1].role, 'mentor');
    assert.equal(result.roleAssignments[2].role, 'student');
    assert.equal(result.roleAssignments[3].role, 'student');

    assert.equal(result.links[3], null);
    assert.ok(result.links[0]?.startsWith('https://discord.gg/CODE'));
  });

  await test('terminates on createInvite failure without hanging', async () => {
    const content = fs.readFileSync(path.join(FIXTURES, 'bulk-invite-valid.csv'), 'utf-8');
    const { rows } = parseCsv(content);
    const channel = makeFakeChannel({ failIndex: 1 });

    const result = await runBulkInviteLoop(channel, rows);
    assert.equal(result.failed, 1);
    assert.equal(result.created, 3);
    assert.equal(result.skipped, 1);
  });

  await test('fires progress callback for each row', async () => {
    const content = fs.readFileSync(path.join(FIXTURES, 'bulk-invite-valid.csv'), 'utf-8');
    const { rows } = parseCsv(content);
    const channel = makeFakeChannel();
    const progress: Array<[number, number]> = [];

    await runBulkInviteLoop(channel, rows, (i, total) => progress.push([i, total]));
    assert.equal(progress.length, rows.length);
    assert.deepEqual(progress[0], [0, 5]);
    assert.deepEqual(progress[rows.length - 1], [4, 5]);
  });

  await test('scales to 100 rows without hanging', async () => {
    const many: string[] = ['reason,max-uses,max-age,role,invite-link'];
    for (let i = 0; i < 100; i++) many.push(`reason ${i},1,7,student,`);
    const { rows, errors } = parseCsv(many.join('\n'));
    assert.equal(errors.length, 0);
    assert.equal(rows.length, 100);

    const channel = makeFakeChannel({ delayMs: 2 });
    const start = Date.now();
    const result = await runBulkInviteLoop(channel, rows);
    const elapsed = Date.now() - start;

    assert.equal(result.created, 100);
    assert.equal(result.roleAssignments.length, 100);
    assert.ok(elapsed < 5_000, `100 rows with 2ms delay should finish under 5s, took ${elapsed}ms`);
  });

  console.log('runBulkInviteLoop — circuit breaker & first error');

  await test('stops after 3 consecutive errors and returns stoppedReason', async () => {
    // 10 rows, all fail from the start
    const csvLines = ['reason,max-uses,max-age,role,invite-link'];
    for (let i = 0; i < 10; i++) csvLines.push(`reason ${i},1,7,student,`);
    const { rows } = parseCsv(csvLines.join('\n'));
    const channel = makeFakeChannel({ failAfter: 0, failMessage: 'Maximum number of invites reached' });

    const result = await runBulkInviteLoop(channel, rows);
    assert.equal(result.stoppedReason, 'consecutive-errors');
    assert.equal(result.failed, 3);
    assert.equal(result.created, 0);
    assert.equal(channel.callCount, 3); // stopped after 3, didn't try all 10
  });

  await test('consecutive error counter resets on success', async () => {
    // 10 rows: rows 0,1 succeed, row 2 fails, row 3 succeeds, rows 4,5 fail, row 6 succeeds, rows 7,8,9 fail → stops
    let callIdx = 0;
    const failPattern = [false, false, true, false, true, true, false, true, true, true];
    const channel: InviteCreator & { callCount: number } = {
      callCount: 0,
      async createInvite() {
        this.callCount++;
        const shouldFail = failPattern[callIdx++];
        if (shouldFail) throw new Error('intermittent error');
        return { code: `CODE${callIdx}`, url: `https://discord.gg/CODE${callIdx}` };
      },
    };

    const csvLines = ['reason,max-uses,max-age,role,invite-link'];
    for (let i = 0; i < 10; i++) csvLines.push(`reason ${i},1,7,student,`);
    const { rows } = parseCsv(csvLines.join('\n'));

    const result = await runBulkInviteLoop(channel, rows);
    assert.equal(result.stoppedReason, 'consecutive-errors');
    // Processed rows 0-9: 0=ok, 1=ok, 2=fail, 3=ok, 4=fail, 5=fail, 6=ok, 7=fail, 8=fail, 9=fail → stopped at row 9
    assert.equal(result.created, 4);
    assert.equal(result.failed, 6);
    assert.equal(channel.callCount, 10);
  });

  await test('captures first error with row number and message', async () => {
    const csvLines = ['reason,max-uses,max-age,role,invite-link'];
    for (let i = 0; i < 5; i++) csvLines.push(`reason ${i},1,7,student,`);
    const { rows } = parseCsv(csvLines.join('\n'));
    // Fail on index 2 (row 3 in 1-based)
    const channel = makeFakeChannel({ failIndex: 2, failMessage: 'Rate limited' });

    const result = await runBulkInviteLoop(channel, rows);
    assert.equal(result.firstError?.row, 3);
    assert.equal(result.firstError?.message, 'Rate limited');
    assert.equal(result.stoppedReason, null); // only 1 failure, no circuit break
  });

  await test('firstError is null when no errors occur', async () => {
    const csvLines = ['reason,max-uses,max-age,role,invite-link'];
    for (let i = 0; i < 3; i++) csvLines.push(`reason ${i},1,7,student,`);
    const { rows } = parseCsv(csvLines.join('\n'));
    const channel = makeFakeChannel();

    const result = await runBulkInviteLoop(channel, rows);
    assert.equal(result.firstError, null);
    assert.equal(result.stoppedReason, null);
  });

  await test('circuit breaker with custom limit', async () => {
    const csvLines = ['reason,max-uses,max-age,role,invite-link'];
    for (let i = 0; i < 10; i++) csvLines.push(`reason ${i},1,7,student,`);
    const { rows } = parseCsv(csvLines.join('\n'));
    const channel = makeFakeChannel({ failAfter: 0 });

    // With limit of 5 instead of default 3
    const result = await runBulkInviteLoop(channel, rows, undefined, { consecutiveErrorLimit: 5 });
    assert.equal(result.stoppedReason, 'consecutive-errors');
    assert.equal(result.failed, 5);
    assert.equal(channel.callCount, 5);
  });

  console.log('runBulkInviteLoop — cancellation (shouldCancel)');

  await test('stops when shouldCancel returns true and returns stoppedReason cancelled', async () => {
    const csvLines = ['reason,max-uses,max-age,role,invite-link'];
    for (let i = 0; i < 10; i++) csvLines.push(`reason ${i},1,7,student,`);
    const { rows } = parseCsv(csvLines.join('\n'));
    const channel = makeFakeChannel();

    let cancelAfter = 3;
    let callCount = 0;
    const shouldCancel = () => {
      callCount++;
      return callCount > cancelAfter;
    };

    const result = await runBulkInviteLoop(channel, rows, undefined, { shouldCancel });
    assert.equal(result.stoppedReason, 'cancelled');
    assert.equal(result.created, 3); // processed 3 rows, then cancelled before row 4
    assert.equal(channel.callCount, 3);
  });

  await test('shouldCancel is checked before each row, not after', async () => {
    const csvLines = ['reason,max-uses,max-age,role,invite-link'];
    for (let i = 0; i < 5; i++) csvLines.push(`reason ${i},1,7,student,`);
    const { rows } = parseCsv(csvLines.join('\n'));
    const channel = makeFakeChannel();

    // Cancel immediately — should process 0 rows
    const result = await runBulkInviteLoop(channel, rows, undefined, { shouldCancel: () => true });
    assert.equal(result.stoppedReason, 'cancelled');
    assert.equal(result.created, 0);
    assert.equal(channel.callCount, 0);
  });

  await test('cancellation preserves already-created invites in results', async () => {
    const csvLines = ['reason,max-uses,max-age,role,invite-link'];
    for (let i = 0; i < 10; i++) csvLines.push(`reason ${i},1,7,student,`);
    const { rows } = parseCsv(csvLines.join('\n'));
    const channel = makeFakeChannel();

    // shouldCancel is checked at the TOP of each iteration, BEFORE onProgress and create.
    // Use a simple counter: cancel after 5 calls to shouldCancel (i.e. before processing row 5).
    let checkCount = 0;
    const shouldCancel = () => ++checkCount > 5;

    const result = await runBulkInviteLoop(channel, rows, undefined, { shouldCancel });
    assert.equal(result.stoppedReason, 'cancelled');
    // shouldCancel returns false for checks 1-5 (rows 0-4), true on check 6 (row 5) → 5 created
    assert.equal(result.created, 5);
    assert.equal(result.roleAssignments.length, 5);
    // Links for created rows should be set, remaining should not exist
    for (let i = 0; i < 5; i++) {
      assert.ok(result.links[i]?.startsWith('https://discord.gg/'), `expected link at index ${i}`);
    }
  });

  console.log('buildOutputCsv');

  await test('round-trips through parse → build → parse', () => {
    const content = fs.readFileSync(path.join(FIXTURES, 'bulk-invite-valid.csv'), 'utf-8');
    const parseResult = parseCsv(content);
    const links = parseResult.rows.map((_, i) => `https://discord.gg/NEW${i}`);
    const output = buildOutputCsv(parseResult, links);

    const header = output.split('\n')[0];
    assert.equal(header, 'reason,max-uses,max-age,role,invite-link');

    const reparsed = parseCsv(output);
    assert.deepEqual(reparsed.errors, []);
    assert.equal(reparsed.rows.length, parseResult.rows.length);

    const existingRow = reparsed.rows[3];
    assert.equal(existingRow.existingLink, 'https://discord.gg/EXISTING123');

    assert.equal(reparsed.rows[0].role, 'student');
    assert.equal(reparsed.rows[1].role, 'mentor');
    assert.equal(reparsed.rows[2].role, 'student');
  });

  await test('preserves extra columns in output', () => {
    const csv = 'reason,max-uses,max-age,notes,email,invite-link\nTest,1,7,some note,user@test.com,';
    const parseResult = parseCsv(csv);
    assert.deepEqual(parseResult.errors, []);

    const links = ['https://discord.gg/ABC'];
    const output = buildOutputCsv(parseResult, links);
    const lines = output.split('\n');

    assert.equal(lines[0], 'reason,max-uses,max-age,notes,email,invite-link,role');
    assert.equal(lines[1], 'Test,1,7,some note,user@test.com,https://discord.gg/ABC,student');
  });

  await test('preserves untrimmed extra column values in output', () => {
    const csv = 'reason,max-uses,max-age,notes,invite-link\nTest,1,7, has spaces ,';
    const parseResult = parseCsv(csv);
    const output = buildOutputCsv(parseResult, ['https://discord.gg/X']);
    const dataRow = output.split('\n')[1];
    assert.ok(dataRow.includes(' has spaces '), `expected untrimmed value, got: ${dataRow}`);
  });

  await test('appends role column when missing', () => {
    const csv = 'reason,max-uses,max-age,invite-link\nTest,1,7,';
    const parseResult = parseCsv(csv);
    assert.deepEqual(parseResult.errors, []);

    const output = buildOutputCsv(parseResult, ['https://discord.gg/X']);
    const lines = output.split('\n');

    assert.equal(lines[0], 'reason,max-uses,max-age,invite-link,role');
    assert.equal(lines[1], 'Test,1,7,https://discord.gg/X,student');
  });

  await test('appends invite-link column when missing', () => {
    const csv = 'reason,max-uses,max-age,role\nTest,1,7,mentor';
    const parseResult = parseCsv(csv);
    assert.deepEqual(parseResult.errors, []);

    const output = buildOutputCsv(parseResult, ['https://discord.gg/Y']);
    const lines = output.split('\n');

    assert.equal(lines[0], 'reason,max-uses,max-age,role,invite-link');
    assert.equal(lines[1], 'Test,1,7,mentor,https://discord.gg/Y');
  });

  await test('appends both role and invite-link when both missing', () => {
    const csv = 'reason,max-uses,max-age\nTest,1,7';
    const parseResult = parseCsv(csv);
    assert.deepEqual(parseResult.errors, []);

    const output = buildOutputCsv(parseResult, ['https://discord.gg/Z']);
    const lines = output.split('\n');

    assert.equal(lines[0], 'reason,max-uses,max-age,role,invite-link');
    assert.equal(lines[1], 'Test,1,7,student,https://discord.gg/Z');
  });

  await test('does not append max-uses or max-age when missing', () => {
    const csv = 'reason,role,invite-link\nTest,student,';
    const parseResult = parseCsv(csv);
    assert.deepEqual(parseResult.errors, []);

    const output = buildOutputCsv(parseResult, ['https://discord.gg/W']);
    const header = output.split('\n')[0];
    assert.equal(header, 'reason,role,invite-link');
  });

  await test('preserves original header text in output', () => {
    const csv = 'Reason,Max Uses,Max_Age,Role,Invite Links\nTest,1,7,student,';
    const parseResult = parseCsv(csv);
    assert.deepEqual(parseResult.errors, []);

    const output = buildOutputCsv(parseResult, ['https://discord.gg/H']);
    const header = output.split('\n')[0];
    assert.equal(header, 'Reason,Max Uses,Max_Age,Role,Invite Links');
  });

  await test('writes user original values for validated columns (not defaults)', () => {
    const csv = 'reason,max-uses,max-age,role,invite-link\nTest,-1,-1,student,';
    const parseResult = parseCsv(csv);
    assert.deepEqual(parseResult.errors, []);

    const output = buildOutputCsv(parseResult, ['https://discord.gg/V']);
    const dataRow = output.split('\n')[1];
    assert.equal(dataRow, 'Test,-1,-1,student,https://discord.gg/V');
  });

  await test('failed invite writes empty string in link cell', () => {
    const csv = 'reason,max-uses,max-age,role,invite-link\nTest,1,7,student,';
    const parseResult = parseCsv(csv);
    const output = buildOutputCsv(parseResult, [null]);
    const dataRow = output.split('\n')[1];
    assert.equal(dataRow, 'Test,1,7,student,');
  });

  if (process.exitCode) {
    console.log('\nFAILED');
  } else {
    console.log('\nAll tests passed');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
