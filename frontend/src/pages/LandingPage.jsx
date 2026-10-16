import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useTheme } from "../contexts/ThemeContext";
import { MapPin, Zap, Star, Users, Briefcase, Shield, Clock, ChevronRight, Sun, Moon, ArrowRight, CheckCircle, Smartphone } from "lucide-react";

const HERO_BG = "https://images.unsplash.com/photo-1760009436767-d154e930e55c?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMjV8MHwxfHNlYXJjaHwzfHxjb25zdHJ1Y3Rpb24lMjBzaXRlJTIwdGVhbSUyMHdvcmtpbmd8ZW58MHx8fHwxNzczMzk4OTM5fDA&ixlib=rb-4.1.0&q=85";

const FEATURES = [
  { icon: Zap, title: "Instant Job Matching", desc: "AI-powered matching connects you with the right jobs or workers in seconds.", color: "#7EC8E3" },
  { icon: MapPin, title: "Live Job Map", desc: "See available jobs or workers on a real-time interactive map near you.", color: "#0000FF" },
  { icon: Shield, title: "Verified & Secure", desc: "Every user is verified. Fraud detection and secure payments built in.", color: "#10B981" },
  { icon: Star, title: "Reputation System", desc: "Build your reputation with ratings after every job. Top workers earn more.", color: "#F59E0B" },
];

const HOW_WORKERS = [
  { step: "01", title: "Create Your Profile", desc: "Add your trade, skills, and photo. Takes 2 minutes." },
  { step: "02", title: "See Nearby Jobs", desc: "Browse live jobs on the map or get notified instantly." },
  { step: "03", title: "Accept & Earn", desc: "Accept work, get paid, build your reputation." },
];

const HOW_CONTRACTORS = [
  { step: "01", title: "Post a Job Instantly", desc: "Describe what you need, set pay rate, and go live." },
  { step: "02", title: "Find Local Workers", desc: "See available crew near you on the live map." },
  { step: "03", title: "Fill Positions Fast", desc: "Crew members accept within minutes. Problem solved." },
];

const STATS = [
  { value: "10k+", label: "Active Workers" },
  { value: "2.5k+", label: "Contractors" },
  { value: "50k+", label: "Jobs Completed" },
  { value: "4.8", label: "Avg Rating" },
];

