const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("mazeCanvas"));
const ctx = canvas.getContext("2d", { alpha: false });

const sizeSelect = /** @type {HTMLSelectElement} */ (document.getElementById("sizeSelect"));
const newBtn = document.getElementById("newBtn");
const resetBtn = document.getElementById("resetBtn");
const solveBtn = document.getElementById("solveBtn");
const tiltBtn = document.getElementById("tiltBtn");
const rotateOverlay = document.getElementById("rotateOverlay");
const statusText = document.getElementById("statusText");
const timeText = document.getElementById("timeText");

if (!ctx) throw new Error("Canvas 2D context unavailable");

/** @typedef {{x:number,y:number}} Pt */

/**
 * Maze stored as bitmask per cell.
 * Bits: 1=N, 2=E, 4=S, 8=W. Bit set => opening in that direction.
 */
class Maze {
  /** @param {number} w @param {number} h */
  constructor(w, h) {
    this.w = w;
    this.h = h;
    /** @type {Uint8Array} */
    this.cells = new Uint8Array(w * h);
  }
  /** @param {number} x @param {number} y */
  idx(x, y) {
    return y * this.w + x;
  }
  /** @param {number} x @param {number} y */
  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  /** @param {number} x @param {number} y */
  get(x, y) {
    return this.cells[this.idx(x, y)];
  }
  /** @param {number} x @param {number} y @param {number} v */
  set(x, y, v) {
    this.cells[this.idx(x, y)] = v;
  }
}

const DIRS = [
  { bit: 1, dx: 0, dy: -1, opp: 4 }, // N
  { bit: 2, dx: 1, dy: 0, opp: 8 }, // E
  { bit: 4, dx: 0, dy: 1, opp: 1 }, // S
  { bit: 8, dx: -1, dy: 0, opp: 2 }, // W
];

/** @param {number} n */
function clampInt(n) {
  n = Number(n);
  if (!Number.isFinite(n)) return 15;
  return Math.max(5, Math.min(60, Math.floor(n)));
}

/** @param {number} maxExclusive */
function randInt(maxExclusive) {
  return Math.floor(Math.random() * maxExclusive);
}

