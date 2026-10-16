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

    const activitySelect = document.getElementById("activity");
    const quantityInput = document.getElementById("quantity");
    const frequencyInput = document.getElementById("frequency");
    const unitText = document.getElementById("unitText");
    const activityDescBox = document.getElementById("activityDescBox");
    const selectedActivityTitle = document.getElementById("selectedActivityTitle");
    const activityDescription = document.getElementById("activityDescription");
    const activityForm = document.getElementById("activityForm");
    const activityMessage = document.getElementById("activityMessage");
    const submitBtn = document.getElementById("submitActivityBtn");
    const mlPreviewBadge = document.getElementById("mlPreviewBadge");
    const mlPreviewNote = document.getElementById("mlPreviewNote");

    let activitiesCatalog = [];

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

    // 2. Handle Activity Selection Change
    activitySelect.addEventListener("change", () => {
        const selectedId = Number(activitySelect.value);
        const act = activitiesCatalog.find(a => a.id === selectedId);

        if (act) {
            unitText.textContent = `(measured in ${act.unit})`;
            selectedActivityTitle.textContent = act.name;
            activityDescription.textContent = `${act.description || ""} Standard emission factor: ${act.emission_factor} kg CO₂ / ${act.unit}.`;
            activityDescBox.style.display = "block";
            triggerMLPreview();
        } else {
            unitText.textContent = "(select an activity)";
            activityDescBox.style.display = "none";
            mlPreviewBadge.textContent = "—";
        }
    });

    quantityInput.addEventListener("input", debounce(triggerMLPreview, 500));
    frequencyInput.addEventListener("input", debounce(triggerMLPreview, 500));

    // 3. Live ML Prediction Preview
    async function triggerMLPreview() {
        const selectedId = Number(activitySelect.value);
        const act = activitiesCatalog.find(a => a.id === selectedId);
        const qty = parseFloat(quantityInput.value);
        const freq = parseFloat(frequencyInput.value);

        const estCO2Elem = document.getElementById("liveEstCO2");
        const estPtsElem = document.getElementById("liveEstPoints");

        if (!act || isNaN(qty) || qty <= 0 || isNaN(freq) || freq <= 0) {
            mlPreviewBadge.textContent = "—";
            if (estCO2Elem) estCO2Elem.textContent = "—";
            if (estPtsElem) estPtsElem.textContent = "—";
            return;
        }

        // Real-time calculation based on emission factor
        const calculatedCO2 = qty * Number(act.emission_factor) * freq;
        const calculatedPoints = Math.max(1, Math.round(calculatedCO2 * 10));

        if (estCO2Elem) estCO2Elem.innerHTML = `${calculatedCO2.toFixed(2)} <small style="font-size: 0.8rem; font-weight: 600; color: var(--slate-500);">kg</small>`;
        if (estPtsElem) estPtsElem.innerHTML = `+${calculatedPoints} <small style="font-size: 0.8rem; font-weight: 600; color: var(--slate-500);">pts</small>`;

        mlPreviewBadge.textContent = "Evaluating...";

        try {
            const res = await CarbEarn.post("/api/ml/predict", {
                activity_type: act.name,
                quantity: qty,
                frequency: freq
            });

            const pred = res.prediction;
            const impact = pred.predicted_impact || "Medium";
            mlPreviewBadge.textContent = `${impact} Impact`;
            mlPreviewBadge.className = `status-badge badge-${impact.toLowerCase()}`;

            if (pred.confidence) {
                const confPercent = pred.confidence[impact] || "";
                mlPreviewNote.textContent = confPercent
                    ? `Assessment confidence: ${confPercent}% (${act.name}, ${qty} ${act.unit} × ${freq}x/wk)`
                    : `Estimated impact: ${impact}`;
            }
        } catch (e) {
            // Graceful fallback display
            mlPreviewBadge.textContent = "Standard";
        }
    }

    // 4. Submit Activity Form
    activityForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const activityId = Number(activitySelect.value);
        const quantity = parseFloat(quantityInput.value);
        const frequency = parseInt(frequencyInput.value, 10);
        const activity_date = document.getElementById("activityDate").value;

        if (!activityId) {
            showMessage("Please select an activity from the list.", "error");
            return;
        }

        if (isNaN(quantity) || quantity <= 0) {
            showMessage("Please enter a valid positive quantity.", "error");
            return;
        }

        if (isNaN(frequency) || frequency <= 0 || frequency > 7) {
            showMessage("Please enter weekly frequency between 1 and 7.", "error");
            return;
        }

        if (!activity_date) {
            showMessage("Please select an activity date.", "error");
            return;
        }

        const selectedActivity = activitiesCatalog.find(a => a.id === activityId);

        submitBtn.disabled = true;
        submitBtn.textContent = "Recording Activity...";
        showMessage("Saving green activity to your carbon record...", "info");

        try {
            // Obtain ML prediction
            let mlPredictionText = null;
            try {
                const mlRes = await CarbEarn.post("/api/ml/predict", {
                    activity_type: selectedActivity.name,
                    quantity: quantity,
                    frequency: frequency
                });
                mlPredictionText = mlRes.prediction?.predicted_impact || null;
            } catch (mlErr) {
                console.warn("ML service preview skipped during submit:", mlErr.message);
            }

            // Save Activity Record to Database
            const res = await CarbEarn.post("/api/activities/add", {
                activity_id: activityId,
                quantity: quantity,
                frequency: frequency,
                activity_date: activity_date,
                ml_prediction: mlPredictionText
            });

            const saved = res.activity;

            // Populate Success Banner
            document.getElementById("savedCO2").textContent = Number(saved.co2_saved).toFixed(2);
            document.getElementById("earnedPoints").textContent = `+${saved.points}`;
            document.getElementById("activityImpact").textContent = saved.impact;
            document.getElementById("mlResultBadge").textContent = saved.ml_prediction || "Recorded";

            const successCard = document.getElementById("successCard");
            successCard.style.display = "block";
            successCard.scrollIntoView({ behavior: "smooth", block: "nearest" });

            showMessage("Activity successfully recorded and points credited!", "success");
            CarbEarn.showToast("Activity successfully recorded! +" + saved.points + " Carbon Points", "success");

            // Reset form for new entries
            activityForm.reset();
            document.getElementById("activityDate").value = today;
            activityDescBox.style.display = "none";
            unitText.textContent = "(select an activity)";
            mlPreviewBadge.textContent = "—";
        } catch (error) {
            showMessage(error.message || "Failed to save activity. Please try again.", "error");
            CarbEarn.showToast(error.message || "Failed to record activity", "error");
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = "Save Green Activity";
        }
    });

    document.getElementById("logAnotherBtn").addEventListener("click", () => {
        document.getElementById("successCard").style.display = "none";
        activitySelect.focus();
    });

    function showMessage(text, type) {
        activityMessage.textContent = text;
        activityMessage.className = `form-message ${type}`;
    }

    function renderActivitiesSidebar(list) {
        const container = document.getElementById("activityList");
        container.innerHTML = list.map(a => `
            <div class="activity-item" style="padding: 0.75rem 0; border-bottom: 1px solid var(--color-light-sage);">
                <div class="activity-details">
                    <strong style="color: var(--color-primary-deep); font-size: 0.9rem;">${escapeHtml(a.name)}</strong>
                    <div class="text-xs text-light">${a.emission_factor} kg CO₂ saved / ${escapeHtml(a.unit)}</div>
                </div>
            </div>
        `).join("");
    }

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