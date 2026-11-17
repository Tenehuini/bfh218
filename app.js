'use strict';

const $ = (sel) => document.querySelector(sel);
const SAVE_KEY = 'bfh218.partida';
const PREFS_KEY = 'bfh218.opciones';
const AI_DELAY = +(new URLSearchParams(location.search).get("delay") ?? 1100);

let game = null;
let sel = null;        // tipo de carta elegida en la mano
let mullSel = [];      // índices de la mano elegidos para poner debajo del mazo
let aiBusy = false;
let aiToken = 0;       // invalida un turno de la computadora en curso si se sale de la partida
let coverFor = null;   // dos jugadores: a quién ya se le pasó el celular
let anim = { drop: new Set(), boom: new Set() };

const PLURAL = new Set([HW, PARA, SF]);
const isAI = (g = game) => g.mode !== 'two';
const viewer = () => (isAI() ? 0 : game.turn);
const who = (p) => (isAI() ? (p === 0 ? 'Vos' : 'Computadora') : `Jugador ${p + 1}`);
const subject = (p) => (isAI() ? 'La computadora' : `Jugador ${p + 1}`);
const nm = (t) => UNITS[t].name;
const poss = (t, base) => `${PLURAL.has(t) ? base + 's' : base} ${nm(t)}`;
const imgSrc = (t, color) => (t === 'hill' ? 'assets/cards/hill.webp' : `assets/cards/${UNITS[t].key}_${color}.webp`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

const INFO = {
  [INF]: ['Recibe suministro de una unidad vecina en horizontal o vertical.', 'Ataca en horizontal o vertical. Necesita apoyo.', 'Apoya ataques contra enemigos que tenga al lado (horizontal o vertical).'],
  [HW]: ['Recibe suministro de una unidad vecina en horizontal o vertical.', 'Ataca en diagonal. Necesita apoyo.', 'Apoya ataques contra enemigos que tenga alrededor, también en diagonal.'],
  [SF]: ['Recibe suministro de una unidad vecina en diagonal.', 'Ataca en horizontal o vertical. Necesita apoyo.', 'Apoya ataques contra enemigos que tenga al lado (horizontal o vertical).'],
  [TANK]: ['Recibe suministro de una unidad vecina en horizontal o vertical.', 'Ataca en horizontal o vertical sin necesitar apoyo.', 'Apoya ataques contra enemigos que tenga al lado (horizontal o vertical).'],
  [ART]: ['Recibe suministro de una unidad vecina en horizontal o vertical.', 'Ataca 2 lugares hacia adelante, a los costados de ese lugar o 3 hacia adelante, sin necesitar apoyo.', 'Apoya ataques contra enemigos que tenga al lado (horizontal o vertical).'],
  [PARA]: ['Se puede desplegar en cualquier lugar libre aunque no tenga suministro (menos en la base enemiga).', 'Ataca en horizontal o vertical. Necesita apoyo.', 'Apoya ataques contra enemigos que tenga al lado (horizontal o vertical).'],
  [AIR]: ['En lugar de desplegar una unidad, destruye cualquier unidad enemiga del tablero.', 'Se usa una sola vez. Cada ejército tiene 2.'],
};

// ================= Guardado y opciones =================
function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(game)); } catch { /* sin storage */ }
}
function loadSaved() {
  try {
    const g = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (g && g.v === 1 && g.phase !== 'over' && Array.isArray(g.board) && g.board.length === 81 && g.players?.length === 2) return g;
  } catch { /* nada guardado */ }
  return null;
}
function clearSaved() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* sin storage */ }
}

function getPrefs() {
  const val = (name) => document.querySelector(`input[name="${name}"]:checked`)?.value;
  return { mode: val('mode'), color: val('color'), order: val('order') };
}
function setPrefs(p) {
  for (const [name, v] of Object.entries(p)) {
    const r = document.querySelector(`input[name="${name}"][value="${v}"]`);
    if (r) r.checked = true;
  }
}
function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(getPrefs())); } catch { /* sin storage */ }
}
function refreshOptionLabels() {
  const two = getPrefs().mode === 'two';
  $('#color-legend').textContent = two ? 'Ejército de Jugador 1' : 'Tu ejército';
  $('#order-legend').textContent = two ? 'Empieza' : 'Empezás';
  $('#order-first').textContent = two ? 'Jugador 1' : 'Primero';
  $('#order-second').textContent = two ? 'Jugador 2' : 'Segundo';
}

