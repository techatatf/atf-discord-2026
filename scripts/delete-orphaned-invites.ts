/**
 * delete-orphaned-invites.ts
 *
 * Deletes invites on Discord that were created by the bot but have no
 * corresponding record in the local DB (orphaned invites).
 *
 * Usage:
 *   npx ts-node scripts/delete-orphaned-invites.ts [GUILD_ID]
 *
 * Requires:
 *   - .env with DISCORD_TOKEN set
 *   - The bot must be in the guild with Manage Guild permission
 *   - data/bot.db must exist
 *
 * Use --dry-run to preview without deleting:
 *   npx ts-node scripts/delete-orphaned-invites.ts [GUILD_ID] --dry-run
 */

import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import path from 'path';
import { Database } from 'node-sqlite3-wasm';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('ERROR: DISCORD_TOKEN not set in .env');
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const guildIdArg = args.find(a => !a.startsWith('--'));

async function main() {
  // Open DB
  const dbPath = path.join(__dirname, '..', 'data', 'bot.db');
  let db: Database;
  try {
    db = new Database(dbPath);
  } catch (err) {
    console.error(`ERROR: Could not open database at ${dbPath}`);
    console.error(err);
    process.exit(1);
  }

  const dbCodes = new Set<string>();
  const rows = db.all('SELECT invite_code FROM invite_role_assignments');
  for (const row of rows) {
    dbCodes.add((row as Record<string, unknown>).invite_code as string);
  }
  db.close();

  console.log(`Local DB invite codes: ${dbCodes.size}`);

  // Connect to Discord
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(token);
  await new Promise<void>(resolve => client.once('ready', () => resolve()));

  let guild;
  if (guildIdArg) {
    guild = client.guilds.cache.get(guildIdArg);
    if (!guild) {
      console.error(`ERROR: Bot is not in guild ${guildIdArg}`);
      client.destroy();
      process.exit(1);
    }
  } else {
    const guilds = [...client.guilds.cache.values()];
    if (guilds.length !== 1) {
      console.error(`ERROR: Bot is in ${guilds.length} guilds. Please specify a GUILD_ID.`);
      client.destroy();
      process.exit(1);
    }
    guild = guilds[0];
    console.log(`Auto-detected guild: ${guild.name} (${guild.id})`);
  }

  const discordInvites = await guild.invites.fetch();
  const botUserId = client.user!.id;

  // Find orphaned invites: created by bot, not in DB
  const orphaned: { code: string; uses: number; maxUses: number; expiresAt: Date | null }[] = [];
  discordInvites.forEach((invite) => {
    if (dbCodes.has(invite.code)) return;
    if (invite.inviterId === botUserId) {
      orphaned.push({
        code: invite.code,
        uses: invite.uses ?? 0,
        maxUses: invite.maxUses ?? 0,
        expiresAt: invite.expiresAt ?? null,
      });
    }
  });

  console.log(`\nOrphaned invites found: ${orphaned.length}`);

  if (orphaned.length === 0) {
    console.log('Nothing to delete.');
    client.destroy();
    return;
  }

  if (dryRun) {
    console.log('\n[DRY RUN] Would delete:');
    for (const inv of orphaned) {
      console.log(`  ${inv.code}  uses=${inv.uses}/${inv.maxUses}  expires=${inv.expiresAt?.toISOString() ?? 'never'}`);
    }
    console.log(`\n[DRY RUN] Total: ${orphaned.length} invites would be deleted.`);
    client.destroy();
    return;
  }

  // Delete
  let deleted = 0;
  const errors: string[] = [];

  for (const inv of orphaned) {
    try {
      await guild.invites.delete(inv.code);
      deleted++;
      if (deleted % 10 === 0) {
        console.log(`  Deleted ${deleted}/${orphaned.length}...`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${inv.code}: ${msg}`);
    }
  }

  console.log(`\nDeleted: ${deleted}/${orphaned.length}`);
  if (errors.length > 0) {
    console.log(`\nFailed to delete ${errors.length}:`);
    for (const e of errors.slice(0, 20)) {
      console.log(`  ${e}`);
    }
  }

  const remaining = await guild.invites.fetch();
  console.log(`\nServer invite count after cleanup: ${remaining.size}/1000`);

  client.destroy();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
