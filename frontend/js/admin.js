/**
 * CarbEarn Administrator Control Center Client
 * 
 * Manages platform governance:
 * - Real-time system overview analytics
 * - New tree registration audit (Verify as Correct or Mark as Incorrect)
 * - Periodic care inspection audit
 * - Campus user directory & search
 * - Live environmental activity ledger
 */

document.addEventListener("DOMContentLoaded", async () => {
    // 1. Enforce Admin Access
    const session = CarbEarn.requireAdmin("dashboard.html");
    if (!session) return;

    const { user } = session;
    const adminProfileName = document.getElementById("adminProfileName");
    if (adminProfileName) {
        adminProfileName.textContent = user.name || "Administrator";
    }

    const adminLogoutBtn = document.getElementById("adminLogout");
    if (adminLogoutBtn) {
        adminLogoutBtn.addEventListener("click", () => {
            CarbEarn.logout();
        });
    }

    const refreshBtn = document.getElementById("refreshAdmin");
    const adminMessage = document.getElementById("adminMessage");
    const userSearch = document.getElementById("userSearch");

    let allUsers = [];
    let pendingTrees = [];
    let pendingCareLogs = [];

    // --- Tab Switching Logic ---
    const tabButtons = {
        tree: document.getElementById("btnTabTreeQueue"),
        care: document.getElementById("btnTabCareQueue"),
        users: document.getElementById("btnTabUsers"),
        activities: document.getElementById("btnTabActivities")
    };

    const sections = {
        tree: document.getElementById("sectionTreeQueue"),
        care: document.getElementById("sectionCareQueue"),
        users: document.getElementById("sectionUsers"),
        admins: document.getElementById("sectionAdmins"),
        activities: document.getElementById("sectionActivities")
    };

    function switchTab(activeKey) {
        Object.keys(sections).forEach(key => {
            const sec = sections[key];
            const btn = tabButtons[key];
            if (key === activeKey) {
                if (btn) {
                    btn.classList.add("active");
                    btn.style.background = "#ffffff";
                    btn.style.color = "var(--slate-900)";
                    btn.style.fontWeight = "700";
                    btn.style.boxShadow = "var(--shadow-xs)";
                }
                if (sec) sec.style.display = "block";
            } else {
                if (btn) {
                    btn.classList.remove("active");
                    btn.style.background = "transparent";
                    btn.style.color = "var(--slate-600)";
                    btn.style.fontWeight = "600";
                    btn.style.boxShadow = "none";
                }
                if (sec) sec.style.display = "none";
            }
        });
    }

    if (tabButtons.tree) tabButtons.tree.addEventListener("click", () => switchTab("tree"));
    if (tabButtons.care) tabButtons.care.addEventListener("click", () => switchTab("care"));
    if (tabButtons.users) tabButtons.users.addEventListener("click", () => switchTab("users"));
    if (tabButtons.activities) tabButtons.activities.addEventListener("click", () => switchTab("activities"));

    // Navbar link tab routing
    document.querySelectorAll(".admin-tab-btn").forEach(link => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            document.querySelectorAll(".admin-tab-btn").forEach(l => l.classList.remove("active"));
            link.classList.add("active");
            const tab = link.getAttribute("data-tab");
            if (tab === "tabTreeQueue") switchTab("tree");
            else if (tab === "tabCareQueue") switchTab("care");
            else if (tab === "tabUsers") switchTab("users");
            else if (tab === "tabAdmins") switchTab("admins");
            else if (tab === "tabActivities") switchTab("activities");
            else switchTab("tree");
        });
    });

    // --- MODAL 1: Tree Verification Modal Elements ---
    const treeModal = document.getElementById("treeReviewModal");
    const closeTreeModal = document.getElementById("closeTreeModal");
    const cancelTreeModalBtn = document.getElementById("cancelTreeModalBtn");
    const reviewTreeForm = document.getElementById("reviewTreeForm");
    const modalTreeId = document.getElementById("modalTreeId");
    const treeModalDetails = document.getElementById("treeModalDetails");
    const treeVerificationDecision = document.getElementById("treeVerificationDecision");
    const treeAdminNotes = document.getElementById("treeAdminNotes");

    // --- MODAL 2: Care Inspection Modal Elements ---
    const careModal = document.getElementById("reviewModal");
    const closeCareModal = document.getElementById("closeReviewModal");
    const cancelCareModalBtn = document.getElementById("cancelReviewBtn");
    const reviewCareForm = document.getElementById("reviewInspectionForm");
    const modalLogId = document.getElementById("modalLogId");
    const modalCareDetails = document.getElementById("modalInspectionDetails");
    const reviewStatusSelect = document.getElementById("reviewStatusSelect");
    const reviewNotesInput = document.getElementById("reviewNotesInput");

    // Initial load
    await refreshAll();

    if (refreshBtn) {
        refreshBtn.addEventListener("click", async () => {
            refreshBtn.disabled = true;
            refreshBtn.textContent = "↻ Refreshing...";
            await refreshAll();
            refreshBtn.disabled = false;
            refreshBtn.textContent = "↻ Refresh Live Data";
            CarbEarn.showToast("Live system data refreshed", "info");
        });
    }

    async function refreshAll() {
        await Promise.allSettled([
            loadOverview(),
            loadPendingTrees(),
            loadPendingCareLogs(),
            loadUsers(),
            loadAdmins(),
            loadRecentActivities()
        ]);
    }

    // -------------------------------------------------------------------------
    // 1. Overview Metrics
    // -------------------------------------------------------------------------
    async function loadOverview() {
        try {
            const data = await CarbEarn.get("/api/admin/overview");

            CarbEarn.animateValue(document.getElementById("totalUsers"), 0, data.totalUsers || 0);
            CarbEarn.animateValue(document.getElementById("totalActivities"), 0, data.totalActivities || 0);
            CarbEarn.animateValue(document.getElementById("totalCO2Saved"), 0, data.totalCO2Saved || 0);
            CarbEarn.animateValue(document.getElementById("totalTrees"), 0, data.totalTrees || 0);

            const pendingReviews = Number(data.pendingReviews || 0);
            const pendingTreesCount = Number(data.pendingTrees || 0);

            CarbEarn.animateValue(document.getElementById("pendingReviewsCount"), 0, pendingReviews);
            CarbEarn.animateValue(document.getElementById("pendingTreesCount"), 0, pendingTreesCount);

            // Badges in navbar
            const treeBadge = document.getElementById("pendingTreesBadge");
            if (treeBadge) {
                treeBadge.textContent = pendingTreesCount;
                treeBadge.style.display = pendingTreesCount > 0 ? "inline-block" : "none";
            }

            const careBadge = document.getElementById("pendingCareBadge");
            if (careBadge) {
                careBadge.textContent = pendingReviews;
                careBadge.style.display = pendingReviews > 0 ? "inline-block" : "none";
            }
        } catch (e) {
            console.error("Overview error:", e);
        }
    }

    // -------------------------------------------------------------------------
    // 2. New Tree Verification Queue (Approve Correct / Mark Incorrect)
    // -------------------------------------------------------------------------
    async function loadPendingTrees() {
        const container = document.getElementById("pendingTreesContainer");
        try {
            const data = await CarbEarn.get("/api/greenproof/admin/pending-trees");
            pendingTrees = data.pending_trees || [];

            if (pendingTrees.length === 0) {
                container.innerHTML = `
                    <div class="empty-state text-center" style="padding: 2.5rem 1rem;">
                        <div style="font-size: 2rem; margin-bottom: 0.5rem;">🌿</div>
                        <p class="font-bold text-dark">No pending tree registrations awaiting audit.</p>
                        <p class="text-sm text-medium">All newly submitted saplings have been verified as correct or marked as incorrect.</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = `
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Student Contributor</th>
                                <th>Sapling Species</th>
                                <th>Planting Location</th>
                                <th>Date Planted</th>
                                <th>Soil / Notes</th>
                                <th>Audit Status</th>
                                <th style="text-align: right;">Verification Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${pendingTrees.map(t => `
                                <tr>
                                    <td>
                                        <div style="font-weight: 700; color: var(--slate-900);">${escapeHtml(t.student_name)}</div>
                                        <div class="text-xs text-medium">${escapeHtml(t.student_college || t.student_email)}</div>
                                    </td>
                                    <td>
                                        <strong style="color: var(--emerald-800);">${escapeHtml(t.species)}</strong>
                                    </td>
                                    <td>
                                        <span class="text-sm">📍 ${escapeHtml(t.location)}</span>
                                    </td>
                                    <td>
                                        <span class="text-sm">${formatDate(t.planting_date)}</span>
                                    </td>
                                    <td>
                                        <span class="text-xs text-medium">${escapeHtml(t.notes || "No notes provided")}</span>
                                    </td>
                                    <td>
                                        <span class="status-badge badge-pending">⏳ Pending Audit</span>
                                    </td>
                                    <td style="text-align: right;">
                                        <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                                            <button type="button" class="btn btn-primary btn-sm btn-verify-tree" data-id="${t.tree_id}" data-action="Verified">
                                                ✓ Verify (Correct)
                                            </button>
                                            <button type="button" class="btn btn-secondary btn-sm btn-verify-tree" data-id="${t.tree_id}" data-action="Rejected" style="color: var(--color-danger); border-color: rgba(239, 68, 68, 0.4);">
                                                ✕ Incorrect
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            `;

            // Bind click handlers to verification buttons
            container.querySelectorAll(".btn-verify-tree").forEach(btn => {
                btn.addEventListener("click", () => {
                    const treeId = Number(btn.getAttribute("data-id"));
                    const initialDecision = btn.getAttribute("data-action");
                    openTreeReviewModal(treeId, initialDecision);
                });
            });
        } catch (e) {
            console.error("Pending trees error:", e);
            container.innerHTML = `<div class="empty-state text-error">Unable to load pending trees: ${escapeHtml(e.message)}</div>`;
        }
    }

    function openTreeReviewModal(treeId, initialDecision = "Verified") {
        const tree = pendingTrees.find(t => t.tree_id === treeId);
        if (!tree) return;

        modalTreeId.value = treeId;
        treeVerificationDecision.value = initialDecision;
        treeAdminNotes.value = initialDecision === "Verified" 
            ? "Ground inspection confirms valid sapling planting at designated campus location." 
            : "Submission details could not be verified or location is not recognized.";

        treeModalDetails.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                <div>
                    <span class="text-xs text-light">Contributor:</span>
                    <strong style="display: block;">${escapeHtml(tree.student_name)} (${escapeHtml(tree.student_college || "")})</strong>
                </div>
                <div>
                    <span class="text-xs text-light">Species:</span>
                    <strong style="display: block; color: var(--emerald-800);">${escapeHtml(tree.species)}</strong>
                </div>
                <div>
                    <span class="text-xs text-light">Location:</span>
                    <strong style="display: block;">${escapeHtml(tree.location)}</strong>
                </div>
                <div>
                    <span class="text-xs text-light">Planting Date:</span>
                    <strong style="display: block;">${formatDate(tree.planting_date)}</strong>
                </div>
            </div>
            ${tree.notes ? `<div style="margin-top: 0.75rem; border-top: 1px dashed var(--slate-200); padding-top: 0.5rem;"><span class="text-xs text-light">Contributor Notes:</span> <span class="text-xs">${escapeHtml(tree.notes)}</span></div>` : ""}
        `;

        treeModal.style.display = "flex";
    }

    function closeTreeModalDialog() {
        treeModal.style.display = "none";
        reviewTreeForm.reset();
    }

    if (closeTreeModal) closeTreeModal.addEventListener("click", closeTreeModalDialog);
    if (cancelTreeModalBtn) cancelTreeModalBtn.addEventListener("click", closeTreeModalDialog);

    if (reviewTreeForm) {
        reviewTreeForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const treeId = modalTreeId.value;
            const verification_status = treeVerificationDecision.value;
            const admin_notes = treeAdminNotes.value.trim();

            const submitBtn = document.getElementById("submitTreeDecisionBtn");
            submitBtn.disabled = true;
            submitBtn.textContent = "Saving...";

            try {
                const res = await CarbEarn.put(`/api/greenproof/admin/trees/${treeId}/review`, {
                    verification_status,
                    admin_notes
                });

                closeTreeModalDialog();
                if (verification_status === "Verified") {
                    CarbEarn.showToast("Tree verified as Correct! +50 Points awarded to contributor.", "success");
                } else {
                    CarbEarn.showToast("Tree registration marked as Incorrect.", "info");
                }

                await Promise.all([
                    loadOverview(),
                    loadPendingTrees()
                ]);
            } catch (err) {
                CarbEarn.showToast(err.message || "Failed to record tree decision", "error");
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = "Confirm Verification";
            }
        });
    }

    // -------------------------------------------------------------------------
    // 3. Care Inspection Reviews Queue
    // -------------------------------------------------------------------------
    async function loadPendingCareLogs() {
        const container = document.getElementById("pendingReviewsContainer");
        try {
            const data = await CarbEarn.get("/api/greenproof/admin/pending");
            pendingCareLogs = data.pending_reviews || [];

            if (pendingCareLogs.length === 0) {
                container.innerHTML = `
                    <div class="empty-state text-center" style="padding: 2.5rem 1rem;">
                        <div style="font-size: 2rem; margin-bottom: 0.5rem;">🔍</div>
                        <p class="font-bold text-dark">No pending health inspections awaiting audit.</p>
                        <p class="text-sm text-medium">All contributor care check logs have been reviewed.</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = `
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Contributor</th>
                                <th>Tree Species & Location</th>
                                <th>Inspection Date</th>
                                <th>Reported Health</th>
                                <th>Notes & Evidence</th>
                                <th style="text-align: right;">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${pendingCareLogs.map(r => `
                                <tr>
                                    <td>
                                        <div style="font-weight: 700; color: var(--slate-900);">${escapeHtml(r.student_name)}</div>
                                        <div class="text-xs text-medium">${escapeHtml(r.student_college || r.student_email)}</div>
                                    </td>
                                    <td>
                                        <strong>${escapeHtml(r.species)}</strong>
                                        <div class="text-xs text-medium">📍 ${escapeHtml(r.location)}</div>
                                    </td>
                                    <td>${formatDate(r.inspection_date)}</td>
                                    <td>
                                        <span class="status-badge badge-${(r.health_status || 'healthy').toLowerCase()}">
                                            ${r.health_status}
                                        </span>
                                    </td>
                                    <td>
                                        <div class="text-sm">${escapeHtml(r.notes || "No notes provided")}</div>
                                        ${r.evidence_url ? `<a href="${escapeHtml(r.evidence_url)}" target="_blank" rel="noopener noreferrer" class="text-xs text-primary" style="display:inline-block; margin-top:2px;">🔗 View Photographic Evidence</a>` : ""}
                                    </td>
                                    <td style="text-align: right;">
                                        <button type="button" class="btn btn-primary btn-sm review-care-btn" data-id="${r.log_id}">
                                            Review Care Log
                                        </button>
                                    </td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            `;

            container.querySelectorAll(".review-care-btn").forEach(btn => {
                btn.addEventListener("click", () => {
                    const logId = Number(btn.getAttribute("data-id"));
                    openCareModal(logId);
                });
            });
        } catch (e) {
            console.error("Pending care logs error:", e);
            container.innerHTML = `<div class="empty-state text-error">Unable to load care checks: ${escapeHtml(e.message)}</div>`;
        }
    }

    function openCareModal(logId) {
        const log = pendingCareLogs.find(l => l.log_id === logId);
        if (!log) return;

        modalLogId.value = logId;
        reviewStatusSelect.value = "Verified";
        reviewNotesInput.value = "Inspection observations and health confirmed from evidence.";

        modalCareDetails.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                <div>
                    <span class="text-xs text-light">Contributor:</span>
                    <strong style="display: block;">${escapeHtml(log.student_name)}</strong>
                </div>
                <div>
                    <span class="text-xs text-light">Tree:</span>
                    <strong style="display: block; color: var(--emerald-800);">${escapeHtml(log.species)}</strong>
                </div>
                <div>
                    <span class="text-xs text-light">Reported Health:</span>
                    <strong style="display: block;">${escapeHtml(log.health_status)}</strong>
                </div>
                <div>
                    <span class="text-xs text-light">Date:</span>
                    <strong style="display: block;">${formatDate(log.inspection_date)}</strong>
                </div>
            </div>
            ${log.notes ? `<div style="margin-top: 0.75rem; border-top: 1px dashed var(--slate-200); padding-top: 0.5rem;"><span class="text-xs text-light">Notes:</span> <span class="text-xs">${escapeHtml(log.notes)}</span></div>` : ""}
            ${log.evidence_url ? `<div style="margin-top: 0.5rem;"><a href="${escapeHtml(log.evidence_url)}" target="_blank" rel="noopener noreferrer" class="text-xs text-primary">🔗 Open Photographic Evidence URL</a></div>` : ""}
        `;

        careModal.style.display = "flex";
    }

    function closeCareModalDialog() {
        careModal.style.display = "none";
        reviewCareForm.reset();
    }

    if (closeCareModal) closeCareModal.addEventListener("click", closeCareModalDialog);
    if (cancelCareModalBtn) cancelCareModalBtn.addEventListener("click", closeCareModalDialog);

    if (reviewStatusSelect) {
        reviewStatusSelect.addEventListener("change", () => {
            if (reviewStatusSelect.value === "Rejected") {
                if (reviewNotesInput.value === "Inspection observations and health confirmed from evidence.") {
                    reviewNotesInput.value = "Inspection observations could not be verified or evidence is insufficient.";
                }
            } else if (reviewStatusSelect.value === "Verified") {
                if (reviewNotesInput.value === "Inspection observations could not be verified or evidence is insufficient.") {
                    reviewNotesInput.value = "Inspection observations and health confirmed from evidence.";
                }
            }
        });
    }

    if (reviewCareForm) {
        reviewCareForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const logId = modalLogId.value;
            const verification_status = reviewStatusSelect.value;
            const review_notes = reviewNotesInput.value.trim();

            const submitBtn = document.getElementById("submitReviewDecisionBtn") || reviewCareForm.querySelector("button[type='submit']");
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "Saving...";
            }

            try {
                await CarbEarn.put(`/api/greenproof/admin/care/${logId}/review`, {
                    verification_status,
                    review_notes
                });

                closeCareModalDialog();
                if (verification_status === "Verified") {
                    CarbEarn.showToast("Care inspection verified! +25 Points awarded.", "success");
                } else {
                    CarbEarn.showToast("Care inspection marked as Rejected.", "info");
                }

                await Promise.allSettled([
                    loadOverview(),
                    loadPendingCareLogs(),
                    loadUsers(),
                    loadRecentActivities()
                ]);
            } catch (err) {
                console.error("Save care review error:", err);
                CarbEarn.showToast(err.message || "Failed to record decision", "error");
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = "Save Decision";
                }
            }
        });
    }

    // -------------------------------------------------------------------------
    // 4. Contributor Directory
    // -------------------------------------------------------------------------
    async function loadUsers() {
        const tbody = document.getElementById("usersTableBody");
        try {
            allUsers = await CarbEarn.get("/api/admin/users?limit=100");
            renderUsers(allUsers);
        } catch (e) {
            console.error("Users error:", e);
            tbody.innerHTML = `<tr><td colspan="7" class="text-error text-center">Unable to load users: ${escapeHtml(e.message)}</td></tr>`;
        }
    }

    function renderUsers(users) {
        const tbody = document.getElementById("usersTableBody");
        if (!users || users.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center text-medium" style="padding: 2rem;">No registered contributors found.</td></tr>`;
            return;
        }

        tbody.innerHTML = users.map(u => `
            <tr>
                <td>
                    <div style="font-weight: 700; color: var(--slate-900);">${escapeHtml(u.name)}</div>
                    <div class="text-xs text-medium">${escapeHtml(u.email)}</div>
                </td>
                <td>${escapeHtml(u.college || "Campus Community")}</td>
                <td>
                    <span class="status-badge ${u.role === "ADMIN" ? "badge-primary" : "badge-active"}">
                        ${u.role}
                    </span>
                </td>
                <td><strong>${u.activity_count}</strong> actions</td>
                <td><strong>${Number(u.total_co2).toFixed(2)}</strong> kg</td>
                <td><strong class="text-primary">+${Number(u.total_points).toLocaleString()}</strong> pts</td>
                <td class="text-xs text-light">${formatDate(u.created_at)}</td>
            </tr>
        `).join("");
    }

    if (userSearch) {
        userSearch.addEventListener("input", () => {
            const q = userSearch.value.trim().toLowerCase();
            const filtered = allUsers.filter(u =>
                (u.name && u.name.toLowerCase().includes(q)) ||
                (u.email && u.email.toLowerCase().includes(q)) ||
                (u.college && u.college.toLowerCase().includes(q))
            );
            renderUsers(filtered);
        });
    }

    // -------------------------------------------------------------------------
    // 5. Recent Activity Ledger
    // -------------------------------------------------------------------------
    async function loadRecentActivities() {
        const tbody = document.getElementById("activitiesTableBody");
        try {
            const activities = await CarbEarn.get("/api/admin/activities");
            if (!activities || activities.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" class="text-center text-medium" style="padding: 2rem;">No activities logged yet.</td></tr>`;
                return;
            }

            tbody.innerHTML = activities.map(act => {
                const impactClass = (act.impact || "low").toLowerCase();
                return `
                    <tr>
                        <td><strong>${escapeHtml(act.user_name)}</strong></td>
                        <td>${escapeHtml(act.activity_name)}</td>
                        <td>${act.quantity} ${escapeHtml(act.unit)} (${act.frequency}x/wk)</td>
                        <td><strong>${Number(act.co2_saved).toFixed(2)}</strong> kg</td>
                        <td class="text-primary"><strong>+${act.points}</strong></td>
                        <td><span class="status-badge badge-${impactClass}">${act.impact}</span></td>
                        <td class="text-xs text-light">${formatDate(act.activity_date)}</td>
                    </tr>
                `;
            }).join("");
        } catch (e) {
            console.error("Activities error:", e);
            tbody.innerHTML = `<tr><td colspan="7" class="text-error text-center">Unable to load recent activities: ${escapeHtml(e.message)}</td></tr>`;
        }
    }

    // -------------------------------------------------------------------------
    // 6. Platform Administrators Directory & Registration
    // -------------------------------------------------------------------------
    async function loadAdmins() {
        const tbody = document.getElementById("adminsTableBody");
        if (!tbody) return;
        try {
            const admins = await CarbEarn.get("/api/admin/admins");
            if (!admins || admins.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" class="text-center text-medium" style="padding: 2rem;">No platform administrators found.</td></tr>`;
                return;
            }

            tbody.innerHTML = admins.map(a => `
                <tr>
                    <td>
                        <div style="font-weight: 700; color: var(--slate-900);">${escapeHtml(a.name)}</div>
                    </td>
                    <td>${escapeHtml(a.email)}</td>
                    <td>${escapeHtml(a.college || "CarbEarn Platform Administration")}</td>
                    <td>
                        <span class="status-badge badge-primary">
                            🛡️ ${escapeHtml(a.role)}
                        </span>
                    </td>
                    <td class="text-xs text-light">${formatDate(a.created_at)}</td>
                </tr>
            `).join("");
        } catch (e) {
            console.error("Admins error:", e);
            tbody.innerHTML = `<tr><td colspan="5" class="text-error text-center">Unable to load administrators: ${escapeHtml(e.message)}</td></tr>`;
        }
    }

    const addAdminModal = document.getElementById("addAdminModal");
    const openAddAdminModalBtn = document.getElementById("openAddAdminModalBtn");
    const closeAddAdminModal = document.getElementById("closeAddAdminModal");
    const cancelAddAdminBtn = document.getElementById("cancelAddAdminBtn");
    const addAdminForm = document.getElementById("addAdminForm");
    const adminCreateMsg = document.getElementById("adminCreateMsg");

    function openAdminModal() {
        if (addAdminModal) {
            addAdminModal.style.display = "flex";
            if (adminCreateMsg) {
                adminCreateMsg.style.display = "none";
                adminCreateMsg.textContent = "";
            }
            document.getElementById("newAdminName")?.focus();
        }
    }

    function closeAdminModal() {
        if (addAdminModal) {
            addAdminModal.style.display = "none";
            addAdminForm?.reset();
        }
    }

    if (openAddAdminModalBtn) openAddAdminModalBtn.addEventListener("click", openAdminModal);
    if (closeAddAdminModal) closeAddAdminModal.addEventListener("click", closeAdminModal);
    if (cancelAddAdminBtn) cancelAddAdminBtn.addEventListener("click", closeAdminModal);

    if (addAdminForm) {
        addAdminForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const name = document.getElementById("newAdminName").value.trim();
            const email = document.getElementById("newAdminEmail").value.trim().toLowerCase();
            const password = document.getElementById("newAdminPassword").value;
            const college = document.getElementById("newAdminCollege").value.trim();
            const submitBtn = document.getElementById("submitAddAdminBtn");

            if (!name || !email || !password) {
                if (adminCreateMsg) {
                    adminCreateMsg.textContent = "Please provide name, email, and password.";
                    adminCreateMsg.className = "form-message error mb-md";
                    adminCreateMsg.style.display = "block";
                }
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = "Registering...";

            try {
                const res = await CarbEarn.post("/api/admin/create-admin", {
                    name,
                    email,
                    password,
                    college
                });
                CarbEarn.showToast(res.message || "New administrator created successfully!", "success");
                closeAdminModal();
                await loadAdmins();
            } catch (err) {
                if (adminCreateMsg) {
                    adminCreateMsg.textContent = err.message || "Failed to create administrator.";
                    adminCreateMsg.className = "form-message error mb-md";
                    adminCreateMsg.style.display = "block";
                }
                CarbEarn.showToast(err.message || "Failed to create administrator", "error");
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = "Create Administrator";
            }
        });
    }

    // --- Helpers ---
    function formatDate(dateStr) {
        if (!dateStr) return "—";
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
        } catch {
            return dateStr;
        }
    }

    function escapeHtml(str) {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
});
