// Play Puck Level 1 - v0.1 prototype
// Flippers rest DOWN and flip UP (pinball correct)

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const elScore = document.getElementById("score");
const elMult  = document.getElementById("mult");
const elBanks = document.getElementById("banks");

const btnLaunch = document.getElementById("btnLaunch");
const btnReset  = document.getElementById("btnReset");

const W = canvas.width;
const H = canvas.height;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const len2 = (x,y) => x*x+y*y;
const rand = (a,b) => a + Math.random()*(b-a);

let score = 0;
let bankHits = 0;
let mult = 1;

// Table geometry
const table = {
  inset: 22,
  drainY: H - 40,
  goal: { x: W/2, y: 220, w: 130, h: 16 },
};

// Bumpers
const bumpers = [
  { x: 95,  y: 140, r: 18 },
  { x: 240, y: 110, r: 20 },
  { x: 385, y: 140, r: 18 },
  { x: 140, y: 420, r: 18 },
  { x: 340, y: 420, r: 18 },
];

// Puck
const puck = {
  x: W/2,
  y: H - 120,
  r: 12,
  vx: 0,
  vy: 0,
  launched: false,
  stuck: true,
};

// ✅ FIXED FLIPPERS
const flippers = {
  left: {
    pivot: { x: W/2 - 95, y: H - 120 },
    len: 95,
    baseAngle: 0.55,      // resting DOWN
    hitAngle: -0.55,      // flips UP
    angle: 0.55,
    pressed: false,
    key: "a",
  },
  right: {
    pivot: { x: W/2 + 95, y: H - 120 },
    len: 95,
    baseAngle: Math.PI - 0.55,   // resting DOWN
    hitAngle:  Math.PI + 0.55,   // flips UP
    angle: Math.PI - 0.55,
    pressed: false,
    key: "l",
  }
};

const input = {
  launch: false,
  nudgeL: false,
  nudgeR: false,
};

function setHUD(){
  elScore.textContent = score;
  elMult.textContent = `x${mult}`;
  elBanks.textContent = bankHits;
}

function resetGame(){
  score = 0;
  bankHits = 0;
  mult = 1;
  puck.x = W/2;
  puck.y = H - 120;
  puck.vx = 0;
  puck.vy = 0;
  puck.launched = false;
  puck.stuck = true;
  setHUD();
}

function launchPuck(){
  if (!puck.stuck) return;
  puck.stuck = false;
  puck.launched = true;
  puck.vx = rand(-40, 40);
  puck.vy = -520;
}

btnLaunch.onclick = launchPuck;
btnReset.onclick = resetGame;

window.addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  if (k === " ") { input.launch = true; e.preventDefault(); }
  if (k === "q") input.nudgeL = true;
  if (k === "p") input.nudgeR = true;
  if (k === "a") flippers.left.pressed = true;
  if (k === "l") flippers.right.pressed = true;
});

window.addEventListener("keyup", e => {
  const k = e.key.toLowerCase();
  if (k === " ") input.launch = false;
  if (k === "q") input.nudgeL = false;
  if (k === "p") input.nudgeR = false;
  if (k === "a") flippers.left.pressed = false;
  if (k === "l") flippers.right.pressed = false;
});

const GRAV = 760;
const AIR  = 0.995;
const REST = 0.88;
const MAXS = 1200;

let last = performance.now();
let bankDecayTimer = 0;

function step(now){
  const dt = Math.min(0.02, (now - last) / 1000);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(step);
}

