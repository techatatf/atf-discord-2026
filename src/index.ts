import { Client, GatewayIntentBits } from 'discord.js';
import { config } from './config';
import { onGuildMemberAdd } from './events/guildMemberAdd';
import { onInteractionCreate } from './events/interactionCreate';
import { onReady } from './events/ready';
import { registerInviteEvents } from './invite/tracking';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites,
  ],
});

client.once('ready', () => onReady(client));
client.on('interactionCreate', onInteractionCreate);
client.on('guildMemberAdd', onGuildMemberAdd);
registerInviteEvents(client);

client.login(config.token).catch((err) => {
  console.error('Failed to log in:', err);
  process.exit(1);
});
