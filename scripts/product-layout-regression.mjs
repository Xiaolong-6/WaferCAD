process.env.WAFERCAD_PRODUCT_SCOPE = 'layout';
process.env.WAFERCAD_REVIEW_DIR ||= 'test-results/product-review';
await import('./product-regression.mjs');
