const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, MessageFlags, PermissionsBitField } = require("discord.js");

const incidentSystem = require("./incidentSystem");
const aiDetectionSystem = require("./aiDetectionSystem");
const reputationSystem = require("./reputationSystem");
const recoverySystem = require("./recoverySystem");
const securitySimulationSystem = require("./securitySimulationSystem");

const PANEL_COLOR = "#8A2BE2";

function ensureAIControlConfig(gc) {
    if (!gc.aiControl) gc.aiControl = {};
    if (typeof gc.aiControl.enabled !== "boolean") gc.aiControl.enabled = false;
    if (typeof gc.aiControl.intelligentDetection !== "boolean") gc.aiControl.intelligentDetection = true;
    if (typeof gc.aiControl.autoResponse !== "boolean") gc.aiControl.autoResponse = true;
    if (typeof gc.aiControl.reputationEnabled !== "boolean") gc.aiControl.reputationEnabled = true;
    if (typeof gc.aiControl.advancedAntiRaid !== "boolean") gc.aiControl.advancedAntiRaid = true;
    if (typeof gc.aiControl.incidentRegistry !== "boolean") gc.aiControl.incidentRegistry = true;
    if (typeof gc.aiControl.autoRecovery !== "boolean") gc.aiControl.autoRecovery = false;
    if (typeof gc.aiControl.simulationMode !== "boolean") gc.aiControl.simulationMode = false;
    if (!gc.aiControl.thresholds) gc.aiControl.thresholds = { low: 30, medium: 60, high: 80, critical: 100 };
    if (!gc.aiControl.actions) {
        gc.aiControl.actions = {
            low: ["log"],
            medium: ["warn", "log"],
            high: ["timeout", "alert", "log"],
            critical: ["quarantine", "alert", "log"],
            raid: ["lockdown", "quarantine", "alert", "log"]
        };
    }
    if (!gc.aiControl.exemptions) gc.aiControl.exemptions = { roles: [], users: [], channels: [] };
    if (!gc.aiControl.rolePermissions) gc.aiControl.rolePermissions = { admin: [], moderator: [], viewer: [] };
    if (!gc.aiControl.stats) {
        gc.aiControl.stats = {
            incidentsToday: 0, incidentsWeek: 0, incidentsMonth: 0,
            raidsDetected: 0, spamBlocked: 0, linksBlocked: 0,
            mentionsBlocked: 0, quarantines: 0, autoActions: 0, restorations: 0
        };
    }
    incidentSystem.ensureIncidentConfig(gc);
    aiDetectionSystem.ensureDetectionConfig(gc);
    reputationSystem.ensureReputationConfig(gc);
    recoverySystem.ensureRecoveryConfig(gc);
    return gc;
}

function getSystemRiskScore(gc) {
    ensureAIControlConfig(gc);
    if (!gc.aiControl.detection?.riskScores) return 0;
    const scores = Object.values(gc.aiControl.detection.riskScores);
    if (!scores.length) return 0;
    const avg = scores.reduce((sum, e) => sum + (e.score || 0), 0) / scores.length;
    return Math.round(avg);
}

function getSystemRiskEmoji(score) {
    if (score >= 81) return "🔴";
    if (score >= 61) return "🟠";
    if (score >= 31) return "🟡";
    return "🟢";
}

function getTopThreat(gc) {
    ensureAIControlConfig(gc);
    const events = gc.aiControl.detection?.recentEvents || [];
    if (!events.length) return "Ninguna";
    const recent = events[0];
    return `${recent.type} — ${recent.userName || recent.userId || "N/A"}`;
}

function getTopRiskUser(gc) {
    const top = aiDetectionSystem.getTopRiskUsers(gc, 1)[0];
    if (!top) return "Ninguno";
    return `<@${top.userId}> (${top.score}/100)`;
}

function getLastIncident(gc) {
    const inc = incidentSystem.getRecentIncidents(gc, 1)[0];
    if (!inc) return "Ninguno";
    return `${inc.id} — ${inc.type}`;
}

