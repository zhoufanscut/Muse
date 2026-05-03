/**
 * Score how well `query` matches `text`.
 * Returns 0 if no match, positive if matched (higher = better).
 * Scoring prefers: consecutive chars, word boundaries, early matches.
 */
export function fuzzyScore(query, text) {
  if (!query) return Infinity;

  const q = query.toLowerCase();
  const t = text.toLowerCase();

  let qi = 0;
  let score = 0;
  let consecutive = 0;
  let firstMatchIdx = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (firstMatchIdx === -1) firstMatchIdx = ti;

      consecutive++;
      score += consecutive * 2; // bonus grows with each consecutive match

      // Word-boundary bonus: after space, hyphen, underscore
      if (ti === 0 || /[\s\-_]/.test(t[ti - 1])) {
        score += 5;
      }

      qi++;
    } else {
      consecutive = 0;
    }
  }

  if (qi < q.length) return 0;

  // Penalty: later first match is worse
  score = Math.max(1, score - firstMatchIdx);

  // Bonus: query appears as exact substring
  if (t.includes(q)) score += 10;

  return score;
}

export function nextVisiblePill(el) {
  let next = el.nextElementSibling;
  while (next) {
    if (next.classList.contains('pill') && next.offsetParent !== null) return next;
    next = next.nextElementSibling;
  }
  return null;
}

export function prevVisiblePill(el) {
  let prev = el.previousElementSibling;
  while (prev) {
    if (prev.classList.contains('pill') && prev.offsetParent !== null) return prev;
    prev = prev.previousElementSibling;
  }
  return null;
}