// ================= Pantallas y diálogos =================
function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.toggleAttribute('data-active', s.id === id));
  window.scrollTo(0, 0);
}
function openDialog(d) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }
function closeDialog(d) { if (d.close) d.close(); else d.removeAttribute('open'); }

// ================= Textos =================
function describe(e, v) {
  const mine = e.p === v, S = subject(e.p);
  if (e.kind === 'out') return mine ? 'No te quedan cartas: pasás el turno.' : `${S} no tiene más cartas.`;
  if (e.kind === 'discard') return mine ? `Descartaste ${nm(e.t)}.` : `${S} descartó ${nm(e.t)} (no la podía jugar).`;
  if (e.kind === 'air') return mine ? `Ataque aéreo: destruiste ${poss(e.killed, 'su')}.` : `${S} usó un ataque aéreo y destruyó ${poss(e.killed, 'tu')}.`;
  let s = mine ? `Desplegaste ${nm(e.t)}` : `${S} desplegó ${nm(e.t)}`;
  if (e.killed != null) s += mine ? ` y destruiste ${poss(e.killed, 'su')}` : ` y destruyó ${poss(e.killed, 'tu')}`;
  return s + '.';
}

function openZoom(t, color, opts = {}) {
  $('#zoom-title').textContent = opts.title || nm(t);
  const img = $('#zoom-img');
  img.src = imgSrc(t, color);
  img.alt = nm(t);
  const facts = [...(opts.pre || []), ...(INFO[t] || [])];
  if (t !== AIR) facts.push(`Cada ejército tiene ${UNITS[t].count}.`);
  $('#zoom-info').replaceChildren(...facts.map((f) => el('li', '', f)));
  openDialog($('#zoom-dialog'));
}

function zoomBoard(c) {
  const v = viewer();
  if (c === HILL) {
    $('#zoom-title').textContent = 'Colina 218';
    $('#zoom-img').src = imgSrc('hill');
    $('#zoom-info').replaceChildren(el('li', '', 'Nadie puede desplegar en la colina.'), el('li', '', 'Las bases son los lugares pegados a sus lados cortos: la tuya abajo y la enemiga arriba.'));
    openDialog($('#zoom-dialog'));
    return;
  }
  const u = game.board[c];
  const supplied = supplyMap(game.board, u.o)[c];
  const owner = u.o === v ? (isAI() ? 'Tuya' : `De ${who(u.o)} (tuya)`) : (isAI() ? 'Enemiga' : `De ${who(u.o)} (enemiga)`);
  openZoom(u.t, game.colors[u.o], {
    pre: [`${owner} · ${supplied ? 'con suministro' : 'sin suministro'}.`],
  });
}

// ================= Dibujo =================
function humanTurn() {
  return game.phase === 'play' && !aiBusy && (!isAI() || game.turn === 0);
}

function marks() {
  const out = { place: [], targets: [] };
  if (!humanTurn()) return out;
  const p = game.turn;
  if (game.pending) out.targets = game.pending.targets;
  else if (sel === AIR) out.targets = airTargetsB(game.board, p);
  else if (sel != null) out.place = legalPlaysB(game.board, p, sel);
  return out;
}

// Jugadas del rival a resaltar: las del turno anterior o las del turno en curso de la computadora.
function rivalEvents() {
  const v = viewer();
  return [...game.lastTurn, ...game.thisTurn].filter((e) => e.p !== v && e.kind !== 'out');
}

function renderHeader() {
  const g = game, v = viewer();
  let title, sub = '';
  if (g.phase === 'mulligan') {
    title = isAI() ? 'Preparación' : `Preparación · ${who(g.turn)}`;
    sub = 'Elegí 2 cartas para el fondo del mazo';
  } else if (g.phase === 'over') {
    title = 'Fin de la partida';
  } else if (g.turn === v && !aiBusy) {
    title = isAI() ? 'Tu turno' : `Turno de ${who(g.turn)}`;
    sub = `Jugada ${g.perTurn - g.actions + 1} de ${g.perTurn}`;
  } else {
    title = 'Turno de la computadora';
  }
  $('#turn-title').textContent = title;
  $('#turn-sub').textContent = sub;
}

