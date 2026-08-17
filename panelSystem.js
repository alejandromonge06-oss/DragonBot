const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    PermissionsBitField,
    MessageFlags
} = require("discord.js");
const logSystem = require("./logSystem");
const encuestaSystem = require("./encuestaSystem");
const securitySystem = require("./securitySystem");
const musicSystem = require("./musicSystem");
const aiSystem = require("./aiSystem");
const recruitmentSystem = require("./recruitmentSystem");
const tiktokSystem = require("./tiktokSystem");
const aiControlSystem = require("./aiControlSystem");
const { parseDuration } = require("./moderation");
const { version: BOT_VERSION } = require("./package.json");

const PANEL_COLOR = "#8A2BE2";

const SECURITY_FEATURES = [
    { id: "antiRaid", label: "⚔️ Anti-Raid", desc: "Detecta ingresos masivos y activa la protección." },
    { id: "antiBot", label: "🤖 Anti-Bot", desc: "Detecta y gestiona la entrada de bots." },
    { id: "antiSpam", label: "🚨 Anti-Spam", desc: "Limita mensajes repetidos, emojis y longitud." },
    { id: "antiLinks", label: "🔗 Anti-Links", desc: "Bloquea enlaces no permitidos e invitaciones." },
    { id: "antiMassMention", label: "📣 Anti-Menciones", desc: "Bloquea menciones masivas y @everyone." },
    { id: "roleProtection", label: "🎭 Protección de Roles", desc: "Alerta sobre roles y permisos peligrosos." }
];

const SECTIONS = [
    { id: "seguridad", emoji: "🛡️", label: "Seguridad", desc: "Anti-spam, anti-raid, anti-links, auto-mute y sanciones." },
    { id: "tickets", emoji: "🎫", label: "Tickets", desc: "Configura el canal, categoría, rol de soporte y estado del sistema de tickets." },
    { id: "bienvenidas", emoji: "👋", label: "Bienvenidas", desc: "Canal, mensaje, imagen, color y estado de la bienvenida." },
    { id: "logs", emoji: "📋", label: "Logs", desc: "Canal principal y categorías de registros." },
    { id: "autoroles", emoji: "🎭", label: "Auto-Roles", desc: "Roles asignados automáticamente a nuevos miembros." },
    { id: "tts", emoji: "🔊", label: "TTS", desc: "Bot de voz: lee en voz alta los mensajes del canal de texto configurado." },
    { id: "musica", emoji: "🎵", label: "Música", desc: "Reproduce música en canales de voz con cola, volumen, loop y más." },
    { id: "sugerencias", emoji: "💡", label: "Sugerencias", desc: "Canal de sugerencias con aprobación del staff." },
    { id: "sorteos", emoji: "🎁", label: "Sorteos", desc: "Crea sorteos con participantes y ganadores aleatorios." },
    { id: "encuestas", emoji: "🗳️", label: "Encuestas", desc: "Canal, duración, tipo de votación y estado de las encuestas." },
    { id: "estadisticas", emoji: "📊", label: "Estadísticas", desc: "Información general del servidor." },
    { id: "configuracion", emoji: "⚙️", label: "Configuración", desc: "Versión, estado de los sistemas y restablecimiento." },
    { id: "ai", emoji: "🤖", label: "DRAGONS AI", desc: "Inteligencia artificial conversacional. Canal, permisos, memoria y conocimiento." },
    { id: "aiControl", emoji: "🧠", label: "AI Security", desc: "Centro de seguridad inteligente: detección, reputación, incidentes, recuperación y simulación." },
    { id: "recruitment", emoji: "📝", label: "Postulaciones", desc: "Sistema de reclutamiento: vacantes, postulaciones, entrevistas y análisis." },
    { id: "tiktok", emoji: "📱", label: "TikTok", desc: "Notificaciones automáticas de nuevos videos de TikTok." }
];

const RESET_TARGETS = [
    { id: "welcome", label: "👋 Bienvenida" },
    { id: "tickets", label: "🎫 Tickets" },
    { id: "logs", label: "📋 Logs" },
    { id: "security", label: "🛡️ Seguridad" },
    { id: "autoroles", label: "🎭 Auto-Roles" },
    { id: "tts", label: "🔊 TTS" },
    { id: "musica", label: "🎵 Música" },
    { id: "sugerencias", label: "💡 Sugerencias" },
    { id: "sorteos", label: "🎁 Sorteos" },
    { id: "encuestas", label: "🗳️ Encuestas" },
    { id: "ai", label: "🤖 DRAGONS AI" },
    { id: "recruitment", label: "📝 Postulaciones" }
];

const selection = new Map();

function getGuildConfig(config, guildId) {
    if (!config[guildId]) config[guildId] = {};
    return config[guildId];
}

function ensureDefaults(gc) {
    if (!gc.panel) gc.panel = { roles: [] };
    securitySystem.ensureSecurityConfig(gc);
    if (!gc.autoroles) gc.autoroles = { enabled: false, roles: [] };
    if (!gc.tts) gc.tts = { enabled: false, voiceChannel: null, textChannel: null };
    musicSystem.ensureMusicConfig(gc);
    if (!gc.sugerencias) gc.sugerencias = { enabled: false, channel: null, logChannel: null };
    if (!gc.sorteos) gc.sorteos = { enabled: false, channel: null };
    if (!gc.logs) gc.logs = {};
    if (!gc.tickets) gc.tickets = { enabled: true };
    gc.encuestas = encuestaSystem.ensureEncuestasSettings(gc.encuestas);
    aiSystem.ensureAIGC(gc);
    recruitmentSystem.ensureRecruitmentConfig(gc);
    aiControlSystem.ensureAIControlConfig(gc);
    return gc;
}

