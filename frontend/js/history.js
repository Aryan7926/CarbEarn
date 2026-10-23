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
    const verificationFilter = document.getElementById("verificationFilter");
    const impactFilter = document.getElementById("impactFilter");
    const activityFilter = document.getElementById("activityFilter");

    let allActivities = [];

    try {
        const data = await CarbEarn.get(`/api/activities/user/${user.id}`);
        allActivities = data.activities || [];
        const totals = data.totals || {};

        // Summary metrics
        let totalCO2 = totals.total_co2 || 0;
        let totalPoints = totals.total_points || 0;
        let verifiedCBC = totals.verified_cbc || 0;
        let pendingCBC = totals.pending_cbc || 0;

        if (!totals.total_co2 && allActivities.length > 0) {
            totalCO2 = allActivities.reduce((acc, a) => acc + Number(a.co2_saved || 0), 0);
            totalPoints = allActivities.reduce((acc, a) => acc + Number(a.points || 0), 0);
            verifiedCBC = allActivities
                .filter(a => a.verification_status === "Verified")
                .reduce((acc, a) => acc + Number(a.carbon_currency !== undefined ? a.carbon_currency : a.co2_saved || 0), 0);
            pendingCBC = allActivities
                .filter(a => a.verification_status === "Pending" || !a.verification_status)
                .reduce((acc, a) => acc + Number(a.carbon_currency !== undefined ? a.carbon_currency : a.co2_saved || 0), 0);
        }

        CarbEarn.animateValue(document.getElementById("totalActivities"), 0, allActivities.length);
        CarbEarn.animateValue(document.getElementById("totalCO2"), 0, totalCO2);
        CarbEarn.animateValue(document.getElementById("totalVerifiedCBC"), 0, verifiedCBC);
        CarbEarn.animateValue(document.getElementById("totalPendingCBC"), 0, pendingCBC);

        const fiatValuationText = document.getElementById("fiatValuationText");
        if (fiatValuationText) {
            const inr = (verifiedCBC * 2.50).toFixed(2);
            fiatValuationText.textContent = `Valued at ~₹${inr} INR (@ ₹2.50/CBC)`;
        }

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
    if (verificationFilter) verificationFilter.addEventListener("change", applyFilters);
    impactFilter.addEventListener("change", applyFilters);
    activityFilter.addEventListener("change", applyFilters);

    function applyFilters() {
        const selectedVerification = verificationFilter ? verificationFilter.value : "All";
        const selectedImpact = impactFilter.value;
        const selectedActivity = activityFilter.value;

        const filtered = allActivities.filter(act => {
            const status = act.verification_status || "Pending";
            const matchesVerification = selectedVerification === "All" || status.toLowerCase() === selectedVerification.toLowerCase();
            const matchesImpact = selectedImpact === "All" || act.impact.toLowerCase() === selectedImpact.toLowerCase();
            const matchesActivity = selectedActivity === "All" || act.activity_name === selectedActivity;
            return matchesVerification && matchesImpact && matchesActivity;
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
                    if (verificationFilter) verificationFilter.value = "All";
                    impactFilter.value = "All";
                    activityFilter.value = "All";
                    applyFilters();
                });
            }
            return;
        }

        historyContainer.innerHTML = list.map(act => {
            const impactClass = (act.impact || "low").toLowerCase();
            const isVerified = act.verification_status === "Verified";
            const isRejected = act.verification_status === "Rejected";
            const cbcAmount = Number(act.carbon_currency !== undefined ? act.carbon_currency : act.co2_saved).toFixed(3);
            const inrVal = (Number(cbcAmount) * 2.50).toFixed(2);

            let statusBadgeHtml;
            if (isVerified) {
                statusBadgeHtml = `<span class="status-badge badge-verified">✓ Authorized & Minted</span>`;
            } else if (isRejected) {
                statusBadgeHtml = `<span class="status-badge badge-rejected">✕ Audit Rejected</span>`;
            } else {
                statusBadgeHtml = `<span class="status-badge badge-pending">⏳ Pending Audit</span>`;
            }

            return `
                <div class="activity-item card-animated" style="padding: 1.25rem; border-bottom: 1px solid var(--color-light-sage); margin-bottom: 0.75rem;">
                    <div class="activity-icon float-icon">🌿</div>
                    <div class="activity-details">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.35rem; gap: 0.5rem; flex-wrap: wrap;">
                            <div>
                                <strong style="font-size: 1.05rem; color: var(--color-primary-deep);">${escapeHtml(act.activity_name)}</strong>
                                ${act.category ? `<span class="badge badge-primary" style="font-size: 0.68rem; margin-left: 6px;">${escapeHtml(act.category)}</span>` : ""}
                            </div>
                            <div style="display: flex; gap: 6px; align-items: center;">
                                ${statusBadgeHtml}
                                <span class="status-badge badge-${impactClass}">${act.impact} Impact</span>
                            </div>
                        </div>

                        <div class="activity-meta mb-xs">
                            Volume: <strong>${act.quantity} ${escapeHtml(act.unit)}</strong> • 
                            Frequency: <strong>${act.frequency}x/week</strong> • 
                            Date: <strong>${formatDate(act.activity_date)}</strong>
                        </div>

                        <div class="activity-stats" style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 14px; font-size: 0.88rem;">
                            <span class="activity-stat">Mitigated: <strong style="color: var(--emerald-800);">${Number(act.co2_saved).toFixed(2)} kg CO₂</strong></span>
                            <span class="activity-stat">Carbon Currency: <strong style="color: var(--emerald-600); font-weight: 700;">+${cbcAmount} CBC</strong> (~₹${(Number(cbcAmount) * 2.50).toFixed(2)})</span>
                            <span class="activity-stat">Carbon Points: <strong>+${act.points}</strong></span>
                        </div>

                        ${act.certificate_hash ? `
                            <div style="margin-top: 8px; display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 0.72rem; color: var(--slate-400); text-transform: uppercase; font-weight: 600;">Ledger Hash:</span>
                                <span class="hash-pill" style="font-size: 0.7rem;">${escapeHtml(act.certificate_hash)}</span>
                            </div>
                        ` : ""}

                        ${act.review_notes ? `
                            <div style="margin-top: 6px; font-size: 0.8rem; background: var(--slate-50); padding: 4px 8px; border-radius: var(--radius-sm); border-left: 3px solid var(--emerald-500);">
                                <span style="font-weight: 600; color: var(--slate-700);">Coordinator Review Note:</span> ${escapeHtml(act.review_notes)}
                            </div>
                        ` : ""}
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