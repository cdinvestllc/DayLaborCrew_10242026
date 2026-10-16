import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

// English text is the key; missing Spanish entries fall back to English. User-entered content is never translated.
const ES = {
  "Dashboard": "Panel",
  "My Profile": "Mi perfil",
  "Profile": "Perfil",
  "Subscription": "Suscripción",
  "App Settings": "Configuración",
  "Log Out": "Cerrar sesión",
  "Log In": "Iniciar sesión",
  "Sign Up": "Registrarse",
  "Available": "Disponible",
  "Unavailable": "No disponible",
  "Transport": "Transporte",
  "Map": "Mapa",
  "List": "Lista",
  "AI Match": "Coincidencia IA",
  "Use My Location": "Usar mi ubicación",
  "All States": "Todos los estados",
  "Any Distance": "Cualquier distancia",
  "All": "Todos",
  "Refresh": "Actualizar",
  "Your Stats": "Tus estadísticas",
  "Jobs Done": "Trabajos hechos",
  "Rating": "Calificación",
  "Points": "Puntos",
  "Nearby": "Cercanos",
  "My Active Jobs": "Mis trabajos activos",
  "No active jobs. Accept a job to get started!": "No tienes trabajos activos. ¡Acepta uno para empezar!",
  "Your Referral Code": "Tu código de referido",
  "No jobs found nearby": "No hay trabajos cerca",
  "Try expanding your search radius": "Intenta ampliar el radio de búsqueda",
  "Subscribe now": "Suscríbete ahora",
  "Complete profile": "Completar perfil",
  "Live updates active": "Actualizaciones en vivo",
  "Connecting...": "Conectando...",
  "Good morning": "Buenos días",
  "Good afternoon": "Buenas tardes",
  "Good evening": "Buenas noches",
  "Job accepted!": "¡Trabajo aceptado!",
  "Failed to accept job": "No se pudo aceptar el trabajo",
  "You are now available for work": "Ahora estás disponible para trabajar",
  "You are now unavailable for work": "Ahora no estás disponible para trabajar",
  "Failed to update availability": "No se pudo actualizar la disponibilidad",
  "Job marked as complete. Awaiting contractor verification.": "Trabajo marcado como terminado. Esperando verificación del contratista.",
  "Location updated!": "¡Ubicación actualizada!",
  "Location access denied": "Acceso a la ubicación denegado",
  "Job link copied!": "¡Enlace del trabajo copiado!",
  "You already have a job scheduled that overlaps with this time slot.": "Ya tienes un trabajo programado que se cruza con este horario.",
  "Profile Completion": "Perfil completado",
  "Complete my profile": "Completar mi perfil",
  "Profile photo": "Foto de perfil",
  "Phone number": "Número de teléfono",
  "Address / location": "Dirección / ubicación",
  "Short bio": "Biografía corta",
  "Primary trade": "Oficio principal",
  "At least one portfolio photo": "Al menos una foto de portafolio",
  "Skills": "Habilidades",
  "Transportation": "Transporte",
  "Privacy Settings": "Privacidad",
  "Hide phone number": "Ocultar número de teléfono",
  "Hide email address": "Ocultar correo electrónico",
  "Hide exact location": "Ocultar ubicación exacta",
  "Privacy setting saved": "Privacidad guardada",
  "Portfolio": "Portafolio",
  "Profile Information": "Información del perfil",
  "Licenses & Certifications": "Licencias y certificaciones",
  "Add certification": "Agregar certificación",
  "Choose Your Plan": "Elige tu plan",
  "Find jobs and grow your career": "Encuentra trabajo y haz crecer tu carrera",
  "Language": "Idioma",
  "Email": "Correo electrónico",
  "Password": "Contraseña",
  "An active subscription is required. Please choose a plan.": "Se requiere una suscripción activa. Elige un plan.",
  "This job is no longer accepting crew": "Este trabajo ya no acepta personal",
};

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem("tdl_lang") || "en");
  useEffect(() => {
    localStorage.setItem("tdl_lang", lang);
    document.documentElement.lang = lang;
  }, [lang]);
  const t = useCallback((text) => (lang === "es" && text ? ES[text] ?? text : text), [lang]);
  return (
    <LanguageContext.Provider value={{ lang, setLang, t, toggleLang: () => setLang(l => (l === "es" ? "en" : "es")) }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
};
