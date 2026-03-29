import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

export function buildRequestEmbed(): { embed: EmbedBuilder; row: ActionRowBuilder<ButtonBuilder> } {
  const embed = new EmbedBuilder()
    .setTitle('Become a Mentor')
    .setDescription(
      'Interested in mentoring members of this community?\n\n' +
      'If you would like to apply, click the button below. ' +
      'Our team will review your request and reach out to you directly.'
    )
    .setColor(0x5865f2)
    .setFooter({ text: 'Most members should ignore this — only apply if you intend to mentor.' });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('mentor_request')
      .setLabel('Request to be a Mentor')
      .setStyle(ButtonStyle.Primary)
  );

  return { embed, row };
}
