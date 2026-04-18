import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { InviteRoleAssignment, queries } from '../db';
import { checkInvitePermissions } from '../invite/permissions';

function parseInviteCode(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/(?:discord\.gg\/|discordapp\.com\/invite\/)([A-Za-z0-9-]+)/);
  return match ? match[1] : trimmed;
}

export const data = new SlashCommandBuilder()
  .setName('invite-status')
  .setDescription('Check the live status of a Discord invite')
  .addStringOption(option =>
    option.setName('invite').setDescription('Invite code or URL (e.g. abc123 or https://discord.gg/abc123)').setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const denied = checkInvitePermissions(interaction);
  if (denied) {
    await interaction.reply({ content: denied, ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const code = parseInviteCode(interaction.options.getString('invite', true));
  const guild = interaction.guild!;

  let invite;
  try {
    const invites = await guild.invites.fetch();
    invite = invites.get(code);
  } catch {
    await interaction.editReply('Failed to fetch invites from Discord.');
    return;
  }

  if (!invite) {
    await interaction.editReply(`No invite found with code \`${code}\`. It may have been deleted or expired.`);
    return;
  }

  const uses = invite.uses ?? 0;
  const maxUses = invite.maxUses ?? 0;
  const expiresAt = invite.expiresAt;

  let status: string;
  if (maxUses > 0 && uses >= maxUses) {
    status = 'Fully used';
  } else if (expiresAt && expiresAt.getTime() < Date.now()) {
    status = 'Expired';
  } else {
    status = 'Active';
  }

  const lines = [
    `**Invite Status** \`${code}\``,
    `Status: ${status}`,
    `Uses: ${uses}${maxUses > 0 ? ` / ${maxUses}` : ' (unlimited)'}`,
    `Expires: ${expiresAt ? `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>` : 'Never'}`,
    `Channel: ${invite.channel?.name ?? 'Unknown'}`,
  ];

  const assignment = queries.getInviteRoleAssignment.get(code) as unknown as InviteRoleAssignment | undefined;
  if (assignment) {
    const role = guild.roles.cache.get(assignment.role_id);
    lines.push(`Auto-assigns role: ${role ? role.name : `<unknown:${assignment.role_id}>`}`);
  }

  await interaction.editReply(lines.join('\n'));
}
