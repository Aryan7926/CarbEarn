const pool = require("../config/db");
const bcrypt = require("bcryptjs");

// ---------------------------------------------------------------------------
// 1. Admin System Overview
// ---------------------------------------------------------------------------
const getAdminOverview = async (req, res) => {
    try {
        // Exclude administrators: count only genuine contributors / users
        const [userCount] = await pool.query(
            "SELECT COUNT(*) AS totalUsers FROM users WHERE role = 'USER'"
        );

        const [activityCount] = await pool.query(
            "SELECT COUNT(*) AS totalActivities FROM user_activities"
        );

        const [carbonStats] = await pool.query(
            `SELECT
                COALESCE(SUM(co2_saved), 0) AS totalCO2Saved,
                COALESCE(SUM(carbon_currency), 0) AS totalCBC,
                COUNT(DISTINCT user_id) AS activeUsers
             FROM user_activities`
        );

        const [pendingActivityCount] = await pool.query(
            "SELECT COUNT(*) AS pendingActivities FROM user_activities WHERE verification_status = 'Pending'"
        );

        // GreenProof tree analytics
        const [treeStats] = await pool.query(
            `SELECT 
                COUNT(*) AS totalTrees,
                COALESCE(SUM(CASE WHEN status = 'Surviving' THEN 1 ELSE 0 END), 0) AS survivingTrees
             FROM trees`
        );

        const [pendingChecks] = await pool.query(
            "SELECT COUNT(*) AS pendingReviews FROM care_logs WHERE verification_status = 'Pending'"
        );

        const [pendingTrees] = await pool.query(
            "SELECT COUNT(*) AS pendingTrees FROM trees WHERE verification_status = 'Pending'"
        );

        const uCount = userCount[0] || {};
        const aCount = activityCount[0] || {};
        const cStats = carbonStats[0] || {};
        const tStats = treeStats[0] || {};
        const pChecks = pendingChecks[0] || {};
        const pTrees = pendingTrees[0] || {};
        const pActs = pendingActivityCount[0] || {};

        const totalCO2 = Number(Number(cStats.totalCO2Saved || 0).toFixed(2));
        const totalMintedCBC = Number(Number(cStats.verified_cbc !== undefined ? cStats.verified_cbc : totalCO2).toFixed(4));
        const pendingCBC = Number(Number(cStats.pending_cbc || 0).toFixed(4));

        res.json({
            totalUsers: Number(uCount.totalUsers || 0),
            totalActivities: Number(aCount.totalActivities || 0),
            totalCO2Saved: totalCO2,
            activeUsers: Number(cStats.activeUsers || 0),
            totalTrees: Number(tStats.totalTrees || 0),
            survivingTrees: Number(tStats.survivingTrees || 0),
            pendingReviews: Number(pChecks.pendingReviews || 0),
            pendingTrees: Number(pTrees.pendingTrees || 0),
            pendingActivities: Number(pActs.pendingActivities || 0),
            carbon_currency: {
                total_minted_cbc: totalMintedCBC,
                pending_cbc: pendingCBC,
                fiat_usd: Number((totalMintedCBC * 0.030).toFixed(2)),
                fiat_inr: Number((totalMintedCBC * 2.50).toFixed(2))
            }
        });
    } catch (error) {
        console.error("Admin overview error:", error.message);
        res.status(500).json({ message: "Failed to load admin overview metrics." });
    }
};

// ---------------------------------------------------------------------------
// 2. Admin User Directory (Strictly contributors, excluding admins)
// ---------------------------------------------------------------------------
const getAdminUsers = async (req, res) => {
    try {
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "50", 10)));
        const offset = Math.max(0, parseInt(req.query.offset || "0", 10));

        const [users] = await pool.query(
            `SELECT
                u.id,
                u.name,
                u.email,
                u.college,
                u.role,
                u.created_at,
                COUNT(ua.id) AS activity_count,
                COALESCE(SUM(ua.co2_saved), 0) AS total_co2,
                COALESCE(SUM(ua.points), 0) AS total_points
             FROM users u
             LEFT JOIN user_activities ua ON u.id = ua.user_id
             WHERE u.role = 'USER'
             GROUP BY u.id, u.name, u.email, u.college, u.role, u.created_at
             ORDER BY u.id DESC
             LIMIT ? OFFSET ?`,
            [limit, offset]
        );

        res.json(users.map(u => ({
            id: u.id,
            name: u.name,
            email: u.email,
            college: u.college,
            role: u.role,
            created_at: u.created_at,
            activity_count: Number(u.activity_count || 0),
            total_co2: Number(Number(u.total_co2 || 0).toFixed(2)),
            total_points: Number(u.total_points || 0),
            carbon_currency: Number(Number(u.total_co2 || 0).toFixed(4))
        })));
    } catch (error) {
        console.error("Admin users error:", error.message);
        res.status(500).json({ message: "Failed to load user list." });
    }
};

