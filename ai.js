'use strict';
// Computadora: misma estrategia que ComputerOpponent.java del juego original.
// Prueba todas las combinaciones de las 2 cartas del turno (lugar y blanco de cada una) y se queda con
// la de mejor puntaje. En «fácil» suma un azar de 0 a 58 a cada puntaje.

if (typeof module !== 'undefined') Object.assign(globalThis, require('./game.js'));

// De más a menos valiosa (sortHand del original): juega primero lo menos valioso.
const AI_VALUE = [AIR, TANK, ART, HW, SF, PARA, INF];
const aiSorted = (hand) => hand.slice().sort((a, b) => AI_VALUE.indexOf(a) - AI_VALUE.indexOf(b));

// Pone debajo del mazo las 2 cartas menos valiosas de las 5 iniciales.
function aiMulligan(g, p) {
  const h = aiSorted(g.players[p].hand);
  mulligan(g, p, [h[4], h[3]]);
}

const ring = (x, y) => [3, 5, 7, 10][Math.min(3, x, 8 - x, y, 8 - y)];
const CARD_COST = { [ART]: 6, [TANK]: 5, [SF]: 4, [HW]: 3, [INF]: 1 };

function cardCost(t, numKills, airLeft) {
  if (t == null) return [0, airLeft];
  if (t === AIR) return [airLeft === 2 ? 7 : 13, airLeft - 1];
  if (t === PARA) return [numKills === 0 ? 12 : 2, airLeft];
  return [CARD_COST[t], airLeft];
}

// Puntaje del tablero para la computadora p (calculateScore del original).
function aiScore(board, p, t1, t2, numKills, airLeft, easy) {
  const e = 1 - p;
  // El original tiene la computadora arriba; si jugara abajo, se espeja el tablero.
  const M = (x, y) => cell(x, p === 1 ? y : 8 - y);
  const at = (x, y) => board[M(x, y)];
  const mine = (x, y) => { const u = at(x, y); return !!u && u.o === p; };
  const theirs = (x, y) => { const u = at(x, y); return !!u && u.o === e; };
  let score = easy ? Math.floor(Math.random() * 59) : 0;
  const sup = supplyMap(board, p);

  if (board[BASE[e]] && board[BASE[e]].o === p) return 100000;
  if (!board[BASE[p]]) score -= 100;

  for (let c = 0; c < SIZE * SIZE; c++) {
    const u = board[c];
    if (!u || c === HILL) continue;
    const r = ring(cx(c), cy(c));
    if (u.o === p) {
      score += r;
      let danger = false, almost = false;
      for (const n of neighbors(c, ORTHO)) if (board[n] && board[n].o === e) danger = true;
      for (const n of neighbors(c, DIAG)) {
        if (board[n] && board[n].o === e) { if (board[n].t === HW) danger = true; else almost = true; }
      }
      if (danger) score -= 9; else if (almost) score -= 5;
    } else {
      score -= r;
      if (u.t === HW) score--;
    }
  }

  if (!at(4, 5)) score += 5;
  const supplied = (x, y) => mine(x, y) && sup[M(x, y)];
  if (supplied(3, 5)) score += 4;
  if (supplied(5, 5)) score += 4;
  if (supplied(3, 4)) score += 3;
  if (supplied(5, 4)) score += 3;
  if (theirs(3, 3)) score -= 50;
  if (theirs(5, 3)) score -= 50;
  if (theirs(3, 4)) score -= 20;
  if (theirs(5, 4)) score -= 20;
  const hwAt = (x, y) => mine(x, y) && at(x, y).t === HW;
  if (mine(3, 4) && hwAt(2, 4)) score += 4;
  else if (mine(5, 4) && hwAt(6, 4)) score += 4;

  let cost;
  [cost, airLeft] = cardCost(t1, numKills, airLeft);
  score -= cost;
  [cost, airLeft] = cardCost(t2, numKills, airLeft);
  score -= cost;
  return score;
}

