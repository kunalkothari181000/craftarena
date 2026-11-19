import {
  normalizeMetalColor,
  normalizeMetalQuality,
  generateProductTitle,
  generateProductDescriptionHtml,
  parseImageUrls,
  parseVideoUrls
} from './normalizer.js';

export function groupProductsByDesign(items = []) {
  const grouped = new Map();

  for (const item of items) {
    if (!item.designno) continue;
    const designNo = item.designno.trim();

    if (!grouped.has(designNo)) {
      grouped.set(designNo, {
        designno: designNo,
        items: []
      });
    }

    grouped.get(designNo).items.push(item);
  }

  const result = [];

  for (const [designNo, group] of grouped.entries()) {
    const primaryItem = group.items[0];
    const title = generateProductTitle(primaryItem);
    const descriptionHtml = generateProductDescriptionHtml(primaryItem, group.items);

    // Collect all unique images
    const allImages = [];
    const imageSet = new Set();
    for (const item of group.items) {
      const urls = parseImageUrls(item.imagesrc);
      for (const u of urls) {
        if (!imageSet.has(u)) {
          imageSet.add(u);
          allImages.push(u);
        }
      }
    }

    // Collect all unique videos
    const allVideos = [];
    const videoSet = new Set();
    for (const item of group.items) {
      const urls = parseVideoUrls(item.videosrc);
      for (const u of urls) {
        if (!videoSet.has(u)) {
          videoSet.add(u);
          allVideos.push(u);
        }
      }
    }

    // Determine tags
    const tags = new Set();
    if (primaryItem.collection) tags.add(`Collection: ${primaryItem.collection.trim()}`);
    if (primaryItem.category) tags.add(`Category: ${primaryItem.category.trim()}`);
    if (primaryItem.subcategory) tags.add(`Subcategory: ${primaryItem.subcategory.trim()}`);
    if (primaryItem.style) tags.add(`Style: ${primaryItem.style.trim()}`);
    if (primaryItem.occassion) tags.add(`Occasion: ${primaryItem.occassion.trim()}`);
    if (primaryItem.gender) tags.add(`Gender: ${primaryItem.gender.trim()}`);
    if (primaryItem.producttype) tags.add(primaryItem.producttype.trim());
    if (primaryItem.metaltype) tags.add(primaryItem.metaltype.trim());
    tags.add('OptigoSynced');

    // Build variants
    const variants = group.items.map(item => {
      const color = normalizeMetalColor(item.metalcolor);
      const purity = normalizeMetalQuality(item.metalquality);
      const size = item.jewllerysize ? item.jewllerysize.trim() : '';

      // Find matching image for variant by color hint if available
      let matchingImage = null;
      const upperColor = (item.metalcolor || '').toUpperCase();
      if (upperColor) {
        matchingImage = allImages.find(imgUrl =>
          imgUrl.toUpperCase().includes(`~${upperColor}`) ||
          imgUrl.toUpperCase().includes(upperColor)
        );
      }
      if (!matchingImage && allImages.length > 0) {
        matchingImage = allImages[0];
      }

      const price = item.saleprice ? Number(item.saleprice) : (item.price ? Number(item.price) : 0);
      const mrp = item.mrp ? Number(item.mrp) : 0;
      const compareAtPrice = mrp > price ? mrp : null;
      const stock = typeof item.stockquantity === 'number' ? item.stockquantity : (item.instock ? 1 : 0);

      return {
        articleno: item.articleno.trim(),
        designno: designNo,
        sku: item.articleno.trim(),
        color,
        purity,
        size,
        price,
        compareAtPrice,
        stock,
        matchingImage,
        goldamount: Number(item.goldamount) || 0,
        diamondamount: Number(item.diamondamount) || 0,
        makingcharge: Number(item.makingcharge) || 0,
        othercharge: Number(item.othercharge) || 0,
        taxamount: Number(item.taxamount) || 0,
        grosswt: Number(item.grosswt) || 0,
        metalwt: Number(item.metalwt) || 0,
        diamond: item.diamond || '',
        colorstone: item.colorstone || '',
        taxdata: item.taxdata || '',
        updated_at: item.updated_at || new Date().toISOString()
      };
    });

    // Check which options are needed
    const hasMultipleColors = new Set(variants.map(v => v.color)).size > 1;
    const hasMultiplePurities = new Set(variants.map(v => v.purity)).size > 1;
    const hasSizes = variants.some(v => v.size && v.size.length > 0);

    const optionNames = ['Color', 'Purity'];
    if (hasSizes) optionNames.push('Size');

    result.push({
      designno: designNo,
      title,
      vendor: primaryItem.brand || primaryItem.vendor || 'Jewellery',
      productType: primaryItem.category || primaryItem.producttype || 'Jewellery',
      status: primaryItem.published === 'No' ? 'DRAFT' : 'ACTIVE',
      descriptionHtml,
      tags: Array.from(tags),
      images: allImages,
      videos: allVideos,
      optionNames,
      variants,
      primaryItem
    });
  }

  return result;
}

