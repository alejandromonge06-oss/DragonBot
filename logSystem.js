const {
    EmbedBuilder,
    PermissionsBitField,
    AuditLogEvent,
    ChannelType
} = require("discord.js");

// ===== CATEGORÍAS DE LOGS =====
const CATEGORIES = {
    mensajes: "mensajes",
    miembros: "miembros",
    moderacion: "moderacion",
    canales: "canales",
    tickets: "tickets",
    servidor: "servidor"
};

const COLORS = {
    messageDelete: "#FF6B6B",
    messageUpdate: "#FFA500",
    messageDeleteBulk: "#FF6B6B",
    memberAdd: "#57F287",
    memberRemove: "#ED4245",
    kick: "#FF4500",
    ban: "#ED4245",
    unban: "#57F287",
    warn: "#FEE75C",
    mute: "#FFA500",
    unmute: "#57F287",
    roleAdd: "#9B59B6",
    roleRemove: "#9B59B6",
    roleChange: "#9B59B6",
    nicknameUpdate: "#3498DB",
    guildUpdate: "#8A2BE2",
    channelCreate: "#57F287",
    channelDelete: "#ED4245",
    channelUpdate: "#FFA500",
    permissionUpdate: "#E67E22",
    ticketCreate: "#8A2BE2",
    ticketDelete: "#8A2BE2",
    moderationCommand: "#8A2BE2",
    setlogs: "#8A2BE2"
};

// Claves registradas para evitar duplicar logs (acción + evento)
const recentActions = new Map();

function registerAction(key, ttl = 8000) {
    recentActions.set(key, Date.now());
    setTimeout(() => recentActions.delete(key), ttl);
}

function consumeAction(key) {
    if (recentActions.has(key)) {
        recentActions.delete(key);
        return true;
    }
    return false;
}

function getGuildConfig(config, guildId) {
    if (!config[guildId]) config[guildId] = {};
    return config[guildId];
}

function getLogsConfig(guildConfig) {
    if (!guildConfig.logs) guildConfig.logs = {};
    return guildConfig.logs;
}

function resolveChannel(guild, config, category) {
    const gc = getGuildConfig(config, guild.id);
    const logs = gc.logs;

    if (category && logs?.enabled?.[category] === false) {
        return null;
    }

    const channelId = logs?.categories?.[category] || logs?.main || gc.logChannel;
    const channel = guild.channels.cache.get(channelId);
    return channel ? channel : null;
}

function setLogChannel(config, saveConfig, guild, channelId, category) {
    const gc = getGuildConfig(config, guild.id);
    const logs = getLogsConfig(gc);

    if (category) {
        if (!logs.categories) logs.categories = {};
        logs.categories[category] = channelId;
    } else {
        logs.main = channelId;
        gc.logChannel = channelId;
    }

    saveConfig();
    return logs;
}

