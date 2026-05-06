import axios from "axios";

/**
 * Axios instance configuration for API calls
 * Points to the Express backend server running on localhost:3000
 */

// Use Vite environment variables in the browser: `import.meta.env`.
// If you need to override, set `VITE_API_URL` in a `.env` file at the project root.
const API_BASE_URL = import.meta.env.VITE_API_URL || "";
console.log("Axios Base URL:", API_BASE_URL);

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true, // Include cookies in requests
});

const RETRYABLE_STATUS_CODES = new Set([502, 503, 504]);
const RETRYABLE_METHODS = new Set(["get", "head", "options"]);
const MAX_RETRIES = 2;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Request Interceptor
 * Adds authorization token to headers if available
 */
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Track if logout redirect is already in progress to avoid duplicate redirects
let _logoutInProgress = false;

const triggerLogout = () => {
  if (_logoutInProgress) return;
  if (window.location.pathname.includes("/login")) return;
  _logoutInProgress = true;
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  // Small delay to let any pending state updates complete
  setTimeout(() => {
    window.location.href = "/login";
  }, 100);
};

// Reset the flag when we're on the login page
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    if (window.location.pathname.includes("/login")) {
      _logoutInProgress = false;
    }
  });
}

/**
 * Response Interceptor
 * Handles errors and token expiration
 */
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const config = error.config || {};
    const method = String(config.method || "get").toLowerCase();
    const status = Number(error.response?.status || 0);
    const isNetworkError =
      !error.response &&
      (error.code === "ECONNABORTED" ||
        String(error.message || "")
          .toLowerCase()
          .includes("network") ||
        String(error.message || "")
          .toLowerCase()
          .includes("timeout"));
    const retryable =
      RETRYABLE_METHODS.has(method) &&
      (RETRYABLE_STATUS_CODES.has(status) || isNetworkError);
    const retryCount = Number(config.__retryCount || 0);

    if (retryable && retryCount < MAX_RETRIES) {
      config.__retryCount = retryCount + 1;
      const backoff = 400 * 2 ** retryCount;
      await wait(backoff);
      return apiClient(config);
    }

    // Handle 401 Unauthorized (token expired or missing)
    if (error.response?.status === 401) {
      // Skip logout redirect if this request opted out
      const skipLogout = Boolean(config._skipAuthRedirect);
      if (!skipLogout) {
        triggerLogout();
      }
    }
    return Promise.reject(error);
  },
);

export default apiClient;
