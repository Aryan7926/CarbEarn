const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "carbearn_jwt_fallback_secret_key_2026";

const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            message: "Authentication required. Please sign in to continue."
        });
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({
            message: "Invalid or expired session. Please sign in again."
        });
    }
};

module.exports = authMiddleware;