import { ChatInputCommandInteraction, GuildMember, SlashCommandBuilder } from 'discord.js';
import { createSingleInvite } from '../invite/core';
import { checkInvitePermissions } from '../invite/permissions';

export const data = new SlashCommandBuilder()
  .setName('invite-create')
  .setDescription('Create a single invite link to the rules channel')
  .addStringOption(option =>
    option.setName('reason').setDescription('Reason for the invite').setRequired(true)
  )
  .addIntegerOption(option =>
    option.setName('max-uses').setDescription('Maximum number of uses (default: 1)').setRequired(false)
  )
  .addIntegerOption(option =>
    option.setName('max-age').setDescription('Link expiry in days (default: 7)').setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const denied = checkInvitePermissions(interaction);
  if (denied) {
    await interaction.reply({ content: denied, ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const member = interaction.member as GuildMember;

  const reason = interaction.options.getString('reason', true);
  const maxUses = interaction.options.getInteger('max-uses') ?? undefined;
  const maxAge = interaction.options.getInteger('max-age') ?? undefined;

  try {
    const result = await createSingleInvite(
      interaction.guild!,
      { reason, maxUses, maxAge },
      {
        displayName: member.displayName,
        username: member.user.username,
        roles: member.roles.cache.map(r => r.name),
      },
    );

    await interaction.editReply(
      `**Invite Created**\nLink: ${result.inviteUrl}\nRequest ID: \`${result.requestId}\`\nReason: ${reason}`
    );

    // DM receipt
    await interaction.user.send(
      `**Invite Request Receipt**\nRequest ID: \`${result.requestId}\`\nReason: ${reason}`
    ).catch(() => {
      // DMs may be disabled — non-critical
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    await interaction.editReply(message);
  }
}
