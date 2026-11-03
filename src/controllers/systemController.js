const path = require('path');
const fs = require('fs');
const backupService = require('../utils/backupService');

/**
 * SupplySync WMS - System Diagnostics, Integrity Verification & Automated Backup Controller
 */

/**
 * 1. Periksa Integritas Data & Kesehatan Sistem Gudang
 * GET /api/system/health-check
 */
exports.getHealthAndIntegrity = async (req, res) => {
    try {
        const integrityResult = await backupService.verifyDataIntegrity();
        
        return res.json({
            status: 'Success',
            message: 'Pemeriksaan integritas referensial dan kesehatan data berhasil diselesaikan.',
            data: {
                ...integrityResult,
                system_uptime_seconds: Math.floor(process.uptime()),
                memory_usage_mb: (process.memoryUsage().rss / (1024 * 1024)).toFixed(2),
                environment: process.env.NODE_ENV || 'development'
            }
        });
    } catch (error) {
        console.error('❌ Error getHealthAndIntegrity:', error.message);
        return res.status(500).json({
            status: 'Error',
            message: `Gagal menjalankan pemeriksaan integritas data: ${error.message}`
        });
    }
};

/**
 * 2. Eksekusi Pencadangan Database Baru (JSON Snapshot & SQL Dump)
 * POST /api/system/backup
 */
exports.createBackup = async (req, res) => {
    try {
        const backupResult = await backupService.createDatabaseBackup();

        return res.status(201).json({
            status: 'Success',
            message: 'Cadangan database WMS berhasil dibuat dan disimpan dengan aman.',
            data: backupResult
        });
    } catch (error) {
        console.error('❌ Error createBackup:', error.message);
        return res.status(500).json({
            status: 'Error',
            message: `Gagal membuat cadangan database: ${error.message}`
        });
    }
};

/**
 * 3. Ambil Daftar Berkas Cadangan Tersedia
 * GET /api/system/backups
 */
exports.getBackupsList = async (req, res) => {
    try {
        const backups = backupService.listBackups();

        return res.json({
            status: 'Success',
            data: {
                total_backups: backups.length,
                backups
            }
        });
    } catch (error) {
        console.error('❌ Error getBackupsList:', error.message);
        return res.status(500).json({
            status: 'Error',
            message: `Gagal membaca daftar cadangan: ${error.message}`
        });
    }
};

/**
 * 4. Unduh Berkas Cadangan Spesifik (Aman dari Path Traversal)
 * GET /api/system/backups/:filename
 */
exports.downloadBackupFile = async (req, res) => {
    try {
        const filename = req.params.filename;

        // Cegah Directory Traversal Attack
        const safeFilename = path.basename(filename);
        if (safeFilename !== filename || (!safeFilename.endsWith('.json') && !safeFilename.endsWith('.sql'))) {
            return res.status(400).json({
                status: 'Error',
                message: 'Nama berkas tidak valid atau format tidak diizinkan.'
            });
        }

        const filePath = path.join(backupService.DEFAULT_BACKUP_DIR, safeFilename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                status: 'Error',
                message: 'Berkas cadangan tidak ditemukan di server.'
            });
        }

        return res.download(filePath, safeFilename);
    } catch (error) {
        console.error('❌ Error downloadBackupFile:', error.message);
        return res.status(500).json({
            status: 'Error',
            message: `Gagal mengunduh berkas cadangan: ${error.message}`
        });
    }
};
