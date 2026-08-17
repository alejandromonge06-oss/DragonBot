const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField,
    MessageFlags
} = require("discord.js");
const { parseDuration } = require("./moderation");

const timers = new Map();

function getGuildConfig(config, guildId) {
    if (!config[guildId]) config[guildId] = {};
    return config[guildId];
}

function getSorteosConfig(config, guildId) {
    const gc = getGuildConfig(config, guildId);
    if (!gc.sorteos) gc.sorteos = { enabled: false, channel: null, active: {} };
    if (!gc.sorteos.active) gc.sorteos.active = {};
    return gc.sorteos;
}

function hasPermission(interaction, gc) {
    if (interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    if (interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return true;
    const roles = gc.panel?.roles || [];
    return roles.some(rid => interaction.member.roles.cache.has(rid));
}

function formatDuration(ms) {
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const parts = [];
    if (d) parts.push(`${d} día${d > 1 ? "s" : ""}`);
    if (h) parts.push(`${h}h`);
    if (m) parts.push(`${m}m`);
    if (sec) parts.push(`${sec}s`);
    return parts.join(" ");
}

function joinButton(messageId, participants) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`sorteo_join_${messageId}`)
            .setLabel(`🎉 Participar (${participants.length})`)
            .setStyle(ButtonStyle.Success)
    );
}

async function updateGiveawayMessage(client, config, saveConfig, guildId, messageId) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;
    const sorteos = getSorteosConfig(config, guildId);
    const g = sorteos.active[messageId];
    if (!g) return;

    const channel = guild.channels.cache.get(g.channelId);
    if (!channel) return;

    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message) {
        delete sorteos.active[messageId];
        saveConfig();
        return;
    }

    const endsAt = new Date(g.endsAt);
    const host = await client.users.fetch(g.hostId).catch(() => null);

    const embed = new EmbedBuilder()
        .setColor("#FF73FA")
        .setTitle("🎁 SORTEO")
        .setDescription(
            `**Premio:** ${g.prize}\n\n` +
            `👥 **Participantes:** ${g.participants.length}\n` +
            `🏆 **Ganadores:** ${g.winnersCount}\n` +
            `⏰ **Termina:** <t:${Math.floor(g.endsAt / 1000)}:R>`
        )
        .setFooter({ text: host ? `Creado por ${host.username}` : "DRAGONS | Sorteos" })
        .setTimestamp();

    await message.edit({ embeds: [embed], components: [joinButton(messageId, g.participants)] });
}

async function endGiveaway(client, config, saveConfig, guildId, messageId) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;
    const sorteos = getSorteosConfig(config, guildId);
    const g = sorteos.active[messageId];
    if (!g) return;

    clearTimer(guildId, messageId);

    const channel = guild.channels.cache.get(g.channelId);
    const participants = (g.participants || []).filter(id => id !== g.hostId);

    const winners = [];
    const pool = [...participants];
    for (let i = 0; i < g.winnersCount && pool.length; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        winners.push(pool.splice(idx, 1)[0]);
    }

    const host = await client.users.fetch(g.hostId).catch(() => null);

    const embed = new EmbedBuilder()
        .setColor("#FF73FA")
        .setTitle("🎁 SORTEO FINALIZADO")
        .setDescription(
            `**Premio:** ${g.prize}\n\n` +
            (winners.length
                ? `🏆 **Ganador${winners.length > 1 ? "es" : ""}:** ${winners.map(id => `<@${id}>`).join(", ")}`
                : "😔 No hubo participantes suficientes. El premio queda desierto.")
        )
        .setFooter({ text: host ? `Creado por ${host.username}` : "DRAGONS | Sorteos" })
        .setTimestamp();

    if (channel) {
        await channel.send({
            content: winners.length
                ? `🎉 ¡Felicidades ${winners.map(id => `<@${id}>`).join(", ")}! Ganasteis el sorteo **${g.prize}** 🎁`
                : null,
            embeds: [embed]
        }).catch(() => {});
    }

    delete sorteos.active[messageId];
    saveConfig();
}

function scheduleEnd(client, config, saveConfig, guildId, messageId, endsAt) {
    const delay = endsAt - Date.now();
    if (delay <= 0) {
        endGiveaway(client, config, saveConfig, guildId, messageId);
        return;
    }
    const MAX_DELAY = 2147483647;
    const t = setTimeout(() => {
        const remaining = endsAt - Date.now();
        if (remaining > 0) {
            scheduleEnd(client, config, saveConfig, guildId, messageId, endsAt);
        } else {
            endGiveaway(client, config, saveConfig, guildId, messageId);
        }
    }, Math.min(delay, MAX_DELAY));
    timers.set(`${guildId}:${messageId}`, t);
}

function clearTimer(guildId, messageId) {
    const key = `${guildId}:${messageId}`;
    if (timers.has(key)) {
        clearTimeout(timers.get(key));
        timers.delete(key);
    }
}

