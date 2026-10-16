const pool = require("../config/db");


const getLeaderboard = async (req, res) => {
    try {

        const [leaderboard] = await pool.query(
            `SELECT
                u.id AS user_id,
                u.name,
                u.college,
                COUNT(ua.id) AS total_activities,
                COALESCE(SUM(ua.co2_saved), 0) AS total_co2_saved,
                COALESCE(SUM(ua.points), 0) AS total_points
             FROM users u
             LEFT JOIN user_activities ua
                ON u.id = ua.user_id
             WHERE u.role = 'USER'
             GROUP BY u.id, u.name, u.college
             ORDER BY total_points DESC`
        );


        const formattedLeaderboard = leaderboard.map((user, index) => {

            return {
                rank: index + 1,
                user_id: user.user_id,
                name: user.name,
                college: user.college,
                total_activities: Number(user.total_activities),
                total_co2_saved: Number(
                    Number(user.total_co2_saved).toFixed(2)
                ),
                total_points: Number(user.total_points)
            };

        });


        res.json({
            total_users: formattedLeaderboard.length,
            leaderboard: formattedLeaderboard
        });


    } catch (error) {

        console.error(
            "Leaderboard error:",
            error.message
        );

        res.status(500).json({
            message: "Failed to fetch leaderboard"
        });
    }
};


module.exports = {
    getLeaderboard
};