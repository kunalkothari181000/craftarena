import { config } from '../config/env.js';
import { groupProductsByDesign } from '../services/productGrouper.js';

async function run() {
  console.log('Fetching live products from Optigo URL:');
  console.log(config.optigo.apiUrl);

  try {
    const res = await fetch(config.optigo.apiUrl);
    if (!res.ok) {
      throw new Error(`HTTP Error: ${res.status} ${res.statusText}`);
    }

    const json = await res.json();
    console.log(`\nFetch successful! Optigo returned ${json.data?.length || 0} raw items.`);

    const grouped = groupProductsByDesign(json.data || []);
    console.log(`Successfully grouped into ${grouped.length} Shopify parent products.\n`);

    // Print summary of first 3 grouped products
    console.log('Sample Grouped Products preview:');
    grouped.slice(0, 3).forEach((p, idx) => {
      console.log(`----------------------------------------`);
      console.log(`[${idx + 1}] Design: ${p.designno}`);
      console.log(`    Title: "${p.title}"`);
      console.log(`    Vendor: "${p.vendor}" | Type: "${p.productType}" | Status: ${p.status}`);
      console.log(`    Images: ${p.images.length} image(s)`);
      console.log(`    Tags: ${p.tags.slice(0, 5).join(', ')}...`);
      console.log(`    Options: ${p.optionNames.join(', ')}`);
      console.log(`    Variants count: ${p.variants.length}`);
      p.variants.forEach(v => {
        console.log(`      - SKU: ${v.sku} | ${v.color} | ${v.purity} | ₹${v.price} | Stock: ${v.stock}`);
      });
    });
    console.log(`----------------------------------------\n`);

  } catch (err) {
    console.error('Error during test fetch:', err);
  }
}

run();