// Todas las formas de jugar una carta t: [{ at, target }]. El ataque es obligatorio si hay blancos.
function* options(board, p, t) {
  if (t === AIR) {
    for (const target of airTargetsB(board, p)) yield { at: null, target };
    return;
  }
  for (const at of legalPlaysB(board, p, t)) {
    board[at] = { t, o: p };
    const targets = attackTargetsB(board, p, t, at);
    if (targets.length) for (const target of targets) yield { at, target };
    else yield { at, target: null };
    board[at] = null;
  }
}

// Aplica una opción al tablero (para probar hipótesis) y devuelve cómo deshacerla.
function applyOpt(board, p, t, o) {
  const saved = o.target != null ? board[o.target] : null;
  if (o.at != null) board[o.at] = { t, o: p };
  if (o.target != null) board[o.target] = null;
  return () => {
    if (o.target != null) board[o.target] = saved;
    if (o.at != null) board[o.at] = null;
  };
}

// Mejor jugada con una sola carta (primer turno o mano de 1 carta): prueba la menos valiosa que se pueda jugar.
function aiSingle(g, p, easy) {
  const board = g.board.slice();
  const pl = g.players[p];
  const airLeft = 2 - pl.played[AIR];
  for (const t of aiSorted(pl.hand).reverse()) {
    let best = null, bestScore = -Infinity;
    for (const o of options(board, p, t)) {
      const undo = applyOpt(board, p, t, o);
      const s = aiScore(board, p, t, null, o.target != null ? 1 : 0, airLeft, easy);
      undo();
      if (s > bestScore) { bestScore = s; best = { t, ...o }; }
    }
    if (best) return best;
  }
  return null;
}

// Plan para un turno de 2 cartas: la mejor combinación (carta 1, lugar, blanco, carta 2, lugar, blanco).
function aiPair(g, p, easy) {
  const board = g.board.slice();
  const pl = g.players[p];
  const airLeft = 2 - pl.played[AIR];
  const hand = aiSorted(pl.hand).reverse();
  const seen = new Set();
  let best = null, bestScore = -Infinity;
  for (let i = 0; i < hand.length; i++) {
    for (let j = 0; j < hand.length; j++) {
      if (i === j) continue;
      const t1 = hand[i], t2 = hand[j];
      if (seen.has(t1 * 10 + t2)) continue;
      seen.add(t1 * 10 + t2);
      for (const o1 of options(board, p, t1)) {
        const undo1 = applyOpt(board, p, t1, o1);
        const k1 = o1.target != null ? 1 : 0;
        for (const o2 of options(board, p, t2)) {
          const undo2 = applyOpt(board, p, t2, o2);
          const s = aiScore(board, p, t1, t2, k1 + (o2.target != null ? 1 : 0), airLeft, easy);
          undo2();
          if (s > bestScore) { bestScore = s; best = [{ t: t1, ...o1 }, { t: t2, ...o2 }]; }
        }
        undo1();
      }
    }
  }
  return best;
}

// Plan del turno: lista de jugadas. app.js las ejecuta de a una (con pausa) usando aiStep.
function aiPlan(g, p, easy) {
  if (g.actions >= 2 && g.players[p].hand.length >= 2) {
    const pair = aiPair(g, p, easy);
    if (pair) return pair;
  }
  const one = aiSingle(g, p, easy);
  return one ? [one] : [];
}

function isValidStep(g, p, s) {
  if (!s || !g.players[p].hand.includes(s.t)) return false;
  if (s.t === AIR) return airTargetsB(g.board, p).includes(s.target);
  return legalPlaysB(g.board, p, s.t).includes(s.at);
}

// Ejecuta una jugada del plan (o, si ya no vale, la mejor jugada suelta; o descarta).
function aiStep(g, p, step, easy) {
  if (!isValidStep(g, p, step)) step = aiSingle(g, p, easy);
  if (!step) {
    const t = aiSorted(g.players[p].hand).pop();
    discard(g, p, t);
    return { p, kind: 'discard', t };
  }
  if (step.t === AIR) {
    airstrike(g, p, step.target);
  } else {
    const targets = deploy(g, p, step.t, step.at);
    if (targets.length) attack(g, p, targets.includes(step.target) ? step.target : targets[0]);
  }
  return step;
}

if (typeof module !== 'undefined') module.exports = { aiMulligan, aiPlan, aiStep, aiScore };
