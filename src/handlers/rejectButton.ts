import { ButtonInteraction, TextChannel } from 'discord.js';
import { config } from '../config';
import { MentorRequest, queries } from '../db';
import { buildDecidedApprovalEmbed } from '../embeds/approvalEmbed';

export async function handleRejectButton(interaction: ButtonInteraction, targetUserId: string): Promise<void> {
  await interaction.deferUpdate();

  const member = interaction.guild?.members.cache.get(interaction.user.id);
  const isStaff = member?.roles.cache.has(config.adminRoleId) || member?.roles.cache.has(config.modRoleId);

  if (!isStaff) {
    await interaction.followUp({ content: 'You do not have permission to reject mentor requests.', ephemeral: true });
    return;
  }

  const request = queries.getRequest.get(targetUserId) as unknown as MentorRequest | undefined;
  if (!request || request.status !== 'pending') {
    await interaction.followUp({ content: 'This request has already been decided.', ephemeral: true });
    return;
  }

  const decidedAt = new Date();
  // can_request_again = 0 by default on rejection; use /mentor-reset-request to re-enable
  queries.updateDecision.run(['rejected', interaction.user.id, decidedAt.toISOString(), 0, targetUserId]);

  const approvalsChannel = interaction.guild?.channels.cache.get(config.mentorApprovalsChannelId) as TextChannel | undefined;

  // DM the user
  const targetUser = await interaction.client.users.fetch(targetUserId).catch(() => null);
  if (targetUser) {
    const dmSent = await targetUser
      .send('Thank you for your interest in becoming a mentor. After reviewing your request, we have decided not to move forward at this time.')
      .then(() => true)
      .catch(() => false);

    if (!dmSent) {
      await approvalsChannel?.send(`⚠️ Could not send rejection DM to <@${targetUserId}>. They may have DMs disabled.`);
    }

    // Update the embed in place
    const requestedAt = new Date(request.requested_at);
    const { embed } = buildDecidedApprovalEmbed(targetUser, 'rejected', interaction.user, requestedAt, decidedAt);
    await interaction.editReply({ embeds: [embed], components: [] });
  } else {
    await approvalsChannel?.send(`⚠️ Could not fetch user <@${targetUserId}> to send rejection DM.`);
    await interaction.editReply({ components: [] });
  }
}
