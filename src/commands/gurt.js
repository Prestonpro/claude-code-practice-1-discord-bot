const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database');

const MAX_QUOTES_PER_PAGE = 10;

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
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    // No user supplied → show server-wide stats
    if (!userArg) {
      return showStats(interaction, word);
    }

    // User supplied → show their quotes
    return showQuotes(interaction, word, userArg.trim(), page);
  },
};

async function showStats(interaction, word) {
  const stats = db.getWordStats(interaction.guildId, word);

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

async function showQuotes(interaction, word, userArg, page) {
  const found = db.findUserByName(interaction.guildId, userArg);

  if (!found) {
    return interaction.editReply(
      `Couldn't find **${userArg}** in my records. They may not have spoken since the bot joined.`
    );
  }

  const quotes = db.getUserQuotes(interaction.guildId, found.userId, word);

  if (quotes.length === 0) {
    return interaction.editReply(
      `**${found.username}** has never said **${word}** (or the bot hasn't seen it).`
    );
  }

  const totalPages = Math.ceil(quotes.length / MAX_QUOTES_PER_PAGE);
  const safePage   = Math.min(page, totalPages);
  const slice      = quotes.slice((safePage - 1) * MAX_QUOTES_PER_PAGE, safePage * MAX_QUOTES_PER_PAGE);

  const lines = slice.map((q, i) => {
    const date = new Date(q.timestamp).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
    const globalIndex = (safePage - 1) * MAX_QUOTES_PER_PAGE + i + 1;
    return `**${globalIndex}.** *${date}*\n> ${highlightWord(q.content, word)}`;
  });

  const embed = new EmbedBuilder()
    .setTitle(`Every time ${found.username} said "${word}"`)
    .setColor(0xeb459e)
    .setDescription(lines.join('\n\n'))
    .setFooter({
      text: `${quotes.length} total quote${quotes.length !== 1 ? 's' : ''} · Page ${safePage}/${totalPages}`,
    })
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}

function highlightWord(content, word) {
  const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'gi');
  return content.replace(regex, match => `**${match}**`);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
