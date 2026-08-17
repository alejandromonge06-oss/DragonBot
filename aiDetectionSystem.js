const incidentSystem = require("./incidentSystem");

const RISK_POINTS = {
    spam: 15,
    mass_mention: 20,
    new_account: 15,
    raid_entry: 25,
    admin_action: 30,
    suspicious_link: 10,
    invite_link: 12,
    role_change: 18,
    channel_delete: 25,
    mass_channel_create: 30,
    mass_role_create: 25,
    mass_role_delete: 30,
    permission_change: 20,
    admin_permission_grant: 35,
    bot_create: 22,
    mass_kick: 28,
    mass_ban: 35,
    coordinated_action: 40,
    repeated_spam: 10,
    emoji_spam: 8,
    message_flood: 12,
    account_age_suspicious: 10,
    raid_behavior: 25
};

const DECAY_RATE_PER_HOUR = 2;
const MIN_SCORE = 0;
const MAX_SCORE = 100;

function ensureDetectionConfig(gc) {
    if (!gc.aiControl) gc.aiControl = {};
    if (!gc.aiControl.detection) {
        gc.aiControl.detection = {
            enabled: true,
            riskScores: {},
            recentEvents: []
        };
    }
    if (!gc.aiControl.detection.riskScores) gc.aiControl.detection.riskScores = {};
    if (!gc.aiControl.detection.recentEvents) gc.aiControl.detection.recentEvents = [];
    if (!gc.aiControl.thresholds) {
        gc.aiControl.thresholds = { low: 30, medium: 60, high: 80, critical: 100 };
    }
    if (!gc.aiControl.actions) {
        gc.aiControl.actions = {
            low: ["log"],
            medium: ["warn", "log"],
            high: ["timeout", "alert", "log"],
            critical: ["quarantine", "alert", "log"],
            raid: ["lockdown", "quarantine", "alert", "log"]
        };
    }
    if (!gc.aiControl.exemptions) {
        gc.aiControl.exemptions = { roles: [], users: [], channels: [] };
    }
    return gc;
}

function getUserRiskScore(gc, userId) {
    ensureDetectionConfig(gc);
    const entry = gc.aiControl.detection.riskScores[userId];
    if (!entry) return { score: 0, signals: [], lastUpdate: null };
    const decayed = applyDecay(entry);
    return decayed;
}

function applyDecay(entry) {
    if (!entry.lastUpdate) return entry;
    const hoursSince = (Date.now() - entry.lastUpdate) / 3600000;
    const decayAmount = Math.floor(hoursSince * DECAY_RATE_PER_HOUR);
    const newScore = Math.max(MIN_SCORE, (entry.score || 0) - decayAmount);
    return { ...entry, score: newScore };
}

function addRiskScore(gc, userId, eventType, extra = {}) {
    ensureDetectionConfig(gc);
    const points = RISK_POINTS[eventType] || 5;

    let entry = gc.aiControl.detection.riskScores[userId] || {
        score: 0,
        signals: [],
        lastUpdate: Date.now()
    };

    entry = applyDecay(entry);
    entry.score = Math.min(MAX_SCORE, entry.score + points);
    entry.lastUpdate = Date.now();

    const signal = {
        type: eventType,
        points: points,
        timestamp: Date.now(),
        detail: extra.detail || null
    };
    entry.signals.push(signal);
    if (entry.signals.length > 50) entry.signals = entry.signals.slice(-50);

    gc.aiControl.detection.riskScores[userId] = entry;

    console.log(`[AI:RISK] user=${userId} type=${eventType} +${points} total=${entry.score}`);

    return entry.score;
}

function isExempt(gc, member) {
    ensureDetectionConfig(gc);
    const exc = gc.aiControl.exemptions || {};

    if (exc.users && exc.users.includes(member?.user?.id)) return true;
    if (exc.channels && exc.channels.includes(member?.channel?.id)) return true;
    if (exc.roles && member?.roles?.cache) {
        for (const role of member.roles.cache.values()) {
            if (exc.roles.includes(role.id)) return true;
        }
    }

    if (gc.security?.exemptRoles && member?.roles?.cache) {
        for (const role of member.roles.cache.values()) {
            if (gc.security.exemptRoles.includes(role.id)) return true;
        }
    }

    return false;
}

