import { Client, GatewayIntentBits } from 'discord.js';
import { config } from './config';
import { onInteractionCreate } from './events/interactionCreate';
import { onReady } from './events/ready';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

client.once('ready', () => onReady(client));
client.on('interactionCreate', onInteractionCreate);

client.login(config.token).catch((err) => {
  console.error('Failed to log in:', err);
  process.exit(1);
});
