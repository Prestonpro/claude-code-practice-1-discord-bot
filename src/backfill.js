const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { saveMessage } = require('./database');

async function backfillAllGuilds(client) {
  for (const [, guild] of client.guilds.cache) {
    await backfillGuild(guild);
  }
}

async function backfillGuild(guild) {
  const textChannels = guild.channels.cache.filter(ch => {
    if (ch.type !== ChannelType.GuildText) return false;
    if (!ch.viewable) return false;
    const perms = ch.permissionsFor(guild.members.me);
    return perms && perms.has(PermissionFlagsBits.ReadMessageHistory);
  });

  let guildTotal = 0;
  for (const [, channel] of textChannels) {
    const count = await backfillChannel(channel);
    guildTotal += count;
  }
  console.log(`[backfill] ${guild.name}: ${guildTotal} new messages stored`);
}

async function backfillChannel(channel) {
  let stored = 0;
  let lastId  = null;

  while (true) {
    const options = { limit: 100 };
    if (lastId) options.before = lastId;

    let batch;
    try {
      batch = await channel.messages.fetch(options);
    } catch (err) {
      console.warn(`[backfill] Skipping #${channel.name}: ${err.message}`);
      break;
    }

    if (batch.size === 0) break;

    for (const [, msg] of batch) {
      if (msg.author.bot) continue;
      if (!msg.content.trim()) continue;

      const inserted = await saveMessage({
        messageId: msg.id,
        guildId:   msg.guild.id,
        channelId: msg.channel.id,
        userId:    msg.author.id,
        username:  msg.author.username,
        content:   msg.content,
        timestamp: msg.createdTimestamp,
      });
      stored += inserted;
    }

    lastId = batch.last().id;
    if (batch.size < 100) break;

    await sleep(1100);
  }

  return stored;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { backfillAllGuilds };
