const {
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ModalBuilder, TextInputBuilder, TextInputStyle,
    ChannelType, PermissionsBitField, MessageFlags
} = require("discord.js");

const STATUSES = {
    pending: "🟡 Pendiente",
    reviewing: "🔵 En revisión",
    interview: "🟣 Entrevista",
    accepted: "🟢 Aceptada",
    rejected: "🔴 Rechazada",
    cancelled: "⚫ Cancelada"
};

const DEFAULTS = {
    enabled: false,
    publicChannel: null,
    reviewChannel: null,
    reviewerRoles: [],
    autoAssignRoles: {},
    cooldownMs: 300000,
    maxPerUser: 3,
    maxActive: 1,
    deleteInterviewChannels: true,
    useAI: true,
    interviewsEnabled: true,
    vacancies: [],
    applications: [],
    nextId: 1
};

const activeInterviews = new Map();

function ensureRecruitmentConfig(gc) {
    if (!gc.recruitment) gc.recruitment = {};
    const r = gc.recruitment;
    for (const key of Object.keys(DEFAULTS)) {
        if (r[key] === undefined) r[key] = DEFAULTS[key];
    }
    if (!Array.isArray(r.vacancies)) r.vacancies = [];
    if (!Array.isArray(r.applications)) r.applications = [];
    if (typeof r.nextId !== "number") r.nextId = 1;
    if (!r.autoAssignRoles || typeof r.autoAssignRoles !== "object") r.autoAssignRoles = {};
    return r;
}

function generateId(gc) {
    const id = gc.recruitment.nextId || 1;
    gc.recruitment.nextId = id + 1;
    return id;
}

function getVacancy(gc, vacancyId) {
    return (gc.recruitment.vacancies || []).find(v => v.id === vacancyId);
}

function getApplication(gc, appId) {
    return (gc.recruitment.applications || []).find(a => a.id === appId);
}

function getApplicationsByUser(gc, userId) {
    return (gc.recruitment.applications || []).filter(a => a.userId === userId);
}

function getActiveApplicationsByUser(gc, userId) {
    return getApplicationsByUser(gc, userId).filter(a =>
        ["pending", "reviewing", "interview"].includes(a.status)
    );
}

function canApply(gc, userId, vacancyId) {
    const r = gc.recruitment;
    const vacancy = getVacancy(gc, vacancyId);
    if (!vacancy || !vacancy.active) return { ok: false, reason: "Esta vacante no está disponible." };

    const active = getActiveApplicationsByUser(gc, userId);
    if (active.length >= (r.maxActive || DEFAULTS.maxActive)) {
        return { ok: false, reason: "Ya tienes el máximo de postulaciones activas." };
    }

    const hasPending = active.some(a => a.vacancyId === vacancyId);
    if (hasPending) return { ok: false, reason: "Ya tienes una postulación pendiente para este puesto." };

    const total = getApplicationsByUser(gc, userId);
    if (total.length >= (r.maxPerUser || DEFAULTS.maxPerUser)) {
        return { ok: false, reason: "Has alcanzado el límite máximo de postulaciones." };
    }

    const lastByUser = total.filter(a => a.vacancyId === vacancyId)
        .sort((a, b) => b.timestamp - a.timestamp)[0];
    if (lastByUser) {
        const cooldown = r.cooldownMs || DEFAULTS.cooldownMs;
        if (Date.now() - lastByUser.timestamp < cooldown) {
            const remaining = Math.ceil((cooldown - (Date.now() - lastByUser.timestamp)) / 60000);
            return { ok: false, reason: `Debes esperar ${remaining} minutos antes de volver a postularte a este puesto.` };
        }
    }

    return { ok: true };
}

function addHistory(application, action, moderator) {
    if (!application.history) application.history = [];
    application.history.push({
        action,
        moderator: moderator || "Sistema",
        timestamp: Date.now()
    });
}

function formatTimestamp(ts) {
    return `<t:${Math.floor(ts / 1000)}:R>`;
}

function buildPublicPanel(gc) {
    const r = gc.recruitment;
    const activeVacancies = (r.vacancies || []).filter(v => v.active);

    const embed = new EmbedBuilder()
        .setColor("#8A2BE2")
        .setTitle("🐉 DRAGONS | RECLUTAMIENTO")
        .setDescription(
            "¿Quieres formar parte del equipo oficial de DRAGONS?\n\n" +
            "Buscamos personas responsables, activas y comprometidas con la comunidad.\n\n" +
            (activeVacancies.length > 0
                ? "**📌 Vacantes disponibles:**\n\n" +
                  activeVacancies.map(v => `${v.emoji || "📋"} **${v.name}**`).join("\n")
                : ">No hay vacantes disponibles en este momento.")
        )
        .setFooter({ text: "DRAGONS | Reclutamiento" })
        .setTimestamp();

    const rows = [];
    if (activeVacancies.length > 0) {
        const options = activeVacancies.slice(0, 25).map(v => ({
            label: `${v.emoji || "📋"} ${v.name}`.substring(0, 100),
            description: (v.description || "Ver detalles").substring(0, 100),
            value: v.id,
            emoji: v.emoji || undefined
        }));

        rows.push(new ActionRowBuilder().addComponents(
            new (require("discord.js")).StringSelectMenuBuilder()
                .setCustomId("recruitment_view_vacancy")
                .setPlaceholder("📝 Selecciona una vacante para ver detalles")
                .addOptions(options)
        ));
    }

    return { embeds: [embed], components: rows };
}

function buildVacancyInfo(vacancy) {
    const embed = new EmbedBuilder()
        .setColor("#8A2BE2")
        .setTitle(`${vacancy.emoji || "📋"} ${vacancy.name}`)
        .setDescription(vacancy.description || "Sin descripción.")
        .addFields(
            vacancy.requirements ? { name: "📋 Requisitos", value: vacancy.requirements, inline: false } : null,
            vacancy.functions ? { name: "⚡ Funciones", value: vacancy.functions, inline: false } : null
        )
        .addFields({
            name: "📝 Proceso",
            value: "📝 Solicitud\n↓\n🔎 Revisión\n↓\n💬 Entrevista\n↓\n✅ Decisión",
            inline: true
        })
        .setFooter({ text: "DRAGONS | Reclutamiento" })
        .setTimestamp();

    const questions = (vacancy.questions || []).filter(q => q.active !== false);
    if (questions.length > 0) {
        embed.addFields({
            name: "📝 Formulario",
            value: `${questions.length} pregunta(s) obligatoria(s)`,
            inline: true
        });
    }

    return {
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`recruitment_apply_${vacancy.id}`)
                    .setLabel("📝 Postularme")
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId("recruitment_back_to_panel")
                    .setLabel("Volver")
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji("⬅️")
            )
        ]
    };
}

function buildApplicationForm(vacancy) {
    const questions = (vacancy.questions || []).filter(q => q.active !== false).slice(0, 5);
    if (questions.length === 0) return null;

    const m = new ModalBuilder()
        .setCustomId(`recruitment_modal_${vacancy.id}`)
        .setTitle(`📝 ${vacancy.name} - Postulación`);

    const row = (field) => new ActionRowBuilder().addComponents(field);

    m.addComponents(...questions.map(q =>
        row(new TextInputBuilder()
            .setCustomId(`q_${q.id}`)
            .setLabel(q.text.substring(0, 100))
            .setStyle(q.long ? TextInputStyle.Paragraph : TextInputStyle.Short)
            .setRequired(q.required !== false)
            .setPlaceholder(q.placeholder || "")
            .setMaxLength(1000))
    ));

    return m;
}

