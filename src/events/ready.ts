import { Client } from 'discord.js';
import { data as inviteCreateCommand } from '../commands/inviteCreate';
import { data as inviteCreateBulkCommand } from '../commands/inviteCreateBulk';
import { data as inviteGetCommand } from '../commands/inviteGet';
import { data as inviteStatusCommand } from '../commands/inviteStatus';
import { primeInviteCache } from '../invite/tracking';

export async function onReady(client: Client): Promise<void> {
  console.log(`Logged in as ${client.user?.tag}`);

  const guild = client.guilds.cache.first();
  if (!guild) {
    console.error('Bot is not in any guild. Exiting.');
    process.exit(1);
  }

  await guild.commands.set([
    inviteCreateCommand,
    inviteCreateBulkCommand,
    inviteGetCommand,
    inviteStatusCommand,
  ]);
  console.log('Registered slash commands: /invite-create, /invite-create-bulk, /invite-get, /invite-status');

  await primeInviteCache(guild);
}