function renderArmies() {
  const g = game, v = viewer();
  [v, 1 - v].forEach((p, i) => {
    const box = $(`#army-${i}`), pl = g.players[p];
    box.className = `army is-${g.colors[p]}` + (g.phase === 'play' && g.turn === p ? ' is-turn' : '');
    box.replaceChildren(
      el('b', '', who(p)),
      el('span', '', `Mazo ${pl.deck.length} · Mano ${pl.hand.filter((t) => t !== AIR).length}`),
      el('span', '', `Aéreos ${2 - pl.played[AIR]} · En el campo ${unitsOnBoard(g, p)}`),
    );
  });
}

function renderBoard() {
  const g = game, v = viewer(), m = marks();
  const ev = rivalEvents();
  const last = new Set(ev.filter((e) => e.at != null && g.board[e.at]).map((e) => e.at));
  const booms = new Set(ev.filter((e) => e.killedAt != null && !g.board[e.killedAt]).map((e) => e.killedAt));
  const mineNew = new Set(g.thisTurn.filter((e) => e.p === v && e.at != null).map((e) => e.at));
  const place = new Set(m.place), targets = new Set(m.targets);

  // Zona a mostrar: bases, colina, alrededor de cada unidad y lugares marcados.
  let x0 = 3, x1 = 5, y0 = 2, y1 = 6;
  const inc = (x, y) => { if (inside(x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } };
  g.board.forEach((u, c) => { if (u) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) inc(cx(c) + dx, cy(c) + dy); });
  [...place, ...targets, ...booms].forEach((c) => inc(cx(c), cy(c)));
  const cols = x1 - x0 + 1, rows = y1 - y0 + 1;

  const board = $('#board');
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const x = v === 0 ? x0 + k : x1 - k;
      const y = v === 0 ? y0 + r : y1 - r;
      const c = cell(x, y);
      const b = el('button', 'cell');
      b.type = 'button';
      b.dataset.c = c;
      const u = g.board[c];
      if (c === HILL) {
        b.classList.add('has-unit');
        const img = el('img'); img.src = imgSrc('hill'); img.alt = 'Colina 218';
        b.append(img);
      } else if (u) {
        b.classList.add('has-unit');
        if (u.o !== v) b.classList.add('is-enemy');
        const img = el('img'); img.src = imgSrc(u.t, g.colors[u.o]); img.alt = '';
        b.append(img);
        b.setAttribute('aria-label', `${nm(u.t)} ${u.o === v ? 'propia' : 'enemiga'}`);
        if (last.has(c)) b.classList.add('is-last');
        if (mineNew.has(c)) b.classList.add('is-mine-new');
        if (anim.drop.has(c)) b.classList.add('drop');
      } else {
        if (c === BASE[v] || c === BASE[1 - v]) {
          b.classList.add('is-base');
          b.append(el('span', 'base-label', c === BASE[v] ? 'Tu base' : 'Base enemiga'));
        }
        if (booms.has(c)) b.append(el('span', 'boom' + (anim.boom.has(c) ? ' anim' : ''), '💥'));
        b.setAttribute('aria-label', 'Lugar libre');
      }
      if (place.has(c)) { b.classList.add('can-place'); b.setAttribute('aria-label', 'Desplegar acá'); }
      if (targets.has(c)) { b.classList.add('can-target'); b.setAttribute('aria-label', `Atacar ${nm(u.t)}`); }
      cells.push(b);
    }
  }
  board.replaceChildren(...cells);
  board.dataset.cols = cols;
  board.dataset.rows = rows;
  anim = { drop: new Set(), boom: new Set() };
  sizeBoard();
}

function sizeBoard() {
  const board = $('#board'), wrap = $('#board-wrap');
  const cols = +board.dataset.cols || 3, rows = +board.dataset.rows || 5, gap = 3;
  const w = (wrap.clientWidth - gap * (cols - 1)) / cols;
  const h = (wrap.clientHeight - gap * (rows - 1)) / rows / 1.43;
  const cw = Math.max(18, Math.floor(Math.min(w, h, 92)));
  board.style.setProperty('--cw', `${cw}px`);
  board.style.gridTemplateColumns = `repeat(${cols}, ${cw}px)`;
}

