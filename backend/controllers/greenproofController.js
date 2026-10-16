/**
 * GreenProof Controller - Tree Planting & Tree Care Management
 * 
 * Manages tree registrations, periodic care logs, health inspections,
 * administrative review workflows, and campus sustainability metrics.
 */

const pool = require("../config/db");

// ---------------------------------------------------------------------------
// 1. Register a new tree/sapling
// ---------------------------------------------------------------------------
const registerTree = async (req, res) => {
    try {
        const userId = req.user.id;
        const { species, location, planting_date, notes } = req.body;

        if (!species || !location || !planting_date) {
            return res.status(400).json({
                message: "Species, location, and planting date are required."
            });
        }

        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(planting_date)) {
            return res.status(400).json({
                message: "Planting date must be in YYYY-MM-DD format."
            });
        }

        const query = `
            INSERT INTO trees (user_id, species, location, planting_date, notes, status)
            VALUES (?, ?, ?, ?, ?, 'Planted')
        `;

        const [result] = await pool.query(query, [
            userId,
            species.trim(),
            location.trim(),
            planting_date,
            notes ? notes.trim() : null
        ]);

        const treeId = result.insertId || (result.rows && result.rows[0] ? result.rows[0].id : null);

        res.status(201).json({
            message: "Tree registered successfully in GreenProof registry.",
            tree: {
                id: treeId,
                user_id: userId,
                species: species.trim(),
                location: location.trim(),
                planting_date,
                notes: notes ? notes.trim() : null,
                status: "Planted"
            }
        });
    } catch (error) {
        console.error("Register tree error:", error);
        res.status(500).json({ message: "Failed to register tree." });
    }
};

// ---------------------------------------------------------------------------
// 2. Get user's registered trees with latest inspection status
// ---------------------------------------------------------------------------
const getUserTrees = async (req, res) => {
    try {
        const userId = req.user.id;

        const query = `
            SELECT 
                t.id,
                t.species,
                t.location,
                t.planting_date,
                t.notes,
                t.status,
                t.created_at,
                COUNT(cl.id) AS total_inspections,
                MAX(cl.inspection_date) AS last_inspection_date,
                (SELECT cl2.health_status FROM care_logs cl2 WHERE cl2.tree_id = t.id ORDER BY cl2.inspection_date DESC, cl2.id DESC LIMIT 1) AS latest_health,
                (SELECT cl3.verification_status FROM care_logs cl3 WHERE cl3.tree_id = t.id ORDER BY cl3.inspection_date DESC, cl3.id DESC LIMIT 1) AS latest_verification
            FROM trees t
            LEFT JOIN care_logs cl ON t.id = cl.tree_id
            WHERE t.user_id = ?
            GROUP BY t.id, t.species, t.location, t.planting_date, t.notes, t.status, t.created_at
            ORDER BY t.created_at DESC
        `;

        const [trees] = await pool.query(query, [userId]);

        res.json({
            total_trees: trees.length,
            trees: trees.map(tree => ({
                id: tree.id,
                species: tree.species,
                location: tree.location,
                planting_date: tree.planting_date,
                notes: tree.notes,
                status: tree.status,
                total_inspections: Number(tree.total_inspections || 0),
                last_inspection_date: tree.last_inspection_date || null,
                latest_health: tree.latest_health || "Uninspected",
                latest_verification: tree.latest_verification || "None",
                created_at: tree.created_at
            }))
        });
    } catch (error) {
        console.error("Get user trees error:", error);
        res.status(500).json({ message: "Failed to fetch registered trees." });
    }
};

