export interface ServerInvite {
  code: string;
  uses: number | null;
  maxUses: number;
  maxAge: number; // seconds, 0 = never expires
  createdTimestamp: number | null;
  expiresTimestamp: number | null;
}

export interface InviteCapacity {
  total: number;
  limit: number;
  botCreated: number;
  botLive: number;
  botDead: number;
  available: number;
}

function isInviteDead(invite: ServerInvite, now: Date): boolean {
  const fullyUsed = invite.maxUses > 0 && (invite.uses ?? 0) >= invite.maxUses;
  const expired = invite.expiresTimestamp !== null && invite.expiresTimestamp <= now.getTime();
  return fullyUsed || expired;
}

export function classifyInvites(
  serverInvites: ServerInvite[],
  botInviteCodes: Set<string>,
  now: Date = new Date(),
): InviteClassification[] {
  return serverInvites.map(invite => {
    const category: InviteCategory = botInviteCodes.has(invite.code) ? 'bot' : 'external';
    const state: InviteState = isInviteDead(invite, now) ? 'dead' : 'live';
    return { invite, category, state };
  });
}

export function categorizeInvites(
  serverInvites: ServerInvite[],
  botInviteCodes: Set<string>,
  now: Date = new Date(),
): InviteCapacity {
  const limit = 1000;
  const total = serverInvites.length;
  let botLive = 0;
  let botDead = 0;

  for (const { category, state } of classifyInvites(serverInvites, botInviteCodes, now)) {
    if (category !== 'bot') continue;
    if (state === 'dead') {
      botDead++;
    } else {
      botLive++;
    }
  }

  return {
    total,
    limit,
    botCreated: botLive + botDead,
    botLive,
    botDead,
    available: limit - total,
  };
}

export type InviteCategory = 'bot' | 'external';
export type InviteState = 'live' | 'dead';

export interface InviteClassification {
  invite: ServerInvite;
  category: InviteCategory;
  state: InviteState;
}
