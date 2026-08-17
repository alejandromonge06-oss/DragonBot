const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField,
    AuditLogEvent,
    MessageFlags
} = require("discord.js");
const logSystem = require("./logSystem");
const { parseDuration, canModerate, addWarning } = require("./moderation");

const MAX_DELAY = 2147483647;
const LINK_INVITE_REGEX = /(?:discord\.(?:gg|com\/invite)\/|invite\.gg\/)/i;
const URL_REGEX = /(https?:\/\/|www\.)([^\s/]+)/gi;
const CUSTOM_EMOJI_REGEX = /<a?:\w+:\d+>/g;

const DANGEROUS_FLAGS = [
    "Administrator",
    "ManageGuild",
    "ManageRoles",
    "ManageChannels",
    "KickMembers",
    "BanMembers",
    "ManageWebhooks",
    "ManageMessages",
    "MentionEveryone"
];

const DEFAULT_SECURITY = {
    enabled: true,
    antiRaid: true,
    raidThreshold: 5,
    raidWindowMs: 10000,
    raidAction: "lockdown",
    raidLockdownMs: 600000,
    raidAlertChannel: null,
    antiBot: true,
    botAction: "alert",
    botAlertChannel: null,
    botWhitelist: [],
    antiSpam: true,
    spamLimit: 6,
    spamWindowMs: 5000,
    spamAction: "warn",
    spamTimeoutMs: 60000,
    spamMaxEmojis: 15,
    antiLinks: true,
    linkAction: "warn",
    linkBlockInvites: true,
    linkBlockedDomains: [],
    linkWhitelist: [],
    linkAllowedChannels: [],
    linkAllowedRoles: [],
    antiMassMention: true,
    massMentionLimit: 8,
    mentionAction: "delete",
    mentionBlockEveryone: true,
    spamMaxLength: 2000,
    roleProtection: true,
    roleAutoRevert: false,
    roleAlertChannel: null,
    alertChannel: null,
    exemptRoles: [],
    lockdownBlockMessages: true,
    lockdownDenyVoice: false,
    quarantineRole: null,
    quarantineDurationMs: 86400000,
    quarantine: {},
    lockdown: { active: false, by: null, byName: null, at: null, reason: null, until: null, saved: {} },
    alerts: [],
    stats: { raids: 0, blockedMessages: 0, blockedLinks: 0, blockedMentions: 0, botsDetected: 0, quarantined: 0, alerts: 0, autoSanctions: 0 },
    daily: {},
    incidents: [],
    incidentSeq: 0,
    suspiciousUsers: {},
    incidentRetentionDays: 30
};

const VALID_ACTIONS = ["delete", "warn", "timeout", "kick", "ban"];
const VALID_RAID_ACTIONS = ["lockdown", "kick", "quarantine", "alert"];
const VALID_BOT_ACTIONS = ["alert", "quarantine", "kick"];
const VALID_MENTION_ACTIONS = ["delete", "warn", "timeout"];

let ALERT_SEQ = 0;
let INCIDENT_SEQ = 0;

function getGuildConfig(config, guildId) {
    if (!config[guildId]) config[guildId] = {};
    return config[guildId];
}

function ensureSecurityConfig(gc) {
    const s = gc.security = gc.security || {};
    for (const key of Object.keys(DEFAULT_SECURITY)) {
        if (s[key] === undefined) {
            s[key] = Array.isArray(DEFAULT_SECURITY[key])
                ? DEFAULT_SECURITY[key].slice()
                : (DEFAULT_SECURITY[key] && typeof DEFAULT_SECURITY[key] === "object"
                    ? JSON.parse(JSON.stringify(DEFAULT_SECURITY[key]))
                    : DEFAULT_SECURITY[key]);
        }
    }
    if (!Array.isArray(s.linkBlockedDomains)) s.linkBlockedDomains = [];
    if (!Array.isArray(s.linkWhitelist)) s.linkWhitelist = [];
    if (!Array.isArray(s.linkAllowedChannels)) s.linkAllowedChannels = [];
    if (!Array.isArray(s.linkAllowedRoles)) s.linkAllowedRoles = [];
    if (!Array.isArray(s.exemptRoles)) s.exemptRoles = [];
    if (!Array.isArray(s.botWhitelist)) s.botWhitelist = [];
    if (!Array.isArray(s.alerts)) s.alerts = [];
    if (!s.lockdown) s.lockdown = JSON.parse(JSON.stringify(DEFAULT_SECURITY.lockdown));
    if (!s.quarantine) s.quarantine = {};
    if (!s.stats) s.stats = JSON.parse(JSON.stringify(DEFAULT_SECURITY.stats));
    if (!s.daily) s.daily = {};
    return s;
}

function bumpStats(s, key) {
    s.stats[key] = (s.stats[key] || 0) + 1;
    const day = new Date().toISOString().slice(0, 10);
    if (!s.daily[day]) s.daily[day] = {};
    s.daily[day][key] = (s.daily[day][key] || 0) + 1;
}

function recordAlert(s, data) {
    ALERT_SEQ++;
    s.alerts.unshift({
        id: `S${ALERT_SEQ}`,
        type: data.type || "general",
        user: data.user || null,
        userName: data.userName || null,
        mod: data.mod || null,
        modName: data.modName || null,
        channel: data.channel || null,
        channelName: data.channelName || null,
        reason: data.reason || null,
        action: data.action || null,
        detail: data.detail || null,
        at: Date.now()
    });
    if (s.alerts.length > 500) s.alerts.length = 500;
    bumpStats(s, "alerts");
    return s.alerts[0];
}

function isExempt(member, s) {
    if (!member) return false;
    if (member.permissions?.has(PermissionsBitField.Flags.Administrator)) return true;
    if (member.permissions?.has(PermissionsBitField.Flags.ManageGuild)) return true;
    return (s.exemptRoles || []).some(rid => member.roles?.cache?.has(rid));
}

function countEmojis(text) {
    const custom = (text.match(CUSTOM_EMOJI_REGEX) || []).length;
    const unicode = (text.match(/\p{Extended_Pictographic}/gu) || []).length;
    return custom + unicode;
}

function domainMatches(host, configDomain) {
    const d = String(configDomain || "").toLowerCase().replace(/^www\./, "").trim();
    if (!d) return false;
    return host === d || host.endsWith("." + d);
}

function extractLinkInfo(content, s) {
    if (s.linkBlockInvites !== false && LINK_INVITE_REGEX.test(content || "")) {
        return { type: "invite", domain: "discord.gg" };
    }
    const whitelist = s.linkWhitelist || [];
    const blocked = s.linkBlockedDomains || [];
    let match;
    URL_REGEX.lastIndex = 0;
    while ((match = URL_REGEX.exec(content || "")) !== null) {
        let host = match[2].toLowerCase().replace(/^www\./, "").replace(/[^a-z0-9.-]/g, "");
        if (!host) continue;
        if (whitelist.some(d => domainMatches(host, d))) continue;
        if (blocked.some(d => domainMatches(host, d))) return { type: "domain", domain: host };
    }
    return null;
}

function dangerousPermissionsAdded(oldPerm, newPerm) {
    const oldB = new PermissionsBitField(oldPerm?.bitfield ?? 0n);
    const newB = new PermissionsBitField(newPerm?.bitfield ?? 0n);
    return DANGEROUS_FLAGS.filter(f => !oldB.has(f) && newB.has(f));
}

