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

    const leaderboardContainer = document.getElementById("leaderboardContainer");
    const totalUsersBadge = document.getElementById("totalUsers");

    try {
        const data = await CarbEarn.get("/api/leaderboard");
        const list = data.leaderboard || [];

        totalUsersBadge.textContent = `${Number(data.total_users || list.length).toLocaleString()} contributors`;

        if (list.length === 0) {
            leaderboardContainer.innerHTML = `
                <div class="empty-state text-center" style="padding: 3rem 1rem;">
                    <p class="text-medium mb-md">No leaderboard rankings available yet.</p>
                    <a href="activities.html" class="btn btn-primary btn-sm">Log First Activity</a>
                </div>
            `;
            return;
        }

        leaderboardContainer.innerHTML = list.map(item => {
            const isCurrentUser = item.user_id === user.id;
            const rank = Number(item.rank);
            const rankClass = rank <= 3 ? `rank-${rank}` : "";

            return `
                <div class="leaderboard-item ${isCurrentUser ? "current-user" : ""}">
                    <div class="leaderboard-rank ${rankClass}">
                        ${rank <= 3 ? ["🥇", "🥈", "🥉"][rank - 1] : rank}
                    </div>

                    <div class="leaderboard-info">
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <strong style="color: var(--color-primary-deep); font-size: 1rem;">
                                ${escapeHtml(item.name)}
                            </strong>
                            ${isCurrentUser ? '<span class="badge badge-primary" style="font-size: 0.7rem; padding: 2px 6px;">You</span>' : ""}
                        </div>
                        <span class="text-xs text-light">${escapeHtml(item.college || "Campus Community")}</span>
                    </div>

                    <div style="text-align: right; margin-right: 1.5rem;">
                        <div class="text-sm font-semibold text-dark">${item.total_activities} actions</div>
                        <div class="text-xs text-medium">${Number(item.total_co2_saved).toFixed(2)} kg CO₂</div>
                    </div>

                    <div style="text-align: right; min-width: 90px;">
                        <strong style="font-size: 1.2rem; color: var(--color-primary);">${Number(item.total_points).toLocaleString()}</strong>
                        <div class="text-xs text-light">Points</div>
                    </div>
                </div>
            `;
        }).join("");
    } catch (error) {
        console.error("Failed to load leaderboard:", error);
        leaderboardContainer.innerHTML = `
            <div class="empty-state text-center" style="padding: 2rem;">
                <p class="text-error">Unable to load community leaderboard: ${escapeHtml(error.message)}</p>
            </div>
        `;
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