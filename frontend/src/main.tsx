import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./contexts/ThemeContext";
import { SessionProvider } from "./contexts/SessionContext";
import "./styles/globals.css";
import { getBackendAuthToken } from "./lib/backendAuth";

const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://127.0.0.1:8000";

/**
 * Poll /health (public, no auth) until the backend responds, then pre-warm
 * the auth token cache so the first component-level API calls always have a token.
 * Gives up after ~10 s (20 × 500 ms) and renders anyway so the UI isn't stuck.
 */
async function waitForBackend(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`${API_BASE}/health`);
      if (res.ok) {
        await getBackendAuthToken();
        return;
      }
    } catch {
      // backend not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

waitForBackend().then(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ThemeProvider>
        <SessionProvider>
          <App />
        </SessionProvider>
      </ThemeProvider>
    </React.StrictMode>,
  );
});
