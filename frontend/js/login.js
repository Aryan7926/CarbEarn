document.addEventListener("DOMContentLoaded", () => {
    // If already logged in, redirect
    const user = CarbEarn.getUser();
    const token = CarbEarn.getToken();
    if (user && token) {
        if (user.role === "ADMIN") {
            window.location.href = "admin.html";
        } else {
            window.location.href = "dashboard.html";
        }
        return;
    }

    const loginForm = document.getElementById("loginForm");
    const loginMessage = document.getElementById("loginMessage");
    const loginBtn = document.getElementById("loginBtn");
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");

    const tabContributor = document.getElementById("tabContributor");
    const tabAdmin = document.getElementById("tabAdmin");
    const adminHelpBox = document.getElementById("adminHelpBox");
    const fillAdminBtn = document.getElementById("fillAdminBtn");
    const loginTitle = document.getElementById("loginTitle");
    const loginSubtitle = document.getElementById("loginSubtitle");

    function setRole(role) {
        if (role === "admin") {
            tabAdmin.style.background = "var(--emerald-600)";
            tabAdmin.style.color = "#ffffff";
            tabAdmin.style.fontWeight = "700";
            tabContributor.style.background = "transparent";
            tabContributor.style.color = "var(--slate-600)";
            tabContributor.style.fontWeight = "600";
            adminHelpBox.style.display = "block";
            loginTitle.textContent = "Coordinator & Admin Portal";
            loginSubtitle.textContent = "Access system analytics, user accounts, and GreenProof audit queue.";
            loginBtn.textContent = "Sign In as Administrator";
        } else {
            tabContributor.style.background = "#ffffff";
            tabContributor.style.color = "var(--slate-900)";
            tabContributor.style.fontWeight = "700";
            tabAdmin.style.background = "transparent";
            tabAdmin.style.color = "var(--slate-600)";
            tabAdmin.style.fontWeight = "600";
            adminHelpBox.style.display = "none";
            loginTitle.textContent = "Account Sign In";
            loginSubtitle.textContent = "Enter your registered email and password.";
            loginBtn.textContent = "Sign In";
        }
    }

    if (tabAdmin && tabContributor) {
        tabAdmin.addEventListener("click", () => setRole("admin"));
        tabContributor.addEventListener("click", () => setRole("contributor"));
    }

    if (fillAdminBtn) {
        fillAdminBtn.addEventListener("click", () => {
            emailInput.value = "admin@carbearn.com";
            passwordInput.value = "Admin@12345";
            CarbEarn.showToast("Admin credentials populated!", "info");
        });
    }

    // Auto-select admin if query parameter ?role=admin exists
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("role") === "admin") {
        setRole("admin");
        emailInput.value = "admin@carbearn.com";
        passwordInput.value = "Admin@12345";
    }

    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const email = emailInput.value.trim().toLowerCase();
        const password = passwordInput.value;

        if (!email || !password) {
            showMessage("Please fill in both email and password.", "error");
            return;
        }

        loginBtn.disabled = true;
        loginBtn.textContent = "Signing in...";
        showMessage("Verifying credentials...", "info");

        try {
            const data = await CarbEarn.post("/api/auth/login", { email, password });

            if (data.token && data.user) {
                CarbEarn.setSession(data.token, data.user);
                showMessage("Sign-in successful! Redirecting...", "success");
                CarbEarn.showToast(`Welcome back, ${data.user.name || "contributor"}!`, "success");

                setTimeout(() => {
                    if (data.user.role === "ADMIN") {
                        window.location.href = "admin.html";
                    } else {
                        window.location.href = "dashboard.html";
                    }
                }, 600);
            } else {
                throw new Error("Invalid response received from server.");
            }
        } catch (error) {
            showMessage(error.message || "Failed to sign in. Please verify your credentials.", "error");
            CarbEarn.showToast(error.message || "Sign-in failed", "error");
            loginBtn.disabled = false;
            loginBtn.textContent = "Sign In";
        }
    });

    function showMessage(text, type) {
        loginMessage.textContent = text;
        loginMessage.className = `form-message ${type}`;
    }
});