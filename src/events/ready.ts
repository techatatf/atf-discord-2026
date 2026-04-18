import { Client, TextChannel } from 'discord.js';
import { config } from '../config';
import { queries } from '../db';
import { buildRequestEmbed } from '../embeds/requestEmbed';
import { data as inviteCreateCommand } from '../commands/inviteCreate';
import { data as inviteCreateBulkCommand } from '../commands/inviteCreateBulk';
import { data as inviteGetCommand } from '../commands/inviteGet';
import { primeInviteCache } from '../invite/tracking';

export async function onReady(client: Client): Promise<void> {
  console.log(`Logged in as ${client.user?.tag}`);

  const guild = client.guilds.cache.first();
  if (!guild) {
    console.error('Bot is not in any guild. Exiting.');
    process.exit(1);
  }

  // Register slash commands at guild level (instant, no propagation delay)
  await guild.commands.set([
    inviteCreateCommand,
    inviteCreateBulkCommand,
    inviteGetCommand,
  ]);
  console.log('Registered slash commands: /invite-create, /invite-create-bulk, /invite-get');

  await primeInviteCache(guild);

  const requestsChannel = guild.channels.cache.get(config.mentorRequestsChannelId) as TextChannel | undefined;
  if (!requestsChannel) {
    console.error(`Could not find #mentor-requests channel (ID: ${config.mentorRequestsChannelId})`);
    return;
  }

  const botStateRow = queries.getBotState.get('mentor_request_message_id') as unknown as { value: string } | undefined;
  const storedMessageId = botStateRow?.value;

  if (storedMessageId) {
    // Verify the message still exists
    const existing = await requestsChannel.messages.fetch(storedMessageId).catch(() => null);
    if (existing) {
      console.log('Persistent mentor request embed already exists. Skipping post.');
      return;
    }
    console.log('Stored message ID no longer valid. Reposting persistent embed.');
  }

  const { embed, row } = buildRequestEmbed();
  const message = await requestsChannel.send({ embeds: [embed], components: [row] });
  queries.setBotState.run(['mentor_request_message_id', message.id]);

  console.log(`Posted persistent mentor request embed (message ID: ${message.id})`);
}
