import {
  RATE_LIMIT_WARNING_EVENT,
  getRateLimitInfo,
  shouldWarnAboutRateLimit,
  maybeDispatchRateLimitWarning,
} from "@/lib/api/client";

/**
 * The API client reads the standard IETF `RateLimit-*` headers sent by the
 * backend (`standardHeaders: true`) and deliberately ignores the deprecated
 * `X-RateLimit-*` set (`legacyHeaders: false`, Issue #1778).
 */
describe("standard RateLimit-* header handling", () => {
  it("parses the standard RateLimit-Limit / RateLimit-Remaining headers", () => {
    expect(
      getRateLimitInfo({ "ratelimit-limit": "150", "ratelimit-remaining": "3" }),
    ).toEqual({ limit: 150, remaining: 3 });
  });

  it("ignores the deprecated X-RateLimit-* headers", () => {
    expect(
      getRateLimitInfo({ "x-ratelimit-limit": "150", "x-ratelimit-remaining": "1" }),
    ).toBeNull();
    // Even when a legacy header sits next to one standard header, the legacy
    // pair must never be used to build the info.
    expect(
      getRateLimitInfo({ "x-ratelimit-limit": "150", "ratelimit-remaining": "1" }),
    ).toBeNull();
  });

  it("returns null for missing or malformed headers", () => {
    expect(getRateLimitInfo(undefined)).toBeNull();
    expect(getRateLimitInfo(null)).toBeNull();
    expect(getRateLimitInfo("ratelimit-remaining: 1")).toBeNull();
    expect(getRateLimitInfo({})).toBeNull();
    expect(
      getRateLimitInfo({ "ratelimit-limit": "not-a-number", "ratelimit-remaining": "1" }),
    ).toBeNull();
    expect(
      getRateLimitInfo({ "ratelimit-limit": "150", "ratelimit-remaining": "soon" }),
    ).toBeNull();
    expect(
      getRateLimitInfo({ "ratelimit-limit": "0", "ratelimit-remaining": "0" }),
    ).toBeNull();
  });

  it("warns only when 10% or less of the bucket remains", () => {
    expect(shouldWarnAboutRateLimit({ limit: 20, remaining: 3 })).toBe(false);
    expect(shouldWarnAboutRateLimit({ limit: 20, remaining: 2 })).toBe(true);
    expect(shouldWarnAboutRateLimit({ limit: 150, remaining: 16 })).toBe(false);
    expect(shouldWarnAboutRateLimit({ limit: 150, remaining: 15 })).toBe(true);
    // Threshold never drops below a single request.
    expect(shouldWarnAboutRateLimit({ limit: 5, remaining: 1 })).toBe(true);
    expect(shouldWarnAboutRateLimit({ limit: 5, remaining: 0 })).toBe(true);
  });

  describe("maybeDispatchRateLimitWarning", () => {
    let listener: jest.Mock;

    beforeEach(() => {
      listener = jest.fn();
      window.addEventListener(RATE_LIMIT_WARNING_EVENT, listener);
    });

    afterEach(() => {
      window.removeEventListener(RATE_LIMIT_WARNING_EVENT, listener);
    });

    it("dispatches ratelimit-warning when the standard headers report exhaustion", () => {
      const dispatched = maybeDispatchRateLimitWarning({
        "ratelimit-policy": "20;w=60",
        "ratelimit-limit": "20",
        "ratelimit-remaining": "1",
        "ratelimit-reset": "42",
      });

      expect(dispatched).toBe(true);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].type).toBe(RATE_LIMIT_WARNING_EVENT);
    });

    it("does not dispatch while plenty of quota remains", () => {
      const dispatched = maybeDispatchRateLimitWarning({
        "ratelimit-limit": "150",
        "ratelimit-remaining": "140",
      });

      expect(dispatched).toBe(false);
      expect(listener).not.toHaveBeenCalled();
    });

    it("never dispatches based on the deprecated X-RateLimit-* headers alone", () => {
      const dispatched = maybeDispatchRateLimitWarning({
        "x-ratelimit-limit": "20",
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": "42",
      });

      expect(dispatched).toBe(false);
      expect(listener).not.toHaveBeenCalled();
    });

    it("does not dispatch when headers are absent", () => {
      expect(maybeDispatchRateLimitWarning(undefined)).toBe(false);
      expect(maybeDispatchRateLimitWarning({})).toBe(false);
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
