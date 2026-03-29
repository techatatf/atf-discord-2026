import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

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
`);

export type RequestStatus = 'pending' | 'approved' | 'rejected';

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
  getRequest: db.prepare<[string], MentorRequest>('SELECT * FROM mentor_requests WHERE user_id = ?'),

  upsertRequest: db.prepare<[string, string]>(`
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

  setApprovalMessageId: db.prepare<[string, string]>(`
    UPDATE mentor_requests SET approval_message_id = ? WHERE user_id = ?
  `),

  updateDecision: db.prepare<[string, string, string, number, string]>(`
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

  getBotState: db.prepare<[string], { value: string }>('SELECT value FROM bot_state WHERE key = ?'),

  setBotState: db.prepare<[string, string]>(`
    INSERT INTO bot_state (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `),
};

export default db;