function dangerousFlagsIn(bitfield) {
    const b = new PermissionsBitField(bitfield ?? 0n);
    return DANGEROUS_FLAGS.filter(f => b.has(f));
}

function bitfieldToOverwriteOptions(allowBits, denyBits) {
    const opts = {};
    for (const [name, bit] of Object.entries(PermissionsBitField.Flags)) {
        if (typeof bit !== "bigint") continue;
        if ((allowBits & bit) !== 0n) opts[name] = true;
        else if ((denyBits & bit) !== 0n) opts[name] = false;
        else opts[name] = null;
    }
    return opts;
}

async function fetchAuditUser(guild, type, targetId, seconds = 10) {
    if (!guild.members?.me?.permissions?.has(PermissionsBitField.Flags.ViewAuditLog)) return null;
    try {
        const data = await guild.fetchAuditLogs({ type, limit: 20 });
        const cutoff = Date.now() - seconds * 1000;
        const entry = data.entries.find(e =>
            (!targetId || e.target?.id === targetId) && e.createdTimestamp >= cutoff
        );
        return entry?.executor || null;
    } catch {
        return null;
    }
}

async function notify(channel, text) {
    const sent = await channel.send(text).catch(() => null);
    if (sent) setTimeout(() => sent.delete().catch(() => {}), 5000);
}

function resolveAlertChannel(guild, config, s, pref) {
    const gc = getGuildConfig(config, guild.id);
    const id = s[pref] || s.alertChannel || gc.logChannel || gc.logs?.main;
    return guild.channels?.cache?.get(id) || null;
}

async function sendSecurityAlert(guild, config, opts) {
    const s = ensureSecurityConfig(getGuildConfig(config, guild.id));
    const channel = resolveAlertChannel(guild, config, s, opts.channelKey);
    if (!channel) return;
    const embed = new EmbedBuilder()
        .setColor(opts.color || "#ED4245")
        .setTitle(opts.title || "🚨 ALERTA DE SEGURIDAD")
        .setTimestamp()
        .setFooter({ text: "DRAGONS | SECURITY" });
    if (opts.description) embed.setDescription(String(opts.description).slice(0, 4096));
    if (opts.fields && opts.fields.length) {
        embed.addFields(opts.fields.slice(0, 25).map(f => ({
            name: String(f.name).slice(0, 256),
            value: String(f.value).slice(0, 1024),
            inline: Boolean(f.inline)
        })));
    }
    await channel.send({ embeds: [embed] }).catch(() => {});
}

async function logSecurityAction(guild, config, opts) {
    await logSystem.logAction(guild, config, {
        category: opts.category || "moderacion",
        event: opts.event || "security",
        title: opts.title || "🛡️ SEGURIDAD",
        description: opts.reason || undefined,
        fields: [
            ...(opts.target ? [{ name: "👤 Usuario", value: `${opts.target} (${opts.target.id})`, inline: true }] : []),
            ...(opts.mod ? [{ name: "🛡️ Origen", value: `${opts.mod} (${opts.mod.id})`, inline: true }] : []),
            ...(opts.detail ? [{ name: "ℹ️ Detalle", value: String(opts.detail).slice(0, 1024), inline: false }] : [])
        ]
    });
}

async function applySanction(opts) {
    const { guild, config, saveConfig, gc, member, action, reason } = opts;
    const s = ensureSecurityConfig(gc);
    const bot = guild.members?.me;
    if (!bot || !member) return { applied: false, reason: "no target" };

    bumpStats(s, "autoSanctions");

    if (action === "warn") {
        const count = addWarning(config, guild.id, member.id, reason, guild.client?.user);
        saveConfig();
        return { applied: "warn", count };
    }
    if (action === "timeout") {
        if (!canModerate(bot, member)) return { applied: false, reason: "canModerate" };
        if (!bot.permissions?.has(PermissionsBitField.Flags.ModerateMembers)) return { applied: false, reason: "no perm" };
        logSystem.registerAction(`mute:${guild.id}:${member.id}`);
        await member.timeout(opts.timeoutMs || s.spamTimeoutMs || 60000, reason).catch(() => {});
        return { applied: "timeout" };
    }
    if (action === "kick") {
        if (!canModerate(bot, member)) return { applied: false, reason: "canModerate" };
        if (!bot.permissions?.has(PermissionsBitField.Flags.KickMembers)) return { applied: false, reason: "no perm" };
        logSystem.registerAction(`kick:${guild.id}:${member.id}`);
        await member.kick(reason).catch(() => {});
        return { applied: "kick" };
    }
    if (action === "ban") {
        if (!canModerate(bot, member)) return { applied: false, reason: "canModerate" };
        if (!bot.permissions?.has(PermissionsBitField.Flags.BanMembers)) return { applied: false, reason: "no perm" };
        logSystem.registerAction(`ban:${guild.id}:${member.id}`);
        await guild.members.ban(member.id, { reason }).catch(() => {});
        return { applied: "ban" };
    }
    if (action === "quarantine") {
        const res = await quarantineUser(guild, config, saveConfig, member, reason, guild.client?.user, s.quarantineDurationMs);
        return { applied: res.ok ? "quarantine" : false };
    }
    return { applied: false };
}

async function handleMessageViolation(message, config, saveConfig, gc, s, data) {
    await message.delete().catch(() => {});
    logSystem.registerAction(`msgdelete:${message.guild.id}:${message.id}`);

    if (data.kind === "links") bumpStats(s, "blockedLinks");
    else if (data.kind === "mentions") bumpStats(s, "blockedMentions");
    else bumpStats(s, "blockedMessages");

    const member = message.member || message.guild?.members?.cache?.get(message.author.id) || null;
    const res = await applySanction({
        guild: message.guild,
        config,
        saveConfig,
        gc,
        member,
        action: data.action,
        reason: data.reason,
        timeoutMs: data.timeoutMs
    });

    recordAlert(s, {
        type: data.alertType,
        user: message.author.id,
        userName: message.author.tag,
        channel: message.channel?.id,
        channelName: message.channel?.name,
        reason: data.reason,
        action: data.action,
        detail: data.detail
    });

    const sevMap = { links: "medium", mentions: "high", spam: "low" };
    recordIncident(gc, {
        type: data.kind === "links" ? "link" : data.kind === "mentions" ? "mention" : "spam",
        severity: sevMap[data.kind] || "medium",
        users: [{ id: message.author.id, tag: message.author.tag }],
        channel: { id: message.channel?.id, name: message.channel?.name },
        rule: data.alertType,
        system: data.kind === "links" ? "antiLinks" : data.kind === "mentions" ? "antiMention" : "antiSpam",
        action: data.action,
        risk: data.kind === "mentions" ? "high" : "medium",
        detail: data.reason
    });
    trackSuspiciousUser(gc, message.author.id, message.author.tag, data.kind);

    const titles = {
        links: "🛡️ ENLACE BLOQUEADO",
        mentions: "📢 MENCIONES BLOQUEADAS",
        spam: "💬 SPAM DETECTADO"
    };
    const events = {
        links: "anti-links",
        mentions: "anti-mass-mention",
        spam: "anti-spam"
    };

    await logSecurityAction(message.guild, config, {
        event: events[data.kind],
        title: titles[data.kind],
        reason: data.reason,
        target: member || message.author,
        mod: message.client?.user,
        detail: `${data.detail} · Acción: ${data.action}${res.applied && res.applied !== "delete" ? ` (${res.applied})` : ""}`
    });

    await notify(message.channel, `⛔ ${message.author}, ${data.reason}${res.applied && res.applied !== "delete" ? ` — se aplicó: ${res.applied}` : ""}`);
    return res;
}

