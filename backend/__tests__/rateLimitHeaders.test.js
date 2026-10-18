/**
 * __tests__/rateLimitHeaders.test.js
 *
 * Verifies the rate limiters wired up in src/server.js (Issue #1778):
 * the global limiter and the per-route limiter on /api/invitations must emit
 * only the standard IETF `RateLimit-*` headers and must no longer send the
 * deprecated `X-RateLimit-*` set (`legacyHeaders: false`).
 */
"use strict";

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock("../src/db/pool", () => ({
  query: jest.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] }),
  connect: jest.fn().mockResolvedValue({
    query: jest.fn().mockResolvedValue({ rows: [] }),
    release: jest.fn(),
  }),
  getPoolStats: jest.fn().mockReturnValue({}),
}));

jest.mock("../src/services/cacheService", () => ({
  ping: jest.fn().mockResolvedValue("up"),
  get: jest.fn(),
  set: jest.fn(),
}));

// /health also verifies the Soroban RPC endpoint; stub it the same way
// __tests__/health.test.js does so the suite stays hermetic.
jest.mock("../src/services/sorobanClient", () => ({
  getServer: jest.fn(() => ({
    getLatestLedger: jest.fn().mockResolvedValue({ sequence: 123 }),
  })),
}));

// Horizon is only dialled by the indexer, which never starts under NODE_ENV=test,
// but /health exercises the ledger lookup path.
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: jest.fn().mockResolvedValue({ _embedded: { records: [{ sequence: 123 }] } }),
});

const request = require("supertest");
const app = require("../src/server");

function expectNoLegacyHeaders(res) {
  expect(res.headers["x-ratelimit-limit"]).toBeUndefined();
  expect(res.headers["x-ratelimit-remaining"]).toBeUndefined();
  expect(res.headers["x-ratelimit-reset"]).toBeUndefined();
}

describe("server.js rate limit headers (Issue #1778)", () => {
  it("global limiter sends standard RateLimit-* headers only", async () => {
    // /api/indexer/health has no per-route limiter, so the response carries
    // the global limiter's own values (the /health route mounts a 120/min
    // limiter of its own that would overwrite them).
    const res = await request(app).get("/api/indexer/health");

    expect(res.status).toBe(200);
    expect(res.headers).toHaveProperty("ratelimit-policy");
    expect(res.headers).toHaveProperty("ratelimit-limit");
    expect(res.headers).toHaveProperty("ratelimit-remaining");
    expect(res.headers).toHaveProperty("ratelimit-reset");
    expect(res.headers["ratelimit-limit"]).toBe("150");
    expectNoLegacyHeaders(res);
  });

  it("per-route invitations limiter sends standard RateLimit-* headers only", async () => {
    const res = await request(app).get("/api/invitations");

    // The route limiter runs before the invitation router (which may answer
    // 401/404 depending on auth); the headers are what matter here.
    expect(res.headers["ratelimit-limit"]).toBe("20");
    expect(res.headers).toHaveProperty("ratelimit-remaining");
    expect(res.headers).toHaveProperty("ratelimit-reset");
    expectNoLegacyHeaders(res);
  });

  it("returns 429 with standard headers only once the invitations limit is exceeded", async () => {
    // The mount-level limiter allows 20 requests/minute; walk past the ceiling
    // (the exact count already consumed by earlier tests in this file is unknown).
    let res;
    for (let i = 0; i < 25; i += 1) {
      res = await request(app).get("/api/invitations");
      if (res.status === 429) break;
    }

    expect(res.status).toBe(429);
    expect(res.headers).toHaveProperty("retry-after");
    expect(res.headers["ratelimit-limit"]).toBe("20");
    expect(res.headers["ratelimit-remaining"]).toBe("0");
    expect(res.headers).toHaveProperty("ratelimit-reset");
    expectNoLegacyHeaders(res);
  });
});