function buildStaffReview(application, gc) {
    const vacancy = getVacancy(gc, application.vacancyId);
    const statusLabel = STATUSES[application.status] || application.status;

    const embed = new EmbedBuilder()
        .setColor("#8A2BE2")
        .setTitle(`📋 POSTULACIÓN #${String(application.id).padStart(4, "0")}`)
        .setDescription(
            `👤 **Usuario:** <@${application.userId}>\n` +
            `${vacancy?.emoji || "📋"} **Puesto:** ${vacancy?.name || "Desconocido"}\n` +
            `📅 **Enviada:** ${formatTimestamp(application.timestamp)}\n` +
            `${statusLabel}`
        )
        .setFooter({ text: `ID: ${application.id}` })
        .setTimestamp();

    const answers = application.answers || [];
    if (answers.length > 0) {
        const answerText = answers.map(a => {
            const question = (vacancy?.questions || []).find(q => q.id === a.questionId);
            const label = question?.text || a.questionId;
            return `**${label}:**\n${a.answer || "_Sin respuesta_"}`;
        }).join("\n\n");

        const chunks = [];
        let remaining = answerText;
        while (remaining.length > 0) {
            if (remaining.length <= 1024) {
                chunks.push(remaining);
                break;
            }
            let splitIdx = remaining.lastIndexOf("\n\n", 1024);
            if (splitIdx < 512) splitIdx = remaining.lastIndexOf("\n", 1024);
            if (splitIdx < 512) splitIdx = 1024;
            chunks.push(remaining.slice(0, splitIdx));
            remaining = remaining.slice(splitIdx).trimStart();
        }

        chunks.forEach((chunk, i) => {
            embed.addFields({
                name: i === 0 ? "📝 RESPUESTAS" : `\u200B`,
                value: chunk.substring(0, 1024),
                inline: false
            });
        });
    }

    const rows = [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`recruitment_review_${application.id}`)
                .setLabel("🔎 Revisar")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`recruitment_status_${application.id}_reviewing`)
                .setLabel("🔵 En revisión")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`recruitment_interview_${application.id}`)
                .setLabel("💬 Entrevista")
                .setStyle(ButtonStyle.Primary)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`recruitment_analyze_${application.id}`)
                .setLabel("🤖 Analizar")
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`recruitment_accept_${application.id}`)
                .setLabel("✅ Aceptar")
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`recruitment_reject_${application.id}`)
                .setLabel("❌ Rechazar")
                .setStyle(ButtonStyle.Danger)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`recruitment_history_${application.id}`)
                .setLabel("📋 Historial")
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`recruitment_cancel_${application.id}`)
                .setLabel("⚫ Cancelar")
                .setStyle(ButtonStyle.Danger)
        )
    ];

    return { embeds: [embed], components: rows };
}

async function sendToReviewChannel(client, gc, application) {
    const channel = gc.recruitment?.reviewChannel;
    if (!channel) return;
    try {
        const ch = await client.channels.fetch(channel);
        if (!ch) return;
        const view = buildStaffReview(application, gc);
        await ch.send(view).catch(() => {});
    } catch {}
}

async function sendNotification(client, userId, embed) {
    try {
        const user = await client.users.fetch(userId);
        if (user) await user.send({ embeds: [embed] }).catch(() => {});
    } catch {}
}

