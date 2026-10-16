const pool = require("../config/db");

// ---------------------------------------------------------------------------
// 1. Get all available activities catalog
// ---------------------------------------------------------------------------
const getActivities = async (req, res) => {
    try {
        const [activities] = await pool.query(
            `SELECT
                id,
                name,
                unit,
                emission_factor,
                description
             FROM activities
             ORDER BY id`
        );

        res.json({
            activities: activities.map(a => ({
                id: a.id,
                name: a.name,
                unit: a.unit,
                emission_factor: Number(a.emission_factor),
                description: a.description
            }))
        });
    } catch (error) {
        console.error("Get activities error:", error.message);
        res.status(500).json({ message: "Failed to fetch activities." });
    }
};

// ---------------------------------------------------------------------------
// 2. Add an activity performed by the authenticated user
// ---------------------------------------------------------------------------
const addUserActivity = async (req, res) => {
    try {
        // Derive user_id strictly from verified JWT token - NO IDOR / BOLA!
        const userId = req.user.id;

        const {
            activity_id,
            quantity,
            frequency,
            activity_date,
            ml_prediction
        } = req.body;

        // Validation
        if (!activity_id || quantity === undefined || frequency === undefined || !activity_date) {
            return res.status(400).json({
                message: "Activity ID, quantity, frequency, and date are required."
            });
        }

        const numQuantity = Number(quantity);
        const numFrequency = Number(frequency);

        if (isNaN(numQuantity) || numQuantity <= 0) {
            return res.status(400).json({
                message: "Quantity must be a positive number greater than 0."
            });
        }

        if (isNaN(numFrequency) || numFrequency <= 0) {
            return res.status(400).json({
                message: "Frequency must be a positive number greater than 0."
            });
        }

        // Validate date format YYYY-MM-DD
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(activity_date)) {
            return res.status(400).json({
                message: "Activity date must be in YYYY-MM-DD format."
            });
        }

        // Fetch activity emission factor
        const [activities] = await pool.query(
            "SELECT id, name, unit, emission_factor FROM activities WHERE id = ?",
            [activity_id]
        );

        if (activities.length === 0) {
            return res.status(404).json({ message: "Activity category not found." });
        }

        const activity = activities[0];

        // Transparent, mathematically verified carbon calculation
        // Total emissions saved = quantity * emission_factor * frequency
        const co2Saved = Number((numQuantity * Number(activity.emission_factor) * numFrequency).toFixed(4));
        const points = Math.max(1, Math.round(co2Saved * 10));

        // Impact categorization based on total weekly CO2 savings
        let impact = "Low";
        if (co2Saved >= 5) {
            impact = "High";
        } else if (co2Saved >= 1) {
            impact = "Medium";
        }

        const [result] = await pool.query(
            `INSERT INTO user_activities
            (
                user_id,
                activity_id,
                quantity,
                frequency,
                co2_saved,
                points,
                impact,
                ml_prediction,
                activity_date
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userId,
                activity_id,
                numQuantity,
                numFrequency,
                co2Saved,
                points,
                impact,
                ml_prediction ? String(ml_prediction).trim() : null,
                activity_date
            ]
        );

        const activityRecordId = result.insertId || (result.rows && result.rows[0] ? result.rows[0].id : null);

        res.status(201).json({
            message: "Green activity recorded successfully.",
            activity: {
                id: activityRecordId,
                user_id: userId,
                activity_id: activity.id,
                activity_name: activity.name,
                unit: activity.unit,
                quantity: numQuantity,
                frequency: numFrequency,
                co2_saved: Number(co2Saved.toFixed(2)),
                points: points,
                impact: impact,
                ml_prediction: ml_prediction || null,
                activity_date: activity_date
            }
        });
    } catch (error) {
        console.error("Add activity error:", error.message);
        res.status(500).json({ message: "Failed to record activity." });
    }
};

// ---------------------------------------------------------------------------
// 3. Get activity history for user (enforcing ownership or admin role)
// ---------------------------------------------------------------------------
const getUserActivityHistory = async (req, res) => {
    try {
        const targetUserId = Number(req.params.userId);

        if (!targetUserId || isNaN(targetUserId)) {
            return res.status(400).json({ message: "Valid user ID is required." });
        }

        // Authorization check: User can only see their own activities unless ADMIN
        if (req.user.id !== targetUserId && req.user.role !== "ADMIN") {
            return res.status(403).json({
                message: "Access denied. You can only view your own activity history."
            });
        }

        const [activities] = await pool.query(
            `SELECT
                ua.id,
                ua.user_id,
                a.id AS activity_id,
                a.name AS activity_name,
                a.unit,
                ua.quantity,
                ua.frequency,
                ua.co2_saved,
                ua.points,
                ua.impact,
                ua.ml_prediction,
                ua.activity_date,
                ua.created_at
             FROM user_activities ua
             JOIN activities a ON ua.activity_id = a.id
             WHERE ua.user_id = ?
             ORDER BY ua.activity_date DESC, ua.created_at DESC`,
            [targetUserId]
        );

        res.json({
            user_id: targetUserId,
            total_activities: activities.length,
            activities: activities.map(act => ({
                id: act.id,
                user_id: act.user_id,
                activity_id: act.activity_id,
                activity_name: act.activity_name,
                unit: act.unit,
                quantity: Number(act.quantity),
                frequency: Number(act.frequency),
                co2_saved: Number(Number(act.co2_saved).toFixed(2)),
                points: Number(act.points),
                impact: act.impact,
                ml_prediction: act.ml_prediction,
                activity_date: act.activity_date,
                created_at: act.created_at
            }))
        });
    } catch (error) {
        console.error("Get activity history error:", error.message);
        res.status(500).json({ message: "Failed to fetch activity history." });
    }
};

module.exports = {
    getActivities,
    addUserActivity,
    getUserActivityHistory
};