import assert from 'node:assert/strict';
import { classifyInvites, selectInvitesForCleanup, ServerInvite } from '../src/invite/lifecycle';

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

function makeInvite(overrides: Partial<ServerInvite> = {}): ServerInvite {
  return {
    code: 'abc123',
    uses: 0,
    maxUses: 1,
    maxAge: 0,
    createdTimestamp: Date.now(),
    expiresTimestamp: null,
    ...overrides,
  };
}

async function main() {
  const now = new Date('2026-04-30T12:00:00Z');

  // Setup: a mixed set of invites
  const invites = [
    makeInvite({ code: 'bot-dead-used', uses: 1, maxUses: 1 }),         // bot, dead (fully used)
    makeInvite({ code: 'bot-dead-expired', expiresTimestamp: now.getTime() - 1000 }), // bot, dead (expired)
    makeInvite({ code: 'bot-live', uses: 0, maxUses: 5 }),              // bot, live
    makeInvite({ code: 'ext-dead-used', uses: 3, maxUses: 3 }),         // external, dead (fully used)
    makeInvite({ code: 'ext-dead-expired', expiresTimestamp: now.getTime() - 5000 }), // external, dead (expired)
    makeInvite({ code: 'ext-live' }),                                    // external, live
  ];
  const botCodes = new Set(['bot-dead-used', 'bot-dead-expired', 'bot-live']);
  const classified = classifyInvites(invites, botCodes, now);

  console.log('selectInvitesForCleanup');

  await test('default mode (all-dead-bot-invites) selects only dead bot invites', () => {
    const selected = selectInvitesForCleanup(classified, 'all-dead-bot-invites');
    const codes = selected.map(c => c.invite.code).sort();
    assert.deepEqual(codes, ['bot-dead-expired', 'bot-dead-used']);
  });

  await test('all-bot-invites selects all bot invites regardless of state', () => {
    const selected = selectInvitesForCleanup(classified, 'all-bot-invites');
    const codes = selected.map(c => c.invite.code).sort();
    assert.deepEqual(codes, ['bot-dead-expired', 'bot-dead-used', 'bot-live']);
  });

  await test('all-dead-invites selects all dead invites regardless of category', () => {
    const selected = selectInvitesForCleanup(classified, 'all-dead-invites');
    const codes = selected.map(c => c.invite.code).sort();
    assert.deepEqual(codes, ['bot-dead-expired', 'bot-dead-used', 'ext-dead-expired', 'ext-dead-used']);
  });

  await test('all-invites selects everything', () => {
    const selected = selectInvitesForCleanup(classified, 'all-invites');
    assert.equal(selected.length, 6);
  });

  await test('returns empty array when no invites match', () => {
    const liveOnly = classifyInvites(
      [makeInvite({ code: 'ext-live-only' })],
      new Set(),
      now,
    );
    const selected = selectInvitesForCleanup(liveOnly, 'all-dead-bot-invites');
    assert.deepEqual(selected, []);
  });

  await test('categorizes results into fullyUsed and expired counts', () => {
    const selected = selectInvitesForCleanup(classified, 'all-dead-bot-invites');
    const fullyUsed = selected.filter(c => c.invite.maxUses > 0 && (c.invite.uses ?? 0) >= c.invite.maxUses);
    const expired = selected.filter(c => c.invite.expiresTimestamp !== null && c.invite.expiresTimestamp <= now.getTime());
    // bot-dead-used is fully used, bot-dead-expired is expired
    assert.equal(fullyUsed.length, 1);
    assert.equal(expired.length, 1);
  });

  console.log('');
  if (process.exitCode) {
    console.log('FAILED');
  } else {
    console.log('All tests passed');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