function promptButton(text, fn, main) {
  const b = el('button', 'mini' + (main ? ' is-main' : ''), text);
  b.type = 'button';
  b.addEventListener('click', fn);
  return b;
}

function renderPrompt() {
  const g = game, v = viewer(), box = $('#prompt');
  let text = '', cls = '';
  const btns = [];
  let log = [];

  if (g.phase === 'mulligan') {
    text = `Elegí 2 cartas para poner debajo del mazo (${mullSel.length} de 2).`;
    const ok = promptButton('Confirmar', confirmMulligan, true);
    ok.disabled = mullSel.length !== 2;
    btns.push(ok);
  } else if (g.phase === 'over') {
    cls = 'is-win';
    text = resultText().title;
    btns.push(promptButton('Jugar de nuevo', playAgain, true), promptButton('Inicio', goHome));
  } else if (!humanTurn()) {
    cls = 'is-wait';
    log = g.thisTurn.filter((e) => e.p !== v).map((e) => describe(e, v));
    text = 'La computadora está pensando';
  } else {
    const p = g.turn;
    if (!g.thisTurn.length) log = g.lastTurn.filter((e) => e.p !== p).map((e) => describe(e, p));
    const stuck = !canPlayAny(g, p);
    if (g.pending) {
      cls = 'is-aim';
      text = `${nm(g.pending.t)} ataca: tocá el blanco marcado en rojo.`;
    } else if (sel == null) {
      text = stuck ? 'Ninguna carta se puede jugar: elegí una para descartar.' : 'Elegí una carta de tu mano.';
    } else {
      const color = g.colors[p];
      if (stuck) {
        text = `${nm(sel)} no se puede jugar.`;
        btns.push(promptButton(`Descartar ${nm(sel)}`, () => humanAct(() => discard(g, p, sel)), true));
      } else if (sel === AIR) {
        cls = 'is-aim';
        text = canPlay(g, p, AIR) ? 'Ataque aéreo: tocá la unidad enemiga a destruir.' : 'No hay unidades enemigas para atacar.';
      } else {
        text = canPlay(g, p, sel) ? `Tocá un lugar verde para desplegar ${nm(sel)}.` : `${nm(sel)} no se puede desplegar ahora.`;
      }
      const t = sel;
      btns.push(promptButton('Ver carta', () => openZoom(t, color)), promptButton('Cancelar', () => { sel = null; render(); }));
    }
  }

  box.className = 'prompt' + (cls ? ' ' + cls : '');
  $('#log').replaceChildren(...log.map((s) => el('li', '', s)));
  const pt = $('#prompt-text');
  pt.textContent = text;
  pt.classList.toggle('dots', cls === 'is-wait');
  $('#prompt-btns').replaceChildren(...btns);
}

function renderHand() {
  const g = game, box = $('#hand');
  const p = isAI() ? 0 : g.turn;
  const pl = g.players[p], color = g.colors[p];
  box.classList.toggle('is-hidden', !isAI() && coverFor !== g.turn && g.phase !== 'over');
  if (g.phase === 'mulligan') {
    box.replaceChildren(...pl.hand.map((t, i) => {
      const b = el('button', 'hcard');
      b.type = 'button';
      const img = el('img'); img.src = imgSrc(t, color); img.alt = nm(t);
      const out = mullSel.includes(i);
      b.classList.toggle('is-out', out);
      b.append(img, el('span', '', out ? '↓ Al fondo' : nm(t)));
      b.addEventListener('click', () => toggleMull(i));
      return b;
    }));
    return;
  }
  if (!pl.hand.length) { box.replaceChildren(el('p', 'hand-empty', 'No te quedan cartas en la mano.')); return; }
  const mine = humanTurn() && !g.pending;
  const stuck = mine && !canPlayAny(g, p);
  box.replaceChildren(...HAND_ORDER.filter((t) => pl.hand.includes(t)).map((t) => {
    const n = pl.hand.filter((h) => h === t).length;
    const b = el('button', 'hcard');
    b.type = 'button';
    const img = el('img'); img.src = imgSrc(t, color); img.alt = '';
    b.append(img, el('span', '', nm(t)));
    if (n > 1) b.append(el('b', 'count', `×${n}`));
    b.setAttribute('aria-label', `${nm(t)}${n > 1 ? `, ${n} cartas` : ''}`);
    if (sel === t) b.classList.add('is-sel');
    if (!mine) b.disabled = true;
    else if (!stuck && !canPlay(g, p, t)) b.classList.add('is-dim');
    b.addEventListener('click', () => { sel = sel === t ? null : t; render(); });
    return b;
  }));
}

