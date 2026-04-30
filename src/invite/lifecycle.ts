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
  /** Nominal Discord limit — not a guaranteed hard ceiling; can be exceeded. */
  limit: number;
  botCreated: number;
  botLive: number;
  botDead: number;
  available: number;
}

/**
 * Format the invite capacity data for display.
 * Does not imply the limit is a hard ceiling.
 */
export function formatCapacityMessage(capacity: InviteCapacity): string {
  const availableStr = capacity.available <= 0
    ? `${capacity.available} (at or over limit)`
    : `${capacity.available}`;

  return [
    '**Invite Capacity**',
    `Total server invites: ${capacity.total}`,
    `Nominal Discord limit: ${capacity.limit}`,
    `Bot-created: ${capacity.botCreated} (${capacity.botLive} live, ${capacity.botDead} dead)`,
    `Available capacity: ${availableStr}`,
  ].join('\n');
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

export type CleanupMode = 'all-dead-bot-invites' | 'all-bot-invites' | 'all-dead-invites' | 'all-invites';

export function selectInvitesForCleanup(
  classified: InviteClassification[],
  mode: CleanupMode,
): InviteClassification[] {
  switch (mode) {
    case 'all-dead-bot-invites':
      return classified.filter(c => c.category === 'bot' && c.state === 'dead');
    case 'all-bot-invites':
      return classified.filter(c => c.category === 'bot');
    case 'all-dead-invites':
      return classified.filter(c => c.state === 'dead');
    case 'all-invites':
      return classified;
  }
}
