'use strict';
// Reglas de The Battle for Hill 218 (sin DOM). Mismas coordenadas que el original de Java:
// tablero de 9×9, celda (x, y) con y creciendo hacia abajo y la colina en (4, 4).
// Jugador 0: base en (4, 5), avanza hacia arriba. Jugador 1: base en (4, 3), avanza hacia abajo.

const SIZE = 9;
const AIR = 0, ART = 1, HW = 2, INF = 3, PARA = 4, SF = 5, TANK = 6;

const UNITS = [
  { key: 'air', name: 'Ataque aéreo', count: 2 },
  { key: 'artillery', name: 'Artillería', count: 3 },
  { key: 'heavy', name: 'Armas pesadas', count: 5 },
  { key: 'infantry', name: 'Infantería', count: 7 },
  { key: 'para', name: 'Paracaidistas', count: 3 },
  { key: 'special', name: 'Fuerzas especiales', count: 3 },
  { key: 'tank', name: 'Tanque', count: 3 },
];
// Orden para mostrar la mano: unidades comunes primero, ataques aéreos al final.
const HAND_ORDER = [INF, HW, SF, PARA, TANK, ART, AIR];

const cell = (x, y) => y * SIZE + x;
const cx = (c) => c % SIZE;
const cy = (c) => (c / SIZE) | 0;
const inside = (x, y) => x >= 0 && x < SIZE && y >= 0 && y < SIZE;
const HILL = cell(4, 4);
const BASE = [cell(4, 5), cell(4, 3)];
const FWD = [-1, 1];
const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ALL8 = [...ORTHO, ...DIAG];

