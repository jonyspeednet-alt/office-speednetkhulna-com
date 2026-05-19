#!/usr/bin/env node

const { syncProjectedBillsForCurrentMonth } = require('../controllers/resellerController');

const main = async () => {
  const startedAt = Date.now();
  try {
    const summary = await syncProjectedBillsForCurrentMonth();
    const durationMs = Date.now() - startedAt;
    console.log(
      JSON.stringify({
        ok: true,
        month: summary.month,
        total: summary.total,
        updated: summary.updated,
        failed: summary.failed,
        duration_ms: durationMs
      })
    );
    process.exit(0);
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    console.error(
      JSON.stringify({
        ok: false,
        error: error.message,
        duration_ms: durationMs
      })
    );
    process.exit(1);
  }
};

main();
