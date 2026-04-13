import { AttachmentBuilder, ChatInputCommandInteraction, GuildMember, SlashCommandBuilder } from 'discord.js';
import { UTApi, UTFile } from 'uploadthing/server';
import { config } from '../config';
import { queries } from '../db';
import { generateRequestId } from '../invite/core';
import { buildOutputCsv, parseCsv } from '../invite/csv';
import { checkInvitePermissions } from '../invite/permissions';

export const data = new SlashCommandBuilder()
  .setName('invite-create-bulk')
  .setDescription('Create invite links in bulk from a CSV file')
  .addAttachmentOption(option =>
    option.setName('file').setDescription('CSV file with invite details').setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const denied = checkInvitePermissions(interaction);
  if (denied) {
    await interaction.reply({ content: denied, ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const member = interaction.member as GuildMember;

  const attachment = interaction.options.getAttachment('file', true);
  if (!attachment.name.endsWith('.csv')) {
    await interaction.editReply('File must be a .csv file.');
    return;
  }

  // Fetch the CSV content
  const response = await fetch(attachment.url);
  if (!response.ok) {
    await interaction.editReply('Failed to download the attached file.');
    return;
  }
  const csvContent = await response.text();

  // Parse and validate
  const { rows, errors } = parseCsv(csvContent);
  if (errors.length > 0) {
    const errorList = errors.slice(0, 15).join('\n');
    const suffix = errors.length > 15 ? `\n...and ${errors.length - 15} more errors.` : '';
    await interaction.editReply(`**Validation failed:**\n${errorList}${suffix}`);
    return;
  }

  if (rows.length === 0) {
    await interaction.editReply('CSV has no data rows to process.');
    return;
  }

  // Create invites row by row
  const channel = interaction.guild!.channels.cache.get(config.generalRulesChannelId);
  if (!channel || !('createInvite' in channel)) {
    await interaction.editReply(`Could not find or use the rules channel (ID: ${config.generalRulesChannelId}).`);
    return;
  }

  const links: (string | null)[] = [];
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    if (row.existingLink) {
      links.push(null); // existing link is preserved in buildOutputCsv
      skipped++;
      continue;
    }

    try {
      const invite = await (channel as any).createInvite({
        maxUses: row.maxUses,
        maxAge: row.maxAge * 86400,
        unique: true,
      });
      links.push(invite.url);
      created++;
    } catch {
      links.push(null);
      failed++;
    }
  }

  // Build output CSV
  const outputCsv = buildOutputCsv(rows, links);
  const requestId = generateRequestId();

  // Upload to UploadThing
  const utapi = new UTApi();
  const utFile = new UTFile([outputCsv], `invite-bulk-${requestId}.csv`);
  const uploadResult = await utapi.uploadFiles(utFile);

  const uploadUrl = uploadResult.data?.ufsUrl ?? null;

  // Record in database
  queries.insertInviteRequest.run([
    requestId,
    'bulk',
    member.displayName,
    member.user.username,
    member.roles.cache.map(r => r.name).join(', '),
    attachment.name,
    uploadUrl,
    new Date().toISOString(),
  ]);

  // Reply with the CSV attached
  const csvBuffer = Buffer.from(outputCsv, 'utf-8');
  const discordFile = new AttachmentBuilder(csvBuffer, { name: `invite-bulk-${requestId}.csv` });

  let summary = `**Bulk Invite Complete**\nRequest ID: \`${requestId}\`\nCreated: ${created}`;
  if (skipped > 0) summary += ` | Skipped (existing): ${skipped}`;
  if (failed > 0) summary += ` | Failed: ${failed}`;

  await interaction.editReply({ content: summary, files: [discordFile] });

  // DM receipt
  await interaction.user.send(
    `**Invite Request Receipt**\nRequest ID: \`${requestId}\`\nFile: ${attachment.name}\nCreated: ${created}${failed > 0 ? ` | Failed: ${failed}` : ''}`
  ).catch(() => {});
}
