import fs from 'fs';
import path from 'path';
import { Database } from 'node-sqlite3-wasm';

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'bot.db'));

db.exec(`
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

  CREATE TABLE IF NOT EXISTS invite_role_assignments (
    invite_code TEXT PRIMARY KEY,
    role_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

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

export interface InviteRoleAssignment {
  invite_code: string;
  role_id: string;
  request_id: string;
  created_at: string;
}

export const queries = {
  getInviteRequest: db.prepare('SELECT * FROM invite_requests WHERE request_id = ?'),

  insertInviteRequest: db.prepare(`
    INSERT INTO invite_requests (request_id, mode, requested_by_display_name, requested_by_username, requested_by_roles, reason, output, requested_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),

  inviteRequestExists: db.prepare('SELECT 1 FROM invite_requests WHERE request_id = ?'),

  getInviteRoleAssignment: db.prepare('SELECT * FROM invite_role_assignments WHERE invite_code = ?'),

  getInviteRoleAssignmentsByRequest: db.prepare('SELECT * FROM invite_role_assignments WHERE request_id = ?'),

  insertInviteRoleAssignment: db.prepare(`
    INSERT INTO invite_role_assignments (invite_code, role_id, request_id, created_at)
    VALUES (?, ?, ?, ?)
  `),
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
