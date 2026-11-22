(() => {
  'use strict';

  const get = id => document.getElementById(id);
  const screens = [...document.querySelectorAll('main > section')];
  const cards = [...document.querySelectorAll('.cand')];
  const preview = get('title-canvas');
  const ref = get('ref-canvas');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const bestKey = 'dore-onaji-best-v1';
  const debug = new URLSearchParams(location.search).get('debug') === '1';
  const keys = ['A', 'M', 'V'];
  const S = {
    phase: 'loading', M: window.MANIFEST, images: new Map(), questions: [],
    q: 0, score: 0, correct: 0, frame: 0, qStart: 0, gameStart: 0, drag: null
  };

  let titleTimer;
  let titleFrame = 0;
  const current = () => S.questions[S.q];
  const mod = (a, n) => ((a % n) + n) % n;
  const roll = n => Math.floor(Math.random() * n);

  function shuffle(items) {
    for (let i = items.length - 1; i > 0; i--) {
      const j = roll(i + 1);
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  function show(id) {
    clearInterval(titleTimer);
    for (const screen of screens) screen.hidden = screen.id !== 'screen-' + id;
    const primary = { title: 'btn-start', play: 'btn-left', result: 'btn-retry' }[id];
    if (primary) get(primary).focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  function drawRef(canvas, setIdx, frame) {
    const size = Math.max(1, Math.round(canvas.getBoundingClientRect().width * devicePixelRatio));
    if (canvas.width !== size || canvas.height !== size) {
      canvas.width = size;
      canvas.height = size;
    }
    const path = S.M.sets[setIdx].ref[frame];
    canvas.getContext('2d').drawImage(S.images.get(path), 0, 0, size, size);
  }

  async function preloadAll() {
    if (!S.M?.sets?.length) throw new Error('assets/manifest.js');
    const paths = [...new Set(S.M.sets.flatMap(set => [
      ...set.ref, ...keys.flatMap(key => set.cand[key])
    ]))];
    const progress = get('load-progress');
    let loaded = 0;
    const update = () => {
      progress.value = loaded;
      get('load-count').textContent = `読み込み中 ${loaded} / ${paths.length}`;
    };
    progress.max = paths.length;
    update();
    let next = 0;
    async function load() {
      while (next < paths.length) {
        const path = paths[next++];
        const img = new Image();
        try {
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = path;
          });
          if (img.decode) await img.decode();
        } catch {
          throw new Error(path);
        }
        S.images.set(path, img);
        loaded++;
        update();
      }
    }
    await Promise.all(Array.from({ length: 6 }, load));
  }

  function readBest() {
    try {
      const saved = JSON.parse(localStorage.getItem(bestKey));
      if (Number.isFinite(saved?.score) && saved.score >= 0) return saved.score;
      return 0;
    } catch {
      return null;
    }
  }

  function bestText(id, score) {
    const line = get(id);
    line.hidden = score === null;
    line.textContent = score === null ? '' : `ベストスコア ${score}`;
  }

  function animateTitle() {
    clearInterval(titleTimer);
    if (!motion.matches) {
      titleTimer = setInterval(() => {
        titleFrame = mod(titleFrame + 1, S.M.frameCount);
        drawRef(preview, 0, titleFrame);
      }, 120);
    }
  }

  function showTitle() {
    S.phase = 'title';
    titleFrame = 0;
    bestText('title-best', readBest());
    show('title');
    drawRef(preview, 0, titleFrame);
    animateTitle();
  }

  function planGame() {
    const order = shuffle(S.M.sets.map((_, i) => i)).slice(0, 6);
    return order.map(set => {
      const startFrame = roll(S.M.frameCount);
      const choices = shuffle(keys.map(key => ({
        key, path: S.M.sets[set].cand[key][roll(S.M.candCount)]
      })));
      return { set, startFrame, choices, answer: choices.findIndex(c => c.key === 'A') };
    });
  }

  function startQuestion() {
    const question = current();
    S.frame = question.startFrame;
    get('question').textContent = `問題 ${S.q + 1} / ${S.questions.length}`;
    get('score').textContent = S.score;
    get('live').textContent = '';
    drawRef(ref, question.set, S.frame);
    cards.forEach((card, i) => {
      card.querySelector('img').src = S.images.get(question.choices[i].path).src;
      card.classList.remove('ok', 'ng', 'answer');
      card.querySelector('span').textContent = '';
      card.removeAttribute('aria-disabled');
      if (debug && i === question.answer) card.dataset.correct = 'true';
      else delete card.dataset.correct;
    });
    S.qStart = performance.now();
    S.phase = 'play';
  }

  function begin() {
    S.questions = planGame();
    S.q = S.score = S.correct = 0;
    S.gameStart = performance.now();
    show('play');
    startQuestion();
  }

  function rotate(frame) {
    if (S.phase !== 'play') return;
    const next = mod(frame, S.M.frameCount);
    if (next === S.frame) return;
    S.frame = next;
    drawRef(ref, current().set, next);
  }

  function clearDrag() {
    const drag = S.drag;
    S.drag = null;
    if (drag && ref.hasPointerCapture(drag.id)) ref.releasePointerCapture(drag.id);
  }

  function choose(i) {
    if (S.phase !== 'play') return;
    const elapsed = (performance.now() - S.qStart) / 1000;
    S.phase = 'feedback';
    clearDrag();
    const answer = current().answer;
    const correct = i === answer;
    if (correct) {
      S.correct++;
      S.score += 100 + Math.max(0, 50 - 5 * Math.floor(elapsed));
    } else {
      cards[answer].classList.add('answer');
    }
    cards[i].classList.add(correct ? 'ok' : 'ng');
    cards[i].querySelector('span').textContent = correct ? '○' : '×';
    for (const card of cards) card.setAttribute('aria-disabled', 'true');
    get('score').textContent = S.score;
    get('live').textContent = correct ? '正解' : `不正解。正解は候補${answer + 1}`;
    setTimeout(() => {
      S.q++;
      if (S.q < S.questions.length) startQuestion();
      else showResult();
    }, correct ? 700 : 1200);
  }

  function showResult() {
    const elapsed = (performance.now() - S.gameStart) / 1000;
    S.phase = 'result';
    let best = readBest();
    let record = false;
    if (best !== null && S.score > best) {
      const now = new Date();
      const two = n => String(n).padStart(2, '0');
      const date = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
      try {
        localStorage.setItem(bestKey, JSON.stringify({ score: S.score, date }));
        best = S.score;
        record = true;
      } catch {
        best = null;
      }
    }
    get('result-score').textContent = S.score;
    get('result-correct').textContent = `${S.correct} / ${S.questions.length}`;
    get('result-time').textContent = `${elapsed.toFixed(1)} 秒`;
    bestText('result-best', best);
    get('record').hidden = !record;
    show('result');
  }

  ref.addEventListener('pointerdown', event => {
    if (S.phase !== 'play' || S.drag || event.button !== 0) return;
    ref.setPointerCapture(event.pointerId);
    S.drag = { id: event.pointerId, x0: event.clientX, f0: S.frame };
  });
  ref.addEventListener('pointermove', event => {
    const drag = S.drag;
    if (drag?.id === event.pointerId) rotate(drag.f0 + Math.round((event.clientX - drag.x0) / 12));
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    ref.addEventListener(name, event => {
      if (S.drag?.id === event.pointerId) clearDrag();
    });
  }

  get('btn-left').addEventListener('click', () => rotate(S.frame - 1));
  get('btn-right').addEventListener('click', () => rotate(S.frame + 1));
  get('btn-start').addEventListener('click', begin);
  get('btn-retry').addEventListener('click', begin);
  get('btn-title').addEventListener('click', showTitle);
  cards.forEach((card, i) => card.addEventListener('click', () => choose(i)));

  document.addEventListener('keydown', event => {
    if (S.phase !== 'play' || event.altKey || event.metaKey || event.ctrlKey) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      rotate(S.frame + (event.key === 'ArrowLeft' ? -1 : 1));
    } else if (['1', '2', '3'].includes(event.key) && !event.repeat) {
      choose(Number(event.key) - 1);
    }
  });

  window.addEventListener('resize', () => {
    if (S.phase === 'title') drawRef(preview, 0, titleFrame);
    if (S.phase === 'play' || S.phase === 'feedback') drawRef(ref, current().set, S.frame);
  });
  motion.addEventListener('change', () => {
    if (S.phase === 'title') animateTitle();
  });

  preloadAll().then(() => {
    get('btn-start').disabled = false;
    showTitle();
  }).catch(error => {
    const message = get('load-error');
    message.textContent = '画像を読み込めませんでした: ' + error.message;
    message.hidden = false;
  });
})();