function renderCover() {
  const g = game;
  const need = !isAI() && g.phase !== 'over' && coverFor !== g.turn;
  $('#cover').hidden = !need;
  if (!need) return;
  $('#cover-title').textContent = `Turno de ${who(g.turn)}`;
  $('#cover-text').textContent = g.phase === 'mulligan'
    ? `Pasale el celular a ${who(g.turn)} para que elija sus cartas iniciales.`
    : `Pasale el celular a ${who(g.turn)}. Que el otro jugador no mire la mano.`;
}

function render() {
  if (!game) return;
  renderHeader();
  renderArmies();
  renderPrompt();
  renderHand();
  renderCover();
  renderBoard();
}

// ================= Acciones =================
function toggleMull(i) {
  if (mullSel.includes(i)) mullSel = mullSel.filter((j) => j !== i);
  else if (mullSel.length < 2) mullSel.push(i);
  else mullSel = [mullSel[1], i];
  render();
}

function confirmMulligan() {
  if (mullSel.length !== 2) return;
  const p = game.turn, hand = game.players[p].hand;
  mulligan(game, p, mullSel.map((i) => hand[i]));
  mullSel = [];
  afterChange();
}

// Después de un cambio de estado: computadora, pasar el celular o fin de partida.
function afterChange() {
  sel = null;
  if (isAI() && game.phase === 'mulligan' && game.turn === 1) aiMulligan(game, 1);
  if (game.phase === 'over') {
    clearSaved();
    render();
    setTimeout(showEnd, 900);
    return;
  }
  save();
  render();
  if (isAI() && game.phase === 'play' && game.turn === 1) runAI();
}

function markAnim(e) {
  if (!e) return;
  if (e.at != null) anim.drop.add(e.at);
  if (e.killedAt != null) anim.boom.add(e.killedAt);
}
function lastEventOf(p) {
  return [...game.lastTurn, ...game.thisTurn].filter((e) => e.p === p).pop();
}

function humanAct(fn) {
  const p = game.turn;
  fn();
  markAnim(lastEventOf(p));
  if (game.pending) { sel = null; save(); render(); return; }
  afterChange();
}

$('#board').addEventListener('click', (e) => {
  const b = e.target.closest('.cell');
  if (!b || !game) return;
  const c = +b.dataset.c, m = marks(), p = game.turn;
  if (m.targets.includes(c)) {
    if (game.pending) humanAct(() => attack(game, p, c));
    else humanAct(() => airstrike(game, p, c));
  } else if (m.place.includes(c)) {
    const t = sel;
    humanAct(() => deploy(game, p, t, c));
  } else if (c === HILL || game.board[c]) {
    zoomBoard(c);
  } else if (sel != null) {
    sel = null;
    render();
  }
});

async function runAI() {
  if (aiBusy) return;
  const g = game, token = ++aiToken, easy = g.mode === 'easy';
  aiBusy = true;
  render();
  await wait(AI_DELAY * 0.7);
  let plan = null, planTurn = -1, i = 0;
  while (token === aiToken && g.phase === 'play' && g.turn === 1) {
    if (planTurn !== g.turnNo) {
      plan = aiPlan(g, 1, easy);
      planTurn = g.turnNo;
      i = 0;
    }
    aiStep(g, 1, plan[i++], easy);
    markAnim(lastEventOf(1));
    if (g.phase === 'over') break;
    save();
    render();
    if (g.turn === 1) await wait(AI_DELAY);
  }
  if (token !== aiToken) return;
  aiBusy = false;
  if (g.phase === 'over') { afterChange(); return; }
  save();
  render();
  navigator.vibrate?.(40);
}