function getMainView(gc) {
    ensureAIControlConfig(gc);
    const ac = gc.aiControl;
    const stats = ac.stats || {};
    const riskScore = getSystemRiskScore(gc);
    const riskEmoji = getSystemRiskEmoji(riskScore);

    const embed = new EmbedBuilder()
        .setColor(riskScore >= 81 ? "#ED4245" : riskScore >= 61 ? "#F47B67" : riskScore >= 31 ? "#FEE75C" : "#57F287")
        .setTitle("🧠 DRAGONS | AI SECURITY")
        .setDescription(
            `${ac.enabled ? "🟢 **ESTADO: ACTIVO**" : "🔴 **ESTADO: DESACTIVADO**"}\n\n` +
            `🛡️ **Nivel de protección:** ${ac.intelligentDetection ? "🟢 Inteligente" : "⚪ Básico"}\n` +
            `${riskEmoji} **Riesgo actual:** ${riskScore}/100\n\n` +
            `📊 **Incidentes:**\n` +
            `> Hoy: **${stats.incidentsToday || 0}** · Semana: **${stats.incidentsWeek || 0}** · Mes: **${stats.incidentsMonth || 0}**\n` +
            `👤 **Usuarios sospechosos:** ${aiDetectionSystem.getTopRiskUsers(gc, 100).filter(u => u.score >= (ac.thresholds?.medium || 60)).length}\n` +
            `⚔️ **Raids detectados:** ${stats.raidsDetected || 0}\n` +
            `📨 **Spam bloqueado:** ${stats.spamBlocked || 0}\n` +
            `🔗 **Links bloqueados:** ${stats.linksBlocked || 0}\n` +
            `📣 **Mass mentions:** ${stats.mentionsBlocked || 0}\n` +
            `🔒 **Cuarentenas:** ${stats.quarantines || 0}\n` +
            `🤖 **Acciones automáticas:** ${stats.autoActions || 0}\n` +
            `🔄 **Restauraciones:** ${stats.restorations || 0}\n\n` +
            `🔥 **Amenaza principal:** ${getTopThreat(gc)}\n` +
            `👤 **Mayor riesgo:** ${getTopRiskUser(gc)}\n` +
            `🚨 **Último incidente:** ${getLastIncident(gc)}`
        )
        .setFooter({ text: "DRAGONS | AI Security" })
        .setTimestamp();

    const components = [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("aicc_config").setLabel("⚙️ Configuración").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("aicc_analyze").setLabel("🔍 Analizar").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("aicc_dashboard").setLabel("📊 Dashboard").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("aicc_reputation").setLabel("🧬 Reputación").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("aicc_antiraid").setLabel("🕵️ Anti-Raid").setStyle(ButtonStyle.Secondary)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("aicc_incidents").setLabel("🧾 Incidentes").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("aicc_recovery").setLabel("🔄 Recuperación").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("aicc_simulation").setLabel("🧪 Simulación").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("panel_back").setLabel("⬅️ Volver").setStyle(ButtonStyle.Secondary)
        )
    ];

    return { embeds: [embed], components };
}

function getConfigView(gc) {
    ensureAIControlConfig(gc);
    const ac = gc.aiControl;

    const embed = new EmbedBuilder()
        .setColor(PANEL_COLOR)
        .setTitle("⚙️ AI SETTINGS")
        .setDescription(
            `**Sistemas:**\n` +
            `🧠 Detección inteligente: ${ac.intelligentDetection ? "🟢 ON" : "🔴 OFF"}\n` +
            `🤖 Respuesta automática: ${ac.autoResponse ? "🟢 ON" : "🔴 OFF"}\n` +
            `🧬 Reputación: ${ac.reputationEnabled ? "🟢 ON" : "🔴 OFF"}\n` +
            `🕵️ Anti-Raid avanzado: ${ac.advancedAntiRaid ? "🟢 ON" : "🔴 OFF"}\n` +
            `🧾 Registro de incidentes: ${ac.incidentRegistry ? "🟢 ON" : "🔴 OFF"}\n` +
            `🔄 Recuperación automática: ${ac.autoRecovery ? "🟢 ON" : "🔴 OFF"}\n` +
            `🧪 Modo simulación: ${ac.simulationMode ? "🟢 ON" : "🔴 OFF"}\n\n` +
            `**Umbrales de riesgo:**\n` +
            `🟢 Bajo: 0-${ac.thresholds.low}\n` +
            `🟡 Medio: ${ac.thresholds.low + 1}-${ac.thresholds.medium}\n` +
            `🟠 Alto: ${ac.thresholds.medium + 1}-${ac.thresholds.high}\n` +
            `🔴 Crítico: ${ac.thresholds.high + 1}-100\n\n` +
            `**Acciones configuradas:**\n` +
            `🟢 Bajo: ${(ac.actions.low || []).join(", ") || "Ninguna"}\n` +
            `🟡 Medio: ${(ac.actions.medium || []).join(", ") || "Ninguna"}\n` +
            `🟠 Alto: ${(ac.actions.high || []).join(", ") || "Ninguna"}\n` +
            `🔴 Crítico: ${(ac.actions.critical || []).join(", ") || "Ninguna"}\n` +
            `☠️ Raid: ${(ac.actions.raid || []).join(", ") || "Ninguna"}`
        )
        .setFooter({ text: "DRAGONS | AI Security" });

    const components = [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("aicc_toggle_detection").setLabel("🧠 Detección").setStyle(ac.intelligentDetection ? ButtonStyle.Success : ButtonStyle.Danger),
            new ButtonBuilder().setCustomId("aicc_toggle_autoresponse").setLabel("🤖 Auto-Respuesta").setStyle(ac.autoResponse ? ButtonStyle.Success : ButtonStyle.Danger),
            new ButtonBuilder().setCustomId("aicc_toggle_reputation").setLabel("🧬 Reputación").setStyle(ac.reputationEnabled ? ButtonStyle.Success : ButtonStyle.Danger),
            new ButtonBuilder().setCustomId("aicc_toggle_antiraid").setLabel("🕵️ Anti-Raid").setStyle(ac.advancedAntiRaid ? ButtonStyle.Success : ButtonStyle.Danger),
            new ButtonBuilder().setCustomId("aicc_toggle_incidents").setLabel("🧾 Incidentes").setStyle(ac.incidentRegistry ? ButtonStyle.Success : ButtonStyle.Danger)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("aicc_toggle_recovery").setLabel("🔄 Recuperación").setStyle(ac.autoRecovery ? ButtonStyle.Success : ButtonStyle.Danger),
            new ButtonBuilder().setCustomId("aicc_toggle_simulation").setLabel("🧪 Simulación").setStyle(ac.simulationMode ? ButtonStyle.Success : ButtonStyle.Danger),
            new ButtonBuilder().setCustomId("aicc_cfg_modal").setLabel("⚙️ Configurar umbrales").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId("aicc_cfg_actions").setLabel("🤖 Configurar acciones").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId("aicc_cfg_exemptions").setLabel("👤 Exenciones").setStyle(ButtonStyle.Primary)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("aicc_main").setLabel("⬅️ Volver").setStyle(ButtonStyle.Secondary)
        )
    ];

    return { embeds: [embed], components };
}