// ---------------------------------------------------------------------------
// 3. Get single tree details with complete care log history
// ---------------------------------------------------------------------------
const getTreeDetails = async (req, res) => {
    try {
        const treeId = req.params.treeId;
        const userId = req.user.id;
        const isAdmin = req.user.role === "ADMIN";

        const [treeRows] = await pool.query(
            `SELECT t.*, u.name AS owner_name, u.email AS owner_email, u.college AS owner_college
             FROM trees t
             JOIN users u ON t.user_id = u.id
             WHERE t.id = ?`,
            [treeId]
        );

        if (treeRows.length === 0) {
            return res.status(404).json({ message: "Tree record not found." });
        }

        const tree = treeRows[0];

        // Owner check unless admin
        if (!isAdmin && tree.user_id !== userId) {
            return res.status(403).json({ message: "Access denied. You do not own this tree record." });
        }

        const [logs] = await pool.query(
            `SELECT 
                cl.id,
                cl.inspection_date,
                cl.health_status,
                cl.notes,
                cl.evidence_url,
                cl.verification_status,
                cl.review_notes,
                cl.reviewed_at,
                cl.created_at,
                u.name AS reviewer_name
             FROM care_logs cl
             LEFT JOIN users u ON cl.reviewer_id = u.id
             WHERE cl.tree_id = ?
             ORDER BY cl.inspection_date DESC, cl.created_at DESC`,
            [treeId]
        );

        res.json({
            tree,
            care_logs: logs
        });
    } catch (error) {
        console.error("Get tree details error:", error);
        res.status(500).json({ message: "Failed to load tree details." });
    }
};

// ---------------------------------------------------------------------------
// 4. Record a periodic care inspection log
// ---------------------------------------------------------------------------
const addCareLog = async (req, res) => {
    try {
        const treeId = req.params.treeId;
        const userId = req.user.id;
        const { inspection_date, health_status, notes, evidence_url } = req.body;

        if (!inspection_date || !health_status) {
            return res.status(400).json({
                message: "Inspection date and health status are required."
            });
        }

        const validHealth = ["Healthy", "Fair", "Poor", "Critical"];
        if (!validHealth.includes(health_status)) {
            return res.status(400).json({
                message: `Invalid health status. Must be one of: ${validHealth.join(", ")}`
            });
        }

        // Verify tree ownership
        const [trees] = await pool.query(
            "SELECT id, user_id, status FROM trees WHERE id = ?",
            [treeId]
        );

        if (trees.length === 0) {
            return res.status(404).json({ message: "Tree not found." });
        }

        if (trees[0].user_id !== userId && req.user.role !== "ADMIN") {
            return res.status(403).json({ message: "You can only submit care logs for your own trees." });
        }

        const insertQuery = `
            INSERT INTO care_logs (tree_id, user_id, inspection_date, health_status, notes, evidence_url, verification_status)
            VALUES (?, ?, ?, ?, ?, ?, 'Pending')
        `;

        const [result] = await pool.query(insertQuery, [
            treeId,
            userId,
            inspection_date,
            health_status,
            notes ? notes.trim() : null,
            evidence_url ? evidence_url.trim() : null
        ]);

        // Update tree status based on health status observation
        let newTreeStatus = "Under Care";
        if (health_status === "Critical" || health_status === "Poor") {
            newTreeStatus = "Needs Attention";
        } else if (health_status === "Healthy" || health_status === "Fair") {
            newTreeStatus = "Surviving";
        }

        await pool.query(
            "UPDATE trees SET status = ? WHERE id = ?",
            [newTreeStatus, treeId]
        );

        const logId = result.insertId || (result.rows && result.rows[0] ? result.rows[0].id : null);

        res.status(201).json({
            message: "Care log submitted for verification.",
            care_log: {
                id: logId,
                tree_id: Number(treeId),
                inspection_date,
                health_status,
                notes: notes ? notes.trim() : null,
                evidence_url: evidence_url ? evidence_url.trim() : null,
                verification_status: "Pending",
                updated_tree_status: newTreeStatus
            }
        });
    } catch (error) {
        console.error("Add care log error:", error);
        res.status(500).json({ message: "Failed to submit care log." });
    }
};

