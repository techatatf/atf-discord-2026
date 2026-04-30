import assert from 'node:assert/strict';
import { categorizeInvites, classifyInvites, ServerInvite } from '../src/invite/lifecycle';

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
  console.log('categorizeInvites');

  await test('computes total and available capacity', () => {
    const invites = [
      makeInvite({ code: 'a1' }),
      makeInvite({ code: 'a2' }),
      makeInvite({ code: 'a3' }),
    ];
    const result = categorizeInvites(invites, new Set());

    assert.equal(result.total, 3);
    assert.equal(result.limit, 1000);
    assert.equal(result.available, 997);
    assert.equal(result.botCreated, 0);
    assert.equal(result.botLive, 0);
    assert.equal(result.botDead, 0);
  });

  await test('identifies bot-created live and dead invites', () => {
    const now = new Date('2026-04-30T12:00:00Z');
    const invites = [
      makeInvite({ code: 'bot1' }),                          // bot, live
      makeInvite({ code: 'bot2', uses: 1, maxUses: 1 }),     // bot, dead (fully used)
      makeInvite({ code: 'bot3', expiresTimestamp: now.getTime() - 1000 }), // bot, dead (expired)
      makeInvite({ code: 'ext1' }),                          // external, live
      makeInvite({ code: 'ext2', uses: 5, maxUses: 5 }),     // external, fully used but not counted as bot dead
    ];
    const botCodes = new Set(['bot1', 'bot2', 'bot3']);
    const result = categorizeInvites(invites, botCodes, now);

    assert.equal(result.total, 5);
    assert.equal(result.botCreated, 3);
    assert.equal(result.botLive, 1);
    assert.equal(result.botDead, 2);
    assert.equal(result.available, 995);
  });

  await test('handles empty invite list', () => {
    const result = categorizeInvites([], new Set());
    assert.equal(result.total, 0);
    assert.equal(result.available, 1000);
    assert.equal(result.botCreated, 0);
    assert.equal(result.botLive, 0);
    assert.equal(result.botDead, 0);
  });

  await test('handles all bot invites dead', () => {
    const now = new Date('2026-04-30T12:00:00Z');
    const invites = [
      makeInvite({ code: 'bot1', uses: 1, maxUses: 1 }),
      makeInvite({ code: 'bot2', expiresTimestamp: now.getTime() - 1000 }),
    ];
    const result = categorizeInvites(invites, new Set(['bot1', 'bot2']), now);
    assert.equal(result.botCreated, 2);
    assert.equal(result.botLive, 0);
    assert.equal(result.botDead, 2);
  });

  await test('handles all bot invites live', () => {
    const now = new Date('2026-04-30T12:00:00Z');
    const invites = [
      makeInvite({ code: 'bot1' }),
      makeInvite({ code: 'bot2', uses: 2, maxUses: 10 }),
      makeInvite({ code: 'bot3', expiresTimestamp: now.getTime() + 86400000 }),
    ];
    const result = categorizeInvites(invites, new Set(['bot1', 'bot2', 'bot3']), now);
    assert.equal(result.botCreated, 3);
    assert.equal(result.botLive, 3);
    assert.equal(result.botDead, 0);
  });

  console.log('classifyInvites');

  await test('classifies all invites with category and state', () => {
    const now = new Date('2026-04-30T12:00:00Z');
    const invites = [
      makeInvite({ code: 'bot1' }),
      makeInvite({ code: 'bot2', uses: 1, maxUses: 1 }),
      makeInvite({ code: 'ext1' }),
      makeInvite({ code: 'ext2', expiresTimestamp: now.getTime() - 1000 }),
    ];
    const result = classifyInvites(invites, new Set(['bot1', 'bot2']), now);

    assert.equal(result.length, 4);
    assert.deepEqual(
      result.map(r => ({ code: r.invite.code, category: r.category, state: r.state })),
      [
        { code: 'bot1', category: 'bot', state: 'live' },
        { code: 'bot2', category: 'bot', state: 'dead' },
        { code: 'ext1', category: 'external', state: 'live' },
        { code: 'ext2', category: 'external', state: 'dead' },
      ]
    );
  });

  await test('filters invites by category', () => {
    const now = new Date('2026-04-30T12:00:00Z');
    const invites = [
      makeInvite({ code: 'bot1' }),
      makeInvite({ code: 'bot2', uses: 1, maxUses: 1 }),
      makeInvite({ code: 'ext1' }),
    ];
    const classified = classifyInvites(invites, new Set(['bot1', 'bot2']), now);
    const botOnly = classified.filter(c => c.category === 'bot');
    assert.equal(botOnly.length, 2);
    assert.ok(botOnly.every(c => c.category === 'bot'));

    const deadOnly = classified.filter(c => c.state === 'dead');
    assert.equal(deadOnly.length, 1);
    assert.equal(deadOnly[0].invite.code, 'bot2');
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
