#!/usr/bin/env node
// Cross-platform vault bootstrap core. Called by SETUP-KK-UI-DESIGN-VAULT.ps1 (Windows) and
// setup-kk-ui-design-vault.sh (Linux/macOS/cloud). Node >= 18 is the only prerequisite.
import path from 'node:path';
import { setupVault, verifyVault, DEFAULT_MANIFEST, DEFAULT_VAULT_DIR } from '../src/vault/index.js';
import { Logger } from '../src/core/logger.js';

const args = process.argv.slice(2);
const get = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const flag = (k) => args.includes(k);

const logger = new Logger({ level: flag('--verbose') ? 'debug' : 'info', prefix: 'vault' });
const manifestPath = path.resolve(get('--manifest', DEFAULT_MANIFEST));
const vaultDir = path.resolve(get('--vault-dir', DEFAULT_VAULT_DIR));

try {
  if (flag('--verify-only')) {
    const v = await verifyVault(vaultDir);
    console.log(JSON.stringify(v, null, 2));
    process.exit(v.ok ? 0 : 1);
  }
  const report = await setupVault({ manifestPath, vaultDir, offline: flag('--offline'), logger });
  const v = await verifyVault(vaultDir);
  console.log(JSON.stringify({ setup: { complete: report.complete, assetsHarvested: report.assetsHarvested, assetsRequested: report.assetsRequested, filesWritten: report.filesWritten, errors: report.errors.length }, verify: { ok: v.ok, assets: v.assets, problems: v.problems.length } }, null, 2));
  process.exit(report.complete && v.ok ? 0 : 1);
} catch (err) {
  logger.error(String(err.stack || err));
  process.exit(1);
}
