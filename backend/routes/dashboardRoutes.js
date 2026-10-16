const express = require("express");
const { getDashboardSummary } = require("../controllers/dashboardController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// Dashboard summary requires verified authentication
router.get("/:userId", authMiddleware, getDashboardSummary);

module.exports = router;