// ---------------------------------------------------------------------------
// 5. Get overall GreenProof metrics for the user
// ---------------------------------------------------------------------------
const getGreenProofStats = async (req, res) => {
    try {
        const userId = req.user.id;

        const [trees] = await pool.query(
            `SELECT 
                COUNT(*) AS total_trees,
                SUM(CASE WHEN status = 'Surviving' THEN 1 ELSE 0 END) AS surviving_trees,
                SUM(CASE WHEN status = 'Under Care' THEN 1 ELSE 0 END) AS under_care,
                SUM(CASE WHEN status = 'Needs Attention' THEN 1 ELSE 0 END) AS needs_attention,
                SUM(CASE WHEN status = 'Planted' THEN 1 ELSE 0 END) AS planted_count
             FROM trees
             WHERE user_id = ?`,
            [userId]
        );

        const [inspections] = await pool.query(
            `SELECT 
                COUNT(*) AS total_inspections,
                SUM(CASE WHEN verification_status = 'Verified' THEN 1 ELSE 0 END) AS verified_inspections,
                SUM(CASE WHEN verification_status = 'Pending' THEN 1 ELSE 0 END) AS pending_inspections
             FROM care_logs
             WHERE user_id = ?`,
            [userId]
        );

        const treeStats = trees[0] || {};
        const inspStats = inspections[0] || {};

        res.json({
            total_trees: Number(treeStats.total_trees || 0),
            surviving_trees: Number(treeStats.surviving_trees || 0),
            under_care: Number(treeStats.under_care || 0),
            needs_attention: Number(treeStats.needs_attention || 0),
            planted_count: Number(treeStats.planted_count || 0),
            total_inspections: Number(inspStats.total_inspections || 0),
            verified_inspections: Number(inspStats.verified_inspections || 0),
            pending_inspections: Number(inspStats.pending_inspections || 0)
        });
    } catch (error) {
        console.error("GreenProof stats error:", error);
        res.status(500).json({ message: "Failed to load GreenProof metrics." });
    }
};

// ---------------------------------------------------------------------------
// 6. Admin: List pending inspections awaiting verification
// ---------------------------------------------------------------------------
const getPendingReviews = async (req, res) => {
    try {
        const query = `
            SELECT 
                cl.id AS log_id,
                cl.inspection_date,
                cl.health_status,
                cl.notes,
                cl.evidence_url,
                cl.verification_status,
                cl.created_at,
                t.id AS tree_id,
                t.species,
                t.location,
                t.planting_date,
                t.status AS tree_status,
                u.id AS student_id,
                u.name AS student_name,
                u.email AS student_email,
                u.college AS student_college
            FROM care_logs cl
            JOIN trees t ON cl.tree_id = t.id
            JOIN users u ON cl.user_id = u.id
            WHERE cl.verification_status = 'Pending'
            ORDER BY cl.created_at ASC
        `;

        const [reviews] = await pool.query(query);

        res.json({
            count: reviews.length,
            pending_reviews: reviews
        });
    } catch (error) {
        console.error("Get pending reviews error:", error);
        res.status(500).json({ message: "Failed to fetch pending reviews." });
    }
};

// ---------------------------------------------------------------------------
// 7. Admin: Review care inspection (Verify or Reject)
// ---------------------------------------------------------------------------
const reviewCareLog = async (req, res) => {
    try {
        const logId = req.params.logId;
        const reviewerId = req.user.id;
        const { verification_status, review_notes } = req.body;

        if (!["Verified", "Rejected"].includes(verification_status)) {
            return res.status(400).json({
                message: "verification_status must be 'Verified' or 'Rejected'."
            });
        }

        const [logs] = await pool.query(
            "SELECT id, tree_id, user_id FROM care_logs WHERE id = ?",
            [logId]
        );

        if (logs.length === 0) {
            return res.status(404).json({ message: "Care log record not found." });
        }

        const log = logs[0];

        await pool.query(
            `UPDATE care_logs 
             SET verification_status = ?, reviewer_id = ?, review_notes = ?, reviewed_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [verification_status, reviewerId, review_notes ? review_notes.trim() : null, logId]
        );

        // If verified, award verification bonus points to user (e.g. 25 points for verified care inspection)
        if (verification_status === "Verified") {
            // Find Tree Planting activity ID
            const [activities] = await pool.query(
                "SELECT id, emission_factor FROM activities WHERE name = ? LIMIT 1",
                ["Tree Planting"]
            );

            if (activities.length > 0) {
                const activityId = activities[0].id;
                // Add verified tree care activity bonus
                await pool.query(
                    `INSERT INTO user_activities 
                     (user_id, activity_id, quantity, frequency, co2_saved, points, impact, ml_prediction, activity_date)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        log.user_id,
                        activityId,
                        1,
                        1,
                        2.50,
                        25,
                        "Medium",
                        "Verified Tree Care",
                        new Date().toISOString().split("T")[0]
                    ]
                );
            }
        }

        res.json({
            message: `Care log marked as ${verification_status}.`,
            log_id: Number(logId),
            verification_status,
            reviewed_at: new Date().toISOString()
        });
    } catch (error) {
        console.error("Review care log error:", error);
        res.status(500).json({ message: "Failed to process review." });
    }
};

