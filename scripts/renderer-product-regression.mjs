process.env.WAFERCAD_PRODUCT_SCOPE = 'renderer';
process.env.WAFERCAD_REVIEW_DIR ||= 'test-results/product-review/renderer';
await import('./product-regression.mjs');
