/* Explicit cohort policy. Never infer production status from task counts. */
(function(root) {
  const confirmed = new Set([
    '3921f1a9-1a79-4fda-bde2-415bc35dc16b',
    'cfccf846-b8b6-4bcf-9dfe-17704e88837a',
    '78f1c186-6dfb-431f-abf8-efdc2a3b19fe',
    'd0eaff52-14ad-422e-988b-b642932d0451'
  ]);
  function includedRuns(runs) {
    return new Set(runs.filter(r => {
      if (r.config?.dashboard_include === false) return false;
      return confirmed.has(r.id) || r.config?.dashboard_include === true;
    }).map(r => r.id));
  }
  function formalResults(results, runs) {
    const ids = includedRuns(runs);
    // backend run_id is the root batch after resolving retry chains.
    return results.filter(r => ids.has(r.run_id));
  }
  root.ACEBatchPolicy = { formalResults, includedRuns };
  if (typeof module !== 'undefined') module.exports = root.ACEBatchPolicy;
})(globalThis);
