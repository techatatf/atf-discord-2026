import { ChatInputCommandInteraction, GuildMember } from 'discord.js';
import { config } from '../config';

/**
 * Checks role and channel permissions for invite commands.
 * Returns an error message string if denied, or null if allowed.
 */
export function checkInvitePermissions(interaction: ChatInputCommandInteraction): string | null {
  const member = interaction.member as GuildMember;
  const isStaff = member.roles.cache.has(config.adminRoleId) || member.roles.cache.has(config.modRoleId);

  if (!isStaff) {
    return 'You do not have permission to use this command.';
  }

  if (config.inviteGenAllowlistChannels.length > 0 && !config.inviteGenAllowlistChannels.includes(interaction.channelId)) {
    return 'This command can only be used in designated channels.';
  }

  return null;
}