// ---------------------------------------------------------------------------
// 8. Admin: Get pending tree registrations awaiting audit
// ---------------------------------------------------------------------------
const getPendingTrees = async (req, res) => {
    try {
        const query = `
            SELECT 
                t.id AS tree_id,
                t.species,
                t.location,
                t.planting_date,
                t.notes,
                t.status,
                t.created_at,
                t.user_id,
                u.name AS student_name,
                u.email AS student_email,
                u.college AS student_college
            FROM trees t
            JOIN users u ON t.user_id = u.id
            WHERE t.verification_status = 'Pending'
            ORDER BY t.created_at ASC
        `;

        const [trees] = await pool.query(query);

        res.json({
            count: trees.length,
            pending_trees: trees
        });
    } catch (error) {
        console.error("Get pending trees error:", error);
        res.status(500).json({ message: "Failed to fetch pending tree registrations." });
    }
};

// ---------------------------------------------------------------------------
// 9. Admin: Review tree registration (Verify/Correct or Reject/Incorrect)
// ---------------------------------------------------------------------------
const reviewTreeRegistration = async (req, res) => {
    try {
        const treeId = req.params.treeId;
        const { verification_status, admin_notes } = req.body;

        if (!["Verified", "Rejected"].includes(verification_status)) {
            return res.status(400).json({
                message: "verification_status must be 'Verified' (Correct) or 'Rejected' (Incorrect)."
            });
        }

        const [trees] = await pool.query(
            "SELECT id, user_id, species FROM trees WHERE id = ?",
            [treeId]
        );

        if (trees.length === 0) {
            return res.status(404).json({ message: "Tree record not found." });
        }

        const tree = trees[0];
        const newStatus = verification_status === "Verified" ? "Surviving" : "Rejected";

        await pool.query(
            `UPDATE trees 
             SET verification_status = ?, status = ?, admin_notes = ? 
             WHERE id = ?`,
            [verification_status, newStatus, admin_notes ? admin_notes.trim() : null, treeId]
        );

        // If verified as correct, award 50 Carbon Points and record planting activity!
        if (verification_status === "Verified") {
            const [activities] = await pool.query(
                "SELECT id FROM activities WHERE name = ? LIMIT 1",
                ["Tree Planting"]
            );

            if (activities.length > 0) {
                const activityId = activities[0].id;
                await pool.query(
                    `INSERT INTO user_activities 
                     (user_id, activity_id, quantity, frequency, co2_saved, points, impact, ml_prediction, activity_date)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        tree.user_id,
                        activityId,
                        1,
                        1,
                        21.77,
                        50,
                        "High",
                        "Verified Sapling Planting",
                        new Date().toISOString().split("T")[0]
                    ]
                );
            }
        }

        res.json({
            message: `Tree registration successfully marked as ${verification_status === "Verified" ? "Correct (Verified)" : "Incorrect (Rejected)"}.`,
            tree_id: Number(treeId),
            verification_status,
            status: newStatus,
            points_awarded: verification_status === "Verified" ? 50 : 0
        });
    } catch (error) {
        console.error("Review tree registration error:", error);
        res.status(500).json({ message: "Failed to process tree verification." });
    }
};

module.exports = {
    registerTree,
    getUserTrees,
    getTreeDetails,
    addCareLog,
    getGreenProofStats,
    getPendingReviews,
    reviewCareLog,
    getPendingTrees,
    reviewTreeRegistration
};
