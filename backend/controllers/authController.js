const pool = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "carbearn_jwt_fallback_secret_key_2026";

// ---------------------------------------------------------------------------
// Register a new user
// ---------------------------------------------------------------------------
const registerUser = async (req, res) => {
    try {
        const { name, email, password, college, adminSecret } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                message: "Name, email, and password are required."
            });
        }

        const cleanName = String(name).trim();
        const cleanEmail = String(email).trim().toLowerCase();
        const cleanCollege = college ? String(college).trim() : null;

        // Basic email syntax check
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(cleanEmail)) {
            return res.status(400).json({
                message: "Please provide a valid email address."
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                message: "Password must be at least 6 characters long."
            });
        }

        // Check for admin registration key
        const ADMIN_REG_SECRET = process.env.ADMIN_REGISTRATION_SECRET || "CARBEARN_ADMIN_2026";
        let assignedRole = "USER";

        if (adminSecret) {
            if (String(adminSecret).trim() !== ADMIN_REG_SECRET) {
                return res.status(403).json({
                    message: "Invalid administrator registration key."
                });
            }
            assignedRole = "ADMIN";
        }

        // Check for existing account
        const [existingUsers] = await pool.query(
            "SELECT id FROM users WHERE LOWER(email) = ?",
            [cleanEmail]
        );

        if (existingUsers.length > 0) {
            return res.status(409).json({
                message: "An account with this email is already registered."
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const [result] = await pool.query(
            `INSERT INTO users (name, email, password, college, role)
             VALUES (?, ?, ?, ?, ?)`,
            [cleanName, cleanEmail, hashedPassword, cleanCollege, assignedRole]
        );

        const userId = result.insertId || (result.rows && result.rows[0] ? result.rows[0].id : null);

        res.status(201).json({
            message: assignedRole === "ADMIN" ? "Administrator registered successfully." : "User registered successfully.",
            userId: userId,
            role: assignedRole
        });
    } catch (error) {
        console.error("Registration error:", error.message);
        res.status(500).json({
            message: "Registration failed. Please try again later."
        });
    }
};

// ---------------------------------------------------------------------------
// Login user and issue signed JWT
// ---------------------------------------------------------------------------
const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required."
            });
        }

        const cleanEmail = String(email).trim().toLowerCase();

        const [users] = await pool.query(
            `SELECT id, name, email, password, college, role
             FROM users
             WHERE LOWER(email) = ?`,
            [cleanEmail]
        );

        if (users.length === 0) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        const user = users[0];

        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        // Sign JWT token
        const token = jwt.sign(
            {
                id: user.id,
                role: user.role
            },
            JWT_SECRET,
            {
                expiresIn: "7d" // 7 days session lifetime for convenient multi-device usage
            }
        );

        res.json({
            message: "Login successful.",
            token: token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                college: user.college,
                role: user.role
            }
        });
    } catch (error) {
        console.error("Login error:", error.message);
        res.status(500).json({
            message: "Login failed. Please try again later."
        });
    }
};

module.exports = {
    registerUser,
    loginUser
};