function getDashboardView(gc) {
    ensureAIControlConfig(gc);
    const ac = gc.aiControl;
    const stats = ac.stats || {};
    const topUsers = aiDetectionSystem.getTopRiskUsers(gc, 5);
    const recentEvents = aiDetectionSystem.getRecentEvents(gc, 5);
    const dailyStats = incidentSystem.getDailyStats(gc, 7);
    const typeBreakdown = incidentSystem.getTypeBreakdown(gc, 30);

    const riskScore = getSystemRiskScore(gc);
    const riskEmoji = getSystemRiskEmoji(riskScore);

    const topUsersStr = topUsers.length
        ? topUsers.map(u => `<@${u.userId}> — ${u.score}/100`).join("\n")
        : "Ninguno";

    const eventsStr = recentEvents.length
        ? recentEvents.slice(0, 5).map(e => `• ${e.type} — ${e.userName || e.userId || "?"} (${e.timestamp ? `<t:${Math.floor(e.timestamp / 1000)}:R>` : "?"})`).join("\n")
        : "Sin eventos recientes";

    const topTypes = Object.entries(typeBreakdown)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `• ${k}: **${v}**`)
        .join("\n") || "Ninguno";

    const embed = new EmbedBuilder()
        .setColor(riskScore >= 81 ? "#ED4245" : riskScore >= 61 ? "#F47B67" : riskScore >= 31 ? "#FEE75C" : "#57F287")
        .setTitle("📊 DASHBOARD AVANZADO")
        .setDescription(
            `🧠 **AI SECURITY**\n` +
            `${riskEmoji} **Estado:** ${ac.enabled ? "ACTIVO" : "DESACTIVADO"}\n\n` +
            `**Riesgo actual:** ${riskEmoji} ${riskScore}/100\n\n` +
            `**Incidentes:**\n` +
            `> Hoy: **${stats.incidentsToday || 0}** · Semana: **${stats.incidentsWeek || 0}**\n` +
            `> Mes: **${stats.incidentsMonth || 0}**\n\n` +
            `**Top Usuarios en Riesgo:**\n${topUsersStr}\n\n` +
            `**Eventos Recientes:**\n${eventsStr}\n\n` +
            `**Amenazas más frecuentes:**\n${topTypes}\n\n` +
            `📈 **Estadísticas:**\n` +
            `> Raids: **${stats.raidsDetected || 0}** · Spam: **${stats.spamBlocked || 0}**\n` +
            `> Links: **${stats.linksBlocked || 0}** · Menciones: **${stats.mentionsBlocked || 0}**\n` +
            `> Cuarentenas: **${stats.quarantines || 0}** · Auto: **${stats.autoActions || 0}**`
        )
        .setFooter({ text: "DRAGONS | AI Security" })
        .setTimestamp();

    return {
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("aicc_dashboard").setLabel("🔄 Actualizar").setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId("aicc_main").setLabel("⬅️ Volver").setStyle(ButtonStyle.Secondary)
            )
        ]
    };
}

function getIncidentsView(gc, page = 0, filterType = null, filterStatus = null) {
    ensureAIControlConfig(gc);
    const perPage = 5;
    let incidents = incidentSystem.getIncidents(gc);
    if (filterType) incidents = incidents.filter(i => i.type === filterType);
    if (filterStatus) incidents = incidents.filter(i => i.status === filterStatus);
    const totalPages = Math.max(1, Math.ceil(incidents.length / perPage));
    const pageIncidents = incidents.slice(page * perPage, (page + 1) * perPage);

    const lines = pageIncidents.map(i => {
        const riskE = aiDetectionSystem.getRiskEmoji(
            i.riskScore >= 81 ? "critical" : i.riskScore >= 61 ? "high" : i.riskScore >= 31 ? "medium" : "low"
        );
        return `${riskE} **${i.id}** — ${i.type} — ${i.userName || i.userId || "?"} — ${incidentSystem.STATUS_LABELS[i.status] || i.status}`;
    });

    const embed = new EmbedBuilder()
        .setColor(PANEL_COLOR)
        .setTitle("🧾 INCIDENTES")
        .setDescription(
            lines.length ? lines.join("\n\n") : "Sin incidentes para mostrar."
        )
        .setFooter({ text: `Página ${page + 1}/${totalPages} • ${incidents.length} total` })
        .setTimestamp();

    const components = [
        new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId("aicc_incidents_filter_type")
                .setPlaceholder("📋 Filtrar por tipo")
                .addOptions([
                    new StringSelectMenuOptionBuilder().setLabel("Todos").setValue("all"),
                    ...incidentSystem.INCIDENT_TYPES.map(t =>
                        new StringSelectMenuOptionBuilder().setLabel(t).setValue(t)
                    )
                ])
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`aicc_incidents_page_prev_${page}_${filterType || "all"}`).setLabel("⬅️ Anterior").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
            new ButtonBuilder().setCustomId(`aicc_incidents_page_next_${page}_${filterType || "all"}`).setLabel("Siguiente ➡️").setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
            new ButtonBuilder().setCustomId("aicc_incidents_clear").setLabel("🔄 Limpiar filtro").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("aicc_main").setLabel("⬅️ Volver").setStyle(ButtonStyle.Secondary)
        )
    ];

    return { embeds: [embed], components };
}

