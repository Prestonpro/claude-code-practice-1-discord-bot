const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { saveMessage } = require('./database');

/**
 * On startup, walk every readable text channel in every guild and store
 * all historical messages. INSERT OR IGNORE in the DB means re-running
 * is safe — already-stored messages are silently skipped.
 */
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
  console.log(`[backfill] ${guild.name}: ${guildTotal} messages stored`);
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
      // No access or rate-limited — skip this channel
      console.warn(`[backfill] Skipping #${channel.name}: ${err.message}`);
      break;
    }

    if (batch.size === 0) break;

    for (const [, msg] of batch) {
      if (msg.author.bot) continue;
      if (!msg.content.trim()) continue;

      saveMessage({
        messageId: msg.id,
        guildId:   msg.guild.id,
        channelId: msg.channel.id,
        userId:    msg.author.id,
        username:  msg.author.username,
        content:   msg.content,
        timestamp: msg.createdTimestamp,
      });
      stored++;
    }

    lastId = batch.last().id;

    // Stop paginating when we got a partial batch (reached the beginning)
    if (batch.size < 100) break;

    // Respect Discord's rate limit: ~5 requests/5s per channel
    await sleep(1100);
  }

  return stored;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { backfillAllGuilds };
