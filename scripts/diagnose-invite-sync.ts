/**
 * diagnose-invite-sync.ts
 *
 * One-off diagnostic script that compares the bot's local DB of invite codes
 * against what Discord actually reports for the guild.
 *
 * Usage:
 *   npx ts-node scripts/diagnose-invite-sync.ts <GUILD_ID>
 *
 * Requires:
 *   - .env with DISCORD_TOKEN set
 *   - The bot must be a member of the guild and have Manage Guild permission
 *
 * Output:
 *   - Total invites on Discord
 *   - Total invite codes in local DB
 *   - Codes in DB but NOT on Discord ("phantom" — DB thinks they exist, Discord doesn't)
 *   - Codes on Discord but NOT in DB, created by the bot user ("orphaned" — bot created them but never recorded)
 *   - Codes on Discord not in DB, created by others ("external")
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

const guildIdArg = process.argv[2]; // optional — auto-detects if bot is in one guild

async function main() {
  // Open DB directly (read-only access)
  const dbPath = path.join(__dirname, '..', 'data', 'bot.db');
  let db: Database;
  try {
    db = new Database(dbPath);
  } catch (err) {
    console.error(`ERROR: Could not open database at ${dbPath}`);
    console.error(err);
    process.exit(1);
  }

  // Get all invite codes from local DB
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
    if (guilds.length === 0) {
      console.error('ERROR: Bot is not in any guilds.');
      client.destroy();
      process.exit(1);
    }
    if (guilds.length > 1) {
      console.error(`ERROR: Bot is in ${guilds.length} guilds. Please specify a GUILD_ID.`);
      console.error(guilds.map(g => `  ${g.id} — ${g.name}`).join('\n'));
      client.destroy();
      process.exit(1);
    }
    guild = guilds[0];
    console.log(`Auto-detected guild: ${guild.name} (${guild.id})`);
  }

  const discordInvites = await guild.invites.fetch();

  interface InviteInfo {
    code: string;
    creatorId: string | null;
    uses: number;
    maxUses: number;
    expiresAt: Date | null;
  }

  const discordCodes = new Map<string, InviteInfo>();

  discordInvites.forEach((invite) => {
    discordCodes.set(invite.code, {
      code: invite.code,
      creatorId: invite.inviterId ?? null,
      uses: invite.uses ?? 0,
      maxUses: invite.maxUses ?? 0,
      expiresAt: invite.expiresAt ?? null,
    });
  });

  console.log(`Discord invite codes: ${discordCodes.size}`);
  console.log('');

  // --- Phantom codes: in DB but NOT on Discord ---
  const phantomCodes: string[] = [];
  dbCodes.forEach(code => {
    if (!discordCodes.has(code)) {
      phantomCodes.push(code);
    }
  });

  console.log(`=== Phantom codes (in DB, not on Discord): ${phantomCodes.length} ===`);
  if (phantomCodes.length > 0) {
    for (const code of phantomCodes.slice(0, 50)) {
      console.log(`  ${code}`);
    }
    if (phantomCodes.length > 50) {
      console.log(`  ... and ${phantomCodes.length - 50} more`);
    }
  }
  console.log('');

  // --- Orphaned codes: on Discord, created by bot, but NOT in DB ---
  const botUserId = client.user!.id;
  const orphanedCodes: InviteInfo[] = [];
  const externalCodes: InviteInfo[] = [];

  discordCodes.forEach((invite, code) => {
    if (dbCodes.has(code)) return;

    if (invite.creatorId === botUserId) {
      orphanedCodes.push(invite);
    } else {
      externalCodes.push(invite);
    }
  });

  console.log(`=== Orphaned codes (on Discord by bot, not in DB): ${orphanedCodes.length} ===`);
  if (orphanedCodes.length > 0) {
    for (const inv of orphanedCodes.slice(0, 50)) {
      console.log(`  ${inv.code}  uses=${inv.uses}/${inv.maxUses}  expires=${inv.expiresAt?.toISOString() ?? 'never'}`);
    }
    if (orphanedCodes.length > 50) {
      console.log(`  ... and ${orphanedCodes.length - 50} more`);
    }
  }
  console.log('');

  console.log(`=== External codes (on Discord, not by bot, not in DB): ${externalCodes.length} ===`);
  if (externalCodes.length > 0) {
    for (const inv of externalCodes.slice(0, 20)) {
      console.log(`  ${inv.code}  creator=${inv.creatorId ?? 'unknown'}  uses=${inv.uses}/${inv.maxUses}`);
    }
    if (externalCodes.length > 20) {
      console.log(`  ... and ${externalCodes.length - 20} more`);
    }
  }
  console.log('');

  // --- Summary ---
  let matchedBotCodes = 0;
  dbCodes.forEach(c => { if (discordCodes.has(c)) matchedBotCodes++; });
  console.log('=== Summary ===');
  console.log(`Discord total:          ${discordCodes.size}`);
  console.log(`DB total:               ${dbCodes.size}`);
  console.log(`DB ∩ Discord (matched): ${matchedBotCodes}`);
  console.log(`Phantom (DB only):      ${phantomCodes.length}`);
  console.log(`Orphaned (bot, no DB):  ${orphanedCodes.length}`);
  console.log(`External (not bot):     ${externalCodes.length}`);
  console.log('');

  if (phantomCodes.length > 0) {
    console.log('⚠️  Phantom codes mean the DB has stale entries for invites Discord already deleted.');
    console.log('   These inflate the bot-created count but don\'t take real capacity.');
  }
  if (orphanedCodes.length > 0) {
    console.log('⚠️  Orphaned codes mean the bot created invites that were never saved to the DB.');
    console.log('   These take real capacity but the bot doesn\'t know about them.');
    console.log('   The bot cannot assign roles when these invites are used.');
  }

  client.destroy();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
