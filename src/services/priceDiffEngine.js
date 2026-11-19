import db from '../db/database.js';

export function findPriceAndStockDiffs(groupedProducts = []) {
  // Load existing variants from DB into map
  const existingRows = db.prepare(`
    SELECT articleno, designno, shopify_variant_id, shopify_inventory_item_id,
           saleprice, price, stockquantity, goldamount, makingcharge, taxamount, updated_at
    FROM variants
  `).all();

  const variantDbMap = new Map();
  for (const row of existingRows) {
    variantDbMap.set(row.articleno, row);
  }

  const existingProducts = db.prepare(`SELECT designno, shopify_product_id FROM products`).all();
  const productDbMap = new Map();
  for (const row of existingProducts) {
    productDbMap.set(row.designno, row);
  }

  const priceUpdates = [];
  const stockUpdates = [];
  const newDesigns = [];
  const existingDesignsToUpdate = [];
  let unchangedCount = 0;

  for (const group of groupedProducts) {
    const isProductInDb = productDbMap.has(group.designno);
    const existingProduct = productDbMap.get(group.designno);

    if (!isProductInDb || !existingProduct.shopify_product_id) {
      newDesigns.push(group);
      continue;
    }

    let hasAnyChange = false;

    for (const v of group.variants) {
      const dbVar = variantDbMap.get(v.articleno);

      if (!dbVar) {
        // Variant is new under existing product
        hasAnyChange = true;
        continue;
      }

      const priceChanged = Math.abs((dbVar.saleprice || dbVar.price || 0) - v.price) > 0.01;
      const stockChanged = (dbVar.stockquantity || 0) !== v.stock;
      const goldChanged = Math.abs((dbVar.goldamount || 0) - v.goldamount) > 0.01;

      if (priceChanged || goldChanged) {
        priceUpdates.push({
          articleno: v.articleno,
          designno: group.designno,
          shopifyVariantId: dbVar.shopify_variant_id,
          oldPrice: dbVar.saleprice || dbVar.price,
          newPrice: v.price,
          compareAtPrice: v.compareAtPrice,
          goldamount: v.goldamount,
          diamondamount: v.diamondamount,
          makingcharge: v.makingcharge,
          othercharge: v.othercharge,
          taxamount: v.taxamount
        });
        hasAnyChange = true;
      }

      if (stockChanged) {
        stockUpdates.push({
          articleno: v.articleno,
          shopifyInventoryItemId: dbVar.shopify_inventory_item_id,
          oldStock: dbVar.stockquantity,
          newStock: v.stock
        });
        hasAnyChange = true;
      }

      if (!priceChanged && !stockChanged && !goldChanged) {
        unchangedCount++;
      }
    }

    if (hasAnyChange) {
      existingDesignsToUpdate.push(group);
    }
  }

  return {
    priceUpdates,
    stockUpdates,
    newDesigns,
    existingDesignsToUpdate,
    unchangedCount,
    totalDesigns: groupedProducts.length
  };
}

/**
 * Updates the local database cache after a sync operation
 */
export function persistProductSync(product, shopifyProductId) {
  const upsertProduct = db.prepare(`
    INSERT INTO products (designno, shopify_product_id, title, category, brand, raw_data, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(designno) DO UPDATE SET
      shopify_product_id = excluded.shopify_product_id,
      title = excluded.title,
      category = excluded.category,
      brand = excluded.brand,
      raw_data = excluded.raw_data,
      updated_at = excluded.updated_at
  `);

  upsertProduct.run(
    product.designno,
    shopifyProductId,
    product.title,
    product.productType,
    product.vendor,
    JSON.stringify(product.primaryItem),
    new Date().toISOString()
  );
}

export function persistVariantSync(v, shopifyVariantId, inventoryItemId = null) {
  const upsertVariant = db.prepare(`
    INSERT INTO variants (
      articleno, designno, shopify_variant_id, shopify_inventory_item_id,
      metalcolor, metalquality, jewllerysize, grosswt, metalwt,
      goldamount, diamondamount, makingcharge, price, saleprice,
      stockquantity, updated_at, last_synced_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(articleno) DO UPDATE SET
      shopify_variant_id = COALESCE(excluded.shopify_variant_id, variants.shopify_variant_id),
      shopify_inventory_item_id = COALESCE(excluded.shopify_inventory_item_id, variants.shopify_inventory_item_id),
      metalcolor = excluded.metalcolor,
      metalquality = excluded.metalquality,
      jewllerysize = excluded.jewllerysize,
      grosswt = excluded.grosswt,
      metalwt = excluded.metalwt,
      goldamount = excluded.goldamount,
      diamondamount = excluded.diamondamount,
      makingcharge = excluded.makingcharge,
      price = excluded.price,
      saleprice = excluded.saleprice,
      stockquantity = excluded.stockquantity,
      updated_at = excluded.updated_at,
      last_synced_at = excluded.last_synced_at
  `);

  upsertVariant.run(
    v.articleno,
    v.designno,
    shopifyVariantId,
    inventoryItemId,
    v.color,
    v.purity,
    v.size,
    v.grosswt,
    v.metalwt,
    v.goldamount,
    v.diamondamount,
    v.makingcharge,
    v.price,
    v.price,
    v.stock,
    v.updated_at,
    new Date().toISOString()
  );
}

