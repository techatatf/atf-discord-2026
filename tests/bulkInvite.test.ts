import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildOutputCsv, parseCsv } from '../src/invite/csv';
import { InviteCreator, runBulkInviteLoop } from '../src/invite/bulk';

const FIXTURES = path.join(__dirname, 'fixtures');

function makeFakeChannel(opts: { failIndex?: number; delayMs?: number } = {}): InviteCreator & { callCount: number } {
  let counter = 0;
  return {
    callCount: 0,
    async createInvite() {
      this.callCount++;
      if (opts.delayMs) await new Promise(r => setTimeout(r, opts.delayMs));
      if (opts.failIndex !== undefined && counter === opts.failIndex) {
        counter++;
        throw new Error('simulated failure');
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

    // Quoted reason with embedded comma: quotes are unwrapped, comma preserved
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

    // existingLink row should have null in links
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

  console.log('buildOutputCsv');

  await test('round-trips through parse → build → parse', () => {
    const content = fs.readFileSync(path.join(FIXTURES, 'bulk-invite-valid.csv'), 'utf-8');
    const { rows } = parseCsv(content);
    const links = rows.map((_, i) => `https://discord.gg/NEW${i}`);
    const output = buildOutputCsv(rows, links);

    const header = output.split('\n')[0];
    assert.equal(header, 'reason,max-uses,max-age,role,invite-link');

    const reparsed = parseCsv(output);
    assert.deepEqual(reparsed.errors, []);
    assert.equal(reparsed.rows.length, rows.length);

    // Existing-link row preserves original link
    const existingRow = reparsed.rows[3];
    assert.equal(existingRow.existingLink, 'https://discord.gg/EXISTING123');

    // Roles survive round-trip
    assert.equal(reparsed.rows[0].role, 'student');
    assert.equal(reparsed.rows[1].role, 'mentor');
    assert.equal(reparsed.rows[2].role, 'student');
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
