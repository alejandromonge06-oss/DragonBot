const {
    EmbedBuilder,
    PermissionsBitField,
    MessageFlags
} = require("discord.js");
const logSystem = require("./logSystem");

// ===== AJUSTES DE AUTO-MODERACIÓN =====
const MAX_SPAM_MESSAGES = 6;        // mensajes permitidos en la ventana
const SPAM_WINDOW_MS = 5000;        // ventana de tiempo (ms)
const RAID_WINDOW_MS = 10000;       // ventana para detectar raid (ms)
const RAID_THRESHOLD = 5;           // ingresos en la ventana para activar anti-raid

const LINK_REGEX = /(https?:\/\/|www\.|discord\.(gg|com\/invite)\/)/i;

const spamTracker = new Map();
const joinTracker = new Map();

const MOD_COMMANDS = [
    "warn", "warnings", "mute", "unmute",
    "kick", "ban", "unban", "clear", "setlogs"
];

function parseDuration(input) {
    const match = /^(\d{1,4})\s*(s|m|h|d|w)?$/i.exec(String(input).trim());
    if (!match) return null;

    const value = parseInt(match[1], 10);
    if (!value || value <= 0) return null;

    const unit = (match[2] || "m").toLowerCase();
    const multipliers = {
        s: 1000,
        m: 60000,
        h: 3600000,
        d: 86400000,
        w: 604800000
    };

    const ms = value * multipliers[unit];
    return ms > 2419200000 ? null : ms; // máx 28 días (límite de Discord)
}

function formatDuration(ms) {
    if (!ms) return "Indefinido";

    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;

    const parts = [];
    if (d) parts.push(`${d}d`);
    if (h) parts.push(`${h}h`);
    if (m) parts.push(`${m}m`);
    if (sec) parts.push(`${sec}s`);
    return parts.join(" ") || `${ms}ms`;
}

function getGuildConfig(config, guildId) {
    if (!config[guildId]) config[guildId] = {};
    return config[guildId];
}

function getWarnings(config, guildId, userId) {
    return getGuildConfig(config, guildId).warnings?.[userId] || [];
}

function addWarning(config, guildId, userId, reason, mod) {
    const gc = getGuildConfig(config, guildId);
    if (!gc.warnings) gc.warnings = {};
    if (!gc.warnings[userId]) gc.warnings[userId] = [];

    gc.warnings[userId].push({
        reason,
        mod: `${mod} (${mod.id})`,
        date: Date.now()
    });

    return gc.warnings[userId].length;
}

function canModerate(member, target) {
    if (!member || !target) return false;
    if (target.id === member.id) return false;
    if (target.id === member.guild.ownerId) return false;
    if (target.id === member.client.user.id) return false;
    if (target.roles.highest.position >= member.roles.highest.position) return false;
    return true;
}

async function logAction(guild, config, { action, target, mod, reason, detail }) {
    const categoryMap = {
        warn: "moderacion",
        "anti-spam": "moderacion",
        "anti-links": "moderacion",
        "anti-raid": "moderacion",
        setlogs: "servidor"
    };

    await logSystem.logAction(guild, config, {
        category: categoryMap[action] || "moderacion",
        event: action,
        title: `📋 ${String(action).toUpperCase()}`,
        description: reason,
        fields: [
            ...(target ? [{ name: "👤 Usuario", value: `${target} (${target.id})`, inline: true }] : []),
            ...(mod ? [{ name: "🛡️ Moderador", value: `${mod} (${mod.id})`, inline: true }] : []),
            ...(detail ? [{ name: "ℹ️ Detalle", value: String(detail).slice(0, 1024), inline: false }] : [])
        ]
    });
}

async function notify(channel, text) {
    const sent = await channel.send(text).catch(() => null);
    if (sent) {
        setTimeout(() => sent.delete().catch(() => {}), 5000);
    }
}