const spamTrack = new Map();
const joinTrack = new Map();

async function handleMessage(message, config, saveConfig) {
    if (!message.guild || message.author.bot) return;
    const gc = getGuildConfig(config, message.guild.id);
    const s = ensureSecurityConfig(gc);
    if (s.enabled === false) return;
    if (isExempt(message.member, s)) return;

    const content = message.content || "";
    const channelId = message.channel?.id;
    const hasRole = rid => message.member?.roles?.cache?.has(rid);

    if (s.antiLinks) {
        const allowedChannel = (s.linkAllowedChannels || []).includes(channelId);
        const allowedRole = (s.linkAllowedRoles || []).some(hasRole);
        if (!allowedChannel && !allowedRole) {
            const info = extractLinkInfo(content, s);
            if (info) {
                await handleMessageViolation(message, config, saveConfig, gc, s, {
                    kind: "links",
                    alertType: "antiLinks",
                    action: s.linkAction,
                    reason: "Enlace no permitido en este servidor",
                    detail: `🔗 ${info.type === "invite" ? "Invitación de Discord" : `Dominio: ${info.domain}`}\n📍 Canal: <#${channelId}>`,
                    timeoutMs: s.spamTimeoutMs
                });
                return;
            }
        }
    }

    if (s.antiSpam) {
        if (s.spamMaxEmojis > 0) {
            const emojis = countEmojis(content);
            if (emojis > s.spamMaxEmojis) {
                await handleMessageViolation(message, config, saveConfig, gc, s, {
                    kind: "spam",
                    alertType: "antiSpam",
                    action: s.spamAction,
                    reason: `Spam de emojis (${emojis})`,
                    detail: `Máximo permitido: ${s.spamMaxEmojis}`,
                    timeoutMs: s.spamTimeoutMs
                });
                return;
            }
        }
        if (s.spamMaxLength > 0 && content.length > s.spamMaxLength) {
            await handleMessageViolation(message, config, saveConfig, gc, s, {
                kind: "spam",
                alertType: "antiSpam",
                action: s.spamAction,
                reason: `Mensaje demasiado largo (${content.length} caracteres)`,
                detail: `Máximo permitido: ${s.spamMaxLength}`,
                timeoutMs: s.spamTimeoutMs
            });
            return;
        }
        const now = Date.now();
        let recent = spamTrack.get(message.author.id) || [];
        recent = recent.filter(t => now - t < s.spamWindowMs);
        recent.push(now);
        spamTrack.set(message.author.id, recent);
        if (recent.length > s.spamLimit) {
            await handleMessageViolation(message, config, saveConfig, gc, s, {
                kind: "spam",
                alertType: "antiSpam",
                action: s.spamAction,
                reason: `Spam: ${recent.length} mensajes en ${Math.floor(s.spamWindowMs / 1000)}s`,
                detail: `Límite: ${s.spamLimit} mensajes / ${Math.floor(s.spamWindowMs / 1000)}s`,
                timeoutMs: s.spamTimeoutMs
            });
            spamTrack.delete(message.author.id);
            return;
        }
    }

    if (s.antiMassMention && content) {
        const userMentions = message.mentions?.users?.size || 0;
        const roleMentions = message.mentions?.roles?.size || 0;
        const mentionCount = userMentions + roleMentions;
        const everyone = Boolean(message.mentions?.everyone);
        let blocked = false;
        if (everyone && s.mentionBlockEveryone) blocked = true;
        if (mentionCount >= s.massMentionLimit) blocked = true;
        if (blocked) {
            await handleMessageViolation(message, config, saveConfig, gc, s, {
                kind: "mentions",
                alertType: "antiMention",
                action: s.mentionAction,
                reason: everyone && s.mentionBlockEveryone
                    ? "@everyone/@here no permitido"
                    : `Spam de menciones (${mentionCount})`,
                detail: `Máximo permitido: ${s.massMentionLimit} menciones`,
                timeoutMs: s.spamTimeoutMs
            });
        }
    }
}

async function quarantineUser(guild, config, saveConfig, member, reason, by, durationMs) {
    const gc = getGuildConfig(config, guild.id);
    const s = ensureSecurityConfig(gc);
    const roleId = s.quarantineRole;
    if (!roleId || !member) return { ok: false, reason: "no role" };
    if (!guild.roles?.cache?.has(roleId)) return { ok: false, reason: "role missing" };
    if (member.roles?.cache?.has(roleId)) return { ok: true, already: true };

    await member.roles.add(roleId, `Cuarentena: ${reason}`).catch(() => {});
    const until = durationMs ? Date.now() + durationMs : null;
    s.quarantine[member.id] = {
        reason,
        by: by?.id || null,
        byName: by?.tag || null,
        at: Date.now(),
        until
    };
    bumpStats(s, "quarantined");
    recordAlert(s, {
        type: "quarantine",
        user: member.id,
        userName: member.user?.tag || null,
        mod: by?.id || null,
        modName: by?.tag || null,
        reason,
        action: "quarantine",
        detail: `Rol de cuarentena: <@&${roleId}>`
    });
    recordIncident(gc, {
        type: "quarantine",
        severity: "high",
        users: [{ id: member.id, tag: member.user?.tag || member.id }],
        rule: "quarantine",
        system: "quarantine",
        action: "quarantine",
        risk: "high",
        staff: by ? { id: by.id || by.user?.id, tag: by.tag || by.user?.tag } : null,
        detail: reason
    });
    trackSuspiciousUser(gc, member.id, member.user?.tag || member.id, "quarantine");
    saveConfig();
    await sendQuarantinePanel(guild, config, member, reason, by);
    if (until) scheduleQuarantineEnd(guild, config, saveConfig, member.id, until - Date.now());
    return { ok: true };
}

function releaseQuarantine(guild, config, saveConfig, userId, by, reason) {
    const gc = getGuildConfig(config, guild.id);
    const s = ensureSecurityConfig(gc);
    const entry = s.quarantine[userId];
    if (!entry) return { ok: false, reason: "not quarantined" };
    const roleId = s.quarantineRole;
    const member = guild.members?.cache?.get(userId);
    if (member && roleId && member.roles?.cache?.has(roleId)) {
        member.roles.remove(roleId, `Cuarentena levantada por ${by?.tag || "staff"}`).catch(() => {});
    }
    delete s.quarantine[userId];
    saveConfig();
    recordAlert(s, {
        type: "quarantine_off",
        user: userId,
        userName: entry.userName || null,
        mod: by?.id || null,
        modName: by?.tag || null,
        reason: reason || "Cuarentena levantada",
        action: "release",
        detail: entry.reason ? `Motivo original: ${entry.reason}` : null
    });
    return { ok: true, entry };
}