async function handleApplicationSubmit(interaction, config, saveConfig, client) {
    const guild = interaction.guild;
    const gc = config[guild.id];
    const r = ensureRecruitmentConfig(gc);
    const customId = interaction.customId;

    const vacancyMatch = customId.match(/^recruitment_modal_(.+)$/);
    if (!vacancyMatch) return false;

    const vacancyId = vacancyMatch[1];
    const vacancy = getVacancy(gc, vacancyId);
    if (!vacancy) {
        await interaction.reply({ content: "❌ Vacante no encontrada.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }

    const check = canApply(gc, interaction.user.id, vacancyId);
    if (!check.ok) {
        await interaction.reply({ content: `❌ ${check.reason}`, flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }

    const questions = (vacancy.questions || []).filter(q => q.active !== false);
    const answers = [];
    for (const q of questions.slice(0, 5)) {
        try {
            const answer = interaction.fields.getTextInputValue(`q_${q.id}`) || "";
            answers.push({ questionId: q.id, question: q.text, answer });
        } catch {}
    }

    const appId = generateId(gc);
    const application = {
        id: appId,
        userId: interaction.user.id,
        userName: interaction.user.tag,
        vacancyId,
        vacancyName: vacancy.name,
        status: "pending",
        answers,
        timestamp: Date.now(),
        history: [],
        interview: null,
        analysis: null
    };

    addHistory(application, "Postulación enviada", interaction.user.tag);
    r.applications.push(application);
    saveConfig();

    const confirmEmbed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle("✅ POSTULACIÓN ENVIADA")
        .setDescription(
            `Tu postulación ha sido enviada correctamente.\n\n` +
            `📋 **ID:** #${String(appId).padStart(4, "0")}\n` +
            `${vacancy.emoji || "📋"} **Puesto:** ${vacancy.name}\n` +
            `📅 **Fecha:** ${formatTimestamp(Date.now())}\n` +
            `🟡 **Estado:** Pendiente\n\n` +
            "Te notificaremos cuando haya novedades."
        )
        .setFooter({ text: "DRAGONS | Reclutamiento" });

    await interaction.reply({ embeds: [confirmEmbed], flags: MessageFlags.Ephemeral }).catch(() => {});

    await sendToReviewChannel(client, gc, application);

    return true;
}

async function handleReviewButton(interaction, config, saveConfig, client) {
    const id = interaction.customId;
    const guild = interaction.guild;
    const gc = config[guild.id];
    const r = ensureRecruitmentConfig(gc);

    if (!isReviewer(interaction.member, gc)) {
        await interaction.reply({ content: "❌ No tienes permiso para realizar esta acción.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }

    const acceptMatch = id.match(/^recruitment_accept_(\d+)$/);
    if (acceptMatch) {
        const app = getApplication(gc, parseInt(acceptMatch[1]));
        if (!app) { await interaction.reply({ content: "❌ Postulación no encontrada.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }

        const confirmEmbed = new EmbedBuilder()
            .setColor("#FEE75C")
            .setTitle("⚠️ Confirmar aceptación")
            .setDescription(`¿Aceptar la postulación #${String(app.id).padStart(4, "0")} de <@${app.userId}> para **${app.vacancyName}**?`);

        await interaction.reply({
            embeds: [confirmEmbed],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`recruitment_confirm_accept_${app.id}`).setLabel("✅ Confirmar").setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`recruitment_deny_action`).setLabel("❌ Cancelar").setStyle(ButtonStyle.Secondary)
                )
            ],
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
        return true;
    }

    const confirmAcceptMatch = id.match(/^recruitment_confirm_accept_(\d+)$/);
    if (confirmAcceptMatch) {
        const app = getApplication(gc, parseInt(confirmAcceptMatch[1]));
        if (!app) { await interaction.reply({ content: "❌ Postulación no encontrada.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }

        app.status = "accepted";
        addHistory(app, "Aceptada", interaction.user.tag);

        const assignRoleId = r.autoAssignRoles?.[app.vacancyId];
        if (assignRoleId) {
            try {
                const member = await guild.members.fetch(app.userId);
                if (member) await member.roles.add(assignRoleId, "Postulación aceptada").catch(() => {});
            } catch {}
        }

        saveConfig();

        const notifEmbed = new EmbedBuilder()
            .setColor("#57F287")
            .setTitle("✅ POSTULACIÓN ACEPTADA")
            .setDescription(
                `🎉 Felicidades <@${app.userId}>.\n\n` +
                `Has sido aceptado como:\n${getVacancy(gc, app.vacancyId)?.emoji || "📋"} **${app.vacancyName}**\n\n` +
                `Revisado por: <@${interaction.user.id}>`
            );

        await interaction.reply({ content: `✅ Postulación #${String(app.id).padStart(4, "0")} aceptada.`, flags: MessageFlags.Ephemeral }).catch(() => {});
        await sendNotification(client, app.userId, notifEmbed);
        return true;
    }

    const rejectMatch = id.match(/^recruitment_reject_(\d+)$/);
    if (rejectMatch) {
        const app = getApplication(gc, parseInt(rejectMatch[1]));
        if (!app) { await interaction.reply({ content: "❌ Postulación no encontrada.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }

        const m = new ModalBuilder()
            .setCustomId(`recruitment_reject_modal_${app.id}`)
            .setTitle(`❌ Rechazar postulación #${app.id}`)
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId("rejectReason")
                        .setLabel("Razón del rechazo (opcional)")
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(false)
                        .setMaxLength(500)
                )
            );

        await interaction.showModal(m).catch(() => {});
        return true;
    }

    const rejectModalMatch = id.match(/^recruitment_reject_modal_(\d+)$/);
    if (rejectModalMatch) {
        const app = getApplication(gc, parseInt(rejectModalMatch[1]));
        if (!app) { await interaction.reply({ content: "❌ Postulación no encontrada.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
        if (!isReviewer(interaction.member, gc)) { await interaction.reply({ content: "❌ Sin permisos.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
        const reason = (() => { try { return interaction.fields.getTextInputValue("rejectReason") || "Sin razón"; } catch { return "Sin razón"; } })();
        app.status = "rejected";
        addHistory(app, `Rechazada: ${reason}`, interaction.user.tag);
        saveConfig();
        const notifEmbed = new EmbedBuilder()
            .setColor("#ED4245")
            .setTitle("❌ POSTULACIÓN RECHAZADA")
            .setDescription(`Tu postulación #${String(app.id).padStart(4, "0")} ha sido rechazada.\n\n**Razón:** ${reason}`)
            .setFooter({ text: "DRAGONS | Reclutamiento" });
        await interaction.reply({ content: `❌ Postulación #${app.id} rechazada.`, flags: MessageFlags.Ephemeral }).catch(() => {});
        await sendNotification(client, app.userId, notifEmbed);
        return true;
    }

    const interviewMatch = id.match(/^recruitment_interview_(\d+)$/);
    if (interviewMatch) {
        const app = getApplication(gc, parseInt(interviewMatch[1]));
        if (!app) { await interaction.reply({ content: "❌ Postulación no encontrada.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }

        app.status = "interview";
        addHistory(app, "Entrevista iniciada", interaction.user.tag);
        saveConfig();

        try {
            const channel = await guild.channels.create({
                name: `entrevista-${app.userName.replace(/[^a-zA-Z0-9]/g, "-").substring(0, 20)}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: app.userId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                    ...r.reviewerRoles.map(rid => ({
                        id: rid, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
                    }))
                ]
            });

            app.interview = {
                channelId: channel.id,
                startedAt: Date.now(),
                currentQuestion: 0,
                answers: []
            };
            saveConfig();

            const vacancy = getVacancy(gc, app.vacancyId);
            const interviewQuestions = (vacancy?.interviewQuestions || []).filter(q => q.active !== false);

            if (interviewQuestions.length > 0) {
                const q = interviewQuestions[0];
                await channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor("#8A2BE2")
                            .setTitle("🤖 DRAGONS | ENTREVISTA")
                            .setDescription(
                                `Bienvenido <@${app.userId}> a tu entrevista para **${app.vacancyName}**.\n\n` +
                                `Pregunta 1/${interviewQuestions.length}:\n\n**${q.text}**`
                            )
                            .setFooter({ text: "DRAGONS | Reclutamiento" })
                    ]
                });
            } else {
                await channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor("#8A2BE2")
                            .setTitle("🤖 DRAGONS | ENTREVISTA")
                            .setDescription(
                                `Entrevista para **${app.vacancyName}**.\n\nNo hay preguntas configuradas. Un revisor se encargará de la entrevista.`
                            )
                            .setFooter({ text: "DRAGONS | Reclutamiento" })
                    ]
                });
            }

            activeInterviews.set(channel.id, { applicationId: app.id, guildId: guild.id });

            await interaction.reply({
                content: `💬 Canal de entrevista creado: <#${channel.id}>`,
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        } catch (err) {
            console.error("[DRAGONS RECLUTAMIENTO] Error creando canal de entrevista:", err.message);
            await interaction.reply({ content: "❌ Error al crear el canal de entrevista.", flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        return true;
    }

    const statusMatch = id.match(/^recruitment_status_(\d+)_(\w+)$/);
    if (statusMatch) {
        const app = getApplication(gc, parseInt(statusMatch[1]));
        const newStatus = statusMatch[2];
        if (!app || !STATUSES[newStatus]) {
            await interaction.reply({ content: "❌ Postulación no encontrada.", flags: MessageFlags.Ephemeral }).catch(() => {});
            return true;
        }

        app.status = newStatus;
        addHistory(app, `Estado cambiado a ${STATUSES[newStatus]}`, interaction.user.tag);
        saveConfig();

        const view = buildStaffReview(app, gc);
        await interaction.update(view).catch(() => {});
        return true;
    }

    const analyzeMatch = id.match(/^recruitment_analyze_(\d+)$/);
    if (analyzeMatch) {
        const app = getApplication(gc, parseInt(analyzeMatch[1]));
        if (!app) { await interaction.reply({ content: "❌ Postulación no encontrada.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }

        if (!r.useAI) {
            await interaction.reply({ content: "⚠️ El análisis con IA está desactivado.", flags: MessageFlags.Ephemeral }).catch(() => {});
            return true;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

        try {
            const aiSystem = require("./aiSystem");
            const vacancy = getVacancy(gc, app.vacancyId);
            const answersText = (app.answers || []).map(a => `Pregunta: ${a.question}\nRespuesta: ${a.answer}`).join("\n\n");

            const prompt = `Analiza esta postulación para el puesto de ${app.vacancyName} en el servidor DRAGONS.\n\n` +
                `Puesto: ${app.vacancyName}\n` +
                `Descripción: ${vacancy?.description || "N/A"}\n` +
                `Requisitos: ${vacancy?.requirements || "N/A"}\n\n` +
                `Respuestas del postulante:\n${answersText}\n\n` +
                `Proporciona:\n1. Puntuaciones del 1-10 para: Experiencia, Comunicación, Motivación, Disponibilidad, Conocimiento\n` +
                `2. Fortalezas (máximo 3)\n` +
                `3. Aspectos a revisar (máximo 3)\n` +
                `4. Recomendación breve\n\n` +
                `NO aceptes ni rechaces. Solo analiza y recomienda.`;

            const result = await aiSystem.generateResponseFromPrompt ??
                (async () => {
                    const { GoogleGenerativeAI } = require("@google/generative-ai");
                    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
                    const model = genAI.getGenerativeModel({ model: gc.ai?.model || "gemini-3.5-flash" });
                    const r2 = await model.generateContent(prompt);
                    return { reply: r2.response.text() };
                });

            const response = typeof result === "function" ? await result() : result;
            const analysisText = response?.reply || response?.text || "No se pudo generar el análisis.";

            app.analysis = {
                text: analysisText,
                timestamp: Date.now(),
                analyzedBy: interaction.user.tag
            };
            addHistory(app, "Análisis de IA realizado", interaction.user.tag);
            saveConfig();

            const analysisEmbed = new EmbedBuilder()
                .setColor("#8A2BE2")
                .setTitle("🤖 DRAGONS AI | ANÁLISIS")
                .setDescription(analysisText.substring(0, 4000))
                .setFooter({ text: `Postulación #${app.id} | Análisis por IA` })
                .setTimestamp();

            await interaction.editReply({ embeds: [analysisEmbed] }).catch(() => {});
        } catch (err) {
            console.error("[DRAGONS RECLUTAMIENTO] Error en análisis de IA:", err.message);
            await interaction.editReply({ content: "⚠️ Error al generar el análisis. Inténtalo más tarde." }).catch(() => {});
        }
        return true;
    }

    const historyMatch = id.match(/^recruitment_history_(\d+)$/);
    if (historyMatch) {
        const app = getApplication(gc, parseInt(historyMatch[1]));
        if (!app) { await interaction.reply({ content: "❌ Postulación no encontrada.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }

        const history = (app.history || []).map(h =>
            `${formatTimestamp(h.timestamp)} — ${h.action}${h.moderator ? ` (${h.moderator})` : ""}`
        ).join("\n");

        const embed = new EmbedBuilder()
            .setColor("#8A2BE2")
            .setTitle(`📋 HISTORIAL #${String(app.id).padStart(4, "0")}`)
            .setDescription(history || "Sin historial.")
            .setFooter({ text: "DRAGONS | Reclutamiento" });

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }

    const reviewMatch = id.match(/^recruitment_review_(\d+)$/);
    if (reviewMatch) {
        const app = getApplication(gc, parseInt(reviewMatch[1]));
        if (!app) { await interaction.reply({ content: "❌ Postulación no encontrada.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }

        if (app.status === "pending") {
            app.status = "reviewing";
            addHistory(app, "Puesta en revisión", interaction.user.tag);
            saveConfig();
        }

        const view = buildStaffReview(app, gc);
        await interaction.update(view).catch(() => {});
        return true;
    }

    const cancelMatch = id.match(/^recruitment_cancel_(\d+)$/);
    if (cancelMatch) {
        const app = getApplication(gc, parseInt(cancelMatch[1]));
        if (!app) { await interaction.reply({ content: "❌ Postulación no encontrada.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }

        app.status = "cancelled";
        addHistory(app, "Cancelada", interaction.user.tag);
        saveConfig();

        await interaction.reply({ content: `⚫ Postulación #${app.id} cancelada.`, flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }

    return false;
}

async function handleVacancySelect(interaction, config, saveConfig) {
    if (interaction.customId !== "recruitment_view_vacancy") return false;

    const guild = interaction.guild;
    const gc = config[guild.id];
    const r = ensureRecruitmentConfig(gc);

    const vacancyId = interaction.values[0];
    const vacancy = getVacancy(gc, vacancyId);
    if (!vacancy) {
        await interaction.reply({ content: "❌ Vacante no encontrada.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }

    const view = buildVacancyInfo(vacancy);
    await interaction.update(view).catch(() => {});
    return true;
}

async function handleApplyButton(interaction, config, saveConfig) {
    const match = interaction.customId?.match(/^recruitment_apply_(.+)$/);
    if (!match) return false;

    const guild = interaction.guild;
    const gc = config[guild.id];
    const r = ensureRecruitmentConfig(gc);

    if (!r.enabled) {
        await interaction.reply({ content: "⚠️ El sistema de postulaciones no está activo.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }

    if (gc.recruitment?.publicChannel && interaction.channel.id !== gc.recruitment.publicChannel) {
        await interaction.reply({ content: "⚠️ Debes postularte desde el canal de reclutamiento.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }

    const vacancyId = match[1];
    const check = canApply(gc, interaction.user.id, vacancyId);
    if (!check.ok) {
        await interaction.reply({ content: `❌ ${check.reason}`, flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }

    const vacancy = getVacancy(gc, vacancyId);
    const form = buildApplicationForm(vacancy);
    if (!form) {
        await interaction.reply({ content: "❌ Este puesto no tiene preguntas configuradas.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }

    await interaction.showModal(form).catch(() => {});
    return true;
}

async function handleInterviewMessage(message, config) {
    const data = activeInterviews.get(message.channel.id);
    if (!data) return;

    const gc = config[message.guild.id];
    const app = getApplication(gc, data.applicationId);
    if (!app) { activeInterviews.delete(message.channel.id); return; }

    const vacancy = getVacancy(gc, app.vacancyId);
    const questions = (vacancy?.interviewQuestions || []).filter(q => q.active !== false);
    const currentIdx = app.interview?.currentQuestion || 0;

    if (currentIdx < questions.length) {
        app.interview.answers.push({
            question: questions[currentIdx].text,
            answer: message.content
        });
    }

    const nextIdx = currentIdx + 1;
    if (app.interview) app.interview.currentQuestion = nextIdx;

    if (nextIdx < questions.length) {
        const q = questions[nextIdx];
        await message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor("#8A2BE2")
                    .setTitle("🤖 DRAGONS | ENTREVISTA")
                    .setDescription(
                        `Pregunta ${nextIdx + 1}/${questions.length}:\n\n**${q.text}**`
                    )
                    .setFooter({ text: "DRAGONS | Reclutamiento" })
            ]
        });
    } else {
        app.status = "reviewing";
        if (app.interview) app.interview.finishedAt = Date.now();
        addHistory(app, "Entrevista finalizada", "Sistema");
        config[message.guild.id]._dirty = true;

        const duration = app.interview?.finishedAt && app.interview?.startedAt
            ? Math.floor((app.interview.finishedAt - app.interview.startedAt) / 60000)
            : "?";

        await message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor("#57F287")
                    .setTitle("📊 ENTREVISTA FINALIZADA")
                    .setDescription(
                        `Preguntas: ${questions.length}/${questions.length}\n` +
                        `Duración: ~${duration} minutos\n\n` +
                        `Estado: 🟡 Pendiente de revisión`
                    )
                    .setFooter({ text: "DRAGONS | Reclutamiento" })
            ]
        });

        activeInterviews.delete(message.channel.id);
    }
}

function isReviewer(member, gc) {
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    const roles = gc.recruitment?.reviewerRoles || [];
    return roles.some(rid => member.roles.cache.has(rid));
}

function recruitmentView(gc) {
    const r = gc.recruitment;
    const enabled = r.enabled === true;
    const totalApps = (r.applications || []).length;
    const pendingApps = (r.applications || []).filter(a => a.status === "pending").length;
    const vacancies = (r.vacancies || []).length;
    const activeVacancies = (r.vacancies || []).filter(v => v.active).length;

    const embed = new EmbedBuilder()
        .setColor(enabled ? "#57F287" : "#ED4245")
        .setTitle("📝 DRAGONS | POSTULACIONES")
        .setDescription(
            (enabled ? "🟢 **ESTADO: ACTIVO**" : "🔴 **ESTADO: DESACTIVADO**") +
            "\n\nSistema completo de reclutamiento y postulaciones."
        )
        .addFields(
            { name: "📢 Canal público", value: r.publicChannel ? `<#${r.publicChannel}>` : "No configurado", inline: true },
            { name: "📥 Canal de revisión", value: r.reviewChannel ? `<#${r.reviewChannel}>` : "No configurado", inline: true },
            { name: "🛡️ Vacantes", value: `${activeVacancies}/${vacancies}`, inline: true },
            { name: "📋 Postulaciones", value: `${totalApps} total, ${pendingApps} pendientes`, inline: true },
            { name: "⏱️ Cooldown", value: `${Math.floor((r.cooldownMs || 300000) / 60000)} min`, inline: true },
            { name: "📊 Límites", value: `${r.maxActive || 1} activas, ${r.maxPerUser || 3} total`, inline: true },
            { name: "🤖 Análisis IA", value: r.useAI === false ? "🔴 Desactivado" : "🟢 Activado", inline: true },
            { name: "💬 Entrevistas", value: r.interviewsEnabled === false ? "🔴 Desactivadas" : "🟢 Activadas", inline: true }
        )
        .setFooter({ text: "DRAGONS | Centro de control" });

    const rows = [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("panel_cfg_recruitment").setLabel("Configurar").setStyle(ButtonStyle.Primary).setEmoji("⚙️"),
            new ButtonBuilder().setCustomId("panel_toggle_recruitment_on").setLabel("Activar").setStyle(ButtonStyle.Success).setEmoji("✅"),
            new ButtonBuilder().setCustomId("panel_toggle_recruitment_off").setLabel("Desactivar").setStyle(ButtonStyle.Danger).setEmoji("❌"),
            new ButtonBuilder().setCustomId("panel_back").setLabel("Volver").setStyle(ButtonStyle.Secondary).setEmoji("⬅️")
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("recruitment_publish_panel").setLabel("📢 Publicar panel").setStyle(ButtonStyle.Success).setEmoji("📢"),
            new ButtonBuilder().setCustomId("recruitment_manage_vacancies").setLabel("🛡️ Vacantes").setStyle(ButtonStyle.Primary).setEmoji("🛡️"),
            new ButtonBuilder().setCustomId("recruitment_manage_questions").setLabel("📝 Preguntas").setStyle(ButtonStyle.Primary).setEmoji("📝"),
            new ButtonBuilder().setCustomId("recruitment_list_apps").setLabel("📋 Ver postulaciones").setStyle(ButtonStyle.Secondary).setEmoji("📋")
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("recruitment_toggle_ai").setLabel(r.useAI === false ? "🤖 IA: OFF" : "🤖 IA: ON").setStyle(r.useAI === false ? ButtonStyle.Danger : ButtonStyle.Success).setEmoji("🤖"),
            new ButtonBuilder().setCustomId("recruitment_toggle_interviews").setLabel(r.interviewsEnabled === false ? "💬 Entrevistas: OFF" : "💬 Entrevistas: ON").setStyle(r.interviewsEnabled === false ? ButtonStyle.Danger : ButtonStyle.Success).setEmoji("💬")
        )
    ];

    return { embeds: [embed], components: rows };
}

function recruitmentModal(gc) {
    const r = gc.recruitment || {};
    return new ModalBuilder()
        .setCustomId("panel_modal_recruitment")
        .setTitle("⚙️ Configurar Postulaciones")
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("recPublicChannel").setLabel("Canal público (ID o #mención)").setStyle(TextInputStyle.Short).setRequired(false).setValue(r.publicChannel ? `<#${r.publicChannel}>` : "")),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("recReviewChannel").setLabel("Canal de revisión (ID o #mención)").setStyle(TextInputStyle.Short).setRequired(false).setValue(r.reviewChannel ? `<#${r.reviewChannel}>` : "")),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("recReviewerRoles").setLabel("Roles revisores (IDs separados)").setStyle(TextInputStyle.Short).setRequired(false).setValue((r.reviewerRoles || []).join(", "))),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("recCooldown").setLabel("Cooldown entre postulaciones (min)").setStyle(TextInputStyle.Short).setRequired(false).setValue(String(Math.floor((r.cooldownMs || 300000) / 60000)))),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("recLimits").setLabel("Máx activas / Máx total (ej: 1 3)").setStyle(TextInputStyle.Short).setRequired(false).setValue(`${r.maxActive || 1} ${r.maxPerUser || 3}`))
        );
}

function vacanciesListView(gc) {
    const vacancies = gc.recruitment?.vacancies || [];

    const embed = new EmbedBuilder()
        .setColor("#8A2BE2")
        .setTitle("🛡️ VACANTES")
        .setDescription(
            vacancies.length > 0
                ? vacancies.map((v, i) =>
                    `${v.active ? "🟢" : "🔴"} **${v.emoji || "📋"} ${v.name}** — ${(v.questions || []).length} preguntas`
                ).join("\n")
                : "No hay vacantes creadas."
        )
        .setFooter({ text: "DRAGONS | Centro de control" });

    const rows = [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("recruitment_add_vacancy").setLabel("➕ Crear").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId("recruitment_edit_vacancy_select").setLabel("✏️ Editar").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId("recruitment_delete_vacancy_select").setLabel("🗑️ Eliminar").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId("recruitment_back_main").setLabel("Volver").setStyle(ButtonStyle.Secondary).setEmoji("⬅️")
        )
    ];

    if (vacancies.length > 0) {
        const options = vacancies.slice(0, 25).map(v => ({
            label: `${v.emoji || "📋"} ${v.name}`.substring(0, 100),
            description: `${v.active ? "🟢 Activo" : "🔴 Inactivo"}`.substring(0, 100),
            value: v.id
        }));

        rows.push(new ActionRowBuilder().addComponents(
            new (require("discord.js")).StringSelectMenuBuilder()
                .setCustomId("recruitment_toggle_vacancy")
                .setPlaceholder("🟢🔴 Activar/Desactivar vacante")
                .addOptions(options)
        ));
    }

    return { embeds: [embed], components: rows };
}

function questionsListView(gc, vacancyId) {
    const vacancy = getVacancy(gc, vacancyId);
    if (!vacancy) return { embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("❌ Vacante no encontrada")], components: [] };

    const questions = vacancy.questions || [];

    const embed = new EmbedBuilder()
        .setColor("#8A2BE2")
        .setTitle(`📝 PREGUNTAS — ${vacancy.emoji || "📋"} ${vacancy.name}`)
        .setDescription(
            questions.length > 0
                ? questions.map((q, i) =>
                    `${q.active !== false ? "🟢" : "🔴"} **${i + 1}.** ${q.text.substring(0, 80)}${q.required !== false ? " *" : ""}`
                ).join("\n")
                : "No hay preguntas configuradas."
        )
        .setFooter({ text: `${questions.length} preguntas | * = obligatoria` });

    const rows = [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`recruitment_add_question_${vacancyId}`).setLabel("➕ Crear").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`recruitment_edit_question_select_${vacancyId}`).setLabel("✏️ Editar").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`recruitment_delete_question_select_${vacancyId}`).setLabel("🗑️ Eliminar").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId("recruitment_manage_vacancies").setLabel("Volver").setStyle(ButtonStyle.Secondary).setEmoji("⬅️")
        )
    ];

    if (questions.length > 1) {
        const options = questions.slice(0, 25).map((q, i) => ({
            label: `${i + 1}. ${q.text.substring(0, 90)}`,
            description: `${q.active !== false ? "🟢 Activa" : "🔴 Inactiva"} | ${q.required !== false ? "Obligatoria" : "Opcional"}`.substring(0, 100),
            value: `${vacancyId}:${i}`
        }));

        rows.push(new ActionRowBuilder().addComponents(
            new (require("discord.js")).StringSelectMenuBuilder()
                .setCustomId("recruitment_toggle_question")
                .setPlaceholder("🟢🔴 Activar/Desactivar pregunta")
                .addOptions(options)
        ));
    }

    return { embeds: [embed], components: rows };
}

function applicationsListView(gc, filter) {
    const apps = gc.recruitment?.applications || [];
    let filtered = apps;

    if (filter === "pending") filtered = apps.filter(a => a.status === "pending");
    else if (filter === "reviewing") filtered = apps.filter(a => a.status === "reviewing");
    else if (filter === "interview") filtered = apps.filter(a => a.status === "interview");
    else if (filter === "accepted") filtered = apps.filter(a => a.status === "accepted");
    else if (filter === "rejected") filtered = apps.filter(a => a.status === "rejected");

    const embed = new EmbedBuilder()
        .setColor("#8A2BE2")
        .setTitle(`📋 POSTULACIONES${filter ? ` — ${STATUSES[filter] || filter}` : ""}`)
        .setDescription(
            filtered.length > 0
                ? filtered.slice(0, 15).map(a =>
                    `\`${a.id}\` ${STATUSES[a.status] || a.status} — <@${a.userId}> → ${a.vacancyName}`
                ).join("\n") + (filtered.length > 15 ? `\n\n... y ${filtered.length - 15} más` : "")
                : "No hay postulaciones."
        )
        .setFooter({ text: `${filtered.length} resultado(s)` });

    const rows = [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("recruitment_filter_all").setLabel("📋 Todas").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("recruitment_filter_pending").setLabel("🟡 Pendientes").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId("recruitment_filter_reviewing").setLabel("🔵 Revisión").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId("recruitment_filter_accepted").setLabel("🟢 Aceptadas").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId("recruitment_filter_rejected").setLabel("🔴 Rechazadas").setStyle(ButtonStyle.Danger)
        )
    ];

    if (filtered.length > 0) {
        const options = filtered.slice(0, 25).map(a => ({
            label: `#${a.id} — ${a.vacancyName}`.substring(0, 100),
            description: `${STATUSES[a.status] || a.status} — ${a.userName}`.substring(0, 100),
            value: String(a.id)
        }));

        rows.push(new ActionRowBuilder().addComponents(
            new (require("discord.js")).StringSelectMenuBuilder()
                .setCustomId("recruitment_view_app")
                .setPlaceholder("📋 Seleccionar postulación")
                .addOptions(options)
        ));
    }

    return { embeds: [embed], components: rows };
}

// ===== ADMIN VIEW HELPER =====
async function adminView(interaction, view) {
    try {
        if (interaction.deferred) { await interaction.editReply(view).catch(() => {}); }
        else if (interaction.replied) { await interaction.followUp({ ...view, flags: MessageFlags.Ephemeral }).catch(() => {}); }
        else {
            await interaction.update(view).catch(async () => {
                try { await interaction.reply({ ...view, flags: MessageFlags.Ephemeral }).catch(() => {}); } catch {
                    try { await interaction.followUp({ ...view, flags: MessageFlags.Ephemeral }).catch(() => {}); } catch {}
                }
            });
        }
    } catch {}
    return true;
}

// ===== VACANCY CRUD =====
async function handleVacancyCreateSubmit(interaction, gc, config, saveConfig) {
    const v = (f) => { try { return interaction.fields.getTextInputValue(f); } catch { return ""; } };
    const name = v("vacName");
    if (!name) { await interaction.reply({ content: "❌ Nombre obligatorio.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    if (getVacancy(gc, id)) { await interaction.reply({ content: "❌ Ya existe una vacante con ese nombre.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
    if (!gc.recruitment.vacancies) gc.recruitment.vacancies = [];
    gc.recruitment.vacancies.push({ id, name, emoji: v("vacEmoji") || "📋", description: v("vacDescription") || "", requirements: v("vacRequirements") || "", functions: v("vacFunctions") || "", active: true, questions: [], interviewQuestions: [] });
    saveConfig();
    await interaction.reply({ content: `✅ Vacante **${v("vacEmoji") || "📋"} ${name}** creada.`, flags: MessageFlags.Ephemeral }).catch(() => {});
    return true;
}

async function handleVacancyUpdateSubmit(interaction, gc, config, saveConfig, cid) {
    const m = cid.match(/^recruitment_modal_edit_vacancy_(.+)$/);
    if (!m) return false;
    const vac = getVacancy(gc, m[1]);
    if (!vac) { await interaction.reply({ content: "❌ Vacante no encontrada.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
    const v = (f) => { try { return interaction.fields.getTextInputValue(f); } catch { return ""; } };
    const name = v("vacName"); if (name) vac.name = name;
    const emoji = v("vacEmoji"); if (emoji) vac.emoji = emoji;
    vac.description = v("vacDescription") || vac.description;
    vac.requirements = v("vacRequirements") || vac.requirements;
    vac.functions = v("vacFunctions") || vac.functions;
    saveConfig();
    await interaction.reply({ content: `✅ Vacante actualizada.`, flags: MessageFlags.Ephemeral }).catch(() => {});
    return true;
}

async function handleVacancyDelete(interaction, gc, config, saveConfig, value) {
    const vacancyId = value;
    const idx = (gc.recruitment.vacancies || []).findIndex(v => v.id === vacancyId);
    if (idx === -1) { await interaction.reply({ content: "❌ Vacante no encontrada.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
    const name = gc.recruitment.vacancies[idx].name;
    gc.recruitment.vacancies.splice(idx, 1);
    saveConfig();
    await interaction.reply({ content: `🗑️ Vacante **${name}** eliminada.`, flags: MessageFlags.Ephemeral }).catch(() => {});
    return true;
}

async function handleVacancyToggle(interaction, gc, config, saveConfig) {
    const vac = getVacancy(gc, interaction.values[0]);
    if (!vac) { await interaction.reply({ content: "❌ Vacante no encontrada.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
    vac.active = !vac.active;
    saveConfig();
    return await adminView(interaction, vacanciesListView(gc));
}

// ===== QUESTION CRUD =====
async function handleQuestionCreateSubmit(interaction, gc, config, saveConfig, cid) {
    const m = cid.match(/^recruitment_modal_add_question_(.+)$/);
    if (!m) return false;
    const vac = getVacancy(gc, m[1]);
    if (!vac) { await interaction.reply({ content: "❌ Vacante no encontrada.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
    const v = (f) => { try { return interaction.fields.getTextInputValue(f); } catch { return ""; } };
    const text = v("qText");
    if (!text) { await interaction.reply({ content: "❌ Texto obligatorio.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
    if (!vac.questions) vac.questions = [];
    vac.questions.push({ id: `q${vac.questions.length + 1}`, text, long: (v("qLong") || "").toLowerCase().startsWith("s"), required: (v("qRequired") || "si").toLowerCase() !== "no", placeholder: v("qPlaceholder") || "", active: true });
    saveConfig();
    await interaction.reply({ content: `✅ Pregunta agregada a **${vac.name}**.`, flags: MessageFlags.Ephemeral }).catch(() => {});
    return true;
}

async function handleQuestionUpdateSubmit(interaction, gc, config, saveConfig, cid) {
    const m = cid.match(/^recruitment_modal_edit_question_(.+)_(\d+)$/);
    if (!m) return false;
    const vac = getVacancy(gc, m[1]);
    const q = vac?.questions?.[parseInt(m[2])];
    if (!vac || !q) { await interaction.reply({ content: "❌ Pregunta no encontrada.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
    const v = (f) => { try { return interaction.fields.getTextInputValue(f); } catch { return ""; } };
    const text = v("qText"); if (text) q.text = text;
    q.long = (v("qLong") || "").toLowerCase().startsWith("s");
    q.required = (v("qRequired") || "si").toLowerCase() !== "no";
    q.placeholder = v("qPlaceholder") || q.placeholder;
    saveConfig();
    await interaction.reply({ content: `✅ Pregunta actualizada.`, flags: MessageFlags.Ephemeral }).catch(() => {});
    return true;
}

async function handleQuestionDelete(interaction, gc, vacancyId, qIdx) {
    const vac = getVacancy(gc, vacancyId);
    if (!vac?.questions?.[qIdx]) { await interaction.reply({ content: "❌ Pregunta no encontrada.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
    vac.questions.splice(qIdx, 1);
    return await adminView(interaction, questionsListView(gc, vacancyId));
}

async function handleQuestionToggle(interaction, gc, config, saveConfig) {
    const [vacancyId, qIdx] = interaction.values[0].split(":");
    const vac = getVacancy(gc, vacancyId);
    if (!vac?.questions?.[parseInt(qIdx)]) { await interaction.reply({ content: "❌ Pregunta no encontrada.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
    vac.questions[parseInt(qIdx)].active = vac.questions[parseInt(qIdx)].active === false ? true : false;
    saveConfig();
    return await adminView(interaction, questionsListView(gc, vacancyId));
}

// ===== PANEL NAVIGATION =====
async function handlePublishPanel(interaction, gc) {
    if (!gc.recruitment.publicChannel) { await interaction.reply({ content: "❌ Configura el canal público primero.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
    try {
        const ch = await interaction.client.channels.fetch(gc.recruitment.publicChannel);
        if (!ch) { await interaction.reply({ content: "❌ Canal no encontrado.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
        await ch.send(buildPublicPanel(gc));
        await interaction.reply({ content: "✅ Panel publicado.", flags: MessageFlags.Ephemeral }).catch(() => {});
    } catch { await interaction.reply({ content: "❌ Error al publicar.", flags: MessageFlags.Ephemeral }).catch(() => {}); }
    return true;
}

async function handleManageQuestions(interaction, gc) {
    const vacancies = gc.recruitment?.vacancies || [];
    if (!vacancies.length) { await interaction.reply({ content: "❌ Primero crea una vacante.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
    const { StringSelectMenuBuilder: SSM } = require("discord.js");
    await interaction.reply({ components: [new ActionRowBuilder().addComponents(new SSM().setCustomId("recruitment_select_question_vacancy").setPlaceholder("Seleccionar vacante para ver preguntas").addOptions(vacancies.slice(0, 25).map(v => ({ label: `${v.emoji || "📋"} ${v.name}`.substring(0, 100), description: `${(v.questions || []).length} preguntas`.substring(0, 100), value: v.id }))))], flags: MessageFlags.Ephemeral }).catch(() => {});
    return true;
}

async function handleShowAddVacancyModal(interaction) {
    const m = new ModalBuilder().setCustomId("recruitment_modal_add_vacancy").setTitle("➕ Crear vacante").addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("vacName").setLabel("Nombre del puesto").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("vacEmoji").setLabel("Emoji (ej: 🛡️)").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(10)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("vacDescription").setLabel("Descripción").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("vacRequirements").setLabel("Requisitos").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("vacFunctions").setLabel("Funciones").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000))
    );
    await interaction.showModal(m).catch(() => {});
    return true;
}

async function handleShowEditVacancyModal(interaction, gc, vacancyId) {
    const vac = getVacancy(gc, vacancyId);
    if (!vac) { await interaction.reply({ content: "❌ Vacante no encontrada.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
    const m = new ModalBuilder().setCustomId(`recruitment_modal_edit_vacancy_${vacancyId}`).setTitle(`✏️ Editar ${vac.name}`).addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("vacName").setLabel("Nombre").setStyle(TextInputStyle.Short).setRequired(false).setValue(vac.name).setMaxLength(100)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("vacEmoji").setLabel("Emoji").setStyle(TextInputStyle.Short).setRequired(false).setValue(vac.emoji || "").setMaxLength(10)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("vacDescription").setLabel("Descripción").setStyle(TextInputStyle.Paragraph).setRequired(false).setValue(vac.description || "").setMaxLength(1000)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("vacRequirements").setLabel("Requisitos").setStyle(TextInputStyle.Paragraph).setRequired(false).setValue(vac.requirements || "").setMaxLength(1000)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("vacFunctions").setLabel("Funciones").setStyle(TextInputStyle.Paragraph).setRequired(false).setValue(vac.functions || "").setMaxLength(1000))
    );
    await interaction.showModal(m).catch(() => {});
    return true;
}

async function handleShowAddQuestionModal(interaction, vacancyId) {
    const m = new ModalBuilder().setCustomId(`recruitment_modal_add_question_${vacancyId}`).setTitle("➕ Agregar pregunta").addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("qText").setLabel("Texto de la pregunta").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("qLong").setLabel("¿Respuesta larga? (si/no)").setStyle(TextInputStyle.Short).setRequired(false).setValue("no")),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("qRequired").setLabel("¿Obligatoria? (si/no)").setStyle(TextInputStyle.Short).setRequired(false).setValue("si")),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("qPlaceholder").setLabel("Placeholder (opcional)").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100))
    );
    await interaction.showModal(m).catch(() => {});
    return true;
}

async function handleShowEditQuestionModal(interaction, gc, value) {
    const [vacancyId, qIdx] = value.split(":");
    const vac = getVacancy(gc, vacancyId);
    const q = vac?.questions?.[parseInt(qIdx)];
    if (!vac || !q) { await interaction.reply({ content: "❌ Pregunta no encontrada.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
    const m = new ModalBuilder().setCustomId(`recruitment_modal_edit_question_${vacancyId}_${qIdx}`).setTitle("✏️ Editar pregunta").addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("qText").setLabel("Texto").setStyle(TextInputStyle.Paragraph).setRequired(false).setValue(q.text).setMaxLength(500)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("qLong").setLabel("¿Respuesta larga? (si/no)").setStyle(TextInputStyle.Short).setRequired(false).setValue(q.long ? "si" : "no")),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("qRequired").setLabel("¿Obligatoria? (si/no)").setStyle(TextInputStyle.Short).setRequired(false).setValue(q.required !== false ? "si" : "no")),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("qPlaceholder").setLabel("Placeholder").setStyle(TextInputStyle.Short).setRequired(false).setValue(q.placeholder || "").setMaxLength(100))
    );
    await interaction.showModal(m).catch(() => {});
    return true;
}

async function handleShowVacancySelectForEdit(interaction, gc) {
    const vacancies = gc.recruitment?.vacancies || [];
    if (!vacancies.length) { await interaction.reply({ content: "❌ No hay vacantes.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
    const { StringSelectMenuBuilder: SSM } = require("discord.js");
    await interaction.reply({ components: [new ActionRowBuilder().addComponents(new SSM().setCustomId("recruitment_select_edit_vacancy").setPlaceholder("✏️ Seleccionar vacante para editar").addOptions(vacancies.slice(0, 25).map(v => ({ label: `${v.emoji || "📋"} ${v.name}`.substring(0, 100), description: "Editar esta vacante".substring(0, 100), value: v.id }))))], flags: MessageFlags.Ephemeral }).catch(() => {});
    return true;
}

async function handleShowVacancySelectForDelete(interaction, gc) {
    const vacancies = gc.recruitment?.vacancies || [];
    if (!vacancies.length) { await interaction.reply({ content: "❌ No hay vacantes.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
    const { StringSelectMenuBuilder: SSM } = require("discord.js");
    await interaction.reply({ components: [new ActionRowBuilder().addComponents(new SSM().setCustomId("recruitment_select_delete_vacancy").setPlaceholder("🗑️ Seleccionar vacante para eliminar").addOptions(vacancies.slice(0, 25).map(v => ({ label: `${v.emoji || "📋"} ${v.name}`.substring(0, 100), description: "Eliminar esta vacante".substring(0, 100), value: v.id }))))], flags: MessageFlags.Ephemeral }).catch(() => {});
    return true;
}

async function handleShowQuestionSelectForEdit(interaction, gc, vacancyId) {
    const vac = getVacancy(gc, vacancyId);
    if (!vac?.questions?.length) { await interaction.reply({ content: "❌ No hay preguntas.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
    const { StringSelectMenuBuilder: SSM } = require("discord.js");
    await interaction.reply({ components: [new ActionRowBuilder().addComponents(new SSM().setCustomId("recruitment_select_edit_question").setPlaceholder("✏️ Seleccionar pregunta para editar").addOptions(vac.questions.slice(0, 25).map((q, i) => ({ label: `${i + 1}. ${q.text.substring(0, 90)}`, description: `${q.active !== false ? "🟢" : "🔴"} ${q.required !== false ? "Obligatoria" : "Opcional"}`.substring(0, 100), value: `${vacancyId}:${i}` }))))], flags: MessageFlags.Ephemeral }).catch(() => {});
    return true;
}

async function handleShowQuestionSelectForDelete(interaction, gc, vacancyId) {
    const vac = getVacancy(gc, vacancyId);
    if (!vac?.questions?.length) { await interaction.reply({ content: "❌ No hay preguntas.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
    const { StringSelectMenuBuilder: SSM } = require("discord.js");
    await interaction.reply({ components: [new ActionRowBuilder().addComponents(new SSM().setCustomId("recruitment_select_delete_question").setPlaceholder("🗑️ Seleccionar pregunta para eliminar").addOptions(vac.questions.slice(0, 25).map((q, i) => ({ label: `${i + 1}. ${q.text.substring(0, 90)}`, description: `${q.active !== false ? "🟢" : "🔴"} ${q.required !== false ? "Obligatoria" : "Opcional"}`.substring(0, 100), value: `${vacancyId}:${i}` }))))], flags: MessageFlags.Ephemeral }).catch(() => {});
    return true;
}

async function handleFilterApps(interaction, gc, customId) {
    const filter = customId.replace("recruitment_filter_", "");
    return await adminView(interaction, applicationsListView(gc, filter === "all" ? null : filter));
}

async function handleViewApp(interaction, gc, config, saveConfig, client) {
    const app = getApplication(gc, parseInt(interaction.values[0]));
    if (!app) { await interaction.reply({ content: "❌ Postulación no encontrada.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
    if (!isReviewer(interaction.member, gc)) { await interaction.reply({ content: "❌ Sin permisos.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
    const view = buildStaffReview(app, gc);
    await interaction.reply({ ...view, flags: MessageFlags.Ephemeral }).catch(() => {});
    return true;
}

async function handleSelectQuestionVacancy(interaction, gc, config, saveConfig) {
    return await adminView(interaction, questionsListView(gc, interaction.values[0]));
}

async function handleBackToPanel(interaction, gc) {
    return await adminView(interaction, buildPublicPanel(gc));
}

async function handleBackMain(interaction, gc) {
    return await adminView(interaction, recruitmentView(gc));
}

async function handleDenyAction(interaction) {
    try { if (!interaction.replied && !interaction.deferred) await interaction.deferUpdate().catch(() => {}); } catch {}
    return true;
}

// ===== MASTER INTERACTION HANDLER =====
async function handleInteraction(interaction, config, saveConfig, client) {
    const id = interaction.customId;
    if (!id || !interaction.guild) return false;
    const guild = interaction.guild;
    const gc = config[guild.id];
    if (!gc) return false;
    ensureRecruitmentConfig(gc);

    try {
        // MODAL SUBMITS
        if (interaction.isModalSubmit()) {
            if (id === "recruitment_reject_modal_" + id.match(/^recruitment_reject_modal_(\d+)$/)?.[1]) {
                return await handleReviewButton(interaction, config, saveConfig, client);
            }
            if (id === "recruitment_modal_add_vacancy") {
                return await handleVacancyCreateSubmit(interaction, gc, config, saveConfig);
            }
            if (id.startsWith("recruitment_modal_edit_vacancy_")) {
                return await handleVacancyUpdateSubmit(interaction, gc, config, saveConfig, id);
            }
            if (id.startsWith("recruitment_modal_add_question_")) {
                return await handleQuestionCreateSubmit(interaction, gc, config, saveConfig, id);
            }
            if (id.startsWith("recruitment_modal_edit_question_")) {
                return await handleQuestionUpdateSubmit(interaction, gc, config, saveConfig, id);
            }
            if (id.startsWith("recruitment_modal_")) {
                return await handleApplicationSubmit(interaction, config, saveConfig, client);
            }
            return false;
        }

        // SELECT MENUS
        if (interaction.isStringSelectMenu()) {
            if (id === "recruitment_view_vacancy") return await handleVacancySelect(interaction, config, saveConfig);
            if (id === "recruitment_toggle_vacancy") return await handleVacancyToggle(interaction, gc, config, saveConfig);
            if (id === "recruitment_toggle_question") return await handleQuestionToggle(interaction, gc, config, saveConfig);
            if (id === "recruitment_select_question_vacancy") return await handleSelectQuestionVacancy(interaction, gc, config, saveConfig);
            if (id === "recruitment_view_app") return await handleViewApp(interaction, gc, config, saveConfig, client);
            if (id === "recruitment_select_edit_vacancy") return await handleShowEditVacancyModal(interaction, gc, interaction.values[0]);
            if (id === "recruitment_select_delete_vacancy") return await handleVacancyDelete(interaction, gc, config, saveConfig, interaction.values[0]);
            if (id === "recruitment_select_edit_question") return await handleShowEditQuestionModal(interaction, gc, interaction.values[0]);
            if (id === "recruitment_select_delete_question") {
                const [vId, qi] = interaction.values[0].split(":");
                return await handleQuestionDelete(interaction, gc, vId, parseInt(qi));
            }
            return false;
        }

        // BUTTONS
        if (interaction.isButton()) {
            // Staff review buttons (check first - specific patterns with numeric IDs)
            const isReviewBtn = /^recruitment_(review|status|interview|analyze|accept|confirm_accept|reject|history|cancel)_/.test(id);
            if (isReviewBtn) {
                return await handleReviewButton(interaction, config, saveConfig, client);
            }

            // Panel management
            if (id === "recruitment_publish_panel") return await handlePublishPanel(interaction, gc);
            if (id === "recruitment_manage_vacancies") return await adminView(interaction, vacanciesListView(gc));
            if (id === "recruitment_manage_questions") return await handleManageQuestions(interaction, gc);
            if (id === "recruitment_list_apps") return await adminView(interaction, applicationsListView(gc));
            if (id === "recruitment_add_vacancy") return await handleShowAddVacancyModal(interaction);
            if (id === "recruitment_back_main") return await handleBackMain(interaction, gc);
            if (id === "recruitment_back_to_panel") return await handleBackToPanel(interaction, gc);
            if (id === "recruitment_deny_action") return await handleDenyAction(interaction);
            if (id === "recruitment_toggle_ai") {
                gc.recruitment.useAI = gc.recruitment.useAI === false ? true : false;
                saveConfig();
                return await adminView(interaction, recruitmentView(gc));
            }
            if (id === "recruitment_toggle_interviews") {
                gc.recruitment.interviewsEnabled = gc.recruitment.interviewsEnabled === false ? true : false;
                saveConfig();
                return await adminView(interaction, recruitmentView(gc));
            }

            // Vacancy management
            if (id === "recruitment_edit_vacancy_select") return await handleShowVacancySelectForEdit(interaction, gc);
            if (id === "recruitment_delete_vacancy_select") return await handleShowVacancySelectForDelete(interaction, gc);

            // Question management
            if (id.startsWith("recruitment_add_question_")) {
                const m = id.match(/^recruitment_add_question_(.+)$/);
                if (m) return await handleShowAddQuestionModal(interaction, m[1]);
            }
            if (id.startsWith("recruitment_edit_question_select_")) {
                const m = id.match(/^recruitment_edit_question_select_(.+)$/);
                if (m) return await handleShowQuestionSelectForEdit(interaction, gc, m[1]);
            }
            if (id.startsWith("recruitment_delete_question_select_")) {
                const m = id.match(/^recruitment_delete_question_select_(.+)$/);
                if (m) return await handleShowQuestionSelectForDelete(interaction, gc, m[1]);
            }

            // Filter buttons
            if (id.startsWith("recruitment_filter_")) return await handleFilterApps(interaction, gc, id);

            // Public panel apply
            if (id.startsWith("recruitment_apply_")) return await handleApplyButton(interaction, config, saveConfig);

            return false;
        }

        return false;
    } catch (error) {
        console.error("[DRAGONS RECLUTAMIENTO] Error en handleInteraction:", error.message);
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: "❌ Error al procesar.", flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        } catch {}
        return true;
    }
}

function setupRecruitmentSystem(client, config, saveConfig) {
    for (const guildId of Object.keys(config)) {
        if (typeof config[guildId] !== "object" || config[guildId] === null) continue;
        ensureRecruitmentConfig(config[guildId]);
    }
}

module.exports = {
    ensureRecruitmentConfig,
    isReviewer,
    canApply,
    generateId,
    getVacancy,
    getApplication,
    addHistory,
    buildPublicPanel,
    buildVacancyInfo,
    buildApplicationForm,
    buildStaffReview,
    sendToReviewChannel,
    sendNotification,
    handleApplicationSubmit,
    handleReviewButton,
    handleVacancySelect,
    handleApplyButton,
    handleInterviewMessage,
    handleInteraction,
    recruitmentView,
    recruitmentModal,
    vacanciesListView,
    questionsListView,
    applicationsListView,
    setupRecruitmentSystem,
    STATUSES,
    DEFAULTS
};
