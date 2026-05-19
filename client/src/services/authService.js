import apiClient from "../config/axiosConfig";

const emitAuthChange = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("auth-change"));
  }
};

/**
 * Logs in the user.
 * @param {string} identifier - Email or Employee ID
 * @param {string} password
 */
export const loginUser = async (identifier, password) => {
  try {
    // Ensure previous session data cannot leak into a new login flow.
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    emitAuthChange();

    const response = await apiClient.post("/api/auth/login", {
      identifier,
      password,
    });
    // Store basic user info in localStorage (optional, for UI access)
    if (response.data.user) {
      localStorage.setItem("user", JSON.stringify(response.data.user));
    }
    if (response.data.token) {
      localStorage.setItem("token", response.data.token);
    }
    emitAuthChange();
    return response.data;
  } catch (error) {
    console.error("Login API Error:", error);
    const responseData = error.response?.data;
    if (typeof responseData === "string") {
      throw { message: responseData };
    }
    if (responseData && typeof responseData === "object") {
      throw responseData;
    }
    throw { message: error.message || "Login failed" };
  }
};

/**
 * Changes the user's own password.
 * @param {string} currentPassword
 * @param {string} newPassword
 */
export const changePassword = async (currentPassword, newPassword) => {
  try {
    const response = await apiClient.post("/api/auth/change-password", {
      current_password: currentPassword,
      new_password: newPassword,
    });
    return response.data;
  } catch (error) {
    const responseData = error.response?.data;
    if (responseData && typeof responseData === "object") throw responseData;
    throw { message: error.message || "পাসওয়ার্ড পরিবর্তন ব্যর্থ হয়েছে" };
  }
};

/**
 * Refreshes the current user's session token.
 */
export const refreshSession = async () => {
  try {
    const response = await apiClient.post("/api/auth/refresh");
    if (response.data?.token) {
      localStorage.setItem("token", response.data.token);
    }
    return response.data;
  } catch (error) {
    throw error;
  }
};

/**
 * Logs out the user.
 */
export const logoutUser = async () => {
  try {
    // Call backend to clear httpOnly cookies
    await apiClient.post("/api/auth/logout");
  } catch (error) {
    console.error("Logout failed", error);
  } finally {
    // Always clear client-side session, even if API logout fails.
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    emitAuthChange();
  }
};
