const { EmbedBuilder, MessageFlags } = require("discord.js");

const TRUST_CATEGORIES = {
    TRUSTED: { min: 80, max: 100, label: "🟢 CONFIABLE", color: "#57F287" },
    NORMAL: { min: 50, max: 79, label: "🟡 NORMAL", color: "#FEE75C" },
    SUSPICIOUS: { min: 25, max: 49, label: "🟠 SOSPECHOSO", color: "#F47B67" },
    DANGEROUS: { min: 0, max: 24, label: "🔴 PELIGROSO", color: "#ED4245" }
};

const FACTOR_WEIGHTS = {
    accountAge: { max: 15, label: "Antigüedad de cuenta" },
    serverTime: { max: 15, label: "Tiempo en servidor" },
    messages: { max: 20, label: "Mensajes" },
    warnings: { max: -20, label: "Advertencias" },
    timeouts: { max: -15, label: "Timeouts" },
    tickets: { max: 10, label: "Tickets" },
    incidents: { max: -25, label: "Incidentes" },
    suspiciousActivity: { max: -20, label: "Actividad sospechosa" },
    raidParticipation: { max: -30, label: "Participación en raids" },
    adminActions: { max: 5, label: "Acciones administrativas" }
};

const DECAY_RECOVERY_PER_DAY = 2;
const MIN_TRUST = 0;
const MAX_TRUST = 100;
const BASE_TRUST = 70;

function ensureReputationConfig(gc) {
    if (!gc.aiControl) gc.aiControl = {};
    if (!gc.aiControl.trustScores) gc.aiControl.trustScores = {};
    return gc;
}

function getTrustEntry(gc, userId) {
    ensureReputationConfig(gc);
    return gc.aiControl.trustScores[userId] || null;
}

function getTrustScore(gc, userId) {
    const entry = getTrustEntry(gc, userId);
    if (!entry) return BASE_TRUST;
    const decayed = applyTrustDecay(entry);
    return decayed.score;
}

function applyTrustDecay(entry) {
    if (!entry.lastDecay) return entry;
    const daysSince = (Date.now() - entry.lastDecay) / 86400000;
    if (daysSince < 1) return entry;

    const recovery = Math.floor(daysSince * DECAY_RECOVERY_PER_DAY);
    const negativeFactors = Object.entries(entry.factors || {})
        .filter(([, v]) => v < 0)
        .reduce((sum, [, v]) => sum + v, 0);

    if (negativeFactors < 0) {
        const recovered = Math.min(Math.abs(negativeFactors), recovery);
        const newFactors = { ...entry.factors };
        let remaining = recovered;
        for (const key of Object.keys(newFactors)) {
            if (newFactors[key] < 0 && remaining > 0) {
                const restore = Math.min(Math.abs(newFactors[key]), remaining);
                newFactors[key] += restore;
                remaining -= restore;
            }
        }
        entry.factors = newFactors;
    }

    entry.score = calculateScore(entry.factors);
    entry.lastDecay = Date.now();
    return entry;
}

function calculateScore(factors) {
    let score = BASE_TRUST;
    for (const [key, value] of Object.entries(factors)) {
        score += value;
    }
    return Math.max(MIN_TRUST, Math.min(MAX_TRUST, score));
}

function initTrustScore(gc, userId, member) {
    ensureReputationConfig(gc);
    if (gc.aiControl.trustScores[userId]) return gc.aiControl.trustScores[userId];

    const factors = { ...Object.fromEntries(Object.keys(FACTOR_WEIGHTS).map(k => [k, 0])) };

    if (member) {
        const accountAgeDays = (Date.now() - (member.user?.createdAt?.getTime?.() || Date.now())) / 86400000;
        if (accountAgeDays > 365) factors.accountAge = 15;
        else if (accountAgeDays > 180) factors.accountAge = 10;
        else if (accountAgeDays > 30) factors.accountAge = 5;
        else factors.accountAge = 0;

        const joinedAt = member.joinedAt?.getTime?.();
        if (joinedAt) {
            const serverDays = (Date.now() - joinedAt) / 86400000;
            if (serverDays > 90) factors.serverTime = 15;
            else if (serverDays > 30) factors.serverTime = 10;
            else if (serverDays > 7) factors.serverTime = 5;
            else factors.serverTime = 0;
        }
    }

    const entry = {
        score: calculateScore(factors),
        factors,
        lastActivity: Date.now(),
        lastDecay: Date.now(),
        history: []
    };

    gc.aiControl.trustScores[userId] = entry;
    return entry;
}

