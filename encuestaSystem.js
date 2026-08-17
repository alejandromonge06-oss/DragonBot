const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    PermissionsBitField,
    MessageFlags
} = require("discord.js");
const { parseDuration, formatDuration } = require("./moderation");

const EMOJI_NUMBERS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
const DEFAULT_DURATION_MS = 3600000;

const timers = new Map();

function getGuildConfig(config, guildId) {
    if (!config[guildId]) config[guildId] = {};
    return config[guildId];
}

function ensureEncuestasSettings(ec) {
    if (!ec || typeof ec !== "object") ec = {};
    if (!ec.settings || typeof ec.settings !== "object") ec.settings = {};
    const s = ec.settings;
    s.enabled = s.enabled === true;
    s.channel = s.channel || null;
    s.defaultDuration = s.defaultDuration || "1h";
    s.pollType = s.pollType === "multiple" ? "multiple" : "unica";
    s.liveResults = s.liveResults !== false;
    s.allowChange = s.allowChange !== false;
    s.maxParticipants = Number(s.maxParticipants) > 0 ? Number(s.maxParticipants) : 0;
    s.autoDeletePrev = s.autoDeletePrev !== false;
    if (ec.active === undefined) ec.active = null;
    return ec;
}

function getEncuestasConfig(config, guildId) {
    const gc = getGuildConfig(config, guildId);
    if (!gc.encuestas) gc.encuestas = { active: null };
    return ensureEncuestasSettings(gc.encuestas);
}

