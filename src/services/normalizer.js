/**
 * Safe JSON parser that handles edge cases like malformed quotes (e.g., 'type""')
 */
export function safeJsonParse(rawString, fallback = null) {
  if (!rawString || typeof rawString !== 'string') return fallback;
  const trimmed = rawString.trim();
  if (!trimmed || trimmed === '""') return fallback;

  try {
    return JSON.parse(trimmed);
  } catch (err) {
    try {
      // Fix common Optigo typos like `"type"":` or unescaped characters
      const cleaned = trimmed
        .replace(/"type""\s*:/g, '"type":')
        .replace(/\\"/g, '"');
      return JSON.parse(cleaned);
    } catch {
      return fallback;
    }
  }
}

/**
 * Normalizes metal color to consistent, customer-facing values
 */
export function normalizeMetalColor(colorCode) {
  if (!colorCode) return 'Yellow Gold';
  const c = colorCode.trim().toUpperCase();
  if (c === 'Y' || c === 'YELLOW' || c === 'YELLOW GOLD') return 'Yellow Gold';
  if (c === 'R' || c === 'ROSE' || c === 'ROSE GOLD') return 'Rose Gold';
  if (c === 'W' || c === 'WHITE' || c === 'WHITE GOLD') return 'White Gold';
  return colorCode.trim();
}

/**
 * Normalizes metal purity / quality
 */
export function normalizeMetalQuality(qualityCode) {
  if (!qualityCode) return '14K';
  const q = qualityCode.trim().toUpperCase();
  if (q.includes('14')) return '14K';
  if (q.includes('18')) return '18K';
  if (q.includes('22')) return '22K';
  if (q.includes('24')) return '24K';
  if (q.includes('925')) return '925 Silver';
  return qualityCode.trim();
}

/**
 * Generates an automatic clean title if Optigo titleline is blank
 */
export function generateProductTitle(item) {
  if (item.titleline && item.titleline.trim().length > 0) {
    return item.titleline.trim();
  }

  const parts = [];
  if (item.brand && item.brand.trim()) parts.push(item.brand.trim());
  if (item.category && item.category.trim()) {
    parts.push(item.category.trim());
  } else if (item.producttype && item.producttype.trim()) {
    parts.push(item.producttype.trim());
  } else {
    parts.push('Jewellery');
  }

  const name = parts.join(' ');
  return `${name} - ${item.designno}`;
}

/**
 * Generates an elegant HTML specifications table for product detail page
 */
export function generateProductDescriptionHtml(parentItem, variants = []) {
  let html = '';
  if (parentItem.description && parentItem.description.trim()) {
    html += `<div class="product-description">${parentItem.description.trim()}</div>\n<br/>\n`;
  }

  const sample = variants[0] || parentItem;
  const diamonds = safeJsonParse(sample.diamond, []);
  const stones = safeJsonParse(sample.colorstone, []);

  html += `<div class="jewellery-specifications">
  <h3>Product Specifications</h3>
  <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 14px;">
    <tbody>
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 8px 0; font-weight: bold; width: 40%;">Design Code</td>
        <td style="padding: 8px 0;">${parentItem.designno}</td>
      </tr>
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 8px 0; font-weight: bold;">Metal Type</td>
        <td style="padding: 8px 0;">${sample.metaltype || 'Gold'}</td>
      </tr>
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 8px 0; font-weight: bold;">Available Purity</td>
        <td style="padding: 8px 0;">${[...new Set(variants.map(v => normalizeMetalQuality(v.metalquality)))].join(', ')}</td>
      </tr>
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 8px 0; font-weight: bold;">Available Colors</td>
        <td style="padding: 8px 0;">${[...new Set(variants.map(v => normalizeMetalColor(v.metalcolor)))].join(', ')}</td>
      </tr>`;

  if (sample.grosswt) {
    html += `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 8px 0; font-weight: bold;">Approx. Gross Weight</td>
        <td style="padding: 8px 0;">${sample.grosswt} g</td>
      </tr>`;
  }

  if (sample.metalwt) {
    html += `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 8px 0; font-weight: bold;">Approx. Net Metal Weight</td>
        <td style="padding: 8px 0;">${sample.metalwt} g</td>
      </tr>`;
  }

  if (Array.isArray(diamonds) && diamonds.length > 0) {
    const d = diamonds[0];
    html += `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 8px 0; font-weight: bold;">Diamond Weight</td>
        <td style="padding: 8px 0;">${d.weight_ctw || 0} Carats (${d.pieces || 1} pcs)</td>
      </tr>
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 8px 0; font-weight: bold;">Diamond Shape & Clarity</td>
        <td style="padding: 8px 0;">${d.shape || 'Round'} / ${d.clarity || 'SI'} ${d.color || 'IJ'}</td>
      </tr>`;
  }

  if (Array.isArray(stones) && stones.length > 0) {
    const s = stones[0];
    html += `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 8px 0; font-weight: bold;">Gemstone</td>
        <td style="padding: 8px 0;">${s.type || s.shape || 'Colorstone'} (${s.weight_ctw || 0} Carats)</td>
      </tr>`;
  }

  html += `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 8px 0; font-weight: bold;">HSN Code</td>
        <td style="padding: 8px 0;">71131910</td>
      </tr>
    </tbody>
  </table>
</div>`;

  return html;
}

/**
 * Extracts and cleans image URLs from comma-separated string
 */
export function parseImageUrls(imagesrc) {
  if (!imagesrc || typeof imagesrc !== 'string') return [];
  return imagesrc
    .split(',')
    .map(url => url.trim())
    .filter(url => url.startsWith('http://') || url.startsWith('https://'));
}

/**
 * Extracts video URLs
 */
export function parseVideoUrls(videosrc) {
  if (!videosrc || typeof videosrc !== 'string') return [];
  return videosrc
    .split(',')
    .map(url => url.trim())
    .filter(url => url.startsWith('http://') || url.startsWith('https://'));
}

