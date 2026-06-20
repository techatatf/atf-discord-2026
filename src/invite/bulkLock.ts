/**
 * Per-guild lock to prevent conflicting commands (e.g. /invite-cleanup)
 * from running while a bulk invite process is active.
 *
 * This is a simple in-memory Set — safe because the bot runs as a single process.
 */

const activeGuilds = new Set<string>();

export function acquireBulkLock(guildId: string): void {
  activeGuilds.add(guildId);
}

export function releaseBulkLock(guildId: string): void {
  activeGuilds.delete(guildId);
}

export function isBulkLocked(guildId: string): boolean {
  return activeGuilds.has(guildId);
}