function getIncidentDetailView(gc, incidentId) {
    ensureAIControlConfig(gc);
    const incident = incidentSystem.getIncidentById(gc, incidentId);
    if (!incident) {
        return {
            embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("❌ Incidente no encontrado").setDescription(`No existe el incidente \`${incidentId}\`.`)],
            components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("aicc_incidents").setLabel("⬅️ Volver").setStyle(ButtonStyle.Secondary))]
        };
    }
    const embed = incidentSystem.formatIncidentEmbed(incident);

    const components = [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`aicc_incident_resolve_${incident.id}`).setLabel("✅ Resolver").setStyle(ButtonStyle.Success).setDisabled(incident.status === incidentSystem.STATUS.RESOLVED),
            new ButtonBuilder().setCustomId(`aicc_incident_fp_${incident.id}`).setLabel("⚪ Falso positivo").setStyle(ButtonStyle.Primary).setDisabled(incident.status === incidentSystem.STATUS.FALSE_POSITIVE),
            new ButtonBuilder().setCustomId(`aicc_incident_review_${incident.id}`).setLabel("🟡 En revisión").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("aicc_incidents").setLabel("⬅️ Volver").setStyle(ButtonStyle.Secondary)
        )
    ];

    return { embeds: [embed], components };
}

function getReputationView(gc) {
    ensureAIControlConfig(gc);
    const topTrusted = reputationSystem.getTopTrusted(gc, 5);
    const topSuspicious = reputationSystem.getTopSuspicious(gc, 5);

    const trustedStr = topTrusted.length
        ? topTrusted.map(u => {
            const cat = reputationSystem.getCategory(u.score);
            return `${cat.label} <@${u.userId}> — **${u.score}/100**`;
        }).join("\n")
        : "Ninguno registrado";

    const suspiciousStr = topSuspicious.length
        ? topSuspicious.map(u => {
            const cat = reputationSystem.getCategory(u.score);
            return `${cat.label} <@${u.userId}> — **${u.score}/100**`;
        }).join("\n")
        : "Ninguno registrado";

    const embed = new EmbedBuilder()
        .setColor(PANEL_COLOR)
        .setTitle("🧬 SISTEMA DE REPUTACIÓN")
        .setDescription(
            `**🏅 Más confiables:**\n${trustedStr}\n\n` +
            `**⚠️ Mayor riesgo:**\n${suspiciousStr}\n\n` +
            `*El Trust Score usa múltiples factores con decaimiento temporal.*\n` +
            `*La información sensible no se muestra públicamente.*`
        )
        .setFooter({ text: "DRAGONS | AI Security" })
        .setTimestamp();

    return {
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("aicc_reputation").setLabel("🔄 Actualizar").setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId("aicc_main").setLabel("⬅️ Volver").setStyle(ButtonStyle.Secondary)
            )
        ]
    };
}

function getAntiRaidView(gc) {
    ensureAIControlConfig(gc);
    const ac = gc.aiControl;
    const stats = ac.stats || {};
    const topRisk = aiDetectionSystem.getTopRiskUsers(gc, 5);

    const embed = new EmbedBuilder()
        .setColor(PANEL_COLOR)
        .setTitle("🕵️ ANTI-RAID AVANZADO")
        .setDescription(
            `**Estado:** ${ac.advancedAntiRaid ? "🟢 ACTIVO" : "🔴 DESACTIVADO"}\n\n` +
            `**Configuración actual:**\n` +
            `> Umbral básico: ${gc.security?.raidThreshold || 5} / ${(gc.security?.raidWindowMs || 10000) / 1000}s\n` +
            `> Detección avanzada: ${ac.advancedAntiRaid ? "Sí" : "No"}\n\n` +
            `**Raids detectados:** ${stats.raidsDetected || 0}\n\n` +
            `**Usuarios de mayor riesgo:**\n` +
            (topRisk.length ? topRisk.map(u => `• <@${u.userId}> — ${u.score}/100`).join("\n") : "Ninguno")
        )
        .setFooter({ text: "DRAGONS | AI Security" })
        .setTimestamp();

    return {
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("aicc_toggle_antiraid").setLabel(ac.advancedAntiRaid ? "🔴 Desactivar" : "🟢 Activar").setStyle(ac.advancedAntiRaid ? ButtonStyle.Danger : ButtonStyle.Success),
                new ButtonBuilder().setCustomId("aicc_main").setLabel("⬅️ Volver").setStyle(ButtonStyle.Secondary)
            )
        ]
    };
}

