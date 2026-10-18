const request = require('supertest');
const express = require('express');
const rateLimit = require('express-rate-limit');

jest.mock('../db/pool', () => ({
  query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
  getPoolStats: jest.fn().mockReturnValue({}),
}));jest.mock('../services/cacheService', () => ({
    ping: jest.fn().mockResolvedValue('up'),
}));

// /health also verifies the Soroban RPC endpoint; keep the suite hermetic by
// stubbing it the same way __tests__/health.test.js does.
jest.mock('../services/sorobanClient', () => ({
    getServer: jest.fn(() => ({ getLatestLedger: jest.fn().mockResolvedValue({ sequence: 123 }) })),
}));

global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: jest.fn().mockResolvedValue({ _embedded: { records: [{ sequence: 123 }] } }),
});

// Import route modules that use the rate limiter internally
const healthRoutes = require('../routes/health');
const verificationRoutes = require('../routes/verification');

describe('Rate limit headers - integration', () => {
    let app;

    beforeEach(() => {
        app = express();
        app.use(express.json());

        // Also apply a global rate limiter (matches server.js) so headers are present
        app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 150, standardHeaders: true, legacyHeaders: false }));

        app.use('/health', healthRoutes);
        app.use('/api/verification', verificationRoutes);
    });

    it('returns standard RateLimit-* headers for health endpoint', async () => {
        const res = await request(app).get('/health');

        expect(res.status).toBe(200);
        expect(res.headers).toHaveProperty('ratelimit-policy');
        expect(res.headers).toHaveProperty('ratelimit-limit');
        expect(res.headers).toHaveProperty('ratelimit-remaining');
        expect(res.headers).toHaveProperty('ratelimit-reset');
        expect(res.headers['x-ratelimit-limit']).toBeUndefined();
        expect(res.headers['x-ratelimit-remaining']).toBeUndefined();
        expect(res.headers['x-ratelimit-reset']).toBeUndefined();
    });

    it('returns standard RateLimit-* headers for verification POST endpoint', async () => {
        const res = await request(app)
            .post('/api/verification/email')
            .send({ email: 'test@example.com', publicKey: 'GTESTPUBLICKEY' });

        expect(res.status).toBe(200);
        expect(res.headers).toHaveProperty('ratelimit-policy');
        expect(res.headers).toHaveProperty('ratelimit-limit');
        expect(res.headers).toHaveProperty('ratelimit-remaining');
        expect(res.headers).toHaveProperty('ratelimit-reset');
        expect(res.headers['x-ratelimit-limit']).toBeUndefined();
        expect(res.headers['x-ratelimit-remaining']).toBeUndefined();
        expect(res.headers['x-ratelimit-reset']).toBeUndefined();
    });
});
