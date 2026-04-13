import { AttachmentBuilder, ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
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
    const info = [
      `**Invite Request** \`${row.request_id}\``,
      `Mode: Bulk`,
      `Requested by: ${row.requested_by_display_name} (${row.requested_by_username})`,
      `Requested at: ${row.requested_at}`,
    ].join('\n');

    if (row.output) {
      try {
        const response = await fetch(row.output);
        const csvBuffer = Buffer.from(await response.arrayBuffer());
        const file = new AttachmentBuilder(csvBuffer, { name: `invite-bulk-${row.request_id}.csv` });
        await interaction.reply({ content: info, files: [file], ephemeral: true });
      } catch {
        await interaction.reply({ content: `${info}\n\nFailed to fetch the output file. URL: ${row.output}`, ephemeral: true });
      }
    } else {
      await interaction.reply({ content: `${info}\n\nNo output file available.`, ephemeral: true });
    }
  }
}
