document.addEventListener("DOMContentLoaded", async () => {
    const session = CarbEarn.requireAuth("login.html");
    if (!session) return;

    const { user } = session;

    // Populate user profile info
    document.getElementById("userName").textContent = user.name || "Learner";
    document.getElementById("profileName").textContent = user.name || "—";
    document.getElementById("profileEmail").textContent = user.email || "—";
    document.getElementById("profileCollege").textContent = user.college || "Not specified";

    const certName = document.getElementById("certContributorName");
    if (certName) certName.textContent = user.name || "Learner";

    // Bind logout button
    const logoutBtn = document.getElementById("logoutButton");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", (e) => {
            e.preventDefault();
            CarbEarn.logout();
        });
    }

    // Modal elements
    const certModal = document.getElementById("certificateModal");
    const openCertBtn = document.getElementById("btnOpenCertModal");
    const closeCertBtn = document.getElementById("btnCloseCertModal");
    const dismissCertBtn = document.getElementById("btnDismissCertModal");

    if (openCertBtn && certModal) {
        openCertBtn.addEventListener("click", () => {
            certModal.style.display = "flex";
        });
    }

    if (closeCertBtn && certModal) {
        closeCertBtn.addEventListener("click", () => {
            certModal.style.display = "none";
        });
    }

    if (dismissCertBtn && certModal) {
        dismissCertBtn.addEventListener("click", () => {
            certModal.style.display = "none";
        });
    }

    // Close on backdrop click
    if (certModal) {
        certModal.addEventListener("click", (e) => {
            if (e.target === certModal) {
                certModal.style.display = "none";
            }
        });
    }

    await loadDashboardData(user.id);
});

async function loadDashboardData(userId) {
    try {
        const data = await CarbEarn.get(`/api/dashboard/${userId}`);
        const { summary, impact_breakdown, recent_activities } = data;

        // Animate key stats
        CarbEarn.animateValue(document.getElementById("totalActivities"), 0, summary.total_activities || 0);
        CarbEarn.animateValue(document.getElementById("totalCO2"), 0, summary.total_co2_saved || 0);
        CarbEarn.animateValue(document.getElementById("totalPoints"), 0, summary.total_points || 0);
        document.getElementById("overallImpact").textContent = summary.overall_impact || "Low";

        // Carbon Currency Treasury Display
        const cc = summary.carbon_currency || {};
        const verifiedCBC = Number(cc.verified_cbc !== undefined ? cc.verified_cbc : summary.total_co2_saved || 0);
        const pendingCBC = Number(cc.pending_cbc || 0);
        const fiatINR = Number(cc.inr_valuation !== undefined ? cc.inr_valuation : (verifiedCBC * 2.50));

        CarbEarn.animateValue(document.getElementById("treasuryVerifiedCBC"), 0, verifiedCBC);
        document.getElementById("treasuryPendingCBC").innerHTML = `${pendingCBC.toFixed(3)} <small style="font-size: 0.75rem;">CBC</small>`;
        const fiatElem = document.getElementById("treasuryFiatINR");
        if (fiatElem) fiatElem.textContent = `₹${fiatINR.toFixed(2)}`;

        // Update Certificate modal preview
        const certCO2 = document.getElementById("certCO2Value");
        const certCBC = document.getElementById("certCBCValue");
        const certHash = document.getElementById("certLedgerHash");
        if (certCO2) certCO2.textContent = `${Number(summary.total_co2_saved || 0).toFixed(2)} kg`;
        if (certCBC) certCBC.textContent = `${verifiedCBC.toFixed(3)} CBC`;
        if (certHash) certHash.textContent = `0x${Math.abs(hashCode(`${userId}:${verifiedCBC}:${Date.now()}`)).toString(16).toUpperCase()}${Math.random().toString(16).substring(2, 10).toUpperCase()}`;

        // Impact progress bars
        const low = Number(impact_breakdown.low || 0);
        const medium = Number(impact_breakdown.medium || 0);
        const high = Number(impact_breakdown.high || 0);
        const totalImpactCount = low + medium + high;

        document.getElementById("lowImpact").textContent = low;
        document.getElementById("mediumImpact").textContent = medium;
        document.getElementById("highImpact").textContent = high;

        if (totalImpactCount > 0) {
            document.getElementById("lowImpactBar").style.width = `${(low / totalImpactCount) * 100}%`;
            document.getElementById("mediumImpactBar").style.width = `${(medium / totalImpactCount) * 100}%`;
            document.getElementById("highImpactBar").style.width = `${(high / totalImpactCount) * 100}%`;
        }

        // Monthly goal progress (50 kg target)
        const targetCO2 = 50.0;
        const currentCO2 = Number(summary.total_co2_saved || 0);
        const percentage = Math.min(100, Math.round((currentCO2 / targetCO2) * 100));

        document.getElementById("goalProgress").style.width = `${percentage}%`;
        document.getElementById("goalPercentage").textContent = `${percentage}%`;

        // Render recent activities
        renderRecentActivities(recent_activities);
    } catch (error) {
        console.error("Dashboard load error:", error);
        document.getElementById("recentActivities").innerHTML = `
            <div class="empty-state">
                <p class="text-error">Unable to load dashboard data: ${error.message}</p>
            </div>
        `;
    }
}

function renderRecentActivities(activities) {
    const container = document.getElementById("recentActivities");

    if (!activities || activities.length === 0) {
        container.innerHTML = `
            <div class="empty-state text-center" style="padding: 2.5rem 1rem;">
                <p class="text-medium mb-md">No green activities recorded yet.</p>
                <a href="activities.html" class="btn btn-primary btn-sm">Log Your First Activity</a>
            </div>
        `;
        return;
    }

    container.innerHTML = activities.map(act => {
        const impactClass = (act.impact || "low").toLowerCase();
        const isVerified = act.verification_status === "Verified";
        const cbcAmount = Number(act.carbon_currency !== undefined ? act.carbon_currency : act.co2_saved).toFixed(3);

        const statusPill = isVerified
            ? `<span class="status-badge badge-verified">✓ Authorized & Minted</span>`
            : `<span class="status-badge badge-pending">⏳ Pending Audit</span>`;

        return `
            <div class="activity-item card-animated">
                <div class="activity-icon float-icon">🌿</div>
                <div class="activity-details">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;">
                        <span class="activity-name">${escapeHtml(act.activity_name)}</span>
                        <div style="display: flex; gap: 6px; align-items: center;">
                            ${statusPill}
                            <span class="status-badge badge-${impactClass}">${act.impact}</span>
                        </div>
                    </div>
                    <div class="activity-meta">
                        ${act.quantity} ${escapeHtml(act.unit)} • ${act.frequency}x/week • ${formatDate(act.activity_date)}
                    </div>
                    <div class="activity-stats" style="margin-top: 6px; display: flex; gap: 12px; font-size: 0.85rem;">
                        <span class="activity-stat">Avoided: <strong style="color: var(--emerald-800);">${Number(act.co2_saved).toFixed(2)} kg CO₂</strong></span>
                        <span class="activity-stat">Carbon Currency: <strong style="color: var(--emerald-600); font-weight: 700;">+${cbcAmount} CBC</strong></span>
                        <span class="activity-stat">Points: <strong>+${act.points}</strong></span>
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

function formatDate(dateStr) {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString("en-IN", {
        month: "short",
        day: "numeric",
        year: "numeric"
    });
}

function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return hash;
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}