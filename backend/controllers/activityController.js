const pool = require("../config/db");
const {
    calculateCO2AndCurrency,
    parseActivityInput,
    CARBON_MARKET_RATES
} = require("../services/universalCarbonCalculator");

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
            market_rates: CARBON_MARKET_RATES,
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
// 2. Interactive Real-Time Universal Activity Preview / Calculator
// ---------------------------------------------------------------------------
const calculateDynamicActivity = async (req, res) => {
    try {
        const { text, activity_text, activity_id, quantity, frequency, unit } = req.body;

        let inputPayload = {
            text: text || activity_text || "",
            quantity: quantity ? Number(quantity) : undefined,
            frequency: frequency ? Number(frequency) : 1,
            unit: unit || undefined
        };

        // If activity_id is provided, fetch its catalog details
        if (activity_id && !isNaN(Number(activity_id))) {
            const [acts] = await pool.query("SELECT * FROM activities WHERE id = ?", [Number(activity_id)]);
            if (acts && acts.length > 0) {
                inputPayload.name = acts[0].name;
                inputPayload.unit = unit || acts[0].unit;
                inputPayload.emissionFactor = Number(acts[0].emission_factor);
            }
        }

        const calculation = calculateCO2AndCurrency(inputPayload);

        res.json({
            status: "success",
            calculation
        });
    } catch (error) {
        console.error("Universal calculator error:", error.message);
        res.status(500).json({ message: "Failed to calculate activity carbon mitigation." });
    }
};

// ---------------------------------------------------------------------------
// 3. Add an activity performed by the authenticated user
// ---------------------------------------------------------------------------
const addUserActivity = async (req, res) => {
    try {
        // Derive user_id strictly from verified JWT token - NO IDOR / BOLA!
        const userId = req.user.id;

        const {
            activity_id,
            activity_text,
            custom_activity,
            quantity,
            frequency,
            activity_date,
            ml_prediction
        } = req.body;

        // Date validation
        const targetDate = activity_date || new Date().toISOString().split("T")[0];
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(targetDate)) {
            return res.status(400).json({
                message: "Activity date must be in YYYY-MM-DD format."
            });
        }

        let numQuantity = Number(quantity);
        let numFrequency = Number(frequency || 1);

        // Calculate CO2 and Carbon Currency
        let calcResult;
        let resolvedActivityId = null;

        if (activity_id && !isNaN(Number(activity_id))) {
            // Standard catalog activity
            const [activities] = await pool.query(
                "SELECT id, name, unit, emission_factor, description FROM activities WHERE id = ?",
                [Number(activity_id)]
            );

            if (activities.length === 0) {
                return res.status(404).json({ message: "Activity category not found." });
            }

            const act = activities[0];
            resolvedActivityId = act.id;

            if (isNaN(numQuantity) || numQuantity <= 0) {
                return res.status(400).json({
                    message: "Quantity must be a positive number greater than 0."
                });
            }

            calcResult = calculateCO2AndCurrency({
                name: act.name,
                unit: act.unit,
                emissionFactor: Number(act.emission_factor),
                quantity: numQuantity,
                frequency: numFrequency
            });
        } else if (activity_text || custom_activity) {
            // Dynamic Universal Activity input
            const rawInput = activity_text || custom_activity;
            calcResult = calculateCO2AndCurrency(
                typeof rawInput === "string"
                    ? { text: rawInput, quantity: numQuantity, frequency: numFrequency }
                    : { ...rawInput, quantity: numQuantity, frequency: numFrequency }
            );

            numQuantity = calcResult.quantity;
            numFrequency = calcResult.frequency;

            // Check if catalog already has this action or insert it
            const [existing] = await pool.query(
                "SELECT id FROM activities WHERE LOWER(name) = ?",
                [calcResult.activity_name.toLowerCase().trim()]
            );

            if (existing && existing.length > 0) {
                resolvedActivityId = existing[0].id;
            } else {
                const [insertAct] = await pool.query(
                    `INSERT INTO activities (name, unit, emission_factor, description)
                     VALUES (?, ?, ?, ?)`,
                    [
                        calcResult.activity_name,
                        calcResult.unit,
                        calcResult.emission_factor,
                        calcResult.formula_breakdown.rationale || "Dynamic verified activity"
                    ]
                );
                resolvedActivityId = insertAct.insertId || (insertAct.rows && insertAct.rows[0] ? insertAct.rows[0].id : 1);
            }
        } else {
            return res.status(400).json({
                message: "Either activity_id or activity_text must be provided."
            });
        }

        if (isNaN(numQuantity) || numQuantity <= 0) {
            return res.status(400).json({
                message: "Quantity must be a positive number greater than 0."
            });
        }

        if (isNaN(numFrequency) || numFrequency <= 0 || numFrequency > 7) {
            return res.status(400).json({
                message: "Frequency must be between 1 and 7 times per week."
            });
        }

        const co2Saved = calcResult.co2_saved;
        const carbonCurrency = calcResult.carbon_currency;
        const points = calcResult.points;
        const impact = calcResult.impact;
        const certHash = calcResult.certificate.hash;

        // Governance: Regular contributor entries enter 'Pending' state for Admin Authorization
        const initialStatus = req.user.role === "ADMIN" ? "Verified" : "Pending";

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
                activity_date,
                carbon_currency,
                verification_status,
                certificate_hash
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userId,
                resolvedActivityId,
                numQuantity,
                numFrequency,
                co2Saved,
                points,
                impact,
                ml_prediction ? String(ml_prediction).trim() : null,
                targetDate,
                carbonCurrency,
                initialStatus,
                certHash
            ]
        );

        const activityRecordId = result.insertId || (result.rows && result.rows[0] ? result.rows[0].id : null);

        res.status(201).json({
            message: initialStatus === "Verified"
                ? "Activity recorded and Carbon Currency minted immediately."
                : "Activity recorded and submitted for Administrator Verification & Carbon Currency Minting.",
            activity: {
                id: activityRecordId,
                user_id: userId,
                activity_id: resolvedActivityId,
                activity_name: calcResult.activity_name,
                category: calcResult.category,
                baseline_comparison: calcResult.baseline_comparison,
                unit: calcResult.unit,
                quantity: numQuantity,
                frequency: numFrequency,
                co2_saved: Number(co2Saved.toFixed(2)),
                carbon_currency: carbonCurrency,
                milli_cbc: calcResult.milli_cbc,
                points: points,
                impact: impact,
                valuation: calcResult.valuation,
                verification_status: initialStatus,
                certificate: calcResult.certificate,
                formula_breakdown: calcResult.formula_breakdown,
                ml_prediction: ml_prediction || null,
                activity_date: targetDate
            }
        });
    } catch (error) {
        console.error("Add activity error:", error.message);
        res.status(500).json({ message: "Failed to record activity." });
    }
};

