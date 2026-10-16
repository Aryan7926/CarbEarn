const pool = require("../config/db");

const getDashboardSummary = async (req, res) => {
    try {
        const targetUserId = Number(req.params.userId);

        if (!targetUserId || isNaN(targetUserId)) {
            return res.status(400).json({ message: "Valid user ID is required." });
        }

        // Authorization check: User can only see their own dashboard unless ADMIN
        if (req.user.id !== targetUserId && req.user.role !== "ADMIN") {
            return res.status(403).json({
                message: "Access denied. You can only view your own dashboard."
            });
        }

        // Check whether user exists
        const [users] = await pool.query(
            `SELECT id, name, email, college, role, created_at
             FROM users
             WHERE id = ?`,
            [targetUserId]
        );

        if (users.length === 0) {
            return res.status(404).json({ message: "User not found." });
        }

        const user = users[0];

        // Overall statistics
        const [summary] = await pool.query(
            `SELECT
                COUNT(*) AS total_activities,
                COALESCE(SUM(co2_saved), 0) AS total_co2_saved,
                COALESCE(SUM(points), 0) AS total_points,
                COALESCE(SUM(CASE WHEN impact = 'Low' THEN 1 ELSE 0 END), 0) AS low_impact,
                COALESCE(SUM(CASE WHEN impact = 'Medium' THEN 1 ELSE 0 END), 0) AS medium_impact,
                COALESCE(SUM(CASE WHEN impact = 'High' THEN 1 ELSE 0 END), 0) AS high_impact
             FROM user_activities
             WHERE user_id = ?`,
            [targetUserId]
        );

        const data = summary[0] || {};
        const totalCO2 = Number(Number(data.total_co2_saved || 0).toFixed(2));
        const totalPoints = Number(data.total_points || 0);
        const totalActivities = Number(data.total_activities || 0);

        // GreenProof tree statistics for dashboard integration
        const [trees] = await pool.query(
            `SELECT 
                COUNT(*) AS total_trees,
                COALESCE(SUM(CASE WHEN status = 'Surviving' THEN 1 ELSE 0 END), 0) AS surviving_trees
             FROM trees
             WHERE user_id = ?`,
            [targetUserId]
        );

        const treeData = trees[0] || {};

        // Overall environmental impact level
        let overallImpact = "Low";
        if (totalCO2 >= 20) {
            overallImpact = "High";
        } else if (totalCO2 >= 5) {
            overallImpact = "Medium";
        }

        // Recent 5 activities
        const [recentActivities] = await pool.query(
            `SELECT
                ua.id,
                a.name AS activity_name,
                a.unit,
                ua.quantity,
                ua.frequency,
                ua.co2_saved,
                ua.points,
                ua.impact,
                ua.ml_prediction,
                ua.activity_date
             FROM user_activities ua
             JOIN activities a ON ua.activity_id = a.id
             WHERE ua.user_id = ?
             ORDER BY ua.activity_date DESC, ua.created_at DESC
             LIMIT 5`,
            [targetUserId]
        );

        res.json({
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                college: user.college,
                role: user.role
            },
            summary: {
                total_activities: totalActivities,
                total_co2_saved: totalCO2,
                total_points: totalPoints,
                overall_impact: overallImpact,
                total_trees: Number(treeData.total_trees || 0),
                surviving_trees: Number(treeData.surviving_trees || 0)
            },
            impact_breakdown: {
                low: Number(data.low_impact || 0),
                medium: Number(data.medium_impact || 0),
                high: Number(data.high_impact || 0)
            },
            recent_activities: recentActivities.map(activity => ({
                id: activity.id,
                activity_name: activity.activity_name,
                unit: activity.unit,
                quantity: Number(activity.quantity),
                frequency: Number(activity.frequency),
                co2_saved: Number(Number(activity.co2_saved).toFixed(2)),
                points: Number(activity.points),
                impact: activity.impact,
                ml_prediction: activity.ml_prediction || null,
                activity_date: activity.activity_date
            }))
        });
    } catch (error) {
        console.error("Dashboard error:", error.message);
        res.status(500).json({ message: "Failed to fetch dashboard data." });
    }
};

module.exports = {
    getDashboardSummary
};