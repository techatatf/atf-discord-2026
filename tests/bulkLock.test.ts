import assert from 'node:assert/strict';
import { acquireBulkLock, releaseBulkLock, isBulkLocked } from '../src/invite/bulkLock';

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
  console.log('bulkLock');

  await test('initially no guild is locked', () => {
    assert.equal(isBulkLocked('guild-1'), false);
  });

  await test('acquireBulkLock locks a guild', () => {
    acquireBulkLock('guild-2');
    assert.equal(isBulkLocked('guild-2'), true);
    // cleanup
    releaseBulkLock('guild-2');
  });

  await test('releaseBulkLock unlocks a guild', () => {
    acquireBulkLock('guild-3');
    releaseBulkLock('guild-3');
    assert.equal(isBulkLocked('guild-3'), false);
  });

  await test('locking one guild does not affect another', () => {
    acquireBulkLock('guild-4');
    assert.equal(isBulkLocked('guild-5'), false);
    // cleanup
    releaseBulkLock('guild-4');
  });

  await test('releaseBulkLock is idempotent (no error on double release)', () => {
    acquireBulkLock('guild-6');
    releaseBulkLock('guild-6');
    releaseBulkLock('guild-6'); // should not throw
    assert.equal(isBulkLocked('guild-6'), false);
  });
}

main();
