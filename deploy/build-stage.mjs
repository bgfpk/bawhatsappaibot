// Always compile the existing Vite/Express build for conversion staging.
process.env.BLACKARROW_STAGE = '1';
await import('../scripts/build.mjs');
