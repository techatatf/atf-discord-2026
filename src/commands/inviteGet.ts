import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { InviteRequest, queries } from '../db';
import { checkInvitePermissions } from '../invite/permissions';

export const data = new SlashCommandBuilder()
  .setName('invite-get')
  .setDescription('Retrieve a previous invite request by its ID')
  .addStringOption(option =>
    option.setName('request-id').setDescription('The request ID (e.g. 2026-04-13-epf)').setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const denied = checkInvitePermissions(interaction);
  if (denied) {
    await interaction.reply({ content: denied, ephemeral: true });
    return;
  }

  const requestId = interaction.options.getString('request-id', true);
  const row = queries.getInviteRequest.get(requestId) as unknown as InviteRequest | undefined;

  if (!row) {
    await interaction.reply({ content: `No invite request found with ID \`${requestId}\`.`, ephemeral: true });
    return;
  }

  if (row.mode === 'single') {
    await interaction.reply({
      content: [
        `**Invite Request** \`${row.request_id}\``,
        `Mode: Single`,
        `Link: ${row.output}`,
        `Reason: ${row.reason}`,
        `Requested by: ${row.requested_by_display_name} (${row.requested_by_username})`,
        `Requested at: ${row.requested_at}`,
      ].join('\n'),
      ephemeral: true,
    });
  } else {
    // Phase 2: bulk mode — will attach the file from UploadThing URL
    await interaction.reply({
      content: [
        `**Invite Request** \`${row.request_id}\``,
        `Mode: Bulk`,
        `Output: ${row.output}`,
        `Requested by: ${row.requested_by_display_name} (${row.requested_by_username})`,
        `Requested at: ${row.requested_at}`,
      ].join('\n'),
      ephemeral: true,
    });
  }
}