/** @template T @param {T[]} a */
function shuffleInPlace(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Perfect maze via iterative DFS backtracker.
 * @param {number} w
 * @param {number} h
 */
function generateMaze(w, h) {
  const m = new Maze(w, h);
  const visited = new Uint8Array(w * h);

  /** @type {Pt[]} */
  const stack = [];
  stack.push({ x: 0, y: 0 });
  visited[m.idx(0, 0)] = 1;

  while (stack.length) {
    const cur = stack[stack.length - 1];
    const options = [];
    for (const d of DIRS) {
      const nx = cur.x + d.dx;
      const ny = cur.y + d.dy;
      if (!m.inBounds(nx, ny)) continue;
      const ni = m.idx(nx, ny);
      if (visited[ni]) continue;
      options.push(d);
    }

    if (options.length === 0) {
      stack.pop();
      continue;
    }

    shuffleInPlace(options);
    const d = options[0];
    const nx = cur.x + d.dx;
    const ny = cur.y + d.dy;

    m.set(cur.x, cur.y, m.get(cur.x, cur.y) | d.bit);
    m.set(nx, ny, m.get(nx, ny) | d.opp);
    visited[m.idx(nx, ny)] = 1;
    stack.push({ x: nx, y: ny });
  }

  return m;
}

/**
 * BFS shortest path on maze openings.
 * @param {Maze} m
 * @param {Pt} start
 * @param {Pt} goal
 * @returns {Pt[]} path including start+goal, or empty if none.
 */
function solveMaze(m, start, goal) {
  const w = m.w;
  const h = m.h;
  const n = w * h;
  const prev = new Int32Array(n);
  prev.fill(-1);
  const q = new Int32Array(n);
  let qs = 0, qe = 0;
  const s = m.idx(start.x, start.y);
  const g = m.idx(goal.x, goal.y);
  q[qe++] = s;
  prev[s] = s;

  while (qs < qe) {
    const i = q[qs++];
    if (i === g) break;
    const x = i % w;
    const y = (i / w) | 0;
    const mask = m.get(x, y);
    for (const d of DIRS) {
      if ((mask & d.bit) === 0) continue;
      const nx = x + d.dx;
      const ny = y + d.dy;
      if (!m.inBounds(nx, ny)) continue;
      const ni = m.idx(nx, ny);
      if (prev[ni] !== -1) continue;
      prev[ni] = i;
      q[qe++] = ni;
    }
  }

  if (prev[g] === -1) return [];
  /** @type {Pt[]} */
  const path = [];
  let cur = g;
  while (cur !== s) {
    const x = cur % w;
    const y = (cur / w) | 0;
    path.push({ x, y });
    cur = prev[cur];
  }
  path.push({ x: start.x, y: start.y });
  path.reverse();
  return path;
}

function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Rendering + game state */
let maze = generateMaze(15, 15);
/** @type {Pt} */
let start = { x: 0, y: 0 };
/** @type {Pt} */
let goal = { x: maze.w - 1, y: maze.h - 1 };
/** @type {Pt} */
let playerCell = { x: 0, y: 0 };
/** @type {{x:number,y:number}} */
let playerDraw = { x: 0, y: 0 };
let moveAnim = null; // {from:Pt,to:Pt,t0:number,dur:number}
/** @type {Pt[]} */
let solutionPath = solveMaze(maze, start, goal);
let showSolution = false;
let won = false;
let startTimeMs = 0;
let running = false;
let rafId = 0;

// tilt controls (mobile orientation)
let tiltEnabled = false;
let tiltSupported = false;
let tiltGamma = 0; // left/right (-90..90)
let tiltBeta = 0;  // front/back (-180..180)
let lastTiltMoveMs = 0;
let tiltPausedForRotation = false;

function setStatus(msg) {
  if (statusText) statusText.textContent = msg;
}
function setTime(ms) {
  if (timeText) timeText.textContent = formatTime(ms);
}

function resetRunClock() {
  startTimeMs = performance.now();
  running = true;
}

function newGame(size) {
  const n = clampInt(size);
  setStatus("Generating…");
  maze = generateMaze(n, n);
  start = { x: 0, y: 0 };
  goal = { x: maze.w - 1, y: maze.h - 1 };
  playerCell = { x: start.x, y: start.y };
  playerDraw = { x: start.x, y: start.y };
  moveAnim = null;
  solutionPath = solveMaze(maze, start, goal);
  won = false;
  showSolution = false;
  if (solveBtn) solveBtn.textContent = "Show solution";
  setTime(0);
  resetRunClock();
  setStatus("Good luck");
  render();
}

function resetPlayer() {
  playerCell = { x: start.x, y: start.y };
  playerDraw = { x: start.x, y: start.y };
  moveAnim = null;
  won = false;
  resetRunClock();
  setStatus("Reset");
  render();
}

/** @param {number} dx @param {number} dy */
function tryMove(dx, dy) {
  if (won) return;
  if (moveAnim) return;
  const x = playerCell.x;
  const y = playerCell.y;
  let dir = null;
  if (dx === 0 && dy === -1) dir = DIRS[0];
  else if (dx === 1 && dy === 0) dir = DIRS[1];
  else if (dx === 0 && dy === 1) dir = DIRS[2];
  else if (dx === -1 && dy === 0) dir = DIRS[3];
  if (!dir) return;

  const mask = maze.get(x, y);
  if ((mask & dir.bit) === 0) return;
  const nx = x + dir.dx;
  const ny = y + dir.dy;
  if (!maze.inBounds(nx, ny)) return;
  const from = { x, y };
  const to = { x: nx, y: ny };
  playerCell = to;

  if (nx === goal.x && ny === goal.y) {
    won = true;
    running = false;
    setStatus("You escaped!");
  } else {
    setStatus("Keep going");
  }
  const now = performance.now();
  moveAnim = { from, to, t0: now, dur: 190 };
}

function setCanvasSizeToDisplay() {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const rect = canvas.getBoundingClientRect();
  const maxBelowTop = Math.max(280, Math.floor(window.innerHeight - rect.top - 24));
  const targetCssPx = Math.floor(Math.min(rect.width, maxBelowTop));
  const target = Math.max(320, Math.min(980, targetCssPx));
  const px = Math.floor(target * dpr);
  if (canvas.width !== px || canvas.height !== px) {
    canvas.width = px;
    canvas.height = px;
  }
}

function render() {
  setCanvasSizeToDisplay();
  const W = canvas.width;
  const H = canvas.height;
  ctx.fillStyle = "#0b1020";
  ctx.fillRect(0, 0, W, H);

  const pad = Math.max(14, Math.floor(W * 0.04));
  const cell = Math.floor((Math.min(W, H) - pad * 2) / maze.w);
  const ox = Math.floor((W - cell * maze.w) / 2);
  const oy = Math.floor((H - cell * maze.h) / 2);

  // grid backdrop
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  ctx.fillRect(ox, oy, cell * maze.w, cell * maze.h);

  // start/goal cells
  drawCellFill(ox, oy, cell, start.x, start.y, "rgba(124,92,255,0.35)");
  drawCellFill(ox, oy, cell, goal.x, goal.y, "rgba(34,197,94,0.33)");

  // solution path overlay (behind walls/player)
  if (showSolution && solutionPath.length) {
    ctx.save();
    ctx.strokeStyle = "rgba(124,92,255,0.70)";
    ctx.lineWidth = Math.max(2, Math.floor(cell * 0.14));
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let i = 0; i < solutionPath.length; i++) {
      const p = solutionPath[i];
      const cx = ox + p.x * cell + cell / 2;
      const cy = oy + p.y * cell + cell / 2;
      if (i === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    }
    ctx.stroke();
    ctx.restore();
  }

  // walls
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = Math.max(2, Math.floor(cell * 0.10));
  ctx.lineCap = "square";
  ctx.translate(0.5, 0.5); // crisp-ish lines
  for (let y = 0; y < maze.h; y++) {
    for (let x = 0; x < maze.w; x++) {
      const mask = maze.get(x, y);
      const x0 = ox + x * cell;
      const y0 = oy + y * cell;
      const x1 = x0 + cell;
      const y1 = y0 + cell;
      // draw walls where there is NO opening
      if ((mask & 1) === 0) line(x0, y0, x1, y0);
      if ((mask & 2) === 0) line(x1, y0, x1, y1);
      if ((mask & 4) === 0) line(x0, y1, x1, y1);
      if ((mask & 8) === 0) line(x0, y0, x0, y1);
    }
  }
  ctx.restore();

  // player
  const px = ox + playerDraw.x * cell + cell / 2;
  const py = oy + playerDraw.y * cell + cell / 2;
  const pr = Math.max(4, Math.floor(cell * 0.28));
  drawSteelBall(px, py, pr, won);

  // label
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.font = `600 ${Math.max(12, Math.floor(cell * 0.34))}px ui-sans-serif, system-ui`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(`${maze.w}×${maze.h}`, ox, Math.max(10, oy - Math.floor(cell * 0.7)));
  ctx.restore();
}

/**
 * Draw a steel-ish 3D ball using layered gradients.
 * @param {number} x
 * @param {number} y
 * @param {number} r
 * @param {boolean} isWon
 */
function drawSteelBall(x, y, r, isWon) {
  const shadowBlur = Math.max(8, Math.floor(r * 1.05));
  const shadowOffset = Math.max(2, Math.floor(r * 0.45));

  // soft ground shadow
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(x + shadowOffset * 0.55, y + shadowOffset, r * 0.95, r * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = shadowBlur;
  ctx.shadowOffsetY = Math.max(1, Math.floor(r * 0.18));

  // base steel gradient
  const hx = x - r * 0.35;
  const hy = y - r * 0.45;
  const g = ctx.createRadialGradient(hx, hy, Math.max(1, r * 0.15), x, y, r);
  if (isWon) {
    // green-tinted "steel" for the win state
    g.addColorStop(0.0, "rgba(232, 255, 242, 0.98)");
    g.addColorStop(0.25, "rgba(140, 255, 195, 0.92)");
    g.addColorStop(0.55, "rgba(34, 197, 94, 0.92)");
    g.addColorStop(1.0, "rgba(12, 88, 40, 0.98)");
  } else {
    g.addColorStop(0.0, "rgba(255,255,255,0.98)");
    g.addColorStop(0.22, "rgba(210,220,230,0.95)");
    g.addColorStop(0.55, "rgba(130,145,160,0.96)");
    g.addColorStop(1.0, "rgba(38,45,56,0.98)");
  }

  ctx.beginPath();
  ctx.fillStyle = g;
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // specular highlight
  ctx.shadowBlur = 0;
  const s1 = ctx.createRadialGradient(x - r * 0.40, y - r * 0.48, 0, x - r * 0.40, y - r * 0.48, r * 0.7);
  s1.addColorStop(0, "rgba(255,255,255,0.85)");
  s1.addColorStop(0.25, "rgba(255,255,255,0.30)");
  s1.addColorStop(1, "rgba(255,255,255,0.00)");
  ctx.fillStyle = s1;
  ctx.beginPath();
  ctx.arc(x - r * 0.18, y - r * 0.22, r * 0.85, 0, Math.PI * 2);
  ctx.fill();

  // subtle rim / edge
  ctx.strokeStyle = isWon ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.22)";
  ctx.lineWidth = Math.max(1, Math.floor(r * 0.12));
  ctx.beginPath();
  ctx.arc(x, y, r - ctx.lineWidth * 0.5, 0, Math.PI * 2);
  ctx.stroke();

  // tiny sharp glint
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath();
  ctx.arc(x - r * 0.42, y - r * 0.48, Math.max(1, r * 0.12), 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function line(x0, y0, x1, y1) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function drawCellFill(ox, oy, cell, x, y, fill) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.fillRect(ox + x * cell + 1, oy + y * cell + 1, cell - 2, cell - 2);
  ctx.restore();
}

// input: keyboard
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === "arrowup" || k === "w") { e.preventDefault(); tryMove(0, -1); }
  else if (k === "arrowright" || k === "d") { e.preventDefault(); tryMove(1, 0); }
  else if (k === "arrowdown" || k === "s") { e.preventDefault(); tryMove(0, 1); }
  else if (k === "arrowleft" || k === "a") { e.preventDefault(); tryMove(-1, 0); }
  else if (k === "r") { e.preventDefault(); resetPlayer(); }
  else if (k === "n") { e.preventDefault(); newGame(sizeSelect?.value ?? 15); }
  else if (k === "h") { e.preventDefault(); toggleSolution(); }
});