// ================= Fin de partida =================
function resultText() {
  const g = game, w = g.winner;
  const a = unitsOnBoard(g, 0), b = unitsOnBoard(g, 1);
  if (isAI()) {
    const title = w === 'draw' ? '¡Empate!' : w === 0 ? '¡Ganaste!' : 'Perdiste';
    const msg = g.reason === 'base'
      ? (w === 0 ? 'Ocupaste la base enemiga.' : 'La computadora ocupó tu base.')
      : `Se terminaron las cartas. Unidades en el tablero: vos ${a}, la computadora ${b}.`;
    return { title, msg, emoji: w === 'draw' ? '🤝' : w === 0 ? '🎖️' : '💀', win: w === 0, lose: w === 1 };
  }
  const title = w === 'draw' ? '¡Empate!' : `¡Ganó ${who(w)}!`;
  const msg = g.reason === 'base'
    ? `${who(w)} ocupó la base enemiga.`
    : `Se terminaron las cartas. Unidades en el tablero: Jugador 1 ${a}, Jugador 2 ${b}.`;
  return { title, msg, emoji: w === 'draw' ? '🤝' : '🎖️', win: w !== 'draw', lose: false };
}

function showEnd() {
  if (!game || game.phase !== 'over' || !$('#screen-game').hasAttribute('data-active')) return;
  const r = resultText();
  const d = $('#end-dialog');
  d.classList.toggle('is-win', r.win);
  d.classList.toggle('is-lose', r.lose);
  $('#end-emoji').textContent = r.emoji;
  $('#end-title').textContent = r.title;
  $('#end-msg').textContent = r.msg;
  if (r.lose) navigator.vibrate?.([120, 60, 220]);
  openDialog(d);
}

// ================= Ejércitos y bajas =================
function openLosses() {
  const g = game, v = viewer(), body = $('#losses-body');
  body.replaceChildren(...[v, 1 - v].map((p) => {
    const pl = g.players[p], color = g.colors[p];
    const sec = el('section', 'loss-army');
    const h = el('h3');
    h.append(el('i', `dot ${color}`), document.createTextNode(`${who(p)} · ejército ${color === 'blue' ? 'azul' : 'verde'}`));
    sec.append(h);
    const onBoard = (t) => g.board.filter((u) => u && u.o === p && u.t === t).length;
    for (const t of HAND_ORDER) {
      const row = el('div', 'loss-row');
      const img = el('img'); img.src = imgSrc(t, color); img.alt = '';
      const info = el('div', '', nm(t));
      const left = UNITS[t].count - pl.played[t];
      info.append(el('small', '', t === AIR
        ? `${left} sin usar de ${UNITS[t].count}`
        : `${onBoard(t)} en el tablero · ${left} por salir · ${UNITS[t].count} en total`));
      const n = t === AIR ? pl.played[t] : pl.lost[t];
      const lost = el('span', 'lost' + (n ? '' : ' zero'), t === AIR ? `${n} usado${n === 1 ? '' : 's'}` : `${n} 💀`);
      row.append(img, info, lost);
      sec.append(row);
    }
    const lostTotal = pl.lost.reduce((a, b) => a + b, 0);
    sec.append(el('p', 'loss-sum', `Bajas: ${lostTotal} · En el tablero: ${unitsOnBoard(g, p)} · Mazo: ${pl.deck.length}`));
    return sec;
  }));
  openDialog($('#losses-dialog'));
}
$('#armies').addEventListener('click', () => { if (game) openLosses(); });
$('#losses-ok').addEventListener('click', () => closeDialog($('#losses-dialog')));

// ================= Partida nueva / continuar =================
function startGame() {
  const prefs = getPrefs();
  const first = prefs.order === 'first' ? 0 : prefs.order === 'second' ? 1 : Math.random() < 0.5 ? 0 : 1;
  aiToken++;
  aiBusy = false;
  game = newGame({ mode: prefs.mode, color: prefs.color, first });
  game.order = prefs.order;
  sel = null;
  mullSel = [];
  coverFor = null;
  show('screen-game');
  afterChange();
}

function playAgain() {
  closeDialog($('#end-dialog'));
  if (game) setPrefs({ mode: game.mode, color: game.colors[0], order: game.order || 'random' });
  startGame();
}

