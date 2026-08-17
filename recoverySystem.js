const { MessageFlags } = require("discord.js");

const SNAPSHOT_MAX = 20;
const RESTORE_MODES = ["full", "channels", "roles", "permissions", "categories"];

function ensureRecoveryConfig(gc) {
    if (!gc.aiControl) gc.aiControl = {};
    if (!gc.aiControl.recovery) {
        gc.aiControl.recovery = {
            enabled: false,
            autoSnapshot: true,
            snapshots: [],
            snapshotSeq: 0
        };
    }
    if (!gc.aiControl.recovery.snapshots) gc.aiControl.recovery.snapshots = [];
    if (typeof gc.aiControl.recovery.snapshotSeq !== "number") gc.aiControl.recovery.snapshotSeq = 0;
    return gc;
}

async function createSnapshot(guild, gc, reason, createdBy) {
    ensureRecoveryConfig(gc);
    const rec = gc.aiControl.recovery;
    rec.snapshotSeq = (rec.snapshotSeq || 0) + 1;

    const snapshot = {
        id: rec.snapshotSeq,
        reason: reason || "Snapshot automático",
        createdBy: createdBy || "system",
        timestamp: Date.now(),
        channels: [],
        roles: [],
        categories: []
    };

    for (const [, channel] of guild.channels.cache) {
        snapshot.channels.push({
            id: channel.id,
            name: channel.name,
            type: channel.type,
            parentId: channel.parentId,
            topic: channel.topic || null,
            position: channel.position,
            overwrites: channel.permissionOverwrites.cache.map(ow => ({
                id: ow.id,
                type: ow.type,
                allow: ow.allow.toString(),
                deny: ow.deny.toString()
            }))
        });
    }

    for (const [, role] of guild.roles.cache) {
        if (role.id === guild.id) continue;
        snapshot.roles.push({
            id: role.id,
            name: role.name,
            color: role.color,
            position: role.position,
            permissions: role.permissions.toString(),
            mentionable: role.mentionable,
            hoist: role.hoist
        });
    }

    rec.snapshots.unshift(snapshot);
    if (rec.snapshots.length > SNAPSHOT_MAX) {
        rec.snapshots = rec.snapshots.slice(0, SNAPSHOT_MAX);
    }

    console.log(`[AI:RECOVERY] Snapshot #${snapshot.id} creado: ${reason} (${snapshot.channels.length} canales, ${snapshot.roles.length} roles)`);
    return snapshot;
}

function getSnapshots(gc) {
    ensureRecoveryConfig(gc);
    return gc.aiControl.recovery.snapshots || [];
}

function getSnapshot(gc, id) {
    ensureRecoveryConfig(gc);
    return (gc.aiControl.recovery.snapshots || []).find(s => s.id === id) || null;
}

function getLatestSnapshot(gc) {
    ensureRecoveryConfig(gc);
    return (gc.aiControl.recovery.snapshots || [])[0] || null;
}

async function restoreChannels(guild, snapshot, currentConfig) {
    const results = { restored: 0, failed: 0, details: [] };
    for (const chData of snapshot.channels) {
        try {
            const existing = guild.channels.cache.get(chData.id);
            if (existing) {
                await existing.setPosition(chData.position).catch(() => {});
                for (const ow of chData.overwrites) {
                    await existing.permissionOverwrites.edit(ow.id, {
                        allow: ow.allow,
                        deny: ow.deny
                    }).catch(() => {});
                }
                results.restored++;
                results.details.push(`✅ #${chData.name} restaurado`);
            } else {
                results.details.push(`⚠️ #${chData.name} no existe actualmente`);
                results.failed++;
            }
        } catch (e) {
            results.failed++;
            results.details.push(`❌ #${chData.name}: ${e.message}`);
        }
    }
    return results;
}

async function restoreRoles(guild, snapshot) {
    const results = { restored: 0, failed: 0, details: [] };
    for (const roleData of snapshot.roles) {
        try {
            const existing = guild.roles.cache.get(roleData.id);
            if (existing) {
                await existing.setPosition(roleData.position).catch(() => {});
                await existing.setPermissions(roleData.permissions).catch(() => {});
                await existing.setColor(roleData.color).catch(() => {});
                results.restored++;
                results.details.push(`✅ Rol ${roleData.name} restaurado`);
            } else {
                results.details.push(`⚠️ Rol ${roleData.name} ya no existe`);
                results.failed++;
            }
        } catch (e) {
            results.failed++;
            results.details.push(`❌ Rol ${roleData.name}: ${e.message}`);
        }
    }
    return results;
}

async function restorePermissions(guild, snapshot) {
    const results = { restored: 0, failed: 0, details: [] };
    for (const chData of snapshot.channels) {
        try {
            const existing = guild.channels.cache.get(chData.id);
            if (!existing) continue;
            for (const ow of chData.overwrites) {
                await existing.permissionOverwrites.edit(ow.id, {
                    allow: ow.allow,
                    deny: ow.deny
                }).catch(() => {});
            }
            results.restored++;
            results.details.push(`✅ Permisos de #${chData.name} restaurados`);
        } catch (e) {
            results.failed++;
            results.details.push(`❌ Permisos de #${chData.name}: ${e.message}`);
        }
    }
    return results;
}

async function performRestore(guild, gc, snapshotId, mode) {
    const snapshot = getSnapshot(gc, snapshotId);
    if (!snapshot) return { ok: false, error: "Snapshot no encontrado" };

    const preSnapshot = await createSnapshot(guild, gc, `Pre-restauración de Snapshot #${snapshotId}`, "system");

    let results;
    switch (mode) {
        case "channels":
            results = await restoreChannels(guild, snapshot, gc);
            break;
        case "roles":
            results = await restoreRoles(guild, snapshot);
            break;
        case "permissions":
            results = await restorePermissions(guild, snapshot);
            break;
        case "full":
        default:
            const rChannels = await restoreChannels(guild, snapshot, gc);
            const rRoles = await restoreRoles(guild, snapshot);
            results = {
                restored: rChannels.restored + rRoles.restored,
                failed: rChannels.failed + rRoles.failed,
                details: [...rChannels.details, ...rRoles.details]
            };
            break;
    }

    if (!gc.aiControl.stats) gc.aiControl.stats = {};
    gc.aiControl.stats.restorations = (gc.aiControl.stats.restorations || 0) + 1;

    console.log(`[AI:RECOVERY] Restore mode=${mode} snapshot=${snapshotId} restored=${results.restored} failed=${results.failed}`);
    return { ok: true, results, preSnapshot };
}

module.exports = {
    RESTORE_MODES,
    ensureRecoveryConfig,
    createSnapshot,
    getSnapshots,
    getSnapshot,
    getLatestSnapshot,
    performRestore,
    restoreChannels,
    restoreRoles,
    restorePermissions
};
