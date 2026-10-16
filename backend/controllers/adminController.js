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
                COUNT(DISTINCT user_id) AS activeUsers
             FROM user_activities`
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

        res.json({
            totalUsers: Number(uCount.totalUsers || 0),
            totalActivities: Number(aCount.totalActivities || 0),
            totalCO2Saved: Number(Number(cStats.totalCO2Saved || 0).toFixed(2)),
            activeUsers: Number(cStats.activeUsers || 0),
            totalTrees: Number(tStats.totalTrees || 0),
            survivingTrees: Number(tStats.survivingTrees || 0),
            pendingReviews: Number(pChecks.pendingReviews || 0),
            pendingTrees: Number(pTrees.pendingTrees || 0)
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
            total_points: Number(u.total_points || 0)
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
                a.name AS activity_name,
                ua.quantity,
                a.unit,
                ua.frequency,
                ua.co2_saved,
                ua.points,
                ua.impact,
                ua.activity_date,
                ua.created_at
             FROM user_activities ua
             JOIN users u ON ua.user_id = u.id
             JOIN activities a ON ua.activity_id = a.id
             ORDER BY ua.created_at DESC
             LIMIT 15`
        );

        res.json(activities.map(act => ({
            id: act.id,
            user_name: act.user_name,
            activity_name: act.activity_name,
            quantity: Number(act.quantity),
            unit: act.unit,
            frequency: Number(act.frequency),
            co2_saved: Number(Number(act.co2_saved).toFixed(2)),
            points: Number(act.points),
            impact: act.impact,
            activity_date: act.activity_date,
            created_at: act.created_at
        })));
    } catch (error) {
        console.error("Admin activities error:", error.message);
        res.status(500).json({ message: "Failed to load recent activities." });
    }
};

// ---------------------------------------------------------------------------
// 4. List System Administrators
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
// 5. Register New Administrator
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
    getAdminList,
    createAdmin
};