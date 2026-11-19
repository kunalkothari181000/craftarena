import { config } from '../config/env.js';

let primaryLocationId = null;

/**
 * Execute GraphQL query against Shopify Admin API with rate-limit handling
 */
export async function shopifyGraphQL(query, variables = {}, retries = 3) {
  const { shopDomain, accessToken, apiVersion } = config.shopify;

  if (!shopDomain || !accessToken) {
    throw new Error('Shopify credentials (SHOPIFY_SHOP_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN) are not configured.');
  }

  const endpoint = `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken
        },
        body: JSON.stringify({ query, variables })
      });

      if (response.status === 429) {
        const retryAfter = parseFloat(response.headers.get('Retry-After') || '2');
        console.warn(`[Shopify Rate Limit] Throttled. Backing off for ${retryAfter}s (attempt ${attempt}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Shopify HTTP ${response.status}: ${errorText}`);
      }

      const json = await response.json();

      if (json.errors && json.errors.length > 0) {
        const errorMsg = json.errors.map(e => e.message).join(' | ');
        throw new Error(`Shopify GraphQL Error: ${errorMsg}`);
      }

      return json.data;
    } catch (err) {
      if (attempt === retries) throw err;
      console.warn(`[Shopify Retry] Attempt ${attempt} failed: ${err.message}. Retrying in 1.5s...`);
      await new Promise(resolve => setTimeout(resolve, 1500 * attempt));
    }
  }
}

/**
 * Get primary store location ID for inventory updates
 */
export async function getPrimaryLocationId() {
  if (primaryLocationId) return primaryLocationId;

  const query = `
    query {
      locations(first: 5) {
        nodes {
          id
          name
          isPrimary
        }
      }
    }
  `;

  const data = await shopifyGraphQL(query);
  const locations = data?.locations?.nodes || [];
  const primary = locations.find(l => l.isPrimary) || locations[0];

  if (!primary) {
    throw new Error('Could not find any inventory location in Shopify store.');
  }

  primaryLocationId = primary.id;
  return primaryLocationId;
}

/**
 * High-speed bulk price update for variants (Used for rapid Gold Rate updates)
 */
export async function bulkUpdateVariantPrices(priceUpdates = []) {
  if (priceUpdates.length === 0) return { updatedCount: 0 };

  const mutation = `
    mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants {
          id
          price
          compareAtPrice
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  // Group by productId
  const groupedByProduct = new Map();
  for (const item of priceUpdates) {
    if (!item.shopifyProductId || !item.shopifyVariantId) continue;
    if (!groupedByProduct.has(item.shopifyProductId)) {
      groupedByProduct.set(item.shopifyProductId, []);
    }
    groupedByProduct.get(item.shopifyProductId).push({
      id: item.shopifyVariantId,
      price: item.newPrice.toFixed(2),
      compareAtPrice: item.compareAtPrice ? item.compareAtPrice.toFixed(2) : null
    });
  }

  let totalUpdated = 0;

  for (const [productId, variants] of groupedByProduct.entries()) {
    const res = await shopifyGraphQL(mutation, {
      productId,
      variants
    });

    const userErrors = res?.productVariantsBulkUpdate?.userErrors || [];
    if (userErrors.length > 0) {
      console.error(`[Bulk Price Update Error on ${productId}]:`, userErrors);
    } else {
      totalUpdated += res?.productVariantsBulkUpdate?.productVariants?.length || 0;
    }
  }

  return { updatedCount: totalUpdated };
}

/**
 * Creates a brand new Shopify Product with options, variants, media, and metafields
 */
export async function createShopifyProduct(groupedProduct) {
  const mutation = `
    mutation productCreate($input: ProductInput!, $media: [CreateMediaInput!]) {
      productCreate(input: $input, media: $media) {
        product {
          id
          handle
          variants(first: 50) {
            nodes {
              id
              sku
              inventoryItem {
                id
              }
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  // Build media input
  const mediaInput = groupedProduct.images.map(url => ({
    originalSource: url,
    mediaContentType: 'IMAGE'
  }));

  // Build product input
  const input = {
    title: groupedProduct.title,
    descriptionHtml: groupedProduct.descriptionHtml,
    vendor: groupedProduct.vendor,
    productType: groupedProduct.productType,
    status: groupedProduct.status,
    tags: groupedProduct.tags
  };

  const data = await shopifyGraphQL(mutation, { input, media: mediaInput });
  const userErrors = data?.productCreate?.userErrors || [];

  if (userErrors.length > 0) {
    throw new Error(`Failed to create product ${groupedProduct.designno}: ${userErrors.map(e => e.message).join(', ')}`);
  }

  const createdProduct = data.productCreate.product;
  return createdProduct;
}

/**
 * Sets jewellery metafields (Gold Specs, Diamond Specs, Making Charges, HSN)
 */
export async function setJewelleryMetafields(ownerId, metafieldsList) {
  const mutation = `
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          key
          value
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const formatted = metafieldsList.map(m => ({
    ownerId,
    namespace: m.namespace || 'jewellery',
    key: m.key,
    value: String(m.value),
    type: m.type || 'single_line_text_field'
  }));

  const data = await shopifyGraphQL(mutation, { metafields: formatted });
  return data?.metafieldsSet;
}

