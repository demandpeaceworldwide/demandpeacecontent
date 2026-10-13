// Default launch phase: ideas and direction only. Explicitly enable production later.
function reviewOnly() { return process.env.DP_REVIEW_ONLY !== 'false'; }
module.exports = { reviewOnly };
