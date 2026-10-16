document.addEventListener("DOMContentLoaded", () => {
    // If already logged in, redirect
    const user = CarbEarn.getUser();
    const token = CarbEarn.getToken();
    if (user && token) {
        window.location.href = user.role === "ADMIN" ? "admin.html" : "dashboard.html";
        return;
    }

    const registerForm = document.getElementById("registerForm");
    const registerMessage = document.getElementById("registerMessage");
    const registerBtn = document.getElementById("registerBtn");
    const toggleAdminRegBtn = document.getElementById("toggleAdminRegBtn");
    const adminKeyGroup = document.getElementById("adminKeyGroup");
    const adminSecretInput = document.getElementById("adminSecret");

    if (toggleAdminRegBtn && adminKeyGroup) {
        toggleAdminRegBtn.addEventListener("click", () => {
            const isHidden = adminKeyGroup.style.display === "none";
            adminKeyGroup.style.display = isHidden ? "block" : "none";
            if (isHidden && adminSecretInput) {
                adminSecretInput.focus();
            }
        });
    }

    registerForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const name = document.getElementById("name").value.trim();
        const email = document.getElementById("email").value.trim().toLowerCase();
        const password = document.getElementById("password").value;
        const college = document.getElementById("college").value.trim();
        const adminSecret = adminSecretInput ? adminSecretInput.value.trim() : "";

        if (!name || !email || !password || !college) {
            showMessage("Please fill in all required fields.", "error");
            return;
        }

        if (password.length < 6) {
            showMessage("Password must be at least 6 characters long.", "error");
            return;
        }

        registerBtn.disabled = true;
        registerBtn.textContent = "Creating Account...";
        showMessage("Registering your account...", "info");

        try {
            const payload = {
                name,
                email,
                password,
                college
            };
            if (adminSecret) {
                payload.adminSecret = adminSecret;
            }

            const data = await CarbEarn.post("/api/auth/register", payload);

            const isRoleAdmin = data.role === "ADMIN";
            const successMsg = isRoleAdmin
                ? "Administrator account created! Redirecting to sign in..."
                : "Account created successfully! Redirecting to sign in...";

            showMessage(successMsg, "success");
            CarbEarn.showToast(successMsg, "success");

            setTimeout(() => {
                window.location.href = isRoleAdmin ? "login.html?role=admin" : "login.html";
            }, 1000);
        } catch (error) {
            showMessage(error.message || "Failed to create account. Please try again.", "error");
            CarbEarn.showToast(error.message || "Registration failed", "error");
            registerBtn.disabled = false;
            registerBtn.textContent = "Create Account";
        }
    });

    function showMessage(text, type) {
        registerMessage.textContent = text;
        registerMessage.className = `form-message ${type}`;
    }
});