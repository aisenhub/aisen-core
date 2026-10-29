#!/usr/bin/env node
// Run the established isolated AAL2 Chrome Grant-writing phase with native node.
// The underlying test handles QA fixture ownership, cleanup and baseline checks.
process.env.AISENCORE_UIQA_PHASE='operations-grants';
await import('./test-d3-authenticated-pages.mjs');
