import { Client, TextChannel } from 'discord.js';
import { config } from '../config';
import { queries } from '../db';
import { buildRequestEmbed } from '../embeds/requestEmbed';

export async function onReady(client: Client): Promise<void> {
  console.log(`Logged in as ${client.user?.tag}`);

  const guild = client.guilds.cache.first();
  if (!guild) {
    console.error('Bot is not in any guild. Exiting.');
    process.exit(1);
  }

  const requestsChannel = guild.channels.cache.get(config.mentorRequestsChannelId) as TextChannel | undefined;
  if (!requestsChannel) {
    console.error(`Could not find #mentor-requests channel (ID: ${config.mentorRequestsChannelId})`);
    return;
  }

  const storedMessageId = queries.getBotState.get('mentor_request_message_id')?.value;

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
  queries.setBotState.run('mentor_request_message_id', message.id);

  console.log(`Posted persistent mentor request embed (message ID: ${message.id})`);
}
