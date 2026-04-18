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
}

/**
 * Iterates rows and creates one invite per row (skipping rows with an existing link).
 * Pure against the database — the caller persists role assignments from the result.
 * Isolated from config/db imports so it can be unit-tested without env setup.
 */
export async function runBulkInviteLoop(
  channel: InviteCreator,
  rows: CsvRow[],
  onProgress?: (index: number, total: number) => void,
): Promise<BulkInviteRunResult> {
  const links: (string | null)[] = [];
  const roleAssignments: { inviteCode: string; role: InviteRole }[] = [];
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i++) {
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
      roleAssignments.push({ inviteCode: invite.code, role: row.role });
    } catch {
      links.push(null);
      failed++;
    }
  }

  return { links, created, skipped, failed, roleAssignments };
}