// ---------------------------------------------------------------------------
// 3. Admin Recent System-wide Activities
// ---------------------------------------------------------------------------
const getRecentAdminActivities = async (req, res) => {
    try {
        const [activities] = await pool.query(
            `SELECT
                ua.id,
                u.name AS user_name,
                u.email AS user_email,
                a.name AS activity_name,
                ua.quantity,
                a.unit,
                ua.frequency,
                ua.co2_saved,
                ua.carbon_currency,
                ua.points,
                ua.impact,
                ua.verification_status,
                ua.activity_date,
                ua.created_at
             FROM user_activities ua
             JOIN users u ON ua.user_id = u.id
             JOIN activities a ON ua.activity_id = a.id
             ORDER BY ua.created_at DESC
             LIMIT 25`
        );

        res.json(activities.map(act => ({
            id: act.id,
            user_name: act.user_name,
            user_email: act.user_email,
            activity_name: act.activity_name,
            quantity: Number(act.quantity),
            unit: act.unit,
            frequency: Number(act.frequency),
            co2_saved: Number(Number(act.co2_saved).toFixed(2)),
            carbon_currency: Number(act.carbon_currency !== undefined ? act.carbon_currency : act.co2_saved),
            points: Number(act.points),
            impact: act.impact,
            verification_status: act.verification_status || "Pending",
            activity_date: act.activity_date,
            created_at: act.created_at
        })));
    } catch (error) {
        console.error("Admin activities error:", error.message);
        res.status(500).json({ message: "Failed to load recent activities." });
    }
};

// ---------------------------------------------------------------------------
// 4. Pending Activities Verification Queue
// ---------------------------------------------------------------------------
const getPendingActivities = async (req, res) => {
    try {
        const [pending] = await pool.query(
            `SELECT
                ua.id,
                ua.user_id,
                u.name AS student_name,
                u.email AS student_email,
                u.college AS student_college,
                a.name AS activity_name,
                a.unit,
                ua.quantity,
                ua.frequency,
                ua.co2_saved,
                ua.carbon_currency,
                ua.points,
                ua.impact,
                ua.verification_status,
                ua.ml_prediction,
                ua.activity_date,
                ua.certificate_hash,
                ua.created_at
             FROM user_activities ua
             JOIN users u ON ua.user_id = u.id
             JOIN activities a ON ua.activity_id = a.id
             WHERE ua.verification_status = 'Pending'
             ORDER BY ua.created_at DESC`
        );

        res.json({
            total_pending: pending.length,
            activities: pending.map(act => {
                const co2 = Number(act.co2_saved || 0);
                const cbc = Number(act.carbon_currency !== undefined ? act.carbon_currency : co2);
                return {
                    id: act.id,
                    user_id: act.user_id,
                    student_name: act.student_name,
                    student_email: act.student_email,
                    student_college: act.student_college,
                    activity_name: act.activity_name,
                    unit: act.unit,
                    quantity: Number(act.quantity),
                    frequency: Number(act.frequency),
                    co2_saved: Number(co2.toFixed(2)),
                    carbon_currency: Number(cbc.toFixed(4)),
                    milli_cbc: Math.round(cbc * 1000),
                    points: Number(act.points),
                    impact: act.impact,
                    verification_status: act.verification_status || "Pending",
                    ml_prediction: act.ml_prediction,
                    activity_date: act.activity_date,
                    certificate_hash: act.certificate_hash,
                    created_at: act.created_at
                };
            })
        });
    } catch (error) {
        console.error("Pending activities error:", error.message);
        res.status(500).json({ message: "Failed to load pending activities." });
    }
};

