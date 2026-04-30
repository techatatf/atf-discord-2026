import { CsvRow, InviteRole } from './csv';

export interface InviteCreator {
  createInvite(options: { maxUses: number; maxAge: number; unique: boolean }): Promise<{ code: string; url: string }>;
}

export interface BulkInviteRunResult {
  links: (string | null)[];
  created: number;
  skipped: number;
  failed: number;
  roleAssignments: { inviteCode: string; role: InviteRole }[];
  firstError: { row: number; message: string } | null;
  stoppedReason: 'consecutive-errors' | 'cancelled' | null;
}

export interface BulkInviteLoopOptions {
  consecutiveErrorLimit?: number;
  shouldCancel?: () => boolean;
}

const DEFAULT_CONSECUTIVE_ERROR_LIMIT = 3;

/**
 * Iterates rows and creates one invite per row (skipping rows with an existing link).
 * Pure against the database — the caller persists role assignments from the result.
 * Isolated from config/db imports so it can be unit-tested without env setup.
 *
 * Circuit breaker: stops after N consecutive failures (default 3).
 * Returns firstError with 1-based row number and error message.
 */
export async function runBulkInviteLoop(
  channel: InviteCreator,
  rows: CsvRow[],
  onProgress?: (index: number, total: number) => void,
  options?: BulkInviteLoopOptions,
): Promise<BulkInviteRunResult> {
  const consecutiveErrorLimit = options?.consecutiveErrorLimit ?? DEFAULT_CONSECUTIVE_ERROR_LIMIT;
  const shouldCancel = options?.shouldCancel;

  const links: (string | null)[] = [];
  const roleAssignments: { inviteCode: string; role: InviteRole }[] = [];
  let created = 0;
  let skipped = 0;
  let failed = 0;
  let consecutiveErrors = 0;
  let firstError: { row: number; message: string } | null = null;
  let stoppedReason: 'consecutive-errors' | 'cancelled' | null = null;

  for (let i = 0; i < rows.length; i++) {
    if (shouldCancel?.()) {
      stoppedReason = 'cancelled';
      break;
    }

    const row = rows[i];
    onProgress?.(i, rows.length);

    if (row.existingLink) {
      links.push(null);
      skipped++;
      continue;
    }

    try {
      const invite = await channel.createInvite({
        maxUses: row.maxUses,
        maxAge: row.maxAge * 86400,
        unique: true,
      });
      links.push(invite.url);
      created++;
      consecutiveErrors = 0;
      roleAssignments.push({ inviteCode: invite.code, role: row.role });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[invite-bulk] Row ${i + 1} failed — reason: "${row.reason}", maxUses: ${row.maxUses}, maxAge: ${row.maxAge}d, role: ${row.role} — error: ${errMsg}`);
      links.push(null);
      failed++;
      consecutiveErrors++;

      if (!firstError) {
        firstError = { row: i + 1, message: errMsg };
      }

      if (consecutiveErrors >= consecutiveErrorLimit) {
        stoppedReason = 'consecutive-errors';
        break;
      }
    }
  }

  return { links, created, skipped, failed, roleAssignments, firstError, stoppedReason };
}
