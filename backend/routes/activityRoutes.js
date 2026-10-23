const express = require("express");
const {
    getActivities,
    calculateDynamicActivity,
    addUserActivity,
    getUserActivityHistory
} = require("../controllers/activityController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// Catalog is accessible to browse activities
router.get("/", getActivities);

// Universal real-time dynamic calculator preview
router.post("/calculate", calculateDynamicActivity);

// Adding activities (supports both / and /add) and viewing personal activity history
router.post("/", authMiddleware, addUserActivity);
router.post("/add", authMiddleware, addUserActivity);
router.get("/user/:userId", authMiddleware, getUserActivityHistory);

module.exports = router;