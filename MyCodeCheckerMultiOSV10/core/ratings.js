'use strict';

// Ratings follow the public code quality scales.
// Maintainability is the technical-debt ratio against 30 minutes per line.
// Reliability follows the worst open bug. Security follows the worst open
// vulnerability. Security review follows how many hotspots are reviewed.

const RANK = { A: 1, B: 2, C: 3, D: 4, E: 5 };
const LETTER = ['', 'A', 'B', 'C', 'D', 'E'];

const DEV_MIN_PER_LINE = 30;

function maintainability(debtMin, ncloc) {
  const ratio = ncloc > 0 ? (debtMin / (ncloc * DEV_MIN_PER_LINE)) * 100 : 0;
  let letter = 'A';
  if (ratio > 50) letter = 'E';
  else if (ratio > 20) letter = 'D';
  else if (ratio > 10) letter = 'C';
  else if (ratio > 5) letter = 'B';
  return { letter, value: RANK[letter], ratio: Math.round(ratio * 10) / 10 };
}

function worstSeverity(issues, type) {
  const order = ['INFO', 'MINOR', 'MAJOR', 'CRITICAL', 'BLOCKER'];
  let worst = -1;
  for (const issue of issues) {
    if (issue.type !== type) continue;
    if (isClosed(issue)) continue;
    worst = Math.max(worst, order.indexOf(issue.severity));
  }
  if (worst < 0) return { letter: 'A', value: 1 };
  const by = { MINOR: 'B', MAJOR: 'C', CRITICAL: 'D', BLOCKER: 'E', INFO: 'A' };
  const letter = by[order[worst]] || 'A';
  return { letter, value: RANK[letter] };
}

function securityReview(hotspots) {
  const open = hotspots.filter((h) => !isClosed(h));
  if (!open.length) return { letter: 'A', value: 1, reviewed: 100, toReview: 0, total: 0 };
  const reviewed = open.filter((h) => h.status && h.status !== 'TO_REVIEW').length;
  const pct = (reviewed / open.length) * 100;
  let letter = 'E';
  if (pct >= 80) letter = 'A';
  else if (pct >= 70) letter = 'B';
  else if (pct >= 50) letter = 'C';
  else if (pct >= 30) letter = 'D';
  return {
    letter, value: RANK[letter],
    reviewed: Math.round(pct * 10) / 10,
    toReview: open.length - reviewed,
    total: open.length,
  };
}

function isClosed(issue) {
  if (!issue) return false;
  if (issue.type === 'SECURITY_HOTSPOT') return false;
  return issue.status === 'RESOLVED' || issue.status === 'CLOSED' || !!issue.resolution;
}

function countOpen(issues, type) {
  return issues.filter((i) => i.type === type && !isClosed(i)).length;
}

function rate(issues, hotspots, debtMin, ncloc) {
  const rel = worstSeverity(issues, 'BUG');
  const sec = worstSeverity(issues, 'VULNERABILITY');
  const maint = maintainability(debtMin, ncloc);
  const review = securityReview(hotspots);
  return {
    reliability: rel.letter,
    reliabilityValue: rel.value,
    security: sec.letter,
    securityValue: sec.value,
    maintainability: maint.letter,
    maintainabilityValue: maint.value,
    debtRatio: maint.ratio,
    securityReview: review.letter,
    securityReviewValue: review.value,
    hotspotsReviewed: review.reviewed,
    hotspotsToReview: review.toReview,
  };
}

module.exports = {
  RANK, LETTER, DEV_MIN_PER_LINE, maintainability, worstSeverity, securityReview, rate, countOpen, isClosed,
};
