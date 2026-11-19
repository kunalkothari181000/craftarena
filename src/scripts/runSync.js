import { runPriceAndStockSync } from '../jobs/syncPrices.js';
import { runCatalogueSync } from '../jobs/syncCatalogue.js';

const modeArg = process.argv.find(arg => arg.startsWith('--mode='));
const mode = modeArg ? modeArg.split('=')[1] : 'prices';

async function main() {
  console.log(`Starting manual sync runner in mode: "${mode}"...`);

  if (mode === 'catalogue') {
    const res = await runCatalogueSync();
    console.log('Result:', res);
  } else {
    const res = await runPriceAndStockSync();
    console.log('Result:', res);
  }
}

main();
