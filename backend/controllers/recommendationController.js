const pool = require("../config/db");

const getRecommendation = async (req, res) => {
    try {
        const targetUserId = Number(req.params.userId);

        if (!targetUserId || isNaN(targetUserId)) {
            return res.status(400).json({ message: "Valid user ID is required." });
        }

        // Authorization check
        if (req.user.id !== targetUserId && req.user.role !== "ADMIN") {
            return res.status(403).json({
                message: "Access denied. You can only view your own recommendations."
            });
        }

        // Get user's recent activities
        const [activities] = await pool.query(
            `SELECT
                a.name AS activity_name,
                ua.quantity,
                ua.frequency,
                ua.co2_saved,
                ua.impact,
                ua.ml_prediction
             FROM user_activities ua
             JOIN activities a ON ua.activity_id = a.id
             WHERE ua.user_id = ?
             ORDER BY ua.activity_date DESC, ua.created_at DESC
             LIMIT 15`,
            [targetUserId]
        );

        if (activities.length === 0) {
            return res.json({
                user_id: targetUserId,
                based_on_activity: "None yet",
                recommendation: "Kick off your green habits by logging a walk, cycling trip, or tree planting.",
                reason: "Recording your first sustainable activity helps establish your carbon baseline."
            });
        }

        // Tally activity occurrences
        const activityCounts = {};
        for (const act of activities) {
            const name = act.activity_name;
            activityCounts[name] = (activityCounts[name] || 0) + 1;
        }

        // Identify most frequent activity
        let mostFrequent = activities[0].activity_name;
        let highestCount = 0;
        for (const [name, count] of Object.entries(activityCounts)) {
            if (count > highestCount) {
                highestCount = count;
                mostFrequent = name;
            }
        }

        // Context-aware sustainability recommendations
        const recMap = {
            "cycling": {
                rec: "Integrate cycling with mass transit for mid-distance commutes.",
                reason: "Cycling is your most active category. Intermodal transit expands your clean travel radius."
            },
            "walking": {
                rec: "Scale up daily walking for errands under 2 kilometers.",
                reason: "Short walking trips replace fossil vehicular cold-starts which produce the highest emissions per kilometer."
            },
            "public transport": {
                rec: "Advocate shared transit routes with campus peers or schedule multi-stop errands.",
                reason: "Bus and rail travel minimize per-capita urban congestion and carbon output."
            },
            "carpooling": {
                rec: "Coordinate scheduled shared carpools to maximize vehicle passenger occupancy.",
                reason: "Higher vehicle occupancy directly divides passenger vehicle emissions among commuters."
            },
            "tree planting": {
                rec: "Log regular GreenProof inspections to ensure your planted saplings thrive and survive.",
                reason: "Ongoing tree care and root establishment maximize long-term biological carbon sequestration."
            },
            "led usage": {
                rec: "Pair LED efficiency with smart power strips to prevent vampire load draw.",
                reason: "Solid-state lighting saves energy, and eliminating standby draws captures additional savings."
            },
            "electricity saving": {
                rec: "Conduct an off-peak power review and unplug idle chargers and monitors.",
                reason: "Direct electrical conservation reduces grid load during high-carbon peak hours."
            },
            "reusable bottle": {
                rec: "Adopt reusable containers for hot drinks and food containers as well.",
                reason: "Expanding beyond water bottles systematically reduces single-use plastic waste cycles."
            }
        };

        const key = mostFrequent.toLowerCase().trim();
        const recommendation = recMap[key]?.rec || "Maintain your current routine and diversify into complementary green practices.";
        const reason = recMap[key]?.reason || "Balancing different eco-friendly actions yields consistent long-term environmental benefits.";

        res.json({
            user_id: targetUserId,
            based_on_activity: mostFrequent,
            recommendation,
            reason
        });
    } catch (error) {
        console.error("Recommendation error:", error.message);
        res.status(500).json({ message: "Failed to generate recommendation." });
    }
};

module.exports = {
    getRecommendation
};