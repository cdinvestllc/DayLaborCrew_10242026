import React, { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const { updateUser, refreshUser } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const hash = location.hash;
    const params = new URLSearchParams(hash.replace("#", "?"));
    const sessionId = params.get("session_id");

    if (!sessionId) {
      navigate("/auth", { replace: true });
      return;
    }

    const exchange = async () => {
      try {
        let requestedRole = "crew";
        try { requestedRole = sessionStorage.getItem("google_signup_role") || "crew"; } catch { }
        const res = await axios.post(`${API}/auth/google/callback`, { session_id: sessionId, role: requestedRole });
        try { sessionStorage.removeItem("google_signup_role"); } catch { }
        const { user: userData } = res.data;
        window.history.replaceState(null, "", window.location.pathname);
        updateUser(userData);

        // Route based on role
        if (userData.role === "crew") navigate("/crew/dashboard", { replace: true });
        else if (userData.role === "contractor") navigate("/contractor/dashboard", { replace: true });
        else if (["admin", "super_admin"].includes(userData.role)) navigate("/admin/dashboard", { replace: true });
        else navigate("/auth", { replace: true });
      } catch (err) {
        try { sessionStorage.removeItem("google_signup_role"); } catch { }
        const reason = err?.response?.status === 403 ? "oauth_forbidden" : "oauth_failed";
        navigate(`/auth?error=${reason}`, { replace: true });
      }
    };

    exchange();
  }, [location.hash, navigate, updateUser]);

  return (
    <div className="min-h-screen bg-[#050A30] flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-14 w-14 border-b-2 border-[#7EC8E3] mx-auto mb-4" />
        <p className="text-white font-semibold text-lg">Signing you in with Google...</p>
        <p className="text-slate-400 text-sm mt-1">Please wait</p>
      </div>
    </div>
  );
}
