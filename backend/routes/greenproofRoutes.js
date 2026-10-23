const express = require("express");
const {
    registerTree,
    getUserTrees,
    getTreeDetails,
    addCareLog,
    getGreenProofStats,
    getPendingReviews,
    reviewCareLog,
    getPendingTrees,
    reviewTreeRegistration
} = require("../controllers/greenproofController");

const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

const router = express.Router();

// All GreenProof routes require authentication
router.use(authMiddleware);

// User Tree and Care endpoints
router.post("/trees", registerTree);
router.get("/trees", getUserTrees);
router.get("/trees/:treeId", getTreeDetails);
router.post("/trees/:treeId/care", addCareLog);
router.post("/trees/:treeId/care-logs", addCareLog);
router.get("/stats", getGreenProofStats);

// Coordinator/Admin verification endpoints
router.get("/admin/pending", adminMiddleware, getPendingReviews);
router.put("/admin/care/:logId/review", adminMiddleware, reviewCareLog);
router.put("/admin/logs/:logId/review", adminMiddleware, reviewCareLog);
router.put("/admin/care-logs/:logId/review", adminMiddleware, reviewCareLog);
router.get("/admin/pending-trees", adminMiddleware, getPendingTrees);
router.put("/admin/trees/:treeId/review", adminMiddleware, reviewTreeRegistration);

module.exports = router;