function goHome() {
  aiToken++;
  aiBusy = false;
  refreshHome();
  show('screen-home');
}

function refreshHome() {
  const saved = loadSaved();
  const btn = $('#continue-btn');
  btn.hidden = !saved;
  if (saved) {
    const vs = saved.mode === 'two' ? 'dos jugadores' : saved.mode === 'easy' ? 'computadora fácil' : 'computadora difícil';
    btn.textContent = `Continuar partida (${vs})`;
  }
}

$('#play-btn').addEventListener('click', () => { savePrefs(); startGame(); });
$('#continue-btn').addEventListener('click', () => {
  const saved = loadSaved();
  if (!saved) return refreshHome();
  aiToken++;
  aiBusy = false;
  game = saved;
  sel = null;
  mullSel = [];
  coverFor = null;
  show('screen-game');
  afterChange();
});
document.querySelectorAll('.options input').forEach((i) => i.addEventListener('change', () => { savePrefs(); refreshOptionLabels(); }));

$('#cover-ok').addEventListener('click', () => { coverFor = game.turn; render(); });

// Salir de la partida
const quitDlg = $('#quit-dialog');
$('#quit-game').addEventListener('click', () => { if (game?.phase === 'over') goHome(); else openDialog(quitDlg); });
$('#quit-yes').addEventListener('click', () => { closeDialog(quitDlg); goHome(); });
$('#quit-no').addEventListener('click', () => closeDialog(quitDlg));

// Fin de partida
$('#end-again').addEventListener('click', playAgain);
$('#end-board').addEventListener('click', () => closeDialog($('#end-dialog')));
$('#end-home').addEventListener('click', () => { closeDialog($('#end-dialog')); goHome(); });

// Carta en grande
$('#zoom-ok').addEventListener('click', () => closeDialog($('#zoom-dialog')));

// Reglas
const rulesDlg = $('#rules-dialog');
$('#rules-btn').addEventListener('click', () => openDialog(rulesDlg));
$('#game-rules').addEventListener('click', () => openDialog(rulesDlg));
$('#rules-ok').addEventListener('click', () => closeDialog(rulesDlg));

// ---------- Cómo instalar ----------
function setInstallTab(os) {
  document.querySelectorAll('.install-tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.os === os)));
  document.querySelectorAll('.install-panel').forEach((p) => { p.hidden = p.dataset.os !== os; });
}
function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
}
$('#open-install').addEventListener('click', () => {
  // Arranca en la pestaña del celular que se está usando; la otra sigue disponible.
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  setInstallTab(ios ? 'ios' : 'android');
  $('#install-done').hidden = !isStandalone();
  openDialog($('#install-dialog'));
});
document.querySelectorAll('.install-tab').forEach((t) => t.addEventListener('click', () => setInstallTab(t.dataset.os)));
// Copiar la dirección del juego (para pegarla en Chrome o Safari).
document.querySelectorAll('.copy-url').forEach((b) => b.addEventListener('click', () => {
  const done = () => { b.textContent = '¡Copiado!'; setTimeout(() => { b.textContent = 'Copiar'; }, 2000); };
  const selectText = () => { const r = document.createRange(); r.selectNodeContents(b.previousElementSibling); const s = getSelection(); s.removeAllRanges(); s.addRange(r); };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(b.dataset.url).then(done, selectText);
  else selectText();
}));
$('#install-ok').addEventListener('click', () => closeDialog($('#install-dialog')));

// Tocar fuera de un diálogo lo cierra (salvo el de fin de partida).
document.querySelectorAll('dialog.sheet:not(.end)').forEach((d) => d.addEventListener('click', (e) => {
  if (e.target === d) closeDialog(d);
}));

// ================= Arranque =================
setPrefs({ mode: 'hard', color: 'blue', order: 'first' });
try { const p = JSON.parse(localStorage.getItem(PREFS_KEY)); if (p) setPrefs(p); } catch { /* sin storage */ }
refreshOptionLabels();
refreshHome();
if (window.ResizeObserver) new ResizeObserver(() => { if (game) sizeBoard(); }).observe($('#board-wrap'));
else window.addEventListener('resize', () => { if (game) sizeBoard(); });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
