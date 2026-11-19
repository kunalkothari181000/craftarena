import { fetchOptigoProducts } from '../services/optigoClient.js';
import { groupProductsByDesign } from '../services/productGrouper.js';
import {
  findPriceAndStockDiffs,
  persistProductSync,
  persistVariantSync
} from '../services/priceDiffEngine.js';
import {
  createShopifyProduct,
  setJewelleryMetafields,
  shopifyGraphQL
} from '../services/shopifyClient.js';
import { config } from '../config/env.js';
import db from '../db/database.js';

export async function runCatalogueSync() {
  const startTime = Date.now();
  console.log(`\n==================================================`);
  console.log(`[Full Catalogue Sync] Starting at ${new Date().toISOString()}...`);

  try {
    const rawItems = await fetchOptigoProducts();
    const grouped = groupProductsByDesign(rawItems);
    const diff = findPriceAndStockDiffs(grouped);

    console.log(`[Catalogue Sync] Total designs: ${grouped.length}. New designs to create: ${diff.newDesigns.length}`);

    let createdProducts = 0;

    // Check if real Shopify credentials exist before attempting GraphQL calls
    const isPlaceholder = !config.shopify.shopDomain || 
      config.shopify.shopDomain.includes('your-store-name') || 
      !config.shopify.accessToken || 
      config.shopify.accessToken.includes('shpat_xxxx');

    if (isPlaceholder) {
      console.warn(`[Catalogue Sync] Shopify credentials are placeholders in .env.`);
      console.log(`[Catalogue Sync] Populating local database cache with Optigo designs (Dry-Run mode)...`);

      // Seed local DB cache so diffing engine is populated
      for (const group of grouped) {
        persistProductSync(group, `gid://shopify/Product/dryrun_${group.designno}`);
        for (const v of group.variants) {
          persistVariantSync(v, `gid://shopify/ProductVariant/dryrun_${v.articleno}`, `gid://shopify/InventoryItem/dryrun_${v.articleno}`);
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`[Catalogue Sync] Successfully cached all ${grouped.length} designs (${rawItems.length} variants) in local SQLite database in ${duration}s.`);
      return { success: true, mode: 'DRY_RUN_CACHED', designsCached: grouped.length };
    }

    // Process new designs in Shopify
    for (const design of diff.newDesigns) {
      try {
        console.log(`[Creating Product] Design: ${design.designno} - "${design.title}"...`);
        const created = await createShopifyProduct(design);
        const shopifyProductId = created.id;

        // Persist to local database
        persistProductSync(design, shopifyProductId);

        // Map created variants
        const shopifyVariants = created.variants?.nodes || [];
        for (let i = 0; i < design.variants.length; i++) {
          const v = design.variants[i];
          const matchedNode = shopifyVariants[i];
          const shopifyVariantId = matchedNode ? matchedNode.id : null;
          const inventoryItemId = matchedNode?.inventoryItem?.id || null;

          persistVariantSync(v, shopifyVariantId, inventoryItemId);

          // Set variant-level jewellery metafields
          if (shopifyVariantId) {
            await setJewelleryMetafields(shopifyVariantId, [
              { key: 'gross_weight', value: `${v.grosswt} g`, namespace: 'jewellery' },
              { key: 'net_gold_weight', value: `${v.metalwt} g`, namespace: 'jewellery' },
              { key: 'gold_price', value: `₹${v.goldamount}`, namespace: 'jewellery' },
              { key: 'making_charge', value: `₹${v.makingcharge}`, namespace: 'jewellery' },
              { key: 'hsn_code', value: '71131910', namespace: 'compliance' }
            ]);
          }
        }

        // Set product-level jewellery specifications
        await setJewelleryMetafields(shopifyProductId, [
          { key: 'design_code', value: design.designno, namespace: 'jewellery' },
          { key: 'hsn_code', value: '71131910', namespace: 'compliance' },
          { key: 'raw_diamond_specs', value: design.variants[0]?.diamond || '', namespace: 'jewellery' }
        ]);

        createdProducts++;
      } catch (err) {
        console.error(`[Product Creation Failed on ${design.designno}]:`, err.message);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[Catalogue Sync Complete] Created ${createdProducts} products in ${duration}s.`);

    db.prepare(`
      INSERT INTO sync_logs (sync_type, status, total_items, updated_items, details)
      VALUES (?, ?, ?, ?, ?)
    `).run('CATALOGUE', 'SUCCESS', grouped.length, createdProducts, `Created ${createdProducts} new products`);

    return { success: true, createdProducts, duration };
  } catch (err) {
    console.error(`[Catalogue Sync Error]:`, err);
    db.prepare(`
      INSERT INTO sync_logs (sync_type, status, total_items, updated_items, details)
      VALUES (?, ?, ?, ?, ?)
    `).run('CATALOGUE', 'FAILED', 0, 0, err.message);

    return { success: false, error: err.message };
  }
}