async function getSecurityConfig(config, guildId) {
    const s = getGuildConfig(config, guildId).security || {};
    return {
        antiSpam: s.antiSpam !== false,
        antiRaid: s.antiRaid !== false,
        antiLinks: s.antiLinks !== false,
        antiMassMention: s.antiMassMention !== false,
        autoMute: s.autoMute !== false,
        spamLimit: Number(s.spamLimit) || MAX_SPAM_MESSAGES,
        spamWindowMs: Number(s.spamWindowMs) || SPAM_WINDOW_MS,
        raidThreshold: Number(s.raidThreshold) || RAID_THRESHOLD,
        raidWindowMs: Number(s.raidWindowMs) || RAID_WINDOW_MS,
        massMentionLimit: Number(s.massMentionLimit) || 8,
        autoMuteMs: Number(s.autoMuteMs) || 60000
    };
}

async function checkMessage(message, config, saveConfig) {
    if (!message.guild || message.author.bot) return;

    const sec = await getSecurityConfig(config, message.guild.id);

    // ===== ANTI-LINKS =====
    if (sec.antiLinks && LINK_REGEX.test(message.content || "")) {
        logSystem.registerAction(`msgdelete:${message.guild.id}:${message.id}`);
        try { await message.delete(); } catch {}

        const reason = "Publicar enlaces no permitidos";
        const count = addWarning(
            config,
            message.guild.id,
            message.author.id,
            reason,
            message.client.user
        );
        saveConfig();

        await notify(
            message.channel,
            `⛔ ${message.author}, no se permiten enlaces en este servidor. (Advertencia #${count})`
        );

        await logAction(message.guild, config, {
            action: "anti-links",
            target: message.member || message.author,
            mod: message.client.user,
            reason,
            detail: `Mensaje eliminado: ${message.content.slice(0, 200)}`
        });
        return;
    }

    // ===== ANTI-SPAM =====
    const now = Date.now();
    const timestamps = spamTracker.get(message.author.id) || [];
    const recent = timestamps.filter(t => now - t < sec.spamWindowMs);
    recent.push(now);
    spamTracker.set(message.author.id, recent);

    if (sec.antiSpam && recent.length > sec.spamLimit) {
        logSystem.registerAction(`msgdelete:${message.guild.id}:${message.id}`);
        try { await message.delete(); } catch {}

        const reason = "Spam: demasiados mensajes en poco tiempo";
        const count = addWarning(
            config,
            message.guild.id,
            message.author.id,
            reason,
            message.client.user
        );

        const member = message.member;
        let muted = false;
        if (sec.autoMute && member && canModerate(message.guild.members.me, member)) {
            logSystem.registerAction(`mute:${message.guild.id}:${message.author.id}`);
            await member.timeout(sec.autoMuteMs, reason).catch(() => {});
            muted = true;
        }
        saveConfig();

        await notify(
            message.channel,
            `⛔ ${message.author}, deja de hacer spam. (Advertencia #${count})`
        );

        await logAction(message.guild, config, {
            action: "anti-spam",
            target: member || message.author,
            mod: message.client.user,
            reason,
            detail: muted ? `Se aplicó un mute temporal de ${Math.floor(sec.autoMuteMs / 1000)}s` : "No se pudo aplicar mute"
        });

        spamTracker.set(message.author.id, []);
    }

    // ===== ANTI-MASS MENTION =====
    if (sec.antiMassMention && message.content) {
        const mentions = message.mentions.users.size +
            message.mentions.roles.size +
            (message.mentions.everyone ? 1 : 0);

        if (mentions >= sec.massMentionLimit) {
            logSystem.registerAction(`msgdelete:${message.guild.id}:${message.id}`);
            try { await message.delete(); } catch {}

            const reason = "Mass mention: spam de menciones masivas";
            const count = addWarning(
                config,
                message.guild.id,
                message.author.id,
                reason,
                message.client.user
            );
            saveConfig();

            await notify(
                message.channel,
                `⛔ ${message.author}, no hagas spam de menciones. (Advertencia #${count})`
            );

            await logAction(message.guild, config, {
                action: "anti-mass-mention",
                target: message.member || message.author,
                mod: message.client.user,
                reason,
                detail: `${mentions} menciones en un mensaje`
            });
        }
    }
}