export default function LandingPage() {
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState("workers");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setTimeout(() => setVisible(true), 100);
  }, []);

  return (
    <div className="min-h-screen bg-white dark:bg-[#020617]" style={{ fontFamily: "Inter, sans-serif" }}>
      {/* Navbar */}
      <nav className="bg-[#050A30] sticky top-0 z-50 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-[#0000FF] rounded-lg flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-white" />
            </div>
            <div className="hidden sm:block">
              <div className="text-white font-extrabold text-lg" style={{ fontFamily: "Manrope, sans-serif" }}>TheDayLaborers</div>
              <div className="text-[#7EC8E3] text-xs">A Blue Collar ME Company</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={toggleTheme} className="text-[#7EC8E3] p-2" data-testid="landing-theme-toggle">
              {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <Link to="/auth?mode=login" className="text-white hover:text-[#7EC8E3] font-semibold text-sm" data-testid="landing-login-btn">Log In</Link>
            <Link to="/auth?mode=register" className="bg-[#0000FF] text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-blue-700 transition-colors" data-testid="landing-signup-btn">Sign Up Free</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative min-h-screen flex items-center" style={{
        backgroundImage: `linear-gradient(180deg, rgba(5,10,48,0.92) 0%, rgba(5,10,48,0.75) 100%), url(${HERO_BG})`,
        backgroundSize: "cover", backgroundPosition: "center"
      }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-32 w-full">
          <div className={`max-w-3xl transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
            <div className="inline-flex items-center gap-2 bg-[#0000FF]/20 border border-[#0000FF]/40 rounded-full px-4 py-1.5 mb-6">
              <div className="w-2 h-2 bg-[#7EC8E3] rounded-full animate-pulse" />
              <span className="text-[#7EC8E3] text-sm font-medium">Live Jobs Available Now</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white mb-6 leading-tight" style={{ fontFamily: "Manrope, sans-serif" }}>
              Find Work Today.<br />
              <span className="text-[#7EC8E3]">Find Workers Now.</span>
            </h1>
            <p className="text-lg sm:text-xl text-slate-300 mb-10 max-w-xl leading-relaxed">
              The on-demand blue collar workforce marketplace. Contractors hire instantly. Crew members work when they want.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link to="/auth?mode=register&role=crew"
                className="flex items-center justify-center gap-2 bg-[#0000FF] text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition-all hover:scale-105 shadow-lg shadow-blue-900/50"
                data-testid="hero-crew-signup">
                <Users className="w-5 h-5" /> Crew Member Sign Up
              </Link>
              <Link to="/auth?mode=register&role=contractor"
                className="flex items-center justify-center gap-2 bg-white text-[#050A30] px-8 py-4 rounded-xl font-bold text-lg hover:bg-slate-100 transition-all hover:scale-105 shadow-lg"
                data-testid="hero-contractor-signup">
                <Briefcase className="w-5 h-5" /> Contractor Sign Up
              </Link>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 mt-4">
              <Link to="/verified-contractors"
                className="flex items-center justify-center gap-2 border border-[#7EC8E3]/50 text-[#7EC8E3] px-6 py-3 rounded-xl font-semibold text-base hover:bg-[#7EC8E3]/10 transition-all"
                data-testid="find-verified-contractors-btn">
                <CheckCircle className="w-4 h-4" /> Find Verified Contractors
              </Link>
              <Link to="/our-app"
                className="flex items-center justify-center gap-2 border border-white/20 text-white/80 px-6 py-3 rounded-xl font-semibold text-base hover:bg-white/10 transition-all"
                data-testid="our-app-btn">
                <Smartphone className="w-4 h-4" /> Our App
              </Link>
            </div>
            <p className="text-slate-400 text-sm mt-4">Free 30-day trial &bull; No credit card required</p>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <ChevronRight className="w-6 h-6 text-[#7EC8E3] rotate-90" />
        </div>
      </section>

      {/* Stats */}
      <section className="bg-[#050A30] py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {STATS.map(s => (
              <div key={s.label} className="text-center">
                <div className="text-3xl sm:text-4xl font-extrabold text-white mb-1" style={{ fontFamily: "Manrope, sans-serif" }}>{s.value}</div>
                <div className="text-[#7EC8E3] text-sm">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-white dark:bg-[#020617]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#050A30] dark:text-white mb-4" style={{ fontFamily: "Manrope, sans-serif" }}>
              Built for the Blue Collar Workforce
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-lg max-w-xl mx-auto">
              Real-time technology that puts money in your pocket and workers at your job site.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map(f => (
              <div key={f.title} className="card p-6 group hover:-translate-y-1 transition-transform duration-200">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ background: `${f.color}20` }}>
                  <f.icon className="w-6 h-6" style={{ color: f.color }} />
                </div>
                <h3 className="font-bold text-[#050A30] dark:text-white text-lg mb-2" style={{ fontFamily: "Manrope, sans-serif" }}>{f.title}</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 bg-slate-50 dark:bg-[#0F172A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#050A30] dark:text-white mb-4" style={{ fontFamily: "Manrope, sans-serif" }}>
              How It Works
            </h2>
            <div className="flex justify-center gap-2 mt-6">
              <button
                onClick={() => setActiveTab("workers")}
                className={`px-6 py-2.5 rounded-lg font-bold text-sm transition-colors ${activeTab === "workers" ? "bg-[#0000FF] text-white" : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"}`}
                data-testid="tab-workers"
              >
                For Workers
              </button>
              <button
                onClick={() => setActiveTab("contractors")}
                className={`px-6 py-2.5 rounded-lg font-bold text-sm transition-colors ${activeTab === "contractors" ? "bg-[#0000FF] text-white" : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"}`}
                data-testid="tab-contractors"
              >
                For Contractors
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {(activeTab === "workers" ? HOW_WORKERS : HOW_CONTRACTORS).map((item, i) => (
              <div key={item.step} className="relative">
                {i < 2 && <div className="hidden md:block absolute top-8 left-full w-full h-0.5 bg-slate-200 dark:bg-slate-700 z-0" style={{ width: "calc(100% - 32px)" }} />}
                <div className="relative z-10">
                  <div className="w-16 h-16 bg-[#050A30] dark:bg-[#000C66] rounded-2xl flex items-center justify-center mb-4 shadow-lg">
                    <span className="text-[#7EC8E3] font-extrabold text-xl" style={{ fontFamily: "Manrope, sans-serif" }}>{item.step}</span>
                  </div>
                  <h3 className="font-bold text-[#050A30] dark:text-white text-xl mb-2" style={{ fontFamily: "Manrope, sans-serif" }}>{item.title}</h3>
                  <p className="text-slate-500 dark:text-slate-400 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-[#050A30]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4" style={{ fontFamily: "Manrope, sans-serif" }}>
            Ready to Get to Work?
          </h2>
          <p className="text-[#7EC8E3] text-lg mb-8">Join thousands of workers and contractors already on the platform.</p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link to="/auth?mode=register&role=crew"
              className="flex items-center justify-center gap-2 bg-[#0000FF] text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition-all"
              data-testid="cta-crew-btn">
              I Want to Work <ArrowRight className="w-5 h-5" />
            </Link>
            <Link to="/auth?mode=register&role=contractor"
              className="flex items-center justify-center gap-2 border-2 border-white text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-white hover:text-[#050A30] transition-all"
              data-testid="cta-contractor-btn">
              I Need Crew <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#020617] py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-start gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-[#0000FF] rounded-lg flex items-center justify-center">
                  <Briefcase className="w-4 h-4 text-white" />
                </div>
                <span className="text-white font-extrabold" style={{ fontFamily: "Manrope, sans-serif" }}>TheDayLaborers</span>
              </div>
              <p className="text-slate-400 text-sm max-w-xs">A Blue Collar ME Company. Connecting workers and contractors nationwide.</p>
            </div>
            <div className="grid grid-cols-2 gap-8 text-sm">
              <div>
                <h4 className="text-white font-semibold mb-3">Platform</h4>
                <div className="space-y-2">
                  <Link to="/auth?mode=register&role=crew" className="block text-slate-400 hover:text-white transition-colors">Find Work</Link>
                  <Link to="/auth?mode=register&role=contractor" className="block text-slate-400 hover:text-white transition-colors">Hire Crew</Link>
                  <Link to="/auth?mode=login" className="block text-slate-400 hover:text-white transition-colors">Log In</Link>
                  <Link to="/post-job" className="block text-slate-400 hover:text-white transition-colors" data-testid="footer-guest-post">Post a Job – No Account ($9.99)</Link>
                </div>
              </div>
              <div>
                <h4 className="text-white font-semibold mb-3">Legal</h4>
                <div className="space-y-2">
                  <Link to="/legal?page=terms" className="block text-slate-400 hover:text-white transition-colors" data-testid="footer-terms">Terms & Conditions</Link>
                  <Link to="/auth?advertiser=true" className="block text-slate-400 hover:text-white transition-colors" data-testid="footer-advertiser">Advertiser Signup</Link>
                  <Link to="/legal?page=privacy" className="block text-slate-400 hover:text-white transition-colors" data-testid="footer-privacy">Privacy Policy</Link>
                  <Link to="/legal?page=guidelines" className="block text-slate-400 hover:text-white transition-colors" data-testid="footer-guidelines">Community Guidelines</Link>
                </div>
              </div>
            </div>
          </div>
          <div className="border-t border-slate-800 pt-6 text-center text-slate-500 text-sm">
            &copy; {new Date().getFullYear()} TheDayLaborers. A Blue Collar ME Company. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
