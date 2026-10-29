#!/usr/bin/env node
// Run a named isolated real AAL2 Chrome acceptance slice without a shell
// environment override. The underlying D3 suite verifies QA ownership and
// restores all non-QA row counts before returning.
const phase=process.argv[2];
if(!['operations-permanent','operations-issuance','operations-responsive','operations-feedback'].includes(phase)){
  throw Error('SUPPORTED_QA_SLICE_REQUIRED');
}
process.env.AISENCORE_UIQA_PHASE=phase;
await import('./test-d3-authenticated-pages.mjs');
