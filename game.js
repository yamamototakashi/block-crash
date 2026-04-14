// Game class: state machine, stage loading, update & render.
// Exposed via window.Game.

(function (global) {
  'use strict';

  const E = global.Engine;
  const STAGES = global.STAGES;
  const MODE_CONFIG = global.MODE_CONFIG;

  const ITEM_KINDS = ['M', 'W', 'F', 'L', 'S', 'P'];
  const CHAOS_ITEM_KINDS = ['M', 'W', 'N', 'F', 'L', 'S'];

  class Game {
    constructor(canvas, sound) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.sound = sound;
      this.scale = 1;
      this.state = 'title'; // title|playing|paused|clear|over|allclear
      this.mode = 'CLASSIC';
      this.stageIdx = 0;
      this.score = 0;
      this.lives = 3;
      this.shake = 0;
      this.shakeTime = 0;
      this.paddle = new E.Paddle();
      this.balls = [];
      this.blocks = [];
      this.items = [];
      this.lasers = [];
      this.particles = [];
      this.chainColor = null;
      this.chainCount = 0;
      this.chainTimer = 0;
      this.multiplier = 1;
      this.floatTexts = [];
      this.chaosTimer = 6;
      this.stageStartDelay = 0;
      this.onStateChange = null; // set by main.js
      this.pendingLaunch = false;
    }

    setMode(mode) { this.mode = mode; }

    startNewGame() {
      this.score = 0;
      this.lives = 3;
      this.stageIdx = 0;
      this.multiplier = 1;
      this.chainColor = null;
      this.chainCount = 0;
      this.chainTimer = 0;
      this.loadStage();
      this.setState('playing');
    }

    loadStage() {
      const stages = STAGES[this.mode];
      if (!stages || !stages[this.stageIdx]) return false;
      const grid = stages[this.stageIdx];
      this.blocks = [];
      for (let r = 0; r < grid.length; r++) {
        const row = grid[r];
        if (row.length !== 8) continue;
        for (let c = 0; c < 8; c++) {
          const ch = row[c];
          if (ch === '.') continue;
          let type = 'N';
          let color = r % E.PALETTE.length;
          if (ch === 'T') { type = 'T'; color = (r + c) % E.PALETTE.length; }
          else if (ch === 'B') { type = 'B'; color = 1; }
          else if (ch === 'C') { type = 'C'; color = (c * 2 + r) % E.PALETTE.length; }
          else if (ch === 'R') { type = 'R'; color = -1; }
          else if (ch >= '1' && ch <= '7') { type = 'N'; color = parseInt(ch, 10) - 1; }
          this.blocks.push(new E.Block(c, r, type, color));
        }
      }
      this.items = [];
      this.lasers = [];
      this.particles = [];
      this.resetBall();
      this.stageStartDelay = 0.6;
      this.chaosTimer = 6;
    }

    resetBall() {
      this.paddle = new E.Paddle();
      const cfg = MODE_CONFIG[this.mode];
      const speed = cfg.baseSpeed + cfg.speedUp * this.stageIdx;
      const b = new E.Ball(this.paddle.cx, this.paddle.y - E.BALL_R - 1, 0, -speed);
      b.stuck = true;
      b.stuckOffset = 0;
      this.balls = [b];
    }

    launchBall() {
      let launched = false;
      for (let i = 0; i < this.balls.length; i++) {
        const b = this.balls[i];
        if (b.stuck) {
          const cfg = MODE_CONFIG[this.mode];
          const speed = cfg.baseSpeed + cfg.speedUp * this.stageIdx;
          b.stuck = false;
          b.vx = (Math.random() - 0.5) * speed * 0.5;
          b.vy = -Math.sqrt(Math.max(0, speed * speed - b.vx * b.vx));
          E.clampBallAngle(b);
          launched = true;
        }
      }
      if (launched) this.sound.play('launch');
    }

    setState(s) {
      if (this.state === s) return;
      this.state = s;
      if (this.onStateChange) this.onStateChange(s);
    }

    // === update ===
    update(dt) {
      if (this.stageStartDelay > 0) this.stageStartDelay -= dt;
      if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt * 60); this.shakeTime += dt; }
      // Chain timer
      if (this.chainTimer > 0) {
        this.chainTimer -= dt;
        if (this.chainTimer <= 0) {
          this.chainColor = null;
          this.chainCount = 0;
          this.multiplier = 1;
        }
      }
      // Paddle
      this.paddle.update(dt);
      // Lasers
      for (let i = this.lasers.length - 1; i >= 0; i--) {
        const l = this.lasers[i];
        l.y += l.vy * dt;
        if (l.y < E.HUD_H - 10) l.alive = false;
        if (l.alive) {
          for (let j = 0; j < this.blocks.length; j++) {
            const b = this.blocks[j];
            if (!b.alive) continue;
            if (l.x >= b.x && l.x <= b.x + b.w && l.y >= b.y && l.y <= b.y + b.h) {
              this.hitBlock(b, 1, 0, -1);
              l.alive = false;
              break;
            }
          }
        }
        if (!l.alive) this.lasers.splice(i, 1);
      }
      // Items
      for (let i = this.items.length - 1; i >= 0; i--) {
        const it = this.items[i];
        it.y += it.vy * dt;
        it.spin += dt * 3;
        // caught by paddle?
        if (it.y + it.h / 2 >= this.paddle.y &&
            it.y - it.h / 2 <= this.paddle.y + this.paddle.h &&
            it.x >= this.paddle.x - 4 &&
            it.x <= this.paddle.x + this.paddle.w + 4) {
          this.applyItem(it.kind);
          this.sound.play('item');
          this.spawnParticles(it.x, it.y, E.ITEM_COLORS[it.kind], 12);
          it.alive = false;
        } else if (it.y > E.H + 20) {
          it.alive = false;
        }
        if (!it.alive) this.items.splice(i, 1);
      }
      // Balls - use substeps to prevent tunneling
      for (let i = this.balls.length - 1; i >= 0; i--) {
        const ball = this.balls[i];
        if (ball.stuck) {
          ball.x = this.paddle.cx + ball.stuckOffset;
          ball.y = this.paddle.y - ball.r - 1;
          continue;
        }
        const speed = Math.hypot(ball.vx, ball.vy) || 1;
        const maxStep = 6; // px per substep
        const steps = Math.max(1, Math.ceil(speed * dt / maxStep));
        const sdt = dt / steps;
        let lost = false;
        for (let s = 0; s < steps; s++) {
          if (this.stepBall(ball, sdt)) { lost = true; break; }
        }
        if (lost) {
          this.balls.splice(i, 1);
        }
      }
      // Lose life when no balls left
      if (this.balls.length === 0 && this.state === 'playing') {
        this.lives--;
        if (this.lives <= 0) {
          this.sound.play('over');
          this.setState('over');
          return;
        } else {
          this.resetBall();
        }
      }
      // Particles / float texts
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vy += 280 * dt;
        p.life -= dt;
        if (p.life <= 0) this.particles.splice(i, 1);
      }
      for (let i = this.floatTexts.length - 1; i >= 0; i--) {
        const f = this.floatTexts[i];
        f.y -= 30 * dt;
        f.life -= dt;
        if (f.life <= 0) this.floatTexts.splice(i, 1);
      }
      // CHAOS events
      if (MODE_CONFIG[this.mode].chaos && this.state === 'playing') {
        this.chaosTimer -= dt;
        if (this.chaosTimer <= 0) {
          this.triggerChaos();
          this.chaosTimer = 10 + Math.random() * 6;
        }
      }
      // Check clear
      const remaining = this.blocks.filter(function (b) { return b.alive; }).length;
      if (remaining === 0 && this.state === 'playing' && this.stageStartDelay <= 0) {
        this.sound.play('clear');
        if (this.stageIdx + 1 >= (STAGES[this.mode] || []).length) {
          this.setState('allclear');
        } else {
          this.setState('clear');
        }
      }
    }

    stepBall(ball, dt) {
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      // Walls
      if (ball.x - ball.r < E.FIELD_OX) {
        ball.x = E.FIELD_OX + ball.r;
        ball.vx = Math.abs(ball.vx);
        this.sound.play('wall');
      } else if (ball.x + ball.r > E.W - E.FIELD_OX) {
        ball.x = E.W - E.FIELD_OX - ball.r;
        ball.vx = -Math.abs(ball.vx);
        this.sound.play('wall');
      }
      if (ball.y - ball.r < E.HUD_H) {
        ball.y = E.HUD_H + ball.r;
        ball.vy = Math.abs(ball.vy);
        this.sound.play('wall');
      }
      // Bottom - lost
      if (ball.y - ball.r > E.H + 6) return true;
      // Paddle collision
      const p = this.paddle;
      const hit = E.circleRect(ball.x, ball.y, ball.r, p.x, p.y, p.w, p.h);
      if (hit && ball.vy > 0 && ball.y < p.y + p.h) {
        ball.x += hit.nx * hit.overlap;
        ball.y += hit.ny * hit.overlap;
        // Angle based on hit position for classic feel
        const rel = Math.max(-1, Math.min(1, (ball.x - p.cx) / (p.w / 2)));
        const angle = rel * (Math.PI / 3); // +- 60 deg
        const speed = Math.hypot(ball.vx, ball.vy);
        ball.vx = Math.sin(angle) * speed;
        ball.vy = -Math.abs(Math.cos(angle) * speed);
        if (Math.abs(ball.vy) < E.MIN_BALL_VY) ball.vy = -E.MIN_BALL_VY;
        ball.y = p.y - ball.r - 0.5;
        this.sound.play('paddle');
      }
      // Blocks
      const fire = performance.now() < ball.fireUntil;
      for (let i = 0; i < this.blocks.length; i++) {
        const b = this.blocks[i];
        if (!b.alive) continue;
        const col = E.circleRect(ball.x, ball.y, ball.r, b.x, b.y, b.w, b.h);
        if (col) {
          if (!fire) {
            ball.x += col.nx * col.overlap;
            ball.y += col.ny * col.overlap;
            const dot = ball.vx * col.nx + ball.vy * col.ny;
            ball.vx -= 2 * dot * col.nx;
            ball.vy -= 2 * dot * col.ny;
            E.clampBallAngle(ball);
          }
          this.hitBlock(b, fire ? 2 : 1, col.nx, col.ny);
          if (!fire) break; // only resolve one block per step for stability
        }
      }
      return false;
    }

    hitBlock(block, damage, nx, ny) {
      if (!block.alive) return;
      block.flash = 1;
      block.hp -= damage;
      if (block.type === 'B') { this.explodeBomb(block); return; }
      if (block.hp > 0) {
        this.sound.play('tough');
        this.spawnParticles(block.x + block.w / 2, block.y + block.h / 2, '#ffffff', 4);
        return;
      }
      this.destroyBlock(block);
    }

    destroyBlock(block) {
      if (!block.alive) return;
      block.alive = false;
      const cx = block.x + block.w / 2;
      const cy = block.y + block.h / 2;
      const color = block.type === 'R' ? E.PALETTE[Math.floor(Math.random() * E.PALETTE.length)] : block.colorHex();
      this.spawnParticles(cx, cy, color, 10);
      // Rainbow chain bonus
      if (MODE_CONFIG[this.mode].rainbow) {
        if (block.type === 'R' || this.chainColor === null || this.chainColor === block.colorIdx) {
          this.chainCount++;
          this.chainColor = block.type === 'R' ? this.chainColor : block.colorIdx;
          this.multiplier = Math.min(5, 1 + Math.floor(this.chainCount / 3));
          this.chainTimer = 2.2;
        } else {
          this.chainColor = block.colorIdx;
          this.chainCount = 1;
          this.multiplier = 1;
          this.chainTimer = 2.2;
        }
      }
      const base = 10 * (block.type === 'T' ? 2 : 1) * (block.type === 'R' ? 2 : 1);
      const gained = Math.round(base * this.multiplier);
      this.score += gained;
      if (this.multiplier > 1) this.pushFloat(cx, cy, '+' + gained + ' x' + this.multiplier, color);
      this.sound.play('hit');
      this.shakeFor(3);
      // Chain-type: break nearby on destroy
      if (block.type === 'C') this.chainBreak(block);
      // Drop item
      this.maybeDropItem(cx, cy);
      // Vibrate if supported
      if (navigator.vibrate) { try { navigator.vibrate(8); } catch (_) {} }
    }

    chainBreak(origin) {
      // Mark neighbors within 1 grid distance
      const marks = [];
      for (let i = 0; i < this.blocks.length; i++) {
        const b = this.blocks[i];
        if (!b.alive || b === origin) continue;
        if (Math.abs(b.col - origin.col) <= 1 && Math.abs(b.row - origin.row) <= 1) {
          marks.push(b);
        }
      }
      this.sound.play('chain');
      for (let i = 0; i < marks.length; i++) {
        // Small delay via scale anim, but break immediately for simplicity.
        this.hitBlock(marks[i], 99, 0, 0);
      }
    }

    explodeBomb(block) {
      block.alive = false;
      const cx = block.x + block.w / 2;
      const cy = block.y + block.h / 2;
      this.sound.play('bomb');
      this.spawnParticles(cx, cy, '#ff9f1c', 28, 240);
      this.shakeFor(10);
      if (navigator.vibrate) { try { navigator.vibrate(30); } catch (_) {} }
      this.score += 40;
      // Destroy neighbors in 3x3
      const affected = [];
      for (let i = 0; i < this.blocks.length; i++) {
        const b = this.blocks[i];
        if (!b.alive || b === block) continue;
        if (Math.abs(b.col - block.col) <= 1 && Math.abs(b.row - block.row) <= 1) {
          affected.push(b);
        }
      }
      for (let i = 0; i < affected.length; i++) {
        this.hitBlock(affected[i], 99, 0, 0);
      }
    }

    maybeDropItem(x, y) {
      const cfg = MODE_CONFIG[this.mode];
      if (Math.random() > cfg.itemRate) return;
      const pool = cfg.chaos ? CHAOS_ITEM_KINDS : ITEM_KINDS;
      const kind = pool[Math.floor(Math.random() * pool.length)];
      this.items.push(new E.Item(x, y, kind));
    }

    applyItem(kind) {
      const now = performance.now();
      if (kind === 'M') {
        // Split all balls into up to 3
        const src = this.balls.filter(function (b) { return !b.stuck; });
        const toAdd = [];
        for (let i = 0; i < src.length && this.balls.length + toAdd.length < 6; i++) {
          const b = src[i];
          const speed = Math.hypot(b.vx, b.vy) || 300;
          const a1 = Math.atan2(b.vy, b.vx) + 0.35;
          const a2 = Math.atan2(b.vy, b.vx) - 0.35;
          const b1 = new E.Ball(b.x, b.y, Math.cos(a1) * speed, Math.sin(a1) * speed);
          const b2 = new E.Ball(b.x, b.y, Math.cos(a2) * speed, Math.sin(a2) * speed);
          toAdd.push(b1, b2);
        }
        this.balls = this.balls.concat(toAdd);
      } else if (kind === 'W') {
        this.paddle.wideUntil = now + 12000;
        this.paddle.narrowUntil = 0;
      } else if (kind === 'N') {
        this.paddle.narrowUntil = now + 6000;
        this.paddle.wideUntil = 0;
      } else if (kind === 'F') {
        for (let i = 0; i < this.balls.length; i++) this.balls[i].fireUntil = now + 7000;
      } else if (kind === 'L') {
        this.paddle.laserUntil = now + 8000;
      } else if (kind === 'S') {
        for (let i = 0; i < this.balls.length; i++) {
          const b = this.balls[i];
          b.vx *= 0.7; b.vy *= 0.7;
        }
      } else if (kind === 'P') {
        this.lives++;
        this.sound.play('life');
      }
    }

    fireLaser() {
      if (performance.now() >= this.paddle.laserUntil) return;
      if (this.paddle.laserCooldown > 0) return;
      this.paddle.laserCooldown = 0.18;
      this.lasers.push(new E.Laser(this.paddle.x + 10));
      this.lasers.push(new E.Laser(this.paddle.x + this.paddle.w - 10));
      this.sound.play('laser');
    }

    triggerChaos() {
      const events = ['speed', 'wide', 'narrow', 'multi', 'bomb-shower'];
      const ev = events[Math.floor(Math.random() * events.length)];
      const now = performance.now();
      if (ev === 'speed') {
        for (let i = 0; i < this.balls.length; i++) {
          const b = this.balls[i];
          const mag = (Math.random() < 0.5) ? 1.3 : 0.75;
          b.vx *= mag; b.vy *= mag;
        }
        this.pushFloat(E.W / 2, E.H / 2, 'SPEED!', '#ff4d6d');
      } else if (ev === 'wide') {
        this.paddle.wideUntil = now + 8000;
        this.pushFloat(E.W / 2, E.H / 2, 'WIDE!', '#70e000');
      } else if (ev === 'narrow') {
        this.paddle.narrowUntil = now + 5000;
        this.pushFloat(E.W / 2, E.H / 2, 'NARROW...', '#c77dff');
      } else if (ev === 'multi') {
        this.applyItem('M');
        this.pushFloat(E.W / 2, E.H / 2, 'MULTI!', '#00d1ff');
      } else if (ev === 'bomb-shower') {
        // Drop a few items
        for (let i = 0; i < 2; i++) {
          const kinds = ['M', 'W', 'F', 'L'];
          const k = kinds[Math.floor(Math.random() * kinds.length)];
          this.items.push(new E.Item(60 + Math.random() * (E.W - 120), E.HUD_H + 40, k));
        }
        this.pushFloat(E.W / 2, E.H / 2, 'CAPSULES!', '#ffd60a');
      }
    }

    spawnParticles(x, y, color, n, speedBase) {
      n = n || 8;
      speedBase = speedBase || 160;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = speedBase * (0.4 + Math.random() * 0.8);
        const c = (color === 'rainbow') ? E.PALETTE[Math.floor(Math.random() * E.PALETTE.length)] : color;
        this.particles.push(new E.Particle(
          x, y,
          Math.cos(a) * sp, Math.sin(a) * sp - 40,
          c, 0.4 + Math.random() * 0.4, 2 + Math.random() * 2
        ));
      }
    }

    pushFloat(x, y, text, color) {
      this.floatTexts.push({ x: x, y: y, text: text, color: color, life: 0.9, maxLife: 0.9 });
    }

    shakeFor(mag) { this.shake = Math.max(this.shake, mag); }

    // === render ===
    render() {
      const ctx = this.ctx;
      ctx.save();
      // Shake
      let sx = 0, sy = 0;
      if (this.shake > 0) {
        sx = (Math.random() - 0.5) * this.shake;
        sy = (Math.random() - 0.5) * this.shake;
      }
      ctx.translate(sx, sy);
      // Clear
      ctx.fillStyle = '#0a0a14';
      ctx.fillRect(0, 0, E.W, E.H);
      this.drawField(ctx);
      this.drawBlocks(ctx);
      this.drawItems(ctx);
      this.drawLasers(ctx);
      this.drawBalls(ctx);
      this.drawPaddle(ctx);
      this.drawParticles(ctx);
      this.drawFloats(ctx);
      this.drawHUD(ctx);
      ctx.restore();
    }

    drawField(ctx) {
      // Field border glow
      ctx.save();
      const grad = ctx.createLinearGradient(0, E.HUD_H, 0, E.H);
      grad.addColorStop(0, 'rgba(100,80,255,0.10)');
      grad.addColorStop(1, 'rgba(255,80,160,0.04)');
      ctx.fillStyle = grad;
      ctx.fillRect(E.FIELD_OX - 6, E.HUD_H, E.FIELD_W + 12, E.H - E.HUD_H);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.strokeRect(E.FIELD_OX - 6, E.HUD_H, E.FIELD_W + 12, E.H - E.HUD_H);
      ctx.restore();
    }

    drawBlocks(ctx) {
      for (let i = 0; i < this.blocks.length; i++) {
        const b = this.blocks[i];
        if (!b.alive) continue;
        b.flash = Math.max(0, b.flash - 0.08);
        ctx.save();
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        ctx.translate(cx, cy);
        ctx.scale(1 + b.flash * 0.08, 1 + b.flash * 0.08);
        ctx.translate(-cx, -cy);
        let fill;
        if (b.type === 'R') {
          const g = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
          g.addColorStop(0, '#ff4d6d');
          g.addColorStop(0.33, '#ffd60a');
          g.addColorStop(0.66, '#00d1ff');
          g.addColorStop(1, '#c77dff');
          fill = g;
        } else {
          fill = b.colorHex();
        }
        ctx.fillStyle = fill;
        this.roundRect(ctx, b.x, b.y, b.w, b.h, 4);
        ctx.fill();
        // Highlight
        ctx.fillStyle = 'rgba(255,255,255,' + (0.16 + b.flash * 0.3) + ')';
        this.roundRect(ctx, b.x + 2, b.y + 2, b.w - 4, Math.max(2, b.h / 3), 2);
        ctx.fill();
        // Type marker
        if (b.type === 'T') {
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.font = 'bold 11px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(b.hp === 2 ? '2' : '1', cx, cy);
        } else if (b.type === 'B') {
          ctx.fillStyle = '#0a0a14';
          ctx.font = 'bold 12px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('B', cx, cy);
        } else if (b.type === 'C') {
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          ctx.font = 'bold 12px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('◆', cx, cy);
        }
        ctx.restore();
      }
    }

    drawItems(ctx) {
      for (let i = 0; i < this.items.length; i++) {
        const it = this.items[i];
        ctx.save();
        ctx.translate(it.x, it.y);
        ctx.rotate(Math.sin(it.spin) * 0.3);
        ctx.fillStyle = E.ITEM_COLORS[it.kind] || '#fff';
        this.roundRect(ctx, -it.w / 2, -it.h / 2, it.w, it.h, 6);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        this.roundRect(ctx, -it.w / 2 + 2, -it.h / 2 + 2, it.w - 4, 5, 3);
        ctx.fill();
        ctx.fillStyle = '#0a0a14';
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(E.ITEM_LABELS[it.kind] || '?', 0, 1);
        ctx.restore();
      }
    }

    drawLasers(ctx) {
      ctx.fillStyle = '#ffd60a';
      for (let i = 0; i < this.lasers.length; i++) {
        const l = this.lasers[i];
        ctx.fillRect(l.x - 1.5, l.y, 3, 12);
      }
    }

    drawBalls(ctx) {
      for (let i = 0; i < this.balls.length; i++) {
        const b = this.balls[i];
        const fire = performance.now() < b.fireUntil;
        if (fire) {
          ctx.save();
          const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 18);
          g.addColorStop(0, 'rgba(255,160,80,0.9)');
          g.addColorStop(1, 'rgba(255,80,0,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(b.x, b.y, 18, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.fillStyle = fire ? '#ffd28a' : '#ffffff';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.arc(b.x - 2, b.y - 2, b.r / 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    drawPaddle(ctx) {
      const p = this.paddle;
      const now = performance.now();
      let color1 = '#00d1ff', color2 = '#c77dff';
      if (now < p.laserUntil) { color1 = '#ffd60a'; color2 = '#ff9f1c'; }
      else if (now < p.wideUntil) { color1 = '#70e000'; color2 = '#00d1ff'; }
      else if (now < p.narrowUntil) { color1 = '#ff4d6d'; color2 = '#c77dff'; }
      const g = ctx.createLinearGradient(p.x, p.y, p.x + p.w, p.y + p.h);
      g.addColorStop(0, color1);
      g.addColorStop(1, color2);
      ctx.fillStyle = g;
      this.roundRect(ctx, p.x, p.y, p.w, p.h, 6);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      this.roundRect(ctx, p.x + 4, p.y + 2, p.w - 8, 3, 2);
      ctx.fill();
      if (now < p.laserUntil) {
        ctx.fillStyle = '#ffd60a';
        ctx.fillRect(p.x + 6, p.y - 3, 3, 3);
        ctx.fillRect(p.x + p.w - 9, p.y - 3, 3, 3);
      }
    }

    drawParticles(ctx) {
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;
    }

    drawFloats(ctx) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < this.floatTexts.length; i++) {
        const f = this.floatTexts[i];
        ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
        ctx.fillStyle = f.color;
        ctx.font = 'bold 16px system-ui, sans-serif';
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1;
    }

    drawHUD(ctx) {
      ctx.save();
      ctx.fillStyle = 'rgba(10,10,20,0.7)';
      ctx.fillRect(0, 0, E.W, E.HUD_H);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.moveTo(0, E.HUD_H);
      ctx.lineTo(E.W, E.HUD_H);
      ctx.stroke();
      ctx.fillStyle = '#aab';
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('SCORE', 16, 8);
      ctx.fillText('STAGE', E.W / 2 - 14, 8);
      ctx.fillText('LIFE', E.W - 70, 8);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.fillText(String(this.score), 16, 22);
      ctx.fillText((this.stageIdx + 1) + '/' + ((STAGES[this.mode] || []).length), E.W / 2 - 14, 22);
      // lives
      for (let i = 0; i < Math.min(5, this.lives); i++) {
        ctx.fillStyle = '#ff4d6d';
        ctx.beginPath();
        ctx.arc(E.W - 60 + i * 12, 32, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      // Mode tag
      ctx.fillStyle = '#7a7a95';
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(this.mode, E.W - 16, 40);
      // multiplier
      if (this.multiplier > 1) {
        ctx.fillStyle = '#ffd60a';
        ctx.textAlign = 'left';
        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.fillText('x' + this.multiplier, 16, 38);
      }
      // Start hint
      if (this.balls.length > 0 && this.balls[0].stuck) {
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.textAlign = 'center';
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.fillText('TAP TO LAUNCH', E.W / 2, E.H - 96);
      }
      ctx.restore();
    }

    roundRect(ctx, x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
  }

  global.Game = Game;
})(window);
