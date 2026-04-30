import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { InviteRoleAssignment, queries } from '../db';
import { categorizeInvites, formatCapacityMessage, ServerInvite } from '../invite/lifecycle';
import { checkInvitePermissions } from '../invite/permissions';

export const data = new SlashCommandBuilder()
  .setName('invite-capacity')
  .setDescription('Show invite capacity and bot-created invite breakdown');

function toServerInvite(invite: { code: string; uses: number | null; maxUses: number | null; maxAge: number | null; createdTimestamp: number | null; expiresAt: Date | null }): ServerInvite {
  return {
    code: invite.code,
    uses: invite.uses ?? 0,
    maxUses: invite.maxUses ?? 0,
    maxAge: invite.maxAge ?? 0,
    createdTimestamp: invite.createdTimestamp,
    expiresTimestamp: invite.expiresAt ? invite.expiresAt.getTime() : null,
  };
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const denied = checkInvitePermissions(interaction);
  if (denied) {
    await interaction.reply({ content: denied, ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild!;

  let discordInvites;
  try {
    discordInvites = await guild.invites.fetch();
  } catch {
    await interaction.editReply('Failed to fetch invites from Discord.');
    return;
  }

  const serverInvites = [...discordInvites.values()].map(toServerInvite);

  let assignments: InviteRoleAssignment[];
  try {
    assignments = queries.getAllInviteRoleAssignments.all() as unknown as InviteRoleAssignment[];
  } catch {
    await interaction.editReply('Failed to fetch invite role assignments from database.');
    return;
  }

  const botCodes = new Set(assignments.map(a => a.invite_code));
  const result = categorizeInvites(serverInvites, botCodes);

  await interaction.editReply(formatCapacityMessage(result));
}
