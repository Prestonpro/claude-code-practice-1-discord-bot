/**
 * Run this once with `npm run deploy` to register slash commands with Discord.
 * Re-run any time you add or change a command.
 */
require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs   = require('fs');
const path = require('path');

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('DISCORD_TOKEN, CLIENT_ID, and GUILD_ID must all be set in .env');
  process.exit(1);
}

const commands = [];
const commandsDir = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'))) {
  const { data } = require(path.join(commandsDir, file));
  commands.push(data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

(async () => {
  try {
    console.log(`Registering ${commands.length} slash command(s)...`);
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands },
    );
    console.log('Done! Commands registered to guild.');
  } catch (err) {
    console.error(err);
  }
})();
