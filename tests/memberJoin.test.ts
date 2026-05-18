import assert from 'node:assert/strict';
import { Database } from 'node-sqlite3-wasm';

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

function createTestDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE IF NOT EXISTS member_joins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id TEXT NOT NULL,
      invite_code TEXT,
      joined_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_member_joins_member_id ON member_joins(member_id);
  `);
  const insertMemberJoin = db.prepare(
    'INSERT INTO member_joins (member_id, invite_code, joined_at) VALUES (?, ?, ?)'
  );
  return { db, insertMemberJoin };
}

async function main() {
  console.log('memberJoin');

  await test('insert with invite code persists correctly', () => {
    const { db, insertMemberJoin } = createTestDb();
    insertMemberJoin.run(['user-123', 'abc123', '2026-05-18T12:00:00.000Z']);

    const rows = db.all('SELECT * FROM member_joins WHERE member_id = ?', ['user-123']);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].member_id, 'user-123');
    assert.equal(rows[0].invite_code, 'abc123');
    assert.equal(rows[0].joined_at, '2026-05-18T12:00:00.000Z');

    insertMemberJoin.finalize();
    db.close();
  });

  await test('insert with null invite code stores null', () => {
    const { db, insertMemberJoin } = createTestDb();
    insertMemberJoin.run(['user-456', null, '2026-05-18T13:00:00.000Z']);

    const rows = db.all('SELECT * FROM member_joins WHERE member_id = ?', ['user-456']);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].member_id, 'user-456');
    assert.equal(rows[0].invite_code, null);
    assert.equal(rows[0].joined_at, '2026-05-18T13:00:00.000Z');

    insertMemberJoin.finalize();
    db.close();
  });

  await test('rejoin creates a second row for the same member', () => {
    const { db, insertMemberJoin } = createTestDb();
    insertMemberJoin.run(['user-789', 'invite-a', '2026-01-01T00:00:00.000Z']);
    insertMemberJoin.run(['user-789', 'invite-b', '2026-06-01T00:00:00.000Z']);

    const rows = db.all('SELECT * FROM member_joins WHERE member_id = ? ORDER BY joined_at', ['user-789']);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].invite_code, 'invite-a');
    assert.equal(rows[1].invite_code, 'invite-b');

    insertMemberJoin.finalize();
    db.close();
  });
}

main();
