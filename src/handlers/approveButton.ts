import { ButtonInteraction, TextChannel } from 'discord.js';
import { config } from '../config';
import { MentorRequest, queries } from '../db';
import { buildDecidedApprovalEmbed } from '../embeds/approvalEmbed';

export async function handleApproveButton(interaction: ButtonInteraction, targetUserId: string): Promise<void> {
  await interaction.deferUpdate();

  const member = interaction.guild?.members.cache.get(interaction.user.id);
  const isStaff = member?.roles.cache.has(config.adminRoleId) || member?.roles.cache.has(config.modRoleId);

  if (!isStaff) {
    await interaction.followUp({ content: 'You do not have permission to approve mentor requests.', ephemeral: true });
    return;
  }

  const request = queries.getRequest.get(targetUserId) as MentorRequest | undefined;
  if (!request || request.status !== 'pending') {
    await interaction.followUp({ content: 'This request has already been decided.', ephemeral: true });
    return;
  }

  const decidedAt = new Date();
  queries.updateDecision.run('approved', interaction.user.id, decidedAt.toISOString(), 0, targetUserId);

  const approvalsChannel = interaction.guild?.channels.cache.get(config.mentorApprovalsChannelId) as TextChannel | undefined;

  // Assign Mentor role
  const targetMember = await interaction.guild?.members.fetch(targetUserId).catch(() => null);
  if (targetMember) {
    await targetMember.roles.add(config.mentorRoleId).catch(async (err: Error) => {
      await approvalsChannel?.send(`⚠️ Failed to assign Mentor role to <@${targetUserId}>: ${err.message}`);
    });
  } else {
    await approvalsChannel?.send(`⚠️ Could not find member <@${targetUserId}> to assign Mentor role. They may have left the server.`);
  }

  // DM the user
  const targetUser = await interaction.client.users.fetch(targetUserId).catch(() => null);
  if (targetUser) {
    const dmSent = await targetUser
      .send('Congratulations! 🎉 Your mentor request has been approved. You now have access to #mentor-general. Welcome to the team!')
      .then(() => true)
      .catch(() => false);

    if (!dmSent) {
      await approvalsChannel?.send(`⚠️ Could not send approval DM to <@${targetUserId}>. They may have DMs disabled.`);
    }

    // Update the embed in place
    const requestedAt = new Date(request.requested_at);
    const { embed } = buildDecidedApprovalEmbed(targetUser, 'approved', interaction.user, requestedAt, decidedAt);
    await interaction.editReply({ embeds: [embed], components: [] });
  } else {
    await approvalsChannel?.send(`⚠️ Could not fetch user <@${targetUserId}> to send approval DM.`);
    await interaction.editReply({ components: [] });
  }
}
