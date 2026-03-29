import { ButtonInteraction, TextChannel } from 'discord.js';
import { config } from '../config';
import { MentorRequest, queries } from '../db';
import { buildPendingApprovalEmbed } from '../embeds/approvalEmbed';

export async function handleRequestButton(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const userId = interaction.user.id;
  const existing = queries.getRequest.get(userId) as MentorRequest | undefined;

  if (existing) {
    if (existing.status === 'approved') {
      await interaction.editReply({ content: 'Your mentor request has already been approved. Welcome to the team!' });
      return;
    }
    if (existing.status === 'pending') {
      await interaction.editReply({ content: 'You already have a pending mentor request. We will reach out to you once a decision has been made.' });
      return;
    }
    if (existing.status === 'rejected' && !existing.can_request_again) {
      await interaction.editReply({ content: 'Your previous mentor request was not approved. You are not currently eligible to re-apply.' });
      return;
    }
  }

  const requestedAt = new Date();
  queries.upsertRequest.run(userId, requestedAt.toISOString());

  const approvalsChannel = interaction.guild?.channels.cache.get(config.mentorApprovalsChannelId) as TextChannel | undefined;
  if (!approvalsChannel) {
    await interaction.editReply({ content: 'Something went wrong while submitting your request. Please contact an admin.' });
    return;
  }

  const { embed, row } = buildPendingApprovalEmbed(interaction.user, requestedAt);
  const approvalMessage = await approvalsChannel.send({ embeds: [embed], components: [row] });

  queries.setApprovalMessageId.run(approvalMessage.id, userId);

  await interaction.editReply({ content: 'Your mentor request has been submitted! Our team will review it and reach out to you via DM.' });
}
