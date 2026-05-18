import { GuildMember } from 'discord.js';
import { InviteRoleAssignment, queries } from '../db';
import { detectUsedInvite } from '../invite/tracking';

export async function onGuildMemberAdd(member: GuildMember): Promise<void> {
  if (member.user.bot) return;

  const code = await detectUsedInvite(member.guild);

  try {
    const joinedAt = member.joinedAt?.toISOString() ?? new Date().toISOString();
    queries.insertMemberJoin.run([member.user.id, code, joinedAt]);
  } catch (err) {
    console.error(`[guildMemberAdd] Failed to record member join for ${member.user.tag}:`, err);
  }

  if (!code) {
    console.log(`[guildMemberAdd] Could not determine invite used by ${member.user.tag}.`);
    return;
  }

  const assignment = queries.getInviteRoleAssignment.get(code) as unknown as InviteRoleAssignment | undefined;
  if (!assignment) {
    console.log(`[guildMemberAdd] No role mapping for invite ${code} (member ${member.user.tag}).`);
    return;
  }

  try {
    await member.roles.add(assignment.role_id, `Auto-assigned from invite ${code}`);
    console.log(`[guildMemberAdd] Assigned role ${assignment.role_id} to ${member.user.tag} via invite ${code}.`);
  } catch (err) {
    console.error(`[guildMemberAdd] Failed to assign role ${assignment.role_id} to ${member.user.tag}:`, err);
  }
}