function getRiskLevel(gc, score) {
    ensureDetectionConfig(gc);
    const t = gc.aiControl.thresholds;
    if (score >= t.critical) return "critical";
    if (score >= t.high) return "high";
    if (score >= t.medium) return "medium";
    return "low";
}

function getRiskEmoji(level) {
    switch (level) {
        case "critical": return "🔴";
        case "high": return "🟠";
        case "medium": return "🟡";
        default: return "🟢";
    }
}

function recordEvent(gc, event) {
    ensureDetectionConfig(gc);
    const entry = {
        type: event.type,
        userId: event.userId,
        userName: event.userName,
        timestamp: Date.now(),
        detail: event.detail || null,
        riskScore: event.riskScore || 0
    };
    gc.aiControl.detection.recentEvents.unshift(entry);
    if (gc.aiControl.detection.recentEvents.length > 100) {
        gc.aiControl.detection.recentEvents = gc.aiControl.detection.recentEvents.slice(0, 100);
    }
}

function getRecentEvents(gc, count = 20) {
    ensureDetectionConfig(gc);
    return gc.aiControl.detection.recentEvents.slice(0, count);
}

function getTopRiskUsers(gc, count = 5) {
    ensureDetectionConfig(gc);
    const scores = gc.aiControl.detection.riskScores || {};
    return Object.entries(scores)
        .map(([userId, entry]) => ({
            userId,
            ...applyDecay(entry)
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, count);
}

function processEvent(gc, eventData) {
    ensureDetectionConfig(gc);
    if (!gc.aiControl.detection.enabled) return { action: "none", score: 0, level: "low" };

    const { type, userId, userName, member, detail, guild } = eventData;

    if (userId && isExempt(gc, member)) {
        return { action: "exempt", score: 0, level: "low" };
    }

    const score = userId ? addRiskScore(gc, userId, type, { detail }) : 0;
    const level = getRiskLevel(gc, score);

    recordEvent(gc, { type, userId, userName, detail, riskScore: score });

    let actions = [];
    const ac = gc.aiControl.actions[level] || [];
    if (type === "raid" && gc.aiControl.actions.raid) {
        actions = gc.aiControl.actions.raid;
    } else {
        actions = ac;
    }

    let incident = null;
    if (level !== "low" || type === "raid") {
        incident = incidentSystem.recordIncident(gc, {
            type,
            userId,
            userName,
            riskScore: score,
            system: "aiDetection",
            action: actions.join(", "),
            evidence: detail ? [detail] : [],
            description: `Evento detectado: ${type}. Riesgo acumulado: ${score}/100. Nivel: ${level}.`
        });
    }

    console.log(`[AI:DETECTION] type=${type} user=${userName || userId} risk=${score} level=${level} actions=${actions.join(",")}`);

    return { action: actions, score, level, incident };
}

function clearUserScore(gc, userId) {
    ensureDetectionConfig(gc);
    delete gc.aiControl.detection.riskScores[userId];
}

function getSystemStats(gc) {
    ensureDetectionConfig(gc);
    const scores = gc.aiControl.detection.riskScores || {};
    const entries = Object.values(scores);
    return {
        trackedUsers: entries.length,
        highRisk: entries.filter(e => applyDecay(e).score >= (gc.aiControl.thresholds?.high || 80)).length,
        mediumRisk: entries.filter(e => {
            const s = applyDecay(e).score;
            return s >= (gc.aiControl.thresholds?.medium || 60) && s < (gc.aiControl.thresholds?.high || 80);
        }).length,
        lowRisk: entries.filter(e => applyDecay(e).score < (gc.aiControl.thresholds?.medium || 60)).length,
        recentEvents: (gc.aiControl.detection.recentEvents || []).length
    };
}

module.exports = {
    RISK_POINTS,
    DECAY_RATE_PER_HOUR,
    ensureDetectionConfig,
    getUserRiskScore,
    addRiskScore,
    isExempt,
    getRiskLevel,
    getRiskEmoji,
    recordEvent,
    getRecentEvents,
    getTopRiskUsers,
    processEvent,
    clearUserScore,
    getSystemStats
};
