import { useCallback, useEffect, useState } from "react";
import { apiBase, discoverApiBase, setApiBase } from "../lib/api";

export type ApiStatus = "checking" | "online" | "offline";

/**
 * Ping the Luno API's /health endpoint to know whether the browser can
 * actually reach the model. First attempts automatic discovery (which knows
 * how to find a local `luno serve` from a GitHub-Pages-hosted UI), then
 * falls back to the configured base.
 */
export function useApiStatus() {
  const [status, setStatus] = useState<ApiStatus>("checking");
  const [base, setBase] = useState<string>(apiBase());
  const [checked, setChecked] = useState(false);

  const ping = useCallback(async (baseUrl: string): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(`${baseUrl}/health`, { signal: controller.signal });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  const check = useCallback(async () => {
    setStatus("checking");
    setChecked(false);

    let ok = await ping(base);
    if (!ok) {
      const discovered = await discoverApiBase();
      if (discovered && discovered !== base) {
        setBase(discovered);
        ok = await ping(discovered);
      }
    }
    setStatus(ok ? "online" : "offline");
    setChecked(true);
  }, [base, ping]);

  useEffect(() => {
    check();
  }, [check]);

  const refresh = useCallback(
    (baseUrl: string) => {
      localStorage.setItem("luno_api_base", baseUrl);
      setApiBase(baseUrl);
      setBase(baseUrl);
      setStatus("checking");
      setChecked(false);
      check();
    },
    [check]
  );

  return { status, base, refresh, checked };
}
