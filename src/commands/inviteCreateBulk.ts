import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, GuildMember, SlashCommandBuilder } from 'discord.js';
import { UTApi, UTFile } from 'uploadthing/server';
import { config } from '../config';
import { queries } from '../db';
import { runBulkInviteLoop } from '../invite/bulk';
import { generateRequestId, resolveRoleId } from '../invite/core';
import { buildOutputCsv, parseCsv } from '../invite/csv';
import { checkInvitePermissions } from '../invite/permissions';
import { addInviteToCache } from '../invite/tracking';

const UPLOAD_TIMEOUT_MS = 30_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

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

  const requestId = generateRequestId();
  const now = new Date().toISOString();

  console.log(`[invite-bulk ${requestId}] Starting loop for ${rows.length} rows.`);
  await interaction.user.send(
    `**Bulk Invite Started**\nRequest ID: \`${requestId}\`\nFile: ${attachment.name}\nRows: ${rows.length}`
  ).catch(() => {});

  const cancelId = `cancel-bulk-${requestId}`;
  const cancelRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(cancelId).setLabel('Cancel').setStyle(ButtonStyle.Danger),
  );

  await interaction.editReply({ content: `Processing invites... 0/${rows.length}`, components: [cancelRow] });

  let cancelled = false;
  const reply = await interaction.fetchReply();
  const collector = reply.createMessageComponentCollector({ time: 600_000 });
  collector.on('collect', async (i) => {
    cancelled = true;
    await i.update({ content: 'Cancelling...', components: [] });
  });

  const loopStart = Date.now();

  const { links, created, skipped, failed, roleAssignments } = await runBulkInviteLoop(
    channel as any,
    rows,
    (i, total) => {
      if (i > 0 && i % 25 === 0 && !cancelled) {
        console.log(`[invite-bulk ${requestId}] Progress: ${i}/${total}`);
        interaction.editReply({ content: `Processing invites... ${i}/${total}`, components: [cancelRow] }).catch(() => {});
      }
    },
    () => cancelled,
  );

  collector.stop();

  for (const a of roleAssignments) {
    queries.insertInviteRoleAssignment.run([a.inviteCode, resolveRoleId(a.role), requestId, now]);
    addInviteToCache(interaction.guild!.id, a.inviteCode, 0);
  }
  const roleMappings = roleAssignments.length;

  console.log(`[invite-bulk ${requestId}] Loop done in ${Date.now() - loopStart}ms. created=${created} skipped=${skipped} failed=${failed}`);

  // Build output CSV
  const outputCsv = buildOutputCsv(rows, links);

  // Upload to UploadThing (with timeout so a bad token / hanging upload can't stall the interaction)
  let uploadUrl: string | null = null;
  try {
    const utapi = new UTApi();
    const utFile = new UTFile([outputCsv], `invite-bulk-${requestId}.csv`);
    const uploadResult = await withTimeout(utapi.uploadFiles(utFile), UPLOAD_TIMEOUT_MS, 'UploadThing upload');
    uploadUrl = uploadResult.data?.ufsUrl ?? null;
  } catch (err) {
    console.error(`[invite-bulk ${requestId}] Upload failed:`, err);
  }

  // Record in database
  queries.insertInviteRequest.run([
    requestId,
    'bulk',
    member.displayName,
    member.user.username,
    member.roles.cache.map(r => r.name).join(', '),
    attachment.name,
    uploadUrl,
    now,
  ]);

  // Reply with the CSV attached
  const csvBuffer = Buffer.from(outputCsv, 'utf-8');
  const discordFile = new AttachmentBuilder(csvBuffer, { name: `invite-bulk-${requestId}.csv` });

  const status = cancelled ? 'Cancelled' : 'Complete';
  let summary = `**Bulk Invite ${status}**\nRequest ID: \`${requestId}\`\nCreated: ${created}`;
  if (cancelled) summary += `/${rows.length}`;
  if (skipped > 0) summary += ` | Skipped (existing): ${skipped}`;
  if (failed > 0) summary += ` | Failed: ${failed}`;
  if (roleMappings > 0) summary += ` | Role mappings: ${roleMappings}`;

  await interaction.editReply({ content: summary, files: [discordFile], components: [] });

  const uploadLink = uploadUrl ? `\n[Download CSV](${uploadUrl})` : '';
  await interaction.user.send(
    `**Bulk Invite ${status}**\nRequest ID: \`${requestId}\`\nFile: ${attachment.name}\nCreated: ${created}${cancelled ? `/${rows.length}` : ''}${skipped > 0 ? ` | Skipped: ${skipped}` : ''}${failed > 0 ? ` | Failed: ${failed}` : ''}${uploadLink}`
  ).catch(() => {});
}
