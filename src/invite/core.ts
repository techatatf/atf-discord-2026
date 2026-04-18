import { Guild } from 'discord.js';
import { config } from '../config';
import { queries } from '../db';

export interface InviteParams {
  reason: string;
  maxUses?: number;
  maxAge?: number; // in days
  roleId?: string; // role to auto-assign to members who join via this invite
}

export interface InviteResult {
  requestId: string;
  inviteUrl: string;
  inviteCode: string;
}

export function validateParams(params: InviteParams): string | null {
  if (!params.reason || params.reason.trim() === '') {
    return 'Reason cannot be empty.';
  }

  if (params.maxUses !== undefined) {
    if (!Number.isInteger(params.maxUses) || params.maxUses < 1) {
      return 'max-uses must be a positive integer.';
    }
  }

  if (params.maxAge !== undefined) {
    if (!Number.isInteger(params.maxAge) || params.maxAge < 1) {
      return 'max-age must be a positive integer (in days). 0 is not allowed.';
    }
  }

  return null;
}

export function generateRequestId(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const datePart = `${yyyy}-${mm}-${dd}`;

  for (let attempt = 0; attempt < 100; attempt++) {
    const letters = Array.from({ length: 3 }, () =>
      String.fromCharCode(97 + Math.floor(Math.random() * 26))
    ).join('');
    const id = `${datePart}-${letters}`;

    const exists = queries.inviteRequestExists.get(id);
    if (!exists) return id;
  }

  throw new Error('Failed to generate a unique request ID after 100 attempts.');
}

export async function createSingleInvite(
  guild: Guild,
  params: InviteParams,
  requester: { displayName: string; username: string; roles: string[] },
): Promise<InviteResult> {
  const validationError = validateParams(params);
  if (validationError) throw new Error(validationError);

  const maxUses = params.maxUses ?? 1;
  const maxAgeDays = params.maxAge ?? 7;
  const maxAgeSeconds = maxAgeDays * 86400;

  const channel = guild.channels.cache.get(config.generalRulesChannelId);
  if (!channel) {
    throw new Error(`Could not find rules channel (ID: ${config.generalRulesChannelId}).`);
  }

  if (!('createInvite' in channel)) {
    throw new Error('The configured rules channel does not support invite creation.');
  }

  const invite = await (channel as any).createInvite({
    maxUses,
    maxAge: maxAgeSeconds,
    unique: true,
  });

  const requestId = generateRequestId();

  const now = new Date().toISOString();

  queries.insertInviteRequest.run([
    requestId,
    'single',
    requester.displayName,
    requester.username,
    requester.roles.join(', '),
    params.reason,
    invite.url,
    now,
  ]);

  if (params.roleId) {
    queries.insertInviteRoleAssignment.run([invite.code, params.roleId, requestId, now]);
  }

  return { requestId, inviteUrl: invite.url, inviteCode: invite.code };
}
