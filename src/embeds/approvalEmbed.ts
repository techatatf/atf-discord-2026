import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, User } from 'discord.js';

export function buildPendingApprovalEmbed(
  user: User,
  requestedAt: Date
): { embed: EmbedBuilder; row: ActionRowBuilder<ButtonBuilder> } {
  const embed = new EmbedBuilder()
    .setTitle('New Mentor Request')
    .setDescription(`<@${user.id}> has requested to become a mentor.`)
    .addFields(
      { name: 'Username', value: user.tag, inline: true },
      { name: 'User ID', value: user.id, inline: true },
      { name: 'Requested At', value: `<t:${Math.floor(requestedAt.getTime() / 1000)}:F>`, inline: false }
    )
    .setThumbnail(user.displayAvatarURL())
    .setColor(0xfee75c) // yellow = pending
    .setFooter({ text: 'Awaiting decision' });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`mentor_approve:${user.id}`)
      .setLabel('Approve')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`mentor_reject:${user.id}`)
      .setLabel('Reject')
      .setStyle(ButtonStyle.Danger)
  );

  return { embed, row };
}

export function buildDecidedApprovalEmbed(
  user: User,
  status: 'approved' | 'rejected',
  decidedBy: User,
  requestedAt: Date,
  decidedAt: Date
): { embed: EmbedBuilder } {
  const isApproved = status === 'approved';

  const embed = new EmbedBuilder()
    .setTitle('Mentor Request')
    .setDescription(`<@${user.id}> requested to become a mentor.`)
    .addFields(
      { name: 'Username', value: user.tag, inline: true },
      { name: 'User ID', value: user.id, inline: true },
      { name: '\u200b', value: '\u200b', inline: true }, // spacer
      { name: 'Requested At', value: `<t:${Math.floor(requestedAt.getTime() / 1000)}:F>`, inline: true },
      { name: 'Decision', value: isApproved ? '✅ Approved' : '❌ Rejected', inline: true },
      { name: 'Decided At', value: `<t:${Math.floor(decidedAt.getTime() / 1000)}:F>`, inline: true }
    )
    .setThumbnail(user.displayAvatarURL())
    .setColor(isApproved ? 0x57f287 : 0xed4245) // green or red
    .setFooter({ text: `${isApproved ? 'Approved' : 'Rejected'} by ${decidedBy.tag}` });

  return { embed };
}