async function sendQuarantinePanel(guild, config, member, reason, by) {
    const s = ensureSecurityConfig(getGuildConfig(config, guild.id));
    const channel = resolveAlertChannel(guild, config, s, "alertChannel");
    if (!channel) return;
    const embed = new EmbedBuilder()
        .setColor("#FEE75C")
        .setTitle("🔒 USUARIO EN CUARENTENA")
        .setDescription(
            `👤 **Usuario:** ${member}\n` +
            `⚠️ **Motivo:** ${reason}\n` +
            `🟡 **Estado:** En revisión`
        )
        .addFields(
            { name: "📅 Fecha", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
            { name: "🛡️ Registrado por", value: by ? `${by.tag}` : "Desconocido", inline: true }
        )
        .setFooter({ text: "DRAGONS | SECURITY" });
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`sec_q_liberar_${member.id}`).setLabel("Liberar").setStyle(ButtonStyle.Success).setEmoji("✅"),
        new ButtonBuilder().setCustomId(`sec_q_expulsar_${member.id}`).setLabel("Expulsar").setStyle(ButtonStyle.Danger).setEmoji("👢"),
        new ButtonBuilder().setCustomId(`sec_q_banear_${member.id}`).setLabel("Banear").setStyle(ButtonStyle.Danger).setEmoji("🔨"),
        new ButtonBuilder().setCustomId(`sec_q_info_${member.id}`).setLabel("Ver información").setStyle(ButtonStyle.Secondary).setEmoji("📋")
    );
    await channel.send({ embeds: [embed], components: [row] }).catch(() => {});
}

function scheduleQuarantineEnd(guild, config, saveConfig, userId, ms) {
    if (ms <= 0) return;
    if (ms > MAX_DELAY) ms = MAX_DELAY;
    setTimeout(async () => {
        const s = ensureSecurityConfig(getGuildConfig(config, guild.id));
        const q = s.quarantine?.[userId];
        if (q && q.until && q.until <= Date.now()) {
            releaseQuarantine(guild, config, saveConfig, userId, guild.client?.user, "Cuarentena automática finalizada");
        }
    }, ms);
}

function scheduleLockdownEnd(guild, config, saveConfig, ms) {
    if (ms <= 0) return;
    if (ms > MAX_DELAY) ms = MAX_DELAY;
    setTimeout(async () => {
        const s = ensureSecurityConfig(getGuildConfig(config, guild.id));
        if (s.lockdown?.active && s.lockdown.until && s.lockdown.until <= Date.now()) {
            await deactivateLockdown(guild, config, saveConfig, guild.client?.user, "Lockdown automático finalizado");
        }
    }, ms);
}

async function activateLockdown(guild, config, saveConfig, by, reason, autoMs) {
    const gc = getGuildConfig(config, guild.id);
    const s = ensureSecurityConfig(gc);
    if (s.lockdown?.active) return { ok: false, reason: "already active" };

    const saved = {};
    const channels = [...(guild.channels?.cache?.values() || [])].filter(c =>
        typeof c.isTextBased === "function" && c.isTextBased() && c.permissionOverwrites
    );
    for (const ch of channels) {
        const ow = ch.permissionOverwrites?.cache?.get(guild.id);
        saved[ch.id] = {
            allow: ow ? String(ow.allow.bitfield) : "0",
            deny: ow ? String(ow.deny.bitfield) : "0"
        };
        try {
            await ch.permissionOverwrites.edit(guild.id, {
                SendMessages: false,
                ...(s.lockdownDenyVoice === true ? { Connect: false } : {})
            }, `Lockdown activado por ${by?.tag || by}`).catch(() => {});
        } catch {}
    }

    s.lockdown = {
        active: true,
        by: by?.id || null,
        byName: by?.tag || null,
        at: Date.now(),
        reason: reason || "Lockdown",
        until: autoMs ? Date.now() + autoMs : null,
        saved
    };
    saveConfig();
    recordAlert(s, {
        type: "lockdown",
        mod: by?.id || null,
        modName: by?.tag || null,
        reason: reason || "Lockdown activado",
        action: "lockdown",
        detail: `${channels.length} canales restringidos`
    });
    await sendSecurityAlert(guild, config, {
        title: "🚨 LOCKDOWN ACTIVADO",
        color: "#ED4245",
        description: `🔒 El servidor ha entrado en **lockdown**.\n🛡️ Activado por: ${by?.tag || "Desconocido"}\n📅 <t:${Math.floor(Date.now() / 1000)}:F>`,
        fields: [
            { name: "📍 Canales", value: `${channels.length}`, inline: true },
            { name: "📝 Motivo", value: (reason || "Lockdown").slice(0, 100), inline: true }
        ]
    });
    await logSecurityAction(guild, config, {
        event: "lockdown",
        title: "🚨 LOCKDOWN ACTIVADO",
        reason: reason || "Lockdown activado",
        mod: by,
        detail: `${channels.length} canales restringidos`
    });
    recordIncident(gc, {
        type: "lockdown",
        severity: "critical",
        users: by ? [{ id: by.id || by.user?.id, tag: by.tag || by.user?.tag }] : [],
        rule: "lockdown",
        system: "lockdown",
        action: "lockdown",
        risk: "high",
        staff: by ? { id: by.id || by.user?.id, tag: by.tag || by.user?.tag } : null,
        detail: reason || "Lockdown activado"
    });
    if (autoMs) scheduleLockdownEnd(guild, config, saveConfig, autoMs);
    return { ok: true, channels: channels.length };
}

async function deactivateLockdown(guild, config, saveConfig, by, reason) {
    const gc = getGuildConfig(config, guild.id);
    const s = ensureSecurityConfig(gc);
    if (!s.lockdown?.active) return { ok: false, reason: "not active" };

    const saved = s.lockdown.saved || {};
    let restored = 0;
    for (const [chId, data] of Object.entries(saved)) {
        const ch = guild.channels?.cache?.get(chId);
        if (!ch || !ch.permissionOverwrites) continue;
        try {
            const opts = bitfieldToOverwriteOptions(BigInt(data.allow || 0), BigInt(data.deny || 0));
            await ch.permissionOverwrites.edit(guild.id, opts, `Lockdown desactivado por ${by?.tag || by}`).catch(() => {});
            restored++;
        } catch {}
    }

    s.lockdown = { active: false, by: null, byName: null, at: null, reason: null, until: null, saved: {} };
    saveConfig();
    recordAlert(s, {
        type: "lockdown_off",
        mod: by?.id || null,
        modName: by?.tag || null,
        reason: reason || "Lockdown desactivado",
        action: "lockdown_off",
        detail: `${restored} canales restaurados`
    });
    await sendSecurityAlert(guild, config, {
        title: "🟢 LOCKDOWN DESACTIVADO",
        color: "#57F287",
        description: `El servidor ha salido del **lockdown**.\n🛡️ Desactivado por: ${by?.tag || "Desconocido"}`,
        fields: [
            { name: "📍 Canales restaurados", value: `${restored}`, inline: true },
            { name: "📝 Motivo", value: (reason || "Lockdown desactivado").slice(0, 100), inline: true }
        ]
    });
    await logSecurityAction(guild, config, {
        event: "lockdown_off",
        title: "🟢 LOCKDOWN DESACTIVADO",
        reason: reason || "Lockdown desactivado",
        mod: by,
        detail: `${restored} canales restaurados a su estado anterior`
    });
    recordIncident(gc, {
        type: "lockdown_off",
        severity: "low",
        users: by ? [{ id: by.id || by.user?.id, tag: by.tag || by.user?.tag }] : [],
        rule: "lockdown",
        system: "lockdown",
        action: "lockdown_off",
        risk: "low",
        staff: by ? { id: by.id || by.user?.id, tag: by.tag || by.user?.tag } : null,
        detail: reason || "Lockdown desactivado"
    });
    return { ok: true, restored };
}

