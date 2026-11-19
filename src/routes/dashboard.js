import db from '../db/database.js';
import { config } from '../config/env.js';
import { runPriceAndStockSync } from '../jobs/syncPrices.js';
import { runCatalogueSync } from '../jobs/syncCatalogue.js';
import { fetchOptigoProducts } from '../services/optigoClient.js';
import { shopifyGraphQL } from '../services/shopifyClient.js';

/**
 * Serves the HTML admin dashboard
 */
export function handleDashboardHtml(req, res) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CraftArena | Optigo ↔ Shopify Sync Control Center</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0d1117;
      --card-bg: #161b22;
      --card-border: #30363d;
      --text: #f0f6fc;
      --text-muted: #8b949e;
      --accent: #d4af37; /* Metallic Gold */
      --accent-hover: #b8972e;
      --green: #2ea043;
      --red: #f85149;
      --blue: #58a6ff;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      padding: 24px;
    }

    .container { max-width: 1200px; margin: 0 auto; }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--card-border);
      margin-bottom: 24px;
    }

    .brand { display: flex; align-items: center; gap: 12px; }
    .brand h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
    .badge {
      background: rgba(212, 175, 55, 0.15);
      color: var(--accent);
      border: 1px solid rgba(212, 175, 55, 0.3);
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      color: var(--green);
      background: rgba(46, 160, 67, 0.15);
      padding: 6px 14px;
      border-radius: 20px;
      border: 1px solid rgba(46, 160, 67, 0.3);
    }
    .status-dot {
      width: 8px;
      height: 8px;
      background: var(--green);
      border-radius: 50%;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0% { opacity: 0.4; transform: scale(0.9); }
      50% { opacity: 1; transform: scale(1.1); }
      100% { opacity: 0.4; transform: scale(0.9); }
    }

    /* Grid Layout */
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin-bottom: 24px; }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 20px;
      position: relative;
    }

    .card-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }

    .card-value { font-size: 28px; font-weight: 800; color: var(--text); }
    .card-subtext { font-size: 12px; color: var(--text-muted); margin-top: 6px; }

    /* Actions Panel */
    .actions-panel {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
    }
    .panel-header { margin-bottom: 16px; }
    .panel-title { font-size: 16px; font-weight: 700; margin-bottom: 4px; }
    .panel-desc { font-size: 13px; color: var(--text-muted); }

    .btn-group { display: flex; flex-wrap: wrap; gap: 12px; }

    button {
      font-family: inherit;
      cursor: pointer;
      border: none;
      border-radius: 8px;
      padding: 12px 20px;
      font-size: 14px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s ease;
    }

    .btn-primary {
      background: var(--accent);
      color: #000;
    }
    .btn-primary:hover { background: var(--accent-hover); transform: translateY(-1px); }

    .btn-secondary {
      background: #21262d;
      color: var(--text);
      border: 1px solid var(--card-border);
    }
    .btn-secondary:hover { background: #30363d; color: #fff; }

    button:disabled { opacity: 0.5; cursor: not-allowed; }

    /* Console / Notification Box */
    #consoleBox {
      display: none;
      margin-top: 16px;
      padding: 14px 18px;
      border-radius: 8px;
      font-size: 13px;
      font-family: monospace;
      white-space: pre-wrap;
    }
    .console-success { background: rgba(46, 160, 67, 0.15); border: 1px solid var(--green); color: #7ee787; }
    .console-error { background: rgba(248, 81, 73, 0.15); border: 1px solid var(--red); color: #ff7b72; }
    .console-info { background: rgba(88, 166, 255, 0.15); border: 1px solid var(--blue); color: #79c0ff; }

    /* Logs Table */
    .table-container {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      overflow: hidden;
    }
    .table-header { padding: 16px 20px; border-bottom: 1px solid var(--card-border); }
    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
    th { padding: 12px 20px; background: #0e1217; color: var(--text-muted); font-weight: 600; border-bottom: 1px solid var(--card-border); }
    td { padding: 14px 20px; border-bottom: 1px solid rgba(48, 54, 61, 0.5); color: var(--text); }
    tr:last-child td { border-bottom: none; }
    .tag-success { background: rgba(46, 160, 67, 0.15); color: #7ee787; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 11px; }
    .tag-failed { background: rgba(248, 81, 73, 0.15); color: #ff7b72; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 11px; }

    .spinner {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255,255,255,0.3);
      border-radius: 50%;
      border-top-color: #fff;
      animation: spin 0.8s linear infinite;
      display: inline-block;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand">
        <h1>CraftArena</h1>
        <span class="badge">Optigo ERP ↔ Shopify Control Center</span>
      </div>
      <div class="status-pill">
        <span class="status-dot"></span>
        <span>Middleware Online</span>
      </div>
    </header>

    <!-- Metrics Cards -->
    <div class="grid">
      <div class="card">
        <div class="card-title">Shopify Designs Synced</div>
        <div class="card-value" id="valProducts">...</div>
        <div class="card-subtext">Parent jewellery designs active in store</div>
      </div>
      <div class="card">
        <div class="card-title">Total Variants Synced</div>
        <div class="card-value" id="valVariants">...</div>
        <div class="card-subtext">Gold color, purity & size options</div>
      </div>
      <div class="card">
        <div class="card-title">Reverse Orders Synced</div>
        <div class="card-value" id="valOrders">...</div>
        <div class="card-subtext">Shopify orders pushed to Optigo ERP</div>
      </div>
      <div class="card">
        <div class="card-title">Shopify Store</div>
        <div class="card-value" style="font-size: 16px; font-weight: 700; color: var(--accent); padding-top: 6px;">
          craftareana-fqprs6ev
        </div>
        <div class="card-subtext">Currency: INR | Auto-OAuth: Active</div>
      </div>
    </div>

    <!-- Actions Panel -->
    <div class="actions-panel">
      <div class="panel-header">
        <div class="panel-title">Manual Sync & Diagnostics Controls</div>
        <div class="panel-desc">Execute immediate price deltas, catalogue refreshes, or verify connection health across Optigo and Shopify.</div>
      </div>
      <div class="btn-group">
        <button class="btn-primary" id="btnSyncPrices" onclick="triggerSync('prices')">
          ⚡ Sync Gold Rates & Prices
        </button>
        <button class="btn-secondary" id="btnSyncCatalogue" onclick="triggerSync('catalogue')">
          📦 Full Catalogue Sync
        </button>
        <button class="btn-secondary" id="btnTestOptigo" onclick="testConnection('optigo')">
          🔍 Test Optigo ERP API
        </button>
        <button class="btn-secondary" id="btnTestShopify" onclick="testConnection('shopify')">
          🛍️ Test Shopify Store API
        </button>
      </div>

      <div id="consoleBox"></div>
    </div>

    <!-- Sync History Logs Table -->
    <div class="table-container">
      <div class="table-header">
        <div class="panel-title">Recent Sync Executions</div>
      </div>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Type</th>
            <th>Status</th>
            <th>Items Processed</th>
            <th>Details</th>
            <th>Timestamp</th>
          </tr>
        </thead>
        <tbody id="logsTableBody">
          <tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Loading sync history...</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <script>
    async function fetchStats() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        document.getElementById('valProducts').innerText = data.database?.totalProducts || 0;
        document.getElementById('valVariants').innerText = data.database?.totalVariants || 0;
        document.getElementById('valOrders').innerText = data.database?.totalOrdersSynced || 0;

        const tbody = document.getElementById('logsTableBody');
        if (data.recentSyncs && data.recentSyncs.length > 0) {
          tbody.innerHTML = data.recentSyncs.map(log => \`
            <tr>
              <td>#\${log.id}</td>
              <td><strong>\${log.sync_type}</strong></td>
              <td><span class="\${log.status === 'SUCCESS' ? 'tag-success' : 'tag-failed'}">\${log.status}</span></td>
              <td>\${log.total_items} items (\${log.updated_items} updated)</td>
              <td>\${log.details || '-'}</td>
              <td style="color: var(--text-muted);">\${log.created_at}</td>
            </tr>
          \`).join('');
        } else {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--text-muted);">No sync history yet.</td></tr>';
        }
      } catch (err) {
        console.error('Failed to load stats:', err);
      }
    }

    async function triggerSync(mode) {
      const btn = mode === 'prices' ? document.getElementById('btnSyncPrices') : document.getElementById('btnSyncCatalogue');
      const originalText = btn.innerHTML;
      btn.innerHTML = '<span class="spinner"></span> Running Sync...';
      btn.disabled = true;

      const consoleBox = document.getElementById('consoleBox');
      consoleBox.style.display = 'block';
      consoleBox.className = 'console-info';
      consoleBox.innerText = \`Initiating \${mode === 'prices' ? 'Gold Rate & Price' : 'Full Catalogue'} sync... Please wait.\`;

      try {
        const res = await fetch(\`/api/sync/trigger?token=${config.syncTriggerToken}&mode=\${mode}\`, { method: 'POST' });
        const json = await res.json();

        if (json.success) {
          consoleBox.className = 'console-success';
          consoleBox.innerText = \`✅ Success: \${json.message || 'Sync completed.'}\\nDetails: \${JSON.stringify(json.result, null, 2)}\`;
        } else {
          consoleBox.className = 'console-error';
          consoleBox.innerText = \`❌ Error: \${json.error || 'Sync failed.'}\`;
        }
      } catch (err) {
        consoleBox.className = 'console-error';
        consoleBox.innerText = \`❌ Network Error: \${err.message}\`;
      } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
        fetchStats();
      }
    }

    async function testConnection(target) {
      const btn = target === 'optigo' ? document.getElementById('btnTestOptigo') : document.getElementById('btnTestShopify');
      const originalText = btn.innerHTML;
      btn.innerHTML = '<span class="spinner"></span> Testing...';
      btn.disabled = true;

      const consoleBox = document.getElementById('consoleBox');
      consoleBox.style.display = 'block';
      consoleBox.className = 'console-info';
      consoleBox.innerText = \`Pinging \${target.toUpperCase()} API endpoint...\`;

      try {
        const endpoint = target === 'optigo' ? '/api/admin/test-optigo' : '/api/admin/test-shopify';
        const res = await fetch(endpoint);
        const json = await res.json();

        if (json.success) {
          consoleBox.className = 'console-success';
          consoleBox.innerText = \`✅ \${target.toUpperCase()} Connection Active:\\n\${JSON.stringify(json.data, null, 2)}\`;
        } else {
          consoleBox.className = 'console-error';
          consoleBox.innerText = \`❌ \${target.toUpperCase()} Failed:\\n\${json.error}\`;
        }
      } catch (err) {
        consoleBox.className = 'console-error';
        consoleBox.innerText = \`❌ Test Failed: \${err.message}\`;
      } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    }

    // Initial load & poll stats every 10s
    fetchStats();
    setInterval(fetchStats, 10000);
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(html);
}

/**
 * Diagnostic endpoint: Test Optigo API
 */
export async function handleTestOptigo(req, res) {
  const startTime = Date.now();
  try {
    const rawItems = await fetchOptigoProducts();
    const durationMs = Date.now() - startTime;
    return res.status(200).json({
      success: true,
      data: {
        status: 'CONNECTED',
        responseTimeMs: durationMs,
        totalItemsReturned: rawItems.length,
        endpoint: config.optigo.apiUrl
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Diagnostic endpoint: Test Shopify Store API
 */
export async function handleTestShopify(req, res) {
  const startTime = Date.now();
  try {
    const query = `{
      shop {
        name
        myshopifyDomain
        currencyCode
        plan {
          displayName
        }
      }
    }`;
    const data = await shopifyGraphQL(query);
    const durationMs = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      data: {
        status: 'CONNECTED',
        responseTimeMs: durationMs,
        shop: data.shop
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