function toggleSolution() {
  showSolution = !showSolution;
  if (solveBtn) solveBtn.textContent = showSolution ? "Hide solution" : "Show solution";
  render();
}

// input: touch swipe / mouse drag
let pointerActive = false;
/** @type {{x:number,y:number,t:number}|null} */
let pointerStart = null;

canvas.addEventListener("pointerdown", (e) => {
  pointerActive = true;
  pointerStart = { x: e.clientX, y: e.clientY, t: performance.now() };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointerup", (e) => {
  if (!pointerActive || !pointerStart) return;
  pointerActive = false;
  const dx = e.clientX - pointerStart.x;
  const dy = e.clientY - pointerStart.y;
  const dt = performance.now() - pointerStart.t;
  pointerStart = null;
  // small swipes ignored
  const dist = Math.hypot(dx, dy);
  if (dist < 18 || dt > 900) return;
  if (Math.abs(dx) > Math.abs(dy)) tryMove(dx > 0 ? 1 : -1, 0);
  else tryMove(0, dy > 0 ? 1 : -1);
});
canvas.addEventListener("pointercancel", () => {
  pointerActive = false;
  pointerStart = null;
});

function isDeviceOrientationSupported() {
  return typeof window.DeviceOrientationEvent !== "undefined";
}

async function enableTiltControls() {
  if (!isDeviceOrientationSupported()) {
    setStatus("Tilt not supported");
    return;
  }

  // iOS 13+ requires explicit permission from a user gesture.
  const anyDOE = /** @type {any} */ (window.DeviceOrientationEvent);
  if (typeof anyDOE?.requestPermission === "function") {
    try {
      const res = await anyDOE.requestPermission();
      if (res !== "granted") {
        setStatus("Tilt permission denied");
        return;
      }
    } catch {
      setStatus("Tilt permission blocked");
      return;
    }
  }

  tiltEnabled = true;
  if (tiltBtn) tiltBtn.textContent = "Tilt on";
  setStatus("Tilt enabled");
  await enterTiltPlayMode();
}

