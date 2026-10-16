import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const AuthContext = createContext(null);

// Session lives in an HttpOnly cookie; JS only echoes the CSRF cookie back as a header.
axios.defaults.withCredentials = true;
const readCookie = (name) =>
  document.cookie.split("; ").find(c => c.startsWith(`${name}=`))?.split("=")[1];
axios.interceptors.request.use((config) => {
  const method = (config.method || "get").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrf = readCookie("tdl_csrf");
    if (csrf) config.headers["X-CSRF-Token"] = decodeURIComponent(csrf);
  }
  return config;
});
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
