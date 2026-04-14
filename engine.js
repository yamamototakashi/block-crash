// Engine layer: constants, entity classes, physics helpers.
// Exposed via `window.Engine`.

(function (global) {
  'use strict';

  const W = 400, H = 640, HUD_H = 50;
  const FIELD_OX = 20;
  const FIELD_W = W - FIELD_OX * 2;
  const BLOCK_COLS = 8;
  const BLOCK_PAD = 2;
  const BLOCK_W = (FIELD_W - BLOCK_PAD * (BLOCK_COLS - 1)) / BLOCK_COLS;
  const BLOCK_H = 18;
  const BLOCK_OY = HUD_H + 28;

  const PADDLE_Y = H - 58;
  const PADDLE_H = 12;
  const PADDLE_W_DEFAULT = 78;
  const PADDLE_W_WIDE = 118;
  const PADDLE_W_NARROW = 50;

  const BALL_R = 7;
  const MIN_BALL_VY = 60; // prevent nearly-horizontal flight

  const PALETTE = [
    '#ff4d6d', // 1
    '#ff9f1c', // 2
    '#ffd60a', // 3
    '#70e000', // 4
    '#00d1ff', // 5
    '#5e60ce', // 6
    '#c77dff'  // 7
  ];

  const ITEM_COLORS = {
    M: '#00d1ff', // multi ball
    W: '#70e000', // wide paddle
    N: '#ff4d6d', // narrow paddle (chaos)
    F: '#ff9f1c', // fire ball
    L: '#ffd60a', // laser
    S: '#c77dff', // slow
    P: '#ff4d6d'  // plus life
  };
  const ITEM_LABELS = {
    M: 'M', W: 'W', N: 'N', F: 'F', L: 'L', S: 'S', P: '+'
  };

  // Circle-rect collision returns a normal and overlap, or null.
  function circleRect(cx, cy, r, rx, ry, rw, rh) {
    const nearestX = Math.max(rx, Math.min(cx, rx + rw));
    const nearestY = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - nearestX;
    const dy = cy - nearestY;
    const distSq = dx * dx + dy * dy;
    if (distSq >= r * r) return null;
    let nx, ny, dist;
    if (distSq < 0.0001) {
      // Center is inside the rect: resolve along nearest edge.
      const leftDist = cx - rx;
      const rightDist = (rx + rw) - cx;
      const topDist = cy - ry;
      const botDist = (ry + rh) - cy;
      const m = Math.min(leftDist, rightDist, topDist, botDist);
      if (m === leftDist)       { nx = -1; ny = 0; dist = -leftDist; }
      else if (m === rightDist) { nx = 1;  ny = 0; dist = -rightDist; }
      else if (m === topDist)   { nx = 0;  ny = -1; dist = -topDist; }
      else                      { nx = 0;  ny = 1;  dist = -botDist; }
    } else {
      dist = Math.sqrt(distSq);
      nx = dx / dist;
      ny = dy / dist;
    }
    return { nx: nx, ny: ny, overlap: r - dist };
  }

  class Block {
    constructor(col, row, type, colorIdx) {
      this.col = col;
      this.row = row;
      this.x = FIELD_OX + col * (BLOCK_W + BLOCK_PAD);
      this.y = BLOCK_OY + row * (BLOCK_H + BLOCK_PAD);
      this.w = BLOCK_W;
      this.h = BLOCK_H;
      this.type = type;
      this.colorIdx = colorIdx; // 0..6 or -1 for rainbow
      this.hp = (type === 'T') ? 2 : 1;
      this.alive = true;
      this.flash = 0;
      this.scale = 1;
      this.marked = false; // for chain processing
    }
    colorHex() {
      if (this.type === 'R') return 'rainbow';
      const idx = this.colorIdx;
      return PALETTE[((idx % PALETTE.length) + PALETTE.length) % PALETTE.length];
    }
  }

  class Ball {
    constructor(x, y, vx, vy) {
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.r = BALL_R;
      this.stuck = false;
      this.stuckOffset = 0;
      this.fireUntil = 0;
      this.trail = [];
    }
  }

  class Paddle {
    constructor() {
      this.w = PADDLE_W_DEFAULT;
      this.h = PADDLE_H;
      this.x = W / 2 - this.w / 2;
      this.y = PADDLE_Y;
      this.targetX = this.x;
      this.wideUntil = 0;
      this.narrowUntil = 0;
      this.laserUntil = 0;
      this.laserCooldown = 0;
    }
    get cx() { return this.x + this.w / 2; }
    setTargetCenter(cx) {
      this.targetX = Math.max(FIELD_OX, Math.min(W - FIELD_OX - this.w, cx - this.w / 2));
    }
    update(dt) {
      const now = performance.now();
      let desiredW = PADDLE_W_DEFAULT;
      if (now < this.wideUntil) desiredW = PADDLE_W_WIDE;
      if (now < this.narrowUntil) desiredW = PADDLE_W_NARROW;
      // Smoothly change width
      this.w += (desiredW - this.w) * Math.min(1, dt * 10);
      // Clamp target on resize
      this.targetX = Math.max(FIELD_OX, Math.min(W - FIELD_OX - this.w, this.targetX));
      // Smooth move
      const k = Math.min(1, dt * 22);
      this.x += (this.targetX - this.x) * k;
      if (this.laserCooldown > 0) this.laserCooldown -= dt;
    }
  }

  class Item {
    constructor(x, y, kind) {
      this.x = x; this.y = y; this.vy = 120;
      this.kind = kind; // M/W/N/F/L/S/P
      this.w = 22; this.h = 22;
      this.alive = true;
      this.spin = 0;
    }
  }

  class Laser {
    constructor(x) {
      this.x = x; this.y = PADDLE_Y - 4;
      this.vy = -700;
      this.alive = true;
    }
  }

  class Particle {
    constructor(x, y, vx, vy, color, life, size) {
      this.x = x; this.y = y;
      this.vx = vx; this.vy = vy;
      this.color = color;
      this.life = life; this.maxLife = life;
      this.size = size || 3;
    }
  }

  // Limit ball angle so it doesn't become too horizontal.
  function clampBallAngle(ball) {
    const speed = Math.hypot(ball.vx, ball.vy) || 1;
    if (Math.abs(ball.vy) < MIN_BALL_VY) {
      ball.vy = (ball.vy < 0 ? -1 : 1) * MIN_BALL_VY;
      // Rescale vx to preserve speed
      const vx2 = speed * speed - ball.vy * ball.vy;
      ball.vx = (ball.vx < 0 ? -1 : 1) * Math.sqrt(Math.max(0, vx2));
    }
  }

  global.Engine = {
    W: W, H: H, HUD_H: HUD_H,
    FIELD_OX: FIELD_OX, FIELD_W: FIELD_W,
    BLOCK_COLS: BLOCK_COLS, BLOCK_PAD: BLOCK_PAD, BLOCK_W: BLOCK_W, BLOCK_H: BLOCK_H, BLOCK_OY: BLOCK_OY,
    PADDLE_Y: PADDLE_Y, PADDLE_H: PADDLE_H,
    PADDLE_W_DEFAULT: PADDLE_W_DEFAULT, PADDLE_W_WIDE: PADDLE_W_WIDE, PADDLE_W_NARROW: PADDLE_W_NARROW,
    BALL_R: BALL_R, MIN_BALL_VY: MIN_BALL_VY,
    PALETTE: PALETTE, ITEM_COLORS: ITEM_COLORS, ITEM_LABELS: ITEM_LABELS,
    circleRect: circleRect, clampBallAngle: clampBallAngle,
    Block: Block, Ball: Ball, Paddle: Paddle, Item: Item, Laser: Laser, Particle: Particle
  };
})(window);