function getRecoveryView(gc) {
    ensureAIControlConfig(gc);
    const rec = gc.aiControl.recovery || {};
    const latest = recoverySystem.getLatestSnapshot(gc);
    const snapshots = recoverySystem.getSnapshots(gc);

    const embed = new EmbedBuilder()
        .setColor(PANEL_COLOR)
        .setTitle("🔄 RECUPERACIÓN")
        .setDescription(
            `**Estado:** ${rec.enabled ? "🟢 ACTIVO" : "🔴 DESACTIVADO"}\n` +
            `**Snapshot automático:** ${rec.autoSnapshot ? "🟢 ON" : "🔴 OFF"}\n\n` +
            (latest
                ? `**Último snapshot:** #${latest.id}\n` +
                  `**Creado:** <t:${Math.floor(latest.timestamp / 1000)}:F>\n` +
                  `**Razón:** ${latest.reason}\n` +
                  `**Estado:** 🟢 Disponible\n` +
                  `**Canales:** ${latest.channels?.length || 0} · **Roles:** ${latest.roles?.length || 0}`
                : "Sin snapshots disponibles")
        )
        .setFooter({ text: "DRAGONS | AI Security" })
        .setTimestamp();

    const components = [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("aicc_recovery_snapshot").setLabel("📸 Crear snapshot").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId("aicc_recovery_toggle").setLabel(rec.autoSnapshot ? "🔴 Desactivar auto" : "🟢 Activar auto").setStyle(rec.autoSnapshot ? ButtonStyle.Danger : ButtonStyle.Success),
            new ButtonBuilder().setCustomId("aicc_main").setLabel("⬅️ Volver").setStyle(ButtonStyle.Secondary)
        )
    ];

    if (latest) {
        components.unshift(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`aicc_recovery_restore_full_${latest.id}`).setLabel("🔄 Restauración completa").setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`aicc_recovery_restore_channels_${latest.id}`).setLabel("🧩 Restaurar canales").setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`aicc_recovery_restore_roles_${latest.id}`).setLabel("🎭 Restaurar roles").setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`aicc_recovery_restore_permissions_${latest.id}`).setLabel("🔐 Restaurar permisos").setStyle(ButtonStyle.Secondary)
            )
        );
    }

    return { embeds: [embed], components };
}

function getSimulationView(gc) {
    ensureAIControlConfig(gc);

    const embed = new EmbedBuilder()
        .setColor(PANEL_COLOR)
        .setTitle("🧪 SECURITY TEST MODE")
        .setDescription(
            "Simula diferentes escenarios de ataque para verificar la configuración de seguridad.\n\n" +
            "**⚠️ La simulación NO realiza acciones destructivas reales.**\n\n" +
            "Selecciona un tipo de prueba:"
        )
        .setFooter({ text: "DRAGONS | AI Security" })
        .setTimestamp();

    const components = [
        new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId("aicc_simulate_select")
                .setPlaceholder("🧪 Seleccionar tipo de prueba")
                .addOptions(
                    securitySimulationSystem.SIMULATION_TYPES.map(t =>
                        new StringSelectMenuOptionBuilder().setLabel(t.label).setDescription(t.desc).setValue(t.id)
                    )
                )
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("aicc_main").setLabel("⬅️ Volver").setStyle(ButtonStyle.Secondary)
        )
    ];

    return { embeds: [embed], components };
}

function formatSimulationView(gc, results) {
    ensureAIControlConfig(gc);
    const formatted = securitySimulationSystem.formatSimulationResults(results);

    const embed = new EmbedBuilder()
        .setColor(results.score >= 90 ? "#57F287" : results.score >= 70 ? "#FEE75C" : "#ED4245")
        .setTitle(formatted.title)
        .setDescription(
            formatted.lines.join("\n") +
            `\n\n**Puntuación:** ${formatted.score}\n` +
            `**Recomendaciones:** ${formatted.recommendations}`
        )
        .setFooter({ text: "DRAGONS | AI Security" })
        .setTimestamp();

    return {
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("aicc_simulation").setLabel("🔄 Volver a simular").setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId("aicc_main").setLabel("⬅️ Volver").setStyle(ButtonStyle.Secondary)
            )
        ]
    };
}

function aiControlModal(gc) {
    const ac = gc.aiControl || {};
    const t = ac.thresholds || {};
    const m = (customId, title, inputs) => {
        const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
        inputs.forEach(field => {
            modal.addComponents(new ActionRowBuilder().addComponents(field));
        });
        return modal;
    };
    const inp = (cid, label, val) => new TextInputBuilder().setCustomId(cid).setLabel(label).setStyle(TextInputStyle.Short).setRequired(true).setValue(String(val ?? ""));

    return m("aicc_modal_thresholds", "⚙️ Umbrales de riesgo", [
        inp("thrLow", "Riesgo bajo (0-X)", t.low || 30),
        inp("thrMedium", "Riesgo medio (X-Y)", t.medium || 60),
        inp("thrHigh", "Riesgo alto (Y-Z)", t.high || 80)
    ]);
}

