import { useEffect } from "react";
import { RATE_LIMIT_WARNING_EVENT } from "@/lib/api/client";
import { useToast } from "./Toast";

/**
 * Listens for the `ratelimit-warning` event dispatched by the API client when
 * a response's standard `RateLimit-*` headers (not the deprecated
 * `X-RateLimit-*` set) report the bucket is nearly exhausted, and surfaces a
 * throttled toast so users know to slow down.
 */
export default function RateLimitWatcher() {
  const toast = useToast();

  useEffect(() => {
    let lastShown = 0;
    const handleWarning = () => {
      const now = Date.now();
      if (now - lastShown > 5000) {
        toast.info("Slowing down... API rate limit approaching.");
        lastShown = now;
      }
    };

    window.addEventListener(RATE_LIMIT_WARNING_EVENT, handleWarning);
    return () => {
      window.removeEventListener(RATE_LIMIT_WARNING_EVENT, handleWarning);
    };
  }, [toast]);

  return null;
}
