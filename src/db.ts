import fs from 'fs';
import path from 'path';
import { Database } from 'node-sqlite3-wasm';

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'mentor.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS mentor_requests (
    user_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'pending',
    can_request_again INTEGER NOT NULL DEFAULT 1,
    approval_message_id TEXT,
    decided_by TEXT,
    requested_at TEXT NOT NULL,
    decided_at TEXT
  );

  CREATE TABLE IF NOT EXISTS bot_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS invite_requests (
    request_id TEXT PRIMARY KEY,
    mode TEXT NOT NULL,
    requested_by_display_name TEXT NOT NULL,
    requested_by_username TEXT NOT NULL,
    requested_by_roles TEXT NOT NULL,
    reason TEXT,
    output TEXT,
    requested_at TEXT NOT NULL
  );
`);

export type RequestStatus = 'pending' | 'approved' | 'rejected';
export type InviteMode = 'single' | 'bulk';

export interface InviteRequest {
  request_id: string;
  mode: InviteMode;
  requested_by_display_name: string;
  requested_by_username: string;
  requested_by_roles: string;
  reason: string | null;
  output: string | null;
  requested_at: string;
}

export interface MentorRequest {
  user_id: string;
  status: RequestStatus;
  can_request_again: number; // 1 = true, 0 = false (SQLite has no boolean)
  approval_message_id: string | null;
  decided_by: string | null;
  requested_at: string;
  decided_at: string | null;
}

export const queries = {
  getRequest: db.prepare('SELECT * FROM mentor_requests WHERE user_id = ?'),

  upsertRequest: db.prepare(`
    INSERT INTO mentor_requests (user_id, status, can_request_again, approval_message_id, requested_at)
    VALUES (?, 'pending', 0, NULL, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      status = 'pending',
      can_request_again = 0,
      approval_message_id = NULL,
      decided_by = NULL,
      requested_at = excluded.requested_at,
      decided_at = NULL
  `),

  setApprovalMessageId: db.prepare(`
    UPDATE mentor_requests SET approval_message_id = ? WHERE user_id = ?
  `),

  updateDecision: db.prepare(`
    UPDATE mentor_requests
    SET status = ?, decided_by = ?, decided_at = ?, can_request_again = ?
    WHERE user_id = ?
  `),

  // Future slash commands:
  // /mentor-approve <user>   — approve a user without buttons
  // /mentor-reject <user>    — reject a user without buttons
  // /mentor-reset-request <user> — set can_request_again = 1 so a rejected user can reapply
  // /mentor-status <user>    — view a user's current request status
  // /mentor-list             — list all pending requests

  getBotState: db.prepare('SELECT value FROM bot_state WHERE key = ?'),

  setBotState: db.prepare(`
    INSERT INTO bot_state (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `),

  getInviteRequest: db.prepare('SELECT * FROM invite_requests WHERE request_id = ?'),

  insertInviteRequest: db.prepare(`
    INSERT INTO invite_requests (request_id, mode, requested_by_display_name, requested_by_username, requested_by_roles, reason, output, requested_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),

  inviteRequestExists: db.prepare('SELECT 1 FROM invite_requests WHERE request_id = ?'),
};

function shutdown() {
  for (const stmt of Object.values(queries)) {
    stmt.finalize();
  }
  db.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export default db;
