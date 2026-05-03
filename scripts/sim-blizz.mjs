// Self-contained simulation of the new auto-plan scoring for Blizz, hoc/L1.
// Validates the priority+distance score gives the expected picks.

const PRIORITY_DISTANCE = 5;
const ALPHA = 1 / PRIORITY_DISTANCE;
const HINT_BONUS = 1;

const LOCS = {
  loc_forge:     { x: 50,   y: 50,   phases: [2]    },
  loc_mercenary: { x: 49.5, y: 27.5, phases: [2]    },
  loc_munitions: { x: 49.5, y: 68.5, phases: [2]    },
  loc_boiler:    { x: 34,   y: 13.7, phases: [1, 2] },
  loc_proto_1:   { x: 17,   y: 40,   phases: [1, 2] },
  loc_proto_2:   { x: 82,   y: 58,   phases: [1, 2] },
  loc_transit:   { x: 65.5, y: 81.7, phases: [1, 2] },
  loc_repair_1:  { x:  9,   y: 51.7, phases: [1, 2] },
  loc_repair_2:  { x: 90,   y: 44,   phases: [1, 2] },
  loc_repair_3:  { x: 33.1, y: 81.7, phases: [1, 2] },
  loc_repair_4:  { x: 65.4, y: 13.7, phases: [1, 2] },
};

const PRIORITY = [
  'loc_forge', 'loc_mercenary', 'loc_munitions',
  'loc_boiler', 'loc_proto_1', 'loc_proto_2', 'loc_transit',
  'loc_repair_1', 'loc_repair_2', 'loc_repair_3', 'loc_repair_4',
];
const COUNT = 4;

function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function simulate(phase, hints = []) {
  const allowed = PRIORITY.filter(id => LOCS[id].phases.includes(phase));
  const idxOf = new Map(allowed.map((id, i) => [id, i]));
  const taken = new Set();
  let anchor = null;
  const picks = [];

  for (let r = 0; r < COUNT; r++) {
    const candidates = allowed.filter(id => !taken.has(id));

    // Score with hint bonus
    let best = null, bestScore = Infinity, bestDetail = null;
    for (const c of candidates) {
      const pIdx = idxOf.get(c);
      const d = anchor ? dist(LOCS[c], anchor) : 0;
      const isHint = phase === 2 && hints.includes(c);
      const score = pIdx + ALPHA * d - (isHint ? HINT_BONUS : 0);
      if (score < bestScore) {
        bestScore = score; best = c;
        bestDetail = { pIdx, d: d.toFixed(1), score: score.toFixed(2), hint: isHint };
      }
    }
    picks.push({ round: r+1, id: best, ...bestDetail });
    taken.add(best);
    if (!anchor) anchor = { x: LOCS[best].x, y: LOCS[best].y };
  }
  return picks;
}

console.log('=== PHASE 1 ===');
const p1 = simulate(1);
for (const p of p1) console.log(`  Round ${p.round}: ${p.id}   pIdx=${p.pIdx}  d=${p.d}  score=${p.score} ${p.reason ? '['+p.reason+']' : ''}`);

console.log('\n=== PHASE 2 (with phase-1 hints) ===');
const hints = p1.map(p => p.id);
const p2 = simulate(2, hints);
for (const p of p2) console.log(`  Round ${p.round}: ${p.id}   pIdx=${p.pIdx}  d=${p.d}  score=${p.score} ${p.reason ? '['+p.reason+']' : ''}`);
