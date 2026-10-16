document.addEventListener("DOMContentLoaded", async () => {
    const session = CarbEarn.requireAuth("login.html");
    if (!session) return;

    const { user } = session;

    // Populate user profile info
    document.getElementById("userName").textContent = user.name || "Learner";
    document.getElementById("profileName").textContent = user.name || "—";
    document.getElementById("profileEmail").textContent = user.email || "—";
    document.getElementById("profileCollege").textContent = user.college || "Not specified";

    // Bind logout button
    const logoutBtn = document.getElementById("logoutButton");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", (e) => {
            e.preventDefault();
            CarbEarn.logout();
        });
    }

    await Promise.all([
        loadDashboardData(user.id),
        loadRecommendation(user.id)
    ]);
});

async function loadDashboardData(userId) {
    try {
        const data = await CarbEarn.get(`/api/dashboard/${userId}`);
        const { summary, impact_breakdown, recent_activities } = data;

        // Populate statistics with smooth animated counters
        CarbEarn.animateValue(document.getElementById("totalActivities"), 0, summary.total_activities || 0);
        CarbEarn.animateValue(document.getElementById("totalCO2"), 0, summary.total_co2_saved || 0);
        CarbEarn.animateValue(document.getElementById("totalPoints"), 0, summary.total_points || 0);
        document.getElementById("overallImpact").textContent = summary.overall_impact || "Low";

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
            <div class="empty-state text-center" style="padding: 2rem 1rem;">
                <p class="text-medium mb-md">No green activities recorded yet.</p>
                <a href="activities.html" class="btn btn-primary btn-sm">Log Your First Activity</a>
            </div>
        `;
        return;
    }

    container.innerHTML = activities.map(act => {
        const impactClass = (act.impact || "low").toLowerCase();
        return `
            <div class="activity-item">
                <div class="activity-icon">🌿</div>
                <div class="activity-details">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <span class="activity-name">${escapeHtml(act.activity_name)}</span>
                        <span class="status-badge badge-${impactClass}">${act.impact} Impact</span>
                    </div>
                    <div class="activity-meta">
                        ${act.quantity} ${escapeHtml(act.unit)} • ${act.frequency}x / week • ${formatDate(act.activity_date)}
                    </div>
                    <div class="activity-stats">
                        <span class="activity-stat">Mitigated: <strong>${Number(act.co2_saved).toFixed(2)} kg CO₂</strong></span>
                        <span class="activity-stat">Points: <strong>+${act.points}</strong></span>
                        ${act.ml_prediction ? `<span class="activity-stat text-xs">ML Classification: <em>${escapeHtml(act.ml_prediction)}</em></span>` : ""}
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

async function loadRecommendation(userId) {
    const container = document.getElementById("recommendationContent");
    try {
        const data = await CarbEarn.get(`/api/recommendations/${userId}`);

        container.innerHTML = `
            <div style="border-left: 3px solid var(--color-primary); padding-left: 1rem;">
                <p style="font-weight: 600; color: var(--color-primary-deep); margin-bottom: 0.5rem; line-height: 1.4;">
                    "${escapeHtml(data.recommendation)}"
                </p>
                <p class="text-sm text-medium mb-sm">${escapeHtml(data.reason)}</p>
                <div class="text-xs text-light">
                    Based on pattern: <strong>${escapeHtml(data.based_on_activity)}</strong>
                </div>
            </div>
        `;
    } catch (error) {
        container.innerHTML = `
            <p class="text-sm text-light">Personalized suggestions will update as more activities are logged.</p>
        `;
    }
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

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}