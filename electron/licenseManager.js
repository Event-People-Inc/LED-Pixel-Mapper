'use strict';

const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

// Product ID (from Gumroad product edit page source)
const _PID = 'hp70sfV_tYWNK7cf2mKjFw==';

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

// Lazy-access app so we never touch it before Electron's ready event
const getApp      = () => require('electron').app;
const cacheFile   = () => path.join(getApp().getPath('userData'), 'license.json');
const machineFile = () => path.join(getApp().getPath('userData'), 'machine.json');

// ── Cache ─────────────────────────────────────────────────────────────────────

function loadCache() {
  try { return JSON.parse(fs.readFileSync(cacheFile(), 'utf8')); } catch { return null; }
}

function saveCache(data) {
  fs.writeFileSync(cacheFile(), JSON.stringify(data, null, 2), 'utf8');
}

// ── Machine identity ──────────────────────────────────────────────────────────

function getMachineId() {
  const file = machineFile();
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (data.machineId) return data.machineId;
  } catch {}
  const id = crypto.randomUUID();
  fs.writeFileSync(file, JSON.stringify({ machineId: id }), 'utf8');
  return id;
}

// ── Gumroad API ───────────────────────────────────────────────────────────────

function verifyWithGumroad(licenseKey, incrementUses) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      product_id:           _PID,
      license_key:          licenseKey,
      increment_uses_count: String(incrementUses),
    }).toString();

    const req = https.request(
      {
        hostname: 'api.gumroad.com',
        path:     '/v2/licenses/verify',
        method:   'POST',
        headers: {
          'Content-Type':   'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 8000,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try { resolve(JSON.parse(raw)); }
          catch { reject(new Error('Invalid JSON from Gumroad')); }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

// ── Status ────────────────────────────────────────────────────────────────────

let _status = 'free'; // 'free' | 'pro' | 'overdue' | 'invalid'

function getStatus() { return _status; }

// ── Activation ────────────────────────────────────────────────────────────────

async function activate(licenseKey) {
  const key       = (licenseKey ?? '').trim().toUpperCase();
  const machineId = getMachineId();
  const cache     = loadCache();

  // Already activated on this machine — re-verify without incrementing uses
  if (cache?.licenseKey === key && cache?.machineId === machineId) {
    try {
      const resp = await verifyWithGumroad(key, false);
      if (resp.success) {
        saveCache({ licenseKey: key, machineId, lastVerified: Date.now() });
        _status = 'pro';
        return { success: true, message: '✓ License activated! Welcome to Pro.' };
      }
      _status = 'invalid';
      return { success: false, message: '✗ License has been revoked or is no longer valid.' };
    } catch {
      return { success: false, message: 'Could not reach server. Check your internet connection.' };
    }
  }

  // New activation on this machine — first verify WITHOUT incrementing to check current uses
  try {
    const check = await verifyWithGumroad(key, false);
    if (!check.success) {
      _status = 'invalid';
      const detail = check.message ? ` (${check.message})` : '';
      return { success: false, message: `✗ License key not found or invalid.${detail}` };
    }
    if (check.uses >= 2) {
      _status = 'invalid';
      return { success: false, message: `✗ This key is already activated on ${check.uses} machine${check.uses === 1 ? '' : 's'} (limit: 2). Please contact support to reset it.` };
    }
    // Key is valid and has capacity — now increment
    const resp = await verifyWithGumroad(key, true);
    if (!resp.success) {
      _status = 'invalid';
      return { success: false, message: '✗ Activation failed. Please try again.' };
    }
    saveCache({ licenseKey: key, machineId, lastVerified: Date.now() });
    _status = 'pro';
    return { success: true, message: '✓ License activated! Welcome to Pro.' };
  } catch {
    return { success: false, message: 'Could not reach server. Check your internet connection.' };
  }
}

// ── Periodic re-verify ────────────────────────────────────────────────────────

async function periodicCheck() {
  const cache = loadCache();
  if (!cache?.licenseKey) {
    _status = 'free';
    return 'free';
  }

  const now = Date.now();

  // Verified within the last 30 days — no API call needed
  if (cache.lastVerified && (now - cache.lastVerified) < THIRTY_DAYS) {
    _status = 'pro';
    return 'pro';
  }

  // Overdue — try to re-verify silently
  try {
    const resp = await verifyWithGumroad(cache.licenseKey, false);
    if (resp.success) {
      saveCache({ ...cache, lastVerified: now });
      _status = 'pro';
      return 'pro';
    }
    _status = 'invalid';
    return 'invalid';
  } catch {
    // Network error — grace mode: app still fully functional
    _status = 'overdue';
    return 'overdue';
  }
}

module.exports = { getStatus, activate, periodicCheck };
