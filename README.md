# CarbEarn

> **Carbon consciousness converted into capital.**

CarbEarn is a full-stack sustainability platform that quantifies daily eco-friendly actions (clean commuting, energy conservation, waste mitigation, and verified tree planting) into measurable carbon savings and verified carbon points.

---

## Architecture

- **Frontend**: Nature-inspired CleanTech UI (Semantic HTML5, CSS3 Custom Properties, Vanilla ES6+ JavaScript).
- **Backend**: Node.js & Express 4 REST API with JWT Bearer authentication, role-based access control, and Helmet security.
- **Database Layer**: Dual-mode data access layer supporting **Neon PostgreSQL**, MySQL, and zero-config local persistent storage.
- **Impact Assessment Service**: Python Flask microservice providing instant ecological impact classification.

---

## Live Localhost Endpoints

| Service | Address | Description |
| :--- | :--- | :--- |
| **Web Application** | `http://localhost:5000` | Full frontend and Express API gateway |
| **Admin Control Center** | `http://localhost:5000/admin.html` | Governance & tree verification dashboard |
| **Impact Assessment API** | `http://127.0.0.1:5001` | Python Flask microservice |

---

## Default Credentials

- **Platform Administrator**:
  - Email: `admin@carbearn.com`
  - Password: `Admin@12345`
  - Secret Key (for registering new admins): `CARBEARN_ADMIN_2026`
- **Contributor Account**: Register a new user at `http://localhost:5000/register.html`.

> **Note on Role Separation**: Platform administrators oversee governance and tree audits. Admins are strictly excluded from contributor leaderboards and user metrics, and cannot act as regular contributors.

---

## Quick Start (Local Setup)

### 1. Prerequisites
- **Node.js**: v18+ (tested on v24 LTS)
- **Python**: v3.10+

### 2. Install Dependencies
```bash
# Backend dependencies
cd backend
npm install

# Machine Learning dependencies
cd ../ml
pip install -r requirements.txt
```

### 3. Start the Application
Open two terminal windows:

**Terminal 1 — Impact Service (Flask)**:
```bash
cd ml
python app.py
```
*(Runs on `http://127.0.0.1:5001`)*

**Terminal 2 — Backend & Web Server (Node.js)**:
```bash
cd backend
npm start
```
*(Runs on `http://localhost:5000`)*

Open your browser to: **`http://localhost:5000`**

---

## Neon PostgreSQL Setup

CarbEarn works out-of-the-box with local storage, but is fully pre-configured to connect to your personal **Neon PostgreSQL** database so you can view all tables and live data in your Neon Console.

### Steps to Connect Neon:
1. Log in to your [Neon Console](https://console.neon.tech/) and copy your PostgreSQL connection string.
2. Open `backend/.env` and update the `DATABASE_URL` line:
   ```env
   DATABASE_URL=postgresql://neondb_owner:YOUR_PASSWORD@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require
   DB_SSL=true
   ```
3. Run the automated database migration script:
   ```bash
   cd backend
   npm run migrate
   ```
4. All tables are created and seeded immediately in your Neon database:
   - `users` — Contributor and administrator accounts
   - `activities` — Standard emission factor catalog
   - `user_activities` — Logged green actions with verified carbon math
   - `trees` — GreenProof registered saplings with audit status
   - `care_logs` — Periodic tree health inspections
   - Default administrator account: `admin@carbearn.com`
5. Restart the backend server (`npm start`). All live changes will now sync directly to your Neon PostgreSQL database.

---

## Key Platform Features

### 1. Green Activity Logging
Calculates verified avoided emissions:
$$\text{CO}_2\text{ Saved (kg)} = \text{Quantity} \times \text{Emission Factor} \times \text{Weekly Frequency}$$
$$\text{Carbon Points} = \max\left(1, \text{round}\left(\text{CO}_2\text{ Saved} \times 10\right)\right)$$

### 2. GreenProof Sapling Verification
- Contributors register newly planted trees with species, geolocation, and soil notes.
- Submissions enter the **Tree Verification Queue** as `Pending`.
- Platform administrators audit submissions from the Admin Control Center:
  - **Verify (Correct)**: Approves sapling and awards the contributor **+50 Carbon Points**.
  - **Incorrect (Rejected)**: Records coordinator notes explaining why the submission was invalid.
- Contributors can submit periodic care logs (watering, mulching, health check) for **+25 points** upon review.

### 3. Administrator Governance & Creation
- Admins are separated from regular users and excluded from contributor metrics and leaderboards.
- **Register New Administrators**:
  - **From Admin Portal**: Existing admins can add new administrators via the **Admins & Staff** tab.
  - **From Public Registration**: Use the expandable *Registering as Platform Administrator?* toggle with the secret key (`CARBEARN_ADMIN_2026`).

---

## Verification & Automated Tests

To run the complete automated test suite verifying auth, IDOR protections, carbon math, and GreenProof audit flows:

```bash
cd backend
npm test
```

All 19 test suites run cleanly against the API.