function neighbors(c, dirs) {
  const x = cx(c), y = cy(c), out = [];
  for (const [dx, dy] of dirs) if (inside(x + dx, y + dy)) out.push(cell(x + dx, y + dy));
  return out;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ================= Partida nueva =================
// opts: { mode: 'hard' | 'easy' | 'two', color: 'blue' | 'green', first: 0 | 1 }
function newGame(opts) {
  const players = [0, 1].map(() => {
    const deck = [];
    UNITS.forEach((u, t) => { if (t !== AIR) for (let i = 0; i < u.count; i++) deck.push(t); });
    shuffle(deck); // el tope del mazo es el final del arreglo
    const hand = deck.splice(-5);
    return { deck, hand, played: UNITS.map(() => 0), lost: UNITS.map(() => 0), mull: false, out: false };
  });
  return {
    v: 1,
    mode: opts.mode,
    colors: [opts.color, opts.color === 'blue' ? 'green' : 'blue'],
    first: opts.first,
    board: new Array(SIZE * SIZE).fill(null),
    players,
    phase: 'mulligan',
    turn: 1 - opts.first, // descarta primero quien juega segundo
    actions: 0,
    perTurn: 1,
    turnNo: 0,
    firstTurn: true,
    pending: null,   // { from, t, targets } cuando una unidad recién desplegada debe elegir a quién atacar
    thisTurn: [],    // jugadas del turno en curso
    lastTurn: [],    // jugadas del turno anterior (del otro jugador)
    winner: null,    // 0 | 1 | 'draw'
    reason: null,    // 'base' | 'count'
  };
}

// Elegir 2 cartas de la mano inicial para poner debajo del mazo.
function mulligan(g, p, types) {
  const pl = g.players[p];
  for (const t of types) {
    const i = pl.hand.indexOf(t);
    if (i < 0) throw new Error('carta inexistente');
    pl.hand.splice(i, 1);
    pl.deck.unshift(t);
  }
  pl.hand.push(AIR, AIR);
  pl.mull = true;
  if (!g.players[1 - p].mull) g.turn = 1 - p;
  else {
    g.phase = 'play';
    startTurn(g, g.first);
  }
}

// ================= Suministro =================
// Una unidad en la base propia está abastecida. Desde una unidad abastecida, el suministro pasa a
// las unidades propias vecinas en horizontal/vertical (salvo Fuerzas especiales) y a las Fuerzas
// especiales propias en diagonal.
function supplyMap(board, p) {
  const s = new Array(SIZE * SIZE).fill(false);
  const base = BASE[p];
  if (!board[base]) return s;
  s[base] = true;
  const stack = [base];
  while (stack.length) {
    const c = stack.pop();
    const x = cx(c), y = cy(c);
    for (const [dx, dy] of ALL8) {
      if (!inside(x + dx, y + dy)) continue;
      const n = cell(x + dx, y + dy);
      if (s[n] || n === HILL) continue;
      const u = board[n];
      if (!u || u.o !== p) continue;
      const diag = dx !== 0 && dy !== 0;
      if (diag ? u.t === SF : u.t !== SF) { s[n] = true; stack.push(n); }
    }
  }
  return s;
}

// Lugares donde el jugador p puede desplegar una unidad del tipo t.
function legalPlaysB(board, p, t, supply = supplyMap(board, p)) {
  const out = [];
  for (let c = 0; c < SIZE * SIZE; c++) {
    if (c === HILL || board[c]) continue;
    if (c === BASE[p]) { out.push(c); continue; }
    const ortho = () => neighbors(c, ORTHO).some((n) => supply[n]);
    if (t === PARA) { if (c !== BASE[1 - p] || ortho()) out.push(c); }
    else if (t === SF) { if (neighbors(c, DIAG).some((n) => supply[n])) out.push(c); }
    else if (ortho()) out.push(c);
  }
  return out;
}

// Un ataque contra c está apoyado si hay al menos 2 unidades de p que lo rodean en horizontal/vertical
// (o Armas pesadas en diagonal). La unidad que ataca cuenta como una de ellas.
function isSupported(board, p, c) {
  let n = 0;
  for (const m of neighbors(c, ORTHO)) if (board[m] && board[m].o === p) n++;
  for (const m of neighbors(c, DIAG)) if (board[m] && board[m].o === p && board[m].t === HW) n++;
  return n >= 2;
}

// Unidades enemigas que puede atacar una unidad tipo t de p recién desplegada en c.
function attackTargetsB(board, p, t, c) {
  const x = cx(c), y = cy(c), f = FWD[p];
  let spots, needSupport;
  if (t === ART) { spots = [[x, y + 3 * f], [x, y + 2 * f], [x - 1, y + 2 * f], [x + 1, y + 2 * f]]; needSupport = false; }
  else if (t === HW) { spots = DIAG.map(([dx, dy]) => [x + dx, y + dy]); needSupport = true; }
  else if (t === TANK) { spots = ORTHO.map(([dx, dy]) => [x + dx, y + dy]); needSupport = false; }
  else { spots = ORTHO.map(([dx, dy]) => [x + dx, y + dy]); needSupport = true; }
  const out = [];
  for (const [tx, ty] of spots) {
    if (!inside(tx, ty)) continue;
    const n = cell(tx, ty), u = board[n];
    if (u && u.o !== p && (!needSupport || isSupported(board, p, n))) out.push(n);
  }
  return out;
}

function airTargetsB(board, p) {
  const out = [];
  board.forEach((u, c) => { if (u && u.o !== p) out.push(c); });
  return out;
}

// ================= Consultas para la interfaz =================
const legalPlays = (g, p, t) => (t === AIR ? airTargetsB(g.board, p) : legalPlaysB(g.board, p, t));
function canPlay(g, p, t) { return g.players[p].hand.includes(t) && legalPlays(g, p, t).length > 0; }
function canPlayAny(g, p) { return [...new Set(g.players[p].hand)].some((t) => canPlay(g, p, t)); }
function unitsOnBoard(g, p) { return g.board.filter((u) => u && u.o === p).length; }

// ================= Jugadas =================
function takeFromHand(g, p, t) {
  const h = g.players[p].hand, i = h.indexOf(t);
  if (i < 0) throw new Error('la carta no está en la mano');
  h.splice(i, 1);
  g.players[p].played[t]++;
}

function kill(g, c) {
  const u = g.board[c];
  g.players[u.o].lost[u.t]++;
  g.board[c] = null;
  return u.t;
}

// Despliega una unidad. Devuelve los blancos que puede atacar (si hay, queda pendiente elegir uno).
function deploy(g, p, t, c) {
  if (g.phase !== 'play' || g.turn !== p || g.pending || t === AIR) throw new Error('jugada inválida');
  if (!legalPlaysB(g.board, p, t).includes(c)) throw new Error('lugar inválido');
  takeFromHand(g, p, t);
  g.board[c] = { t, o: p };
  const ev = { p, kind: 'deploy', t, at: c, killed: null, killedAt: null };
  g.thisTurn.push(ev);
  if (c === BASE[1 - p]) { // ocupó la base enemiga: gana en el acto
    finish(g, p, 'base');
    return [];
  }
  const targets = attackTargetsB(g.board, p, t, c);
  if (targets.length) g.pending = { from: c, t, targets };
  else endAction(g);
  return targets;
}

function attack(g, p, target) {
  if (!g.pending || g.turn !== p || !g.pending.targets.includes(target)) throw new Error('blanco inválido');
  const ev = g.thisTurn[g.thisTurn.length - 1];
  ev.killedAt = target;
  ev.killed = kill(g, target);
  g.pending = null;
  endAction(g);
}

function airstrike(g, p, target) {
  if (g.phase !== 'play' || g.turn !== p || g.pending) throw new Error('jugada inválida');
  if (!airTargetsB(g.board, p).includes(target)) throw new Error('blanco inválido');
  takeFromHand(g, p, AIR);
  const killedAt = target, killed = kill(g, target);
  g.thisTurn.push({ p, kind: 'air', t: AIR, at: null, killed, killedAt });
  endAction(g);
}

// Agregado de esta versión: si ninguna carta de la mano se puede jugar, se descarta una.
function discard(g, p, t) {
  if (g.phase !== 'play' || g.turn !== p || g.pending || canPlayAny(g, p)) throw new Error('jugada inválida');
  takeFromHand(g, p, t);
  g.thisTurn.push({ p, kind: 'discard', t, at: null, killed: null, killedAt: null });
  endAction(g);
}

function endAction(g) {
  if (g.phase !== 'play') return;
  g.actions--;
  if (g.actions > 0 && g.players[g.turn].hand.length) return;
  g.firstTurn = false;
  startTurn(g, 1 - g.turn);
}

// El primer turno de la partida roba y juega 1 carta; los demás, 2.
function startTurn(g, p) {
  g.lastTurn = g.thisTurn.length ? g.thisTurn : g.lastTurn.filter((e) => e.p !== p);
  g.thisTurn = [];
  g.turn = p;
  g.turnNo++;
  const pl = g.players[p];
  const n = g.firstTurn ? 1 : 2;
  for (let i = 0; i < n && pl.deck.length; i++) pl.hand.push(pl.deck.pop());
  if (!pl.hand.length) {
    pl.out = true;
    if (g.players[1 - p].out) return finishByCount(g);
    g.lastTurn.push({ p, kind: 'out' });
    return startTurn(g, 1 - p);
  }
  g.perTurn = Math.min(n, pl.hand.length);
  g.actions = g.perTurn;
}

function finishByCount(g) {
  const a = unitsOnBoard(g, 0), b = unitsOnBoard(g, 1);
  finish(g, a > b ? 0 : b > a ? 1 : 'draw', 'count');
}

function finish(g, winner, reason) {
  g.phase = 'over';
  g.winner = winner;
  g.reason = reason;
  g.pending = null;
  g.actions = 0;
  if (g.thisTurn.length) { g.lastTurn = g.thisTurn; g.thisTurn = []; }
}

if (typeof module !== 'undefined') {
  module.exports = {
    SIZE, AIR, ART, HW, INF, PARA, SF, TANK, UNITS, HAND_ORDER, HILL, BASE, FWD, ORTHO, DIAG,
    cell, cx, cy, inside, neighbors, newGame, mulligan, supplyMap, legalPlaysB, attackTargetsB, airTargetsB,
    isSupported, legalPlays, canPlay, canPlayAny, unitsOnBoard, deploy, attack, airstrike, discard,
  };
}