function aiControlActionsModal(gc) {
    const ac = gc.aiControl || {};
    const a = ac.actions || {};
    const modal = new ModalBuilder().setCustomId("aicc_modal_actions").setTitle("🤖 Configurar acciones");
    const inp = (cid, label, val) => new TextInputBuilder().setCustomId(cid).setLabel(label).setStyle(TextInputStyle.Short).setRequired(true).setValue(String(val || ""));
    modal.addComponents(
        new ActionRowBuilder().addComponents(inp("actLow", "Bajo (separar por coma)", (a.low || ["log"]).join(", "))),
        new ActionRowBuilder().addComponents(inp("actMedium", "Medio (separar por coma)", (a.medium || ["warn", "log"]).join(", "))),
        new ActionRowBuilder().addComponents(inp("actHigh", "Alto (separar por coma)", (a.high || ["timeout", "alert", "log"]).join(", "))),
        new ActionRowBuilder().addComponents(inp("actCritical", "Crítico (separar por coma)", (a.critical || ["quarantine", "alert", "log"]).join(", "))),
        new ActionRowBuilder().addComponents(inp("actRaid", "Raid (separar por coma)", (a.raid || ["lockdown", "quarantine", "alert", "log"]).join(", ")))
    );
    return modal;
}

function aiControlExemptionsModal(gc) {
    const exc = gc.aiControl?.exemptions || {};
    const modal = new ModalBuilder().setCustomId("aicc_modal_exemptions").setTitle("👤 Exenciones");
    const inp = (cid, label, val) => new TextInputBuilder().setCustomId(cid).setLabel(label).setStyle(TextInputStyle.Short).setRequired(false).setValue(String(val || ""));
    modal.addComponents(
        new ActionRowBuilder().addComponents(inp("excRoles", "Roles exentos (IDs)", (exc.roles || []).join(", "))),
        new ActionRowBuilder().addComponents(inp("excUsers", "Usuarios exentos (IDs)", (exc.users || []).join(", "))),
        new ActionRowBuilder().addComponents(inp("excChannels", "Canales exentos (IDs)", (exc.channels || []).join(", ")))
    );
    return modal;
}

