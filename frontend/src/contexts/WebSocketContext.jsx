import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import axios from "axios";
import { useAuth } from "./AuthContext";

const WS_URL = process.env.REACT_APP_BACKEND_URL
  ? process.env.REACT_APP_BACKEND_URL.replace(/^https?/, "wss").replace(/^http/, "ws")
  : "ws://localhost:8001";

const WebSocketContext = createContext(null);

export function WebSocketProvider({ children }) {
  const { user } = useAuth();
  const userId = user?.id;
  const ws = useRef(null);
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const listeners = useRef([]);
  const reconnectTimer = useRef(null);

  const active = useRef(false);

  const connecting = useRef(false);

  const connect = useCallback(async () => {
    if (!userId || connecting.current || (ws.current && ws.current.readyState <= WebSocket.OPEN)) return;
    connecting.current = true;
    let ticket;
    try {
      ticket = (await axios.post(`${process.env.REACT_APP_BACKEND_URL}/api/ws/ticket`)).data.ticket;
    } catch {
      if (active.current) reconnectTimer.current = setTimeout(connect, 10000);
      return;
    } finally {
      connecting.current = false;
    }
    if (!active.current || (ws.current && ws.current.readyState <= WebSocket.OPEN)) return;
    const sock = new WebSocket(`${WS_URL}/api/ws?ticket=${encodeURIComponent(ticket)}`);
    ws.current = sock;

    sock.onopen = () => {
      if (ws.current !== sock) return;
      setConnected(true);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };

    sock.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        setLastMessage(data);
        listeners.current.forEach(fn => fn(data));
      } catch { }
    };

    sock.onclose = (evt) => {
      if (ws.current !== sock) return;
      ws.current = null;
      setConnected(false);
      if (active.current && evt.code !== 4003 && evt.code !== 4000) reconnectTimer.current = setTimeout(connect, 3000);
    };

    sock.onerror = () => sock.close();
  }, [userId]);

  useEffect(() => {
    active.current = !!userId;
    if (userId) connect();
    return () => {
      active.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      const sock = ws.current;
      ws.current = null;
      sock?.close();
      setConnected(false);
    };
  }, [userId, connect]);

  const sendMessage = useCallback((data) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data));
    }
  }, []);

  const addListener = useCallback((fn) => {
    listeners.current.push(fn);
    return () => {
      listeners.current = listeners.current.filter(l => l !== fn);
    };
  }, []);

  const sendLocation = useCallback((lat, lng, city = "") => {
    sendMessage({ type: "location_update", lat, lng, city });
  }, [sendMessage]);

  return (
    <WebSocketContext.Provider value={{ connected, lastMessage, sendMessage, addListener, sendLocation }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export const useWebSocket = () => {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error("useWebSocket must be used within WebSocketProvider");
  return ctx;
};
