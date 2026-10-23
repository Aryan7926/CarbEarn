/**
 * CarbEarn Administrator Control Center Client
 * 
 * Manages platform governance:
 * - Activity Authorization Queue (Audit & Mint Carbon Currency CBC)
 * - Bulk Activity Authorization
 * - Tree registration audits (Verify as Correct or Mark as Incorrect)
 * - Periodic care inspection audits
 * - Contributor directory & search
 * - System-wide activity ledger
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
    const userSearch = document.getElementById("userSearch");

    let allUsers = [];
    let pendingActivities = [];
    let pendingTrees = [];
    let pendingCareLogs = [];

    // --- Tab Switching Logic ---
    const tabButtons = {
        activity: document.getElementById("btnTabActivityQueue"),
        tree: document.getElementById("btnTabTreeQueue"),
        care: document.getElementById("btnTabCareQueue"),
        users: document.getElementById("btnTabUsers"),
        admins: document.getElementById("btnTabAdmins"),
        activities: document.getElementById("btnTabActivities")
    };

    const sections = {
        activity: document.getElementById("sectionActivityQueue"),
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

    if (tabButtons.activity) tabButtons.activity.addEventListener("click", () => switchTab("activity"));
    if (tabButtons.tree) tabButtons.tree.addEventListener("click", () => switchTab("tree"));
    if (tabButtons.care) tabButtons.care.addEventListener("click", () => switchTab("care"));
    if (tabButtons.users) tabButtons.users.addEventListener("click", () => switchTab("users"));
    if (tabButtons.admins) tabButtons.admins.addEventListener("click", () => switchTab("admins"));
    if (tabButtons.activities) tabButtons.activities.addEventListener("click", () => switchTab("activities"));

    // Navbar link tab routing
    document.querySelectorAll(".admin-tab-btn").forEach(link => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            document.querySelectorAll(".admin-tab-btn").forEach(l => l.classList.remove("active"));
            link.classList.add("active");
            const tab = link.getAttribute("data-tab");
            if (tab === "tabActivityQueue") switchTab("activity");
            else if (tab === "tabTreeQueue") switchTab("tree");
            else if (tab === "tabCareQueue") switchTab("care");
            else if (tab === "tabUsers") switchTab("users");
            else if (tab === "tabAdmins") switchTab("admins");
            else if (tab === "tabActivities") switchTab("activities");
            else switchTab("activity");
        });
    });

    // --- MODAL 0: Activity Authorization Modal Elements ---
    const actModal = document.getElementById("activityReviewModal");
    const closeActModal = document.getElementById("closeActReviewModal");
    const cancelActBtn = document.getElementById("cancelActReviewBtn");
    const actReviewForm = document.getElementById("activityReviewForm");
    const targetActivityId = document.getElementById("targetActivityId");
    const actReviewSummary = document.getElementById("actReviewSummary");
    const actReviewDecision = document.getElementById("actReviewDecision");
    const actReviewNotes = document.getElementById("actReviewNotes");

    // --- MODAL 1: Tree Verification Modal Elements ---
    const treeModal = document.getElementById("treeVerifyModal");
    const closeTreeModal = document.getElementById("closeTreeModal");
    const cancelTreeModalBtn = document.getElementById("cancelTreeAuditBtn");
    const reviewTreeForm = document.getElementById("treeAuditForm");
    const modalTreeId = document.getElementById("targetTreeId");
    const treeModalDetails = document.getElementById("modalTreeSummary");
    const treeVerificationDecision = document.getElementById("auditDecision");
    const treeAdminNotes = document.getElementById("auditNotes");

    // --- MODAL 2: Care Inspection Modal Elements ---
    const careModal = document.getElementById("reviewLogModal");
    const closeCareModal = document.getElementById("closeReviewModal");
    const cancelCareModalBtn = document.getElementById("cancelReviewBtn");
    const reviewCareForm = document.getElementById("reviewLogForm");
    const modalLogId = document.getElementById("targetLogId");
    const modalCareDetails = document.getElementById("modalReviewSummary");
    const reviewStatusSelect = document.getElementById("logVerificationStatus");
    const reviewNotesInput = document.getElementById("logReviewNotes");

    // --- MODAL 3: Admin Registration Modal Elements ---
    const addAdminModal = document.getElementById("addAdminModal");
    const openAddAdminBtn = document.getElementById("btnOpenAddAdminModal");
    const closeAddAdminBtn = document.getElementById("closeAddAdminModal");
    const cancelAddAdminBtn = document.getElementById("cancelAddAdminBtn");
    const addAdminForm = document.getElementById("addAdminForm");

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
            loadPendingActivities(),
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

            const pendingActs = Number(data.pendingActivities || 0);
            const pendingReviews = Number(data.pendingReviews || 0);
            const pendingTreesCount = Number(data.pendingTrees || 0);

            CarbEarn.animateValue(document.getElementById("pendingActivitiesCount"), 0, pendingActs);
            CarbEarn.animateValue(document.getElementById("pendingReviewsCount"), 0, pendingReviews);
            CarbEarn.animateValue(document.getElementById("pendingTreesCount"), 0, pendingTreesCount);

            // Carbon Currency metrics
            const cc = data.carbon_currency || {};
            const mintedCBC = Number(cc.total_minted_cbc !== undefined ? cc.total_minted_cbc : data.totalCO2Saved || 0);
            const fiatINR = Number(cc.fiat_inr !== undefined ? cc.fiat_inr : (mintedCBC * 2.50));

            CarbEarn.animateValue(document.getElementById("totalMintedCBC"), 0, mintedCBC);
            const fiatElem = document.getElementById("totalFiatINR");
            if (fiatElem) {
                fiatElem.textContent = `Valued at ~₹${fiatINR.toFixed(2)} INR`;
            }

            // Badges in navbar
            const actBadge = document.getElementById("pendingActivitiesBadge");
            const actTabBadge = document.getElementById("pendingActivitiesTabBadge");
            if (actBadge) {
                actBadge.textContent = pendingActs;
                actBadge.style.display = pendingActs > 0 ? "inline-block" : "none";
            }
            if (actTabBadge) {
                actTabBadge.textContent = pendingActs;
                actTabBadge.style.display = pendingActs > 0 ? "inline-block" : "none";
            }

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
    // 2. Activity Authorization Queue (CRITICAL USER REQUEST)
    // -------------------------------------------------------------------------
    async function loadPendingActivities() {
        const container = document.getElementById("pendingActivitiesContainer");
        try {
            const data = await CarbEarn.get("/api/admin/pending-activities");
            pendingActivities = data.activities || [];

            if (pendingActivities.length === 0) {
                container.innerHTML = `
                    <div class="empty-state text-center" style="padding: 2.5rem 1rem;">
                        <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">⚡</div>
                        <p class="font-bold text-dark">No pending activities awaiting authorization.</p>
                        <p class="text-sm text-medium">All student contributions have been audited and Carbon Currency minted.</p>
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
                                <th>Activity Details</th>
                                <th>Volume & Frequency</th>
                                <th>Avoided CO₂</th>
                                <th>Mintable CBC</th>
                                <th>Submission Date</th>
                                <th style="text-align: right;">Authorization Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${pendingActivities.map(act => {
                                const cbcVal = Number(act.carbon_currency !== undefined ? act.carbon_currency : act.co2_saved).toFixed(3);
                                return `
                                    <tr>
                                        <td>
                                            <div style="font-weight: 700; color: var(--slate-900);">${escapeHtml(act.student_name)}</div>
                                            <div class="text-xs text-medium">${escapeHtml(act.student_college || act.student_email)}</div>
                                        </td>
                                        <td>
                                            <strong style="color: var(--color-primary-deep);">${escapeHtml(act.activity_name)}</strong>
                                            ${act.certificate_hash ? `<div class="hash-pill" style="font-size: 0.65rem; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 3px;">#${act.certificate_hash.substring(0, 16)}...</div>` : ""}
                                        </td>
                                        <td>
                                            <strong>${act.quantity} ${escapeHtml(act.unit)}</strong>
                                            <div class="text-xs text-light">${act.frequency}x / week</div>
                                        </td>
                                        <td>
                                            <strong style="color: var(--emerald-800);">${Number(act.co2_saved).toFixed(2)} kg</strong>
                                        </td>
                                        <td>
                                            <strong style="color: var(--emerald-600); font-size: 0.95rem;">+${cbcVal} CBC</strong>
                                            <div class="text-xs text-light">~₹${(Number(cbcVal) * 2.50).toFixed(2)} INR</div>
                                        </td>
                                        <td>${formatDate(act.activity_date || act.created_at)}</td>
                                        <td style="text-align: right; white-space: nowrap;">
                                            <button type="button" class="btn btn-primary btn-sm authorize-act-btn" data-id="${act.id}" style="margin-right: 4px;">
                                                ✓ Authorize & Mint
                                            </button>
                                            <button type="button" class="btn btn-secondary btn-sm reject-act-btn" data-id="${act.id}">
                                                ✕ Reject
                                            </button>
                                        </td>
                                    </tr>
                                `;
                            }).join("")}
                        </tbody>
                    </table>
                </div>
            `;

            container.querySelectorAll(".authorize-act-btn").forEach(btn => {
                btn.addEventListener("click", () => {
                    const actId = Number(btn.getAttribute("data-id"));
                    openActivityAuditModal(actId, "Verified");
                });
            });

            container.querySelectorAll(".reject-act-btn").forEach(btn => {
                btn.addEventListener("click", () => {
                    const actId = Number(btn.getAttribute("data-id"));
                    openActivityAuditModal(actId, "Rejected");
                });
            });
        } catch (e) {
            console.error("Pending activities load error:", e);
            container.innerHTML = `<div class="empty-state text-error">Unable to load pending activities: ${escapeHtml(e.message)}</div>`;
        }
    }

    function openActivityAuditModal(actId, defaultDecision = "Verified") {
        const act = pendingActivities.find(a => a.id === actId);
        if (!act) return;

        targetActivityId.value = actId;
        actReviewDecision.value = defaultDecision;
        actReviewNotes.value = defaultDecision === "Verified"
            ? "Green activity calculation and evidence verified under campus sustainability guidelines."
            : "Requires further verification or proof.";

        const cbcAmount = Number(act.carbon_currency !== undefined ? act.carbon_currency : act.co2_saved).toFixed(3);

        actReviewSummary.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                <div>
                    <span class="text-xs text-light">Student Contributor:</span>
                    <strong style="display: block;">${escapeHtml(act.student_name)}</strong>
                </div>
                <div>
                    <span class="text-xs text-light">Green Action:</span>
                    <strong style="display: block; color: var(--emerald-800);">${escapeHtml(act.activity_name)}</strong>
                </div>
                <div>
                    <span class="text-xs text-light">Reported Volume:</span>
                    <strong style="display: block;">${act.quantity} ${escapeHtml(act.unit)} (${act.frequency}x/wk)</strong>
                </div>
                <div>
                    <span class="text-xs text-light">Avoided CO₂ / Mintable CBC:</span>
                    <strong style="display: block; color: var(--emerald-600);">${Number(act.co2_saved).toFixed(2)} kg CO₂ → +${cbcAmount} CBC</strong>
                </div>
            </div>
        `;

        actModal.style.display = "flex";
    }

    function closeActivityModalDialog() {
        actModal.style.display = "none";
        actReviewForm.reset();
    }

    if (closeActModal) closeActModal.addEventListener("click", closeActivityModalDialog);
    if (cancelActBtn) cancelActBtn.addEventListener("click", closeActivityModalDialog);

    if (actReviewForm) {
        actReviewForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const actId = targetActivityId.value;
            const status = actReviewDecision.value;
            const review_notes = actReviewNotes.value.trim();

            const submitBtn = document.getElementById("submitActReviewBtn");
            submitBtn.disabled = true;
            submitBtn.textContent = "Processing...";

            try {
                const res = await CarbEarn.put(`/api/admin/activities/${actId}/verify`, {
                    status,
                    review_notes
                });

                closeActivityModalDialog();
                if (status === "Verified") {
                    CarbEarn.showToast(`Activity authorized! +${res.carbon_currency.toFixed(2)} CBC minted to student.`, "success");
                } else {
                    CarbEarn.showToast("Activity rejected with audit feedback note.", "info");
                }

                await Promise.all([
                    loadOverview(),
                    loadPendingActivities()
                ]);
            } catch (err) {
                CarbEarn.showToast(err.message || "Failed to save authorization decision", "error");
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = "Save Decision & Update Currency";
            }
        });
    }

    // Bulk Authorize All Pending Activities
    const btnBulkAuthorize = document.getElementById("btnBulkAuthorizeActivities");
    if (btnBulkAuthorize) {
        btnBulkAuthorize.addEventListener("click", async () => {
            if (!confirm("Are you sure you want to bulk authorize all pending activities and mint their Carbon Currency?")) {
                return;
            }

            btnBulkAuthorize.disabled = true;
            btnBulkAuthorize.textContent = "Authorizing...";

            try {
                const res = await CarbEarn.post("/api/admin/activities/batch-verify", {});
                CarbEarn.showToast(`Bulk authorization complete! ${res.authorized_count} activities approved and minted.`, "success");
                await Promise.all([
                    loadOverview(),
                    loadPendingActivities()
                ]);
            } catch (err) {
                CarbEarn.showToast(err.message || "Bulk authorization failed", "error");
            } finally {
                btnBulkAuthorize.disabled = false;
                btnBulkAuthorize.textContent = "⚡ Bulk Authorize All Pending";
            }
        });
    }

    // -------------------------------------------------------------------------
    // 3. New Tree Verification Queue (Approve Correct / Mark Incorrect)
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
                                        <strong style="color: var(--color-primary-deep);">${escapeHtml(t.species)}</strong>
                                    </td>
                                    <td>📍 ${escapeHtml(t.location)}</td>
                                    <td>${formatDate(t.planting_date)}</td>
                                    <td>${escapeHtml(t.notes || "—")}</td>
                                    <td>
                                        <span class="status-badge badge-pending">Pending Review</span>
                                    </td>
                                    <td style="text-align: right;">
                                        <button type="button" class="btn btn-primary btn-sm verify-tree-btn" data-id="${t.tree_id || t.id}">
                                            Audit Sapling
                                        </button>
                                    </td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            `;

            container.querySelectorAll(".verify-tree-btn").forEach(btn => {
                btn.addEventListener("click", () => {
                    const treeId = Number(btn.getAttribute("data-id"));
                    openTreeModal(treeId);
                });
            });
        } catch (e) {
            console.error("Pending trees error:", e);
            container.innerHTML = `<div class="empty-state text-error">Unable to load pending trees: ${escapeHtml(e.message)}</div>`;
        }
    }

    function openTreeModal(treeId) {
        const tree = pendingTrees.find(t => (t.tree_id || t.id) === treeId);
        if (!tree) return;

        modalTreeId.value = treeId;
        treeVerificationDecision.value = "Verified";
        treeAdminNotes.value = "Sapling species and site coordinates audited during campus walk.";

        treeModalDetails.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                <div>
                    <span class="text-xs text-light">Contributor:</span>
                    <strong style="display: block;">${escapeHtml(tree.student_name)}</strong>
                </div>
                <div>
                    <span class="text-xs text-light">Sapling Species:</span>
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
            const rawStatus = treeVerificationDecision.value;
            const verification_status = (rawStatus === "Correct" || rawStatus === "Verified") ? "Verified" : "Rejected";
            const admin_notes = treeAdminNotes.value.trim();

            const submitBtn = document.getElementById("submitTreeDecisionBtn");
            submitBtn.disabled = true;
            submitBtn.textContent = "Saving...";

            try {
                await CarbEarn.put(`/api/greenproof/admin/trees/${treeId}/review`, {
                    verification_status,
                    admin_notes
                });

                closeTreeModalDialog();
                if (verification_status === "Correct" || verification_status === "Verified") {
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
                submitBtn.textContent = "Confirm Decision";
            }
        });
    }

    // -------------------------------------------------------------------------
    // 4. Care Inspection Reviews Queue
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
        `;

        careModal.style.display = "flex";
    }

    function closeCareModalDialog() {
        careModal.style.display = "none";
        reviewCareForm.reset();
    }

    if (closeCareModal) closeCareModal.addEventListener("click", closeCareModalDialog);
    if (cancelCareModalBtn) cancelCareModalBtn.addEventListener("click", closeCareModalDialog);

    if (reviewCareForm) {
        reviewCareForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const logId = modalLogId.value;
            const verification_status = reviewStatusSelect.value;
            const review_notes = reviewNotesInput.value.trim();

            const submitBtn = document.getElementById("submitReviewDecisionBtn");
            submitBtn.disabled = true;
            submitBtn.textContent = "Saving...";

            try {
                await CarbEarn.put(`/api/greenproof/admin/logs/${logId}/review`, {
                    verification_status,
                    review_notes
                });

                closeCareModalDialog();
                if (verification_status === "Verified") {
                    CarbEarn.showToast("Care log verified! +25 Stewardship points awarded.", "success");
                } else {
                    CarbEarn.showToast("Care log marked as Rejected.", "info");
                }

                await Promise.all([
                    loadOverview(),
                    loadPendingCareLogs()
                ]);
            } catch (err) {
                CarbEarn.showToast(err.message || "Failed to submit review", "error");
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = "Save Decision";
            }
        });
    }

    // -------------------------------------------------------------------------
    // 5. Contributor Directory
    // -------------------------------------------------------------------------
    async function loadUsers() {
        const container = document.getElementById("usersTableContainer");
        try {
            const data = await CarbEarn.get("/api/admin/users?limit=100");
            allUsers = data || [];
            renderUsers(allUsers);
        } catch (e) {
            console.error("Users load error:", e);
            container.innerHTML = `<div class="empty-state text-error">Unable to load contributors: ${escapeHtml(e.message)}</div>`;
        }
    }

    function renderUsers(users) {
        const container = document.getElementById("usersTableContainer");
        if (!users || users.length === 0) {
            container.innerHTML = `<div class="empty-state text-center" style="padding: 2rem;">No matching contributors found.</div>`;
            return;
        }

        container.innerHTML = `
            <table>
                <thead>
                    <tr>
                        <th>Contributor</th>
                        <th>Institution</th>
                        <th>Activities</th>
                        <th>Avoided CO₂</th>
                        <th>Carbon Currency</th>
                        <th>Carbon Points</th>
                        <th>Joined</th>
                    </tr>
                </thead>
                <tbody>
                    ${users.map(u => `
                        <tr>
                            <td>
                                <strong style="color: var(--slate-900);">${escapeHtml(u.name)}</strong>
                                <div class="text-xs text-medium">${escapeHtml(u.email)}</div>
                            </td>
                            <td>${escapeHtml(u.college || "—")}</td>
                            <td>${u.activity_count || 0}</td>
                            <td><strong>${Number(u.total_co2 || 0).toFixed(2)} kg</strong></td>
                            <td><strong style="color: var(--emerald-600);">${Number(u.carbon_currency !== undefined ? u.carbon_currency : u.total_co2 || 0).toFixed(2)} CBC</strong></td>
                            <td><span class="badge badge-accent">+${u.total_points || 0}</span></td>
                            <td>${formatDate(u.created_at)}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        `;
    }

    if (userSearch) {
        userSearch.addEventListener("input", () => {
            const term = userSearch.value.toLowerCase().trim();
            if (!term) {
                renderUsers(allUsers);
                return;
            }
            const filtered = allUsers.filter(u =>
                (u.name || "").toLowerCase().includes(term) ||
                (u.email || "").toLowerCase().includes(term) ||
                (u.college || "").toLowerCase().includes(term)
            );
            renderUsers(filtered);
        });
    }

    // -------------------------------------------------------------------------
    // 6. Administrator Directory & Registration Modal
    // -------------------------------------------------------------------------
    async function loadAdmins() {
        const container = document.getElementById("adminListContainer");
        try {
            const data = await CarbEarn.get("/api/admin/admins");
            const admins = data || [];

            container.innerHTML = `
                <table>
                    <thead>
                        <tr>
                            <th>Administrator Name</th>
                            <th>Official Email</th>
                            <th>Department</th>
                            <th>Role</th>
                            <th>Registered</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${admins.map(a => `
                            <tr>
                                <td>
                                    <strong style="color: var(--slate-900);">${escapeHtml(a.name)}</strong>
                                </td>
                                <td>${escapeHtml(a.email)}</td>
                                <td>${escapeHtml(a.college || "Administration")}</td>
                                <td><span class="badge badge-accent">PLATFORM ADMIN</span></td>
                                <td>${formatDate(a.created_at)}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            `;
        } catch (e) {
            console.error("Admins load error:", e);
            container.innerHTML = `<div class="empty-state text-error">Unable to load administrators: ${escapeHtml(e.message)}</div>`;
        }
    }

    if (openAddAdminBtn && addAdminModal) {
        openAddAdminBtn.addEventListener("click", () => {
            addAdminModal.style.display = "flex";
        });
    }

    function closeAddAdminDialog() {
        if (addAdminModal) {
            addAdminModal.style.display = "none";
            addAdminForm.reset();
            const msg = document.getElementById("adminCreateMsg");
            if (msg) msg.style.display = "none";
        }
    }

    if (closeAddAdminBtn) closeAddAdminBtn.addEventListener("click", closeAddAdminDialog);
    if (cancelAddAdminBtn) cancelAddAdminBtn.addEventListener("click", closeAddAdminDialog);

    if (addAdminForm) {
        addAdminForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const name = document.getElementById("newAdminName").value.trim();
            const email = document.getElementById("newAdminEmail").value.trim();
            const password = document.getElementById("newAdminPassword").value;
            const college = document.getElementById("newAdminCollege").value.trim();
            const msg = document.getElementById("adminCreateMsg");
            const submitBtn = document.getElementById("submitAddAdminBtn");

            submitBtn.disabled = true;
            submitBtn.textContent = "Registering...";

            try {
                await CarbEarn.post("/api/admin/create-admin", {
                    name,
                    email,
                    password,
                    college
                });

                closeAddAdminDialog();
                CarbEarn.showToast("New platform administrator registered successfully!", "success");
                await loadAdmins();
            } catch (err) {
                if (msg) {
                    msg.textContent = err.message || "Failed to register administrator.";
                    msg.className = "form-message error";
                    msg.style.display = "block";
                }
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = "Create Administrator";
            }
        });
    }

    // -------------------------------------------------------------------------
    // 7. Recent Activities Feed
    // -------------------------------------------------------------------------
    async function loadRecentActivities() {
        const container = document.getElementById("adminActivitiesContainer");
        try {
            const data = await CarbEarn.get("/api/admin/activities");
            const activities = data || [];

            if (activities.length === 0) {
                container.innerHTML = `<div class="empty-state text-center" style="padding: 2rem;">No activities recorded yet.</div>`;
                return;
            }

            container.innerHTML = `
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Contributor</th>
                                <th>Activity</th>
                                <th>Volume</th>
                                <th>Mitigated CO₂</th>
                                <th>Carbon Currency</th>
                                <th>Points</th>
                                <th>Authorization</th>
                                <th>Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${activities.map(act => {
                                const isVerified = act.verification_status === "Verified";
                                const statusPill = isVerified
                                    ? `<span class="status-badge badge-verified">✓ Authorized</span>`
                                    : `<span class="status-badge badge-pending">⏳ Pending Audit</span>`;
                                const cbc = Number(act.carbon_currency !== undefined ? act.carbon_currency : act.co2_saved).toFixed(2);

                                return `
                                    <tr>
                                        <td>
                                            <strong>${escapeHtml(act.user_name || "Contributor")}</strong>
                                            <div class="text-xs text-medium">${escapeHtml(act.user_email || "")}</div>
                                        </td>
                                        <td><strong>${escapeHtml(act.activity_name)}</strong></td>
                                        <td>${act.quantity} ${escapeHtml(act.unit || "unit")} (${act.frequency}x/wk)</td>
                                        <td><strong style="color: var(--emerald-800);">${Number(act.co2_saved).toFixed(2)} kg</strong></td>
                                        <td><strong style="color: var(--emerald-600);">+${cbc} CBC</strong></td>
                                        <td><span class="badge badge-accent">+${act.points}</span></td>
                                        <td>${statusPill}</td>
                                        <td>${formatDate(act.activity_date || act.created_at)}</td>
                                    </tr>
                                `;
                            }).join("")}
                        </tbody>
                    </table>
                </div>
            `;
        } catch (e) {
            console.error("Recent activities error:", e);
            container.innerHTML = `<div class="empty-state text-error">Unable to load recent activities: ${escapeHtml(e.message)}</div>`;
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
});
