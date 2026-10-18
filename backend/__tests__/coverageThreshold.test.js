/**
 * __tests__/coverageThreshold.test.js
 *
 * Guards the coverage gate added for Issue #1807: backend/package.json must
 * keep a global `coverageThreshold` so `jest --coverage` — locally and in the
 * CI backend job — fails when coverage silently decays while the README badge
 * keeps claiming a high number.
 */
"use strict";

const pkg = require("../package.json");

describe("Jest coverage gate configuration (Issue #1807)", () => {
  const threshold = pkg.jest && pkg.jest.coverageThreshold;

  it("declares a global coverageThreshold in backend/package.json", () => {
    expect(threshold).toBeDefined();
    expect(threshold.global).toBeDefined();
  });

  it("enforces statements and branches globally (plus functions and lines)", () => {
    for (const metric of ["statements", "branches", "functions", "lines"]) {
      expect(typeof threshold.global[metric]).toBe("number");
      expect(threshold.global[metric]).toBeGreaterThan(0);
      expect(threshold.global[metric]).toBeLessThanOrEqual(100);
    }
  });

  it("keeps the floor achievable so the gate can be ratcheted upward over time", () => {
    // Measured full-suite coverage (2026-10): statements 68.64%,
    // branches 62.50%, functions 74.75%, lines 70.45%. Aspirational floors
    // would make CI permanently red and get bypassed; see README Testing.
    for (const value of Object.values(threshold.global)) {
      expect(value).toBeLessThan(90);
    }
  });

  it("collects coverage from real service modules", () => {
    const from = pkg.jest.collectCoverageFrom;
    expect(Array.isArray(from)).toBe(true);
    expect(from.length).toBeGreaterThan(0);
    for (const pattern of from) {
      expect(pattern).toMatch(/^src\/.+\.js$/);
    }
  });

  it("runs the unit suite with --coverage via `npm test`", () => {
    expect(pkg.scripts.test).toContain("--coverage");
  });
});