function disableTiltControls() {
  tiltEnabled = false;
  if (tiltBtn) tiltBtn.textContent = "Enable tilt";
  setStatus("Tilt off");
  document.body.classList.remove("tilt-mode");
  document.body.classList.remove("rotate-warning");
  document.body.classList.remove("landscape-compensate");
  tiltPausedForRotation = false;
  if (document.fullscreenElement) {
    document.exitFullscreen?.().catch?.(() => {});
  }
}

function toggleTiltControls() {
  if (tiltEnabled) disableTiltControls();
  else void enableTiltControls();
}

window.addEventListener("deviceorientation", (e) => {
  // gamma: left/right, beta: front/back
  if (typeof e.gamma === "number") tiltGamma = tiltGamma * 0.75 + e.gamma * 0.25;
  if (typeof e.beta === "number") tiltBeta = tiltBeta * 0.75 + e.beta * 0.25;
}, { passive: true });

async function enterTiltPlayMode() {
  document.body.classList.add("tilt-mode");

  // Fullscreen + orientation lock are best-effort (varies by browser).
  try {
    // Request fullscreen on the whole document for best Android support.
    const el = document.documentElement;
    await el.requestFullscreen?.({ navigationUI: "hide" });
  } catch {
    // ignore
  }
  await tryLockOrientation();

  render();
}