async function handleButton(interaction, config, saveConfig) {
    const guild = interaction.guild;
    const gc = ensureAIControlConfig(require("./panelSystem").getGuildConfig(config, guild.id));
    const id = interaction.customId;

    if (id === "aicc_main") {
        await interaction.deferUpdate().catch(() => {});
        await interaction.message.edit(getMainView(gc)).catch(() => {});
        return;
    }

    if (id === "aicc_config") {
        await interaction.deferUpdate().catch(() => {});
        await interaction.message.edit(getConfigView(gc)).catch(() => {});
        return;
    }

    if (id === "aicc_analyze") {
        await interaction.deferUpdate().catch(() => {});
        const topRisk = aiDetectionSystem.getTopRiskUsers(gc, 10);
        const events = aiDetectionSystem.getRecentEvents(gc, 10);
        const stats = aiDetectionSystem.getSystemStats(gc);
        const riskScore = getSystemRiskScore(gc);

        const embed = new EmbedBuilder()
            .setColor(PANEL_COLOR)
            .setTitle("🔍 ANÁLISIS DEL SISTEMA")
            .setDescription(
                `**Estadísticas de detección:**\n` +
                `> Usuarios rastreados: **${stats.trackedUsers}**\n` +
                `> Riesgo alto: **${stats.highRisk}**\n` +
                `> Riesgo medio: **${stats.mediumRisk}**\n` +
                `> Eventos recientes: **${stats.recentEvents}**\n\n` +
                `**Top usuarios en riesgo:**\n` +
                (topRisk.length ? topRisk.map(u => `• <@${u.userId}> — ${u.score}/100`).join("\n") : "Ninguno") +
                `\n\n**Eventos recientes:**\n` +
                (events.length ? events.slice(0, 5).map(e => `• ${e.type} — ${e.userName || "?"} (${e.riskScore || 0})`).join("\n") : "Sin eventos")
            )
            .setFooter({ text: "DRAGONS | AI Security" })
            .setTimestamp();

        await interaction.message.edit({
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("aicc_main").setLabel("⬅️ Volver").setStyle(ButtonStyle.Secondary)
            )]
        }).catch(() => {});
        return;
    }

    if (id === "aicc_dashboard") {
        await interaction.deferUpdate().catch(() => {});
        await interaction.message.edit(getDashboardView(gc)).catch(() => {});
        return;
    }

    if (id === "aicc_reputation") {
        await interaction.deferUpdate().catch(() => {});
        await interaction.message.edit(getReputationView(gc)).catch(() => {});
        return;
    }

    if (id === "aicc_antiraid") {
        await interaction.deferUpdate().catch(() => {});
        await interaction.message.edit(getAntiRaidView(gc)).catch(() => {});
        return;
    }

    if (id === "aicc_incidents") {
        await interaction.deferUpdate().catch(() => {});
        await interaction.message.edit(getIncidentsView(gc)).catch(() => {});
        return;
    }

    if (id === "aicc_recovery") {
        await interaction.deferUpdate().catch(() => {});
        await interaction.message.edit(getRecoveryView(gc)).catch(() => {});
        return;
    }

    if (id === "aicc_simulation") {
        await interaction.deferUpdate().catch(() => {});
        await interaction.message.edit(getSimulationView(gc)).catch(() => {});
        return;
    }

    if (id.startsWith("aicc_toggle_")) {
        await interaction.deferUpdate().catch(() => {});
        const key = id.replace("aicc_toggle_", "");
        const map = {
            detection: "intelligentDetection",
            autoresponse: "autoResponse",
            reputation: "reputationEnabled",
            antiraid: "advancedAntiRaid",
            incidents: "incidentRegistry",
            recovery: "autoRecovery",
            simulation: "simulationMode"
        };
        const prop = map[key];
        if (prop) gc.aiControl[prop] = !gc.aiControl[prop];
        saveConfig();
        await interaction.message.edit(getConfigView(gc)).catch(() => {});
        return;
    }

    if (id === "aicc_cfg_modal") {
        await interaction.showModal(aiControlModal(gc)).catch(() => {});
        return;
    }

    if (id === "aicc_cfg_actions") {
        await interaction.showModal(aiControlActionsModal(gc)).catch(() => {});
        return;
    }

    if (id === "aicc_cfg_exemptions") {
        await interaction.showModal(aiControlExemptionsModal(gc)).catch(() => {});
        return;
    }

    if (id.startsWith("aicc_incidents_page_prev_")) {
        await interaction.deferUpdate().catch(() => {});
        const parts = id.replace("aicc_incidents_page_prev_", "").split("_");
        const page = Math.max(0, parseInt(parts[0], 10) - 1);
        const ft = parts[1] === "all" ? null : parts[1];
        await interaction.message.edit(getIncidentsView(gc, page, ft)).catch(() => {});
        return;
    }

    if (id.startsWith("aicc_incidents_page_next_")) {
        await interaction.deferUpdate().catch(() => {});
        const parts = id.replace("aicc_incidents_page_next_", "").split("_");
        const page = parseInt(parts[0], 10) + 1;
        const ft = parts[1] === "all" ? null : parts[1];
        await interaction.message.edit(getIncidentsView(gc, page, ft)).catch(() => {});
        return;
    }

    if (id === "aicc_incidents_clear") {
        await interaction.deferUpdate().catch(() => {});
        await interaction.message.edit(getIncidentsView(gc, 0)).catch(() => {});
        return;
    }

    if (id.startsWith("aicc_incident_detail_")) {
        await interaction.deferUpdate().catch(() => {});
        const incId = id.replace("aicc_incident_detail_", "");
        await interaction.message.edit(getIncidentDetailView(gc, incId)).catch(() => {});
        return;
    }

    if (id.startsWith("aicc_incident_resolve_")) {
        await interaction.deferUpdate().catch(() => {});
        const incId = id.replace("aicc_incident_resolve_", "");
        incidentSystem.updateIncidentStatus(gc, incId, incidentSystem.STATUS.RESOLVED, interaction.user?.tag);
        saveConfig();
        await interaction.message.edit(getIncidentDetailView(gc, incId)).catch(() => {});
        return;
    }

    if (id.startsWith("aicc_incident_fp_")) {
        await interaction.deferUpdate().catch(() => {});
        const incId = id.replace("aicc_incident_fp_", "");
        incidentSystem.updateIncidentStatus(gc, incId, incidentSystem.STATUS.FALSE_POSITIVE, interaction.user?.tag);
        saveConfig();
        await interaction.message.edit(getIncidentDetailView(gc, incId)).catch(() => {});
        return;
    }

    if (id.startsWith("aicc_incident_review_")) {
        await interaction.deferUpdate().catch(() => {});
        const incId = id.replace("aicc_incident_review_", "");
        incidentSystem.updateIncidentStatus(gc, incId, incidentSystem.STATUS.REVIEW, interaction.user?.tag);
        saveConfig();
        await interaction.message.edit(getIncidentDetailView(gc, incId)).catch(() => {});
        return;
    }

    if (id === "aicc_recovery_snapshot") {
        await interaction.deferUpdate().catch(() => {});
        const snap = await recoverySystem.createSnapshot(guild, gc, "Snapshot manual desde panel", interaction.user?.tag);
        saveConfig();
        await interaction.message.edit(getRecoveryView(gc)).catch(() => {});
        return;
    }

    if (id === "aicc_recovery_toggle") {
        await interaction.deferUpdate().catch(() => {});
        gc.aiControl.recovery.autoSnapshot = !gc.aiControl.recovery.autoSnapshot;
        saveConfig();
        await interaction.message.edit(getRecoveryView(gc)).catch(() => {});
        return;
    }

    if (id.startsWith("aicc_recovery_restore_")) {
        await interaction.deferUpdate().catch(() => {});
        const parts = id.replace("aicc_recovery_restore_", "").split("_");
        const mode = parts[0];
        const snapId = parseInt(parts[1], 10);
        const result = await recoverySystem.performRestore(guild, gc, snapId, mode);
        saveConfig();
        const resultEmbed = new EmbedBuilder()
            .setColor(result.ok ? "#57F287" : "#ED4245")
            .setTitle(result.ok ? "✅ Restauración completada" : "❌ Error en restauración")
            .setDescription(result.ok ? result.results.details.join("\n") : result.error)
            .setFooter({ text: "DRAGONS | AI Security" });
        await interaction.message.edit({
            embeds: [resultEmbed],
            components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("aicc_recovery").setLabel("⬅️ Volver").setStyle(ButtonStyle.Secondary)
            )]
        }).catch(() => {});
        return;
    }

    if (id.startsWith("aicc_incidents_type_")) {
        await interaction.deferUpdate().catch(() => {});
        const ft = id.replace("aicc_incidents_type_", "");
        await interaction.message.edit(getIncidentsView(gc, 0, ft === "all" ? null : ft)).catch(() => {});
        return;
    }
}

