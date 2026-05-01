import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, ComponentType, GuildMember, SlashCommandBuilder } from 'discord.js';
import { UTApi, UTFile } from 'uploadthing/server';
import { config } from '../config';
import { InviteRoleAssignment, queries } from '../db';
import { runBulkInviteLoop } from '../invite/bulk';
import { acquireBulkLock, releaseBulkLock } from '../invite/bulkLock';
import { generateRequestId, resolveRoleId } from '../invite/core';
import { buildOutputCsv, parseCsv } from '../invite/csv';
import { categorizeInvites, ServerInvite } from '../invite/lifecycle';
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

  // Hard row cap: reject CSVs with more than 1000 data rows
  if (rows.length > 1000) {
    await interaction.editReply(`CSV has ${rows.length} data rows, which exceeds the maximum of 1000. Please split into smaller files.`);
    return;
  }

  // Create invites row by row
  const channel = interaction.guild!.channels.cache.get(config.generalRulesChannelId);
  if (!channel || !('createInvite' in channel)) {
    await interaction.editReply(`Could not find or use the rules channel (ID: ${config.generalRulesChannelId}).`);
    return;
  }

  // Dynamic capacity check: ensure enough invite slots before starting
  const rowsNeedingInvites = rows.filter(r => !r.existingLink).length;
  if (rowsNeedingInvites > 0) {
    try {
      const guild = interaction.guild!;
      const discordInvites = await guild.invites.fetch();
      const serverInvites: ServerInvite[] = [...discordInvites.values()].map(inv => ({
        code: inv.code,
        uses: inv.uses ?? 0,
        maxUses: inv.maxUses ?? 0,
        maxAge: inv.maxAge ?? 0,
        createdTimestamp: inv.createdTimestamp,
        expiresTimestamp: inv.expiresAt ? inv.expiresAt.getTime() : null,
      }));
      const assignments = queries.getAllInviteRoleAssignments.all() as unknown as InviteRoleAssignment[];
      const botCodes = new Set(assignments.map(a => a.invite_code));
      const capacity = categorizeInvites(serverInvites, botCodes);

      if (rowsNeedingInvites > capacity.available) {
        await interaction.editReply(
          `You need ${rowsNeedingInvites} invite slots but only ${capacity.available} are available. Run \`/invite-cleanup\` first.`
        );
        return;
      }
    } catch (err) {
      console.error('[invite-bulk] Failed to check capacity:', err);
      // Non-fatal: proceed with the loop and let Discord API errors surface naturally
    }
  }

  const requestId = generateRequestId();
  const now = new Date().toISOString();
  const guildId = interaction.guild!.id;

  acquireBulkLock(guildId);
  console.log(`[invite-bulk ${requestId}] Starting loop for ${rows.length} rows.`);
  await interaction.user.send(
    `**Bulk Invite Started**\nRequest ID: \`${requestId}\`\nFile: ${attachment.name}\nRows: ${rows.length}`
  ).catch(() => {});

  try {
  // Cancel button setup
  const cancelButton = new ButtonBuilder()
    .setCustomId(`bulk-cancel-${requestId}`)
    .setLabel('Cancel')
    .setStyle(ButtonStyle.Danger);
  const cancelRow = new ActionRowBuilder<ButtonBuilder>().addComponents(cancelButton);

  await interaction.editReply({
    content: `Processing invites... 0/${rows.length}`,
    components: [cancelRow],
  });

  // Set up cancellation flag and collector
  let cancelled = false;
  const reply = await interaction.fetchReply();
  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.customId === `bulk-cancel-${requestId}` && i.user.id === interaction.user.id,
    time: 15 * 60 * 1000, // 15 minutes max
  });

  collector.on('collect', async (i) => {
    cancelled = true;
    await i.reply({ ephemeral: true, content: '✅ Cancelling after current row...' });
    collector.stop('cancelled');
  });

  const loopStart = Date.now();

  const { links, created, skipped, failed, roleAssignments, firstError, stoppedReason } = await runBulkInviteLoop(
    channel as any,
    rows,
    (i, total) => {
      if (i > 0 && i % 25 === 0) {
        console.log(`[invite-bulk ${requestId}] Progress: ${i}/${total}`);
        interaction.editReply({
          content: `Processing invites... ${i}/${total}`,
          components: [cancelRow],
        }).catch(() => {});
      }
    },
    {
      shouldCancel: () => cancelled,
      onInviteCreated: (inviteCode, role) => {
        queries.insertInviteRoleAssignment.run([inviteCode, resolveRoleId(role), requestId, now]);
        addInviteToCache(interaction.guild!.id, inviteCode, 0);
      },
    },
  );

  // Stop collector if still active
  collector.stop('done');

  const roleMappings = roleAssignments.length;

  console.log(`[invite-bulk ${requestId}] Loop done in ${Date.now() - loopStart}ms. created=${created} skipped=${skipped} failed=${failed} stoppedReason=${stoppedReason}`);

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

  const title = stoppedReason === 'cancelled'
    ? '**Bulk Invite Cancelled**'
    : stoppedReason === 'consecutive-errors'
      ? '**Bulk Invite Stopped**'
      : '**Bulk Invite Complete**';
  let summary = `${title}\nRequest ID: \`${requestId}\`\nCreated: ${created}/${rows.length}`;
  if (stoppedReason === 'cancelled') summary += ' (cancelled)';
  if (skipped > 0) summary += ` | Skipped (existing): ${skipped}`;
  if (failed > 0) summary += ` | Failed: ${failed}`;
  if (roleMappings > 0) summary += ` | Role mappings: ${roleMappings}`;
  if (stoppedReason === 'consecutive-errors') {
    summary += `\nStopped after 3 consecutive errors.`;
  }
  if (firstError) {
    summary += `\nFirst error (row ${firstError.row}): "${firstError.message}"`;
  }

  await interaction.editReply({ content: summary, files: [discordFile], components: [] });

  // DM
  const uploadLink = uploadUrl ? `\n[Download CSV](${uploadUrl})` : '';
  const dmTitle = stoppedReason === 'cancelled'
    ? '**Bulk Invite Cancelled**'
    : stoppedReason === 'consecutive-errors'
      ? '**Bulk Invite Stopped**'
      : '**Bulk Invite Complete**';
  let dmBody = `${dmTitle}\nRequest ID: \`${requestId}\`\nFile: ${attachment.name}\nCreated: ${created}/${rows.length}`;
  if (stoppedReason === 'cancelled') dmBody += ' (cancelled)';
  if (skipped > 0) dmBody += ` | Skipped: ${skipped}`;
  if (failed > 0) dmBody += ` | Failed: ${failed}`;
  if (stoppedReason === 'consecutive-errors') {
    dmBody += `\nStopped after 3 consecutive errors.`;
  }
  if (firstError) {
    dmBody += `\nFirst error (row ${firstError.row}): "${firstError.message}"`;
  }
  dmBody += uploadLink;

  await interaction.user.send(dmBody).catch(() => {});
  } finally {
    releaseBulkLock(guildId);
  }
}
