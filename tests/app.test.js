const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const app = require('../app');
const { generateToken } = require('../src/utils/security');

const adminToken = generateToken({ user_id: 1, username: 'admin', role: 'ADMIN', facility_id: 1 });

function createMockRequestResponse({ method = 'GET', url = '/', body = {}, headers = {} }) {
    const req = new EventEmitter();
    req.method = method;
    req.url = url;
    req.originalUrl = url;
    req.headers = { 'content-type': 'application/json', ...headers };
    req.body = body;

    const res = new EventEmitter();
    let statusCode = 200;
    const responseHeaders = {};
    let responseBody = '';

    res.setHeader = (key, val) => {
        responseHeaders[key.toLowerCase()] = val;
    };
    res.getHeader = (key) => responseHeaders[key.toLowerCase()];
    res.status = (code) => {
        statusCode = code;
        return res;
    };
    res.writeHead = (code, headers) => {
        statusCode = code;
        if (headers) Object.assign(responseHeaders, headers);
        return res;
    };
    res.send = (data) => {
        responseBody = data;
        res.emit('finish');
        return res;
    };
    res.json = (data) => {
        responseHeaders['content-type'] = 'application/json';
        responseBody = JSON.stringify(data);
        res.emit('finish');
        return res;
    };
    res.end = (chunk) => {
        if (chunk) responseBody = chunk.toString();
        res.emit('finish');
    };

    return {
        req,
        res,
        getStatusCode: () => statusCode,
        getHeader: (k) => responseHeaders[k.toLowerCase()],
        getBody: () => {
            try { return JSON.parse(responseBody); } catch { return responseBody; }
        }
    };
}

describe('Express In-Memory Routing & Security Tests (Zero Network Sockets)', () => {
    test('1. Security Headers terpasang pada middleware', (t, done) => {
        const { req, res, getHeader } = createMockRequestResponse({ method: 'GET', url: '/api/test' });

        res.on('finish', () => {
            assert.strictEqual(getHeader('x-content-type-options'), 'nosniff');
            assert.strictEqual(getHeader('x-frame-options'), 'DENY');
            assert.strictEqual(getHeader('x-xss-protection'), '1; mode=block');
            done();
        });

        app.handle(req, res);
    });

    test('2. Endpoint API 404 handler mengembalikan JSON format standar', (t, done) => {
        const { req, res, getStatusCode, getBody } = createMockRequestResponse({
            method: 'GET',
            url: '/api/nonexistent-route-xyz'
        });

        res.on('finish', () => {
            assert.strictEqual(getStatusCode(), 404);
            const body = getBody();
            assert.strictEqual(body.status, 'Error');
            assert.match(body.message, /tidak ditemukan/i);
            done();
        });

        app.handle(req, res);
    });

    test('3. Validasi gagal pada POST /api/products mengembalikan status 400', (t, done) => {
        const { req, res, getStatusCode, getBody } = createMockRequestResponse({
            method: 'POST',
            url: '/api/products',
            headers: { authorization: `Bearer ${adminToken}` },
            body: { product_id: '', product_name: '' }
        });

        res.on('finish', () => {
            assert.strictEqual(getStatusCode(), 400);
            const body = getBody();
            assert.strictEqual(body.status, 'Error');
            done();
        });

        app.handle(req, res);
    });

    test('4. Validasi gagal pada POST /api/stock/in dengan quantity negatif', (t, done) => {
        const { req, res, getStatusCode, getBody } = createMockRequestResponse({
            method: 'POST',
            url: '/api/stock/in',
            headers: { authorization: `Bearer ${adminToken}` },
            body: { product_id: 'PRD-01', quantity: -10, expired_date: '2026-12-31' }
        });

        res.on('finish', () => {
            assert.strictEqual(getStatusCode(), 400);
            const body = getBody();
            assert.strictEqual(body.status, 'Error');
            assert.match(body.message, /quantity/i);
            done();
        });

        app.handle(req, res);
    });

    test('5. Endpoint GET /api/system/backups merespons dengan daftar berkas', (t, done) => {
        const { req, res, getStatusCode, getBody } = createMockRequestResponse({
            method: 'GET',
            url: '/api/system/backups',
            headers: { authorization: `Bearer ${adminToken}` }
        });

        res.on('finish', () => {
            assert.strictEqual(getStatusCode(), 200);
            const body = getBody();
            assert.strictEqual(body.status, 'Success');
            assert.ok(Array.isArray(body.data.backups));
            done();
        });

        app.handle(req, res);
    });

    test('6. Akses mutasi tanpa token autentikasi ditolak status 401', (t, done) => {
        const { req, res, getStatusCode, getBody } = createMockRequestResponse({
            method: 'POST',
            url: '/api/products',
            body: { product_id: 'PRD-TEST', product_name: 'Test Product' }
        });

        res.on('finish', () => {
            assert.strictEqual(getStatusCode(), 401);
            const body = getBody();
            assert.strictEqual(body.status, 'Error');
            assert.match(body.message, /token/i);
            done();
        });

        app.handle(req, res);
    });
});