function isLockdownActive(gc) {
    const s = ensureSecurityConfig(gc);
    return Boolean(s.lockdown?.active);
}

function getQuarantined(config, guildId) {
    return ensureSecurityConfig(getGuildConfig(config, guildId)).quarantine || {};
}

function getAlerts(config, guildId) {
    return ensureSecurityConfig(getGuildConfig(config, guildId)).alerts || [];
}

function clearAlerts(config, guildId) {
    const s = ensureSecurityConfig(getGuildConfig(config, guildId));
    const count = s.alerts.length;
    s.alerts = [];
    return count;
}

function getStats(config, guildId) {
    return ensureSecurityConfig(getGuildConfig(config, guildId)).stats || {};
}

function getStatusLines(gc) {
    const s = ensureSecurityConfig(gc);
    const g = v => (v ? "🟢" : "🔴");
    return {
        enabled: s.enabled !== false,
        lines: [
            `${g(s.antiRaid)} **Anti-Raid** — ${s.raidThreshold} ingresos / ${Math.floor(s.raidWindowMs / 1000)}s · acción: ${s.raidAction}`,
            `${g(s.antiBot)} **Anti-Bot** — acción: ${s.botAction}${(s.botWhitelist || []).length ? ` · ${s.botWhitelist.length} permitidos` : ""}`,
            `${g(s.antiSpam)} **Anti-Spam** — ${s.spamLimit} msgs / ${Math.floor(s.spamWindowMs / 1000)}s · acción: ${s.spamAction}`,
            `${g(s.antiLinks)} **Anti-Links** — acción: ${s.linkAction}${(s.linkBlockedDomains || []).length ? ` · ${s.linkBlockedDomains.length} dominios en lista negra` : ""}`,
            `${g(s.antiMassMention)} **Anti-Menciones** — límite: ${s.massMentionLimit} · acción: ${s.mentionAction}`,
            `${g(s.roleProtection)} **Protección de Roles** — ${s.roleAutoRevert ? "alerta + revertir" : "solo alerta"}`
        ]
    };
}

function recordIncident(gc, data) {
    const s = ensureSecurityConfig(gc);
    if (!Array.isArray(s.incidents)) s.incidents = [];
    s.incidentSeq = (s.incidentSeq || 0) + 1;
    const incident = {
        id: s.incidentSeq,
        type: data.type || "general",
        severity: data.severity || "medium",
        status: "active",
        users: data.users || [],
        channel: data.channel || null,
        role: data.role || null,
        rule: data.rule || null,
        system: data.system || data.type || "security",
        action: data.action || null,
        risk: data.risk || "medium",
        staff: data.staff || null,
        detail: data.detail || null,
        aiAnalysis: null,
        timestamp: Date.now(),
        resolvedAt: null,
        resolvedBy: null
    };
    s.incidents.unshift(incident);
    if (s.incidents.length > 200) s.incidents.length = 200;
    return incident;
}

function getIncidents(gc, filters) {
    const s = ensureSecurityConfig(gc);
    let list = Array.isArray(s.incidents) ? s.incidents : [];
    if (filters) {
        if (filters.type) list = list.filter(i => i.type === filters.type);
        if (filters.userId) list = list.filter(i => i.users && i.users.some(u => u.id === filters.userId));
        if (filters.search) {
            const q = filters.search.toLowerCase();
            list = list.filter(i =>
                (i.detail || "").toLowerCase().includes(q) ||
                (i.type || "").toLowerCase().includes(q) ||
                (i.users || []).some(u => (u.tag || "").toLowerCase().includes(q) || u.id === q) ||
                String(i.id) === q
            );
        }
        if (filters.days && filters.days > 0) {
            const cutoff = Date.now() - filters.days * 86400000;
            list = list.filter(i => (i.timestamp || 0) >= cutoff);
        }
    }
    return list;
}

function getIncidentById(gc, id) {
    const s = ensureSecurityConfig(gc);
    return (s.incidents || []).find(i => i.id === id) || null;
}

function updateIncidentStatus(gc, incidentId, status, by) {
    const incident = getIncidentById(gc, incidentId);
    if (!incident) return false;
    incident.status = status;
    if (status === "resolved" || status === "closed") {
        incident.resolvedAt = Date.now();
        incident.resolvedBy = by || null;
    }
    return true;
}

function trackSuspiciousUser(gc, userId, userTag, reason) {
    const s = ensureSecurityConfig(gc);
    if (!s.suspiciousUsers) s.suspiciousUsers = {};
    const existing = s.suspiciousUsers[userId];
    if (existing) {
        existing.reasons = existing.reasons || [];
        if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
        existing.incidentCount = (existing.incidentCount || 0) + 1;
        existing.lastActivity = Date.now();
        const score = existing.reasons.length * 2 + existing.incidentCount;
        existing.risk = score >= 6 ? "high" : score >= 3 ? "medium" : "low";
    } else {
        s.suspiciousUsers[userId] = {
            userId,
            userTag: userTag || userId,
            risk: "low",
            reasons: [reason],
            incidentCount: 1,
            lastIncident: Date.now(),
            quarantined: false,
            firstSeen: Date.now(),
            lastActivity: Date.now()
        };
    }
    return s.suspiciousUsers[userId];
}

function getSuspiciousUsers(gc) {
    const s = ensureSecurityConfig(gc);
    return Object.values(s.suspiciousUsers || {});
}

function getUserIncidents(gc, userId) {
    return getIncidents(gc, { userId });
}

function getDailyStatsForPeriod(gc, days) {
    const s = ensureSecurityConfig(gc);
    const daily = s.daily || {};
    const result = {};
    const keys = ["raids", "blockedMessages", "blockedLinks", "blockedMentions", "botsDetected", "quarantined", "alerts", "autoSanctions"];
    for (const key of keys) result[key] = 0;
    const now = new Date();
    for (let i = 0; i < days; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dayStr = d.toISOString().slice(0, 10);
        if (daily[dayStr]) {
            for (const key of keys) {
                result[key] += daily[dayStr][key] || 0;
            }
        }
    }
    return result;
}

function getSystemStats(gc) {
    const s = ensureSecurityConfig(gc);
    const incidents = Array.isArray(s.incidents) ? s.incidents : [];
    const byType = {};
    for (const inc of incidents) {
        const t = inc.type || "general";
        byType[t] = (byType[t] || 0) + 1;
    }
    return {
        total: incidents.length,
        byType,
        today: getIncidents(gc, { days: 1 }).length,
        week: getIncidents(gc, { days: 7 }).length,
        month: getIncidents(gc, { days: 30 }).length
    };
}

function cleanupOldIncidents(gc) {
    const s = ensureSecurityConfig(gc);
    const days = s.incidentRetentionDays || 30;
    if (days <= 0) return 0;
    const cutoff = Date.now() - days * 86400000;
    const before = (s.incidents || []).length;
    s.incidents = (s.incidents || []).filter(i => (i.timestamp || 0) >= cutoff);
    return before - s.incidents.length;
}

function getIncidentSeverityCounts(gc) {
    const s = ensureSecurityConfig(gc);
    const incidents = Array.isArray(s.incidents) ? s.incidents : [];
    const counts = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const inc of incidents) {
        const sev = inc.severity || "medium";
        counts[sev] = (counts[sev] || 0) + 1;
    }
    return counts;
}

