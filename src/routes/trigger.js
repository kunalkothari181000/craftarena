import { config } from '../config/env.js';
import { runPriceAndStockSync } from '../jobs/syncPrices.js';
import { runCatalogueSync } from '../jobs/syncCatalogue.js';

let isSyncRunning = false;

export async function handleTriggerSync(req, res) {
  const token = req.query.token || req.headers['x-sync-token'] || req.body?.token;
  const mode = req.query.mode || req.body?.mode || 'prices';

  if (!token || token !== config.syncTriggerToken) {
    return res.status(403).json({ error: 'Unauthorized: Invalid or missing sync trigger token' });
  }

  if (isSyncRunning) {
    return res.status(429).json({ message: 'A sync job is already in progress. Please wait for it to complete.' });
  }

  isSyncRunning = true;

  try {
    console.log(`[Manual Trigger] Initiated sync in mode: "${mode}"...`);

    let result;
    if (mode === 'catalogue') {
      result = await runCatalogueSync();
    } else {
      result = await runPriceAndStockSync();
    }

    return res.status(200).json({
      success: true,
      message: `Sync in mode "${mode}" completed successfully.`,
      result
    });
  } catch (err) {
    console.error(`[Manual Trigger Error]:`, err);
    return res.status(500).json({ success: false, error: err.message });
  } finally {
    isSyncRunning = false;
  }
}

