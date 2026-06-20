import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { InviteRoleAssignment, queries } from '../db';
import { isBulkLocked } from '../invite/bulkLock';
import { categorizeInvites, classifyInvites, CleanupMode, selectInvitesForCleanup, ServerInvite } from '../invite/lifecycle';
import { checkInvitePermissions } from '../invite/permissions';

const CONFIRM_STRING = 'i-know-what-im-doing-atf-bot';

export const data = new SlashCommandBuilder()
  .setName('invite-cleanup')
  .setDescription('Delete dead bot-created invites to free up invite slots')
  .addStringOption(option =>
    option
      .setName('mode')
      .setDescription('Which invites to delete (default: dead bot invites only)')
      .addChoices(
        { name: 'All dead bot invites', value: 'all-dead-bot-invites' },
        { name: 'All bot invites', value: 'all-bot-invites' },
        { name: 'All dead invites', value: 'all-dead-invites' },
        { name: 'All invites', value: 'all-invites' },
      )
  )
  .addStringOption(option =>
    option
      .setName('confirm')
      .setDescription('Required for non-default modes: type "i-know-what-im-doing-atf-bot"')
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const denied = checkInvitePermissions(interaction);
  if (denied) {
    await interaction.reply({ content: denied, ephemeral: true });
    return;
  }

  // Block if a bulk process is running on this guild
  if (isBulkLocked(interaction.guild!.id)) {
    await interaction.reply({
      content: 'A bulk invite process is currently running. Please wait for it to complete before running cleanup.',
      ephemeral: true,
    });
    return;
  }

  const mode = (interaction.options.getString('mode') ?? 'all-dead-bot-invites') as CleanupMode;
  const confirm = interaction.options.getString('confirm');

  // Non-default modes require confirm param
  if (mode !== 'all-dead-bot-invites') {
    if (confirm !== CONFIRM_STRING) {
      await interaction.reply({
        content: `Mode \`${mode}\` requires the \`confirm\` parameter set to exactly \`${CONFIRM_STRING}\`.`,
        ephemeral: true,
      });
      return;
    }
  }

  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild!;

  // Fetch all server invites
  let discordInvites;
  try {
    discordInvites = await guild.invites.fetch();
  } catch {
    await interaction.editReply('Failed to fetch invites from Discord.');
    return;
  }

  const serverInvites: ServerInvite[] = [...discordInvites.values()].map(inv => ({
    code: inv.code,
    uses: inv.uses ?? 0,
    maxUses: inv.maxUses ?? 0,
    maxAge: inv.maxAge ?? 0,
    createdTimestamp: inv.createdTimestamp,
    expiresTimestamp: inv.expiresAt ? inv.expiresAt.getTime() : null,
  }));

  // Get bot invite codes from DB
  let assignments: InviteRoleAssignment[];
  try {
    assignments = queries.getAllInviteRoleAssignments.all() as unknown as InviteRoleAssignment[];
  } catch {
    await interaction.editReply('Failed to fetch invite role assignments from database.');
    return;
  }
  const botCodes = new Set(assignments.map(a => a.invite_code));

  // Classify and select
  const now = new Date();
  const classified = classifyInvites(serverInvites, botCodes, now);
  const toDelete = selectInvitesForCleanup(classified, mode);

  if (toDelete.length === 0) {
    const capacity = categorizeInvites(serverInvites, botCodes, now);
    await interaction.editReply(`No invites matched mode \`${mode}\`. Nothing to delete.\nAvailable capacity: ${capacity.available}/${capacity.limit}`);
    return;
  }

  // Delete invites
  let deleted = 0;
  let fullyUsed = 0;
  let expired = 0;
  const errors: string[] = [];

  for (const classification of toDelete) {
    const inv = classification.invite;
    try {
      await guild.invites.delete(inv.code);
      deleted++;

      // Count breakdown
      const isFullyUsed = inv.maxUses > 0 && (inv.uses ?? 0) >= inv.maxUses;
      const isExpired = inv.expiresTimestamp !== null && inv.expiresTimestamp <= now.getTime();
      if (isFullyUsed) fullyUsed++;
      if (isExpired && !isFullyUsed) expired++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${inv.code}: ${msg}`);
    }
  }

  // Compute updated capacity (total minus deleted)
  const remainingTotal = serverInvites.length - deleted;
  const availableCapacity = 1000 - remainingTotal;

  // Build reply
  const lines = [
    '**Cleanup Complete**',
    `Deleted: ${deleted} invites (${fullyUsed} fully used, ${expired} expired)`,
    `Available capacity: ${availableCapacity}/1000`,
  ];

  if (errors.length > 0) {
    lines.push(`\nFailed to delete ${errors.length} invite(s):`);
    lines.push(...errors.slice(0, 10).map(e => `• ${e}`));
    if (errors.length > 10) lines.push(`...and ${errors.length - 10} more.`);
  }

  await interaction.editReply(lines.join('\n'));
}
