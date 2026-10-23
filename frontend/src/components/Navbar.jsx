import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { Sun, Moon, Menu, X, Briefcase, ChevronDown, User, Settings, LogOut, LayoutDashboard, HelpCircle, Archive } from "lucide-react";
import NotificationBell from "./NotificationBell";
import SafeImage from "./SafeImage";
import { resolveImageUrl } from "../lib/media";

export default function Navbar({ minimal = false }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { lang, toggleLang, t } = useLanguage();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const dashboardPath = user?.role === "crew" ? "/crew/dashboard"
    : user?.role === "contractor" ? "/contractor/dashboard"
    : "/admin/dashboard";

  return (
    <nav className="bg-[#050A30] shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 bg-[#0000FF] rounded-lg flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-white" />
            </div>
            <div className="hidden sm:block">
              <div className="text-white font-extrabold text-lg leading-none" style={{ fontFamily: "Manrope, sans-serif" }}>
                TheDayLaborers
              </div>
              <div className="text-[#7EC8E3] text-xs">A Blue Collar ME Company</div>
            </div>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="text-[#7EC8E3] hover:text-white transition-colors p-2"
              data-testid="theme-toggle"
            >
              {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button onClick={toggleLang} aria-label={t("Language")}
              className="text-[#7EC8E3] hover:text-white transition-colors px-2 py-1 text-xs font-bold border border-[#7EC8E3]/50 rounded-md"
              data-testid="language-toggle">
              {lang === "es" ? "EN" : "ES"}
            </button>

            {/* Notification Bell — shown when logged in */}
            {user && (
              <div className="[&_button]:text-[#7EC8E3] [&_button:hover]:text-white">
                <NotificationBell />
              </div>
            )}

            {user ? (
              <div className="relative">
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-2 bg-[#000C66] text-white px-3 py-2 rounded-lg hover:bg-blue-900 transition-colors"
                  data-testid="user-menu-btn"
                >
                  {user.profile_photo || user.logo ? (
                    <SafeImage src={resolveImageUrl(user.profile_photo || user.logo)}
                      className="w-7 h-7 rounded-full object-cover" alt="avatar" />
                  ) : (
                    <div className="w-7 h-7 bg-[#0000FF] rounded-full flex items-center justify-center text-xs font-bold">
                      {user.name?.[0]?.toUpperCase()}
                    </div>
                  )}
                  <span className="font-semibold text-sm max-w-24 truncate">{user.name}</span>
                  <ChevronDown className="w-4 h-4" />
                </button>

                {dropdownOpen && (
                  <div className="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50"
                    onMouseLeave={() => setDropdownOpen(false)}>
                    <div className="p-3 border-b border-slate-200 dark:border-slate-700">
                      <p className="font-semibold text-[#050A30] dark:text-white text-sm">{user.name}</p>
                      <p className="text-xs text-slate-500 capitalize">{user.role}</p>
                    </div>
                    <div className="p-2">
                      <Link to={dashboardPath} onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-sm text-[#050A30] dark:text-white" data-testid="nav-dashboard">
                        <LayoutDashboard className="w-4 h-4" /> {t("Dashboard")}
                      </Link>
                      <Link to="/profile" onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-sm text-[#050A30] dark:text-white" data-testid="nav-profile">
                        <User className="w-4 h-4" /> {t("My Profile")}
                      </Link>
                      {user.role === "contractor" && (
                        <Link to="/contractor/archives" onClick={() => setDropdownOpen(false)}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-sm text-[#050A30] dark:text-white" data-testid="nav-archives">
                          <Archive className="w-4 h-4" /> Archived Jobs
                        </Link>
                      )}
                      <Link to="/subscription" onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-sm text-[#050A30] dark:text-white" data-testid="nav-subscription">
                        <Settings className="w-4 h-4" /> {t("Subscription")}
                      </Link>
                      <Link to="/settings/app" onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-sm text-[#050A30] dark:text-white" data-testid="nav-app-settings">
                        <Settings className="w-4 h-4" /> {t("App Settings")}
                      </Link>
                      <button onClick={handleLogout}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-sm text-red-600 mt-1" data-testid="nav-logout">
                        <LogOut className="w-4 h-4" /> {t("Log Out")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              !minimal && (
                <div className="flex items-center gap-3">
                  <Link to="/auth?mode=login"
                    className="text-white hover:text-[#7EC8E3] font-semibold text-sm transition-colors" data-testid="nav-login">
                    Log In
                  </Link>
                  <Link to="/auth?mode=register"
                    className="bg-[#0000FF] text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-blue-700 transition-colors" data-testid="nav-signup">
                    Sign Up
                  </Link>
                </div>
              )
            )}
          </div>

          {/* Mobile */}
          <div className="md:hidden flex items-center gap-2">
            <button onClick={toggleTheme} className="text-[#7EC8E3] p-2">
              {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button onClick={() => setMobileOpen(!mobileOpen)} className="text-white p-2" data-testid="mobile-menu-btn">
              {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="md:hidden bg-[#000C66] border-t border-blue-900 px-4 pb-4 pt-2">
          {user ? (
            <>
              <div className="flex items-center gap-3 py-3 border-b border-blue-800 mb-2">
                <div className="w-10 h-10 bg-[#0000FF] rounded-full flex items-center justify-center font-bold text-white">
                  {user.name?.[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="text-white font-semibold">{user.name}</p>
                  <p className="text-[#7EC8E3] text-xs capitalize">{user.role}</p>
                </div>
              </div>
              <Link to={dashboardPath} onClick={() => setMobileOpen(false)} className="flex items-center gap-2 py-2 text-white text-sm"><LayoutDashboard className="w-4 h-4" /> {t("Dashboard")}</Link>
              <Link to="/profile" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 py-2 text-white text-sm"><User className="w-4 h-4" /> {t("Profile")}</Link>
              {user.role === "contractor" && <Link to="/contractor/archives" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 py-2 text-white text-sm"><Archive className="w-4 h-4" /> Archived Jobs</Link>}
              <Link to="/subscription" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 py-2 text-white text-sm"><Settings className="w-4 h-4" /> {t("Subscription")}</Link>
              <button onClick={handleLogout} className="flex items-center gap-2 py-2 text-red-400 text-sm"><LogOut className="w-4 h-4" /> Log Out</button>
            </>
          ) : (
            <div className="flex flex-col gap-2 pt-2">
              <Link to="/auth?mode=login" className="text-white font-semibold py-2">{t("Log In")}</Link>
              <Link to="/auth?mode=register" className="bg-[#0000FF] text-white py-2 px-4 rounded-lg font-bold text-center">{t("Sign Up")}</Link>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
