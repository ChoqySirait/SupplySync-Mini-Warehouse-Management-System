const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { generateToken } = require('../src/utils/security');
const { authenticateToken, optionalAuth, authorizeRole, requireFacilityScope } = require('../src/middlewares/authMiddleware');

function createMockReqRes(headers = {}, body = {}, query = {}) {
    const req = { headers, body, query };
    let status = 200;
    let responseBody = null;
    let nextCalled = false;

    const res = {
        status(code) {
            status = code;
            return this;
        },
        json(data) {
            responseBody = data;
            return this;
        }
    };

    const next = () => {
        nextCalled = true;
    };

    return { req, res, next, getStatus: () => status, getBody: () => responseBody, isNextCalled: () => nextCalled };
}

describe('Auth Middleware & RBAC Tests', () => {
    test('1. authenticateToken berhasil jika Bearer token valid', () => {
        const token = generateToken({ user_id: 2, username: 'manager', role: 'MANAGER', facility_id: 1 });
        const { req, res, next, isNextCalled } = createMockReqRes({ authorization: `Bearer ${token}` });

        authenticateToken(req, res, next);
        assert.strictEqual(isNextCalled(), true);
        assert.strictEqual(req.user.username, 'manager');
        assert.strictEqual(req.user.role, 'MANAGER');
    });

    test('2. authenticateToken ditolak status 401 jika header Authorization tidak ada', () => {
        const { req, res, next, getStatus, getBody, isNextCalled } = createMockReqRes({});

        authenticateToken(req, res, next);
        assert.strictEqual(isNextCalled(), false);
        assert.strictEqual(getStatus(), 401);
        assert.strictEqual(getBody().status, 'Error');
        assert.match(getBody().message, /tidak disertakan/i);
    });

    test('3. optionalAuth tidak memberikan elevasi admin jika token kosong', () => {
        const { req, res, next, isNextCalled } = createMockReqRes({});

        optionalAuth(req, res, next);
        assert.strictEqual(isNextCalled(), true);
        assert.strictEqual(req.user, null);
    });

    test('4. authorizeRole mengizinkan role yang sesuai', () => {
        const req = { user: { role: 'ADMIN' } };
        const res = {};
        let nextCalled = false;

        const middleware = authorizeRole('ADMIN', 'MANAGER');
        middleware(req, res, () => { nextCalled = true; });

        assert.strictEqual(nextCalled, true);
    });

    test('5. authorizeRole menolak dengan status 403 Forbidden jika role tidak memiliki izin', () => {
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

    test('6. requireFacilityScope mengizinkan STAFF mengakses fasilitas sendiri', async () => {
        const { req, res, next, isNextCalled } = createMockReqRes(
            {}, 
            { facility_id: 1, quantity: 10 }
        );
        req.user = { user_id: 3, role: 'STAFF', facility_id: 1 };

        const middleware = requireFacilityScope();
        await middleware(req, res, next);

        assert.strictEqual(isNextCalled(), true);
    });

    test('7. requireFacilityScope menolak STAFF yang mencoba operasi di fasilitas lain (Status 403)', async () => {
        const { req, res, next, getStatus, getBody, isNextCalled } = createMockReqRes(
            {}, 
            { facility_id: 2, quantity: 10 }
        );
        req.user = { user_id: 3, role: 'STAFF', facility_id: 1 };

        const middleware = requireFacilityScope();
        await middleware(req, res, next);

        assert.strictEqual(isNextCalled(), false);
        assert.strictEqual(getStatus(), 403);
        assert.strictEqual(getBody().status, 'Error');
        assert.match(getBody().message, /Akses ditolak.*fasilitas/i);
    });

    test('8. requireFacilityScope memberikan izin multi-fasilitas (Cross-Facility) bagi ADMIN dan MANAGER', async () => {
        const { req, res, next, isNextCalled } = createMockReqRes(
            {}, 
            { facility_id: 2, quantity: 50 }
        );
        req.user = { user_id: 2, role: 'MANAGER', facility_id: 1 };

        const middleware = requireFacilityScope();
        await middleware(req, res, next);

        assert.strictEqual(isNextCalled(), true);
    });
});
