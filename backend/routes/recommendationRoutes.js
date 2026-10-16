const express = require("express");
const { getRecommendation } = require("../controllers/recommendationController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// Personalized recommendations require verified authentication
router.get("/:userId", authMiddleware, getRecommendation);

module.exports = router;