function formatDuration(ms) {
    if (!ms || ms <= 0) return "Permanente";

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

function channelTypeLabel(channel) {
    switch (channel.type) {
        case ChannelType.GuildText: return "Texto";
        case ChannelType.GuildVoice: return "Voz";
        case ChannelType.GuildCategory: return "Categoría";
        case ChannelType.GuildAnnouncement: return "Anuncios";
        case ChannelType.GuildForum: return "Foro";
        case ChannelType.GuildStageVoice: return "Stage";
        case ChannelType.GuildPublicThread:
        case ChannelType.GuildPrivateThread:
        case ChannelType.GuildNewsThread: return "Hilo";
        default: return "Canal";
    }
}

function isTicketChannelLike(channel) {
    return Boolean(
        channel?.topic?.startsWith("ticket|") ||
        channel?.topic?.startsWith("ticket-owner:")
    );
}

function decodePermission(value) {
    if (!value) return "ninguno";
    return new PermissionsBitField(value)
        .toArray()
        .map(flag => flag.replace(/([A-Z])/g, " $1").toLowerCase().trim())
        .join(", ") || "ninguno";
}

function formatChange(change) {
    if (change.key === "permissions" || change.key === "allow" || change.key === "deny") {
        return `${decodePermission(change.old)} → ${decodePermission(change.new)}`;
    }
    if (Array.isArray(change.old) || Array.isArray(change.new)) {
        const fmt = arr => (arr || []).map(x => `<@&${x.id || x}>`).join(", ") || "ninguno";
        return `${fmt(change.old)} → ${fmt(change.new)}`;
    }
    if (typeof change.old === "string" || typeof change.new === "string") {
        return `${change.old || "vacío"} → ${change.new || "vacío"}`;
    }
    return `${change.old ?? "—"} → ${change.new ?? "—"}`;
}

async function fetchAudit(guild, type, targetId, seconds = 5) {
    if (!guild.members.me?.permissions?.has(PermissionsBitField.Flags.ViewAuditLog)) return null;
    try {
        const data = await guild.fetchAuditLogs({ type, limit: 20 });
        const cutoff = Date.now() - seconds * 1000;
        const entry = data.entries.find(e =>
            (!targetId || e.target?.id === targetId) && e.createdTimestamp >= cutoff
        );
        return entry || null;
    } catch {
        return null;
    }
}

async function logAction(guild, config, opts) {
    const channel = resolveChannel(guild, config, opts.category);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setColor(opts.color || COLORS[opts.event] || "#8A2BE2")
        .setTitle(opts.title || "📋 Log")
        .setTimestamp();

    if (opts.description) embed.setDescription(String(opts.description).slice(0, 4096));
    if (opts.thumbnail) embed.setThumbnail(opts.thumbnail);

    if (opts.fields && opts.fields.length) {
        embed.addFields(
            opts.fields.slice(0, 25).map(f => ({
                name: String(f.name).slice(0, 256),
                value: String(f.value).slice(0, 1024),
                inline: Boolean(f.inline)
            }))
        );
    }

    if (opts.footer) embed.setFooter({ text: String(opts.footer).slice(0, 2048) });

    await channel.send({ embeds: [embed] }).catch(() => {});
}

async function logModerationCommand(guild, config, { command, mod, target, reason, detail }) {
    await logAction(guild, config, {
        category: CATEGORIES.moderacion,
        event: "moderationCommand",
        title: "🤖 Comando de moderación",
        description: `**Comando:** /${command}`,
        fields: [
            { name: "🛡️ Moderador", value: `${mod} (${mod.id})`, inline: true },
            ...(target ? [{ name: "👤 Usuario", value: `${target} (${target.id})`, inline: true }] : []),
            ...(reason ? [{ name: "📝 Motivo", value: reason.slice(0, 1024), inline: false }] : []),
            ...(detail ? [{ name: "ℹ️ Detalle", value: detail.slice(0, 1024), inline: false }] : [])
        ]
    });
}

function setupLogSystem(client, config, saveConfig) {

    // ===== MENSAJES ELIMINADOS =====
    client.on("messageDelete", async message => {
        const guild = message.guild;
        if (!guild || !message.author || message.author.bot) return;

        if (consumeAction(`msgdelete:${guild.id}:${message.id}`)) return;

        const entry = await fetchAudit(guild, AuditLogEvent.MessageDelete, message.author.id, 4);
        const executor = entry?.executor;
        const content = message.content?.trim();
        const hasAttachments = message.attachments?.size > 0;

        if (!content && !hasAttachments) return;

        await logAction(guild, config, {
            category: CATEGORIES.mensajes,
            event: "messageDelete",
            title: "🗑️ Mensaje eliminado",
            description: content ? `"${content}"` : "*(mensaje sin texto)*",
            fields: [
                { name: "👤 Autor", value: `${message.author} (${message.author.id})`, inline: true },
                { name: "📌 Canal", value: `${message.channel}`, inline: true },
                ...(executor ? [{ name: "🧹 Eliminado por", value: `${executor}`, inline: true }] : []),
                ...(hasAttachments ? [{ name: "📎 Adjuntos", value: `${message.attachments.size}`, inline: true }] : [])
            ],
            footer: `ID del mensaje: ${message.id}`
        });
    });

    // ===== MENSAJES ELIMINADOS EN MASA =====
    client.on("messageDeleteBulk", async (messages, channel) => {
        const guild = channel.guild;
        if (!guild) return;

        if (consumeAction(`clear:${guild.id}:${channel.id}`)) return;

        const entry = await fetchAudit(guild, AuditLogEvent.MessageBulkDelete, null, 4);
        const executor = entry?.executor;

        await logAction(guild, config, {
            category: CATEGORIES.mensajes,
            event: "messageDeleteBulk",
            title: "🧹 Mensajes eliminados en masa",
            description: `Se eliminaron **${messages.size}** mensajes en ${channel}.`,
            fields: [
                { name: "📌 Canal", value: `${channel}`, inline: true },
                ...(executor ? [{ name: "🛡️ Responsable", value: `${executor}`, inline: true }] : [])
            ]
        });
    });

    // ===== MENSAJES EDITADOS =====
    client.on("messageUpdate", async (oldMessage, newMessage) => {
        const guild = newMessage.guild;
        if (!guild || !newMessage.author || newMessage.author.bot) return;

        const oldContent = oldMessage.content || "";
        const newContent = newMessage.content || "";
        if (oldContent === newContent) return;
        if (!oldContent && !newContent) return;

        await logAction(guild, config, {
            category: CATEGORIES.mensajes,
            event: "messageUpdate",
            title: "✏️ Mensaje editado",
            fields: [
                { name: "👤 Autor", value: `${newMessage.author} (${newMessage.author.id})`, inline: true },
                { name: "📌 Canal", value: `${newMessage.channel}`, inline: true },
                { name: "📄 Antes", value: oldContent.slice(0, 1024) || "*(vacío)*", inline: false },
                { name: "📄 Después", value: newContent.slice(0, 1024) || "*(vacío)*", inline: false }
            ],
            footer: `ID del mensaje: ${newMessage.id}`
        });
    });

    // ===== MIEMBRO ENTRA =====
    client.on("guildMemberAdd", async member => {
        if (!member.guild) return;

        const ageMs = Date.now() - (member.user.createdTimestamp || Date.now());
        const days = Math.floor(ageMs / 86400000);

        await logAction(member.guild, config, {
            category: CATEGORIES.miembros,
            event: "memberAdd",
            title: "👤 Miembro entró al servidor",
            description: `${member.user} se unió al servidor.`,
            fields: [
                { name: "👤 Usuario", value: `${member.user} (${member.user.id})`, inline: true },
                { name: "📅 Cuenta creada", value: `${days} día(s) atrás`, inline: true },
                { name: "👥 Miembros", value: `${member.guild.memberCount}`, inline: true }
            ],
            thumbnail: member.user.displayAvatarURL()
        });
    });

    // ===== MIEMBRO SALE / KICK =====
    client.on("guildMemberRemove", async member => {
        if (!member.guild) return;

        if (consumeAction(`kick:${member.guild.id}:${member.id}`)) return;

        const entry = await fetchAudit(member.guild, AuditLogEvent.MemberKick, member.id, 5);

        if (entry?.executor) {
            await logAction(member.guild, config, {
                category: CATEGORIES.moderacion,
                event: "kick",
                title: "👢 Miembro expulsado",
                description: `${member.user} fue expulsado del servidor.`,
                fields: [
                    { name: "👤 Usuario", value: `${member.user} (${member.user.id})`, inline: true },
                    { name: "🛡️ Expulsado por", value: `${entry.executor}`, inline: true },
                    ...(entry.reason ? [{ name: "📝 Motivo", value: entry.reason, inline: false }] : [])
                ],
                thumbnail: member.user?.displayAvatarURL?.()
            });
        } else {
            await logAction(member.guild, config, {
                category: CATEGORIES.miembros,
                event: "memberRemove",
                title: "🚪 Miembro salió del servidor",
                description: `${member.user} abandonó el servidor.`,
                fields: [
                    { name: "👤 Usuario", value: `${member.user} (${member.user.id})`, inline: true },
                    { name: "👥 Miembros", value: `${member.guild.memberCount}`, inline: true }
                ],
                thumbnail: member.user?.displayAvatarURL?.()
            });
        }
    });

    // ===== BAN =====
    client.on("guildBanAdd", async ban => {
        const guild = ban.guild;
        if (!guild) return;

        if (consumeAction(`ban:${guild.id}:${ban.user.id}`)) return;

        const entry = await fetchAudit(guild, AuditLogEvent.MemberBanAdd, ban.user.id, 5);

        await logAction(guild, config, {
            category: CATEGORIES.moderacion,
            event: "ban",
            title: "🔨 Usuario baneado",
            description: `${ban.user} fue baneado del servidor.`,
            fields: [
                { name: "👤 Usuario", value: `${ban.user} (${ban.user.id})`, inline: true },
                ...(entry?.executor ? [{ name: "🛡️ Baneado por", value: `${entry.executor}`, inline: true }] : []),
                ...(entry?.reason ? [{ name: "📝 Motivo", value: entry.reason, inline: false }] : [])
            ],
            thumbnail: ban.user.displayAvatarURL()
        });
    });

    // ===== UNBAN =====
    client.on("guildBanRemove", async ban => {
        const guild = ban.guild;
        if (!guild) return;

        if (consumeAction(`unban:${guild.id}:${ban.user.id}`)) return;

        const entry = await fetchAudit(guild, AuditLogEvent.MemberBanRemove, ban.user.id, 5);

        await logAction(guild, config, {
            category: CATEGORIES.moderacion,
            event: "unban",
            title: "🔓 Usuario desbaneado",
            description: `${ban.user} fue desbaneado del servidor.`,
            fields: [
                { name: "👤 Usuario", value: `${ban.user} (${ban.user.id})`, inline: true },
                ...(entry?.executor ? [{ name: "🛡️ Desbaneado por", value: `${entry.executor}`, inline: true }] : [])
            ],
            thumbnail: ban.user.displayAvatarURL()
        });
    });

    // ===== CAMBIOS EN MIEMBROS (apodo, roles, mute) =====
    client.on("guildMemberUpdate", async (oldMember, newMember) => {
        const guild = newMember.guild;
        if (!guild) return;

        const oldUntil = oldMember.communicationDisabledUntil?.getTime() || 0;
        const newUntil = newMember.communicationDisabledUntil?.getTime() || 0;

        // MUTE
        if (newUntil > oldUntil) {
            if (consumeAction(`mute:${guild.id}:${newMember.id}`)) return;
            const entry = await fetchAudit(guild, AuditLogEvent.MemberUpdate, newMember.id, 5);
            await logAction(guild, config, {
                category: CATEGORIES.moderacion,
                event: "mute",
                title: "🔇 Usuario silenciado",
                description: `${newMember.user} fue silenciado.`,
                fields: [
                    { name: "👤 Usuario", value: `${newMember.user} (${newMember.user.id})`, inline: true },
                    { name: "⏱️ Duración", value: formatDuration(newUntil - Date.now()), inline: true },
                    ...(entry?.executor ? [{ name: "🛡️ Por", value: `${entry.executor}`, inline: true }] : [])
                ]
            });
            return;
        }

        // UNMUTE
        if (oldUntil > newUntil) {
            if (consumeAction(`unmute:${guild.id}:${newMember.id}`)) return;
            const entry = await fetchAudit(guild, AuditLogEvent.MemberUpdate, newMember.id, 5);
            await logAction(guild, config, {
                category: CATEGORIES.moderacion,
                event: "unmute",
                title: "🔊 Usuario desmutado",
                description: `${newMember.user} ya no está silenciado.`,
                fields: [
                    { name: "👤 Usuario", value: `${newMember.user} (${newMember.user.id})`, inline: true },
                    ...(entry?.executor ? [{ name: "🛡️ Por", value: `${entry.executor}`, inline: true }] : [])
                ]
            });
            return;
        }

        // APODO
        if (oldMember.nickname !== newMember.nickname) {
            await logAction(guild, config, {
                category: CATEGORIES.miembros,
                event: "nicknameUpdate",
                title: "📝 Apodo actualizado",
                description: `${newMember.user} cambió su apodo.`,
                fields: [
                    { name: "👤 Usuario", value: `${newMember.user} (${newMember.user.id})`, inline: true },
                    { name: "📝 Antes", value: oldMember.nickname || "*(sin apodo)*", inline: true },
                    { name: "📝 Después", value: newMember.nickname || "*(sin apodo)*", inline: true }
                ]
            });
        }

        // ROLES
        const oldRoles = new Set(oldMember.roles.cache.keys());
        const newRoles = new Set(newMember.roles.cache.keys());
        const added = [...newRoles].filter(r => !oldRoles.has(r));
        const removed = [...oldRoles].filter(r => !newRoles.has(r));

        if (added.length || removed.length) {
            const entry = await fetchAudit(guild, AuditLogEvent.MemberRoleUpdate, newMember.id, 5);
            const lines = [];
            if (added.length) lines.push(`**Añadidos:** ${added.map(id => `<@&${id}>`).join(", ")}`);
            if (removed.length) lines.push(`**Eliminados:** ${removed.map(id => `<@&${id}>`).join(", ")}`);

            await logAction(guild, config, {
                category: CATEGORIES.miembros,
                event: "roleAdd",
                title: "🎭 Roles actualizados",
                description: `${newMember.user}\n\n${lines.join("\n")}`,
                fields: [
                    { name: "👤 Usuario", value: `${newMember.user} (${newMember.user.id})`, inline: true },
                    ...(entry?.executor ? [{ name: "🛡️ Por", value: `${entry.executor}`, inline: true }] : [])
                ]
            });
        }
    });

    // ===== CAMBIOS EN EL SERVIDOR =====
    client.on("guildUpdate", async (oldGuild, newGuild) => {
        const changes = [];
        if (oldGuild.name !== newGuild.name) changes.push(`**Nombre:** ${oldGuild.name} → ${newGuild.name}`);
        if (oldGuild.icon !== newGuild.icon) changes.push("**Icono:** cambiado");
        if (oldGuild.banner !== newGuild.banner) changes.push("**Banner:** cambiado");
        if (oldGuild.description !== newGuild.description) {
            changes.push(`**Descripción:** ${oldGuild.description || "vacía"} → ${newGuild.description || "vacía"}`);
        }
        if (oldGuild.vanityURLCode !== newGuild.vanityURLCode) {
            changes.push(`**URL de invitación:** ${oldGuild.vanityURLCode || "ninguna"} → ${newGuild.vanityURLCode || "ninguna"}`);
        }
        if (!changes.length) return;

        const entry = await fetchAudit(newGuild, AuditLogEvent.GuildUpdate, null, 5);

        await logAction(newGuild, config, {
            category: CATEGORIES.servidor,
            event: "guildUpdate",
            title: "📢 Cambios en el servidor",
            description: changes.join("\n"),
            fields: entry?.executor ? [{ name: "🛡️ Por", value: `${entry.executor}`, inline: true }] : []
        });
    });

    // ===== CANAL CREADO =====
    client.on("channelCreate", async channel => {
        const guild = channel.guild;
        if (!guild) return;

        if (isTicketChannelLike(channel)) {
            const ownerId = (channel.topic.split("owner:")[1] || "").split("|")[0];
            await logAction(guild, config, {
                category: CATEGORIES.tickets,
                event: "ticketCreate",
                title: "🎫 Ticket creado",
                description: `Se abrió un nuevo ticket: ${channel}`,
                fields: [
                    { name: "📌 Canal", value: `${channel}`, inline: true },
                    ...(ownerId ? [{ name: "👤 Propietario", value: `<@${ownerId}>`, inline: true }] : [])
                ]
            });
            return;
        }

        const entry = await fetchAudit(guild, AuditLogEvent.ChannelCreate, null, 5);

        await logAction(guild, config, {
            category: CATEGORIES.canales,
            event: "channelCreate",
            title: "📁 Canal creado",
            description: `Se creó un canal de **${channelTypeLabel(channel)}**: ${channel}`,
            fields: [
                { name: "📌 Canal", value: `${channel}`, inline: true },
                { name: "📁 Tipo", value: channelTypeLabel(channel), inline: true },
                ...(channel.parent ? [{ name: "🗂️ Categoría", value: channel.parent.name, inline: true }] : []),
                ...(entry?.executor ? [{ name: "🛡️ Por", value: `${entry.executor}`, inline: true }] : [])
            ]
        });
    });

    // ===== CANAL ELIMINADO =====
    client.on("channelDelete", async channel => {
        const guild = channel.guild;
        if (!guild) return;

        if (isTicketChannelLike(channel)) {
            if (consumeAction(`ticketdelete:${guild.id}:${channel.id}`)) return;
            await logAction(guild, config, {
                category: CATEGORIES.tickets,
                event: "ticketDelete",
                title: "🎫 Ticket cerrado/eliminado",
                description: `El ticket **${channel.name}** fue cerrado y eliminado.`,
                fields: [{ name: "📌 Canal", value: channel.name, inline: true }]
            });
            return;
        }

        const entry = await fetchAudit(guild, AuditLogEvent.ChannelDelete, null, 5);

        await logAction(guild, config, {
            category: CATEGORIES.canales,
            event: "channelDelete",
            title: "🗑️ Canal eliminado",
            description: `Se eliminó un canal de **${channelTypeLabel(channel)}**: #${channel.name}`,
            fields: [
                { name: "📌 Canal", value: `#${channel.name}`, inline: true },
                { name: "📁 Tipo", value: channelTypeLabel(channel), inline: true },
                ...(entry?.executor ? [{ name: "🛡️ Por", value: `${entry.executor}`, inline: true }] : [])
            ]
        });
    });

    // ===== CANAL MODIFICADO (texto y voz) =====
    client.on("channelUpdate", async (oldChannel, newChannel) => {
        const guild = newChannel.guild;
        if (!guild) return;

        const changes = [];
        if (oldChannel.name !== newChannel.name) {
            changes.push(`**Nombre:** ${oldChannel.name} → ${newChannel.name}`);
        }
        if (oldChannel.topic !== newChannel.topic) {
            changes.push(`**Tema:** ${oldChannel.topic || "vacío"} → ${newChannel.topic || "vacío"}`);
        }
        if (oldChannel.type === ChannelType.GuildVoice) {
            if (oldChannel.userLimit !== newChannel.userLimit) {
                changes.push(`**Límite de usuarios:** ${oldChannel.userLimit ?? "∞"} → ${newChannel.userLimit ?? "∞"}`);
            }
            if (oldChannel.bitrate !== newChannel.bitrate) {
                changes.push(`**Bitrate:** ${oldChannel.bitrate} → ${newChannel.bitrate}`);
            }
        }
        if (oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) {
            changes.push(`**Slowmode:** ${oldChannel.rateLimitPerUser}s → ${newChannel.rateLimitPerUser}s`);
        }
        if (oldChannel.nsfw !== newChannel.nsfw) {
            changes.push(`**NSFW:** ${oldChannel.nsfw ? "sí" : "no"} → ${newChannel.nsfw ? "sí" : "no"}`);
        }
        if (oldChannel.parentId !== newChannel.parentId) {
            changes.push(`**Categoría:** ${oldChannel.parent?.name || "ninguna"} → ${newChannel.parent?.name || "ninguna"}`);
        }
        if (!changes.length) return;

        const entry = await fetchAudit(guild, AuditLogEvent.ChannelUpdate, null, 5);

        await logAction(guild, config, {
            category: CATEGORIES.canales,
            event: "channelUpdate",
            title: "🛠️ Canal modificado",
            description: `${channelTypeLabel(newChannel)} ${newChannel} \n\n${changes.join("\n")}`,
            fields: entry?.executor ? [{ name: "🛡️ Por", value: `${entry.executor}`, inline: true }] : []
        });
    });

    // ===== PERMISOS Y ROLES (desde audit log) =====
    client.on("guildAuditLogEntryCreate", async (entry, guild) => {
        if (!guild) return;

        if (
            entry.action === AuditLogEvent.PermissionOverwriteCreate ||
            entry.action === AuditLogEvent.PermissionOverwriteDelete ||
            entry.action === AuditLogEvent.PermissionOverwriteUpdate
        ) {
            const targetChannel = entry.target?.id ? guild.channels.cache.get(entry.target.id) : null;
            const channelLabel = targetChannel
                ? `${targetChannel}`
                : (entry.target?.name ? `#${entry.target.name}` : (entry.target?.id ? `canal (${entry.target.id})` : "un canal"));

            const extra = entry.extra;
            let objetivo = "Desconocido";
            if (extra) {
                const id = extra.id;
                if (extra.type === "1" || extra.type === 1) {
                    objetivo = id ? `<@${id}>` : "Un miembro";
                } else if (extra.name) {
                    const role = id ? guild.roles.cache.get(id) : null;
                    objetivo = role ? `${role}` : (id ? `<@&${id}>` : extra.name);
                } else if (extra.guild || extra.user) {
                    objetivo = `${extra}`;
                }
            }

            const changes = entry.changes || [];
            const lines = changes.map(c => `• **${c.key}:** ${formatChange(c)}`);

            await logAction(guild, config, {
                category: CATEGORIES.canales,
                event: "permissionUpdate",
                title: "🔑 Permisos modificados",
                description: `Permisos actualizados en ${channelLabel}\n${lines.join("\n") || "Cambio de permisos."}`,
                fields: [
                    { name: "🎯 Objetivo", value: objetivo, inline: true },
                    ...(entry.executor ? [{ name: "🛡️ Por", value: `${entry.executor}`, inline: true }] : [])
                ]
            });
            return;
        }

        if (
            entry.action === AuditLogEvent.RoleCreate ||
            entry.action === AuditLogEvent.RoleDelete ||
            entry.action === AuditLogEvent.RoleUpdate
        ) {
            const labels = {
                [AuditLogEvent.RoleCreate]: "creado",
                [AuditLogEvent.RoleDelete]: "eliminado",
                [AuditLogEvent.RoleUpdate]: "actualizado"
            };
            const label = labels[entry.action];
            const changes = entry.changes || [];
            const lines = changes.map(c => `• **${c.key}:** ${formatChange(c)}`);

            await logAction(guild, config, {
                category: CATEGORIES.servidor,
                event: "roleChange",
                title: `👑 Rol ${label}`,
                description: `Rol **${entry.target?.name || "?"}** (${entry.target?.id || "?"}) fue ${label}.\n${lines.join("\n")}`,
                fields: entry.executor ? [{ name: "🛡️ Por", value: `${entry.executor}`, inline: true }] : []
            });
            return;
        }
    });
}

module.exports = {
    CATEGORIES,
    setupLogSystem,
    logAction,
    logModerationCommand,
    setLogChannel,
    registerAction,
    consumeAction
};
