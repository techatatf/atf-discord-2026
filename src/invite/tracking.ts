import { Client, Guild } from 'discord.js';
import { InviteRoleAssignment, queries } from '../db';

const inviteUses: Map<string, Map<string, number>> = new Map();

export function addInviteToCache(guildId: string, code: string, uses: number = 0): void {
  const map = inviteUses.get(guildId) ?? new Map<string, number>();
  map.set(code, uses);
  inviteUses.set(guildId, map);
}

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
    if (!invite.guild) {
      console.log(`[inviteCreate] invite.guild is falsy for code=${invite.code}, skipping cache update.`);
      return;
    }
    const guildId = invite.guild.id;
    const map = inviteUses.get(guildId) ?? new Map<string, number>();
    const alreadyCached = map.has(invite.code);
    map.set(invite.code, invite.uses ?? 0);
    inviteUses.set(guildId, map);
    console.log(
      `[inviteCreate] Cached invite code=${invite.code} uses=${invite.uses ?? 0} guild=${guildId} ` +
      `alreadyCached=${alreadyCached} cacheSize=${map.size}`
    );
  });

  client.on('inviteDelete', (invite) => {
    const guildId = invite.guild?.id ?? 'unknown';
    const inCache = inviteUses.get(guildId)?.has(invite.code) ?? false;
    console.log(
      `[inviteDelete] code=${invite.code} guild=${guildId} wasInCache=${inCache} (no-op, not removing from cache)`
    );
  });
}

export async function detectUsedInvite(guild: Guild): Promise<string | null> {
  const prevMap = inviteUses.get(guild.id);
  const prev = new Map(prevMap ?? new Map<string, number>());

  console.log(
    `[detectUsedInvite] guild=${guild.id} prevCacheExists=${!!prevMap} prevSize=${prev.size} ` +
    `prevEntries=${JSON.stringify([...prev.entries()])}`
  );

  let current;
  try {
    current = await guild.invites.fetch();
  } catch (err) {
    console.error(`[detectUsedInvite] Failed to fetch invites for guild ${guild.id}:`, err);
    return null;
  }

  const candidates: { code: string; reason: string }[] = [];
  const next = new Map<string, number>();

  for (const invite of current.values()) {
    const prevUses = prev.get(invite.code) ?? 0;
    const currUses = invite.uses ?? 0;
    next.set(invite.code, currUses);
    if (currUses > prevUses) {
      candidates.push({ code: invite.code, reason: `uses increased ${prevUses}->${currUses}` });
    }
  }

  const disappeared: string[] = [];
  for (const code of prev.keys()) {
    if (!next.has(code)) {
      disappeared.push(code);
      candidates.push({ code, reason: 'disappeared (in prev but not in current fetch)' });
    }
  }

  console.log(
    `[detectUsedInvite] currentFetchSize=${current.size} ` +
    `currentEntries=${JSON.stringify([...current.values()].map(i => [i.code, i.uses]))} ` +
    `disappeared=${JSON.stringify(disappeared)} ` +
    `candidates=${JSON.stringify(candidates)}`
  );

  inviteUses.set(guild.id, next);

  const codes = candidates.map(c => c.code);

  if (codes.length === 1) {
    console.log(`[detectUsedInvite] Single candidate: ${codes[0]}`);
    return codes[0];
  }

  if (codes.length > 1) {
    const tracked = codes.filter(code => {
      const row = queries.getInviteRoleAssignment.get(code) as unknown as InviteRoleAssignment | undefined;
      return !!row;
    });
    console.log(
      `[detectUsedInvite] Multiple candidates (${codes.length}), ` +
      `tracked filter: ${JSON.stringify(tracked)}`
    );
    if (tracked.length === 1) return tracked[0];
  }

  console.log(`[detectUsedInvite] Returning null — candidates=${codes.length}`);
  return null;
}
