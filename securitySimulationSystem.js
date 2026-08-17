const aiDetectionSystem = require("./aiDetectionSystem");
const incidentSystem = require("./incidentSystem");
const reputationSystem = require("./reputationSystem");

const SIMULATION_TYPES = [
    { id: "raid", label: "⚔️ Raid", desc: "Simula una entrada masiva de usuarios" },
    { id: "spam", label: "📨 Spam", desc: "Simula un ataque de spam" },
    { id: "mass_mention", label: "📣 Mass Mention", desc: "Simula menciones masivas" },
    { id: "bot_raid", label: "🤖 Bot Raid", desc: "Simula entrada de bots" },
    { id: "mass_delete", label: "💥 Eliminación masiva", desc: "Simula eliminación de canales/roles" },
    { id: "role_change", label: "🎭 Cambio de roles", desc: "Simula cambios sospechosos de roles" },
    { id: "permission_change", label: "🔐 Cambio de permisos", desc: "Simula cambios de permisos" }
];

const MOCK_USER_ID = "SIMULATION_TEST_USER";

function runSimulation(gc, simulationType) {
    if (!gc.aiControl) gc.aiControl = {};

    const results = {
        type: simulationType,
        timestamp: Date.now(),
        tests: [],
        score: 0,
        recommendations: 0
    };

    const systems = [
        { name: "Anti-Raid", key: "antiRaid", test: () => testAntiRaid(gc) },
        { name: "Anti-Spam", key: "antiSpam", test: () => testAntiSpam(gc) },
        { name: "Anti-Bot", key: "antiBot", test: () => testAntiBot(gc) },
        { name: "Role Protection", key: "roleProtection", test: () => testRoleProtection(gc) },
        { name: "Lockdown", key: "lockdown", test: () => testLockdown(gc) },
        { name: "Quarantine", key: "quarantine", test: () => testQuarantine(gc) },
        { name: "Incident System", key: "incidents", test: () => testIncidentSystem(gc) },
        { name: "Recovery", key: "recovery", test: () => testRecovery(gc) }
    ];

    for (const sys of systems) {
        const result = sys.test();
        results.tests.push({
            name: sys.name,
            key: sys.key,
            passed: result.passed,
            detail: result.detail,
            score: result.score
        });
    }

    results.score = Math.round(
        results.tests.reduce((sum, t) => sum + t.score, 0) / results.tests.length
    );
    results.recommendations = results.tests.filter(t => !t.passed).length;

    console.log(`[AI:SIMULATION] type=${simulationType} score=${results.score}/100 recommendations=${results.recommendations}`);
    return results;
}

function testAntiRaid(gc) {
    const s = gc.security || {};
    if (s.enabled && s.antiRaid && s.raidThreshold && s.raidWindowMs) {
        return { passed: true, detail: `Umbral: ${s.raidThreshold} / ${s.raidWindowMs / 1000}s`, score: 100 };
    }
    return { passed: false, detail: "Anti-Raid no configurado correctamente", score: 30 };
}

function testAntiSpam(gc) {
    const s = gc.security || {};
    if (s.enabled && s.antiSpam && s.spamLimit && s.spamWindowMs) {
        return { passed: true, detail: `Límite: ${s.spamLimit} msgs / ${s.spamWindowMs / 1000}s`, score: 100 };
    }
    return { passed: false, detail: "Anti-Spam no configurado correctamente", score: 30 };
}

function testAntiBot(gc) {
    const s = gc.security || {};
    if (s.enabled && s.antiBot) {
        return { passed: true, detail: `Acción: ${s.botAction || "alert"}`, score: 100 };
    }
    return { passed: false, detail: "Anti-Bot no configurado", score: 30 };
}

function testRoleProtection(gc) {
    const s = gc.security || {};
    if (s.enabled && s.roleProtection) {
        return { passed: true, detail: `Auto-revert: ${s.roleAutoRevert ? "sí" : "no"}`, score: 100 };
    }
    return { passed: false, detail: "Protección de roles no configurada", score: 40 };
}

function testLockdown(gc) {
    const s = gc.security || {};
    if (s.lockdown) {
        return { passed: true, detail: `Estado: ${s.lockdown.active ? "ACTIVO" : "inactivo"}`, score: 100 };
    }
    return { passed: false, detail: "Sistema de lockdown no disponible", score: 20 };
}

function testQuarantine(gc) {
    const s = gc.security || {};
    if (s.quarantineRole) {
        return { passed: true, detail: `Rol: <@&${s.quarantineRole}>`, score: 100 };
    }
    return { passed: false, detail: "Rol de cuarentena no configurado", score: 20 };
}

function testIncidentSystem(gc) {
    if (gc.aiControl && gc.aiControl.incidents !== undefined) {
        const count = (gc.aiControl.incidents || []).length;
        return { passed: true, detail: `${count} incidentes registrados`, score: 100 };
    }
    return { passed: false, detail: "Sistema de incidentes no inicializado", score: 30 };
}

function testRecovery(gc) {
    if (gc.aiControl && gc.aiControl.recovery) {
        const snaps = (gc.aiControl.recovery.snapshots || []).length;
        return { passed: true, detail: `${snaps} snapshots disponibles`, score: 100 };
    }
    return { passed: false, detail: "Sistema de recuperación no inicializado", score: 40 };
}

function formatSimulationResults(results) {
    const lines = results.tests.map(t => {
        const icon = t.passed ? "✅" : "⚠️";
        return `${icon} ${t.name.padEnd(20)} ${t.detail}`;
    });

    const scoreEmoji = results.score >= 90 ? "🟢" :
        results.score >= 70 ? "🟡" : "🔴";

    return {
        title: "🧪 TEST COMPLETADO",
        lines,
        score: `${scoreEmoji} ${results.score}/100`,
        recommendations: results.recommendations,
        type: results.type,
        timestamp: results.timestamp
    };
}

module.exports = {
    SIMULATION_TYPES,
    runSimulation,
    formatSimulationResults
};
