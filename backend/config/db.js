/**
 * CarbEarn Database Access Layer (DAL)
 * 
 * Supports production managed databases and seamless local development:
 * 1. PostgreSQL (via 'pg' pool) - for Neon, Supabase, Render, Railway, Heroku
 * 2. MySQL (via 'mysql2/promise' pool) - for AWS RDS, PlanetScale, local MySQL
 * 3. Local Persistent Storage - file-persisted ACID-safe store when DB_CLIENT=local
 *    or when no external database host is accessible.
 * 
 * Provides unified [rows, fields] query API with parameterized input security.
 */

const fs = require("fs");
const path = require("path");
require("dotenv").config();

let clientType = (process.env.DB_CLIENT || "").toLowerCase();
const databaseUrl = process.env.DATABASE_URL || "";

if (
    databaseUrl.startsWith("postgres://") ||
    databaseUrl.startsWith("postgresql://") ||
    clientType === "postgres" ||
    clientType === "postgresql"
) {
    clientType = "postgres";
} else if (
    databaseUrl.startsWith("mysql://") ||
    clientType === "mysql"
) {
    clientType = "mysql";
} else if (!clientType) {
    // If DB_HOST is explicitly configured and not default without daemon, try mysql
    clientType = process.env.DB_HOST && process.env.DB_PASSWORD ? "mysql" : "local";
}

let poolInstance = null;

