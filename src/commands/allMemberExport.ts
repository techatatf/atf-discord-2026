import { AttachmentBuilder, ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { checkInvitePermissions } from '../invite/permissions';

export interface MemberRecord {
  username: string;
  displayName: string;
  userId: string;
  joinedAt: Date | null;
  roles: string[];
  inviteCode?: string;
  inviteRole?: string;
  requestedBy?: string;
  reason?: string;
}

const HEADER = 'username,displayName,userId,joinedAt,roles,inviteCode,inviteRole,requestedBy,reason';

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatRoles(roles: string[]): string {
  return roles
    .map(r => (r.includes(';') || r.includes('"')) ? `"${r.replace(/"/g, '""')}"` : r)
    .join(';');
}

export interface LatestJoinRow {
  member_id: string;
  invite_code: string | null;
  role_id: string | null;
  request_id: string | null;
  requested_by_username: string | null;
  reason: string | null;
}

export function enrichMembersWithInviteMetadata(
  members: MemberRecord[],
  joinMetadata: LatestJoinRow[],
  roleNames: Map<string, string>,
): MemberRecord[] {
  const byMember = new Map<string, LatestJoinRow>();
  for (const row of joinMetadata) {
    byMember.set(row.member_id, row);
  }
  return members.map(m => {
    const join = byMember.get(m.userId);
    if (!join || !join.invite_code) return m;
    return {
      ...m,
      inviteCode: join.invite_code,
      inviteRole: join.role_id ? (roleNames.get(join.role_id) ?? join.role_id) : undefined,
      requestedBy: join.requested_by_username ?? undefined,
      reason: join.reason ?? undefined,
    };
  });
}

export type TimeUnit = 'hour' | 'day' | 'week' | 'month';

const UNIT_MS: Record<TimeUnit, number> = {
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

export function exportFilename(mode: 'full'): string;
export function exportFilename(mode: 'filtered', unit: TimeUnit, amount: number): string;
export function exportFilename(mode: 'full' | 'filtered', unit?: TimeUnit, amount?: number): string {
  if (mode === 'full') return 'members-full.csv';
  const plural = amount! > 1 ? `${unit!}s` : unit!;
  return `members-last-${amount!}-${plural}.csv`;
}

export function filterMembersByWindow(
  members: MemberRecord[],
  unit: TimeUnit,
  amount: number,
  now: Date = new Date(),
): MemberRecord[] {
  const cutoff = new Date(now.getTime() - amount * UNIT_MS[unit]);
  return members.filter(m => m.joinedAt !== null && m.joinedAt >= cutoff);
}

export function sortMembers(members: MemberRecord[]): MemberRecord[] {
  return [...members].sort((a, b) => {
    if (a.joinedAt === null && b.joinedAt === null) return 0;
    if (a.joinedAt === null) return 1;
    if (b.joinedAt === null) return -1;
    return a.joinedAt.getTime() - b.joinedAt.getTime();
  });
}

export function buildMemberCsv(members: MemberRecord[]): string {
  const lines = [HEADER];
  for (const m of members) {
    const joinedAt = m.joinedAt ? m.joinedAt.toISOString() : '';
    const roles = formatRoles(m.roles);
    lines.push([
      escapeCsvField(m.username),
      escapeCsvField(m.displayName),
      m.userId,
      joinedAt,
      escapeCsvField(roles),
      escapeCsvField(m.inviteCode ?? ''),
      escapeCsvField(m.inviteRole ?? ''),
      escapeCsvField(m.requestedBy ?? ''),
      escapeCsvField(m.reason ?? ''),
    ].join(','));
  }
  return lines.join('\n');
}

export const data = new SlashCommandBuilder()
  .setName('all-member-export')
  .setDescription('Export all server members as a CSV file')
  .addSubcommand(sub =>
    sub.setName('full').setDescription('Export all non-bot members sorted by join date'),
  )
  .addSubcommand(sub =>
    sub
      .setName('filtered')
      .setDescription('Export members who joined within a recent time window')
      .addStringOption(opt =>
        opt
          .setName('unit')
          .setDescription('Time unit')
          .setRequired(true)
          .addChoices(
            { name: 'hour', value: 'hour' },
            { name: 'day', value: 'day' },
            { name: 'week', value: 'week' },
            { name: 'month', value: 'month' },
          ),
      )
      .addIntegerOption(opt =>
        opt.setName('amount').setDescription('Number of units (default: 1)').setMinValue(1),
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const denied = checkInvitePermissions(interaction);
  if (denied) {
    await interaction.reply({ content: denied, ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild!;

  const fetched = await guild.members.fetch();
  const members: MemberRecord[] = [...fetched.values()]
    .filter(m => !m.user.bot)
    .map(m => ({
      username: m.user.username,
      displayName: m.displayName,
      userId: m.user.id,
      joinedAt: m.joinedAt,
      roles: m.roles.cache
        .filter(r => r.name !== '@everyone')
        .map(r => r.name),
    }));

  const { queries } = require('../db') as typeof import('../db');
  const roleNames = new Map(guild.roles.cache.map(r => [r.id, r.name]));
  const joinMetadata = queries.getLatestJoinsWithMetadata.all() as unknown as LatestJoinRow[];
  const enriched = enrichMembersWithInviteMetadata(members, joinMetadata, roleNames);

  const sorted = sortMembers(enriched);
  const subcommand = interaction.options.getSubcommand();

  let result: MemberRecord[];
  let filename: string;

  if (subcommand === 'filtered') {
    const unit = interaction.options.getString('unit', true) as TimeUnit;
    const amount = interaction.options.getInteger('amount') ?? 1;
    result = filterMembersByWindow(sorted, unit, amount);
    filename = exportFilename('filtered', unit, amount);
  } else {
    result = sorted;
    filename = exportFilename('full');
  }

  const csv = buildMemberCsv(result);
  const attachment = new AttachmentBuilder(Buffer.from(csv, 'utf-8'), { name: filename });
  await interaction.editReply({ files: [attachment] });
}
