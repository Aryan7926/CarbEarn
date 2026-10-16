document.addEventListener("DOMContentLoaded", async () => {
    const session = CarbEarn.requireAuth("login.html");
    if (!session) return;

    // Default inspection date and planting date to today
    const today = new Date().toISOString().split("T")[0];
    const plantingDateInput = document.getElementById("plantingDate");
    const inspectionDateInput = document.getElementById("inspectionDate");
    if (plantingDateInput) plantingDateInput.value = today;
    if (inspectionDateInput) inspectionDateInput.value = today;

    const logoutBtn = document.getElementById("logoutButton");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", (e) => {
            e.preventDefault();
            CarbEarn.logout();
        });
    }

    const treesContainer = document.getElementById("treesContainer");
    const registerTreeForm = document.getElementById("registerTreeForm");
    const registerTreeBtn = document.getElementById("registerTreeBtn");
    const treeMessage = document.getElementById("treeMessage");
    const treeDetailPanel = document.getElementById("treeDetailPanel");
    const treeDetailContent = document.getElementById("treeDetailContent");
    const careLogForm = document.getElementById("careLogForm");
    const careTreeIdInput = document.getElementById("careTreeId");
    const submitCareBtn = document.getElementById("submitCareBtn");
    const careMessage = document.getElementById("careMessage");
    const careLogsTimeline = document.getElementById("careLogsTimeline");

    // 1. Initial Load
    await Promise.all([
        loadStats(),
        loadTrees()
    ]);

    // 2. Load GreenProof Summary Statistics
    async function loadStats() {
        try {
            const stats = await CarbEarn.get("/api/greenproof/stats");
            document.getElementById("totalTreesCount").textContent = Number(stats.total_trees || 0).toLocaleString();
            document.getElementById("survivingCount").textContent = Number(stats.surviving_trees || 0).toLocaleString();
            document.getElementById("attentionCount").textContent = Number(stats.needs_attention || 0).toLocaleString();
            document.getElementById("verifiedInspCount").textContent = Number(stats.verified_inspections || 0).toLocaleString();
        } catch (e) {
            console.error("Failed to load GreenProof metrics:", e);
        }
    }

    // 3. Load User Registered Trees
    async function loadTrees() {
        try {
            const data = await CarbEarn.get("/api/greenproof/trees");
            const trees = data.trees || [];

            if (trees.length === 0) {
                treesContainer.innerHTML = `
                    <div class="empty-state text-center" style="padding: 3rem 1rem;">
                        <p class="text-medium mb-md">You haven't registered any trees in GreenProof yet.</p>
                        <p class="text-xs text-light">Register saplings planted on campus or in your community to begin ongoing stewardship.</p>
                    </div>
                `;
                return;
            }

            treesContainer.innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.25rem;">
                    ${trees.map(tree => {
                        const statusClass = tree.status.toLowerCase().replace(/\s+/g, "-");
                        return `
                            <div class="tree-card" style="display: flex; flex-direction: column; justify-content: space-between;">
                                <div>
                                    <div class="tree-card-header" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
                                        <h4>🌳 ${escapeHtml(tree.species)}</h4>
                                        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                                            <span class="status-badge badge-${statusClass}">${tree.status}</span>
                                            ${tree.verification_status === "Verified" ? '<span class="status-badge badge-verified" style="font-size: 0.65rem;">✓ Verified Sapling</span>' : 
                                              tree.verification_status === "Rejected" ? '<span class="status-badge badge-rejected" style="font-size: 0.65rem;">✕ Incorrect / Flagged</span>' :
                                              '<span class="status-badge badge-pending" style="font-size: 0.65rem;">⏳ Audit Pending</span>'}
                                        </div>
                                    </div>
                                    <div class="tree-info">
                                        <span>📍 ${escapeHtml(tree.location)}</span>
                                        <span>📅 ${formatDate(tree.planting_date)}</span>
                                        <span>📋 ${tree.total_inspections} care checks</span>
                                        <span>🩺 ${escapeHtml(tree.latest_health)}</span>
                                    </div>
                                    ${tree.notes ? `<p class="text-xs text-light mb-sm"><em>"${escapeHtml(tree.notes)}"</em></p>` : ""}
                                    ${tree.admin_notes ? `<div style="background: rgba(16, 185, 129, 0.08); padding: 0.5rem; border-radius: 6px; font-size: 0.75rem; margin-top: 0.5rem;"><strong>Coordinator Note:</strong> ${escapeHtml(tree.admin_notes)}</div>` : ""}
                                </div>
                                <div class="tree-actions" style="margin-top: 1rem; border-top: 1px solid var(--slate-200); padding-top: 0.75rem;">
                                    <button type="button" class="btn btn-outline btn-sm btn-block view-tree-btn" data-id="${tree.id}">
                                        Manage Care & History
                                    </button>
                                </div>
                            </div>
                        `;
                    }).join("")}
                </div>
            `;

            // Bind click handlers to inspect tree
            document.querySelectorAll(".view-tree-btn").forEach(btn => {
                btn.addEventListener("click", () => {
                    const treeId = btn.getAttribute("data-id");
                    openTreeDetail(treeId);
                });
            });
        } catch (error) {
            console.error("Failed to load trees:", error);
            treesContainer.innerHTML = `
                <div class="empty-state text-center" style="padding: 2rem;">
                    <p class="text-error">Unable to load trees: ${escapeHtml(error.message)}</p>
                </div>
            `;
        }
    }

    // 4. Register New Tree Handler
    registerTreeForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const species = document.getElementById("species").value.trim();
        const location = document.getElementById("location").value.trim();
        const planting_date = document.getElementById("plantingDate").value;
        const notes = document.getElementById("treeNotes").value.trim();

        if (!species || !location || !planting_date) {
            showTreeMessage("Please provide tree species, campus location, and planting date.", "error");
            return;
        }

        registerTreeBtn.disabled = true;
        registerTreeBtn.textContent = "Registering...";
        showTreeMessage("Submitting sapling to GreenProof registry...", "info");

        try {
            await CarbEarn.post("/api/greenproof/trees", {
                species,
                location,
                planting_date,
                notes
            });

            showTreeMessage("Tree registered successfully in GreenProof registry!", "success");
            CarbEarn.showToast("Sapling registered in GreenProof registry!", "success");
            registerTreeForm.reset();
            if (plantingDateInput) plantingDateInput.value = today;

            await Promise.all([loadStats(), loadTrees()]);
        } catch (error) {
            showTreeMessage(error.message || "Failed to register tree.", "error");
            CarbEarn.showToast(error.message || "Failed to register tree", "error");
        } finally {
            registerTreeBtn.disabled = false;
            registerTreeBtn.textContent = "Register Sapling";
        }
    });

    // 5. Open Single Tree Detail & Historical Timeline
    async function openTreeDetail(treeId) {
        treeDetailPanel.style.display = "block";
        treeDetailPanel.scrollIntoView({ behavior: "smooth", block: "start" });
        careTreeIdInput.value = treeId;
        careLogsTimeline.innerHTML = '<p class="loading-state">Loading inspections...</p>';

        try {
            const data = await CarbEarn.get(`/api/greenproof/trees/${treeId}`);
            const { tree, care_logs } = data;

            document.getElementById("detailTreeTitle").textContent = `${tree.species} (${tree.location})`;

            treeDetailContent.innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; background: var(--color-off-white); padding: 1rem; border-radius: var(--radius-md);">
                    <div>
                        <span class="text-xs text-light">Planted On:</span>
                        <strong style="display: block;">${formatDate(tree.planting_date)}</strong>
                    </div>
                    <div>
                        <span class="text-xs text-light">Current Survival Status:</span>
                        <strong style="display: block;" class="text-primary-deep">${tree.status}</strong>
                    </div>
                    <div>
                        <span class="text-xs text-light">Total Health Inspections:</span>
                        <strong style="display: block;">${care_logs.length} logged</strong>
                    </div>
                </div>
            `;

            renderCareLogs(care_logs);
        } catch (error) {
            console.error("Failed to load tree details:", error);
            treeDetailContent.innerHTML = `<p class="text-error">Unable to load tree details: ${escapeHtml(error.message)}</p>`;
        }
    }

    function renderCareLogs(logs) {
        if (!logs || logs.length === 0) {
            careLogsTimeline.innerHTML = `
                <p class="text-sm text-medium" style="padding: 1rem 0;">
                    No care checks recorded yet. Submit the first inspection above to establish a health baseline.
                </p>
            `;
            return;
        }

        careLogsTimeline.innerHTML = logs.map(log => {
            const verifyStatus = (log.verification_status || "Pending").toLowerCase();
            return `
                <div class="care-entry">
                    <div class="care-dot ${verifyStatus}"></div>
                    <div class="care-content">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div>
                                <span class="care-date">${formatDate(log.inspection_date)}</span>
                                <div class="care-status-text">Observed Health: <strong>${log.health_status}</strong></div>
                            </div>
                            <span class="status-badge badge-${verifyStatus}">
                                ${log.verification_status === "Verified" ? "✓ Verified" : log.verification_status}
                            </span>
                        </div>
                        ${log.notes ? `<p class="care-notes">${escapeHtml(log.notes)}</p>` : ""}
                        ${log.evidence_url ? `<a href="${escapeHtml(log.evidence_url)}" target="_blank" rel="noopener noreferrer" class="text-xs text-primary" style="display: inline-block; margin-top: 4px;">🔗 View Photographic Evidence</a>` : ""}
                        ${log.review_notes ? `
                            <div style="background: rgba(45, 138, 94, 0.08); padding: 0.5rem; border-radius: var(--radius-sm); margin-top: 0.5rem; font-size: 0.8rem;">
                                <strong>Coordinator Feedback (${escapeHtml(log.reviewer_name || "Admin")}):</strong> ${escapeHtml(log.review_notes)}
                            </div>
                        ` : ""}
                    </div>
                </div>
            `;
        }).join("");
    }

    // 6. Submit Care Inspection Form
    careLogForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const treeId = careTreeIdInput.value;
        const inspection_date = document.getElementById("inspectionDate").value;
        const health_status = document.getElementById("healthStatus").value;
        const notes = document.getElementById("careNotes").value.trim();
        const evidence_url = document.getElementById("evidenceUrl").value.trim();

        if (!treeId) {
            showCareMessage("Please select a tree to log inspection.", "error");
            return;
        }

        if (!inspection_date || !health_status) {
            showCareMessage("Please provide an inspection date and observed health status.", "error");
            return;
        }

        submitCareBtn.disabled = true;
        submitCareBtn.textContent = "Submitting Inspection...";
        showCareMessage("Logging care verification...", "info");

        try {
            await CarbEarn.post(`/api/greenproof/trees/${treeId}/care`, {
                inspection_date,
                health_status,
                notes,
                evidence_url: evidence_url || null
            });

            showCareMessage("Inspection successfully submitted for coordinator verification!", "success");
            CarbEarn.showToast("Inspection submitted for verification!", "success");
            careLogForm.reset();
            if (inspectionDateInput) inspectionDateInput.value = today;

            // Refresh tree view and stats
            await Promise.all([
                openTreeDetail(treeId),
                loadStats(),
                loadTrees()
            ]);
        } catch (error) {
            showCareMessage(error.message || "Failed to submit care log.", "error");
            CarbEarn.showToast(error.message || "Failed to submit care log", "error");
        } finally {
            submitCareBtn.disabled = false;
            submitCareBtn.textContent = "Submit Inspection for Verification";
        }
    });

    document.getElementById("closeDetailBtn").addEventListener("click", () => {
        treeDetailPanel.style.display = "none";
    });

    document.getElementById("openRegisterTreeBtn").addEventListener("click", () => {
        document.getElementById("registerTreeCard").scrollIntoView({ behavior: "smooth" });
        document.getElementById("species").focus();
    });

    function showTreeMessage(text, type) {
        treeMessage.textContent = text;
        treeMessage.className = `form-message ${type}`;
    }

    function showCareMessage(text, type) {
        careMessage.textContent = text;
        careMessage.className = `form-message ${type}`;
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
