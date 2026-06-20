import { ChatInputCommandInteraction, Interaction } from 'discord.js';
import { execute as executeInviteCreate } from '../commands/inviteCreate';
import { execute as executeInviteCreateBulk } from '../commands/inviteCreateBulk';
import { execute as executeInviteGet } from '../commands/inviteGet';
import { execute as executeInviteStatus } from '../commands/inviteStatus';
import { execute as executeInviteCapacity } from '../commands/inviteCapacity';
import { execute as executeInviteCleanup } from '../commands/inviteCleanup';
import { execute as executeAllMemberExport } from '../commands/allMemberExport';

const commandHandlers: Record<string, (interaction: ChatInputCommandInteraction) => Promise<void>> = {
  'invite-create': executeInviteCreate,
  'invite-create-bulk': executeInviteCreateBulk,
  'invite-get': executeInviteGet,
  'invite-status': executeInviteStatus,
  'invite-capacity': executeInviteCapacity,
  'invite-cleanup': executeInviteCleanup,
  'all-member-export': executeAllMemberExport,
};

export async function onInteractionCreate(interaction: Interaction): Promise<void> {
  if (interaction.isChatInputCommand()) {
    const handler = commandHandlers[interaction.commandName];
    if (!handler) return;

    try {
      await handler(interaction);
    } catch (err) {
      console.error(`Error handling command [${interaction.commandName}]:`, err);
      const reply = interaction.replied || interaction.deferred
        ? interaction.followUp({ content: 'An unexpected error occurred. Please try again or contact an admin.', ephemeral: true })
        : interaction.reply({ content: 'An unexpected error occurred. Please try again or contact an admin.', ephemeral: true });
      await reply.catch(() => null);
    }
  }
}
