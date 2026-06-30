require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs   = require('fs');
const path = require('path');
const { attachMessageListener } = require('./messageListener');
const { backfillAllGuilds }    = require('./backfill');

const REQUIRED_ENV = ['DISCORD_TOKEN', 'CLIENT_ID'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Prevent unhandled client errors from crashing the process
client.on('error', err => console.error('[client error]', err));

// Load slash commands from ./commands/
client.commands = new Collection();
const commandsDir = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'))) {
  const command = require(path.join(commandsDir, file));
  client.commands.set(command.data.name, command);
}

// Dispatch incoming interactions to the right command
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`Error in /${interaction.commandName}:`, err.message);
    try {
      const reply = { content: 'Something went wrong running that command.', flags: 64 };
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(reply);
      } else {
        await interaction.reply(reply);
      }
    } catch {
      // Interaction already expired — nothing to do
    }
  }
});

// Passive message tracking
attachMessageListener(client);

client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Tracking messages in: ${client.guilds.cache.map(g => g.name).join(', ')}`);
  console.log('[backfill] Starting historical message backfill...');
  await backfillAllGuilds(client);
  console.log('[backfill] Done.');
});

client.login(process.env.DISCORD_TOKEN);
