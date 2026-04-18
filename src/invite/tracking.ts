import { Client, Guild } from 'discord.js';
import { InviteRoleAssignment, queries } from '../db';

const inviteUses: Map<string, Map<string, number>> = new Map();

export async function primeInviteCache(guild: Guild): Promise<void> {
  try {
    const invites = await guild.invites.fetch();
    const codeMap = new Map<string, number>();
    for (const invite of invites.values()) {
      codeMap.set(invite.code, invite.uses ?? 0);
    }
    inviteUses.set(guild.id, codeMap);
    console.log(`Primed invite cache for guild ${guild.id} (${codeMap.size} invites).`);
  } catch (err) {
    console.error(`Failed to prime invite cache for guild ${guild.id}:`, err);
  }
}

export function registerInviteEvents(client: Client): void {
  client.on('inviteCreate', (invite) => {
    if (!invite.guild) return;
    const map = inviteUses.get(invite.guild.id) ?? new Map<string, number>();
    map.set(invite.code, invite.uses ?? 0);
    inviteUses.set(invite.guild.id, map);
  });

  client.on('inviteDelete', () => {});
}

export async function detectUsedInvite(guild: Guild): Promise<string | null> {
  const prev = new Map(inviteUses.get(guild.id) ?? new Map<string, number>());

  let current;
  try {
    current = await guild.invites.fetch();
  } catch (err) {
    console.error(`Failed to fetch invites during join for guild ${guild.id}:`, err);
    return null;
  }

  const candidates: string[] = [];
  const next = new Map<string, number>();

  for (const invite of current.values()) {
    const prevUses = prev.get(invite.code) ?? 0;
    const currUses = invite.uses ?? 0;
    next.set(invite.code, currUses);
    if (currUses > prevUses) candidates.push(invite.code);
  }

  for (const code of prev.keys()) {
    if (!next.has(code)) candidates.push(code);
  }

  inviteUses.set(guild.id, next);

  if (candidates.length === 1) return candidates[0];

  // Multiple candidates — narrow down to invites we're actually tracking.
  if (candidates.length > 1) {
    const tracked = candidates.filter(code => {
      const row = queries.getInviteRoleAssignment.get(code) as unknown as InviteRoleAssignment | undefined;
      return !!row;
    });
    if (tracked.length === 1) return tracked[0];
  }

  return null;
}