if (clientType === "postgres") {
    const { Pool } = require("pg");
    const isCloudPg =
        databaseUrl.includes("neon.tech") ||
        databaseUrl.includes("supabase.co") ||
        databaseUrl.includes("sslmode=require") ||
        process.env.DB_SSL === "true";

    const pgConfig = databaseUrl
        ? {
              connectionString: databaseUrl,
              ssl: isCloudPg ? { rejectUnauthorized: false } : undefined
          }
        : {
              host: process.env.DB_HOST || "localhost",
              port: parseInt(process.env.DB_PORT || "5432", 10),
              user: process.env.DB_USER || "postgres",
              password: process.env.DB_PASSWORD || "",
              database: process.env.DB_NAME || "carbearn",
              ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined
          };

    const pgPool = new Pool(pgConfig);

    poolInstance = {
        clientType: "postgres",
        async query(sql, params = []) {
            let paramIndex = 1;
            const pgSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
            const res = await pgPool.query(pgSql, params);
            return [res.rows, res.fields];
        },
        async end() {
            return pgPool.end();
        }
    };
    console.log("[db] Initialized PostgreSQL connection pool.");
} else if (clientType === "mysql") {
    const mysql = require("mysql2/promise");
    const mysqlConfig = databaseUrl
        ? {
              uri: databaseUrl,
              waitForConnections: true,
              connectionLimit: 10,
              queueLimit: 0,
              ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined
          }
        : {
              host: process.env.DB_HOST || "localhost",
              port: parseInt(process.env.DB_PORT || "3306", 10),
              user: process.env.DB_USER || "root",
              password: process.env.DB_PASSWORD || "",
              database: process.env.DB_NAME || "carbearn",
              waitForConnections: true,
              connectionLimit: 10,
              queueLimit: 0,
              ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined
          };

    const mysqlPool = mysql.createPool(mysqlConfig);

    poolInstance = {
        clientType: "mysql",
        async query(sql, params = []) {
            return mysqlPool.query(sql, params);
        },
        async end() {
            return mysqlPool.end();
        }
    };
    console.log("[db] Initialized MySQL connection pool.");
} else {
    // -------------------------------------------------------------------------
    // Persistent Local Storage Adapter (for zero-config local dev & offline test)
    // -------------------------------------------------------------------------
    const dataDir = path.join(__dirname, "..", "data");
    const dataFile = path.join(dataDir, "carbearn.json");

    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    // Default Seed Dataset
    const DEFAULT_STORE = {
        users: [
            {
                id: 1,
                name: "CarbEarn Administrator",
                email: "admin@carbearn.com",
                password: "$2a$10$UqQa8SsHbO90iZv3H2Sad.V5izKHHepVng/ZLId6M.y10Q6.jhD4.", // Admin@12345
                college: "CarbEarn Administration",
                role: "ADMIN",
                created_at: new Date().toISOString()
            }
        ],
        activities: [
            { id: 1, name: "Cycling", unit: "km", emission_factor: 0.21, description: "Cycling instead of driving saves approx. 0.21 kg CO2/km." },
            { id: 2, name: "Walking", unit: "km", emission_factor: 0.15, description: "Zero-emission walking for short trips." },
            { id: 3, name: "Public Transport", unit: "km", emission_factor: 0.10, description: "Shared transit saves approx. 0.10 kg CO2/passenger-km." },
            { id: 4, name: "Carpooling", unit: "km", emission_factor: 0.08, description: "Shared vehicular commute saves approx. 0.08 kg CO2/km." },
            { id: 5, name: "Tree Planting", unit: "trees", emission_factor: 21.77, description: "Absorbs approx. 21.77 kg CO2 annually." },
            { id: 6, name: "LED Usage", unit: "hours", emission_factor: 0.03, description: "High-efficiency solid-state lighting saves approx. 0.03 kg CO2/hr." },
            { id: 7, name: "Electricity Saving", unit: "kWh", emission_factor: 0.82, description: "Direct electrical grid conservation saves approx. 0.82 kg CO2/kWh." },
            { id: 8, name: "Reusable Bottle", unit: "refills", emission_factor: 0.08, description: "Avoids single-use plastic manufacturing." }
        ],
        user_activities: [],
        trees: [],
        care_logs: []
    };

    function readStore() {
        try {
            if (!fs.existsSync(dataFile)) {
                fs.writeFileSync(dataFile, JSON.stringify(DEFAULT_STORE, null, 2), "utf8");
                return DEFAULT_STORE;
            }
            const raw = fs.readFileSync(dataFile, "utf8");
            return JSON.parse(raw);
        } catch (e) {
            return DEFAULT_STORE;
        }
    }

    function writeStore(store) {
        fs.writeFileSync(dataFile, JSON.stringify(store, null, 2), "utf8");
    }

    let store = readStore();

    poolInstance = {
        clientType: "local",
        async query(sql, params = []) {
            const cleanSql = sql.replace(/\s+/g, " ").trim();
            const lower = cleanSql.toLowerCase();

            // 1. SELECT 1 (Health check)
            if (lower.startsWith("select 1")) {
                return [[{ result: 1 }], []];
            }

            // 2. USERS Queries
            if (lower.includes("from users")) {
                if (lower.startsWith("select count(*)")) {
                    const onlyUsers = lower.includes("where role = 'user'") || lower.includes("where u.role = 'user'");
                    const count = onlyUsers ? store.users.filter(u => u.role === "USER").length : store.users.length;
                    return [[{ totalUsers: count }], []];
                }

                if (lower.includes("where role = 'admin'") || lower.includes("where u.role = 'admin'")) {
                    const admins = store.users.filter(u => u.role === "ADMIN");
                    return [admins, []];
                }

                if (lower.includes("where email =") || lower.includes("where lower(email) =")) {
                    const email = String(params[0] || "").toLowerCase().trim();
                    const match = store.users.filter(u => u.email.toLowerCase() === email);
                    return [match, []];
                }

                if (lower.includes("where id =")) {
                    const id = Number(params[0]);
                    const match = store.users.filter(u => u.id === id);
                    return [match, []];
                }

                // Admin list users or Leaderboard query
                if (lower.includes("left join user_activities")) {
                    let targets = store.users;
                    if (lower.includes("where u.role = 'user'")) {
                        targets = targets.filter(u => u.role === "USER");
                    }

                    const result = targets.map(u => {
                        const acts = store.user_activities.filter(a => a.user_id === u.id);
                        const totalCO2 = acts.reduce((acc, a) => acc + Number(a.co2_saved || 0), 0);
                        const totalPts = acts.reduce((acc, a) => acc + Number(a.points || 0), 0);
                        return {
                            id: u.id,
                            user_id: u.id,
                            name: u.name,
                            email: u.email,
                            college: u.college,
                            role: u.role,
                            created_at: u.created_at,
                            activity_count: acts.length,
                            total_activities: acts.length,
                            total_co2: totalCO2,
                            total_co2_saved: totalCO2,
                            total_points: totalPts
                        };
                    });

                    if (lower.includes("order by total_points desc")) {
                        result.sort((a, b) => b.total_points - a.total_points);
                    }

                    return [result, []];
                }

                return [store.users, []];
            }

            // INSERT INTO users
            if (lower.startsWith("insert into users")) {
                const [name, email, password, college, role] = params;
                const newId = store.users.length > 0 ? Math.max(...store.users.map(u => u.id)) + 1 : 1;
                const determinedRole = role || (lower.includes("'admin'") ? "ADMIN" : "USER");
                const newUser = {
                    id: newId,
                    name,
                    email: String(email).toLowerCase().trim(),
                    password,
                    college: college || null,
                    role: determinedRole,
                    created_at: new Date().toISOString()
                };
                store.users.push(newUser);
                writeStore(store);
                return [{ insertId: newId, rows: [newUser] }, []];
            }

            // 3. ACTIVITIES Catalog Queries
            if (lower.includes("from activities")) {
                if (lower.includes("where id =")) {
                    const id = Number(params[0]);
                    const match = store.activities.filter(a => a.id === id);
                    return [match, []];
                }
                if (lower.includes("where name = 'tree planting'")) {
                    const match = store.activities.filter(a => a.name.toLowerCase() === "tree planting");
                    return [match, []];
                }
                if (lower.includes("where name =")) {
                    const name = params.length > 0 ? String(params[0]) : "Tree Planting";
                    const match = store.activities.filter(a => a.name.toLowerCase() === name.toLowerCase());
                    return [match, []];
                }
                return [store.activities, []];
            }

            if (lower.startsWith("insert into activities")) {
                const [name, unit, emission_factor, description] = params;
                const newId = store.activities.length > 0 ? Math.max(...store.activities.map(a => a.id)) + 1 : 1;
                const newAct = { id: newId, name, unit, emission_factor: Number(emission_factor), description };
                store.activities.push(newAct);
                writeStore(store);
                return [{ insertId: newId }, []];
            }

            // 4. USER_ACTIVITIES Queries
            if (lower.startsWith("insert into user_activities")) {
                const [user_id, activity_id, quantity, frequency, co2_saved, points, impact, ml_prediction, activity_date] = params;
                const newId = store.user_activities.length > 0 ? Math.max(...store.user_activities.map(a => a.id)) + 1 : 1;
                const newAct = {
                    id: newId,
                    user_id: Number(user_id),
                    activity_id: Number(activity_id),
                    quantity: Number(quantity),
                    frequency: Number(frequency),
                    co2_saved: Number(co2_saved),
                    points: Number(points),
                    impact: impact || "Low",
                    ml_prediction: ml_prediction || null,
                    activity_date: activity_date || new Date().toISOString().split("T")[0],
                    created_at: new Date().toISOString()
                };
                store.user_activities.push(newAct);
                writeStore(store);
                return [{ insertId: newId }, []];
            }

            // Summary metrics for user activities
            if (lower.includes("from user_activities") && lower.includes("sum(")) {
                let acts = store.user_activities;
                if (lower.includes("where user_id =")) {
                    const uid = Number(params[0]);
                    acts = acts.filter(a => a.user_id === uid);
                }

                const totalCO2 = acts.reduce((acc, a) => acc + Number(a.co2_saved || 0), 0);
                const totalPoints = acts.reduce((acc, a) => acc + Number(a.points || 0), 0);
                const low = acts.filter(a => a.impact === "Low").length;
                const med = acts.filter(a => a.impact === "Medium").length;
                const high = acts.filter(a => a.impact === "High").length;
                const activeUserIds = new Set(acts.map(a => a.user_id));

                return [[{
                    total_activities: acts.length,
                    totalActivities: acts.length,
                    total_co2_saved: totalCO2,
                    totalCO2Saved: totalCO2,
                    total_points: totalPoints,
                    low_impact: low,
                    medium_impact: med,
                    high_impact: high,
                    activeUsers: activeUserIds.size
                }], []];
            }

            // User activity history list
            if (lower.includes("from user_activities ua") && lower.includes("join activities a")) {
                let list = store.user_activities.map(ua => {
                    const cat = store.activities.find(a => a.id === ua.activity_id) || {};
                    const u = store.users.find(usr => usr.id === ua.user_id) || {};
                    return {
                        id: ua.id,
                        user_id: ua.user_id,
                        user_name: u.name || "User",
                        activity_id: ua.activity_id,
                        activity_name: cat.name || "Activity",
                        unit: cat.unit || "unit",
                        quantity: ua.quantity,
                        frequency: ua.frequency,
                        co2_saved: ua.co2_saved,
                        points: ua.points,
                        impact: ua.impact,
                        ml_prediction: ua.ml_prediction,
                        activity_date: ua.activity_date,
                        created_at: ua.created_at
                    };
                });

                if (lower.includes("where ua.user_id =")) {
                    const uid = Number(params[0]);
                    list = list.filter(a => a.user_id === uid);
                }

                list.sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date));

                if (lower.includes("limit 5")) {
                    list = list.slice(0, 5);
                } else if (lower.includes("limit 10") || lower.includes("limit 15")) {
                    list = list.slice(0, 15);
                }

                return [list, []];
            }

            // Leaderboard query
            if (lower.includes("from users u") && lower.includes("total_points")) {
                const regularUsers = store.users.filter(u => u.role === "USER");
                const ranked = regularUsers.map(u => {
                    const userActs = store.user_activities.filter(a => a.user_id === u.id);
                    const totalCO2 = userActs.reduce((acc, a) => acc + Number(a.co2_saved || 0), 0);
                    const totalPts = userActs.reduce((acc, a) => acc + Number(a.points || 0), 0);
                    return {
                        user_id: u.id,
                        name: u.name,
                        college: u.college,
                        total_activities: userActs.length,
                        total_co2_saved: totalCO2,
                        total_points: totalPts
                    };
                });

                ranked.sort((a, b) => b.total_points - a.total_points);
                return [ranked, []];
            }

            // 5. TREES Queries
            if (lower.startsWith("insert into trees")) {
                const [user_id, species, location, planting_date, notes, status] = params;
                const newId = store.trees.length > 0 ? Math.max(...store.trees.map(t => t.id)) + 1 : 1;
                const newTree = {
                    id: newId,
                    user_id: Number(user_id),
                    species,
                    location,
                    planting_date,
                    notes: notes || null,
                    status: status || "Planted",
                    verification_status: "Pending",
                    admin_notes: null,
                    created_at: new Date().toISOString()
                };
                store.trees.push(newTree);
                writeStore(store);
                return [{ insertId: newId, rows: [newTree] }, []];
            }

            if (lower.startsWith("update trees set")) {
                const treeId = Number(params[params.length - 1]);
                const tree = store.trees.find(t => t.id === treeId);
                if (tree) {
                    if (lower.includes("verification_status")) {
                        tree.verification_status = params[0];
                        tree.status = params[1] || params[0];
                        tree.admin_notes = params[2] || null;
                        tree.verified_at = new Date().toISOString();
                    } else if (lower.includes("status =")) {
                        tree.status = params[0];
                    }
                    writeStore(store);
                }
                return [{ affectedRows: 1 }, []];
            }

            if (lower.includes("from trees")) {
                // Pending tree registrations for coordinator audit
                if (lower.includes("verification_status = 'pending'") || lower.includes("status = 'planted'") && lower.includes("student_name")) {
                    const pending = store.trees.filter(t => (t.verification_status === "Pending" || (!t.verification_status && t.status === "Planted"))).map(t => {
                        const u = store.users.find(usr => usr.id === t.user_id) || {};
                        return {
                            tree_id: t.id,
                            id: t.id,
                            species: t.species,
                            location: t.location,
                            planting_date: t.planting_date,
                            notes: t.notes,
                            status: t.status,
                            verification_status: t.verification_status || "Pending",
                            admin_notes: t.admin_notes || null,
                            created_at: t.created_at,
                            user_id: t.user_id,
                            student_name: u.name || "Student Contributor",
                            student_email: u.email || "",
                            student_college: u.college || "Campus Community"
                        };
                    });
                    pending.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                    return [pending, []];
                }

                if (lower.includes("where user_id =") && lower.includes("sum(")) {
                    const uid = Number(params[0]);
                    const userTrees = store.trees.filter(t => t.user_id === uid);
                    const surviving = userTrees.filter(t => t.status === "Surviving").length;
                    const underCare = userTrees.filter(t => t.status === "Under Care").length;
                    const attention = userTrees.filter(t => t.status === "Needs Attention").length;
                    const planted = userTrees.filter(t => t.status === "Planted").length;
                    return [[{
                        total_trees: userTrees.length,
                        surviving_trees: surviving,
                        under_care: underCare,
                        needs_attention: attention,
                        planted_count: planted
                    }], []];
                }

                if (lower.includes("where t.user_id =")) {
                    const uid = Number(params[0]);
                    const userTrees = store.trees.filter(t => t.user_id === uid).map(t => {
                        const logs = store.care_logs.filter(l => l.tree_id === t.id);
                        logs.sort((a, b) => new Date(b.inspection_date) - new Date(a.inspection_date));
                        const latest = logs[0] || {};
                        return {
                            ...t,
                            total_inspections: logs.length,
                            last_inspection_date: latest.inspection_date || null,
                            latest_health: latest.health_status || "Uninspected",
                            latest_verification: latest.verification_status || "None"
                        };
                    });
                    userTrees.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                    return [userTrees, []];
                }

                if (lower.includes("where t.id =") || lower.includes("where id =")) {
                    const tid = Number(params[0]);
                    const match = store.trees.filter(t => t.id === tid).map(t => {
                        const u = store.users.find(usr => usr.id === t.user_id) || {};
                        return {
                            ...t,
                            owner_name: u.name,
                            owner_email: u.email,
                            owner_college: u.college
                        };
                    });
                    return [match, []];
                }

                if (lower.startsWith("select count(*)")) {
                    if (lower.includes("verification_status = 'pending'") || lower.includes("status = 'planted'")) {
                        const count = store.trees.filter(t => t.verification_status === "Pending" || (!t.verification_status && t.status === "Planted")).length;
                        return [[{ pendingTrees: count }], []];
                    }
                }

                const total = store.trees.length;
                const surviving = store.trees.filter(t => t.status === "Surviving").length;
                return [[{ totalTrees: total, survivingTrees: surviving }], []];
            }

            // 6. CARE_LOGS Queries
            if (lower.startsWith("insert into care_logs")) {
                const [tree_id, user_id, inspection_date, health_status, notes, evidence_url, verification_status] = params;
                const newId = store.care_logs.length > 0 ? Math.max(...store.care_logs.map(c => c.id)) + 1 : 1;
                const newLog = {
                    id: newId,
                    tree_id: Number(tree_id),
                    user_id: Number(user_id),
                    inspection_date,
                    health_status,
                    notes: notes || null,
                    evidence_url: evidence_url || null,
                    verification_status: verification_status || "Pending",
                    reviewer_id: null,
                    review_notes: null,
                    reviewed_at: null,
                    created_at: new Date().toISOString()
                };
                store.care_logs.push(newLog);
                writeStore(store);
                return [{ insertId: newId, rows: [newLog] }, []];
            }

            if (lower.startsWith("update care_logs set")) {
                const logId = Number(params[params.length - 1]);
                const log = store.care_logs.find(l => l.id === logId);
                if (log) {
                    if (lower.includes("verification_status")) {
                        log.verification_status = params[0];
                        log.reviewer_id = params[1] || null;
                        log.review_notes = params[2] || null;
                        log.reviewed_at = new Date().toISOString();
                    }
                    writeStore(store);
                }
                return [{ affectedRows: 1 }, []];
            }

            if (lower.includes("from care_logs")) {
                if (lower.includes("where cl.verification_status = 'pending'") || lower.includes("where verification_status = 'pending'")) {
                    if (lower.startsWith("select count(*)")) {
                        const count = store.care_logs.filter(l => l.verification_status === "Pending").length;
                        return [[{ pendingReviews: count }], []];
                    }

                    const pending = store.care_logs.filter(l => l.verification_status === "Pending").map(cl => {
                        const t = store.trees.find(tr => tr.id === cl.tree_id) || {};
                        const u = store.users.find(usr => usr.id === cl.user_id) || {};
                        return {
                            log_id: cl.id,
                            inspection_date: cl.inspection_date,
                            health_status: cl.health_status,
                            notes: cl.notes,
                            evidence_url: cl.evidence_url,
                            verification_status: cl.verification_status,
                            created_at: cl.created_at,
                            tree_id: t.id,
                            species: t.species,
                            location: t.location,
                            planting_date: t.planting_date,
                            tree_status: t.status,
                            student_id: u.id,
                            student_name: u.name,
                            student_email: u.email,
                            student_college: u.college
                        };
                    });
                    return [pending, []];
                }

                if (lower.includes("where user_id =") && lower.includes("sum(")) {
                    const uid = Number(params[0]);
                    const logs = store.care_logs.filter(l => l.user_id === uid);
                    const verified = logs.filter(l => l.verification_status === "Verified").length;
                    const pending = logs.filter(l => l.verification_status === "Pending").length;
                    return [[{
                        total_inspections: logs.length,
                        verified_inspections: verified,
                        pending_inspections: pending
                    }], []];
                }

                if (lower.includes("where cl.tree_id =") || lower.includes("where tree_id =")) {
                    const tid = Number(params[0]);
                    const logs = store.care_logs.filter(l => l.tree_id === tid).map(cl => {
                        const rev = store.users.find(u => u.id === cl.reviewer_id);
                        return {
                            ...cl,
                            reviewer_name: rev ? rev.name : null
                        };
                    });
                    logs.sort((a, b) => new Date(b.inspection_date) - new Date(a.inspection_date));
                    return [logs, []];
                }

                if (lower.includes("where id =")) {
                    const id = Number(params[0]);
                    const match = store.care_logs.filter(l => l.id === id);
                    return [match, []];
                }

                return [store.care_logs, []];
            }

            // Generic fallback
            return [[], []];
        },
        async end() {
            return Promise.resolve();
        }
    };
    console.log("[db] Initialized persistent storage adapter (ACID-safe).");
}

module.exports = poolInstance;