async function checkGuildMemberAdd(member, config, saveConfig) {
    if (!member.guild) return;

    const sec = await getSecurityConfig(config, member.guild.id);
    if (!sec.antiRaid) return;

    const now = Date.now();
    const joins = joinTracker.get(member.guild.id) || [];
    joins.push(now);
    joinTracker.set(member.guild.id, joins);

    const recent = joins.filter(t => now - t < sec.raidWindowMs);

    if (recent.length >= sec.raidThreshold) {
        const reason = "Anti-raid: demasiados ingresos en poco tiempo";
        logSystem.registerAction(`kick:${member.guild.id}:${member.id}`);
        await member.kick(reason).catch(() => {});

        await logAction(member.guild, config, {
            action: "anti-raid",
            target: member.user,
            mod: member.client.user,
            reason,
            detail: `${recent.length} ingresos en ${Math.floor(sec.raidWindowMs / 1000)} segundos`
        });
    }
}

function hasPerm(interaction, flag) {
    return interaction.member.permissions.has(flag);
}

async function denied(interaction) {
    await interaction.reply({
        content: "❌ No tienes permiso para usar este comando.",
        flags: MessageFlags.Ephemeral
    });
}

async function handleModerationCommand(interaction, config, saveConfig) {
    const { commandName } = interaction;
    if (!MOD_COMMANDS.includes(commandName)) return false;

    const guild = interaction.guild;
    const guildConfig = getGuildConfig(config, guild.id);

    if (commandName === "setlogs") {
        if (!hasPerm(interaction, PermissionsBitField.Flags.Administrator)) {
            await denied(interaction);
            return true;
        }

        const canal = interaction.options.getChannel("canal");
        const categoria = interaction.options.getString("categoria");

        logSystem.setLogChannel(config, saveConfig, guild, canal.id, categoria);

        const etiquetas = {
            mensajes: "Mensajes",
            miembros: "Miembros",
            moderacion: "Moderación",
            canales: "Canales",
            tickets: "Tickets",
            servidor: "Servidor"
        };

        await interaction.reply({
            content: categoria
                ? `✅ Logs de **${etiquetas[categoria] || categoria}** configurados en: ${canal}`
                : `✅ Canal de logs configurado en: ${canal}`,
            flags: MessageFlags.Ephemeral
        });

        await logAction(guild, config, {
            action: "setlogs",
            target: null,
            mod: interaction.user,
            reason: `Canal de logs configurado: ${canal.name}` +
                (categoria ? ` (categoría: ${etiquetas[categoria] || categoria})` : "")
        });
        return true;
    }

    if (commandName === "warn") {
        if (!hasPerm(interaction, PermissionsBitField.Flags.ModerateMembers)) {
            await denied(interaction);
            return true;
        }

        const target = interaction.options.getUser("usuario");
        const reason = interaction.options.getString("motivo") || "Sin motivo";
        const member = await guild.members.fetch(target.id).catch(() => null);

        if (member && !canModerate(interaction.member, member)) {
            await interaction.reply({
                content: "❌ No puedes advertir a este usuario (rol igual o superior, o es el dueño).",
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        const count = addWarning(config, guild.id, target.id, reason, interaction.user);
        saveConfig();

        await interaction.reply({
            content: `✅ ${target} fue advertido. Advertencia **#${count}**\n📝 Motivo: ${reason}`,
            flags: MessageFlags.Ephemeral
        });

        await logAction(guild, config, {
            action: "warn",
            target,
            mod: interaction.user,
            reason,
            detail: `Total de advertencias: ${count}`
        });
        return true;
    }

    if (commandName === "warnings") {
        const target = interaction.options.getUser("usuario") || interaction.user;
        const list = getWarnings(config, guild.id, target.id);

        if (list.length === 0) {
            await interaction.reply({
                content: `✅ ${target} no tiene advertencias.`,
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        const lines = list.map((w, i) => {
            const fecha = new Date(w.date).toLocaleDateString("es-ES");
            return `**#${i + 1}** · ${fecha}\n📝 ${w.reason}\n🛡️ ${w.mod}`;
        });

        const embed = new EmbedBuilder()
            .setColor("#FFA500")
            .setTitle(`📋 Advertencias de ${target.username}`)
            .setDescription(`**Total: ${list.length}**\n\n${lines.join("\n\n")}`.slice(0, 4096))
            .setFooter({ text: `ID: ${target.id}` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        return true;
    }

    if (commandName === "mute") {
        if (!hasPerm(interaction, PermissionsBitField.Flags.ModerateMembers)) {
            await denied(interaction);
            return true;
        }

        const target = interaction.options.getUser("usuario");
        const tiempo = interaction.options.getString("tiempo");
        const ms = parseDuration(tiempo);

        if (!ms) {
            await interaction.reply({
                content: "❌ Formato de tiempo inválido. Usa: `10s`, `5m`, `1h`, `2d`, `1w` (máximo 28 días).",
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        const member = await guild.members.fetch(target.id).catch(() => null);
        if (!member) {
            await interaction.reply({
                content: "❌ Ese usuario no está en el servidor.",
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        if (!canModerate(interaction.member, member)) {
            await interaction.reply({
                content: "❌ No puedes silenciar a este usuario (rol igual o superior, o es el dueño).",
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        const duration = formatDuration(ms);
        const reason = `Silenciado por ${interaction.user.tag}`;

        logSystem.registerAction(`mute:${guild.id}:${target.id}`);
        try {
            await member.timeout(ms, reason);
        } catch {
            return interaction.reply({
                content: "❌ No pude silenciar a este usuario. Revisa que el bot tenga permiso **Moderar miembros**.",
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }

        await interaction.reply({
            content: `🔇 ${target} fue silenciado por **${duration}**.`,
            flags: MessageFlags.Ephemeral
        });

        await logSystem.logModerationCommand(guild, config, {
            command: "mute",
            mod: interaction.user,
            target,
            reason: `Silenciado por ${interaction.user.tag}`,
            detail: `Duración: ${duration}`
        });
        return true;
    }

    if (commandName === "unmute") {
        if (!hasPerm(interaction, PermissionsBitField.Flags.ModerateMembers)) {
            await denied(interaction);
            return true;
        }

        const target = interaction.options.getUser("usuario");
        const member = await guild.members.fetch(target.id).catch(() => null);

        if (!member) {
            await interaction.reply({
                content: "❌ Ese usuario no está en el servidor.",
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        if (!canModerate(interaction.member, member)) {
            await interaction.reply({
                content: "❌ No puedes quitar el silencio a este usuario (rol igual o superior, o es el dueño).",
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        logSystem.registerAction(`unmute:${guild.id}:${target.id}`);
        await member.timeout(null);

        await interaction.reply({
            content: `🔊 ${target} ya no está silenciado.`,
            flags: MessageFlags.Ephemeral
        });

        await logSystem.logModerationCommand(guild, config, {
            command: "unmute",
            mod: interaction.user,
            target,
            reason: "Silencio retirado"
        });
        return true;
    }

    if (commandName === "kick") {
        if (!hasPerm(interaction, PermissionsBitField.Flags.KickMembers)) {
            await denied(interaction);
            return true;
        }

        const target = interaction.options.getUser("usuario");
        const reason = interaction.options.getString("motivo") || "Sin motivo";
        const member = await guild.members.fetch(target.id).catch(() => null);

        if (!member) {
            await interaction.reply({
                content: "❌ Ese usuario no está en el servidor.",
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        if (!canModerate(interaction.member, member)) {
            await interaction.reply({
                content: "❌ No puedes expulsar a este usuario (rol igual o superior, o es el dueño).",
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        logSystem.registerAction(`kick:${guild.id}:${target.id}`);
        await member.kick(reason);

        await interaction.reply({
            content: `👢 ${target} fue expulsado del servidor.`,
            flags: MessageFlags.Ephemeral
        });

        await logSystem.logModerationCommand(guild, config, {
            command: "kick",
            mod: interaction.user,
            target,
            reason
        });
        return true;
    }

    if (commandName === "ban") {
        if (!hasPerm(interaction, PermissionsBitField.Flags.BanMembers)) {
            await denied(interaction);
            return true;
        }

        const target = interaction.options.getUser("usuario");
        const reason = interaction.options.getString("motivo") || "Sin motivo";
        const member = await guild.members.fetch(target.id).catch(() => null);

        if (member && !canModerate(interaction.member, member)) {
            await interaction.reply({
                content: "❌ No puedes banear a este usuario (rol igual o superior, o es el dueño).",
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        logSystem.registerAction(`ban:${guild.id}:${target.id}`);
        await guild.members.ban(target.id, { reason });

        await interaction.reply({
            content: `🔨 ${target} fue baneado del servidor.`,
            flags: MessageFlags.Ephemeral
        });

        await logSystem.logModerationCommand(guild, config, {
            command: "ban",
            mod: interaction.user,
            target,
            reason
        });
        return true;
    }

    if (commandName === "unban") {
        if (!hasPerm(interaction, PermissionsBitField.Flags.BanMembers)) {
            await denied(interaction);
            return true;
        }

        const id = interaction.options.getString("id").replace(/[<@!>]/g, "").trim();
        const target = await interaction.client.users.fetch(id).catch(() => null);

        if (!target) {
            await interaction.reply({
                content: "❌ No encontré a ese usuario. Pasa un ID válido.",
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        logSystem.registerAction(`unban:${guild.id}:${target.id}`);
        await guild.bans.remove(id, "Desbaneado");

        await interaction.reply({
            content: `✅ ${target} fue desbaneado.`,
            flags: MessageFlags.Ephemeral
        });

        await logSystem.logModerationCommand(guild, config, {
            command: "unban",
            mod: interaction.user,
            target,
            reason: "Desbaneado"
        });
        return true;
    }

    if (commandName === "clear") {
        if (!hasPerm(interaction, PermissionsBitField.Flags.ManageMessages)) {
            await denied(interaction);
            return true;
        }

        const cantidad = interaction.options.getInteger("cantidad");

        try {
            const fetched = await interaction.channel.messages.fetch({
                limit: Math.min(cantidad + 1, 100)
            });
            logSystem.registerAction(`clear:${guild.id}:${interaction.channel.id}`);
            const deleted = await interaction.channel.bulkDelete(fetched);

            await interaction.reply({
                content: `🧹 Se eliminaron **${deleted.size}** mensajes.`,
                flags: MessageFlags.Ephemeral
            });

            await logSystem.logModerationCommand(guild, config, {
                command: "clear",
                mod: interaction.user,
                target: null,
                reason: "Limpieza de chat",
                detail: `Canal: ${interaction.channel}\nMensajes: ${deleted.size}`
            });
        } catch (error) {
            await interaction.reply({
                content: "❌ No pude borrar los mensajes. (Los mensajes de más de 14 días no se pueden eliminar).",
                flags: MessageFlags.Ephemeral
            });
        }
        return true;
    }

    return true;
}

module.exports = {
    parseDuration,
    formatDuration,
    getWarnings,
    addWarning,
    canModerate,
    logAction,
    checkMessage,
    checkGuildMemberAdd,
    handleModerationCommand
};
