import assert from 'node:assert/strict';
import { formatCapacityMessage } from '../src/invite/lifecycle';
import type { InviteCapacity } from '../src/invite/lifecycle';

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
  console.log('formatCapacityMessage');

  await test('displays total without slash-limit format', () => {
    const capacity: InviteCapacity = {
      total: 905,
      limit: 1000,
      botCreated: 800,
      botLive: 750,
      botDead: 50,
      available: 95,
    };
    const msg = formatCapacityMessage(capacity);
    // Should NOT contain "905/1000" format
    assert.ok(!msg.includes('905/1000'), 'should not use total/limit format');
    // Should contain total on its own
    assert.ok(msg.includes('905'), 'should show total');
    // Should label the limit as nominal
    assert.ok(msg.includes('1000'), 'should show limit');
    assert.ok(msg.toLowerCase().includes('nominal'), 'should label limit as nominal');
  });

  await test('shows bot-created breakdown with live and dead counts', () => {
    const capacity: InviteCapacity = {
      total: 500,
      limit: 1000,
      botCreated: 400,
      botLive: 350,
      botDead: 50,
      available: 500,
    };
    const msg = formatCapacityMessage(capacity);
    assert.ok(msg.includes('400'), 'should show botCreated');
    assert.ok(msg.includes('350'), 'should show botLive');
    assert.ok(msg.includes('50'), 'should show botDead');
    assert.ok(msg.includes('live'), 'should label live');
    assert.ok(msg.includes('dead'), 'should label dead');
  });

  await test('shows positive available capacity plainly', () => {
    const capacity: InviteCapacity = {
      total: 900,
      limit: 1000,
      botCreated: 800,
      botLive: 800,
      botDead: 0,
      available: 100,
    };
    const msg = formatCapacityMessage(capacity);
    assert.ok(msg.includes('100'), 'should show available capacity');
    // Should NOT have the "at or over limit" qualifier
    assert.ok(!msg.includes('at or over limit'), 'should not show over limit qualifier');
  });

  await test('shows negative available capacity with qualifier', () => {
    const capacity: InviteCapacity = {
      total: 1001,
      limit: 1000,
      botCreated: 902,
      botLive: 902,
      botDead: 0,
      available: -1,
    };
    const msg = formatCapacityMessage(capacity);
    assert.ok(msg.includes('-1'), 'should show negative available');
    assert.ok(msg.includes('at or over limit'), 'should indicate over limit');
  });

  await test('shows zero available capacity with qualifier', () => {
    const capacity: InviteCapacity = {
      total: 1000,
      limit: 1000,
      botCreated: 900,
      botLive: 900,
      botDead: 0,
      available: 0,
    };
    const msg = formatCapacityMessage(capacity);
    assert.ok(msg.includes('0'), 'should show zero available');
    assert.ok(msg.includes('at or over limit'), 'should indicate at limit');
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
