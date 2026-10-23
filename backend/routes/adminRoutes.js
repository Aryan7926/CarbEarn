const express = require("express");

const {
    getAdminOverview,
    getAdminUsers,
    getRecentAdminActivities,
    getPendingActivities,
    verifyActivity,
    batchVerifyActivities,
    getAdminList,
    createAdmin
} = require("../controllers/adminController");

const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

const router = express.Router();

// All routes below require a valid token and ADMIN role.
router.use(authMiddleware);
router.use(adminMiddleware);

// Admin dashboard overview
router.get("/overview", getAdminOverview);

// List registered contributors (excludes admins)
router.get("/users", getAdminUsers);

// View recent activities
router.get("/activities", getRecentAdminActivities);

// Pending activity authorization & carbon currency minting
router.get("/pending-activities", getPendingActivities);
router.put("/activities/:id/verify", verifyActivity);
router.post("/activities/batch-verify", batchVerifyActivities);

// View list of administrators
router.get("/admins", getAdminList);

// Register a new administrator
router.post("/create-admin", createAdmin);

module.exports = router;