function hasPanelPermission(member, config, guildId) {
    if (!member) return false;
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    if (member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return true;
    const gc = getGuildConfig(config, guildId);
    const roles = gc.panel?.roles || [];
    return roles.some(rid => member.roles.cache.has(rid));
}

async function deny(interaction) {
    await interaction.reply({
        content: "❌ No tienes permiso para utilizar el centro de control.\nSolo administradores o roles autorizados.",
        flags: MessageFlags.Ephemeral
    }).catch((err) => {
        console.error(`[Panel:deny] ❌ reply FALLÓ user=${interaction.user?.tag}:`, err.message);
    });
}

function row(components) {
    return new ActionRowBuilder().addComponents(components);
}

function btn(customId, label, style, emoji) {
    const b = new ButtonBuilder()
        .setCustomId(customId)
        .setLabel(label)
        .setStyle(style);
    if (emoji) b.setEmoji(emoji);
    return b;
}

function sel(customId, placeholder, options) {
    return new StringSelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder(placeholder)
        .addOptions(options);
}

function resolveId(raw, guild) {
    const cleaned = String(raw || "").trim().replace(/[<@#&>]/g, "");
    if (!cleaned) return null;
    const byId = guild.channels.cache.get(cleaned);
    const byMention = guild.channels.cache.find(c => c.name === cleaned.toLowerCase());
    return (byId || byMention || {}).id || cleaned;
}

function resolveRoleId(raw, guild) {
    const cleaned = String(raw || "").trim().replace(/[<@&>]/g, "");
    if (!cleaned) return null;
    return guild.roles.cache.has(cleaned) ? cleaned : null;
}

function parseIdList(raw, guild, isRole) {
    const parts = String(raw || "").split(/[\s,]+/).map(p => p.trim()).filter(Boolean);
    const resolver = isRole ? resolveRoleId : resolveId;
    return parts.map(p => resolver(p, guild)).filter(Boolean);
}

function currentSelection(userId) {
    if (!selection.has(userId)) {
        selection.set(userId, { securityFeature: "antiSpam", logsCategory: "general", resetTarget: null });
    }
    return selection.get(userId);
}

function formatBool(value) {
    return value ? "🟢 Activado" : "🔴 Desactivado";
}

function channelMention(id) {
    return id ? `<#${id}>` : "No configurado";
}

function roleMention(id) {
    return id ? `<@&${id}>` : "No configurado";
}

function buildMainView(guild, config) {
    console.log(`[Panel:buildMainView] SECTIONS count=${SECTIONS.length} ids=${SECTIONS.map(s=>s.id).join(",")}`);
    const gc = ensureDefaults(getGuildConfig(config, guild.id));
    const embed = new EmbedBuilder()
        .setColor(PANEL_COLOR)
        .setTitle("🐉 DRAGONS | CENTRO DE CONTROL")
        .setDescription(
            "Bienvenido al centro de control de **DRAGONS**.\n" +
            "Desde aquí puedes administrar y configurar las funciones principales del bot."
        )
        .setFooter({
            text: `DRAGONS BOT v${BOT_VERSION} • ${guild.name}`,
            iconURL: guild.iconURL({ size: 128 })
        })
        .setTimestamp();

    const rows = [];
    for (let i = 0; i < SECTIONS.length; i += 5) {
        rows.push(row(
            SECTIONS.slice(i, i + 5).map(s =>
                btn(`panel_sec_${s.id}`, s.label, ButtonStyle.Secondary, s.emoji)
            )
        ));
    }
    rows.push(row(
        sel(
            "panel_sel_sec",
            "📂 Navegar rápidamente",
            SECTIONS.map(s => new StringSelectMenuOptionBuilder()
                .setLabel(s.label)
                .setDescription(s.desc)
                .setEmoji(s.emoji)
                .setValue(s.id))
        )
    ));

    return { embeds: [embed], components: rows };
}

function securityView(gc) {
    const s = gc.security || {};
    const st = securitySystem.getStatusLines(gc);
    const lockdown = Boolean(s.lockdown?.active);

    const embed = new EmbedBuilder()
        .setColor(lockdown ? "#ED4245" : PANEL_COLOR)
        .setTitle("🛡️ DRAGONS | SEGURIDAD")
        .setDescription(
            (s.enabled === false
                ? "🔴 **ESTADO: DESPROTEGIDO**"
                : "🟢 **ESTADO: PROTEGIDO**") +
            (lockdown
                ? `\n🚨 **LOCKDOWN ACTIVO**${s.lockdown.byName ? ` — por ${s.lockdown.byName}` : ""}${s.lockdown.until ? ` · hasta <t:${Math.floor(s.lockdown.until / 1000)}:R>` : ""}`
                : "") +
            "\n\nSistemas de protección:\n\n" +
            st.lines.map(l => `> ${l}`).join("\n")
        )
        .addFields(
            { name: "🔒 Cuarentena", value: Object.keys(s.quarantine || {}).length ? `**${Object.keys(s.quarantine).length}** usuarios` : "Sin usuarios", inline: true },
            { name: "🚨 Alertas", value: `**${(s.alerts || []).length}** registradas`, inline: true },
            { name: "📨 Bloqueos totales", value: `**${(s.stats?.blockedMessages || 0)}**`, inline: true },
            {
                name: "⚙️ Límites",
                value: [
                    `📨 Spam: **${s.spamLimit || 6}** msgs / ${Math.floor((s.spamWindowMs || 5000) / 1000)}s`,
                    `⚔️ Raid: **${s.raidThreshold || 5}** ingresos / ${Math.floor((s.raidWindowMs || 10000) / 1000)}s`,
                    `📣 Menciones: **${s.massMentionLimit || 8}** máx.`,
                    `🔗 Invitaciones: ${s.linkBlockInvites ? "bloqueadas" : "permitidas"}`
                ].join("\n"),
                inline: false
            }
        )
        .setFooter({ text: "DRAGONS | Centro de control" });

    const options = SECURITY_FEATURES.map(f => new StringSelectMenuOptionBuilder()
        .setLabel(f.label.replace(/^[^\s]+\s/, ""))
        .setDescription(f.desc)
        .setValue(f.id));

    const rows = [
        row(sel("panel_sel_security", "🎯 Seleccionar función", options)),
        row([
            btn("panel_cfg_seguridad", "Configurar", ButtonStyle.Primary, "⚙️"),
            btn("panel_toggle_seguridad_on", "Activar", ButtonStyle.Success, "✅"),
            btn("panel_toggle_seguridad_off", "Desactivar", ButtonStyle.Danger, "❌"),
            btn("panel_security_master", s.enabled === false ? "Reanudar" : "Pausar", s.enabled === false ? ButtonStyle.Success : ButtonStyle.Danger, s.enabled === false ? "▶️" : "⏸️")
        ]),
        row([
            btn("panel_security_lockdown", lockdown ? "Lockdown activo" : "Lockdown", lockdown ? ButtonStyle.Danger : ButtonStyle.Primary, "🚨"),
            btn("panel_security_alerts", "Ver alertas", ButtonStyle.Primary, "📋"),
            btn("panel_security_stats", "Dashboard", ButtonStyle.Primary, "📊"),
            btn("panel_security_quarantine", "Cuarentena", ButtonStyle.Primary, "🔒"),
            btn("panel_back", "Volver", ButtonStyle.Secondary, "⬅️")
        ])
    ];

    return { embeds: [embed], components: rows };
}

function lockdownView(gc) {
    const s = gc.security || {};
    const ld = s.lockdown || {};
    const active = Boolean(ld.active);

    const embed = new EmbedBuilder()
        .setColor(active ? "#ED4245" : PANEL_COLOR)
        .setTitle("🚨 LOCKDOWN")
        .setDescription(
            active
                ? `🚨 **LOCKDOWN ACTIVO**\n\n👤 **Por:** ${ld.byName || "Desconocido"}\n📝 **Motivo:** ${ld.reason || "—"}\n⏳ **Hasta:** ${ld.until ? `<t:${Math.floor(ld.until / 1000)}:F>` : "Manual"}\n\nDurante el lockdown los miembros no pueden enviar mensajes${s.lockdownDenyVoice ? " ni hablar en los canales de voz" : ""}. El estado anterior de los canales se restaurará al desactivarlo.`
                : "🔓 **Sin lockdown activo.**\n\nAl activarlo, los miembros no podrán enviar mensajes en el servidor. El estado anterior de los canales se guarda y se restaura al desactivarlo."
        )
        .setFooter({ text: "DRAGONS | SECURITY" });

    const rows = [
        row([
            active
                ? btn("panel_security_lockdown_off", "Desactivar lockdown", ButtonStyle.Success, "🟢")
                : btn("panel_security_lockdown_confirm", "Activar lockdown", ButtonStyle.Danger, "🚨"),
            btn("panel_back", "Volver", ButtonStyle.Secondary, "⬅️")
        ])
    ];

    return { embeds: [embed], components: rows };
}

function alertsView(gc) {
    const s = gc.security || {};
    const alerts = s.alerts || [];

    const list = alerts.slice(0, 10).map(a =>
        `• **${a.type || "general"}** — ${a.reason || "—"}\n  👤 ${a.userName || a.user || "—"} · ${a.channelName ? `#${a.channelName}` : "—"} · <t:${Math.floor((a.at || Date.now()) / 1000)}:R>`
    );

    const embed = new EmbedBuilder()
        .setColor(PANEL_COLOR)
        .setTitle("📋 ALERTAS DE SEGURIDAD")
        .setDescription(
            alerts.length === 0
                ? "Sin alertas registradas."
                : `**${alerts.length}** alerta(s) registradas (mostrando las últimas 10):\n\n${list.join("\n\n")}`
        )
        .setFooter({ text: "DRAGONS | SECURITY" });

    const rows = [
        row([
            btn("panel_security_alerts_clear", "Borrar alertas", ButtonStyle.Danger, "🗑️"),
            btn("panel_security_general", "Configuración general", ButtonStyle.Primary, "🌐"),
            btn("panel_back", "Volver", ButtonStyle.Secondary, "⬅️")
        ])
    ];

    return { embeds: [embed], components: rows };
}

function statsView(gc, filterDays) {
    const s = gc.security || {};
    const st = s.stats || {};
    const incidents = Array.isArray(s.incidents) ? s.incidents : [];
    const suspicious = Object.values(s.suspiciousUsers || {});
    const days = filterDays || 0;
    const periodStats = days > 0 ? securitySystem.getDailyStatsForPeriod(gc, days) : st;
    const dayLabel = days === 1 ? "Hoy" : days === 7 ? "7 días" : days === 30 ? "30 días" : "Total";

    const todayCount = securitySystem.getIncidentsToday(gc).length;
    const weekCount = securitySystem.getIncidentsWeek(gc).length;
    const sevCounts = securitySystem.getIncidentSeverityCounts(gc);

    const bar = (val, max) => {
        if (max === 0) return "░░░░░░░░░░";
        const filled = Math.round((val / max) * 10);
        return "█".repeat(Math.max(0, Math.min(10, filled))) + "░".repeat(Math.max(0, 10 - Math.min(10, filled)));
    };

    const maxVal = Math.max(periodStats.raids || 0, periodStats.blockedMessages || 0, periodStats.blockedLinks || 0, periodStats.blockedMentions || 0, periodStats.botsDetected || 0, periodStats.quarantined || 0, periodStats.alerts || 0, periodStats.autoSanctions || 0, 1);

    const embed = new EmbedBuilder()
        .setColor("#ED4245")
        .setTitle("📊 SECURITY DASHBOARD")
        .setDescription(`📊 Datos de **${dayLabel}** · 🟢 Activo\n\n🎯 **Resumen rápido**`)
        .addFields(
            { name: "📋 Incidentes", value: `**${incidents.length}** total`, inline: true },
            { name: "📅 Hoy", value: `**${todayCount}**`, inline: true },
            { name: "📆 Semana", value: `**${weekCount}**`, inline: true },
            { name: "🟢 Bajo", value: `**${sevCounts.low}**`, inline: true },
            { name: "🟡 Medio", value: `**${sevCounts.medium}**`, inline: true },
            { name: "🔴 Alto", value: `**${sevCounts.high}**`, inline: true },
            { name: "🚨 Crítico", value: `**${sevCounts.critical}**`, inline: true },
            { name: "👤 Sospechosos", value: `**${suspicious.length}**`, inline: true },
            { name: " ", value: " ", inline: false },
            { name: "🚨 Raids", value: `${bar(periodStats.raids || 0, maxVal)} **${periodStats.raids || 0}**`, inline: false },
            { name: "📨 Mensajes", value: `${bar(periodStats.blockedMessages || 0, maxVal)} **${periodStats.blockedMessages || 0}**`, inline: false },
            { name: "🔗 Enlaces", value: `${bar(periodStats.blockedLinks || 0, maxVal)} **${periodStats.blockedLinks || 0}**`, inline: false },
            { name: "📣 Menciones", value: `${bar(periodStats.blockedMentions || 0, maxVal)} **${periodStats.blockedMentions || 0}**`, inline: false },
            { name: "🤖 Bots", value: `${bar(periodStats.botsDetected || 0, maxVal)} **${periodStats.botsDetected || 0}**`, inline: false },
            { name: "🔒 Cuarentenas", value: `${bar(periodStats.quarantined || 0, maxVal)} **${periodStats.quarantined || 0}**`, inline: false },
            { name: "⚡ Sanciones", value: `${bar(periodStats.autoSanctions || 0, maxVal)} **${periodStats.autoSanctions || 0}**`, inline: false }
        )
        .setFooter({ text: `DRAGONS | SECURITY · ${incidents.length} incidentes · ${suspicious.length} sospechosos` });

    const rows = [
        row([
            btn("panel_security_incidents", "📋 Incidentes", ButtonStyle.Primary, "📋"),
            btn("panel_security_suspicious", "👤 Sospechosos", ButtonStyle.Primary, "👤"),
            btn("panel_security_stats_detail", "📈 Detalle", ButtonStyle.Primary, "📈")
        ]),
        row([
            btn("panel_security_timefilter_1", "Hoy", days === 1 ? ButtonStyle.Success : ButtonStyle.Secondary, "📅"),
            btn("panel_security_timefilter_7", "7d", days === 7 ? ButtonStyle.Success : ButtonStyle.Secondary, "📅"),
            btn("panel_security_timefilter_30", "30d", days === 30 ? ButtonStyle.Success : ButtonStyle.Secondary, "📅"),
            btn("panel_security_timefilter_0", "Total", days === 0 ? ButtonStyle.Success : ButtonStyle.Secondary, "📅"),
            btn("panel_security_stats_refresh", "🔄", ButtonStyle.Primary, "🔄")
        ]),
        row([
            btn("panel_back", "Volver", ButtonStyle.Secondary, "⬅️")
        ])
    ];

    return { embeds: [embed], components: rows };
}

function incidentsView(gc, page, filterType) {
    const s = gc.security || {};
    let incidents = Array.isArray(s.incidents) ? s.incidents : [];
    if (filterType) incidents = incidents.filter(i => i.type === filterType);
    const perPage = 8;
    const totalPages = Math.max(1, Math.ceil(incidents.length / perPage));
    const safePage = Math.max(0, Math.min(page || 0, totalPages - 1));
    const pageItems = incidents.slice(safePage * perPage, (safePage + 1) * perPage);

    const sevEmoji = { low: "🟢", medium: "🟡", high: "🔴", critical: "🚨" };
    const typeEmoji = { spam: "💬", link: "🔗", mention: "📣", raid: "🚨", bot: "🤖", roleProtection: "🔐", quarantine: "🔒", lockdown: "🚨", lockdown_off: "🟢", alt: "👤", general: "⚠️" };

    const list = pageItems.map(i =>
        `${sevEmoji[i.severity] || "⚪"} **#${i.id}** ${typeEmoji[i.type] || "⚠️"} **${i.type}** — ${(i.detail || "—").slice(0, 60)}\n└ <t:${Math.floor((i.timestamp || 0) / 1000)}:R> · \`${i.status}\` · ${(i.users || []).map(u => u.tag || u.id).join(", ") || "—"}`
    );

    const embed = new EmbedBuilder()
        .setColor("#ED4245")
        .setTitle("📋 HISTORIAL DE INCIDENTES")
        .setDescription(
            incidents.length === 0
                ? "📋 Sin incidentes registrados."
                : `**${incidents.length}** incidente(s)${filterType ? ` [${filterType}]` : ""}\nMostrando página **${safePage + 1}/${totalPages}**\n\n${list.join("\n\n")}`
        )
        .setFooter({ text: `DRAGONS | SECURITY · Página ${safePage + 1}/${totalPages}` });

    const rows = [
        row([
            btn("panel_security_incidents_page_prev_" + (safePage - 1) + (filterType ? "_" + filterType : ""), "⬅️", safePage > 0 ? ButtonStyle.Primary : ButtonStyle.Secondary, "⬅️"),
            btn("panel_security_incidents_page_next_" + (safePage + 1) + (filterType ? "_" + filterType : ""), "➡️", safePage < totalPages - 1 ? ButtonStyle.Primary : ButtonStyle.Secondary, "➡️")
        ]),
        row([
            btn("panel_security_incidents_filter_spam", "💬 Spam", filterType === "spam" ? ButtonStyle.Success : ButtonStyle.Secondary, "💬"),
            btn("panel_security_incidents_filter_link", "🔗 Links", filterType === "link" ? ButtonStyle.Success : ButtonStyle.Secondary, "🔗"),
            btn("panel_security_incidents_filter_raid", "🚨 Raid", filterType === "raid" ? ButtonStyle.Success : ButtonStyle.Secondary, "🚨"),
            btn("panel_security_incidents_clear_filter", "❌ Limpiar", ButtonStyle.Secondary, "❌")
        ]),
        row([
            btn("panel_security_stats", "📊 Dashboard", ButtonStyle.Primary, "📊"),
            btn("panel_back", "Volver", ButtonStyle.Secondary, "⬅️")
        ])
    ];

    return { embeds: [embed], components: rows };
}

function incidentDetailView(gc, incidentId) {
    const incident = securitySystem.getIncidentById(gc, incidentId);
    if (!incident) {
        const embed = new EmbedBuilder()
            .setColor("#ED4245")
            .setTitle("❌ INCIDENTE NO ENCONTRADO")
            .setDescription(`No se encontró el incidente **#${incidentId}**.`)
            .setFooter({ text: "DRAGONS | SECURITY" });
        return { embeds: [embed], components: [row([btn("panel_security_incidents", "📋 Volver", ButtonStyle.Secondary, "⬅️")])] };
    }

    const sevEmoji = { low: "🟢", medium: "🟡", high: "🔴", critical: "🚨" };
    const statusEmoji = { active: "🔴", critical: "🚨", reviewing: "🟡", resolved: "🟢", closed: "⚪" };

    const embed = new EmbedBuilder()
        .setColor(incident.severity === "critical" ? "#ED4245" : incident.severity === "high" ? "#FEE75C" : "#57F287")
        .setTitle(`${sevEmoji[incident.severity] || "⚪"} INCIDENTE #${incident.id}`)
        .addFields(
            { name: "📋 Tipo", value: incident.type || "—", inline: true },
            { name: "⚡ Severidad", value: incident.severity || "—", inline: true },
            { name: "📊 Estado", value: `${statusEmoji[incident.status] || "⚪"} ${incident.status || "—"}`, inline: true },
            { name: "📅 Fecha", value: `<t:${Math.floor((incident.timestamp || 0) / 1000)}:F>`, inline: true },
            { name: "🤖 Sistema", value: incident.system || "—", inline: true },
            { name: "🎯 Regla", value: incident.rule || "—", inline: true },
            { name: "👤 Usuarios", value: (incident.users || []).map(u => `\`${u.id}\` ${u.tag || "—"}`).join("\n") || "—", inline: false },
            { name: "📝 Detalle", value: (incident.detail || "—").slice(0, 1024), inline: false }
        )
        .setFooter({ text: `DRAGONS | SECURITY · Incidente #${incident.id}` });

    if (incident.channel) embed.addFields({ name: "📍 Canal", value: `<#${incident.channel.id}> (${incident.channel.name || "—"})`, inline: true });
    if (incident.role) embed.addFields({ name: "🎭 Rol", value: `<@&${incident.role.id}> (${incident.role.name || "—"})`, inline: true });
    if (incident.staff) embed.addFields({ name: "🛡️ Staff", value: `${incident.staff.tag || "—"}`, inline: true });
    if (incident.action) embed.addFields({ name: "⚡ Acción", value: incident.action, inline: true });
    if (incident.resolvedAt) embed.addFields({ name: "✅ Resuelto", value: `<t:${Math.floor(incident.resolvedAt / 1000)}:F> por ${incident.resolvedBy || "—"}`, inline: false });

    const rows = [
        row([
            ...(incident.status !== "resolved" ? [btn("panel_security_incident_resolve_" + incident.id, "✅ Resolver", ButtonStyle.Success, "✅")] : []),
            ...(incident.status !== "closed" ? [btn("panel_security_incident_close_" + incident.id, "Cerrar", ButtonStyle.Secondary, "⚪")] : []),
            btn("panel_security_incidents", "📋 Lista", ButtonStyle.Primary, "📋"),
            btn("panel_security_stats", "📊 Dashboard", ButtonStyle.Primary, "📊")
        ])
    ];

    return { embeds: [embed], components: rows };
}

function suspiciousUsersView(gc) {
    const s = gc.security || {};
    const suspicious = Object.values(s.suspiciousUsers || {});
    const riskEmoji = { low: "🟢", medium: "🟡", high: "🔴" };

    const embed = new EmbedBuilder()
        .setColor("#FEE75C")
        .setTitle("👤 SOSPECHOSOS")
        .setDescription(
            suspicious.length === 0
                ? "👤 Sin usuarios sospechosos registrados."
                : `**${suspicious.length}** usuario(s) sospechosos:\n\n${suspicious.slice(0, 15).map(u =>
                    `${riskEmoji[u.risk] || "⚪"} **${u.userTag || u.userId}** (\`${u.userId}\`)\n└ Riesgo: **${u.risk}** · Incidentes: **${u.incidentCount || 0}** · Razones: ${(u.reasons || []).join(", ")}`
                ).join("\n\n")}`
        )
        .setFooter({ text: "DRAGONS | SECURITY" });

    const rows = [
        row([
            btn("panel_security_stats", "📊 Dashboard", ButtonStyle.Primary, "📊"),
            btn("panel_back", "Volver", ButtonStyle.Secondary, "⬅️")
        ])
    ];

    return { embeds: [embed], components: rows };
}

function perSystemStatsView(gc, days) {
    const s = gc.security || {};
    const systemStats = securitySystem.getSystemStats(gc);
    const periodStats = days > 0 ? securitySystem.getDailyStatsForPeriod(gc, days) : (s.stats || {});
    const dayLabel = days === 1 ? "Hoy" : days === 7 ? "7 días" : days === 30 ? "30 días" : "Total";

    const typeEmoji = { spam: "💬", link: "🔗", mention: "📣", raid: "🚨", bot: "🤖", roleProtection: "🔐", quarantine: "🔒", lockdown: "🚨", lockdown_off: "🟢", alt: "👤", general: "⚠️" };
    const typeLabels = { spam: "Spam", link: "Links", mention: "Menciones", raid: "Raid", bot: "Bot", roleProtection: "Roles", quarantine: "Cuarentena", lockdown: "Lockdown", lockdown_off: "Lockdown Off", alt: "Alt Account", general: "General" };

    const totalIncidents = systemStats.total || 1;
    const bar = (val, max) => {
        if (max === 0) return "░░░░░░░░░░";
        const filled = Math.round((val / max) * 10);
        return "█".repeat(Math.max(0, Math.min(10, filled))) + "░".repeat(Math.max(0, 10 - Math.min(10, filled)));
    };

    const typeFields = Object.entries(systemStats.byType || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([type, count]) => ({
            name: `${typeEmoji[type] || "⚠️"} ${typeLabels[type] || type}`,
            value: `${bar(count, totalIncidents)} **${count}** (${Math.round((count / totalIncidents) * 100)}%)`,
            inline: false
        }));

    const embed = new EmbedBuilder()
        .setColor("#8A2BE2")
        .setTitle("📈 DETALLE POR SISTEMA")
        .setDescription(`📊 Período: **${dayLabel}** · Total incidentes: **${systemStats.total}**\n\nHoy: **${systemStats.today}** · Semana: **${systemStats.week}** · Mes: **${systemStats.month}**`)
        .addFields(typeFields.length > 0 ? typeFields : [{ name: "Sin datos", value: "No hay incidentes registrados.", inline: false }])
        .setFooter({ text: "DRAGONS | SECURITY" });

    const rows = [
        row([
            btn("panel_security_stats_detail_filter_1", "Hoy", days === 1 ? ButtonStyle.Success : ButtonStyle.Secondary, "📅"),
            btn("panel_security_stats_detail_filter_7", "7d", days === 7 ? ButtonStyle.Success : ButtonStyle.Secondary, "📅"),
            btn("panel_security_stats_detail_filter_30", "30d", days === 30 ? ButtonStyle.Success : ButtonStyle.Secondary, "📅"),
            btn("panel_security_stats_detail_filter_0", "Total", days === 0 ? ButtonStyle.Success : ButtonStyle.Secondary, "📅")
        ]),
        row([
            btn("panel_security_stats", "📊 Dashboard", ButtonStyle.Primary, "📊"),
            btn("panel_back", "Volver", ButtonStyle.Secondary, "⬅️")
        ])
    ];

    return { embeds: [embed], components: rows };
}

function quarantineView(gc) {
    const s = gc.security || {};
    const entries = Object.entries(s.quarantine || {});

    const embed = new EmbedBuilder()
        .setColor(PANEL_COLOR)
        .setTitle("🔒 CUARENTENA")
        .setDescription(
            entries.length === 0
                ? "Sin usuarios en cuarentena."
                : `**${entries.length}** usuario(s) en cuarentena:\n\n${entries.slice(0, 10).map(([uid, q]) =>
                    `• **${q.userName || uid}** — ${q.reason || "—"}${q.until ? ` · hasta <t:${Math.floor(q.until / 1000)}:R>` : ""}`
                ).join("\n")}`
        )
        .addFields(
            { name: "🎭 Rol de cuarentena", value: roleMention(s.quarantineRole), inline: true },
            { name: "⏳ Duración", value: s.quarantineDurationMs ? `**${Math.floor(s.quarantineDurationMs / 3600000)}h**` : "Manual", inline: true }
        )
        .setFooter({ text: "DRAGONS | SECURITY" });

    const rows = [
        row([
            btn("panel_security_quarantine_cfg", "Configurar", ButtonStyle.Primary, "⚙️"),
            btn("panel_security_quarantine_releaseall", "Liberar todas", ButtonStyle.Danger, "🔓"),
            btn("panel_back", "Volver", ButtonStyle.Secondary, "⬅️")
        ])
    ];

    return { embeds: [embed], components: rows };
}

function ticketsView(gc) {
    const t = gc.tickets || {};
    const embed = new EmbedBuilder()
        .setColor(PANEL_COLOR)
        .setTitle("🎫 TICKETS")
        .setDescription("Configuración del sistema de soporte.\n\nPara reenviar el panel del ticket usa el comando `/setticket`.")
        .addFields(
            { name: "🟢 Estado", value: formatBool(t.enabled !== false), inline: true },
            { name: "📌 Canal del panel", value: channelMention(gc.ticketChannel), inline: true },
            { name: "📁 Categoría", value: channelMention(gc.ticketCategory), inline: true },
            { name: "🛡️ Rol de soporte", value: roleMention(gc.staffRole), inline: true },
            { name: "📄 Logs / Transcripts", value: channelMention(gc.transcriptChannel), inline: true },
            { name: "💬 Mensaje del panel", value: t.panelMessage ? t.panelMessage.slice(0, 100) : "Por defecto", inline: false }
        )
        .setFooter({ text: "DRAGONS | Centro de control" });

    const rows = [
        row([
            btn("panel_cfg_tickets", "Configurar", ButtonStyle.Primary, "⚙️"),
            btn("panel_toggle_tickets_on", "Activar", ButtonStyle.Success, "✅"),
            btn("panel_toggle_tickets_off", "Desactivar", ButtonStyle.Danger, "❌"),
            btn("panel_back", "Volver", ButtonStyle.Secondary, "⬅️")
        ])
    ];

    return { embeds: [embed], components: rows };
}

function welcomeView(gc) {
    const w = gc.welcome || {};
    const embed = new EmbedBuilder()
        .setColor(w.color || "#A52BE2")
        .setTitle("👋 BIENVENIDAS")
        .setDescription("Personalización del mensaje de bienvenida del servidor.")
        .addFields(
            { name: "🟢 Estado", value: formatBool(w.enabled !== false), inline: true },
            { name: "📌 Canal", value: channelMention(w.channel), inline: true },
            { name: "🎨 Color", value: w.color || "#A52BE2 (por defecto)", inline: true },
            { name: "🖼️ Imagen", value: w.image ? "Configurada" : "Sin imagen", inline: true },
            { name: "📝 Mensaje", value: (w.message || "Por defecto").slice(0, 1024), inline: false },
            { name: "📌 Footer", value: (w.footer || "Por defecto").slice(0, 200), inline: false }
        )
        .setFooter({ text: "DRAGONS | Centro de control" });

    const rows = [
        row([
            btn("panel_cfg_bienvenidas", "Configurar", ButtonStyle.Primary, "⚙️"),
            btn("panel_toggle_bienvenidas_on", "Activar", ButtonStyle.Success, "✅"),
            btn("panel_toggle_bienvenidas_off", "Desactivar", ButtonStyle.Danger, "❌"),
            btn("panel_back", "Volver", ButtonStyle.Secondary, "⬅️")
        ])
    ];

    return { embeds: [embed], components: rows };
}

function logsView(gc, logsCategory) {
    const logs = gc.logs || {};
    const cats = logSystem.CATEGORIES;
    const catIds = Object.keys(cats);

    const lines = catIds.map(cat => {
        const enabled = logs.enabled?.[cat] !== false;
        const ch = logs.categories?.[cat] || logs.main || gc.logChannel;
        return `${enabled ? "🟢" : "🔴"} **${catLabel(cat)}** → ${ch ? `<#${ch}>` : "—"}`;
    });

    const selectedCat = logsCategory === "general" ? null : logsCategory;
    const selectedChannel = selectedCat
        ? (logs.categories?.[selectedCat] || logs.main || gc.logChannel)
        : (logs.main || gc.logChannel);

    const embed = new EmbedBuilder()
        .setColor(PANEL_COLOR)
        .setTitle("📋 LOGS")
        .setDescription("Canales donde el bot registra la actividad del servidor.")
        .addFields(
            { name: "📌 Canal principal", value: channelMention(logs.main || gc.logChannel), inline: true },
            {
                name: "🗂️ Categorías",
                value: "• Mensajes\n• Miembros\n• Moderación\n• Canales\n• Tickets\n• Servidor\n\n" + lines.join("\n"),
                inline: false
            }
        )
        .setFooter({ text: "DRAGONS | Centro de control" });

    const options = [
        new StringSelectMenuOptionBuilder()
            .setLabel("General (canal principal)")
            .setDescription("Aplica a todos los logs por defecto")
            .setValue("general"),
        ...catIds.map(cat => new StringSelectMenuOptionBuilder()
            .setLabel(catLabel(cat))
            .setValue(cat))
    ];

    const cfgLabel = selectedCat
        ? `Configurar: ${catLabel(selectedCat)}`
        : "Configurar canal principal";

    const rows = [
        row(sel("panel_sel_logs", "🗂️ Seleccionar categoría", options)),
        row([
            btn("panel_cfg_logs", cfgLabel, ButtonStyle.Primary, "⚙️"),
            btn("panel_toggle_logs_on", "Activar", ButtonStyle.Success, "✅"),
            btn("panel_toggle_logs_off", "Desactivar", ButtonStyle.Danger, "❌"),
            btn("panel_back", "Volver", ButtonStyle.Secondary, "⬅️")
        ])
    ];

    return { embeds: [embed], components: rows };
}

function catLabel(cat) {
    return {
        mensajes: "Mensajes",
        miembros: "Miembros",
        moderacion: "Moderación",
        canales: "Canales",
        tickets: "Tickets",
        servidor: "Servidor"
    }[cat] || cat;
}

function autorolesView(gc) {
    const ar = gc.autoroles || {};
    const roles = (ar.roles || []).map(rid => `<@&${rid}>`).join(", ") || "Ninguno";

    const embed = new EmbedBuilder()
        .setColor(PANEL_COLOR)
        .setTitle("🎭 AUTO-ROLES")
        .setDescription("Roles asignados automáticamente cuando un miembro entra al servidor.")
        .addFields(
            { name: "🟢 Estado", value: formatBool(ar.enabled === true), inline: true },
            { name: "🎭 Roles automáticos", value: roles, inline: false }
        )
        .setFooter({ text: "DRAGONS | Centro de control" });

    const rows = [
        row([
            btn("panel_cfg_autoroles", "Configurar", ButtonStyle.Primary, "⚙️"),
            btn("panel_toggle_autoroles_on", "Activar", ButtonStyle.Success, "✅"),
            btn("panel_toggle_autoroles_off", "Desactivar", ButtonStyle.Danger, "❌"),
            btn("panel_back", "Volver", ButtonStyle.Secondary, "⬅️")
        ])
    ];

    return { embeds: [embed], components: rows };
}

function systemView(gc, sectionId, title, lines) {
    const target = gc[sectionId] || {};
    const enabled = target.enabled === true;

    const embed = new EmbedBuilder()
        .setColor(PANEL_COLOR)
        .setTitle(title)
        .setDescription(
            lines.join("\n") +
            (enabled
                ? "\n\n> 🟢 Sistema activo. Usa `/" + ({ tts: "tts", sugerencias: "sugerir", sorteos: "sorteo" }[sectionId] || "panel") + "` para utilizarlo."
                : "\n\n> 🔴 Sistema desactivado. Pulsa **Activar** para habilitarlo.")
        )
        .setFooter({ text: "DRAGONS | Centro de control" });

    const rows = [
        row([
            btn(`panel_cfg_${sectionId}`, "Configurar", ButtonStyle.Primary, "⚙️"),
            btn(`panel_toggle_${sectionId}_on`, "Activar", ButtonStyle.Success, "✅"),
            btn(`panel_toggle_${sectionId}_off`, "Desactivar", ButtonStyle.Danger, "❌"),
            btn("panel_back", "Volver", ButtonStyle.Secondary, "⬅️")
        ])
    ];

    return { embeds: [embed], components: rows };
}

function encuestasView(gc, guild) {
    const ec = encuestaSystem.ensureEncuestasSettings(gc.encuestas || {});
    const s = ec.settings;
    const active = ec.active;

    const embed = new EmbedBuilder()
        .setColor(PANEL_COLOR)
        .setTitle("🗳️ ENCUESTAS")
        .setDescription("Crea encuestas con votación en vivo y resultados automáticos.\nEl comando `/encuesta` y este panel usan la **misma configuración**.")
        .addFields(
            { name: "🟢 Estado", value: formatBool(s.enabled), inline: true },
            { name: "📢 Canal de publicación", value: channelMention(s.channel), inline: true },
            { name: "⏱️ Duración predeterminada", value: s.defaultDuration || "1h", inline: true },
            { name: "🔘 Tipo de votación", value: s.pollType === "multiple" ? "🔁 Múltiple" : "⚪ Única", inline: true },
            { name: "📊 Resultados en tiempo real", value: formatBool(s.liveResults), inline: true },
            { name: "🔄 Permitir cambiar el voto", value: formatBool(s.allowChange), inline: true },
            { name: "👥 Límite de participantes", value: s.maxParticipants ? `**${s.maxParticipants}**` : "Sin límite", inline: true },
            { name: "🗑️ Eliminar anterior al crear", value: formatBool(s.autoDeletePrev), inline: true },
            {
                name: "📌 Encuesta activa",
                value: active
                    ? `✅ **${active.question}**\n${channelMention(active.channelId)} · <t:${Math.floor(active.endsAt / 1000)}:R>`
                    : "❌ Sin encuesta activa",
                inline: false
            }
        )
        .setFooter({ text: "DRAGONS | Centro de control" });

    const rows = [
        row([
            btn("panel_cfg_encuestas", "Configurar", ButtonStyle.Primary, "⚙️"),
            btn("panel_toggle_encuestas_on", "Activar", ButtonStyle.Success, "✅"),
            btn("panel_toggle_encuestas_off", "Desactivar", ButtonStyle.Danger, "❌"),
            btn("panel_back", "Volver", ButtonStyle.Secondary, "⬅️")
        ]),
        row([
            btn("panel_enc_crear", "Crear encuesta", ButtonStyle.Success, "➕"),
            btn("panel_enc_ver", "Ver activa", ButtonStyle.Primary, "📊"),
            btn("panel_enc_finalizar", "Finalizar", ButtonStyle.Danger, "⏹️"),
            btn("panel_enc_cancelar", "Cancelar", ButtonStyle.Danger, "🗑️"),
            btn("panel_enc_reiniciar", "Reiniciar", ButtonStyle.Primary, "🔄")
        ]),
        row(sel("panel_sel_enc_tipo", "🔘 Tipo de votación", [
            new StringSelectMenuOptionBuilder()
                .setLabel("⚪ Única (un voto por usuario)")
                .setDescription("Cada usuario elige una sola opción")
                .setValue("unica"),
            new StringSelectMenuOptionBuilder()
                .setLabel("🔁 Múltiple (varios votos por usuario)")
                .setDescription("Cada usuario puede elegir varias opciones")
                .setValue("multiple")
        ])),
        row([
            btn("panel_enc_live", `Tiempo real: ${formatBool(s.liveResults).split(" ")[0]}`, ButtonStyle.Secondary, "📊"),
            btn("panel_enc_change", `Cambiar voto: ${formatBool(s.allowChange).split(" ")[0]}`, ButtonStyle.Secondary, "🔄"),
            btn("panel_enc_delprev", `Borrar anterior: ${formatBool(s.autoDeletePrev).split(" ")[0]}`, ButtonStyle.Secondary, "🗑️")
        ])
    ];

    return { embeds: [embed], components: rows };
}

function estadisticasView(guild) {    const members = guild.memberCount;
    const bots = guild.members.cache.filter(m => m.user.bot).size || 0;
    const humans = members - bots;
    const withPresence = guild.members.cache.filter(m => m.presence).size || 0;
    const online = withPresence
        ? guild.members.cache.filter(m => m.presence && m.presence.status !== "offline").size
        : null;

    const embed = new EmbedBuilder()
        .setColor(PANEL_COLOR)
        .setTitle("📊 ESTADÍSTICAS")
        .setDescription(`Información general de **${guild.name}**.`)
        .addFields(
            { name: "👥 Miembros", value: `${members}`, inline: true },
            { name: "🤖 Bots", value: `${bots}`, inline: true },
            { name: "🧑 Usuarios", value: `${humans}`, inline: true },
            { name: "🟢 En línea", value: online !== null ? `${online}` : "N/D", inline: true },
            { name: "💬 Canales", value: `${guild.channels.cache.size}`, inline: true },
            { name: "🎭 Roles", value: `${guild.roles.cache.size}`, inline: true },
            { name: "📅 Creado", value: guild.createdAt.toLocaleDateString("es-ES", {
                day: "numeric", month: "long", year: "numeric"
            }), inline: true },
            { name: "🐉 Servidor", value: guild.name, inline: true }
        )
        .setThumbnail(guild.iconURL({ size: 256 }))
        .setFooter({ text: "DRAGONS | Centro de control" })
        .setTimestamp();

    const rows = [
        row([
            btn("panel_estadisticas_refresh", "Actualizar", ButtonStyle.Primary, "🔄"),
            btn("panel_back", "Volver", ButtonStyle.Secondary, "⬅️")
        ])
    ];

    return { embeds: [embed], components: rows };
}

function configuracionView(gc) {
    const w = gc.welcome || {};
    const logs = gc.logs || {};
    const t = gc.tickets || {};
    const s = gc.security || {};
    const ar = gc.autoroles || {};

    const embed = new EmbedBuilder()
        .setColor(PANEL_COLOR)
        .setTitle("⚙️ CONFIGURACIÓN")
        .setDescription("Estado general del bot y de sus sistemas.")
        .addFields(
            { name: "🐉 Versión del bot", value: `v${BOT_VERSION}`, inline: true },
            { name: "👋 Bienvenida", value: formatBool(w.enabled !== false), inline: true },
            { name: "🎫 Tickets", value: formatBool(t.enabled !== false), inline: true },
            { name: "📋 Logs", value: logs.main ? "🟢 Configurado" : "🔴 Sin canal principal", inline: true },
            { name: "🛡️ Seguridad", value: formatBool(s.enabled !== false), inline: true },
            { name: "🎭 Auto-Roles", value: formatBool(ar.enabled === true), inline: true },
            { name: "🗳️ Encuestas", value: formatBool((gc.encuestas?.settings?.enabled) === true), inline: true }
        )
        .setFooter({ text: "DRAGONS | Centro de control" });

    const rows = [
        row([
            btn("panel_btn_roles_auth", "Roles autorizados", ButtonStyle.Primary, "🔐"),
            btn("panel_sel_reset_open", "Restablecer función", ButtonStyle.Danger, "♻️"),
            btn("panel_back", "Volver", ButtonStyle.Secondary, "⬅️")
        ])
    ];

    return { embeds: [embed], components: rows };
}

function resetView(gc, config, guild, selectedTarget) {
    const targetLabel = selectedTarget
        ? RESET_TARGETS.find(t => t.id === selectedTarget)?.label
        : null;

    const embed = new EmbedBuilder()
        .setColor("#ED4245")
        .setTitle("♻️ RESTABLECER FUNCIÓN")
        .setDescription(
            targetLabel
                ? `🗂️ Seleccionada: **${targetLabel}**\nPulsa **Restablecer selección** para confirmar.`
                : "Selecciona la función cuya configuración quieres restablecer a sus valores por defecto."
        )
        .setFooter({ text: "DRAGONS | Centro de control" });

    const rows = [
        row(sel(
            "panel_sel_reset",
            "🗂️ Seleccionar función",
            RESET_TARGETS.map(t => new StringSelectMenuOptionBuilder()
                .setLabel(t.label)
                .setValue(t.id))
        )),
        row([
            btn("panel_btn_reset_confirm", "Restablecer selección", ButtonStyle.Danger, "♻️"),
            btn("panel_back", "Volver", ButtonStyle.Secondary, "⬅️")
        ])
    ];

    return { embeds: [embed], components: rows };
}

async function showView(interaction, view) {
    try {
        const cid = interaction.customId || interaction.commandName || "?";
        if (interaction.isCommand()) {
            console.log(`[Panel:showView] → reply (command) customId=${cid}`);
            await interaction.reply({ ...view, flags: MessageFlags.Ephemeral }).catch(async (err) => {
                console.error(`[Panel:showView] ❌ reply FALLÓ customId=${cid}:`, err.message);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: "❌ Error al mostrar el panel.", flags: MessageFlags.Ephemeral }).catch((e2) => {
                        console.error(`[Panel:showView] ❌❌ fallback reply TAMBIÉN FALLÓ customId=${cid}:`, e2.message);
                    });
                }
            });
        } else if (interaction.deferred) {
            console.log(`[Panel:showView] → editReply (deferred) customId=${cid}`);
            await interaction.editReply(view).catch(async (err) => {
                console.error(`[Panel:showView] ❌ editReply FALLÓ customId=${cid}:`, err.message);
                try { await interaction.followUp({ ...view, flags: MessageFlags.Ephemeral }).catch((e2) => {
                    console.error(`[Panel:showView] ❌❌ followUp TAMBIÉN FALLÓ customId=${cid}:`, e2.message);
                }); } catch {}
            });
        } else if (interaction.replied) {
            console.log(`[Panel:showView] → followUp (replied) customId=${cid}`);
            await interaction.followUp({ ...view, flags: MessageFlags.Ephemeral }).catch((err) => {
                console.error(`[Panel:showView] ❌ followUp FALLÓ customId=${cid}:`, err.message);
            });
        } else {
            console.log(`[Panel:showView] → update (button/select) customId=${cid}`);
            await interaction.update(view).catch(async (err) => {
                console.error(`[Panel:showView] ❌ update FALLÓ customId=${cid}:`, err.message);
                try {
                    await interaction.reply({ ...view, flags: MessageFlags.Ephemeral }).catch((e2) => {
                        console.error(`[Panel:showView] ❌❌ fallback reply FALLÓ customId=${cid}:`, e2.message);
                    });
                } catch {
                    try {
                        await interaction.followUp({ ...view, flags: MessageFlags.Ephemeral }).catch((e2) => {
                            console.error(`[Panel:showView] ❌❌❌ fallback followUp FALLÓ customId=${cid}:`, e2.message);
                        });
                    } catch {}
                }
            });
        }
        console.log(`[Panel:showView] ✅ OK customId=${cid} state=r${interaction.replied?1:0}/d${interaction.deferred?1:0}`);
    } catch (error) {
        console.error("[Panel] Error en showView:", error.message, error.stack || "");
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: "❌ Error al mostrar el panel.", flags: MessageFlags.Ephemeral }).catch((e2) => {
                    console.error("[Panel:showView] ❌❌ último fallback reply falló:", e2.message);
                });
            }
        } catch {}
    }
}

function modal(customId, title, inputs) {
    const m = new ModalBuilder().setCustomId(customId).setTitle(title);
    inputs.forEach(field => m.addComponents(row(field)));
    return m;
}

function input(customId, label, value, required = true, style = TextInputStyle.Short) {
    return new TextInputBuilder()
        .setCustomId(customId)
        .setLabel(label)
        .setStyle(style)
        .setRequired(required)
        .setValue(String(value ?? ""));
}

function securityModal(gc) {
    const s = gc.security || {};
    return modal(
        "panel_modal_seguridad",
        "🛡️ Límites de seguridad",
        [
            input("spamLimit", "Límite de mensajes spam", s.spamLimit || 6),
            input("spamWindowMs", "Ventana de spam (segundos)", (s.spamWindowMs || 5000) / 1000),
            input("raidThreshold", "Umbral de raid (ingresos)", s.raidThreshold || 5),
            input("raidWindowMs", "Ventana de raid (segundos)", (s.raidWindowMs || 10000) / 1000),
            input("massMentionLimit", "Límite de menciones (mass mention)", s.massMentionLimit || 8)
        ]
    );
}

function splitList(raw) {
    return String(raw || "").split(/[\s,]+/).map(x => x.trim()).filter(Boolean);
}

function splitDomains(raw) {
    return splitList(raw).map(d => d.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, ""));
}

function normalizeAction(raw, valid) {
    const a = String(raw || "").trim().toLowerCase();
    return valid.includes(a) ? a : null;
}

function parseYesNo(raw, def) {
    const x = String(raw || "").trim().toLowerCase();
    if (["si", "yes", "true", "1", "on"].includes(x)) return true;
    if (["no", "false", "0", "off"].includes(x)) return false;
    return def;
}

function securityFeatureModal(gc, feature) {
    const s = gc.security || {};
    switch (feature) {
        case "antiRaid":
            return modal("panel_modal_seg_antiraid", "⚔️ Configurar anti-raid", [
                input("secRaidThreshold", "Umbral de raid (ingresos)", s.raidThreshold || 5),
                input("secRaidWindow", "Ventana (segundos)", Math.floor((s.raidWindowMs || 10000) / 1000)),
                input("secRaidAction", "Acción (lockdown/kick/quarantine/alert)", s.raidAction || "lockdown"),
                input("secRaidLockdownMs", "Duración del lockdown (minutos)", Math.floor((s.raidLockdownMs || 600000) / 60000)),
                input("secRaidAlertChannel", "ID del canal de alertas", s.raidAlertChannel || "", false)
            ]);
        case "antiBot":
            return modal("panel_modal_seg_antibot", "🤖 Configurar anti-bot", [
                input("secBotAction", "Acción (alert/quarantine/kick)", s.botAction || "alert"),
                input("secBotWhitelist", "IDs de bots permitidos (comas)", (s.botWhitelist || []).join(", "), false),
                input("secBotAlertChannel", "ID del canal de alertas", s.botAlertChannel || "", false)
            ]);
        case "antiSpam":
            return modal("panel_modal_seg_antispam", "🚨 Configurar anti-spam", [
                input("secSpamLimit", "Límite de mensajes", s.spamLimit || 6),
                input("secSpamWindow", "Ventana (segundos)", Math.floor((s.spamWindowMs || 5000) / 1000)),
                input("secSpamAction", "Acción (delete/warn/timeout/kick/ban)", s.spamAction || "warn"),
                input("secSpamTimeout", "Duración del timeout (minutos)", Math.floor((s.spamTimeoutMs || 60000) / 60000)),
                input("secSpamMaxEmojis", "Máx. emojis por mensaje", s.spamMaxEmojis || 15)
            ]);
        case "antiLinks":
            return modal("panel_modal_seg_antilinks", "🔗 Configurar anti-links", [
                input("secLinkAction", "Acción (delete/warn/timeout)", s.linkAction || "warn"),
                input("secLinkInvites", "Bloquear invitaciones (si/no)", s.linkBlockInvites ? "si" : "no"),
                input("secLinkBlocked", "Dominios bloqueados (comas)", (s.linkBlockedDomains || []).join(", "), false),
                input("secLinkWhitelist", "Dominios permitidos (comas)", (s.linkWhitelist || []).join(", "), false),
                input("secLinkChannels", "IDs de canales permitidos (comas)", (s.linkAllowedChannels || []).join(", "), false)
            ]);
        case "antiMassMention":
            return modal("panel_modal_seg_antimention", "📣 Configurar anti-menciones", [
                input("secMentionLimit", "Límite de menciones por mensaje", s.massMentionLimit || 8),
                input("secMentionAction", "Acción (delete/warn/timeout)", s.mentionAction || "delete"),
                input("secMentionEveryone", "Bloquear @everyone/@here (si/no)", s.mentionBlockEveryone ? "si" : "no"),
                input("secMaxLength", "Longitud máx. del mensaje", s.spamMaxLength || 2000, false)
            ]);
        case "roleProtection":
            return modal("panel_modal_seg_roles", "🎭 Protección de roles", [
                input("secRoleRevert", "Revertir cambios (si/no)", s.roleAutoRevert ? "si" : "no"),
                input("secRoleAlertChannel", "ID del canal de alertas", s.roleAlertChannel || "", false)
            ]);
        default:
            return securityModal(gc);
    }
}

function securityGeneralModal(gc) {
    const s = gc.security || {};
    return modal("panel_modal_seg_general", "🌐 Configuración general", [
        input("secAlertChannel", "ID del canal de alertas", s.alertChannel || "", false),
        input("secExemptRoles", "IDs de roles exentos (comas)", (s.exemptRoles || []).join(", "), false)
    ]);
}

function securityQuarantineModal(gc) {
    const s = gc.security || {};
    return modal("panel_modal_seg_quarantine", "🔒 Configurar cuarentena", [
        input("secQuarantineRole", "ID del rol de cuarentena", s.quarantineRole || "", false),
        input("secQuarantineMs", "Duración (horas, 0 = manual)", Math.floor((s.quarantineDurationMs || 86400000) / 3600000))
    ]);
}

function ticketsModal(gc) {
    const t = gc.tickets || {};
    return modal(
        "panel_modal_tickets",
        "🎫 Configurar tickets",
        [
            input("ticketChannel", "ID del canal del panel", gc.ticketChannel || ""),
            input("ticketCategory", "ID de la categoría", gc.ticketCategory || ""),
            input("staffRole", "ID del rol de soporte", gc.staffRole || ""),
            input("transcriptChannel", "ID del canal de logs", gc.transcriptChannel || ""),
            input("panelMessage", "Mensaje del panel (opcional)", t.panelMessage || "", false, TextInputStyle.Paragraph)
        ]
    );
}

function welcomeModal(gc) {
    const w = gc.welcome || {};
    return modal(
        "panel_modal_bienvenidas",
        "👋 Configurar bienvenida",
        [
            input("welcomeChannel", "ID del canal de bienvenida", w.channel || ""),
            input("welcomeMessage", "Mensaje ({user}, {server}, {members}...)", w.message || "", false, TextInputStyle.Paragraph),
            input("welcomeImage", "URL de la imagen/banner (opcional)", w.image || "", false),
            input("welcomeColor", "Color del embed (#A52BE2)", w.color || "", false),
            input("welcomeFooter", "Footer", w.footer || "", false)
        ]
    );
}

function logsModal(gc, category) {
    const logs = gc.logs || {};
    const channelId = category
        ? (logs.categories?.[category] || logs.main || gc.logChannel)
        : (logs.main || gc.logChannel);
    return modal(
        "panel_modal_logs",
        category ? `📋 Logs: ${catLabel(category)}` : "📋 Canal principal de logs",
        [
            input("logsChannel", "ID del canal de logs", channelId || "")
        ]
    );
}

function autorolesModal(gc) {
    const ar = gc.autoroles || {};
    return modal(
        "panel_modal_autoroles",
        "🎭 Configurar auto-roles",
        [
            input("autoroleRoles", "IDs de roles separados por comas", (ar.roles || []).join(", "), false)
        ]
    );
}

function ttsModal(gc) {
    const t = gc.tts || {};
    return modal(
        "panel_modal_tts",
        "🔊 Configurar TTS",
        [
            input("ttsVoice", "ID del canal de voz", t.voiceChannel || ""),
            input("ttsText", "ID del canal de texto", t.textChannel || "")
        ]
    );
}

function musicaView(gc) {
    const m = musicSystem.ensureMusicConfig(gc).music || {};
    const controlModeLabel = m.controlMode === "roles" ? "🎭 Solo roles" : m.controlMode === "sameChannel" ? "🎙️ Mismo canal" : "👥 Todos";

    const embed = new EmbedBuilder()
        .setColor(PANEL_COLOR)
        .setTitle("🎵 MÚSICA")
        .setDescription(
            "Reproduce música en canales de voz con `/play`, `/queue`, `/volume`, `/loop` y más.\n" +
            "El panel interactivo se abre con `/music`."
        )
        .addFields(
            { name: "🟢 Estado", value: formatBool(m.enabled === true), inline: true },
            { name: "🔊 Volumen máximo", value: `**${m.maxVolume}%**`, inline: true },
            { name: "⏱️ Auto-desconexión", value: `**${Math.floor((m.autoLeaveMs || 60000) / 1000)}s**`, inline: true },
            { name: "🎛️ Quién controla", value: controlModeLabel, inline: true },
            { name: "🎭 Roles permitidos", value: (m.roles || []).length ? (m.roles || []).map(roleMention).join(", ") : "No configurado", inline: true },
            { name: "🎙️ Canal de voz permitido", value: channelMention(m.voiceChannel), inline: true },
            { name: "💬 Canal de texto permitido", value: channelMention(m.textChannel), inline: true }
        )
        .setFooter({ text: "DRAGONS | Centro de control" });

    const rows = [
        row([
            btn("panel_cfg_musica", "Configurar", ButtonStyle.Primary, "⚙️"),
            btn("panel_toggle_musica_on", "Activar", ButtonStyle.Success, "✅"),
            btn("panel_toggle_musica_off", "Desactivar", ButtonStyle.Danger, "❌"),
            btn("panel_back", "Volver", ButtonStyle.Secondary, "⬅️")
        ])
    ];

    return { embeds: [embed], components: rows };
}

function musicaModal(gc) {
    const m = musicSystem.ensureMusicConfig(gc).music || {};
    return modal(
        "panel_modal_musica",
        "🎵 Configurar música",
        [
            input("musicMaxVolume", "Volumen máximo (1-100)", m.maxVolume || 100),
            input("musicAutoLeave", "Auto-desconexión en segundos (0 = nunca)", Math.floor((m.autoLeaveMs || 60000) / 1000)),
            input("musicControlMode", "Quién controla: all, sameChannel o roles", m.controlMode || "all"),
            input("musicRoles", "IDs de roles (separados por coma)", (m.roles || []).join(", "), false),
            input("musicChannels", "Canales voz;texto (separados por ;)", [m.voiceChannel || "", m.textChannel || ""].join(";"), false)
        ]
    );
}

function sugerenciasModal(gc) {
    const s = gc.sugerencias || {};
    return modal(
        "panel_modal_sugerencias",
        "💡 Configurar sugerencias",
        [
            input("sugChannel", "ID del canal de sugerencias", s.channel || ""),
            input("sugLogChannel", "ID del canal de logs de sugerencias", s.logChannel || "")
        ]
    );
}

function sorteosModal(gc) {
    const s = gc.sorteos || {};
    return modal(
        "panel_modal_sorteos",
        "🎁 Configurar sorteos",
        [
            input("sorteoChannel", "ID del canal de sorteos", s.channel || "")
        ]
    );
}

function encuestasModal(gc) {
    const ec = encuestaSystem.ensureEncuestasSettings(gc.encuestas || {});
    const s = ec.settings;
    return modal(
        "panel_modal_encuestas",
        "🗳️ Configurar encuestas",
        [
            input("encChannel", "ID del canal de publicación", s.channel || "", false),
            input("encDuration", "Duración predeterminada (30s, 5m, 1h, 1d...)", s.defaultDuration || "1h"),
            input("encMax", "Límite de participantes (0 = sin límite)", s.maxParticipants || 0, false)
        ]
    );
}

function encuestaCrearModal() {
    return modal(
        "panel_modal_encuesta_crear",
        "➕ Crear encuesta",
        [
            input("encPregunta", "Pregunta de la encuesta", ""),
            input("encOpciones", "Opciones (separadas por coma)", ""),
            input("encDuracion", "Duración (vacío = la predeterminada)", "", false)
        ]
    );
}

function rolesAuthModal(gc) {
    return modal(
        "panel_modal_roles",
        "🔐 Roles autorizados",
        [
            input("panelRoles", "IDs de roles separados por comas", (gc.panel?.roles || []).join(", "), false)
        ]
    );
}

function getNumber(value) {
    const n = Number(String(value).trim());
    return Number.isFinite(n) && n > 0 ? n : null;
}

function validColor(value) {
    return /^#([0-9a-fA-F]{6})$/.test(String(value || "").trim());
}

async function handleToggle(interaction, config, saveConfig, section, value) {
    try {
    const guild = interaction.guild;
    const gc = ensureDefaults(getGuildConfig(config, guild.id));
    const on = value === "on";
    console.log(`[Panel:toggle] section=${section} value=${value} user=${interaction.user?.tag}`);

    switch (section) {
        case "seguridad": {
            const feat = currentSelection(interaction.user.id).securityFeature;
            gc.security[feat] = on;
            break;
        }
        case "tickets":
            gc.tickets.enabled = on;
            break;
        case "bienvenidas":
            gc.welcome = gc.welcome || {};
            gc.welcome.enabled = on;
            break;
        case "logs": {
            const logsCategory = currentSelection(interaction.user.id).logsCategory;
            if (logsCategory === "general") {
                gc.logs.enabled = Object.fromEntries(
                    Object.keys(logSystem.CATEGORIES).map(c => [c, on])
                );
            } else {
                gc.logs.enabled = gc.logs.enabled || {};
                gc.logs.enabled[logsCategory] = on;
            }
            break;
        }
        case "autoroles":
            gc.autoroles.enabled = on;
            break;
        case "tts":
            gc.tts.enabled = on;
            break;
        case "musica":
            musicSystem.ensureMusicConfig(gc);
            gc.music.enabled = on;
            break;
        case "sugerencias":
            gc.sugerencias.enabled = on;
            break;
        case "sorteos":
            gc.sorteos.enabled = on;
            break;
        case "encuestas":
            gc.encuestas = encuestaSystem.ensureEncuestasSettings(gc.encuestas);
            gc.encuestas.settings.enabled = on;
            break;
        case "ai":
            aiSystem.ensureAIGC(gc);
            gc.ai.enabled = on;
            break;
        case "recruitment":
            recruitmentSystem.ensureRecruitmentConfig(gc);
            gc.recruitment.enabled = on;
            break;
        case "tiktok":
            tiktokSystem.ensureTiktokConfig(gc);
            gc.tiktok.enabled = on;
            break;
        default:
            return;
    }

    saveConfig();
    await showView(interaction, buildSectionView(guild, config, section, currentSelection(interaction.user.id)));
    } catch (error) {
        console.error("[Panel] Error en handleToggle:", error.message);
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: "❌ Error al cambiar el estado.", flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        } catch {}
    }
}

function buildSectionView(guild, config, section, selState) {
    const gc = ensureDefaults(getGuildConfig(config, guild.id));
    selState = selState || currentSelection("__viewer__");

    switch (section) {
        case "seguridad": return securityView(gc);
        case "tickets": return ticketsView(gc);
        case "bienvenidas": return welcomeView(gc);
        case "logs": return logsView(gc, selState.logsCategory);
        case "autoroles": return autorolesView(gc);
        case "tts": return systemView(gc, "tts", "🔊 TTS", [
            `🟢 **Estado:** ${formatBool((gc.tts || {}).enabled === true)}`,
            `🎙️ Canal de voz: ${channelMention((gc.tts || {}).voiceChannel)}`,
            `💬 Canal de texto: ${channelMention((gc.tts || {}).textChannel)}`,
            "",
            "El bot entra al canal de voz y lee en voz alta lo que se escribe en el canal de texto.",
            "Prueba: `/tts texto: Hola a todos`"
        ]);
        case "musica": return musicaView(gc);
        case "sugerencias": return systemView(gc, "sugerencias", "💡 SUGERENCIAS", [
            `🟢 **Estado:** ${formatBool((gc.sugerencias || {}).enabled === true)}`,
            `💡 Canal de sugerencias: ${channelMention((gc.sugerencias || {}).channel)}`,
            `📋 Canal de logs: ${channelMention((gc.sugerencias || {}).logChannel)}`,
            "",
            "Los miembros usan `/sugerir <texto>` y el staff puede aprobar o rechazar.",
            "El resultado queda registrado en el canal de logs si está configurado."
        ]);
        case "sorteos": return systemView(gc, "sorteos", "🎁 SORTEOS", [
            `🟢 **Estado:** ${formatBool((gc.sorteos || {}).enabled === true)}`,
            `🎁 Canal de sorteos: ${channelMention((gc.sorteos || {}).channel)}`,
            "",
            "Crea sorteos con `/sorteo premio: <premio> duracion: 1h ganadores: 1`.",
            "Los miembros participan pulsando el botón y los ganadores se eligen al azar."
        ]);
        case "encuestas": return encuestasView(gc, guild);
        case "estadisticas": return estadisticasView(guild);
        case "configuracion": return configuracionView(gc);
        case "ai": return aiSystem.aiView(gc);
        case "recruitment": return recruitmentSystem.recruitmentView(gc);
        case "tiktok": return tiktokSystem.tiktokView(gc);
        case "aiControl": return aiControlSystem.getMainView(gc);
        default: return buildMainView(guild, config);
    }
}

async function handleModal(interaction, config, saveConfig) {
    try {
    const guild = interaction.guild;
    const gc = ensureDefaults(getGuildConfig(config, guild.id));
    const customId = interaction.customId;
    const v = (id) => interaction.fields.getTextInputValue(id)?.trim();
    let skipRender = false;
    console.log(`[Panel:modal] customId=${customId} user=${interaction.user?.tag}`);

    switch (customId) {
        case "panel_modal_seguridad": {
            const n = {};
            const spamLimit = getNumber(v("spamLimit"));
            const spamWindowSec = getNumber(v("spamWindowMs"));
            const raidThreshold = getNumber(v("raidThreshold"));
            const raidWindowSec = getNumber(v("raidWindowMs"));
            const massMentionLimit = getNumber(v("massMentionLimit"));
            if (spamLimit) n.spamLimit = spamLimit;
            if (spamWindowSec) n.spamWindowMs = spamWindowSec * 1000;
            if (raidThreshold) n.raidThreshold = raidThreshold;
            if (raidWindowSec) n.raidWindowMs = raidWindowSec * 1000;
            if (massMentionLimit) n.massMentionLimit = massMentionLimit;
            Object.assign(gc.security, n);
            break;
        }
        case "panel_modal_seg_antiraid": {
            const n = {};
            const t = getNumber(v("secRaidThreshold"));
            const win = getNumber(v("secRaidWindow"));
            const act = normalizeAction(v("secRaidAction"), ["lockdown", "kick", "quarantine", "alert"]);
            const lk = getNumber(v("secRaidLockdownMs"));
            const chId = resolveId(v("secRaidAlertChannel"), guild);
            if (t) n.raidThreshold = t;
            if (win) n.raidWindowMs = win * 1000;
            if (act) n.raidAction = act;
            if (lk) n.raidLockdownMs = lk * 60000;
            if (chId) n.raidAlertChannel = chId;
            Object.assign(gc.security, n);
            break;
        }
        case "panel_modal_seg_antibot": {
            const n = {};
            const act = normalizeAction(v("secBotAction"), ["alert", "quarantine", "kick"]);
            const wl = splitList(v("secBotWhitelist")).map(x => String(x).replace(/[<@>]/g, "")).filter(x => /^\d{15,20}$/.test(x));
            const chId = resolveId(v("secBotAlertChannel"), guild);
            if (act) n.botAction = act;
            if (wl.length) n.botWhitelist = wl;
            if (chId) n.botAlertChannel = chId;
            Object.assign(gc.security, n);
            break;
        }
        case "panel_modal_seg_antispam": {
            const n = {};
            const limit = getNumber(v("secSpamLimit"));
            const win = getNumber(v("secSpamWindow"));
            const act = normalizeAction(v("secSpamAction"), ["delete", "warn", "timeout", "kick", "ban"]);
            const to = getNumber(v("secSpamTimeout"));
            const maxEmo = getNumber(v("secSpamMaxEmojis"));
            if (limit) n.spamLimit = limit;
            if (win) n.spamWindowMs = win * 1000;
            if (act) n.spamAction = act;
            if (to) n.spamTimeoutMs = to * 60000;
            if (maxEmo) n.spamMaxEmojis = maxEmo;
            Object.assign(gc.security, n);
            break;
        }
        case "panel_modal_seg_antilinks": {
            const n = {};
            const act = normalizeAction(v("secLinkAction"), ["delete", "warn", "timeout"]);
            const inv = parseYesNo(v("secLinkInvites"), gc.security.linkBlockInvites);
            const blocked = splitDomains(v("secLinkBlocked"));
            const wl = splitDomains(v("secLinkWhitelist"));
            const ch = parseIdList(v("secLinkChannels"), guild, false);
            if (act) n.linkAction = act;
            n.linkBlockInvites = inv;
            if (blocked.length) n.linkBlockedDomains = blocked;
            if (wl.length) n.linkWhitelist = wl;
            if (ch.length) n.linkAllowedChannels = ch;
            Object.assign(gc.security, n);
            break;
        }
        case "panel_modal_seg_antimention": {
            const n = {};
            const limit = getNumber(v("secMentionLimit"));
            const act = normalizeAction(v("secMentionAction"), ["delete", "warn", "timeout"]);
            const blockEveryone = parseYesNo(v("secMentionEveryone"), gc.security.mentionBlockEveryone);
            const maxLen = getNumber(v("secMaxLength"));
            if (limit) n.massMentionLimit = limit;
            if (act) n.mentionAction = act;
            n.mentionBlockEveryone = blockEveryone;
            if (maxLen) n.spamMaxLength = maxLen;
            Object.assign(gc.security, n);
            break;
        }
        case "panel_modal_seg_roles": {
            const n = {};
            const revert = parseYesNo(v("secRoleRevert"), gc.security.roleAutoRevert);
            const chId = resolveId(v("secRoleAlertChannel"), guild);
            n.roleAutoRevert = revert;
            if (chId) n.roleAlertChannel = chId;
            Object.assign(gc.security, n);
            break;
        }
        case "panel_modal_seg_general": {
            const n = {};
            const chId = resolveId(v("secAlertChannel"), guild);
            const ex = parseIdList(v("secExemptRoles"), guild, true);
            if (chId) n.alertChannel = chId;
            if (ex.length) n.exemptRoles = ex;
            Object.assign(gc.security, n);
            break;
        }
        case "panel_modal_seg_quarantine": {
            const n = {};
            const roleId = resolveRoleId(v("secQuarantineRole"), guild);
            const h = getNumber(v("secQuarantineMs"));
            if (roleId) n.quarantineRole = roleId;
            if (h !== null) n.quarantineDurationMs = h * 3600000;
            Object.assign(gc.security, n);
            break;
        }
        case "panel_modal_tickets": {
            const ticketChannel = resolveId(v("ticketChannel"), guild);
            const ticketCategory = resolveId(v("ticketCategory"), guild);
            const staffRole = resolveRoleId(v("staffRole"), guild);
            const transcriptChannel = resolveId(v("transcriptChannel"), guild);
            const panelMessage = v("panelMessage");

            if (ticketChannel) gc.ticketChannel = ticketChannel;
            if (ticketCategory) gc.ticketCategory = ticketCategory;
            if (staffRole) gc.staffRole = staffRole;
            if (transcriptChannel) gc.transcriptChannel = transcriptChannel;
            if (panelMessage) gc.tickets.panelMessage = panelMessage;
            break;
        }
        case "panel_modal_bienvenidas": {
            const channel = resolveId(v("welcomeChannel"), guild);
            const message = v("welcomeMessage");
            const image = v("welcomeImage");
            const color = v("welcomeColor");
            const footer = v("welcomeFooter");
            const w = gc.welcome = gc.welcome || {};

            if (channel) w.channel = channel;
            if (message) w.message = message;
            if (image) w.image = image;
            if (validColor(color)) w.color = color;
            if (footer) w.footer = footer;
            break;
        }
        case "panel_modal_logs": {
            const channelId = resolveId(v("logsChannel"), guild);
            if (channelId) {
                const logsCategory = currentSelection(interaction.user.id).logsCategory;
                if (logsCategory === "general") {
                    gc.logs.main = channelId;
                    gc.logChannel = channelId;
                } else {
                    gc.logs.categories = gc.logs.categories || {};
                    gc.logs.categories[logsCategory] = channelId;
                }
            }
            break;
        }
        case "panel_modal_autoroles": {
            const roles = parseIdList(v("autoroleRoles"), guild, true);
            gc.autoroles.roles = roles;
            break;
        }
        case "panel_modal_tts": {
            const voice = resolveId(v("ttsVoice"), guild);
            const text = resolveId(v("ttsText"), guild);
            if (voice) gc.tts.voiceChannel = voice;
            if (text) gc.tts.textChannel = text;
            break;
        }
        case "panel_modal_musica": {
            const m = musicSystem.ensureMusicConfig(gc).music;
            const maxVol = getNumber(v("musicMaxVolume"));
            const autoLeave = getNumber(v("musicAutoLeave"));
            const mode = v("musicControlMode");
            const roles = parseIdList(v("musicRoles"), guild, true);
            const channelsRaw = v("musicChannels") || "";
            const [vcRaw, tcRaw] = channelsRaw.split(";").map(s => s.trim());
            const vcId = resolveId(vcRaw, guild);
            const tcId = resolveId(tcRaw, guild);
            if (maxVol !== null) m.maxVolume = Math.min(100, Math.max(1, maxVol));
            if (autoLeave !== null) m.autoLeaveMs = autoLeave * 1000;
            if (["all", "sameChannel", "roles"].includes(mode)) m.controlMode = mode;
            m.roles = roles;
            m.voiceChannel = vcId || null;
            m.textChannel = tcId || null;
            break;
        }
        case "panel_modal_sugerencias": {
            const channel = resolveId(v("sugChannel"), guild);
            const logChannel = resolveId(v("sugLogChannel"), guild);
            if (channel) gc.sugerencias.channel = channel;
            if (logChannel) gc.sugerencias.logChannel = logChannel;
            break;
        }
        case "panel_modal_sorteos": {
            const channel = resolveId(v("sorteoChannel"), guild);
            if (channel) gc.sorteos.channel = channel;
            break;
        }
        case "panel_modal_encuestas": {
            const ec = encuestaSystem.ensureEncuestasSettings(gc.encuestas);
            const channel = resolveId(v("encChannel"), guild);
            const dur = v("encDuration");
            const max = getNumber(v("encMax"));
            if (channel) ec.settings.channel = channel;
            if (dur && parseDuration(dur)) ec.settings.defaultDuration = dur;
            if (max !== null) ec.settings.maxParticipants = max;
            break;
        }
        case "panel_modal_encuesta_crear": {
            await encuestaSystem.panelCreate(interaction, config, saveConfig, {
                pregunta: v("encPregunta"),
                opcionesStr: v("encOpciones"),
                duracionStr: v("encDuracion") || null
            });
            skipRender = true;
            break;
        }
        case "panel_modal_roles": {
            const roles = parseIdList(v("panelRoles"), guild, true);
            gc.panel.roles = roles;
            break;
        }
        case "panel_modal_ai": {
            const channel = resolveId(v("aiChannel"), guild);
            const cooldown = getNumber(v("aiCooldown"));
            const rateLimit = getNumber(v("aiRateLimit"));
            const model = v("aiModel");
            const permissions = v("aiPermissions");

            if (channel) gc.ai.channel = channel;
            if (cooldown !== null) gc.ai.cooldownMs = cooldown * 1000;
            if (rateLimit !== null) gc.ai.maxMessagesPerHour = rateLimit;
            if (model) gc.ai.model = model.trim();
            if (permissions && ["all", "roles", "staff", "nobody"].includes(permissions.trim().toLowerCase())) {
                gc.ai.permissionMode = permissions.trim().toLowerCase();
            }
            break;
        }
        case "panel_modal_ai_knowledge": {
            if (!gc.ai.knowledge) gc.ai.knowledge = {};
            const serverName = v("aiServerName");
            const description = v("aiDescription");
            const rules = v("aiRules");
            const commands = v("aiCommands");
            const tickets = v("aiTickets");

            if (serverName) gc.ai.knowledge.serverName = serverName;
            if (description !== undefined) gc.ai.knowledge.description = description;
            if (rules !== undefined) gc.ai.knowledge.rules = rules;
            if (commands !== undefined) gc.ai.knowledge.commands = commands;
            if (tickets !== undefined) gc.ai.knowledge.tickets = tickets;
            break;
        }
        case "panel_modal_ai_knowledge2": {
            if (!gc.ai.knowledge) gc.ai.knowledge = {};
            const minecraft = v("aiMinecraft");
            const faq = v("aiFaq");
            const systemPrompt = v("aiSystemPrompt");
            const allowedRoles = parseIdList(v("aiAllowedRoles"), guild, true);
            const maxContext = getNumber(v("aiMaxContext"));

            if (minecraft !== undefined) gc.ai.knowledge.minecraft = minecraft;
            if (faq !== undefined) gc.ai.knowledge.faq = faq;
            if (systemPrompt !== undefined) gc.ai.systemPrompt = systemPrompt;
            if (allowedRoles.length) gc.ai.allowedRoles = allowedRoles;
            if (maxContext !== null) gc.ai.maxContextMessages = Math.max(5, Math.min(50, maxContext));
            break;
        }
        case "panel_modal_recruitment": {
            const channel = resolveId(v("recPublicChannel"), guild);
            const reviewChannel = resolveId(v("recReviewChannel"), guild);
            const roles = parseIdList(v("recReviewerRoles"), guild, true);
            const cooldown = getNumber(v("recCooldown"));
            const limits = (v("recLimits") || "").split(/\s+/);
            const maxActive = getNumber(limits[0]);
            const maxPerUser = getNumber(limits[1]);

            if (channel) gc.recruitment.publicChannel = channel;
            if (reviewChannel) gc.recruitment.reviewChannel = reviewChannel;
            if (roles.length) gc.recruitment.reviewerRoles = roles;
            if (cooldown !== null) gc.recruitment.cooldownMs = cooldown * 60000;
            if (maxActive !== null) gc.recruitment.maxActive = Math.max(1, maxActive);
            if (maxPerUser !== null) gc.recruitment.maxPerUser = Math.max(1, maxPerUser);
            break;
        }
        case "panel_modal_tiktok_add":
        case "panel_modal_tiktok_config": {
            await tiktokSystem.handleTiktokModal(interaction, config, saveConfig);
            skipRender = true;
            break;
        }
        default:
            return;
    }

    if (skipRender) return;

    saveConfig();
    const section = modalSectionMap[customId] || "configuracion";
    await showView(interaction, buildSectionView(guild, config, section, currentSelection(interaction.user.id)));
    } catch (error) {
        console.error(`[Panel] Error en handleModal customId=${interaction.customId}:`, error.message, error.stack || "");
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: "❌ Error al procesar la configuración.", flags: MessageFlags.Ephemeral }).catch((e2) => {
                    console.error(`[Panel:modal] ❌ Error reply fallback falló:`, e2.message);
                });
            }
        } catch {}
    }
}

const modalSectionMap = {
    panel_modal_seguridad: "seguridad",
    panel_modal_seg_antiraid: "seguridad",
    panel_modal_seg_antibot: "seguridad",
    panel_modal_seg_antispam: "seguridad",
    panel_modal_seg_antilinks: "seguridad",
    panel_modal_seg_antimention: "seguridad",
    panel_modal_seg_roles: "seguridad",
    panel_modal_seg_general: "seguridad",
    panel_modal_seg_quarantine: "seguridad",
    panel_modal_tickets: "tickets",
    panel_modal_bienvenidas: "bienvenidas",
    panel_modal_logs: "logs",
    panel_modal_autoroles: "autoroles",
    panel_modal_tts: "tts",
    panel_modal_musica: "musica",
    panel_modal_sugerencias: "sugerencias",
    panel_modal_sorteos: "sorteos",
    panel_modal_encuestas: "encuestas",
    panel_modal_encuesta_crear: "encuestas",
    panel_modal_roles: "configuracion",
    panel_modal_ai: "ai",
    panel_modal_ai_knowledge: "ai",
    panel_modal_ai_knowledge2: "ai",
    panel_modal_recruitment: "recruitment",
    panel_modal_tiktok_add: "tiktok",
    panel_modal_tiktok_config: "tiktok"
};

async function handleButton(interaction, config, saveConfig) {
    try {
    const guild = interaction.guild;
    const gc = ensureDefaults(getGuildConfig(config, guild.id));
    const id = interaction.customId;
    const selState = currentSelection(interaction.user.id);
    console.log(`[Panel:btn] customId=${id} user=${interaction.user?.tag} deferred=${interaction.deferred} replied=${interaction.replied}`);

    if (id === "panel_back") {
        await showView(interaction, buildMainView(guild, config));
        return;
    }

    if (id === "panel_estadisticas_refresh") {
        await showView(interaction, estadisticasView(guild));
        return;
    }

    if (id === "panel_sel_reset_open") {
        await showView(interaction, resetView(gc, config, guild, selState.resetTarget));
        return;
    }

    if (id === "panel_btn_reset_confirm") {
        const target = selState.resetTarget;
        if (!target) {
            await interaction.reply({
                content: "❌ Selecciona primero una función en el menú desplegable.",
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
            return;
        }
        delete gc[target];
        saveConfig();
        await showView(interaction, configuracionView(gc));
        return;
    }

    const sectionMatch = /^panel_sec_(.+)$/.exec(id);
    if (sectionMatch) {
        const section = sectionMatch[1];
        await showView(interaction, buildSectionView(guild, config, section, selState));
        return;
    }

    if (id === "panel_enc_ver" || id === "panel_enc_finalizar" || id === "panel_enc_cancelar" || id === "panel_enc_reiniciar") {
        await interaction.deferUpdate().catch(() => {});
        if (id === "panel_enc_ver") {
            await encuestaSystem.panelViewActive(interaction, config, saveConfig);
        } else if (id === "panel_enc_finalizar") {
            await encuestaSystem.panelFinalize(interaction, config, saveConfig);
        } else if (id === "panel_enc_cancelar") {
            await encuestaSystem.panelCancel(interaction, config, saveConfig);
        } else {
            await encuestaSystem.panelReset(interaction, config, saveConfig);
        }
        await interaction.message.edit(buildSectionView(guild, config, "encuestas", selState)).catch(() => {});
        return;
    }

    if (id === "panel_enc_crear") {
        await interaction.showModal(encuestaCrearModal()).catch(() => {});
        return;
    }

    if (id === "panel_enc_live" || id === "panel_enc_change" || id === "panel_enc_delprev") {
        const ec = encuestaSystem.ensureEncuestasSettings(gc.encuestas);
        if (id === "panel_enc_live") ec.settings.liveResults = !ec.settings.liveResults;
        else if (id === "panel_enc_change") ec.settings.allowChange = !ec.settings.allowChange;
        else ec.settings.autoDeletePrev = !ec.settings.autoDeletePrev;
        saveConfig();
        await showView(interaction, encuestasView(gc, guild));
        return;
    }

    if (id === "panel_security_master") {
        gc.security.enabled = gc.security.enabled === false;
        saveConfig();
        await showView(interaction, securityView(gc));
        return;
    }

    if (id === "panel_security_lockdown") {
        await showView(interaction, lockdownView(gc));
        return;
    }

    if (id === "panel_security_lockdown_confirm") {
        await interaction.deferUpdate().catch(() => {});
        await securitySystem.activateLockdown(guild, config, saveConfig, interaction.member, "Lockdown activado desde el panel");
        saveConfig();
        await showView(interaction, securityView(gc));
        return;
    }

    if (id === "panel_security_lockdown_off") {
        await interaction.deferUpdate().catch(() => {});
        await securitySystem.deactivateLockdown(guild, config, saveConfig, interaction.member, "Lockdown desactivado desde el panel");
        saveConfig();
        await showView(interaction, securityView(gc));
        return;
    }

    if (id === "panel_security_alerts") {
        await showView(interaction, alertsView(gc));
        return;
    }

    if (id === "panel_security_alerts_clear") {
        securitySystem.clearAlerts(config, guild.id);
        saveConfig();
        await showView(interaction, alertsView(gc));
        return;
    }

    if (id === "panel_security_stats") {
        await showView(interaction, statsView(gc));
        return;
    }

    if (id === "panel_security_stats_refresh") {
        await showView(interaction, statsView(gc));
        return;
    }

    if (id.startsWith("panel_security_timefilter_")) {
        const days = parseInt(id.split("_").pop(), 10);
        await showView(interaction, statsView(gc, isNaN(days) ? 0 : days));
        return;
    }

    if (id === "panel_security_incidents") {
        await showView(interaction, incidentsView(gc, 0));
        return;
    }

    if (id.startsWith("panel_security_incidents_page_prev_")) {
        const parts = id.replace("panel_security_incidents_page_prev_", "").split("_");
        const page = parseInt(parts[0], 10);
        const filterType = parts.length > 1 ? parts[1] : null;
        await showView(interaction, incidentsView(gc, isNaN(page) ? 0 : page, filterType));
        return;
    }

    if (id.startsWith("panel_security_incidents_page_next_")) {
        const parts = id.replace("panel_security_incidents_page_next_", "").split("_");
        const page = parseInt(parts[0], 10);
        const filterType = parts.length > 1 ? parts[1] : null;
        await showView(interaction, incidentsView(gc, isNaN(page) ? 0 : page, filterType));
        return;
    }

    if (id.startsWith("panel_security_incidents_filter_")) {
        const filterType = id.replace("panel_security_incidents_filter_", "");
        await showView(interaction, incidentsView(gc, 0, filterType));
        return;
    }

    if (id === "panel_security_incidents_clear_filter") {
        await showView(interaction, incidentsView(gc, 0));
        return;
    }

    if (id.startsWith("panel_security_incident_detail_")) {
        const incId = parseInt(id.replace("panel_security_incident_detail_", ""), 10);
        await showView(interaction, incidentDetailView(gc, incId));
        return;
    }

    if (id.startsWith("panel_security_incident_resolve_")) {
        const incId = parseInt(id.replace("panel_security_incident_resolve_", ""), 10);
        securitySystem.updateIncidentStatus(gc, incId, "resolved", interaction.user?.tag || interaction.user?.id);
        saveConfig();
        await showView(interaction, incidentDetailView(gc, incId));
        return;
    }

    if (id.startsWith("panel_security_incident_close_")) {
        const incId = parseInt(id.replace("panel_security_incident_close_", ""), 10);
        securitySystem.updateIncidentStatus(gc, incId, "closed", interaction.user?.tag || interaction.user?.id);
        saveConfig();
        await showView(interaction, incidentDetailView(gc, incId));
        return;
    }

    if (id === "panel_security_suspicious") {
        await showView(interaction, suspiciousUsersView(gc));
        return;
    }

    if (id === "panel_security_stats_detail") {
        await showView(interaction, perSystemStatsView(gc, 0));
        return;
    }

    if (id.startsWith("panel_security_stats_detail_filter_")) {
        const days = parseInt(id.replace("panel_security_stats_detail_filter_", ""), 10);
        await showView(interaction, perSystemStatsView(gc, isNaN(days) ? 0 : days));
        return;
    }

    if (id === "panel_security_general") {
        await interaction.showModal(securityGeneralModal(gc)).catch(() => {});
        return;
    }

    if (id === "panel_security_quarantine") {
        await showView(interaction, quarantineView(gc));
        return;
    }

    if (id === "panel_security_quarantine_cfg") {
        await interaction.showModal(securityQuarantineModal(gc)).catch(() => {});
        return;
    }

    if (id === "panel_security_quarantine_releaseall") {
        const quarantined = securitySystem.getQuarantined(config, guild.id);
        let released = 0;
        for (const uid of Object.keys(quarantined)) {
            const res = securitySystem.releaseQuarantine(guild, config, saveConfig, uid, interaction.member, "Cuarentenas liberadas desde el panel");
            if (res.ok) released++;
        }
        saveConfig();
        await showView(interaction, quarantineView(gc));
        return;
    }

    if (id === "panel_ai_knowledge") {
        await interaction.showModal(aiSystem.aiKnowledgeModal(gc)).catch(() => {});
        return;
    }

    if (id === "panel_ai_knowledge_next") {
        await interaction.showModal(aiSystem.aiKnowledgeModal2(gc)).catch(() => {});
        return;
    }

    if (id === "panel_ai_newconv") {
        aiSystem.handleNewConversation(interaction, config);
        return;
    }

    if (id.startsWith("panel_tiktok")) {
        await tiktokSystem.handleTiktokInteraction(interaction, config, saveConfig);
        return;
    }

    const cfgMatch = /^panel_cfg_(.+)$/.exec(id);
    if (cfgMatch) {
        const section = cfgMatch[1];
        let m;
        switch (section) {
            case "seguridad": m = securityFeatureModal(gc, selState.securityFeature); break;
            case "tickets": m = ticketsModal(gc); break;
            case "bienvenidas": m = welcomeModal(gc); break;
            case "logs":
                m = logsModal(gc, selState.logsCategory === "general" ? null : selState.logsCategory);
                break;
            case "autoroles": m = autorolesModal(gc); break;
            case "tts": m = ttsModal(gc); break;
            case "musica": m = musicaModal(gc); break;
            case "sugerencias": m = sugerenciasModal(gc); break;
            case "sorteos": m = sorteosModal(gc); break;
            case "encuestas": m = encuestasModal(gc); break;
            case "ai": m = aiSystem.aiModal(gc); break;
            case "recruitment": m = recruitmentSystem.recruitmentModal(gc); break;
            case "tiktok": m = tiktokSystem.tiktokConfigModal(gc); break;
            default: return;
        }
        await interaction.showModal(m).catch(async (err) => {
            console.error("[DRAGONS MUSIC PANEL] Error abriendo modal:", err);
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: "❌ No se pudo abrir el formulario de configuración.", flags: MessageFlags.Ephemeral }).catch(() => {});
                }
            } catch {}
        });
        return;
    }

    if (id === "panel_btn_roles_auth") {
        await interaction.showModal(rolesAuthModal(gc)).catch(() => {});
        return;
    }

    const toggleMatch = /^panel_toggle_([a-z]+)_(on|off)$/.exec(id);
    if (toggleMatch) {
        await handleToggle(interaction, config, saveConfig, toggleMatch[1], toggleMatch[2]);
        return;
    }
    } catch (error) {
        console.error(`[Panel] Error en handleButton customId=${interaction.customId}:`, error.message, error.stack || "");
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: `❌ Error al procesar el botón: ${error.message}`.substring(0, 200), flags: MessageFlags.Ephemeral }).catch((e2) => {
                    console.error(`[Panel:btn] ❌ Error reply fallback falló:`, e2.message);
                });
            }
        } catch {}
    }
}

async function handleSelect(interaction, config, saveConfig) {
    try {
    const guild = interaction.guild;
    const gc = ensureDefaults(getGuildConfig(config, guild.id));
    const id = interaction.customId;
    const value = interaction.values[0];
    const selState = currentSelection(interaction.user.id);
    console.log(`[Panel:select] customId=${id} value=${value} user=${interaction.user?.tag}`);

    if (id === "panel_sel_sec") {
        await showView(interaction, buildSectionView(guild, config, value, selState));
        return;
    }

    if (id === "panel_sel_security") {
        selState.securityFeature = value;
        await showView(interaction, securityView(gc));
        return;
    }

    if (id === "panel_sel_logs") {
        selState.logsCategory = value;
        await showView(interaction, logsView(gc, value));
        return;
    }

    if (id === "panel_sel_reset") {
        selState.resetTarget = value;
        await showView(interaction, resetView(gc, config, guild, value));
        return;
    }

    if (id === "panel_sel_enc_tipo") {
        const ec = encuestaSystem.ensureEncuestasSettings(gc.encuestas);
        ec.settings.pollType = value;
        saveConfig();
        await showView(interaction, encuestasView(gc, guild));
        return;
    }
    } catch (error) {
        console.error(`[Panel] Error en handleSelect customId=${interaction.customId}:`, error.message, error.stack || "");
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: "❌ Error al procesar la selección.", flags: MessageFlags.Ephemeral }).catch((e2) => {
                    console.error(`[Panel:select] ❌ Error reply fallback falló:`, e2.message);
                });
            }
        } catch {}
    }
}

async function handlePanelInteraction(interaction, config, saveConfig) {
    try {
    const isPanelCommand = interaction.isCommand() && interaction.commandName === "panel";
    const isPanelComponent =
        (interaction.isButton() && interaction.customId?.startsWith("panel_")) ||
        (interaction.isStringSelectMenu() && interaction.customId?.startsWith("panel_")) ||
        (interaction.isModalSubmit() && interaction.customId?.startsWith("panel_"));

    if (!isPanelCommand && !isPanelComponent) return false;

    console.log(`[Panel:handle] IN customId=${interaction.customId || "panel/cmd"} user=${interaction.user?.tag}`);

    if (!hasPanelPermission(interaction.member, config, interaction.guild?.id)) {
        console.log(`[Panel:handle] ❌ Sin permiso user=${interaction.user?.tag}`);
        await deny(interaction);
        return true;
    }

    if (isPanelCommand) {
        const guild = interaction.guild;
        ensureDefaults(getGuildConfig(config, guild.id));
        await showView(interaction, buildMainView(guild, config));
        console.log(`[Panel:handle] ✅ Panel principal mostrado`);
        return true;
    }

    if (interaction.isModalSubmit()) {
        console.log(`[Panel:handle] → handleModal customId=${interaction.customId}`);
        await handleModal(interaction, config, saveConfig);
        console.log(`[Panel:handle] ✅ Modal procesado customId=${interaction.customId}`);
        return true;
    }

    if (interaction.isStringSelectMenu()) {
        console.log(`[Panel:handle] → handleSelect customId=${interaction.customId} value=${interaction.values?.[0]}`);
        await handleSelect(interaction, config, saveConfig);
        console.log(`[Panel:handle] ✅ Select procesado customId=${interaction.customId}`);
        return true;
    }

    if (interaction.isButton()) {
        console.log(`[Panel:handle] → handleButton customId=${interaction.customId}`);
        await handleButton(interaction, config, saveConfig);
        console.log(`[Panel:handle] ✅ Botón procesado customId=${interaction.customId} state=r${interaction.replied?1:0}/d${interaction.deferred?1:0}`);
        return true;
    }

    return false;
    } catch (error) {
        console.error("[Panel] Error en handlePanelInteraction:", error.message, error.stack || "");
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: "❌ Error al procesar la interacción del panel.", flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        } catch {}
        return true;
    }
}

async function applyAutoRoles(member, config) {
    try {
        if (member.user.bot) return;
        const gc = getGuildConfig(config, member.guild.id);
        const ar = gc.autoroles;
        if (!ar?.enabled || !Array.isArray(ar.roles) || !ar.roles.length) return;
        const validRoles = ar.roles.filter(rid => member.guild.roles.cache.has(rid));
        if (!validRoles.length) return;
        await member.roles.add(validRoles, "Auto-rol (centro de control)").catch(() => {});
    } catch (error) {
        console.error("Auto-rol:", error);
    }
}

module.exports = {
    handlePanelInteraction,
    applyAutoRoles,
    buildMainView,
    hasPanelPermission,
    getGuildConfig
};
