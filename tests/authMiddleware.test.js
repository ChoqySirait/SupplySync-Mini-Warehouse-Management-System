const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { generateToken } = require('../src/utils/security');
const { authenticateToken, authorizeRole } = require('../src/middlewares/authMiddleware');

function createMockReqRes(headers = {}) {
    const req = { headers, query: {} };
    let status = 200;
    let body = null;
    let nextCalled = false;

    const res = {
        status(code) {
            status = code;
            return this;
        },
        json(data) {
            body = data;
            return this;
        }
    };

    const next = () => {
        nextCalled = true;
    };

    return { req, res, getStatus: () => status, getBody: () => body, isNextCalled: () => nextCalled };
}

describe('Auth Middleware & RBAC Tests', () => {
    test('1. authenticateToken berhasil jika Bearer token valid', () => {
        const token = generateToken({ user_id: 2, username: 'manager', role: 'MANAGER' });
        const { req, res, isNextCalled } = createMockReqRes({ authorization: `Bearer ${token}` });

        authenticateToken(req, res, () => {});
        assert.strictEqual(isNextCalled(), false); // Handled by inline callback or next
        assert.strictEqual(req.user.username, 'manager');
        assert.strictEqual(req.user.role, 'MANAGER');
    });

    test('2. authenticateToken ditolak status 401 jika header Authorization tidak ada', () => {
        const { req, res, getStatus, getBody } = createMockReqRes({});

        authenticateToken(req, res, () => {});
        assert.strictEqual(getStatus(), 401);
        assert.strictEqual(getBody().status, 'Error');
        assert.match(getBody().message, /tidak disertakan/i);
    });

    test('3. authorizeRole mengizinkan role yang sesuai', () => {
        const req = { user: { role: 'ADMIN' } };
        const res = {};
        let nextCalled = false;

        const middleware = authorizeRole('ADMIN', 'MANAGER');
        middleware(req, res, () => { nextCalled = true; });

        assert.strictEqual(nextCalled, true);
    });

    test('4. authorizeRole menolak dengan status 403 Forbidden jika role tidak memiliki izin', () => {
        const req = { user: { role: 'STAFF' } };
        let status = 200;
        let body = null;
        const res = {
            status(code) { status = code; return this; },
            json(data) { body = data; return this; }
        };

        const middleware = authorizeRole('ADMIN');
        middleware(req, res, () => {});

        assert.strictEqual(status, 403);
        assert.strictEqual(body.status, 'Error');
        assert.match(body.message, /Akses ditolak/i);
    });
});
