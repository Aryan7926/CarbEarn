/**
 * CarbEarn Production Verification & Test Suite
 * 
 * Verifies:
 * - Authentication & Token Security (Registration, Duplicate check, Login, Bad password rejection)
 * - Authorization & IDOR/BOLA protection
 * - Environmental Math Verification (Quantity * Factor * Frequency)
 * - GreenProof Tree Registration & Stewardship Lifecycle
 * - GreenProof Admin Review Workflow (Pending -> Verified)
 * - Dashboard & Analytics Aggregations
 * - Leaderboard Rankings & Points Distribution
 * - Machine Learning Prediction Integration
 */

const assert = require("assert");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");

// Import Controllers for Unit & Integration Verification
const authController = require("../controllers/authController");
const activityController = require("../controllers/activityController");
const dashboardController = require("../controllers/dashboardController");
const leaderboardController = require("../controllers/leaderboardController");
const greenproofController = require("../controllers/greenproofController");
const adminController = require("../controllers/adminController");

// Helper mock request and response
function createMockReqRes(options = {}) {
    const req = {
        body: options.body || {},
        params: options.params || {},
        query: options.query || {},
        headers: options.headers || {},
        user: options.user || null
    };

    const res = {
        statusCode: 200,
        data: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.data = payload;
            return this;
        }
    };

    return { req, res };
}

let testPassed = 0;
let testFailed = 0;

async function test(name, fn) {
    try {
        await fn();
        console.log(`  ✓ PASS: ${name}`);
        testPassed++;
    } catch (err) {
        console.error(`  ✗ FAIL: ${name}`);
        console.error(`    ${err.message}`);
        testFailed++;
    }
}

