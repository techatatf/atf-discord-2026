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

  CREATE TABLE IF NOT EXISTS member_joins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id TEXT NOT NULL,
    invite_code TEXT,
    joined_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_member_joins_member_id ON member_joins(member_id);
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

  getAllInviteRoleAssignments: db.prepare('SELECT * FROM invite_role_assignments'),

  insertMemberJoin: db.prepare(
    'INSERT INTO member_joins (member_id, invite_code, joined_at) VALUES (?, ?, ?)'
  ),

  getLatestJoinsWithMetadata: db.prepare(`
    SELECT mj.member_id, mj.invite_code, ira.role_id, ira.request_id,
           ir.requested_by_username, ir.reason
    FROM member_joins mj
    INNER JOIN (
      SELECT member_id, MAX(id) AS max_id FROM member_joins GROUP BY member_id
    ) latest ON mj.id = latest.max_id
    LEFT JOIN invite_role_assignments ira ON mj.invite_code = ira.invite_code
    LEFT JOIN invite_requests ir ON ira.request_id = ir.request_id
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
