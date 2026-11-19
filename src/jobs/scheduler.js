import cron from 'node-cron';
import { config } from '../config/env.js';
import { runPriceAndStockSync } from './syncPrices.js';
import { runCatalogueSync } from './syncCatalogue.js';

export function startScheduler() {
  console.log(`[Scheduler] Initializing automated background jobs...`);
  console.log(`[Scheduler] Gold Price & Stock Sync: "${config.cron.priceSync}"`);
  console.log(`[Scheduler] Full Catalogue Sync:      "${config.cron.catalogueSync}"`);

  // Gold price delta update
  cron.schedule(config.cron.priceSync, async () => {
    console.log(`\n[Cron Triggered] Running scheduled Gold Price Sync...`);
    try {
      await runPriceAndStockSync();
    } catch (err) {
      console.error(`[Cron Error in Price Sync]:`, err);
    }
  });

  // Nightly full catalogue sync
  cron.schedule(config.cron.catalogueSync, async () => {
    console.log(`\n[Cron Triggered] Running scheduled Full Catalogue Sync...`);
    try {
      await runCatalogueSync();
    } catch (err) {
      console.error(`[Cron Error in Catalogue Sync]:`, err);
    }
  });

  console.log(`[Scheduler] Background jobs scheduled successfully.`);
}