function hasPermission(interaction, gc) {
    if (!interaction.member) return false;
    if (interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    if (interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return true;
    const roles = gc.panel?.roles || [];
    return roles.some(rid => interaction.member.roles.cache.has(rid));
}

function row(components) {
    return new ActionRowBuilder().addComponents(components);
}

function computeCounts(g) {
    const votes = g.votes || {};
    const counts = g.options.map((_, i) => (votes[String(i)] || []).length);
    const unique = new Set();
    for (const arr of Object.values(votes)) {
        if (Array.isArray(arr)) {
            for (const id of arr) unique.add(id);
        }
    }
    const total = unique.size;
    let leader = -1;
    let max = -1;
    counts.forEach((c, i) => {
        if (c > max) { max = c; leader = i; }
    });
    return { counts, total, leader: leader >= 0 ? leader : null };
}

function getUserVote(g, userId) {
    const votes = g.votes || {};
    for (const key of Object.keys(votes)) {
        if (Array.isArray(votes[key]) && votes[key].includes(userId)) {
            return Number(key);
        }
    }
    return null;
}

function getAllUserVotes(g, userId) {
    const res = [];
    const votes = g.votes || {};
    for (const key of Object.keys(votes)) {
        if (Array.isArray(votes[key]) && votes[key].includes(userId)) {
            res.push(Number(key));
        }
    }
    return res;
}

function percentLines(g, finished) {
    const { counts, total, leader } = computeCounts(g);
    const lines = g.options.map((opt, i) => {
        const c = counts[i];
        const pct = total ? Math.round((c / total) * 100) : 0;
        const bar = "▰".repeat(Math.round(pct / 10)).padEnd(10, "▱");
        return `${EMOJI_NUMBERS[i]} **${opt}**\n　✅ ${c} voto${c === 1 ? "" : "s"} · **${pct}%** \`${bar}\``;
    });

    const header = finished
        ? (leader !== null
            ? `🏆 **Ganadora:** *${g.options[leader]}*`
            : "🏆 **Ganadora:** — (sin votos)")
        : (leader !== null
            ? `🏆 **Ganando:** *${g.options[leader]}*`
            : "🏆 **Ganando:** — (aún sin votos)");

    return { lines, total, header };
}

function renderPoll(g, finished = false) {
    const showCounts = finished || g.liveResults !== false;

    let lines;
    let totalLine;
    let header;
    if (showCounts) {
        const p = percentLines(g, finished);
        lines = p.lines;
        totalLine = `👥 **Participantes:** ${p.total}`;
        header = p.header;
    } else {
        lines = g.options.map((opt, i) => `${EMOJI_NUMBERS[i]} **${opt}**`);
        totalLine = "👥 **Participantes:** 🔒 oculto";
        header = "🔒 **Resultados ocultos hasta el final**";
    }

    const description = [
        `**${g.question}**`,
        "",
        ...lines,
        "",
        totalLine,
        header
    ];

    if (!finished) {
        description.push(`⏰ **Termina:** <t:${Math.floor(g.endsAt / 1000)}:R>`);
    }

    return new EmbedBuilder()
        .setColor("#FF73FA")
        .setTitle(finished ? "🗳️ ENCUESTA FINALIZADA" : "🗳️ ENCUESTA")
        .setDescription(description.join("\n"))
        .setFooter({
            text: `Creada por ${g.hostName || "un administrador"} · Cambiar voto: ${g.allowChange ? "Sí" : "No"}`
        })
        .setTimestamp();
}

function renderComponents(g, finished = false) {
    const { counts, total } = computeCounts(g);
    const showCounts = finished || g.liveResults !== false;

    const select = new StringSelectMenuBuilder()
        .setCustomId(`encuesta_voto_${g.messageId}`)
        .setPlaceholder(finished ? "🔒 Encuesta cerrada" : "🗳️ Elige una opción para votar")
        .setDisabled(finished)
        .setMinValues(1)
        .setMaxValues(g.pollType === "multiple" ? Math.min(10, g.options.length) : 1)
        .addOptions(g.options.map((opt, i) => {
            const c = counts[i];
            const pct = total ? Math.round((c / total) * 100) : 0;
            const desc = showCounts ? `Votos: ${c} · ${pct}%` : "🔒";
            return new StringSelectMenuOptionBuilder()
                .setLabel(opt)
                .setDescription(desc)
                .setValue(String(i));
        }));

    const adminRow = row([
        new ButtonBuilder()
            .setCustomId(`encuesta_finalizar_${g.messageId}`)
            .setLabel("Finalizar")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("🔒")
            .setDisabled(finished),
        new ButtonBuilder()
            .setCustomId(`encuesta_cancelar_${g.messageId}`)
            .setLabel("Cancelar")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("❌")
            .setDisabled(finished),
        new ButtonBuilder()
            .setCustomId(`encuesta_reiniciar_${g.messageId}`)
            .setLabel("Reiniciar")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("🔄")
            .setDisabled(finished),
        new ButtonBuilder()
            .setCustomId(`encuesta_resultados_${g.messageId}`)
            .setLabel("Resultados")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("📊")
            .setDisabled(finished)
    ]);

    return [row(select), adminRow];
}

function clearTimer(guildId) {
    if (timers.has(guildId)) {
        clearTimeout(timers.get(guildId));
        timers.delete(guildId);
    }
}

function scheduleEnd(client, config, saveConfig, guildId, endsAt) {
    const delay = endsAt - Date.now();
    if (delay <= 0) {
        finalizePoll(client, config, saveConfig, guildId);
        return;
    }
    const MAX_DELAY = 2147483647;
    const t = setTimeout(() => {
        const remaining = endsAt - Date.now();
        if (remaining > 0) {
            scheduleEnd(client, config, saveConfig, guildId, endsAt);
        } else {
            finalizePoll(client, config, saveConfig, guildId);
        }
    }, Math.min(delay, MAX_DELAY));
    timers.set(guildId, t);
}

async function deletePollMessage(guild, g) {
    if (!g) return;
    const channel = guild.channels.cache.get(g.channelId);
    if (!channel) return;
    const message = await channel.messages.fetch(g.messageId).catch(() => null);
    if (message) {
        await message.delete().catch(() => {});
    }
}

async function createPoll(interaction, config, saveConfig) {
    const pregunta = interaction.options.getString("pregunta");
    const opcionesStr = interaction.options.getString("opciones");
    const duracionStr = interaction.options.getString("duracion");
    const permiteCambiar = interaction.options.getBoolean("permite_cambiar");

    return startPoll(interaction, config, saveConfig, {
        pregunta,
        opcionesStr,
        duracionStr,
        allowChange: permiteCambiar
    });
}

async function startPoll(interaction, config, saveConfig, overrides) {
    const guild = interaction.guild;
    const gc = getGuildConfig(config, guild.id);
    const encuestas = getEncuestasConfig(config, guild.id);
    const s = encuestas.settings;

    if (!hasPermission(interaction, gc)) {
        return interaction.reply({
            content: "❌ Solo administradores o staff pueden crear encuestas.",
            flags: MessageFlags.Ephemeral
        });
    }

    if (!s.enabled) {
        return interaction.reply({
            content: "❌ El sistema de encuestas está **desactivado**.\nActívalo desde `/panel` → 🗳️ Encuestas → **Activar**.",
            flags: MessageFlags.Ephemeral
        });
    }

    const pregunta = overrides.pregunta;
    const opcionesStr = overrides.opcionesStr;
    const duracionStr = overrides.duracionStr || s.defaultDuration || "1h";
    const permiteCambiar = overrides.allowChange ?? s.allowChange;

    const options = String(opcionesStr || "")
        .split(",")
        .map(str => str.trim())
        .filter(Boolean)
        .slice(0, 10);

    if (options.length < 2) {
        return interaction.reply({
            content: "❌ Necesitas al menos **2 opciones** separadas por coma (máximo 10).",
            flags: MessageFlags.Ephemeral
        });
    }

    const ms = parseDuration(duracionStr);
    if (!ms) {
        return interaction.reply({
            content: "❌ Duración inválida. Usa: `30s`, `5m`, `1h`, `1d`, `1w` (máximo 28 días).",
            flags: MessageFlags.Ephemeral
        });
    }

    const channel = s.channel ? guild.channels.cache.get(s.channel) : interaction.channel;
    if (!channel) {
        return interaction.reply({
            content: "❌ El canal de encuestas configurado no existe o no es visible.\nRevisa la configuración en `/panel` → 🗳️ Encuestas.",
            flags: MessageFlags.Ephemeral
        });
    }

    // 1) Gestionar la encuesta activa anterior (solo se borra el mensaje guardado de esa encuesta).
    const prev = encuestas.active;
    if (prev) {
        clearTimer(guild.id);
        if (s.autoDeletePrev) {
            await deletePollMessage(guild, prev);
        }
    }

    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
    }

    const endsAt = Date.now() + ms;

    const tempId = "pending";
    const embed = renderPoll({
        question: pregunta,
        options,
        endsAt,
        allowChange: permiteCambiar,
        hostName: interaction.user.username,
        pollType: s.pollType,
        liveResults: s.liveResults
    });
    const message = await channel.send({
        embeds: [embed],
        components: [row(new StringSelectMenuBuilder()
            .setCustomId(`encuesta_voto_${tempId}`)
            .setPlaceholder("🗳️ Elige una opción para votar")
            .setDisabled(false)
            .addOptions(options.map((opt, i) =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(opt)
                    .setDescription("Votos: 0 · 0%")
                    .setValue(String(i))
            )))]
    });

    const g = {
        messageId: message.id,
        channelId: channel.id,
        question: pregunta,
        options,
        endsAt,
        durationMs: ms,
        hostId: interaction.user.id,
        hostName: interaction.user.username,
        allowChange: permiteCambiar,
        pollType: s.pollType || "unica",
        liveResults: s.liveResults !== false,
        maxParticipants: s.maxParticipants || 0,
        votes: {}
    };

    encuestas.active = g;
    saveConfig();

    await message.edit({
        embeds: [renderPoll(g)],
        components: renderComponents(g, false)
    });

    scheduleEnd(interaction.client, config, saveConfig, guild.id, endsAt);

    const replyMsg = `✅ Encuesta creada en ${channel}.\n📝 Pregunta: **${pregunta}**\n⏰ Duración: ${formatDuration(ms)}\n🔁 Cambiar voto: ${permiteCambiar ? "Sí" : "No"}`;
    if (interaction.deferred) {
        await interaction.editReply({ content: replyMsg });
    } else {
        await interaction.reply({ content: replyMsg, flags: MessageFlags.Ephemeral });
    }
}

async function castVote(interaction, config, saveConfig) {
    const guildId = interaction.guild.id;
    const encuestas = getEncuestasConfig(config, guildId);
    const g = encuestas.active;

    if (!g) {
        return interaction.reply({
            content: "❌ Esta encuesta ya no está activa.",
            flags: MessageFlags.Ephemeral
        });
    }

    const messageId = interaction.customId.replace("encuesta_voto_", "");
    if (g.messageId !== messageId) {
        return interaction.reply({
            content: "❌ Esta encuesta ya no está activa.",
            flags: MessageFlags.Ephemeral
        });
    }

    const userId = interaction.user.id;

    if (g.pollType === "multiple") {
        const userVotes = getAllUserVotes(g, userId);
        if (!g.allowChange && userVotes.length) {
            return interaction.reply({
                content: "❌ Ya votaste. Esta encuesta no permite cambiar el voto.",
                flags: MessageFlags.Ephemeral
            });
        }
        const { total } = computeCounts(g);
        if (g.maxParticipants && !userVotes.length && total >= g.maxParticipants) {
            return interaction.reply({
                content: `❌ Se alcanzó el límite de participantes (${g.maxParticipants}).`,
                flags: MessageFlags.Ephemeral
            });
        }
        const desired = interaction.values
            .map(Number)
            .filter(idx => Number.isInteger(idx) && idx >= 0 && idx < g.options.length);
        if (!desired.length) {
            return interaction.reply({
                content: "❌ Opción inválida.",
                flags: MessageFlags.Ephemeral
            });
        }

        for (const k of Object.keys(g.votes)) {
            g.votes[k] = g.votes[k].filter(id => id !== userId);
        }
        for (const idx of desired) {
            const k = String(idx);
            if (!g.votes[k]) g.votes[k] = [];
            if (!g.votes[k].includes(userId)) g.votes[k].push(userId);
        }

        saveConfig();
        await interaction.update({
            embeds: [renderPoll(g)],
            components: renderComponents(g, false)
        });
        await interaction.followUp({
            content: `✅ Voto registrado en ${desired.length} opción${desired.length > 1 ? "es" : ""}.`,
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
        return;
    }

    const optionIdx = Number(interaction.values[0]);
    if (!Number.isInteger(optionIdx) || optionIdx < 0 || optionIdx >= g.options.length) {
        return interaction.reply({
            content: "❌ Opción inválida.",
            flags: MessageFlags.Ephemeral
        });
    }

    const key = String(optionIdx);
    const current = getUserVote(g, userId);
    let message;

    if (current !== null) {
        if (!g.allowChange) {
            return interaction.reply({
                content: `❌ Ya votaste en **${g.options[current]}**. Esta encuesta no permite cambiar el voto.`,
                flags: MessageFlags.Ephemeral
            });
        }
        if (current === optionIdx) {
            return interaction.reply({
                content: `ℹ️ Ya estás votando en **${g.options[optionIdx]}**.`,
                flags: MessageFlags.Ephemeral
            });
        }
        g.votes[String(current)] = g.votes[String(current)].filter(id => id !== userId);
        if (!g.votes[key]) g.votes[key] = [];
        g.votes[key].push(userId);
        message = `✅ Cambiaste tu voto a **${g.options[optionIdx]}**.`;
    } else {
        const { total } = computeCounts(g);
        if (g.maxParticipants && total >= g.maxParticipants) {
            return interaction.reply({
                content: `❌ Se alcanzó el límite de participantes (${g.maxParticipants}).`,
                flags: MessageFlags.Ephemeral
            });
        }
        if (!g.votes[key]) g.votes[key] = [];
        g.votes[key].push(userId);
        message = `✅ Voto registrado en **${g.options[optionIdx]}**.`;
    }

    saveConfig();
    await interaction.update({
        embeds: [renderPoll(g)],
        components: renderComponents(g, false)
    });
    await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral }).catch(() => {});
}

async function finalizePoll(client, config, saveConfig, guildId) {
    const encuestas = getEncuestasConfig(config, guildId);
    const g = encuestas.active;
    if (!g) return;

    clearTimer(guildId);

    const guild = client.guilds.cache.get(guildId);
    const channel = guild?.channels.cache.get(g.channelId);
    if (channel) {
        const message = await channel.messages.fetch(g.messageId).catch(() => null);
        if (message) {
            await message.edit({
                embeds: [renderPoll(g, true)],
                components: renderComponents(g, true)
            }).catch(() => {});
        }
    }

    encuestas.active = null;
    saveConfig();
}

async function finalizeFromButton(interaction, config, saveConfig) {
    const encuestas = getEncuestasConfig(config, interaction.guild.id);
    const g = encuestas.active;
    if (!g) {
        return interaction.reply({
            content: "❌ No hay una encuesta activa.",
            flags: MessageFlags.Ephemeral
        });
    }
    if (g.messageId !== interaction.customId.replace("encuesta_finalizar_", "")) {
        return interaction.reply({
            content: "❌ Esta encuesta ya no está activa.",
            flags: MessageFlags.Ephemeral
        });
    }

    clearTimer(interaction.guild.id);
    encuestas.active = null;
    saveConfig();

    await interaction.update({
        embeds: [renderPoll(g, true)],
        components: renderComponents(g, true)
    });
    await interaction.followUp({
        content: "🔒 Encuesta finalizada. Resultados publicados.",
        flags: MessageFlags.Ephemeral
    }).catch(() => {});
}

async function cancelPoll(interaction, config, saveConfig) {
    const encuestas = getEncuestasConfig(config, interaction.guild.id);
    const g = encuestas.active;
    if (!g) {
        return interaction.reply({
            content: "❌ No hay una encuesta activa.",
            flags: MessageFlags.Ephemeral
        });
    }
    if (g.messageId !== interaction.customId.replace("encuesta_cancelar_", "")) {
        return interaction.reply({
            content: "❌ Esta encuesta ya no está activa.",
            flags: MessageFlags.Ephemeral
        });
    }

    await interaction.deferUpdate().catch(() => {});

    clearTimer(interaction.guild.id);
    await deletePollMessage(interaction.guild, g);
    encuestas.active = null;
    saveConfig();

    await interaction.followUp({
        content: "❌ Encuesta cancelada. Se eliminó el mensaje de la encuesta.",
        flags: MessageFlags.Ephemeral
    }).catch(() => {});
}

async function resetPoll(interaction, config, saveConfig) {
    const encuestas = getEncuestasConfig(config, interaction.guild.id);
    const g = encuestas.active;
    if (!g) {
        return interaction.reply({
            content: "❌ No hay una encuesta activa.",
            flags: MessageFlags.Ephemeral
        });
    }
    if (g.messageId !== interaction.customId.replace("encuesta_reiniciar_", "")) {
        return interaction.reply({
            content: "❌ Esta encuesta ya no está activa.",
            flags: MessageFlags.Ephemeral
        });
    }

    g.votes = {};
    g.endsAt = Date.now() + (g.durationMs || DEFAULT_DURATION_MS);
    saveConfig();

    clearTimer(interaction.guild.id);
    scheduleEnd(interaction.client, config, saveConfig, interaction.guild.id, g.endsAt);

    await interaction.update({
        embeds: [renderPoll(g)],
        components: renderComponents(g, false)
    });
    await interaction.followUp({
        content: "🔄 Encuesta reiniciada: votos eliminados y tiempo reiniciado.",
        flags: MessageFlags.Ephemeral
    }).catch(() => {});
}

async function showResults(interaction, config, saveConfig) {
    const encuestas = getEncuestasConfig(config, interaction.guild.id);
    const g = encuestas.active;
    if (!g) {
        return interaction.reply({
            content: "❌ No hay una encuesta activa.",
            flags: MessageFlags.Ephemeral
        });
    }
    if (g.messageId !== interaction.customId.replace("encuesta_resultados_", "")) {
        return interaction.reply({
            content: "❌ Esta encuesta ya no está activa.",
            flags: MessageFlags.Ephemeral
        });
    }

    const { counts, total, leader } = computeCounts(g);
    const lines = g.options.map((opt, i) => {
        const pct = total ? Math.round((counts[i] / total) * 100) : 0;
        return `${EMOJI_NUMBERS[i]} **${opt}** — ${counts[i]} voto${counts[i] === 1 ? "" : "s"} (${pct}%)`;
    });

    const embed = new EmbedBuilder()
        .setColor("#FF73FA")
        .setTitle("📊 Resultados de la encuesta")
        .setDescription(
            `**${g.question}**\n\n` +
            lines.join("\n") +
            `\n\n👥 **Participantes:** ${total}` +
            (leader !== null ? `\n🏆 **Ganando:** *${g.options[leader]}*` : "")
        );

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function panelViewActive(interaction, config, saveConfig) {
    console.log(`[Encuesta:panelViewActive] deferred=${interaction.deferred} replied=${interaction.replied}`);
    const encuestas = getEncuestasConfig(config, interaction.guild.id);
    const g = encuestas.active;
    if (!g) {
        const msg = { content: "❌ No hay una encuesta activa.", flags: MessageFlags.Ephemeral };
        return interaction.deferred ? interaction.editReply(msg) : interaction.reply(msg);
    }

    const { counts, total, leader } = computeCounts(g);
    const lines = g.options.map((opt, i) => {
        const pct = total ? Math.round((counts[i] / total) * 100) : 0;
        return `${EMOJI_NUMBERS[i]} **${opt}** — ${counts[i]} voto${counts[i] === 1 ? "" : "s"} (${pct}%)`;
    });

    const channelRef = interaction.guild.channels.cache.get(g.channelId) ? `<#${g.channelId}>` : "Canal no disponible";

    const embed = new EmbedBuilder()
        .setColor("#FF73FA")
        .setTitle("📊 Encuesta activa")
        .setDescription(
            `**${g.question}**\n\n` +
            lines.join("\n") +
            `\n\n👥 **Participantes:** ${total}` +
            (leader !== null ? `\n🏆 **Ganando:** *${g.options[leader]}*` : "") +
            `\n⏰ **Termina:** <t:${Math.floor(g.endsAt / 1000)}:R>` +
            `\n🔗 Canal: ${channelRef}` +
            `\n🔁 Cambiar voto: ${g.allowChange ? "Sí" : "No"} · 🔘 Tipo: ${g.pollType === "multiple" ? "Múltiple" : "Única"}`
        )
        .setFooter({ text: `Creada por ${g.hostName || "un administrador"}` });

    const viewMsg = { embeds: [embed], flags: MessageFlags.Ephemeral };
    if (interaction.deferred) {
        await interaction.editReply(viewMsg);
    } else {
        await interaction.reply(viewMsg);
    }
}

async function panelFinalize(interaction, config, saveConfig) {
    console.log(`[Encuesta:panelFinalize] deferred=${interaction.deferred} replied=${interaction.replied}`);
    const encuestas = getEncuestasConfig(config, interaction.guild.id);
    if (!encuestas.active) {
        const msg = { content: "❌ No hay una encuesta activa.", flags: MessageFlags.Ephemeral };
        return interaction.deferred ? interaction.editReply(msg) : interaction.reply(msg);
    }

    await finalizePoll(interaction.client, config, saveConfig, interaction.guild.id);

    const msg = { content: "🔒 Encuesta finalizada. Resultados publicados en su canal.", flags: MessageFlags.Ephemeral };
    if (interaction.deferred) {
        await interaction.editReply(msg);
    } else {
        await interaction.reply(msg);
    }
}

async function panelCancel(interaction, config, saveConfig) {
    console.log(`[Encuesta:panelCancel] deferred=${interaction.deferred} replied=${interaction.replied}`);
    const encuestas = getEncuestasConfig(config, interaction.guild.id);
    const g = encuestas.active;
    if (!g) {
        const msg = { content: "❌ No hay una encuesta activa.", flags: MessageFlags.Ephemeral };
        return interaction.deferred ? interaction.editReply(msg) : interaction.reply(msg);
    }

    clearTimer(interaction.guild.id);
    await deletePollMessage(interaction.guild, g);
    encuestas.active = null;
    saveConfig();

    const msg = { content: "❌ Encuesta cancelada. Se eliminó el mensaje de la encuesta.", flags: MessageFlags.Ephemeral };
    if (interaction.deferred) {
        await interaction.editReply(msg);
    } else {
        await interaction.reply(msg);
    }
}

async function panelReset(interaction, config, saveConfig) {
    console.log(`[Encuesta:panelReset] deferred=${interaction.deferred} replied=${interaction.replied}`);
    const encuestas = getEncuestasConfig(config, interaction.guild.id);
    const g = encuestas.active;
    if (!g) {
        const msg = { content: "❌ No hay una encuesta activa.", flags: MessageFlags.Ephemeral };
        return interaction.deferred ? interaction.editReply(msg) : interaction.reply(msg);
    }

    g.votes = {};
    g.endsAt = Date.now() + (g.durationMs || DEFAULT_DURATION_MS);
    saveConfig();

    clearTimer(interaction.guild.id);
    scheduleEnd(interaction.client, config, saveConfig, interaction.guild.id, g.endsAt);

    const channel = interaction.guild.channels.cache.get(g.channelId);
    const message = channel ? await channel.messages.fetch(g.messageId).catch(() => null) : null;
    if (message) {
        await message.edit({
            embeds: [renderPoll(g)],
            components: renderComponents(g, false)
        }).catch(() => {});
    }

    const msg = { content: "🔄 Encuesta reiniciada: votos eliminados y tiempo reiniciado.", flags: MessageFlags.Ephemeral };
    if (interaction.deferred) {
        await interaction.editReply(msg);
    } else {
        await interaction.reply(msg);
    }
}

async function panelCreate(interaction, config, saveConfig, data) {
    return startPoll(interaction, config, saveConfig, {
        pregunta: data.pregunta,
        opcionesStr: data.opcionesStr,
        duracionStr: data.duracionStr || null,
        allowChange: undefined
    });
}

async function handleEncuestaInteraction(interaction, config, saveConfig) {
    console.log(`[Encuesta:handle] IN type=${interaction.type} customId=${interaction.customId || "cmd"} user=${interaction.user?.tag}`);
    if (interaction.isCommand() && interaction.commandName === "encuesta") {
        await createPoll(interaction, config, saveConfig);
        return true;
    }

    if (interaction.isStringSelectMenu() && interaction.customId?.startsWith("encuesta_voto_")) {
        await castVote(interaction, config, saveConfig);
        return true;
    }

    if (interaction.isButton() && interaction.customId?.startsWith("encuesta_")) {
        const gc = getGuildConfig(config, interaction.guild?.id);
        if (!hasPermission(interaction, gc)) {
            await interaction.reply({
                content: "❌ Solo administradores o staff pueden gestionar encuestas.",
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        if (interaction.customId.startsWith("encuesta_finalizar_")) {
            await finalizeFromButton(interaction, config, saveConfig);
        } else if (interaction.customId.startsWith("encuesta_cancelar_")) {
            await cancelPoll(interaction, config, saveConfig);
        } else if (interaction.customId.startsWith("encuesta_reiniciar_")) {
            await resetPoll(interaction, config, saveConfig);
        } else if (interaction.customId.startsWith("encuesta_resultados_")) {
            await showResults(interaction, config, saveConfig);
        }
        return true;
    }

    return false;
}

function setupEncuestas(client, config, saveConfig) {
    for (const [guildId, gc] of Object.entries(config)) {
        const encuestas = gc?.encuestas;
        const g = encuestas?.active;
        if (!g) continue;
        if (typeof g.endsAt === "number" && g.endsAt > Date.now()) {
            scheduleEnd(client, config, saveConfig, guildId, g.endsAt);
        } else {
            finalizePoll(client, config, saveConfig, guildId);
        }
    }
}

module.exports = {
    setupEncuestas,
    handleEncuestaInteraction,
    ensureEncuestasSettings,
    panelCreate,
    panelViewActive,
    panelFinalize,
    panelCancel,
    panelReset
};
