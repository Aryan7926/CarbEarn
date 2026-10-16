const express = require("express");
const axios = require("axios");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://127.0.0.1:5001";

// Transparent heuristic fallback for when Python ML service is starting or unreachable
function calculateHeuristicImpact(activityType, quantity, frequency) {
    const act = (activityType || "").toLowerCase();
    const qty = Number(quantity) || 1;
    const freq = Number(frequency) || 1;

    let emissionFactor = 0.2;
    if (act.includes("tree")) emissionFactor = 21.77;
    else if (act.includes("electric")) emissionFactor = 0.82;
    else if (act.includes("cycling")) emissionFactor = 0.21;
    else if (act.includes("walk")) emissionFactor = 0.15;
    else if (act.includes("transit") || act.includes("public")) emissionFactor = 0.10;
    else if (act.includes("carpool")) emissionFactor = 0.08;
    else if (act.includes("bottle")) emissionFactor = 0.08;
    else if (act.includes("led")) emissionFactor = 0.03;

    const estimatedCO2 = qty * emissionFactor * freq;
    if (estimatedCO2 >= 5) return "High";
    if (estimatedCO2 >= 1) return "Medium";
    return "Low";
}

router.post("/predict", authMiddleware, async (req, res) => {
    try {
        const { activity_type, quantity, frequency } = req.body;

        if (!activity_type || quantity === undefined || frequency === undefined) {
            return res.status(400).json({
                message: "Activity type, quantity, and frequency are required."
            });
        }

        const numQty = Number(quantity);
        const numFreq = Number(frequency);

        if (isNaN(numQty) || numQty <= 0 || isNaN(numFreq) || numFreq <= 0) {
            return res.status(400).json({
                message: "Quantity and frequency must be positive numbers."
            });
        }

        try {
            // Forward prediction request to Python Random Forest microservice
            const mlResponse = await axios.post(
                `${ML_SERVICE_URL}/predict`,
                {
                    activity_type,
                    quantity: numQty,
                    frequency: numFreq
                },
                {
                    timeout: 5000,
                    headers: { "Content-Type": "application/json" }
                }
            );

            return res.json({
                message: "Random Forest ML prediction successful",
                source: "ml_microservice",
                prediction: mlResponse.data
            });
        } catch (mlErr) {
            console.warn(
                `[mlRoutes] ML microservice unreachable at ${ML_SERVICE_URL} (${mlErr.message}). Using transparent fallback model.`
            );

            // Graceful degradation when Python service is offline
            const fallbackImpact = calculateHeuristicImpact(activity_type, numQty, numFreq);

            return res.json({
                message: "Impact classified via fallback environmental estimation model",
                source: "fallback_model",
                prediction: {
                    activity_type,
                    quantity: numQty,
                    frequency: numFreq,
                    predicted_impact: fallbackImpact,
                    confidence: { [fallbackImpact]: 85.0 },
                    note: "Estimated via environmental factor heuristic while ML service is offline."
                }
            });
        }
    } catch (error) {
        console.error("ML prediction route error:", error.message);
        res.status(500).json({
            message: "Failed to process impact classification."
        });
    }
});

module.exports = router;