function getRecentIncidents(gc, limit) {
    const s = ensureSecurityConfig(gc);
    return (s.incidents || []).slice(0, limit || 10);
}

function getIncidentsToday(gc) {
    return getIncidents(gc, { days: 1 });
}

function getIncidentsWeek(gc) {
    return getIncidents(gc, { days: 7 });
}

function getIncidentsMonth(gc) {
    return getIncidents(gc, { days: 30 });
}

async function handleGuildMemberAdd(member, config, saveConfig) {
    if (!member.guild) return;
    const gc = getGuildConfig(config, member.guild.id);
    const s = ensureSecurityConfig(gc);
    if (s.enabled === false) return;

    const isBot = Boolean(member.user?.bot);

    if (isBot) {
        if (!s.antiBot) return;
        if ((s.botWhitelist || []).includes(member.id)) return;
        const reason = "Bot añadido al servidor";
        const addedBy = await fetchAuditUser(member.guild, AuditLogEvent.BotAdd, member.id);
        bumpStats(s, "botsDetected");
        recordAlert(s, {
            type: "antiBot",
            user: member.id,
            userName: member.user?.tag || null,
            mod: addedBy?.id || null,
            modName: addedBy?.tag || null,
            reason,
            action: s.botAction,
            detail: `Permisos otorgados: ${decodePermissions(member.guild, member.id)}`
        });
        if (s.botAction === "kick") {
            const bot = member.guild.members?.me;
            if (bot && canModerate(bot, member) && bot.permissions?.has(PermissionsBitField.Flags.KickMembers)) {
                logSystem.registerAction(`kick:${member.guild.id}:${member.id}`);
                await member.kick(reason).catch(() => {});
            }
        } else if (s.botAction === "quarantine") {
            await quarantineUser(member.guild, config, saveConfig, member, reason, member.guild.client?.user, s.quarantineDurationMs);
        }
        await sendSecurityAlert(member.guild, config, {
            channelKey: "botAlertChannel",
            title: "🤖 NUEVO BOT DETECTADO",
            color: "#FEE75C",
            fields: [
                { name: "🤖 Bot", value: `${member.user} (${member.id})`, inline: true },
                { name: "👤 Añadido por", value: addedBy ? `${addedBy.user} (${addedBy.id})` : "Desconocido", inline: true },
                { name: "⚡ Acción", value: s.botAction, inline: true },
                { name: "📅 Fecha", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                { name: "🔐 Permisos", value: decodePermissions(member.guild, member.id).slice(0, 1000) || "Ninguno", inline: false }
            ]
        });
        await logSecurityAction(member.guild, config, {
            event: "antiBot",
            title: "🤖 NUEVO BOT DETECTADO",
            reason,
            target: member.user,
            mod: addedBy || member.guild.client?.user,
            detail: `Acción configurada: ${s.botAction}`
        });
        recordIncident(gc, {
            type: "bot",
            severity: "high",
            users: [{ id: member.id, tag: member.user?.tag || member.id }],
            rule: "antiBot",
            system: "antiBot",
            action: s.botAction,
            risk: "high",
            detail: reason
        });
        trackSuspiciousUser(gc, member.id, member.user?.tag || member.id, "bot");
        return;
    }

    if (!s.antiRaid) return;
    const now = Date.now();
    let joins = joinTrack.get(member.guild.id) || [];
    joins.push({ id: member.id, at: now });
    joinTrack.set(member.guild.id, joins);
    const recent = joins.filter(j => now - j.at < s.raidWindowMs);

    if (recent.length >= s.raidThreshold) {
        bumpStats(s, "raids");
        recordAlert(s, {
            type: "raid",
            user: member.id,
            userName: member.user?.tag || null,
            reason: "Raid detectado: ingresos masivos",
            action: s.raidAction,
            detail: `${recent.length} ingresos en ${Math.floor(s.raidWindowMs / 1000)} segundos`
        });
        await sendSecurityAlert(member.guild, config, {
            channelKey: "raidAlertChannel",
            title: "🚨 RAID DETECTADO",
            color: "#ED4245",
            description: `👥 **Entradas:** ${recent.length}\n⏱️ **Tiempo:** ${Math.floor(s.raidWindowMs / 1000)} segundos\n🛡️ **Protección automática activada.**`,
            fields: [
                { name: "⚡ Acción", value: s.raidAction, inline: true },
                { name: "📅 Fecha", value: `<t:${Math.floor(now / 1000)}:F>`, inline: true }
            ]
        });
        await logSecurityAction(member.guild, config, {
            event: "anti-raid",
            title: "🚨 RAID DETECTADO",
            reason: "Raid detectado: ingresos masivos",
            target: member.user,
            mod: member.guild.client?.user,
            detail: `${recent.length} ingresos en ${Math.floor(s.raidWindowMs / 1000)}s · Acción: ${s.raidAction}`
        });
        recordIncident(gc, {
            type: "raid",
            severity: "critical",
            users: recent.map(j => ({ id: j.id, tag: null })),
            rule: "antiRaid",
            system: "antiRaid",
            action: s.raidAction,
            risk: "high",
            detail: `${recent.length} ingresos en ${Math.floor(s.raidWindowMs / 1000)} segundos`
        });

        if (s.raidAction === "lockdown") {
            await activateLockdown(member.guild, config, saveConfig, member.guild.client?.user, `Raid detectado (${recent.length} ingresos)`, s.raidLockdownMs);
            await quarantineUser(member.guild, config, saveConfig, member, "Cuarentena por raid", member.guild.client?.user, s.raidLockdownMs);
        } else if (s.raidAction === "kick") {
            const bot = member.guild.members?.me;
            if (bot && canModerate(bot, member) && bot.permissions?.has(PermissionsBitField.Flags.KickMembers)) {
                logSystem.registerAction(`kick:${member.guild.id}:${member.id}`);
                await member.kick("Anti-raid: ingresos masivos").catch(() => {});
            }
        } else if (s.raidAction === "quarantine") {
            await quarantineUser(member.guild, config, saveConfig, member, "Cuarentena por raid", member.guild.client?.user, s.quarantineDurationMs);
        }
        joinTrack.set(member.guild.id, recent);
    }
}

function decodePermissions(guild, memberId) {
    const member = guild.members?.cache?.get(memberId);
    if (!member) return "";
    try {
        const roles = [...(member.roles?.cache?.values() || [])];
        const merged = new PermissionsBitField(roles.map(r => r.permissions?.bitfield || 0n));
        return merged.toArray().join(", ");
    } catch {
        return "";
    }
}

function hasStaffPermission(member) {
    if (!member) return false;
    if (member.permissions?.has(PermissionsBitField.Flags.Administrator)) return true;
    if (member.permissions?.has(PermissionsBitField.Flags.ManageGuild)) return true;
    if (member.permissions?.has(PermissionsBitField.Flags.ModerateMembers)) return true;
    if (member.permissions?.has(PermissionsBitField.Flags.KickMembers)) return true;
    if (member.permissions?.has(PermissionsBitField.Flags.BanMembers)) return true;
    return false;
}

async function handleSecurityInteraction(interaction, config, saveConfig) {
    const id = interaction.customId;
    if (!(interaction.isButton && interaction.isButton()) || !id?.startsWith("sec_q_")) return false;

    const parts = id.split("_");
    const action = parts[2];
    const userId = parts.slice(3).join("_");
    if (!action || !userId) return false;

    if (!hasStaffPermission(interaction.member)) {
        await interaction.reply({
            content: "❌ No tienes permisos de moderación para gestionar cuarentenas.",
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
        return true;
    }

    const guild = interaction.guild;
    const gc = getGuildConfig(config, guild.id);
    const s = ensureSecurityConfig(gc);
    const member = guild.members?.cache?.get(userId);
    const entry = s.quarantine?.[userId];

    switch (action) {
        case "liberar": {
            const res = releaseQuarantine(guild, config, saveConfig, userId, interaction.member, "Liberado por el staff");
            await interaction.reply({
                content: res.ok
                    ? "✅ Cuarentena levantada correctamente."
                    : "ℹ️ Este usuario no estaba en cuarentena.",
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
            break;
        }
        case "expulsar": {
            if (!member) {
                await interaction.reply({ content: "❌ El usuario ya no está en el servidor.", flags: MessageFlags.Ephemeral }).catch(() => {});
                break;
            }
            const bot = guild.members?.me;
            if (!bot || !canModerate(bot, member) || !bot.permissions?.has(PermissionsBitField.Flags.KickMembers)) {
                await interaction.reply({ content: "❌ No puedo expulsar a este usuario (permisos insuficientes).", flags: MessageFlags.Ephemeral }).catch(() => {});
                break;
            }
            logSystem.registerAction(`kick:${guild.id}:${member.id}`);
            await member.kick("Expulsado desde cuarentena").catch(() => {});
            releaseQuarantine(guild, config, saveConfig, userId, interaction.member, "Expulsado desde cuarentena");
            await interaction.reply({ content: "👢 Usuario expulsado y cuarentena cerrada.", flags: MessageFlags.Ephemeral }).catch(() => {});
            break;
        }
        case "banear": {
            const bot = guild.members?.me;
            if (!bot || !bot.permissions?.has(PermissionsBitField.Flags.BanMembers)) {
                await interaction.reply({ content: "❌ No puedo banear a este usuario (permisos insuficientes).", flags: MessageFlags.Ephemeral }).catch(() => {});
                break;
            }
            logSystem.registerAction(`ban:${guild.id}:${userId}`);
            await guild.members.ban(userId, { reason: "Baneado desde cuarentena" }).catch(() => {});
            releaseQuarantine(guild, config, saveConfig, userId, interaction.member, "Baneado desde cuarentena");
            await interaction.reply({ content: "🔨 Usuario baneado y cuarentena cerrada.", flags: MessageFlags.Ephemeral }).catch(() => {});
            break;
        }
        case "info": {
            const embed = new EmbedBuilder()
                .setColor("#FEE75C")
                .setTitle("🔒 INFORMACIÓN DE CUARENTENA")
                .setDescription(
                    entry
                        ? `👤 **Usuario:** ${entry.userName || userId} (${userId})\n⚠️ **Motivo:** ${entry.reason || "—"}\n🛡️ **Registrado por:** ${entry.byName || "Desconocido"}\n📅 **Fecha:** <t:${Math.floor((entry.at || 0) / 1000)}:F>\n⏳ **Hasta:** ${entry.until ? `<t:${Math.floor(entry.until / 1000)}:F>` : "Manual"}`
                        : "ℹ️ Este usuario no está en cuarentena."
                )
                .setFooter({ text: "DRAGONS | SECURITY" });
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => {});
            break;
        }
        default:
            return false;
    }
    return true;
}

function setupSecurity(client, config, saveConfig) {
    for (const [guildId, gc] of Object.entries(config)) {
        const guild = client.guilds?.cache?.get(guildId);
        if (!guild || !gc || !gc.security) continue;
        const s = ensureSecurityConfig(gc);
        if (s.lockdown?.active) {
            if (s.lockdown.until && s.lockdown.until > Date.now()) {
                scheduleLockdownEnd(guild, config, saveConfig, s.lockdown.until - Date.now());
            } else {
                deactivateLockdown(guild, config, saveConfig, client.user, "Lockdown restaurado tras reinicio");
            }
        }
        for (const [userId, q] of Object.entries(s.quarantine || {})) {
            if (q.until && q.until > Date.now()) {
                scheduleQuarantineEnd(guild, config, saveConfig, userId, q.until - Date.now());
            } else if (q.until && q.until <= Date.now()) {
                releaseQuarantine(guild, config, saveConfig, userId, client.user, "Cuarentena automática finalizada");
            }
        }
    }

    client.on("roleCreate", async role => {
        const gc = getGuildConfig(config, role.guild.id);
        const s = ensureSecurityConfig(gc);
        if (s.enabled === false || !s.roleProtection) return;
        const dangerous = dangerousFlagsIn(role.permissions?.bitfield);
        const by = await fetchAuditUser(role.guild, AuditLogEvent.RoleCreate, role.id);
        await handleRoleEvent(role.guild, config, gc, {
            type: "roleCreate",
            title: "🎭 ROL CREADO",
            role,
            by,
            dangerous,
            detail: `Rol creado: **${role.name}**`,
            channelName: null
        });
    });

    client.on("roleDelete", async role => {
        const gc = getGuildConfig(config, role.guild.id);
        const s = ensureSecurityConfig(gc);
        if (s.enabled === false || !s.roleProtection) return;
        const by = await fetchAuditUser(role.guild, AuditLogEvent.RoleDelete, role.id);
        await handleRoleEvent(role.guild, config, gc, {
            type: "roleDelete",
            title: "🎭 ROL ELIMINADO",
            role,
            by,
            dangerous: [],
            detail: `Rol eliminado: **${role.name}**`,
            channelName: null
        });
    });

    client.on("roleUpdate", async (oldRole, newRole) => {
        const gc = getGuildConfig(config, newRole.guild.id);
        const s = ensureSecurityConfig(gc);
        if (s.enabled === false || !s.roleProtection) return;
        if ((oldRole.permissions?.bitfield || 0n) === (newRole.permissions?.bitfield || 0n)) return;
        const added = dangerousPermissionsAdded(oldRole.permissions, newRole.permissions);
        const by = await fetchAuditUser(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);
        if (added.length) {
            await handleRoleEvent(newRole.guild, config, gc, {
                type: "roleUpdate",
                title: "🔐 PERMISOS PELIGROSOS OTORGADOS",
                role: newRole,
                by,
                dangerous: added,
                detail: `Permiso(s) otorgado(s) a **${newRole.name}**: ${added.join(", ")}`,
                channelName: null
            });
            if (s.roleAutoRevert === true) {
                try {
                    await newRole.setPermissions(oldRole.permissions.bitfield, `Revertido por protección de roles (${added.join(", ")})`);
                } catch {}
            }
        } else {
            await logSecurityAction(newRole.guild, config, {
                event: "roleChange",
                title: "🎭 CAMBIO DE ROL",
                reason: `Se modificaron permisos del rol **${newRole.name}**`,
                mod: by || newRole.guild.client?.user,
                detail: `Permiso anterior: ${formatPermissionList(oldRole.permissions)} → Permiso nuevo: ${formatPermissionList(newRole.permissions)}`
            });
        }
    });

    client.on("guildMemberUpdate", async (oldMember, newMember) => {
        const gc = getGuildConfig(config, newMember.guild.id);
        const s = ensureSecurityConfig(gc);
        if (s.enabled === false || !s.roleProtection) return;
        const oldRoles = oldMember.roles?.cache || new Set();
        const addedRoles = [...(newMember.roles?.cache?.values() || [])].filter(r => !oldRoles.has(r.id));
        for (const role of addedRoles) {
            const dangerous = dangerousFlagsIn(role.permissions?.bitfield);
            if (!dangerous.length) continue;
            const by = await fetchAuditUser(newMember.guild, AuditLogEvent.MemberRoleUpdate, newMember.id);
            await handleRoleEvent(newMember.guild, config, gc, {
                type: "roleGrant",
                title: "🔐 ROL PELIGROSO OTORGADO",
                role,
                by,
                dangerous,
                user: newMember,
                detail: `Se otorgó **${role.name}** a ${newMember.user?.tag || newMember.id} (${newMember.id})`,
                channelName: null
            });
        }
    });

    client.on("channelUpdate", async (oldChannel, newChannel) => {
        const gc = getGuildConfig(config, newChannel.guild.id);
        const s = ensureSecurityConfig(gc);
        if (s.enabled === false || !s.roleProtection) return;
        if (!oldChannel.permissionOverwrites || !newChannel.permissionOverwrites) return;
        const oldOw = oldChannel.permissionOverwrites.cache;
        const newOw = newChannel.permissionOverwrites.cache;
        for (const [id, n] of newOw) {
            const o = oldOw?.get(id);
            if (!o) {
                const dangerous = dangerousFlagsIn(n.allow?.bitfield);
                if (dangerous.length) await handleOverwriteEvent(newChannel, config, gc, id, dangerous);
                continue;
            }
            const added = dangerousPermissionsAdded(o.allow, n.allow);
            if (added.length) await handleOverwriteEvent(newChannel, config, gc, id, added);
        }
    });
}

function formatPermissionList(perm) {
    try {
        return new PermissionsBitField(perm?.bitfield ?? 0n).toArray().join(", ") || "ninguno";
    } catch {
        return "—";
    }
}

async function handleRoleEvent(guild, config, gc, opts) {
    const s = ensureSecurityConfig(gc);
    const dangerous = opts.dangerous || [];
    const high = dangerous.length > 0;
    recordAlert(s, {
        type: high ? "roleProtection" : "roleChange",
        user: opts.user?.id || null,
        userName: opts.user?.user?.tag || null,
        mod: opts.by?.id || null,
        modName: opts.by?.user?.tag || null,
        channel: null,
        reason: opts.detail,
        action: high ? "alert" : "log",
        detail: opts.detail
    });
    if (high) {
        await sendSecurityAlert(guild, config, {
            channelKey: "roleAlertChannel",
            title: "🔐 ALERTA: CAMBIO PELIGROSO DETECTADO",
            color: "#ED4245",
            fields: [
                { name: "👤 Quién", value: opts.by ? `${opts.by.user} (${opts.by.id})` : "Desconocido", inline: true },
                { name: "🎯 Qué", value: opts.detail.slice(0, 200), inline: false },
                { name: "🔐 Permiso(s) peligroso(s)", value: dangerous.join(", ") || "Ninguno", inline: true },
                { name: "📍 Canal", value: opts.channelName ? `<#${opts.channelName}>` : "—", inline: true },
                { name: "📅 Fecha", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
            ]
        });
    }
    await logSecurityAction(guild, config, {
        category: "servidor",
        event: "roleChange",
        title: high ? "🔐 CAMBIO PELIGROSO DETECTADO" : "🎭 CAMBIO DE ROL",
        reason: opts.detail,
        mod: opts.by || guild.client?.user,
        detail: high ? `Permiso(s): ${dangerous.join(", ")}` : "Sin permisos peligrosos"
    });
    if (high) {
        recordIncident(gc, {
            type: "roleProtection",
            severity: "high",
            users: opts.user ? [{ id: opts.user.id || opts.user.user?.id, tag: opts.user.user?.tag || opts.user.id }] : [],
            role: opts.role ? { id: opts.role.id, name: opts.role.name } : null,
            rule: "roleProtection",
            system: "roleProtection",
            action: "alert",
            risk: "high",
            staff: opts.by ? { id: opts.by.id || opts.by.user?.id, tag: opts.by.user?.tag || opts.by.id } : null,
            detail: opts.detail
        });
    }
}

async function handleOverwriteEvent(channel, config, gc, targetId, dangerous) {
    const s = ensureSecurityConfig(gc);
    const guild = channel.guild;
    const targetName = targetId === guild.id ? "@everyone" : (guild.roles?.cache?.get(targetId)?.name || guild.members?.cache?.get(targetId)?.user?.tag || targetId);
    const by = await fetchAuditUser(guild, AuditLogEvent.ChannelUpdate, channel.id);
    const detail = `Se otorgó permiso peligroso (${dangerous.join(", ")}) a **${targetName}** en <#${channel.id}>`;
    recordAlert(s, {
        type: "roleProtection",
        mod: by?.id || null,
        modName: by?.user?.tag || null,
        channel: channel.id,
        channelName: channel.name,
        reason: detail,
        action: "alert",
        detail
    });
    await sendSecurityAlert(guild, config, {
        channelKey: "roleAlertChannel",
        title: "🔐 ALERTA: PERMISO PELIGROSO EN CANAL",
        color: "#ED4245",
        fields: [
            { name: "👤 Quién", value: by ? `${by.user} (${by.id})` : "Desconocido", inline: true },
            { name: "🎯 Qué", value: detail.slice(0, 200), inline: false },
            { name: "🔐 Permiso(s)", value: dangerous.join(", "), inline: true },
            { name: "📍 Canal", value: `<#${channel.id}>`, inline: true },
            { name: "📅 Fecha", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
        ]
    });
    await logSecurityAction(guild, config, {
        category: "servidor",
        event: "permissionUpdate",
        title: "🔐 PERMISO PELIGROSO EN CANAL",
        reason: detail,
        mod: by || guild.client?.user,
        detail: `Permiso(s): ${dangerous.join(", ")}`
    });
    recordIncident(gc, {
        type: "roleProtection",
        severity: "high",
        users: by ? [{ id: by.id, tag: by.user?.tag || by.id }] : [],
        channel: { id: channel.id, name: channel.name },
        rule: "roleProtection",
        system: "roleProtection",
        action: "alert",
        risk: "high",
        staff: by ? { id: by.id, tag: by.user?.tag || by.id } : null,
        detail
    });
}

module.exports = {
    ensureSecurityConfig,
    setupSecurity,
    handleMessage,
    handleGuildMemberAdd,
    handleSecurityInteraction,
    activateLockdown,
    deactivateLockdown,
    isLockdownActive,
    quarantineUser,
    releaseQuarantine,
    getQuarantined,
    getAlerts,
    clearAlerts,
    getStats,
    getStatusLines,
    getGuildConfig,
    recordIncident,
    getIncidents,
    getIncidentById,
    updateIncidentStatus,
    trackSuspiciousUser,
    getSuspiciousUsers,
    getUserIncidents,
    getDailyStatsForPeriod,
    getSystemStats,
    cleanupOldIncidents,
    getIncidentSeverityCounts,
    getRecentIncidents,
    getIncidentsToday,
    getIncidentsWeek,
    getIncidentsMonth
};
