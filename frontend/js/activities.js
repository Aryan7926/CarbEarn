document.addEventListener("DOMContentLoaded", async () => {
    const session = CarbEarn.requireAuth("login.html");
    if (!session) return;

    // Default activity date to today (YYYY-MM-DD)
    const today = new Date().toISOString().split("T")[0];
    document.getElementById("activityDate").value = today;

    // Bind logout
    const logoutBtn = document.getElementById("logoutButton");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", (e) => {
            e.preventDefault();
            CarbEarn.logout();
        });
    }

    // DOM Elements
    const btnModeUniversal = document.getElementById("btnModeUniversal");
    const btnModeCatalog = document.getElementById("btnModeCatalog");
    const universalSection = document.getElementById("universalModeSection");
    const catalogSection = document.getElementById("catalogModeSection");

    const activityTextInput = document.getElementById("activityText");
    const activitySelect = document.getElementById("activity");
    const quantityInput = document.getElementById("quantity");
    const frequencyInput = document.getElementById("frequency");
    const unitText = document.getElementById("unitText");

    const activityDescBox = document.getElementById("activityDescBox");
    const selectedActivityTitle = document.getElementById("selectedActivityTitle");
    const activityDescription = document.getElementById("activityDescription");

    const liveActionTitle = document.getElementById("liveActionTitle");
    const liveBaselineComparison = document.getElementById("liveBaselineComparison");
    const liveEstCO2 = document.getElementById("liveEstCO2");
    const liveEstCBC = document.getElementById("liveEstCBC");
    const liveEstFiat = document.getElementById("liveEstFiat");
    const liveFormulaEquation = document.getElementById("formulaText");
    const mlPreviewBadge = document.getElementById("mlPreviewBadge");

    const activityForm = document.getElementById("activityForm");
    const activityMessage = document.getElementById("activityMessage");
    const submitBtn = document.getElementById("submitActivityBtn");

    let currentMode = "universal"; // 'universal' or 'catalog'
    let activitiesCatalog = [];
    let currentCalculation = null;

    // 1. Load activities catalog
    try {
        const data = await CarbEarn.get("/api/activities");
        activitiesCatalog = data.activities || [];

        activitySelect.innerHTML = '<option value="">-- Choose an activity category --</option>' +
            activitiesCatalog.map(a => `<option value="${a.id}">${escapeHtml(a.name)} (${escapeHtml(a.unit)})</option>`).join("");

        renderActivitiesSidebar(activitiesCatalog);
    } catch (err) {
        console.error("Failed to load activities catalog:", err);
        activitySelect.innerHTML = '<option value="">Failed to load activities</option>';
        document.getElementById("activityList").innerHTML = `<p class="text-error">Unable to load catalog.</p>`;
    }

    // 2. Mode Switching Logic
    btnModeUniversal.addEventListener("click", () => {
        currentMode = "universal";
        btnModeUniversal.classList.add("active");
        btnModeCatalog.classList.remove("active");
        universalSection.style.display = "block";
        catalogSection.style.display = "none";
        triggerLiveCalculation();
    });

    btnModeCatalog.addEventListener("click", () => {
        currentMode = "catalog";
        btnModeCatalog.classList.add("active");
        btnModeUniversal.classList.remove("active");
        universalSection.style.display = "none";
        catalogSection.style.display = "block";
        triggerLiveCalculation();
    });

    // 3. Prompt Chips Quick Template Handlers
    document.querySelectorAll(".prompt-chip").forEach(chip => {
        chip.addEventListener("click", () => {
            const text = chip.getAttribute("data-text");
            const qty = chip.getAttribute("data-qty");
            const freq = chip.getAttribute("data-freq");

            if (currentMode !== "universal") {
                btnModeUniversal.click();
            }

            activityTextInput.value = text;
            if (qty) quantityInput.value = qty;
            if (freq) frequencyInput.value = freq;

            // Flash chip animation
            chip.style.transform = "scale(0.92)";
            setTimeout(() => { chip.style.transform = ""; }, 180);

            triggerLiveCalculation();
        });
    });

    // 4. Input Listeners with Debounce
    activityTextInput.addEventListener("input", debounce(triggerLiveCalculation, 400));
    quantityInput.addEventListener("input", debounce(triggerLiveCalculation, 300));
    frequencyInput.addEventListener("input", debounce(triggerLiveCalculation, 300));

    activitySelect.addEventListener("change", () => {
        const selectedId = Number(activitySelect.value);
        const act = activitiesCatalog.find(a => a.id === selectedId);

        if (act) {
            unitText.textContent = `(${act.unit})`;
            selectedActivityTitle.textContent = act.name;
            activityDescription.textContent = `${act.description || ""} Standard emission factor: ${act.emission_factor} kg CO₂ / ${act.unit}.`;
            activityDescBox.style.display = "block";
            if (!quantityInput.value) quantityInput.value = "10";
        } else {
            unitText.textContent = "(units)";
            activityDescBox.style.display = "none";
        }
        triggerLiveCalculation();
    });

    // 5. Live Dynamic Universal Calculation Engine
    async function triggerLiveCalculation() {
        const qty = parseFloat(quantityInput.value) || 0;
        const freq = parseFloat(frequencyInput.value) || 1;

        let payload = {
            quantity: qty > 0 ? qty : 1,
            frequency: freq > 0 ? freq : 1
        };

        if (currentMode === "universal") {
            const text = activityTextInput.value.trim();
            if (!text && qty <= 0) {
                resetPreview();
                return;
            }
            payload.text = text || "Custom eco action";
        } else {
            const selectedId = Number(activitySelect.value);
            if (!selectedId) {
                resetPreview();
                return;
            }
            payload.activity_id = selectedId;
        }

        mlPreviewBadge.textContent = "Calculating...";

        try {
            const res = await CarbEarn.post("/api/activities/calculate", payload);
            const calc = res.calculation;
            currentCalculation = calc;

            // Update UI with calculated carbon values
            unitText.textContent = `(${calc.unit})`;
            liveActionTitle.textContent = `${calc.activity_name} (${calc.category})`;
            liveBaselineComparison.textContent = `Baseline comparison: ${calc.baseline_comparison}`;

            liveEstCO2.innerHTML = `${calc.co2_saved.toFixed(2)} <small style="font-size: 0.8rem; font-weight: 600; color: var(--slate-500);">kg CO₂e</small>`;
            liveEstCBC.innerHTML = `${calc.carbon_currency.toFixed(3)} <small style="font-size: 0.8rem; font-weight: 700; color: var(--emerald-600);">CBC</small>`;
            const inrVal = calc.valuation && calc.valuation.inr !== undefined ? calc.valuation.inr : (calc.carbon_currency * 2.5);
            liveEstFiat.innerHTML = `₹${Number(inrVal).toFixed(2)}`;

            liveFormulaEquation.textContent = `${calc.formula_breakdown.equation} = ${calc.formula_breakdown.result_co2} → ${calc.formula_breakdown.result_cbc}`;

            const impact = calc.impact || "Medium";
            mlPreviewBadge.textContent = `${impact} Impact`;
            mlPreviewBadge.className = `status-badge badge-${impact.toLowerCase()}`;
        } catch (e) {
            console.warn("Live calculation preview error:", e.message);
            mlPreviewBadge.textContent = "Ready";
        }
    }

    function resetPreview() {
        liveActionTitle.textContent = "Environmental Impact & Carbon Currency Preview";
        liveBaselineComparison.textContent = "Benchmarked against standard conventional fossil baseline";
        liveEstCO2.innerHTML = `0.00 <small style="font-size: 0.8rem; color: var(--slate-500);">kg</small>`;
        liveEstCBC.innerHTML = `0.000 <small style="font-size: 0.8rem; color: var(--emerald-600);">CBC</small>`;
        liveEstFiat.innerHTML = `₹0.00`;
        liveFormulaEquation.textContent = "Enter activity parameters to compute certified greenhouse mitigation";
        mlPreviewBadge.textContent = "—";
        mlPreviewBadge.className = "status-badge badge-active";
    }

    // 6. Form Submission Handler
    activityForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const qty = parseFloat(quantityInput.value);
        const freq = parseInt(frequencyInput.value, 10);
        const activity_date = document.getElementById("activityDate").value;

        if (isNaN(qty) || qty <= 0) {
            showMessage("Please enter a valid positive quantity.", "error");
            quantityInput.focus();
            return;
        }

        if (isNaN(freq) || freq < 1 || freq > 7) {
            showMessage("Please enter weekly frequency between 1 and 7.", "error");
            frequencyInput.focus();
            return;
        }

        if (!activity_date) {
            showMessage("Please select an activity date.", "error");
            return;
        }

        let submitBody = {
            quantity: qty,
            frequency: freq,
            activity_date: activity_date
        };

        if (currentMode === "universal") {
            const text = activityTextInput.value.trim();
            if (!text) {
                showMessage("Please describe your green activity in the text input.", "error");
                activityTextInput.focus();
                return;
            }
            submitBody.activity_text = text;
        } else {
            const activityId = Number(activitySelect.value);
            if (!activityId) {
                showMessage("Please select an activity category from the catalog.", "error");
                activitySelect.focus();
                return;
            }
            submitBody.activity_id = activityId;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = "Quantifying & Minting Carbon Currency...";
        showMessage("Hashing activity and submitting to Administrator Authorization Queue...", "info");

        try {
            const res = await CarbEarn.post("/api/activities/add", submitBody);
            const saved = res.activity;

            // Populate Success Banner
            document.getElementById("savedCO2").textContent = Number(saved.co2_saved).toFixed(2);
            document.getElementById("savedCBC").textContent = `${Number(saved.carbon_currency).toFixed(3)} CBC`;
            const savedINR = saved.valuation && saved.valuation.inr !== undefined ? saved.valuation.inr : (Number(saved.carbon_currency) * 2.5);
            document.getElementById("savedFiat").textContent = `₹${Number(savedINR).toFixed(2)}`;

            if (saved.certificate) {
                document.getElementById("certSerial").textContent = saved.certificate.serial || "CBC-VERIFIED";
                document.getElementById("certHash").textContent = saved.certificate.hash || "0x" + Math.random().toString(16).substring(2);
            }

            const successCard = document.getElementById("successCard");
            successCard.style.display = "block";
            successCard.scrollIntoView({ behavior: "smooth", block: "nearest" });

            showMessage("Activity recorded! Placed in Administrator Authorization Queue.", "success");
            CarbEarn.showToast(`Activity logged! +${Number(saved.carbon_currency).toFixed(2)} CBC submitted for Admin Audit`, "success");

            // Reset inputs
            activityTextInput.value = "";
            quantityInput.value = "";
            activitySelect.value = "";
            activityDescBox.style.display = "none";
            resetPreview();
        } catch (error) {
            showMessage(error.message || "Failed to record activity. Please check inputs.", "error");
            CarbEarn.showToast(error.message || "Failed to submit activity", "error");
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = "Submit for Authorization & Mint Carbon Currency";
        }
    });

    document.getElementById("logAnotherBtn").addEventListener("click", () => {
        document.getElementById("successCard").style.display = "none";
        if (currentMode === "universal") {
            activityTextInput.focus();
        } else {
            activitySelect.focus();
        }
    });

    function showMessage(text, type) {
        activityMessage.textContent = text;
        activityMessage.className = `form-message ${type}`;
    }

    function renderActivitiesSidebar(list) {
        const container = document.getElementById("activityList");
        container.innerHTML = list.map(a => `
            <div class="activity-item card-animated" style="padding: 0.75rem 0; border-bottom: 1px solid var(--color-light-sage); cursor: pointer;" onclick="quickSelectCatalog(${a.id})">
                <div class="activity-details">
                    <strong style="color: var(--color-primary-deep); font-size: 0.9rem;">${escapeHtml(a.name)}</strong>
                    <div class="text-xs text-light">${a.emission_factor} kg CO₂ saved / ${escapeHtml(a.unit)}</div>
                </div>
                <span class="badge badge-accent" style="font-size: 0.7rem;">+${(a.emission_factor * 10).toFixed(0)} pts</span>
            </div>
        `).join("");
    }

    window.quickSelectCatalog = (id) => {
        btnModeCatalog.click();
        activitySelect.value = id;
        activitySelect.dispatchEvent(new Event("change"));
    };

    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
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