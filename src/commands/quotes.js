const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database');

const MAX_QUOTES_PER_PAGE = 10;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('quotes')
    .setDescription('Show every time a user said a specific word')
    .addStringOption(opt =>
      opt.setName('word')
        .setDescription('The word to search for')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('user')
        .setDescription('Username (or part of it) to filter by')
        .setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName('page')
        .setDescription('Page number (default: 1)')
        .setMinValue(1)
    ),

  async execute(interaction) {
    const word     = interaction.options.getString('word').toLowerCase().trim();
    const userArg  = interaction.options.getString('user').trim();
    const page     = interaction.options.getInteger('page') ?? 1;

    if (word.includes(' ')) {
      return interaction.reply({
        content: 'Please provide a single word (no spaces).',
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    const found = db.findUserByName(interaction.guildId, userArg);

    if (!found) {
      return interaction.editReply(
        `I couldn't find a user matching **${userArg}** in my records. They may not have spoken since the bot joined.`
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
      const highlighted = highlightWord(q.content, word);
      return `**${globalIndex}.** *${date}*\n> ${highlighted}`;
    });

    const embed = new EmbedBuilder()
      .setTitle(`Every time ${found.username} said "${word}"`)
      .setColor(0xeb459e)
      .setDescription(lines.join('\n\n'))
      .setFooter({ text: `${quotes.length} total quote${quotes.length !== 1 ? 's' : ''} · Page ${safePage}/${totalPages}` })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  },
};

/** Wrap occurrences of word in **bold** so it stands out in the embed. */
function highlightWord(content, word) {
  const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'gi');
  return content.replace(regex, match => `**${match}**`);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
