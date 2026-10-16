document.addEventListener("DOMContentLoaded", async () => {
    const session = CarbEarn.requireAuth("login.html");
    if (!session) return;

    const { user } = session;

    const logoutBtn = document.getElementById("logoutButton");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", (e) => {
            e.preventDefault();
            CarbEarn.logout();
        });
    }

    const historyContainer = document.getElementById("historyContainer");
    const impactFilter = document.getElementById("impactFilter");
    const activityFilter = document.getElementById("activityFilter");

    let allActivities = [];

    try {
        const data = await CarbEarn.get(`/api/activities/user/${user.id}`);
        allActivities = data.activities || [];

        // Summary metrics
        let totalCO2 = 0;
        let totalPoints = 0;

        for (const act of allActivities) {
            totalCO2 += Number(act.co2_saved || 0);
            totalPoints += Number(act.points || 0);
        }

        CarbEarn.animateValue(document.getElementById("totalActivities"), 0, allActivities.length);
        CarbEarn.animateValue(document.getElementById("totalCO2"), 0, totalCO2);
        CarbEarn.animateValue(document.getElementById("totalPoints"), 0, totalPoints);

        // Populate Activity Type filter
        const uniqueActivities = [...new Set(allActivities.map(a => a.activity_name))].sort();
        activityFilter.innerHTML = '<option value="All">All Activity Types</option>' +
            uniqueActivities.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");

        // Render initial list
        applyFilters();
    } catch (error) {
        console.error("Failed to load history:", error);
        historyContainer.innerHTML = `
            <div class="empty-state text-center" style="padding: 2rem;">
                <p class="text-error">Unable to load activity history: ${escapeHtml(error.message)}</p>
            </div>
        `;
    }

    // Filter event listeners
    impactFilter.addEventListener("change", applyFilters);
    activityFilter.addEventListener("change", applyFilters);

    function applyFilters() {
        const selectedImpact = impactFilter.value;
        const selectedActivity = activityFilter.value;

        const filtered = allActivities.filter(act => {
            const matchesImpact = selectedImpact === "All" || act.impact.toLowerCase() === selectedImpact.toLowerCase();
            const matchesActivity = selectedActivity === "All" || act.activity_name === selectedActivity;
            return matchesImpact && matchesActivity;
        });

        renderActivities(filtered);
    }

    function renderActivities(list) {
        if (!list || list.length === 0) {
            historyContainer.innerHTML = `
                <div class="empty-state text-center" style="padding: 3rem 1rem;">
                    <p class="text-medium mb-md">No activities match your current filter selections.</p>
                    <button type="button" id="resetFiltersBtn" class="btn btn-outline btn-sm">Reset Filters</button>
                </div>
            `;
            const resetBtn = document.getElementById("resetFiltersBtn");
            if (resetBtn) {
                resetBtn.addEventListener("click", () => {
                    impactFilter.value = "All";
                    activityFilter.value = "All";
                    applyFilters();
                });
            }
            return;
        }

        historyContainer.innerHTML = list.map(act => {
            const impactClass = (act.impact || "low").toLowerCase();
            return `
                <div class="activity-item" style="padding: 1.25rem 0; border-bottom: 1px solid var(--color-light-sage);">
                    <div class="activity-icon">🌿</div>
                    <div class="activity-details">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.25rem;">
                            <strong style="font-size: 1.05rem; color: var(--color-primary-deep);">${escapeHtml(act.activity_name)}</strong>
                            <span class="status-badge badge-${impactClass}">${act.impact} Impact</span>
                        </div>
                        <div class="activity-meta mb-xs">
                            Volume: <strong>${act.quantity} ${escapeHtml(act.unit)}</strong> • 
                            Frequency: <strong>${act.frequency} time(s)/week</strong> • 
                            Date: <strong>${formatDate(act.activity_date)}</strong>
                        </div>
                        <div class="activity-stats">
                            <span class="activity-stat">Mitigated: <strong>${Number(act.co2_saved).toFixed(2)} kg CO₂</strong></span>
                            <span class="activity-stat">Carbon Points: <strong>+${act.points}</strong></span>
                            ${act.ml_prediction ? `<span class="activity-stat text-xs">ML Impact: <em>${escapeHtml(act.ml_prediction)}</em></span>` : ""}
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

    function escapeHtml(str) {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }
});