// ---------------------------------------------------------------------------
// 5. Authorize / Verify or Reject a User Activity (Mint Carbon Currency)
// ---------------------------------------------------------------------------
const verifyActivity = async (req, res) => {
    try {
        const activityId = Number(req.params.id);
        const { status, review_notes } = req.body;
        const reviewerId = req.user.id;

        if (!activityId || isNaN(activityId)) {
            return res.status(400).json({ message: "Valid activity ID is required." });
        }

        const validStatuses = ["Verified", "Rejected"];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({
                message: `Status must be either 'Verified' or 'Rejected'. Received: ${status}`
            });
        }

        // Fetch activity
        const [records] = await pool.query(
            "SELECT * FROM user_activities WHERE id = ?",
            [activityId]
        );

        if (!records || records.length === 0) {
            return res.status(404).json({ message: "Activity record not found." });
        }

        const act = records[0];

        await pool.query(
            `UPDATE user_activities
             SET verification_status = ?, reviewer_id = ?, review_notes = ?, reviewed_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [
                status,
                reviewerId,
                review_notes ? String(review_notes).trim() : null,
                activityId
            ]
        );

        const mintedCBC = Number(act.carbon_currency !== undefined ? act.carbon_currency : act.co2_saved);

        res.json({
            message: status === "Verified"
                ? `Activity verified! ${mintedCBC.toFixed(2)} Carbon Currency (CBC) authorized and minted.`
                : "Activity rejected with reviewer notes.",
            activity_id: activityId,
            verification_status: status,
            carbon_currency: mintedCBC,
            review_notes: review_notes || null
        });
    } catch (error) {
        console.error("Verify activity error:", error.message);
        res.status(500).json({ message: "Failed to update activity verification status." });
    }
};

// ---------------------------------------------------------------------------
// 6. Bulk Authorize All Pending Activities
// ---------------------------------------------------------------------------
const batchVerifyActivities = async (req, res) => {
    try {
        const reviewerId = req.user.id;

        const [result] = await pool.query(
            `UPDATE user_activities
             SET verification_status = 'Verified', reviewer_id = ?, reviewed_at = CURRENT_TIMESTAMP
             WHERE verification_status = 'Pending'`,
            [reviewerId]
        );

        res.json({
            message: "Batch activity authorization completed successfully.",
            authorized_count: result.affectedRows || 0
        });
    } catch (error) {
        console.error("Batch verify error:", error.message);
        res.status(500).json({ message: "Failed to batch authorize activities." });
    }
};

// ---------------------------------------------------------------------------
// 7. List System Administrators
// ---------------------------------------------------------------------------
const getAdminList = async (req, res) => {
    try {
        const [admins] = await pool.query(
            `SELECT id, name, email, college, role, created_at
             FROM users
             WHERE role = 'ADMIN'
             ORDER BY id ASC`
        );

        res.json(admins.map(a => ({
            id: a.id,
            name: a.name,
            email: a.email,
            college: a.college,
            role: a.role,
            created_at: a.created_at
        })));
    } catch (error) {
        console.error("Admin list error:", error.message);
        res.status(500).json({ message: "Failed to load administrators list." });
    }
};

// ---------------------------------------------------------------------------
// 8. Register New Administrator
// ---------------------------------------------------------------------------
const createAdmin = async (req, res) => {
    try {
        const { name, email, password, college } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: "Name, email, and password are required." });
        }

        const cleanEmail = String(email).trim().toLowerCase();
        const cleanName = String(name).trim();
        const cleanCollege = college ? String(college).trim() : "CarbEarn Administration";

        const [existing] = await pool.query(
            "SELECT id FROM users WHERE LOWER(email) = ?",
            [cleanEmail]
        );

        if (existing.length > 0) {
            return res.status(409).json({ message: "An account with this email already exists." });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters long." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const [result] = await pool.query(
            `INSERT INTO users (name, email, password, college, role)
             VALUES (?, ?, ?, ?, ?)`,
            [cleanName, cleanEmail, hashedPassword, cleanCollege, "ADMIN"]
        );

        res.status(201).json({
            message: "Administrator registered successfully.",
            adminId: result.insertId || (result.rows && result.rows[0] ? result.rows[0].id : null)
        });
    } catch (error) {
        console.error("Create admin error:", error.message);
        res.status(500).json({ message: "Failed to create administrator." });
    }
};

module.exports = {
    getAdminOverview,
    getAdminUsers,
    getRecentAdminActivities,
    getPendingActivities,
    verifyActivity,
    batchVerifyActivities,
    getAdminList,
    createAdmin
};