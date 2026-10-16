/**
 * CarbEarn API & Authentication Client
 * 
 * Centralized API communication module with dynamic base URL resolution,
 * JWT token injection, session validation, and standardized error handling.
 */

const CarbEarn = (() => {
    // Dynamic API Base URL resolution - works locally, on LAN, and in cloud deployment
    const isFileProto = window.location.protocol === "file:";
    const API_BASE = isFileProto ? "http://localhost:5000" : window.location.origin;

    const TOKEN_KEY = "carbearn_token";
    const USER_KEY = "carbearn_user";

    // -------------------------------------------------------------------------
    // Session & Token Helpers
    // -------------------------------------------------------------------------
    function getToken() {
        return localStorage.getItem(TOKEN_KEY);
    }

    function getUser() {
        try {
            const raw = localStorage.getItem(USER_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function setSession(token, user) {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user));
    }

    function clearSession() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
    }

    function requireAuth(redirectTo = "login.html") {
        const token = getToken();
        const user = getUser();
        if (!token || !user) {
            clearSession();
            window.location.href = redirectTo;
            return null;
        }

        // Strict role segregation: Administrators oversee the platform and cannot act as contributors
        const currentPath = window.location.pathname.toLowerCase();
        const contributorPages = ["dashboard.html", "activities.html", "history.html", "greenproof.html"];
        const isContributorPage = contributorPages.some(page => currentPath.endsWith(page));

        if (user.role === "ADMIN" && isContributorPage) {
            window.location.href = "admin.html";
            return null;
        }

        return { token, user };
    }

    function requireAdmin(redirectTo = "dashboard.html") {
        const token = getToken();
        const user = getUser();
        if (!token || !user) {
            clearSession();
            window.location.href = "login.html";
            return null;
        }
        if (user.role !== "ADMIN") {
            window.location.href = redirectTo;
            return null;
        }
        return { token, user };
    }

    function logout() {
        clearSession();
        window.location.href = "login.html";
    }

    // -------------------------------------------------------------------------
    // Unified HTTP Request Wrapper
    // -------------------------------------------------------------------------
    async function request(endpoint, options = {}) {
        const url = endpoint.startsWith("http") ? endpoint : `${API_BASE}${endpoint}`;
        const headers = {
            "Content-Type": "application/json",
            ...(options.headers || {})
        };

        const token = getToken();
        if (token && !headers["Authorization"]) {
            headers["Authorization"] = `Bearer ${token}`;
        }

        const config = {
            ...options,
            headers
        };

        try {
            const response = await fetch(url, config);

            // Handle 401 Unauthorized (Expired or Invalid token)
            if (response.status === 401 && !endpoint.includes("/api/auth/")) {
                clearSession();
                window.location.href = "login.html";
                throw new Error("Your session has expired. Please sign in again.");
            }

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                const message = data.message || data.error || `Request failed with status ${response.status}`;
                const err = new Error(message);
                err.status = response.status;
                err.data = data;
                throw err;
            }

            return data;
        } catch (error) {
            console.error(`[CarbEarn API Error] ${options.method || "GET"} ${endpoint}:`, error.message);
            throw error;
        }
    }

    // -------------------------------------------------------------------------
    // CleanTech UI Utilities: Toasts & Animated Counters
    // -------------------------------------------------------------------------
    function showToast(message, type = "info") {
        let container = document.getElementById("toast-container");
        if (!container) {
            container = document.createElement("div");
            container.id = "toast-container";
            document.body.appendChild(container);
        }
        const toast = document.createElement("div");
        toast.className = `toast ${type}`;
        const icons = { success: "✓", error: "✕", info: "ℹ" };
        toast.innerHTML = `<span style="font-weight:700;">${icons[type] || "•"}</span> <span>${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = "0";
            toast.style.transform = "translateX(100%)";
            toast.style.transition = "all 0.3s ease";
            setTimeout(() => toast.remove(), 300);
        }, 3800);
    }

    function animateValue(elem, start, end, duration = 800) {
        if (!elem) return;
        const target = parseFloat(end) || 0;
        const initial = parseFloat(start) || 0;
        const startTime = performance.now();
        const isDecimal = String(end).includes(".");
        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeOut = 1 - Math.pow(1 - progress, 3);
            const current = initial + (target - initial) * easeOut;
            elem.textContent = isDecimal ? current.toFixed(2) : Math.round(current);
            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                elem.textContent = isDecimal ? target.toFixed(2) : Math.round(target);
            }
        }
        requestAnimationFrame(update);
    }

    return {
        API_BASE,
        getToken,
        getUser,
        setSession,
        clearSession,
        requireAuth,
        requireAdmin,
        logout,
        request,
        showToast,
        animateValue,
        get: (endpoint, headers) => request(endpoint, { method: "GET", headers }),
        post: (endpoint, body, headers) => request(endpoint, { method: "POST", body: JSON.stringify(body), headers }),
        put: (endpoint, body, headers) => request(endpoint, { method: "PUT", body: JSON.stringify(body), headers }),
        delete: (endpoint, headers) => request(endpoint, { method: "DELETE", headers })
    };
})();
