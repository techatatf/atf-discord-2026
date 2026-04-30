import { AttachmentBuilder, ChatInputCommandInteraction, GuildMember, SlashCommandBuilder } from 'discord.js';
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
  const parseResult = parseCsv(csvContent);
  const { rows, errors } = parseResult;
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

  // NOTE: Cancellation button removed (issue #4).
  // Root cause: `ButtonInteraction#update()` in the collector raced against
  // `interaction.editReply()` in the progress callback. Both edit the same
  // ephemeral message through different API paths, causing unreliable UX
  // where the "Cancelling..." state could be immediately overwritten by a
  // progress update. Discord's interaction model makes cancellation
  // unreliable for long-running ephemeral loops with concurrent edits.

  await interaction.editReply(`Processing invites... 0/${rows.length}`);

  const loopStart = Date.now();

  const { links, created, skipped, failed, roleAssignments } = await runBulkInviteLoop(
    channel as any,
    rows,
    (i, total) => {
      if (i > 0 && i % 25 === 0) {
        console.log(`[invite-bulk ${requestId}] Progress: ${i}/${total}`);
        interaction.editReply(`Processing invites... ${i}/${total}`).catch(() => {});
      }
    },
  );

  for (const a of roleAssignments) {
    queries.insertInviteRoleAssignment.run([a.inviteCode, resolveRoleId(a.role), requestId, now]);
    addInviteToCache(interaction.guild!.id, a.inviteCode, 0);
  }
  const roleMappings = roleAssignments.length;

  console.log(`[invite-bulk ${requestId}] Loop done in ${Date.now() - loopStart}ms. created=${created} skipped=${skipped} failed=${failed}`);

  // Build output CSV
  const outputCsv = buildOutputCsv(parseResult, links);

  // Upload to UploadThing (with timeout so a bad token / hanging upload can't stall the interaction)
  let uploadUrl: string | null = null;
  try {
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      if (typeof args[0] === 'string' && args[0].includes('[uploadthing][deprecated]')) return;
      originalWarn(...args);
    };
    const utapi = new UTApi();
    const utFile = new UTFile([outputCsv], `invite-bulk-${requestId}.csv`);
    const uploadResult = await withTimeout(utapi.uploadFiles(utFile), UPLOAD_TIMEOUT_MS, 'UploadThing upload');
    uploadUrl = uploadResult.data?.ufsUrl ?? null;
    console.warn = originalWarn;
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

  let summary = `**Bulk Invite Complete**\nRequest ID: \`${requestId}\`\nCreated: ${created}`;
  if (skipped > 0) summary += ` | Skipped (existing): ${skipped}`;
  if (failed > 0) summary += ` | Failed: ${failed}`;
  if (roleMappings > 0) summary += ` | Role mappings: ${roleMappings}`;

  await interaction.editReply({ content: summary, files: [discordFile] });

  const uploadLink = uploadUrl ? `\n[Download CSV](${uploadUrl})` : '';
  await interaction.user.send(
    `**Bulk Invite Complete**\nRequest ID: \`${requestId}\`\nFile: ${attachment.name}\nCreated: ${created}${skipped > 0 ? ` | Skipped: ${skipped}` : ''}${failed > 0 ? ` | Failed: ${failed}` : ''}${uploadLink}`
  ).catch(() => {});
}
