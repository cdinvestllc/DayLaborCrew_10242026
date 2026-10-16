import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const AuthContext = createContext(null);

// Session lives in an HttpOnly cookie; JS only echoes the CSRF cookie back as a header.
// When the app is opened from a domain alias (e.g. a named preview URL) the API host's cookie
// isn't readable via document.cookie, so the token is fetched from /auth/csrf instead.
axios.defaults.withCredentials = true;
const readCookie = (name) =>
  document.cookie.split("; ").find(c => c.startsWith(`${name}=`))?.split("=")[1];
const SAFE = ["GET", "HEAD", "OPTIONS"];
const SESSION_CHANGING = /\/api\/auth\/(login|register|logout|logout-all|google\/callback|convert-to-contractor|reset-password)/;
let csrfCache = null;
let csrfPromise = null;
const fetchCsrf = () => {
  if (!csrfPromise) {
    csrfPromise = axios.get(`${API}/auth/csrf`)
      .then(r => { csrfCache = r.data?.csrf_token || null; return csrfCache; })
      .catch(() => null)
      .finally(() => { csrfPromise = null; });
  }
  return csrfPromise;
};
axios.interceptors.request.use(async (config) => {
  const method = (config.method || "get").toUpperCase();
  if (!SAFE.includes(method)) {
    const cookie = readCookie("tdl_csrf");
    let csrf = cookie ? decodeURIComponent(cookie) : csrfCache;
    if (!csrf && !SESSION_CHANGING.test(config.url || "")) csrf = await fetchCsrf();
    if (csrf) config.headers["X-CSRF-Token"] = csrf;
  }
  return config;
});
axios.interceptors.response.use(
  (res) => {
    if (SESSION_CHANGING.test(res.config?.url || "")) csrfCache = null;
    return res;
  },
  async (error) => {
    const cfg = error.config;
    if (cfg && !cfg._csrfRetry && error.response?.status === 403 &&
        error.response?.data?.detail === "CSRF validation failed") {
      cfg._csrfRetry = true;
      csrfCache = null;
      const csrf = await fetchCsrf();
      if (csrf) {
        cfg.headers["X-CSRF-Token"] = csrf;
        return axios(cfg);
      }
    }
    return Promise.reject(error);
  }
);
localStorage.removeItem("tdl_token");

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/users/me`);
      setUser(res.data);
      return res.data;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Returning from OAuth: AuthCallback exchanges the session_id first.
    if (window.location.hash?.includes("session_id=")) {
      setLoading(false);
      return;
    }
    fetchMe();
  }, [fetchMe]);

  const login = useCallback(async (email, password) => {
    const res = await axios.post(`${API}/auth/login`, { email, password });
    setUser(res.data.user);
    return res.data.user;
  }, []);

  const register = useCallback(async (formData) => {
    const res = await axios.post(`${API}/auth/register`, formData);
    setUser(res.data.user);
    return res.data.user;
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    if (window.caches) window.caches.delete("daylaborers-api-v2").catch(() => {});
    try { await axios.post(`${API}/auth/logout`); } catch { }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/users/me`);
      setUser(res.data);
      return res.data;
    } catch {
      setUser(null);
    }
  }, []);

  const updateUser = useCallback((updates) => {
    setUser(prev => prev ? { ...prev, ...updates } : updates);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