async function tryLockOrientation() {
  try {
    await screen.orientation?.lock?.("portrait-primary");
    return;
  } catch {
    // ignore
  }
  try {
    await screen.orientation?.lock?.("portrait");
  } catch {
    // ignore
  }
}

function isLandscapeNow() {
  // Prefer matchMedia; works broadly.
  return window.matchMedia?.("(orientation: landscape)")?.matches ?? (window.innerWidth > window.innerHeight);
}

function updateRotationGuardUI() {
  const shouldWarn = tiltEnabled && isLandscapeNow();
  tiltPausedForRotation = shouldWarn;
  document.body.classList.toggle("rotate-warning", shouldWarn);
  document.body.classList.toggle("landscape-compensate", tiltEnabled && isLandscapeNow());
  if (rotateOverlay) {
    rotateOverlay.setAttribute("aria-hidden", shouldWarn ? "false" : "true");
  }
}

// UI wiring
newBtn?.addEventListener("click", () => newGame(sizeSelect?.value ?? 15));
resetBtn?.addEventListener("click", () => resetPlayer());
solveBtn?.addEventListener("click", () => toggleSolution());
sizeSelect?.addEventListener("change", () => newGame(sizeSelect.value));
tiltBtn?.addEventListener("click", () => toggleTiltControls());

// animation loop for timer
function tick() {
  rafId = requestAnimationFrame(tick);
  if (!running) return;
  const ms = performance.now() - startTimeMs;
  setTime(ms);

  // movement animation (smooth between cells)
  if (moveAnim) {
    const now = performance.now();
    const t = Math.min(1, (now - moveAnim.t0) / moveAnim.dur);
    const e = 1 - Math.pow(1 - t, 3); // easeOutCubic
    playerDraw.x = moveAnim.from.x + (moveAnim.to.x - moveAnim.from.x) * e;
    playerDraw.y = moveAnim.from.y + (moveAnim.to.y - moveAnim.from.y) * e;
    if (t >= 1) {
      playerDraw.x = moveAnim.to.x;
      playerDraw.y = moveAnim.to.y;
      moveAnim = null;
    }
    render();
  }

  // tilt-to-move (cell steps with cooldown)
  if (tiltEnabled && !won && !tiltPausedForRotation) {
    const now = performance.now();
    const cooldownMs = 190;
    const dead = 10; // degrees

    // Decide move direction from strongest axis
    const ax = tiltGamma; // + => right
    const ay = tiltBeta;  // + => down (phone top toward user => negative beta, but we keep simple)
    let mdx = 0, mdy = 0;

    if (Math.abs(ax) > Math.abs(ay)) {
      if (ax > dead) mdx = 1;
      else if (ax < -dead) mdx = -1;
    } else {
      if (ay > dead) mdy = 1;
      else if (ay < -dead) mdy = -1;
    }

    if ((mdx !== 0 || mdy !== 0) && (now - lastTiltMoveMs) >= cooldownMs) {
      lastTiltMoveMs = now;
      tryMove(mdx, mdy);
    }
  }
}

window.addEventListener("resize", () => { updateRotationGuardUI(); render(); }, { passive: true });
window.addEventListener("orientationchange", () => { updateRotationGuardUI(); void tryLockOrientation(); }, { passive: true });

// start
newGame(sizeSelect?.value ?? 15);
cancelAnimationFrame(rafId);
tick();

// init tilt UI visibility
tiltSupported = isDeviceOrientationSupported();
if (tiltBtn) {
  tiltBtn.style.display = tiltSupported ? "" : "none";
}

// if the user exits fullscreen manually, restore layout (keep tilt enabled)
document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement && tiltEnabled) {
    document.body.classList.remove("tilt-mode");
  }
  updateRotationGuardUI();
  void tryLockOrientation();
}, { passive: true });

updateRotationGuardUI();
