import { useState } from "react";
import type { ApiStatus } from "../hooks/useApiStatus";

interface ConnectionSettingsProps {
  status: ApiStatus;
  base: string;
  onApply: (url: string) => void;
}

/**
 * Lets the user point the web UI at their Luno API — e.g. the local server
 * (`http://localhost:8787`), a LAN address, or a tunnel. Persisted via the
 * `onApply` handler (which stores it and re-pings the API).
 */
export function ConnectionSettings({ status, base, onApply }: ConnectionSettingsProps) {
  const [value, setValue] = useState(base);
  const [saved, setSaved] = useState(false);

  const apply = () => {
    const url = value.trim().replace(/\/+$/, "");
    if (!url) return;
    onApply(url);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="connection-settings">
      <div className="conn-status-line">
        <span className={`conn-dot ${status}`} />
        <span>
          {status === "online"
            ? "Connected to Luno"
            : status === "checking"
            ? "Checking connection…"
            : "Luno API not reachable"}
        </span>
      </div>
      <div className="conn-input-row">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="http://localhost:8787"
          spellCheck={false}
        />
        <button className="conn-apply" onClick={apply}>
          {saved ? "Saved" : "Connect"}
        </button>
      </div>
      <button
        className="conn-reset"
        onClick={() => {
          localStorage.removeItem("luno_api_base");
          onApply(window.location.origin);
          setValue(window.location.origin);
        }}
      >
        Reset to automatic discovery
      </button>
      <p className="conn-help">
        Tip: run <code>luno serve</code> on your computer, then connect the
        site to <code>http://localhost:8787</code>.
      </p>
    </div>
  );
}