async function createGiveaway(interaction, config, saveConfig) {
    const guild = interaction.guild;
    const gc = getGuildConfig(config, guild.id);
    const sorteos = getSorteosConfig(config, guild.id);

    if (!hasPermission(interaction, gc)) {
        return interaction.reply({
            content: "❌ No tienes permiso para crear sorteos.",
            flags: MessageFlags.Ephemeral
        });
    }

    if (!sorteos.enabled) {
        return interaction.reply({
            content: "🔴 El sistema de sorteos está desactivado. Actívalo en `/panel` → 🎁 Sorteos.",
            flags: MessageFlags.Ephemeral
        });
    }

    const premio = interaction.options.getString("premio");
    const duracionStr = interaction.options.getString("duracion");
    const ganadores = interaction.options.getInteger("ganadores") || 1;
    const canal = interaction.options.getChannel("canal") ||
        (sorteos.channel ? guild.channels.cache.get(sorteos.channel) : null);

    if (!canal) {
        return interaction.reply({
            content: "❌ Configura primero un canal de sorteos en `/panel` → 🎁 Sorteos, o pasa el canal con la opción `canal`.",
            flags: MessageFlags.Ephemeral
        });
    }

    const ms = parseDuration(duracionStr);
    if (!ms) {
        return interaction.reply({
            content: "❌ Duración inválida. Usa formato como `30s`, `5m`, `1h`, `2d`, `1w` (máximo 28 días).",
            flags: MessageFlags.Ephemeral
        });
    }

    const endsAt = Date.now() + ms;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const embed = new EmbedBuilder()
        .setColor("#FF73FA")
        .setTitle("🎁 SORTEO")
        .setDescription(
            `**Premio:** ${premio}\n\n` +
            `👥 **Participantes:** 0\n` +
            `🏆 **Ganadores:** ${ganadores}\n` +
            `⏰ **Termina:** <t:${Math.floor(endsAt / 1000)}:R>`
        )
        .setFooter({ text: `Creado por ${interaction.user.username}` })
        .setTimestamp();

    const message = await canal.send({
        content: `🎁 ¡Nuevo sorteo! Pulsa el botón para participar en **${premio}**.`,
        embeds: [embed],
        components: [joinButton("pending", [])]
    });

    const messageId = message.id;
    sorteos.active[messageId] = {
        channelId: canal.id,
        prize: premio,
        endsAt,
        winnersCount: ganadores,
        hostId: interaction.user.id,
        participants: []
    };
    saveConfig();

    await message.edit({ embeds: [embed], components: [joinButton(messageId, [])] });
    scheduleEnd(interaction.client, config, saveConfig, guild.id, messageId, endsAt);

    await interaction.editReply({
        content: `✅ Sorteo creado en ${canal}.\n🏆 Premio: **${premio}**\n⏰ Duración: ${formatDuration(ms)}`
    });
}

async function joinGiveaway(interaction, config, saveConfig) {
    const guild = interaction.guild;
    const sorteos = getSorteosConfig(config, guild.id);
    const messageId = interaction.customId.replace("sorteo_join_", "");
    const g = sorteos.active[messageId];

    if (!g) {
        return interaction.reply({
            content: "❌ Este sorteo ya no está activo.",
            flags: MessageFlags.Ephemeral
        });
    }

    await interaction.deferUpdate().catch(() => {});

    const userId = interaction.user.id;
    if (g.participants.includes(userId)) {
        g.participants = g.participants.filter(id => id !== userId);
    } else {
        g.participants.push(userId);
    }
    saveConfig();

    await updateGiveawayMessage(interaction.client, config, saveConfig, guild.id, messageId);

    const joined = g.participants.includes(userId);
    const replyMsg = joined
        ? `✅ Te has unido al sorteo **${g.prize}**. ¡Buena suerte! 🍀`
        : `❌ Te has salido del sorteo **${g.prize}**.`;
    if (interaction.deferred) {
        await interaction.editReply({ content: replyMsg });
    } else {
        await interaction.reply({ content: replyMsg, flags: MessageFlags.Ephemeral });
    }
}

async function handleGiveawayInteraction(interaction, config, saveConfig) {
    if (interaction.isCommand() && interaction.commandName === "sorteo") {
        await createGiveaway(interaction, config, saveConfig);
        return true;
    }

    if (interaction.isButton() && interaction.customId?.startsWith("sorteo_join_")) {
        await joinGiveaway(interaction, config, saveConfig);
        return true;
    }

    return false;
}

function setupGiveaways(client, config, saveConfig) {
    for (const [guildId, gc] of Object.entries(config)) {
        const sorteos = gc?.sorteos;
        if (!sorteos?.active) continue;
        for (const [messageId, g] of Object.entries(sorteos.active)) {
            scheduleEnd(client, config, saveConfig, guildId, messageId, g.endsAt);
        }
    }
}

module.exports = {
    setupGiveaways,
    handleGiveawayInteraction,
    endGiveaway
};