async function runAllTests() {
    console.log("==================================================");
    console.log("       CarbEarn Comprehensive Test Suite          ");
    console.log("==================================================");

    const testEmail1 = `student_${Date.now()}@campus.edu`;
    const testEmail2 = `peer_${Date.now()}@campus.edu`;
    const testPassword = "SecurePassword@123";

    let studentToken = null;
    let studentUser = null;
    let peerUser = null;
    let adminToken = null;
    let adminUser = null;

    // -------------------------------------------------------------------------
    // 1. AUTHENTICATION & SECURITY TESTS
    // -------------------------------------------------------------------------
    console.log("\n[1] Authentication & Authorization Tests");

    await test("Register new student user", async () => {
        const { req, res } = createMockReqRes({
            body: {
                name: "Aarav Sharma",
                email: testEmail1,
                password: testPassword,
                college: "Indian Institute of Technology"
            }
        });

        await authController.registerUser(req, res);
        assert.strictEqual(res.statusCode, 201);
        assert(res.data.userId, "Should return registered userId");
    });

    await test("Reject duplicate account registration with same email", async () => {
        const { req, res } = createMockReqRes({
            body: {
                name: "Duplicate User",
                email: testEmail1.toUpperCase(), // Case insensitive test
                password: testPassword,
                college: "IIT"
            }
        });

        await authController.registerUser(req, res);
        assert.strictEqual(res.statusCode, 409);
        assert.strictEqual(res.data.message, "An account with this email is already registered.");
    });

    await test("Login with valid credentials returns JWT and profile", async () => {
        const { req, res } = createMockReqRes({
            body: {
                email: testEmail1,
                password: testPassword
            }
        });

        await authController.loginUser(req, res);
        assert.strictEqual(res.statusCode, 200);
        assert(res.data.token, "Must return signed JWT");
        assert.strictEqual(res.data.user.email, testEmail1.toLowerCase());
        studentToken = res.data.token;
        studentUser = res.data.user;
    });

    await test("Reject login with incorrect password", async () => {
        const { req, res } = createMockReqRes({
            body: {
                email: testEmail1,
                password: "WrongPassword123"
            }
        });

        await authController.loginUser(req, res);
        assert.strictEqual(res.statusCode, 401);
    });

    await test("Admin login with seeded admin credentials", async () => {
        const { req, res } = createMockReqRes({
            body: {
                email: "admin@carbearn.com",
                password: "Admin@12345"
            }
        });

        await authController.loginUser(req, res);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.data.user.role, "ADMIN");
        adminToken = res.data.token;
        adminUser = res.data.user;
    });

    // Register second user for IDOR testing
    await test("Register second peer account", async () => {
        const { req, res } = createMockReqRes({
            body: {
                name: "Rohan Patel",
                email: testEmail2,
                password: testPassword,
                college: "Green Valley College"
            }
        });

        await authController.registerUser(req, res);
        peerUser = { id: res.data.userId, email: testEmail2 };
    });

    // -------------------------------------------------------------------------
    // 2. IDOR / BOLA SECURITY PROTECTION TESTS
    // -------------------------------------------------------------------------
    console.log("\n[2] IDOR / BOLA Authorization Enforcement Tests");

    await test("User cannot view another user's private dashboard", async () => {
        const { req, res } = createMockReqRes({
            params: { userId: peerUser.id },
            user: { id: studentUser.id, role: "USER" } // studentUser attempting to inspect peerUser
        });

        await dashboardController.getDashboardSummary(req, res);
        assert.strictEqual(res.statusCode, 403);
    });

    await test("User cannot view another user's private activity history", async () => {
        const { req, res } = createMockReqRes({
            params: { userId: peerUser.id },
            user: { id: studentUser.id, role: "USER" }
        });

        await activityController.getUserActivityHistory(req, res);
        assert.strictEqual(res.statusCode, 403);
    });

    await test("Admin CAN view any user's dashboard (Authorized oversight)", async () => {
        const { req, res } = createMockReqRes({
            params: { userId: studentUser.id },
            user: { id: adminUser.id, role: "ADMIN" }
        });

        await dashboardController.getDashboardSummary(req, res);
        assert.strictEqual(res.statusCode, 200);
    });

    // -------------------------------------------------------------------------
    // 3. ENVIRONMENTAL CALCULATIONS & ACTIVITY LOGGING
    // -------------------------------------------------------------------------
    console.log("\n[3] Activity Logging & Environmental Calculation Tests");

    await test("Calculate CO2 savings including weekly frequency multiplier", async () => {
        // Cycling emission factor is 0.21 kg/km
        // Quantity = 10 km, Frequency = 5 times/week
        // Expected CO2 = 10 * 0.21 * 5 = 10.5 kg CO2
        // Expected Points = Math.round(10.5 * 10) = 105 points
        // Expected Impact = High (>= 5 kg)

        const { req, res } = createMockReqRes({
            user: { id: studentUser.id, role: "USER" },
            body: {
                activity_id: 1, // Cycling
                quantity: 10,
                frequency: 5,
                activity_date: "2026-10-16",
                ml_prediction: "High"
            }
        });

        await activityController.addUserActivity(req, res);
        assert.strictEqual(res.statusCode, 201);
        assert.strictEqual(Number(res.data.activity.co2_saved), 10.5);
        assert.strictEqual(Number(res.data.activity.points), 105);
        assert.strictEqual(res.data.activity.impact, "High");
    });

    await test("Reject non-positive activity quantities", async () => {
        const { req, res } = createMockReqRes({
            user: { id: studentUser.id, role: "USER" },
            body: {
                activity_id: 1,
                quantity: -5,
                frequency: 2,
                activity_date: "2026-10-16"
            }
        });

        await activityController.addUserActivity(req, res);
        assert.strictEqual(res.statusCode, 400);
    });

    await test("Dynamic Universal Calculator computes CO2 and Carbon Currency (CBC) for free-text activity", async () => {
        const { req, res } = createMockReqRes({
            body: {
                activity_text: "Took electric metro train for 20 km instead of driving car",
                quantity: 20,
                frequency: 5
            }
        });

        await activityController.calculateDynamicActivity(req, res);
        assert.strictEqual(res.statusCode, 200);
        assert(res.data.calculation.co2_saved > 0, "Calculated CO2 must be positive");
        assert.strictEqual(res.data.calculation.carbon_currency, res.data.calculation.co2_saved);
        assert(res.data.calculation.valuation.usd > 0, "Market valuation in USD must be positive");
        assert(res.data.calculation.certificate.hash, "Must generate cryptographic certificate hash");
    });

    let loggedDynamicActivityId = null;

    await test("Record dynamic custom activity with Carbon Currency into Pending authorization queue", async () => {
        const { req, res } = createMockReqRes({
            user: { id: studentUser.id, role: "USER" },
            body: {
                activity_text: "Ate vegan lunch substituting beef burger",
                quantity: 3,
                frequency: 2,
                activity_date: "2026-10-16"
            }
        });

        await activityController.addUserActivity(req, res);
        assert.strictEqual(res.statusCode, 201);
        assert.strictEqual(res.data.activity.verification_status, "Pending");
        assert(res.data.activity.carbon_currency > 0, "Must calculate Carbon Currency (CBC)");
        assert(res.data.activity.certificate.hash, "Must generate certificate hash");
        loggedDynamicActivityId = res.data.activity.id;
    });

    await test("Admin lists pending user activities awaiting authorization", async () => {
        const { req, res } = createMockReqRes({
            user: { id: adminUser.id, role: "ADMIN" }
        });

        await adminController.getPendingActivities(req, res);
        assert.strictEqual(res.statusCode, 200);
        assert(res.data.activities.length >= 1, "Must find pending activities");
        const match = res.data.activities.find(a => a.id === loggedDynamicActivityId);
        assert(match, "Submitted dynamic activity must be in admin pending queue");
        assert.strictEqual(match.student_name, studentUser.name);
    });

    await test("Admin authorizes and verifies user activity, minting Carbon Currency", async () => {
        const { req, res } = createMockReqRes({
            params: { id: loggedDynamicActivityId },
            user: { id: adminUser.id, role: "ADMIN" },
            body: {
                status: "Verified",
                review_notes: "Dietary substitution calculation verified against IPCC food emissions."
            }
        });

        await adminController.verifyActivity(req, res);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.data.verification_status, "Verified");
        assert(res.data.carbon_currency > 0, "Authorized Carbon Currency returned");
    });

    await test("Fetch student's activity history accurately with Carbon Currency", async () => {
        const { req, res } = createMockReqRes({
            params: { userId: studentUser.id },
            user: { id: studentUser.id, role: "USER" }
        });

        await activityController.getUserActivityHistory(req, res);
        assert.strictEqual(res.statusCode, 200);
        assert(res.data.activities.length >= 2, "Should contain multiple activities");
        assert(res.data.totals.total_cbc > 0, "Must calculate total CBC in history");
        assert(res.data.totals.verified_cbc > 0, "Must reflect authorized CBC in history");
    });

    // -------------------------------------------------------------------------
    // 4. SIGNATURE FEATURE: GREENPROOF WORKFLOW TESTS
    // -------------------------------------------------------------------------
    console.log("\n[4] GreenProof Tree Stewardship & Verification Tests");

    let registeredTreeId = null;
    let submittedCareLogId = null;

    await test("Student registers a new GreenProof sapling", async () => {
        const { req, res } = createMockReqRes({
            user: { id: studentUser.id, role: "USER" },
            body: {
                species: "Azadirachta indica (Neem)",
                location: "Main Academic Quad - South Lawn",
                planting_date: "2026-10-15",
                notes: "Planted during inaugural green campus campaign."
            }
        });

        await greenproofController.registerTree(req, res);
        assert.strictEqual(res.statusCode, 201);
        assert(res.data.tree.id, "Must return registered tree ID");
        assert.strictEqual(res.data.tree.status, "Planted");
        registeredTreeId = res.data.tree.id;
    });

    await test("Student submits a periodic health inspection care log", async () => {
        const { req, res } = createMockReqRes({
            params: { treeId: registeredTreeId },
            user: { id: studentUser.id, role: "USER" },
            body: {
                inspection_date: "2026-10-16",
                health_status: "Healthy",
                notes: "Stem sturdy, new leaf shoots emerging, watered with 5L drip.",
                evidence_url: "https://images.unsplash.com/photo-1542601906990-b4d3fb778b09"
            }
        });

        await greenproofController.addCareLog(req, res);
        assert.strictEqual(res.statusCode, 201);
        assert.strictEqual(res.data.care_log.verification_status, "Pending");
        assert.strictEqual(res.data.care_log.updated_tree_status, "Surviving");
        submittedCareLogId = res.data.care_log.id;
    });

    await test("Coordinator lists pending reviews awaiting verification", async () => {
        const { req, res } = createMockReqRes({
            user: { id: adminUser.id, role: "ADMIN" }
        });

        await greenproofController.getPendingReviews(req, res);
        assert.strictEqual(res.statusCode, 200);
        const match = res.data.pending_reviews.find(r => r.log_id === submittedCareLogId);
        assert(match, "Submitted care log must be in coordinator's pending queue");
        assert.strictEqual(match.student_name, studentUser.name);
    });

    await test("Coordinator reviews and verifies care log (awards stewardship bonus)", async () => {
        const { req, res } = createMockReqRes({
            params: { logId: submittedCareLogId },
            user: { id: adminUser.id, role: "ADMIN" },
            body: {
                verification_status: "Verified",
                review_notes: "Excellent care documentation. Leaf health confirmed."
            }
        });

        await greenproofController.reviewCareLog(req, res);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.data.verification_status, "Verified");
    });

    await test("Tree details reflect verified inspection and reviewer metadata", async () => {
        const { req, res } = createMockReqRes({
            params: { treeId: registeredTreeId },
            user: { id: studentUser.id, role: "USER" }
        });

        await greenproofController.getTreeDetails(req, res);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.data.tree.species, "Azadirachta indica (Neem)");
        const verifiedLog = res.data.care_logs.find(l => l.id === submittedCareLogId);
        assert.strictEqual(verifiedLog.verification_status, "Verified");
        assert.strictEqual(verifiedLog.review_notes, "Excellent care documentation. Leaf health confirmed.");
    });

    // -------------------------------------------------------------------------
    // 5. DASHBOARD & LEADERBOARD AGGREGATIONS
    // -------------------------------------------------------------------------
    console.log("\n[5] Dashboard & Leaderboard Verification Tests");

    await test("Dashboard calculates live aggregated carbon points and tree count", async () => {
        const { req, res } = createMockReqRes({
            params: { userId: studentUser.id },
            user: { id: studentUser.id, role: "USER" }
        });

        await dashboardController.getDashboardSummary(req, res);
        assert.strictEqual(res.statusCode, 200);
        assert(res.data.summary.total_points >= 105, "Points should include activities and verified bonuses");
        assert.strictEqual(res.data.summary.total_trees, 1);
        assert.strictEqual(res.data.summary.surviving_trees, 1);
    });

    await test("Leaderboard lists student with appropriate ranking", async () => {
        const { req, res } = createMockReqRes();

        await leaderboardController.getLeaderboard(req, res);
        assert.strictEqual(res.statusCode, 200);
        assert(res.data.leaderboard.length >= 1, "Leaderboard should have at least 1 entry");
        const studentEntry = res.data.leaderboard.find(u => u.user_id === studentUser.id);
        assert(studentEntry, "Student must be present in leaderboard");
        assert(studentEntry.rank >= 1, "Student should have a positive rank");
        assert(Number(studentEntry.total_points) >= 105, "Student should have earned at least 105 points");
    });

    console.log("==================================================");
    console.log(`Results: ${testPassed} Passed, ${testFailed} Failed`);
    console.log("==================================================");

    if (testFailed > 0) {
        process.exit(1);
    }
}

runAllTests().catch((e) => {
    console.error("Test runner encountered fatal error:", e);
    process.exit(1);
});