async function handleSelect(interaction, config, saveConfig) {
    const guild = interaction.guild;
    const gc = ensureAIControlConfig(require("./panelSystem").getGuildConfig(config, guild.id));
    const id = interaction.customId;
    const value = interaction.values[0];

    if (id === "aicc_incidents_filter_type") {
        await interaction.deferUpdate().catch(() => {});
        const ft = value === "all" ? null : value;
        await interaction.message.edit(getIncidentsView(gc, 0, ft)).catch(() => {});
        return;
    }

    if (id === "aicc_simulate_select") {
        await interaction.deferUpdate().catch(() => {});
        const results = securitySimulationSystem.runSimulation(gc, value);
        saveConfig();
        await interaction.message.edit(formatSimulationView(gc, results)).catch(() => {});
        return;
    }
}

async function handleModal(interaction, config, saveConfig) {
    const guild = interaction.guild;
    const gc = ensureAIControlConfig(require("./panelSystem").getGuildConfig(config, guild.id));
    const id = interaction.customId;
    const v = (cid) => interaction.fields.getTextInputValue(cid)?.trim();

    if (id === "aicc_modal_thresholds") {
        await interaction.deferUpdate().catch(() => {});
        const low = parseInt(v("thrLow"), 10);
        const med = parseInt(v("thrMedium"), 10);
        const high = parseInt(v("thrHigh"), 10);
        if (!isNaN(low) && low > 0) gc.aiControl.thresholds.low = low;
        if (!isNaN(med) && med > low) gc.aiControl.thresholds.medium = med;
        if (!isNaN(high) && high > med) gc.aiControl.thresholds.high = high;
        saveConfig();
        await interaction.message.edit(getConfigView(gc)).catch(() => {});
        return;
    }

    if (id === "aicc_modal_actions") {
        await interaction.deferUpdate().catch(() => {});
        const parse = (raw) => raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
        const low = parse(v("actLow"));
        const med = parse(v("actMedium"));
        const high = parse(v("actHigh"));
        const crit = parse(v("actCritical"));
        const raid = parse(v("actRaid"));
        if (low.length) gc.aiControl.actions.low = low;
        if (med.length) gc.aiControl.actions.medium = med;
        if (high.length) gc.aiControl.actions.high = high;
        if (crit.length) gc.aiControl.actions.critical = crit;
        if (raid.length) gc.aiControl.actions.raid = raid;
        saveConfig();
        await interaction.message.edit(getConfigView(gc)).catch(() => {});
        return;
    }

    if (id === "aicc_modal_exemptions") {
        await interaction.deferUpdate().catch(() => {});
        const parseIds = (raw) => raw.split(",").map(s => s.trim().replace(/[<@&>]/g, "")).filter(x => /^\d{15,20}$/.test(x));
        gc.aiControl.exemptions.roles = parseIds(v("excRoles"));
        gc.aiControl.exemptions.users = parseIds(v("excUsers"));
        gc.aiControl.exemptions.channels = parseIds(v("excChannels"));
        saveConfig();
        await interaction.message.edit(getConfigView(gc)).catch(() => {});
        return;
    }
}

function handleAIControlInteraction(interaction, config, saveConfig) {
    const id = interaction.customId;
    if (!id?.startsWith("aicc_")) return false;

    if (interaction.isButton()) {
        handleButton(interaction, config, saveConfig).catch(err => {
            console.error(`[AI:OUT] Error en handleButton aicc: ${err.message}`);
        });
        return true;
    }

    if (interaction.isStringSelectMenu()) {
        handleSelect(interaction, config, saveConfig).catch(err => {
            console.error(`[AI:OUT] Error en handleSelect aicc: ${err.message}`);
        });
        return true;
    }

    if (interaction.isModalSubmit()) {
        handleModal(interaction, config, saveConfig).catch(err => {
            console.error(`[AI:OUT] Error en handleModal aicc: ${err.message}`);
        });
        return true;
    }

    return false;
}

function setupAIControl(client, config, saveConfig) {
    client.on("guildMemberAdd", async (member) => {
        try {
            if (member.user.bot) return;
            const gc = require("./panelSystem").getGuildConfig(config, member.guild.id);
            ensureAIControlConfig(gc);
            if (!gc.aiControl.enabled) return;
            if (!gc.aiControl.reputationEnabled) return;
            reputationSystem.initTrustScore(gc, member.id, member);
            saveConfig();
        } catch {}
    });

    client.on("guildMemberRemove", async (member) => {
        try {
            if (member.user.bot) return;
            const gc = require("./panelSystem").getGuildConfig(config, member.guild.id);
            ensureAIControlConfig(gc);
            if (!gc.aiControl.enabled) return;
        } catch {}
    });
}

module.exports = {
    ensureAIControlConfig,
    getMainView,
    getConfigView,
    getDashboardView,
    getIncidentsView,
    getIncidentDetailView,
    getReputationView,
    getAntiRaidView,
    getRecoveryView,
    getSimulationView,
    formatSimulationView,
    handleAIControlInteraction,
    setupAIControl,
    getSystemRiskScore,
    getSystemRiskEmoji
};
