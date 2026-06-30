const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const db = require('../database');

const MAX_QUOTES_PER_PAGE = 10;
const COLLECTOR_TIMEOUT   = 5 * 60 * 1000; // 5 minutes

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gurt')
    .setDescription('Word stats for the server — or quote a specific user')
    .addStringOption(opt =>
      opt.setName('word')
        .setDescription('The word to look up')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('user')
        .setDescription('Username to quote (omit to see server-wide stats)')
        .setRequired(false)
    )
    .addIntegerOption(opt =>
      opt.setName('page')
        .setDescription('Page number for quotes (default: 1)')
        .setMinValue(1)
    ),

  async execute(interaction) {
    const word    = interaction.options.getString('word').toLowerCase().trim();
    const userArg = interaction.options.getString('user');
    const page    = interaction.options.getInteger('page') ?? 1;

    if (word.includes(' ')) {
      return interaction.reply({
        content: 'Please provide a single word (no spaces).',
        flags: 64,
      });
    }

    await interaction.deferReply();

    if (!userArg) {
      return showStats(interaction, word);
    }

    return showQuotes(interaction, word, userArg.trim(), page);
  },
};

async function showStats(interaction, word) {
  const stats = await db.getWordStats(interaction.guildId, word);

  if (stats.length === 0) {
    return interaction.editReply(`No one has said **${word}** yet (or the bot hasn't seen it).`);
  }

  const embed = new EmbedBuilder()
    .setTitle(`Word stats: "${word}"`)
    .setColor(0x5865f2)
    .setDescription(
      stats
        .map((row, i) =>
          `**${i + 1}.** ${row.username} — **${row.count}** time${row.count !== 1 ? 's' : ''}`
        )
        .join('\n')
    )
    .setFooter({ text: `Tip: /gurt ${word} <username> to see their quotes` })
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}

async function showQuotes(interaction, word, userArg, initialPage) {
  const found = await db.findUserByName(interaction.guildId, userArg);

  if (!found) {
    return interaction.editReply(
      `Couldn't find **${userArg}** in my records. They may not have spoken since the bot joined.`
    );
  }

  const quotes = await db.getUserQuotes(interaction.guildId, found.userId, word);

  if (quotes.length === 0) {
    return interaction.editReply(
      `**${found.username}** has never said **${word}** (or the bot hasn't seen it).`
    );
  }

  const totalPages = Math.ceil(quotes.length / MAX_QUOTES_PER_PAGE);
  let currentPage  = Math.min(initialPage, totalPages);

  const buildEmbed = (p) => {
    const slice = quotes.slice((p - 1) * MAX_QUOTES_PER_PAGE, p * MAX_QUOTES_PER_PAGE);
    const lines = slice.map((q, i) => {
      const date = new Date(Number(q.timestamp)).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });
      const globalIndex = (p - 1) * MAX_QUOTES_PER_PAGE + i + 1;
      return `**${globalIndex}.** *${date}*\n> ${highlightWord(q.content, word)}`;
    });

    return new EmbedBuilder()
      .setTitle(`Every time ${found.username} said "${word}"`)
      .setColor(0xeb459e)
      .setDescription(lines.join('\n\n'))
      .setFooter({
        text: `${quotes.length} total quote${quotes.length !== 1 ? 's' : ''} · Page ${p}/${totalPages}`,
      })
      .setTimestamp();
  };

  const buildRow = (p) => new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('prev')
      .setLabel('← Prev')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(p <= 1),
    new ButtonBuilder()
      .setCustomId('next')
      .setLabel('Next →')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(p >= totalPages),
  );

  await interaction.editReply({
    embeds: [buildEmbed(currentPage)],
    components: totalPages > 1 ? [buildRow(currentPage)] : [],
  });

  if (totalPages <= 1) return;

  const message   = await interaction.fetchReply();
  const collector = message.createMessageComponentCollector({ time: COLLECTOR_TIMEOUT });

  collector.on('collect', async btn => {
    try {
      if (btn.user.id !== interaction.user.id) {
        return btn.reply({
          content: 'Only the person who ran this command can flip pages.',
          ephemeral: true,
        });
      }

      if (btn.customId === 'prev') currentPage = Math.max(1, currentPage - 1);
      if (btn.customId === 'next') currentPage = Math.min(totalPages, currentPage + 1);

      await btn.update({
        embeds: [buildEmbed(currentPage)],
        components: [buildRow(currentPage)],
      });
    } catch (err) {
      console.error('[gurt] button update failed:', err.message);
    }
  });

  collector.on('end', async () => {
    try {
      await interaction.editReply({ components: [] });
    } catch {} // message may have been deleted
  });
}

function highlightWord(content, word) {
  const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'gi');
  return content.replace(regex, match => `**${match}**`);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
