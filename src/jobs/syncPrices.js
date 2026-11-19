import { fetchOptigoProducts } from '../services/optigoClient.js';
import { groupProductsByDesign } from '../services/productGrouper.js';
import { findPriceAndStockDiffs, persistVariantSync } from '../services/priceDiffEngine.js';
import { bulkUpdateVariantPrices } from '../services/shopifyClient.js';
import { config } from '../config/env.js';
import db from '../db/database.js';

export async function runPriceAndStockSync() {
  const startTime = Date.now();
  console.log(`\n==================================================`);
  console.log(`[Gold Rate & Price Sync] Starting at ${new Date().toISOString()}...`);

  try {
    const rawItems = await fetchOptigoProducts();
    const grouped = groupProductsByDesign(rawItems);

    const diff = findPriceAndStockDiffs(grouped);
    console.log(`[Price Sync] Analyzed ${diff.totalDesigns} designs across ${rawItems.length} items.`);
    console.log(`[Price Sync] Found ${diff.priceUpdates.length} price changes, ${diff.stockUpdates.length} stock changes, ${diff.newDesigns.length} new designs.`);

    let updatedCount = 0;

    // Check if real Shopify credentials exist
    const isPlaceholder = !config.shopify.shopDomain || 
      config.shopify.shopDomain.includes('your-store-name') || 
      !config.shopify.accessToken || 
      config.shopify.accessToken.includes('shpat_xxxx');

    // Apply price updates to Shopify
    if (diff.priceUpdates.length > 0) {
      if (isPlaceholder) {
        console.log(`[Price Sync Dry-Run] Detected ${diff.priceUpdates.length} variants needing price updates.`);
        updatedCount = diff.priceUpdates.length;
      } else {
        console.log(`[Price Sync] Dispatching ${diff.priceUpdates.length} variant price updates to Shopify GraphQL...`);
        const result = await bulkUpdateVariantPrices(diff.priceUpdates);
        updatedCount = result.updatedCount;
      }

      // Update local DB cache
      const updateDb = db.prepare(`
        UPDATE variants
        SET price = ?, saleprice = ?, goldamount = ?, makingcharge = ?, taxamount = ?, last_synced_at = ?
        WHERE articleno = ?
      `);

      for (const p of diff.priceUpdates) {
        updateDb.run(p.newPrice, p.newPrice, p.goldamount, p.makingcharge, p.taxamount, new Date().toISOString(), p.articleno);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[Price Sync] Complete in ${duration}s. Updated ${updatedCount} variants.`);

    // Record in sync logs
    db.prepare(`
      INSERT INTO sync_logs (sync_type, status, total_items, updated_items, details)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      'PRICES',
      'SUCCESS',
      rawItems.length,
      updatedCount,
      `Duration: ${duration}s. Changed: ${diff.priceUpdates.length} prices, ${diff.stockUpdates.length} stocks.`
    );

    return {
      success: true,
      duration,
      priceUpdates: diff.priceUpdates.length,
      stockUpdates: diff.stockUpdates.length,
      updatedCount
    };
  } catch (err) {
    console.error(`[Price Sync Error]:`, err);
    db.prepare(`
      INSERT INTO sync_logs (sync_type, status, total_items, updated_items, details)
      VALUES (?, ?, ?, ?, ?)
    `).run('PRICES', 'FAILED', 0, 0, err.message);

    return { success: false, error: err.message };
  }
}
