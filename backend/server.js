/**
 * CarbEarn Express Server
 *
 * Production-ready configuration with security headers, rate limiting,
 * configurable CORS, static file serving, and graceful shutdown.
 */

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
require("dotenv").config();

const pool = require("./config/db");

// ---------------------------------------------------------------------------
// Route imports
// ---------------------------------------------------------------------------

const authRoutes = require("./routes/authRoutes");
const activityRoutes = require("./routes/activityRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const leaderboardRoutes = require("./routes/leaderboardRoutes");
const mlRoutes = require("./routes/mlRoutes");
const recommendationRoutes = require("./routes/recommendationRoutes");
const adminRoutes = require("./routes/adminRoutes");
const greenproofRoutes = require("./routes/greenproofRoutes");

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();

// Trust reverse proxy (Render, Cloudflare, Railway, Heroku)
app.set("trust proxy", 1);

// ---------------------------------------------------------------------------
// Security headers via Helmet
// ---------------------------------------------------------------------------

app.use(
    helmet({
        contentSecurityPolicy: false, // Disabled so the served frontend can load external assets
        crossOriginEmbedderPolicy: false
    })
);

// ---------------------------------------------------------------------------
// Rate limiting — 500 requests per 15 minutes per IP
// ---------------------------------------------------------------------------

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
    message: {
        message: "Too many requests, please try again later."
    }
});

app.use("/api/", limiter);

// ---------------------------------------------------------------------------
// CORS — supports same-origin, Render domains, and custom origins
// ---------------------------------------------------------------------------

app.use(
    cors({
        origin: true, // Automatically reflect request origin (Render, localhost, custom domains)
        credentials: true
    })
);

// ---------------------------------------------------------------------------
// Body parsing
// ---------------------------------------------------------------------------

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------------------------
// Serve static frontend files from ../frontend
// ---------------------------------------------------------------------------

const frontendPath = path.join(__dirname, "..", "frontend");
app.use(express.static(frontendPath));

// Explicit landing page delivery for root
app.get("/", (req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
});

// ---------------------------------------------------------------------------
// Health check endpoint
// ---------------------------------------------------------------------------

app.get("/api/health", async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT 1 AS result");

        res.json({
            status: "healthy",
            database: "connected",
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(503).json({
            status: "unhealthy",
            database: "disconnected",
            timestamp: new Date().toISOString()
        });
    }
});

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------

app.use("/api/auth", authRoutes);
app.use("/api/activities", activityRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/ml", mlRoutes);
app.use("/api/recommendations", recommendationRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/greenproof", greenproofRoutes);

// ---------------------------------------------------------------------------
// 404 handler for unknown API routes
// ---------------------------------------------------------------------------

app.use("/api/*", (req, res) => {
    res.status(404).json({
        message: "API endpoint not found"
    });
});

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------

app.use((err, req, res, next) => {
    console.error("[error]", err.stack || err.message);

    // Don't leak internal details in production
    res.status(err.status || 500).json({
        message: err.message || "Internal server error",
        ...(isDev && { stack: err.stack })
    });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 5000;

// Dual-stack listener binds to all IPv4 and IPv6 interfaces
const server = app.listen(PORT, () => {
    console.log(
        `CarbEarn server running on http://localhost:${PORT} [${process.env.NODE_ENV || "development"}]`
    );
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

function gracefulShutdown(signal) {
    console.log(`\n${signal} received. Shutting down gracefully...`);

    server.close(async () => {
        try {
            await pool.end();
            console.log("Database pool closed.");
        } catch (err) {
            console.error("Error closing database pool:", err.message);
        }

        console.log("Server shut down.");
        process.exit(0);
    });

    // Force close after 10 seconds
    setTimeout(() => {
        console.error("Forced shutdown after timeout.");
        process.exit(1);
    }, 10000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

module.exports = app;