// ---------------------------------------------------------------------------
// 4. Get activity history for user (enforcing ownership or admin role)
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
                ua.carbon_currency,
                ua.points,
                ua.impact,
                ua.verification_status,
                ua.reviewer_id,
                ua.review_notes,
                ua.reviewed_at,
                ua.certificate_hash,
                ua.ml_prediction,
                ua.activity_date,
                ua.created_at
             FROM user_activities ua
             JOIN activities a ON ua.activity_id = a.id
             WHERE ua.user_id = ?
             ORDER BY ua.activity_date DESC, ua.created_at DESC`,
            [targetUserId]
        );

        let totalCO2 = 0;
        let totalPoints = 0;
        let verifiedCBC = 0;
        let pendingCBC = 0;

        const formatted = activities.map(act => {
            const co2 = Number(act.co2_saved || 0);
            const cbc = Number(act.carbon_currency !== undefined ? act.carbon_currency : co2);
            const pts = Number(act.points || 0);
            const status = act.verification_status || "Pending";

            totalCO2 += co2;
            totalPoints += pts;
            if (status === "Verified") {
                verifiedCBC += cbc;
            } else if (status === "Pending") {
                pendingCBC += cbc;
            }

            return {
                id: act.id,
                user_id: act.user_id,
                activity_id: act.activity_id,
                activity_name: act.activity_name,
                unit: act.unit,
                quantity: Number(act.quantity),
                frequency: Number(act.frequency),
                co2_saved: Number(co2.toFixed(2)),
                carbon_currency: Number(cbc.toFixed(4)),
                milli_cbc: Math.round(cbc * 1000),
                points: pts,
                impact: act.impact,
                verification_status: status,
                reviewer_id: act.reviewer_id || null,
                review_notes: act.review_notes || null,
                reviewed_at: act.reviewed_at || null,
                certificate_hash: act.certificate_hash || null,
                valuation: {
                    usd: Number((cbc * CARBON_MARKET_RATES.USD_PER_CBC).toFixed(3)),
                    inr: Number((cbc * CARBON_MARKET_RATES.INR_PER_CBC).toFixed(2))
                },
                ml_prediction: act.ml_prediction,
                activity_date: act.activity_date,
                created_at: act.created_at
            };
        });

        res.json({
            user_id: targetUserId,
            total_activities: formatted.length,
            totals: {
                total_co2: Number(totalCO2.toFixed(2)),
                total_points: totalPoints,
                verified_cbc: Number(verifiedCBC.toFixed(4)),
                pending_cbc: Number(pendingCBC.toFixed(4)),
                total_cbc: Number((verifiedCBC + pendingCBC).toFixed(4)),
                market_valuation_usd: Number((verifiedCBC * CARBON_MARKET_RATES.USD_PER_CBC).toFixed(2)),
                market_valuation_inr: Number((verifiedCBC * CARBON_MARKET_RATES.INR_PER_CBC).toFixed(2))
            },
            activities: formatted
        });
    } catch (error) {
        console.error("Get activity history error:", error.message);
        res.status(500).json({ message: "Failed to fetch activity history." });
    }
};

module.exports = {
    getActivities,
    calculateDynamicActivity,
    addUserActivity,
    getUserActivityHistory
};