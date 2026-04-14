// Entry point: wires DOM, input, state transitions, and runs the loop.

(function () {
  'use strict';

  const E = window.Engine;
  const canvas = document.getElementById('canvas');
  const sound = new window.Sound();
  const game = new window.Game(canvas, sound);

  // Screens
  const screens = {
    title:    document.getElementById('titleScreen'),
    howto:    document.getElementById('howtoScreen'),
    clear:    document.getElementById('clearScreen'),
    over:     document.getElementById('overScreen'),
    pause:    document.getElementById('pauseScreen'),
    allclear: document.getElementById('allClearScreen')
  };
  const pauseBtn = document.getElementById('pauseBtn');

  function showOnly(key) {
    Object.keys(screens).forEach(function (k) {
      if (!screens[k]) return;
      if (k === key) screens[k].classList.remove('hidden');
      else screens[k].classList.add('hidden');
    });
    if (key === null) {
      Object.keys(screens).forEach(function (k) { if (screens[k]) screens[k].classList.add('hidden'); });
    }
  }

  function updatePauseBtn() {
    if (game.state === 'playing') pauseBtn.classList.remove('hidden');
    else pauseBtn.classList.add('hidden');
  }

  game.onStateChange = function (s) {
    if (s === 'playing') { showOnly(null); }
    else if (s === 'paused') { showOnly('pause'); }
    else if (s === 'clear') {
      document.getElementById('clearScore').textContent = String(game.score);
      document.getElementById('clearStage').textContent = String(game.stageIdx + 1);
      showOnly('clear');
    } else if (s === 'over') {
      document.getElementById('overScore').textContent = String(game.score);
      showOnly('over');
    } else if (s === 'allclear') {
      document.getElementById('allClearScore').textContent = String(game.score);
      showOnly('allclear');
    } else if (s === 'title') {
      showOnly('title');
    }
    updatePauseBtn();
  };

  // === Canvas resize & DPR ===
  function resize() {
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const availW = window.innerWidth;
    const availH = window.innerHeight;
    const scale = Math.min(availW / E.W, availH / E.H);
    const cssW = Math.floor(E.W * scale);
    const cssH = Math.floor(E.H * scale);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    game.scale = scale;
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { setTimeout(resize, 120); });
  resize();

  // === Input ===
  function canvasXFromClient(clientX) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (E.W / rect.width);
    return Math.max(0, Math.min(E.W, x));
  }

  let isPointerDown = false;

  function onPointerDown(e) {
    isPointerDown = true;
    if (game.state === 'playing') {
      const cx = canvasXFromClient(e.clientX != null ? e.clientX : (e.touches && e.touches[0].clientX));
      game.paddle.setTargetCenter(cx);
      // Launch ball on tap
      let anyStuck = false;
      for (let i = 0; i < game.balls.length; i++) if (game.balls[i].stuck) { anyStuck = true; break; }
      if (anyStuck) game.launchBall();
      // Fire laser if active
      if (performance.now() < game.paddle.laserUntil) game.fireLaser();
    }
  }
  function onPointerMove(e) {
    if (!isPointerDown) return;
    if (game.state !== 'playing') return;
    const cx = canvasXFromClient(e.clientX != null ? e.clientX : (e.touches && e.touches[0].clientX));
    game.paddle.setTargetCenter(cx);
  }
  function onPointerUp() { isPointerDown = false; }

  // Touch
  canvas.addEventListener('touchstart', function (e) {
    e.preventDefault();
    if (e.touches.length === 0) return;
    onPointerDown({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
  }, { passive: false });
  canvas.addEventListener('touchmove', function (e) {
    e.preventDefault();
    if (e.touches.length === 0) return;
    onPointerMove({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
  }, { passive: false });
  canvas.addEventListener('touchend', function (e) { e.preventDefault(); onPointerUp(); }, { passive: false });
  canvas.addEventListener('touchcancel', function () { onPointerUp(); });

  // Mouse
  canvas.addEventListener('mousedown', onPointerDown);
  window.addEventListener('mousemove', function (e) {
    if (game.state !== 'playing') return;
    // Even without mouse down, follow for responsive desktop play
    const cx = canvasXFromClient(e.clientX);
    game.paddle.setTargetCenter(cx);
  });
  window.addEventListener('mouseup', onPointerUp);

  // Keyboard
  window.addEventListener('keydown', function (e) {
    if (game.state !== 'playing') return;
    if (e.key === 'ArrowLeft') { game.paddle.setTargetCenter(game.paddle.cx - 40); }
    else if (e.key === 'ArrowRight') { game.paddle.setTargetCenter(game.paddle.cx + 40); }
    else if (e.key === ' ' || e.key === 'Enter') {
      let anyStuck = false;
      for (let i = 0; i < game.balls.length; i++) if (game.balls[i].stuck) { anyStuck = true; break; }
      if (anyStuck) game.launchBall();
      else if (performance.now() < game.paddle.laserUntil) game.fireLaser();
    } else if (e.key === 'p' || e.key === 'Escape') {
      togglePause();
    }
  });

  // === Sound toggle ===
  const soundBtn = document.getElementById('soundToggle');
  let soundOn = true;
  try {
    const saved = localStorage.getItem('bc_sound');
    if (saved === '0') soundOn = false;
  } catch (_) {}
  sound.setEnabled(soundOn);
  soundBtn.textContent = '♪ ' + (soundOn ? 'ON' : 'OFF');
  soundBtn.addEventListener('click', function () {
    soundOn = !soundOn;
    sound.setEnabled(soundOn);
    soundBtn.textContent = '♪ ' + (soundOn ? 'ON' : 'OFF');
    try { localStorage.setItem('bc_sound', soundOn ? '1' : '0'); } catch (_) {}
    // Init audio on the very first click
    if (soundOn) sound.init();
  });

  // === Title mode buttons ===
  const modeButtons = document.querySelectorAll('.mode-btn');
  for (let i = 0; i < modeButtons.length; i++) {
    modeButtons[i].addEventListener('click', function (ev) {
      const mode = ev.currentTarget.getAttribute('data-mode');
      // Unlock audio inside a user gesture
      sound.init();
      game.setMode(mode);
      game.startNewGame();
    });
  }

  // === How-to ===
  document.getElementById('howtoBtn').addEventListener('click', function () {
    showOnly('howto');
  });
  document.getElementById('howtoBackBtn').addEventListener('click', function () {
    showOnly('title');
  });

  // === Clear / Over buttons ===
  document.getElementById('nextBtn').addEventListener('click', function () {
    if (game.state !== 'clear') return;
    game.stageIdx++;
    game.loadStage();
    game.setState('playing');
  });
  document.getElementById('clearTitleBtn').addEventListener('click', function () {
    game.setState('title');
  });
  document.getElementById('retryBtn').addEventListener('click', function () {
    if (game.state !== 'over') return;
    game.startNewGame();
  });
  document.getElementById('overTitleBtn').addEventListener('click', function () {
    game.setState('title');
  });
  document.getElementById('allClearRetryBtn').addEventListener('click', function () {
    game.startNewGame();
  });
  document.getElementById('allClearTitleBtn').addEventListener('click', function () {
    game.setState('title');
  });

  // === Pause ===
  function togglePause() {
    if (game.state === 'playing') game.setState('paused');
    else if (game.state === 'paused') game.setState('playing');
  }
  pauseBtn.addEventListener('click', togglePause);
  document.getElementById('resumeBtn').addEventListener('click', function () {
    if (game.state === 'paused') game.setState('playing');
  });
  document.getElementById('pauseTitleBtn').addEventListener('click', function () {
    game.setState('title');
  });

  // Pause on visibility change
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && game.state === 'playing') game.setState('paused');
  });

  // === Main loop ===
  let lastTs = performance.now();
  function loop(ts) {
    let dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (dt > 1 / 20) dt = 1 / 20; // clamp large gaps (tab switch)
    try {
      if (game.state === 'playing') game.update(dt);
      game.render();
    } catch (err) {
      // Fail-safe: avoid a black screen on unexpected errors
      console.error(err);
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // Initial screen
  game.setState('title');
})();
