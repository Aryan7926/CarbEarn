/**
 * CarbEarn Database Migration & Seeding Script
 *
 * Automatically creates all tables, indexes, relationships,
 * default admin credentials, and catalog of activities.
 *
 * Compatible with both MySQL and PostgreSQL!
 *
 * Usage: npm run migrate
 */

require("dotenv").config();
const bcrypt = require("bcryptjs");
const pool = require("./db");

async function runMigration() {
    console.log("==================================================");
    console.log("   CarbEarn Database Migration & Initialization   ");
    console.log("==================================================");
    console.log(`Target Engine: ${pool.clientType.toUpperCase()}`);

    const isPg = pool.clientType === "postgres";

    try {
        // 1. Users Table
        console.log("-> Creating users table...");
        if (isPg) {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    email VARCHAR(255) NOT NULL UNIQUE,
                    password VARCHAR(255) NOT NULL,
                    college VARCHAR(255),
                    role VARCHAR(50) DEFAULT 'USER',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
        } else {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS users (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    email VARCHAR(255) NOT NULL UNIQUE,
                    password VARCHAR(255) NOT NULL,
                    college VARCHAR(255),
                    role VARCHAR(50) DEFAULT 'USER',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_users_email (email),
                    INDEX idx_users_role (role)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            `);
        }

        // 2. Activities Table
        console.log("-> Creating activities catalog table...");
        if (isPg) {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS activities (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) NOT NULL UNIQUE,
                    unit VARCHAR(100) NOT NULL,
                    emission_factor DECIMAL(10,4) NOT NULL,
                    description TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
        } else {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS activities (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(255) NOT NULL UNIQUE,
                    unit VARCHAR(100) NOT NULL,
                    emission_factor DECIMAL(10,4) NOT NULL,
                    description TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_activities_name (name)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            `);
        }

        // 3. User Activities Table
        console.log("-> Creating user_activities log table...");
        if (isPg) {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS user_activities (
                    id SERIAL PRIMARY KEY,
                    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    activity_id INT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
                    quantity DECIMAL(10,2) NOT NULL,
                    frequency INT NOT NULL DEFAULT 1,
                    co2_saved DECIMAL(10,4) NOT NULL DEFAULT 0,
                    carbon_currency DECIMAL(10,4) NOT NULL DEFAULT 0,
                    points INT NOT NULL DEFAULT 0,
                    impact VARCHAR(50) DEFAULT 'Low',
                    verification_status VARCHAR(50) DEFAULT 'Pending',
                    reviewer_id INT REFERENCES users(id) ON DELETE SET NULL,
                    review_notes TEXT,
                    reviewed_at TIMESTAMP,
                    certificate_hash VARCHAR(255),
                    ml_prediction VARCHAR(255),
                    activity_date DATE NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
        } else {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS user_activities (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT NOT NULL,
                    activity_id INT NOT NULL,
                    quantity DECIMAL(10,2) NOT NULL,
                    frequency INT NOT NULL DEFAULT 1,
                    co2_saved DECIMAL(10,4) NOT NULL DEFAULT 0,
                    carbon_currency DECIMAL(10,4) NOT NULL DEFAULT 0,
                    points INT NOT NULL DEFAULT 0,
                    impact VARCHAR(50) DEFAULT 'Low',
                    verification_status VARCHAR(50) DEFAULT 'Pending',
                    reviewer_id INT,
                    review_notes TEXT,
                    reviewed_at TIMESTAMP NULL,
                    certificate_hash VARCHAR(255),
                    ml_prediction VARCHAR(255),
                    activity_date DATE NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
                    FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL,
                    INDEX idx_ua_user (user_id),
                    INDEX idx_ua_activity (activity_id),
                    INDEX idx_ua_date (activity_date),
                    INDEX idx_ua_verification (verification_status)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            `);
        }

        // 4. GreenProof: Trees Table
        console.log("-> Creating GreenProof trees table...");
        if (isPg) {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS trees (
                    id SERIAL PRIMARY KEY,
                    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    species VARCHAR(255) NOT NULL,
                    location VARCHAR(255) NOT NULL,
                    planting_date DATE NOT NULL,
                    notes TEXT,
                    status VARCHAR(50) DEFAULT 'Planted',
                    verification_status VARCHAR(50) DEFAULT 'Pending',
                    reviewer_id INT REFERENCES users(id) ON DELETE SET NULL,
                    review_notes TEXT,
                    reviewed_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
        } else {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS trees (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT NOT NULL,
                    species VARCHAR(255) NOT NULL,
                    location VARCHAR(255) NOT NULL,
                    planting_date DATE NOT NULL,
                    notes TEXT,
                    status VARCHAR(50) DEFAULT 'Planted',
                    verification_status VARCHAR(50) DEFAULT 'Pending',
                    reviewer_id INT,
                    review_notes TEXT,
                    reviewed_at TIMESTAMP NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL,
                    INDEX idx_trees_user (user_id),
                    INDEX idx_trees_status (status),
                    INDEX idx_trees_verification (verification_status)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            `);
        }

        // 5. GreenProof: Care Logs Table
        console.log("-> Creating GreenProof care_logs table...");
        if (isPg) {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS care_logs (
                    id SERIAL PRIMARY KEY,
                    tree_id INT NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
                    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    inspection_date DATE NOT NULL,
                    health_status VARCHAR(50) NOT NULL,
                    notes TEXT,
                    evidence_url VARCHAR(500),
                    verification_status VARCHAR(50) DEFAULT 'Pending',
                    reviewer_id INT REFERENCES users(id) ON DELETE SET NULL,
                    review_notes TEXT,
                    reviewed_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
        } else {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS care_logs (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    tree_id INT NOT NULL,
                    user_id INT NOT NULL,
                    inspection_date DATE NOT NULL,
                    health_status VARCHAR(50) NOT NULL,
                    notes TEXT,
                    evidence_url VARCHAR(500),
                    verification_status VARCHAR(50) DEFAULT 'Pending',
                    reviewer_id INT,
                    review_notes TEXT,
                    reviewed_at TIMESTAMP NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (tree_id) REFERENCES trees(id) ON DELETE CASCADE,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL,
                    INDEX idx_cl_tree (tree_id),
                    INDEX idx_cl_user (user_id),
                    INDEX idx_cl_verification (verification_status)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            `);
        }

        // 6. Seed Activities Catalog
        console.log("-> Seeding standard environmental activities...");
        const SEED_ACTIVITIES = [
            {
                name: "Cycling",
                unit: "km",
                emission_factor: 0.21,
                description: "Replaces motor vehicle travel. Saves approx. 0.21 kg CO2 per kilometer."
            },
            {
                name: "Walking",
                unit: "km",
                emission_factor: 0.15,
                description: "Zero-emission transit for short trips. Saves approx. 0.15 kg CO2 per kilometer."
            },
            {
                name: "Public Transport",
                unit: "km",
                emission_factor: 0.10,
                description: "Shared passenger transit by bus, metro, or commuter rail. Saves approx. 0.10 kg CO2 per passenger-km."
            },
            {
                name: "Carpooling",
                unit: "km",
                emission_factor: 0.08,
                description: "Shared vehicular commute with peers. Saves approx. 0.08 kg CO2 per shared kilometer."
            },
            {
                name: "Tree Planting",
                unit: "trees",
                emission_factor: 21.77,
                description: "Planting a native tree absorbs on average 21.77 kg CO2 annually at maturity."
            },
            {
                name: "LED Usage",
                unit: "hours",
                emission_factor: 0.03,
                description: "High-efficiency solid-state lighting. Saves approx. 0.03 kg CO2 per operating hour vs incandescent."
            },
            {
                name: "Electricity Saving",
                unit: "kWh",
                emission_factor: 0.82,
                description: "Direct electrical grid conservation. Saves approx. 0.82 kg CO2 per kilowatt-hour conserved."
            },
            {
                name: "Reusable Bottle",
                unit: "refills",
                emission_factor: 0.08,
                description: "Avoids single-use PET bottled beverage manufacturing. Saves approx. 0.08 kg CO2 per refill."
            }
        ];

        for (const act of SEED_ACTIVITIES) {
            const [existing] = await pool.query(
                "SELECT id FROM activities WHERE name = ?",
                [act.name]
            );

            if (existing.length === 0) {
                await pool.query(
                    `INSERT INTO activities (name, unit, emission_factor, description)
                     VALUES (?, ?, ?, ?)`,
                    [act.name, act.unit, act.emission_factor, act.description]
                );
                console.log(`   + Added activity: ${act.name}`);
            }
        }

        // 7. Seed Default Admin Account
        console.log("-> Checking default administrator account...");
        const adminEmail = process.env.ADMIN_EMAIL || "admin@carbearn.com";
        const adminPassword = process.env.ADMIN_PASSWORD || "Admin@12345";

        const [adminExists] = await pool.query(
            "SELECT id FROM users WHERE email = ?",
            [adminEmail]
        );

        if (adminExists.length === 0) {
            const hashedPassword = await bcrypt.hash(adminPassword, 10);
            await pool.query(
                `INSERT INTO users (name, email, password, college, role)
                 VALUES (?, ?, ?, ?, ?)`,
                ["CarbEarn Administrator", adminEmail, hashedPassword, "CarbEarn Administration", "ADMIN"]
            );
            console.log(`   + Created default administrator: ${adminEmail}`);
        } else {
            console.log(`   = Administrator ${adminEmail} already exists.`);
        }

        console.log("==================================================");
        console.log("   Migration and Seeding Completed Successfully!  ");
        console.log("==================================================");
    } catch (error) {
        console.error("Migration failed with error:", error);
        throw error;
    } finally {
        if (pool.end) {
            await pool.end();
        }
    }
}

if (require.main === module) {
    runMigration().catch(() => process.exit(1));
}

module.exports = runMigration;