function update(dt){
  if (input.launch){
    launchPuck();
    input.launch = false;
  }

  // ✅ Snappy UP, slower DOWN
  for (const f of [flippers.left, flippers.right]){
    const target = f.pressed ? f.hitAngle : f.baseAngle;
    const speed = f.pressed ? 32 : 18;
    f.angle += clamp(target - f.angle, -speed*dt, speed*dt);
  }

  if (puck.stuck){
    puck.x = W/2;
    puck.y = H - 120;
    puck.vx = puck.vy = 0;
    return;
  }

  if (input.nudgeL) puck.vx -= 120 * dt;
  if (input.nudgeR) puck.vx += 120 * dt;

  puck.vy += GRAV * dt;
  puck.x += puck.vx * dt;
  puck.y += puck.vy * dt;

  puck.vx *= AIR;
  puck.vy *= AIR;

  puck.vx = clamp(puck.vx, -MAXS, MAXS);
  puck.vy = clamp(puck.vy, -MAXS, MAXS);

  const L = table.inset;
  const R = W - table.inset;
  const T = table.inset;
  const B = table.drainY;

  if (puck.x - puck.r < L){ puck.x = L + puck.r; puck.vx = -puck.vx * REST; }
  if (puck.x + puck.r > R){ puck.x = R - puck.r; puck.vx = -puck.vx * REST; }
  if (puck.y - puck.r < T){ puck.y = T + puck.r; puck.vy = -puck.vy * REST; }

  if (puck.y - puck.r > B){
    score -= 500;
    resetGame();
    return;
  }

  for (const b of bumpers){
    const dx = puck.x - b.x;
    const dy = puck.y - b.y;
    const rr = puck.r + b.r;
    if (len2(dx,dy) < rr*rr){
      const d = Math.hypot(dx,dy) || 1;
      const nx = dx / d;
      const ny = dy / d;
      puck.x = b.x + nx * rr;
      puck.y = b.y + ny * rr;
      const vn = puck.vx*nx + puck.vy*ny;
      puck.vx -= 2*vn*nx;
      puck.vy -= 2*vn*ny;
      puck.vx *= REST;
      puck.vy *= REST;
      bankHits++;
      mult = bankHits >= 7 ? 8 : bankHits >= 4 ? 4 : bankHits >= 2 ? 2 : 1;
      score += 150 * mult;
      setHUD();
    }
  }

  collideWithFlipper(flippers.left);
  collideWithFlipper(flippers.right);
}

function flipperEndpoints(f){
  return {
    x1: f.pivot.x,
    y1: f.pivot.y,
    x2: f.pivot.x + Math.cos(f.angle) * f.len,
    y2: f.pivot.y + Math.sin(f.angle) * f.len,
  };
}

function collideWithFlipper(f){
  const { x1,y1,x2,y2 } = flipperEndpoints(f);
  const vx = x2-x1, vy = y2-y1;
  const wx = puck.x-x1, wy = puck.y-y1;
  const t = clamp((wx*vx+wy*vy)/(vx*vx+vy*vy),0,1);
  const cx = x1+t*vx, cy = y1+t*vy;
  const dx = puck.x-cx, dy = puck.y-cy;
  const d2 = dx*dx+dy*dy;
  if (d2 < (puck.r+8)**2){
    const d = Math.sqrt(d2)||1;
    const nx = dx/d, ny = dy/d;
    puck.x = cx + nx*(puck.r+8);
    puck.y = cy + ny*(puck.r+8);
    const vn = puck.vx*nx + puck.vy*ny;
    puck.vx -= 2*vn*nx;
    puck.vy -= 2*vn*ny;
    if (f.pressed){
      puck.vx += nx*420;
      puck.vy += ny*420;
    }
    puck.vx *= REST;
    puck.vy *= REST;
  }
}

function draw(){
  ctx.clearRect(0,0,W,H);
  drawFlipper(flippers.left);
  drawFlipper(flippers.right);
  ctx.beginPath();
  ctx.arc(puck.x,puck.y,puck.r,0,Math.PI*2);
  ctx.fillStyle="#eef";
  ctx.fill();
}

function drawFlipper(f){
  const { x1,y1,x2,y2 } = flipperEndpoints(f);
  ctx.lineWidth=18;
  ctx.lineCap="round";
  ctx.strokeStyle = f.pressed ? "#4fa3ff" : "#2f7dff";
  ctx.beginPath();
  ctx.moveTo(x1,y1);
  ctx.lineTo(x2,y2);
  ctx.stroke();
}

resetGame();
requestAnimationFrame(step);