function updateTrustFactor(gc, userId, factor, delta, detail) {
    ensureReputationConfig(gc);
    let entry = gc.aiControl.trustScores[userId];
    if (!entry) entry = initTrustScore(gc, userId);

    entry = applyTrustDecay(entry);

    const max = FACTOR_WEIGHTS[factor]?.max || 0;
    const current = entry.factors[factor] || 0;
    if (max >= 0) {
        entry.factors[factor] = Math.min(max, current + delta);
    } else {
        entry.factors[factor] = Math.max(max, current + delta);
    }

    entry.score = calculateScore(entry.factors);
    entry.lastActivity = Date.now();
    entry.lastDecay = Date.now();

    entry.history.unshift({
        factor,
        delta,
        newScore: entry.score,
        detail: detail || null,
        timestamp: Date.now()
    });
    if (entry.history.length > 30) entry.history = entry.history.slice(0, 30);

    console.log(`[AI:REPUTATION] user=${userId} factor=${factor} delta=${delta} score=${entry.score}`);
    return entry;
}

function processSecurityEvent(gc, userId, eventType) {
    const adjustments = {
        spam: { suspiciousActivity: -5, messages: -2 },
        mass_mention: { suspiciousActivity: -8 },
        raid_entry: { raidParticipation: -15, suspiciousActivity: -10 },
        admin_action: { suspiciousActivity: -3 },
        suspicious_link: { suspiciousActivity: -3 },
        invite_link: { suspiciousActivity: -2 },
        role_change: { suspiciousActivity: -5 },
        channel_delete: { suspiciousActivity: -8 },
        permission_change: { suspiciousActivity: -5 },
        bot_create: { suspiciousActivity: -5 },
        mass_kick: { suspiciousActivity: -10 },
        mass_ban: { suspiciousActivity: -15 },
        coordinated_action: { raidParticipation: -12, suspiciousActivity: -10 }
    };

    const adj = adjustments[eventType];
    if (!adj) return;

    for (const [factor, delta] of Object.entries(adj)) {
        updateTrustFactor(gc, userId, factor, delta, eventType);
    }
}

function getCategory(score) {
    if (score >= TRUST_CATEGORIES.TRUSTED.min) return TRUST_CATEGORIES.TRUSTED;
    if (score >= TRUST_CATEGORIES.NORMAL.min) return TRUST_CATEGORIES.NORMAL;
    if (score >= TRUST_CATEGORIES.SUSPICIOUS.min) return TRUST_CATEGORIES.SUSPICIOUS;
    return TRUST_CATEGORIES.DANGEROUS;
}

function getTrustEmbed(gc, userId, userName) {
    ensureReputationConfig(gc);
    const entry = getTrustEntry(gc, userId);
    const score = entry ? applyTrustDecay(entry).score : BASE_TRUST;
    const cat = getCategory(score);
    const factors = entry ? entry.factors : {};

    const fields = Object.entries(FACTOR_WEIGHTS).map(([key, meta]) => {
        const val = factors[key] || 0;
        const emoji = val > 0 ? "✅" : val < 0 ? "❌" : "➖";
        return {
            name: meta.label,
            value: `${emoji} ${val > 0 ? "+" : ""}${val}`,
            inline: true
        };
    });

    return new EmbedBuilder()
        .setColor(cat.color)
        .setTitle(`🧬 Trust Score — ${userName || userId}`)
        .setDescription(`**${score}/100** — ${cat.label}`)
        .addFields(fields)
        .setFooter({ text: "DRAGONS | Sistema de Reputación" })
        .setTimestamp();
}

function getTopTrusted(gc, count = 5) {
    ensureReputationConfig(gc);
    return Object.entries(gc.aiControl.trustScores)
        .map(([userId, entry]) => ({ userId, ...applyTrustDecay(entry) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, count);
}

function getTopSuspicious(gc, count = 5) {
    ensureReputationConfig(gc);
    return Object.entries(gc.aiControl.trustScores)
        .map(([userId, entry]) => ({ userId, ...applyTrustDecay(entry) }))
        .sort((a, b) => a.score - b.score)
        .slice(0, count);
}

module.exports = {
    TRUST_CATEGORIES,
    FACTOR_WEIGHTS,
    BASE_TRUST,
    ensureReputationConfig,
    getTrustEntry,
    getTrustScore,
    initTrustScore,
    updateTrustFactor,
    processSecurityEvent,
    getCategory,
    getTrustEmbed,
    getTopTrusted,
    getTopSuspicious,
    applyTrustDecay
};
