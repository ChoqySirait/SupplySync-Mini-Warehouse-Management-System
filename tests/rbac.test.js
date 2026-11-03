const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const app = require('../app');
const { generateToken } = require('../src/utils/security');

// Demo Tokens
const adminToken = generateToken({ user_id: 1, username: 'admin', role: 'ADMIN', facility_id: 1 });
const managerToken = generateToken({ user_id: 2, username: 'manager', role: 'MANAGER', facility_id: 1 });
const staffToken = generateToken({ user_id: 3, username: 'staff', role: 'STAFF', facility_id: 1 });
const staffSbyToken = generateToken({ user_id: 4, username: 'staff_sby', role: 'STAFF', facility_id: 2 });

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

    res.setHeader = (key, val) => { responseHeaders[key.toLowerCase()] = val; };
    res.getHeader = (key) => responseHeaders[key.toLowerCase()];
    res.status = (code) => { statusCode = code; return res; };
    res.writeHead = (code, headers) => {
        statusCode = code;
        if (headers) Object.assign(responseHeaders, headers);
        return res;
    };
    res.send = (data) => { responseBody = data; res.emit('finish'); return res; };
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

describe('Enterprise RBAC & Facility Scoping Verification Tests', () => {
    // 1. Unauthenticated Request Blocking
    test('1. Permintaan mutasi tanpa token autentikasi ditolak dengan status 401 Unauthorized', (t, done) => {
        const { req, res, getStatusCode, getBody } = createMockRequestResponse({
            method: 'DELETE',
            url: '/api/products/PRD-FEED-01'
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

    test('2. Permintaan inisiasi transfer tanpa token ditolak dengan status 401', (t, done) => {
        const { req, res, getStatusCode, getBody } = createMockRequestResponse({
            method: 'POST',
            url: '/api/transfers',
            body: { source_facility_id: 1, destination_facility_id: 2 }
        });

        res.on('finish', () => {
            assert.strictEqual(getStatusCode(), 401);
            const body = getBody();
            assert.strictEqual(body.status, 'Error');
            done();
        });

        app.handle(req, res);
    });

    // 2. STAFF Role Boundary Enforcement
    test('3. Role STAFF ditolak (403 Forbidden) saat mencoba menghapus master produk', (t, done) => {
        const { req, res, getStatusCode, getBody } = createMockRequestResponse({
            method: 'DELETE',
            url: '/api/products/PRD-FEED-01',
            headers: { authorization: `Bearer ${staffToken}` }
        });

        res.on('finish', () => {
            assert.strictEqual(getStatusCode(), 403);
            const body = getBody();
            assert.strictEqual(body.status, 'Error');
            assert.match(body.message, /Akses ditolak.*STAFF/i);
            done();
        });

        app.handle(req, res);
    });

    test('4. Role STAFF ditolak (403 Forbidden) saat mencoba membuat master produk baru', (t, done) => {
        const { req, res, getStatusCode, getBody } = createMockRequestResponse({
            method: 'POST',
            url: '/api/products',
            headers: { authorization: `Bearer ${staffToken}` },
            body: { product_id: 'PRD-NEW-01', product_name: 'Produk Baru', category: 'Pangan', unit: 'Pcs' }
        });

        res.on('finish', () => {
            assert.strictEqual(getStatusCode(), 403);
            const body = getBody();
            assert.strictEqual(body.status, 'Error');
            assert.match(body.message, /Akses ditolak.*STAFF/i);
            done();
        });

        app.handle(req, res);
    });

    test('5. Role STAFF ditolak (403 Forbidden) saat mencoba menginisiasi transfer antar-gudang', (t, done) => {
        const { req, res, getStatusCode, getBody } = createMockRequestResponse({
            method: 'POST',
            url: '/api/transfers',
            headers: { authorization: `Bearer ${staffToken}` },
            body: { source_facility_id: 1, destination_facility_id: 2 }
        });

        res.on('finish', () => {
            assert.strictEqual(getStatusCode(), 403);
            const body = getBody();
            assert.strictEqual(body.status, 'Error');
            assert.match(body.message, /Akses ditolak.*STAFF/i);
            done();
        });

        app.handle(req, res);
    });

    test('6. Role STAFF ditolak (403 Forbidden) saat mencoba mendaftarkan fasilitas gudang baru', (t, done) => {
        const { req, res, getStatusCode, getBody } = createMockRequestResponse({
            method: 'POST',
            url: '/api/facilities',
            headers: { authorization: `Bearer ${staffToken}` },
            body: { facility_code: 'WH-NEW-01', facility_name: 'Gudang Baru' }
        });

        res.on('finish', () => {
            assert.strictEqual(getStatusCode(), 403);
            const body = getBody();
            assert.strictEqual(body.status, 'Error');
            assert.match(body.message, /Akses ditolak.*STAFF/i);
            done();
        });

        app.handle(req, res);
    });

    test('7. Role STAFF ditolak (403 Forbidden) saat mencoba memicu pencadangan database sistem', (t, done) => {
        const { req, res, getStatusCode, getBody } = createMockRequestResponse({
            method: 'POST',
            url: '/api/system/backup',
            headers: { authorization: `Bearer ${staffToken}` }
        });

        res.on('finish', () => {
            assert.strictEqual(getStatusCode(), 403);
            const body = getBody();
            assert.strictEqual(body.status, 'Error');
            assert.match(body.message, /Akses ditolak.*STAFF/i);
            done();
        });

        app.handle(req, res);
    });

    // 3. Multi-Facility User Scoping Enforcement
    test('8. Scoping Fasilitas: STAFF Cakung (Fac 1) ditolak (403 Forbidden) saat mencoba operasi di fasilitas lain (Fac 2)', (t, done) => {
        const { req, res, getStatusCode, getBody } = createMockRequestResponse({
            method: 'POST',
            url: '/api/stock/in',
            headers: { authorization: `Bearer ${staffToken}` },
            body: {
                product_id: 'PRD-FEED-01',
                quantity: 20,
                expired_date: '2027-01-01',
                facility_id: 2 // Mencoba bypass ke Fasilitas Surabaya padahal akunnya ditugaskan di Jakarta Cakung
            }
        });

        res.on('finish', () => {
            assert.strictEqual(getStatusCode(), 403);
            const body = getBody();
            assert.strictEqual(body.status, 'Error');
            assert.match(body.message, /Akses ditolak.*fasilitas/i);
            done();
        });

        app.handle(req, res);
    });

    // 4. MANAGER Role Boundary Enforcement
    test('9. Role MANAGER ditolak (403 Forbidden) saat mencoba menghapus master produk (Hanya Admin)', (t, done) => {
        const { req, res, getStatusCode, getBody } = createMockRequestResponse({
            method: 'DELETE',
            url: '/api/products/PRD-FEED-01',
            headers: { authorization: `Bearer ${managerToken}` }
        });

        res.on('finish', () => {
            assert.strictEqual(getStatusCode(), 403);
            const body = getBody();
            assert.strictEqual(body.status, 'Error');
            assert.match(body.message, /Akses ditolak.*MANAGER.*ADMIN/i);
            done();
        });

        app.handle(req, res);
    });

    test('10. Role MANAGER ditolak (403 Forbidden) saat mencoba memicu pencadangan database', (t, done) => {
        const { req, res, getStatusCode, getBody } = createMockRequestResponse({
            method: 'POST',
            url: '/api/system/backup',
            headers: { authorization: `Bearer ${managerToken}` }
        });

        res.on('finish', () => {
            assert.strictEqual(getStatusCode(), 403);
            const body = getBody();
            assert.strictEqual(body.status, 'Error');
            assert.match(body.message, /Akses ditolak.*MANAGER.*ADMIN/i);
            done();
        });

        app.handle(req, res);
    });

    test('11. Role MANAGER diizinkan mengakses operasi manajemen produk (Validasi lolos ke validator)', (t, done) => {
        const { req, res, getStatusCode, getBody } = createMockRequestResponse({
            method: 'POST',
            url: '/api/products',
            headers: { authorization: `Bearer ${managerToken}` },
            body: { product_id: '', product_name: '' } // Input tidak valid lolos RBAC lalu ditangkap validator
        });

        res.on('finish', () => {
            // Membuktikan bahwa RBAC MANAGER lolos (bukan 401/403) dan masuk ke validasi input (400)
            assert.strictEqual(getStatusCode(), 400);
            const body = getBody();
            assert.strictEqual(body.status, 'Error');
            assert.match(body.message, /sku|id produk/i);
            done();
        });

        app.handle(req, res);
    });

    test('12. Role ADMIN memiliki izin eksekutif penuh pada seluruh operasi sistem', (t, done) => {
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
});
