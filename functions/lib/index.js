"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onUserLogin = void 0;
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
const firestore_1 = require("firebase-admin/firestore");
const identity_1 = require("firebase-functions/v2/identity");
const v2_1 = require("firebase-functions/v2");
(0, app_1.initializeApp)();
const auth = (0, auth_1.getAuth)();
const db = (0, firestore_1.getFirestore)();
function getAutoApprovedRole(email) {
    const autoApprovedAdmins = process.env.AUTO_APPROVED_ADMIN_EMAILS?.split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean) ?? [];
    if (autoApprovedAdmins.includes(email.trim().toLowerCase())) {
        return "admin";
    }
    return null;
}
async function writeAuditLog(entry) {
    const ref = db.collection("audit_log").doc();
    await ref.set({ ...entry, logId: ref.id, timestamp: firestore_1.Timestamp.now() });
}
/**
 * onUserLogin — Firebase Auth blocking trigger (beforeUserSignedIn).
 *
 * Fires on every sign-in attempt before the token is issued.
 * Checks whether the user has a pre-approved record in Firestore (by email).
 * If found, sets custom claims { role, approved: true } and migrates the
 * sentinel doc to the real uid so subsequent sign-ins are instant.
 */
exports.onUserLogin = (0, identity_1.beforeUserSignedIn)(async (event) => {
    if (!event.data) {
        v2_1.logger.warn("onUserLogin: missing auth payload");
        return;
    }
    const { uid, email, displayName } = event.data;
    if (!email) {
        v2_1.logger.warn("onUserLogin: user has no email, skipping", { uid });
        return;
    }
    const now = firestore_1.Timestamp.now();
    const autoApprovedRole = getAutoApprovedRole(email);
    // Check if a real user doc already exists
    const existingSnap = await db.collection("users").doc(uid).get();
    if (existingSnap.exists) {
        // User already registered — just update lastLoginAt
        const existingUser = existingSnap.data();
        if (autoApprovedRole && (!existingUser.approved || existingUser.role !== autoApprovedRole)) {
            await auth.setCustomUserClaims(uid, { role: autoApprovedRole, approved: true });
            await db.collection("users").doc(uid).update({
                role: autoApprovedRole,
                approved: true,
                preAdded: true,
                addedBy: existingUser.addedBy ?? "system",
                lastLoginAt: now,
            });
            await writeAuditLog({
                actorUid: "system",
                actorEmail: "system",
                targetUid: uid,
                targetEmail: email,
                action: "role_assigned",
                oldRole: existingUser.role,
                newRole: autoApprovedRole,
            });
            v2_1.logger.info("onUserLogin: auto-approved admin refreshed", { uid, email, role: autoApprovedRole });
            return;
        }
        await db.collection("users").doc(uid).update({ lastLoginAt: now });
        return;
    }
    if (autoApprovedRole) {
        await auth.setCustomUserClaims(uid, { role: autoApprovedRole, approved: true });
        const userDoc = {
            uid,
            email,
            displayName: displayName ?? null,
            role: autoApprovedRole,
            approved: true,
            preAdded: true,
            addedBy: "system",
            createdAt: now,
            lastLoginAt: now,
        };
        await db.collection("users").doc(uid).set(userDoc);
        await writeAuditLog({
            actorUid: "system",
            actorEmail: "system",
            targetUid: uid,
            targetEmail: email,
            action: "role_assigned",
            oldRole: null,
            newRole: autoApprovedRole,
        });
        v2_1.logger.info("onUserLogin: auto-approved admin registered", { uid, email, role: autoApprovedRole });
        return;
    }
    // Look for a pre-approved sentinel record by email
    const sentinelId = `pre:${email}`;
    const sentinelSnap = await db.collection("users").doc(sentinelId).get();
    if (!sentinelSnap.exists) {
        // No pre-add record — create a pending user doc (awaiting admin approval)
        const pendingDoc = {
            uid,
            email,
            displayName: displayName ?? null,
            role: "viewer",
            approved: false,
            preAdded: false,
            addedBy: null,
            createdAt: now,
            lastLoginAt: now,
        };
        await db.collection("users").doc(uid).set(pendingDoc);
        v2_1.logger.info("onUserLogin: new user registered, awaiting approval", { uid, email });
        return;
    }
    // Pre-approved record found — promote the user
    const sentinel = sentinelSnap.data();
    const role = sentinel.role;
    // Set custom claims before the token is issued
    await auth.setCustomUserClaims(uid, { role, approved: true });
    // Migrate sentinel to real uid doc
    const userDoc = {
        uid,
        email,
        displayName: displayName ?? null,
        role,
        approved: true,
        preAdded: true,
        addedBy: sentinel.addedBy,
        createdAt: now,
        lastLoginAt: now,
    };
    const batch = db.batch();
    batch.set(db.collection("users").doc(uid), userDoc);
    batch.delete(db.collection("users").doc(sentinelId));
    await batch.commit();
    await writeAuditLog({
        actorUid: sentinel.addedBy ?? "system",
        actorEmail: "system",
        targetUid: uid,
        targetEmail: email,
        action: "role_assigned",
        oldRole: null,
        newRole: role,
    });
    v2_1.logger.info("onUserLogin: pre-approved user claims set", { uid, email, role });
});
//# sourceMappingURL=index.js.map