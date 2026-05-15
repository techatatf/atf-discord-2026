import { AttachmentBuilder, ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { checkInvitePermissions } from '../invite/permissions';

export interface MemberRecord {
  username: string;
  displayName: string;
  userId: string;
  joinedAt: Date | null;
  roles: string[];
}

const HEADER = 'username,displayName,userId,joinedAt,roles';

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
    ].join(','));
  }
  return lines.join('\n');
}

export const data = new SlashCommandBuilder()
  .setName('all-member-export')
  .setDescription('Export all server members as a CSV file');

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

  const csv = buildMemberCsv(members);
  const attachment = new AttachmentBuilder(Buffer.from(csv, 'utf-8'), { name: 'members.csv' });
  await interaction.editReply({ files: [attachment] });
}
