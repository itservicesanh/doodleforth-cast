(() => {
  'use strict';

  const get = id => document.getElementById(id);
  const canvas = get('drawing');
  const context = canvas.getContext('2d');
  const catalogAvatar = /^[a-f0-9]{24}$/;
  const colorPattern = /^#[a-f0-9]{6}$/i;
  let socket;
  let code = '';
  let retryTimer;
  let retryDelay = 1000;
  let lastMessage = 0;
  let hasConnected = false;
  let state;
  let strokes = [];
  let inkFrame = 0;
  let guessTimer;
  let audio;
  let soundEnabled = false;
  let turnKey = '';
  let guessKey = '';
  let correctKey = '';
  let standingsKey = '';
  const cards = new Map();

  function paint() {
    if (inkFrame) return;
    inkFrame = requestAnimationFrame(() => {
      inkFrame = 0;
      if (!get('party').hidden) window.paintDoodleCanvas(canvas, context, strokes);
    });
  }

  function pair(nextCode) {
    code = nextCode;
    get('pairStatus').textContent = 'Connecting to the host device…';
    connect();
  }

  function connect() {
    clearTimeout(retryTimer);
    if (socket) socket.close();
    const next = new WebSocket('ws://' + location.host + '/tv-ws?tv=' + encodeURIComponent(code));
    socket = next;
    lastMessage = Date.now();
    next.onmessage = event => {
      if (socket !== next) return;
      lastMessage = Date.now();
      const message = JSON.parse(event.data);
      if (message.v !== 1) return;
      if (message.type === 'state_snapshot') {
        hasConnected = true;
        retryDelay = 1000;
        get('pairing').hidden = true;
        get('party').hidden = false;
        get('connection').hidden = true;
        const qrURL = '/join-qr.png?tv=' + encodeURIComponent(code);
        if (get('joinQR').getAttribute('src') !== qrURL) get('joinQR').src = qrURL;
        showState(message);
        // Hosts from 0.9 send the two latest drawings; older hosts send one.
        showRecentDrawings(Array.isArray(message.recentDrawings) ? message.recentDrawings
          : message.lastDrawing ? [message.lastDrawing] : []);
        fitFrame();
      } else if (message.type === 'tv_configuration') {
        get('join').classList.toggle('is-large', message.largeQR === true);
        get('party').classList.toggle('quiet-celebrations', message.celebrations === false);
      } else if (message.type === 'round_clock' && state) {
        state.remainingSeconds = message.remainingSeconds;
        state.bonusRemainingSeconds = message.bonusRemainingSeconds;
        showClock();
      } else {
        applyInk(message);
      }
    };
    next.onclose = event => {
      if (socket !== next) return;
      socket = null;
      if (event.code === 4097) {
        disconnect();
        get('pairStatus').textContent = 'The host disabled TV pairing. Get a new code from the host device to reconnect.';
        return;
      }
      if (!hasConnected) {
        get('pairStatus').textContent = 'Couldn’t connect. Check the pairing code, Wi-Fi, and available TV slots on the host device.';
        return;
      }
      get('connection').hidden = false;
      get('connection').textContent = 'Reconnecting to the host device…';
      retryTimer = setTimeout(connect, retryDelay);
      retryDelay = Math.min(8000, retryDelay * 2);
    };
  }

  function disconnect() {
    clearTimeout(retryTimer);
    if (socket) {
      const previous = socket;
      socket = null;
      previous.close();
    }
    code = '';
    retryDelay = 1000;
    hasConnected = false;
    state = null;
    strokes = [];
    turnKey = '';
    guessKey = '';
    correctKey = '';
    standingsKey = '';
    cards.clear();
    clearTimeout(guessTimer);
    for (const id of ['players', 'guesses', 'correctGuesses', 'rankings']) get(id).textContent = '';
    get('joinQR').removeAttribute('src');
    showRecentDrawings([]);
    get('connection').hidden = true;
    get('party').hidden = true;
    get('pairing').hidden = false;
    get('pairStatus').textContent = 'Disconnected.';
    get('pairCode').select();
  }

  function prettyTeam(team) { return team.charAt(0).toUpperCase() + team.slice(1); }

  function showState(message) {
    const previous = state;
    state = message.state;
    strokes = message.strokes;
    const game = state.game;
    const phase = state.phase;
    const artist = state.artist;
    const newTurn = game.number + ':' + state.round;
    const roundTitle = game.isTiebreaker ? 'Sudden death' : 'Round ' + state.round + (game.roundLimit ? ' of ' + game.roundLimit : '');
    if (turnKey !== newTurn) {
      guessKey = '';
      turnKey = newTurn;
      if (previous) animate(get('artistLabel'), 'gained');
    }
    for (const key of ['primary', 'accent', 'soft']) {
      if (message.colors && colorPattern.test(message.colors[key])) {
        document.documentElement.style.setProperty('--' + key, message.colors[key]);
      }
    }
    get('roundLabel').textContent = roundTitle;
    get('roomLabel').textContent = 'Room ' + state.roomCode;
    get('upNext').hidden = !state.nextArtist;
    get('nextArtist').textContent = state.nextArtist ? state.nextArtist.name : '';
    get('artistLabel').textContent = artist ?
      artist.name + (phase === 'wordSelection' ? ' is choosing a word' : phase === 'finished' ? ' drew this round' : ' is drawing') : '';
    showClock();
    get('waiting').hidden = phase !== 'lobby' && phase !== 'wordSelection';
    get('waitingTitle').textContent = phase === 'wordSelection' ? 'Waiting for the artist to choose a word' : 'Waiting for the first round';
    showResult();
    showMascot();
    showPlayers(previous && previous.game.number === game.number);
    showStandings();
    showCorrectGuesses();
    showGuesses();
    if (previous && previous.game.number === game.number
        && (previous.round === state.round && state.solvers.length > previous.solvers.length
          || previous.phase !== phase && phase === 'finished')) {
      chime();
    }
    paint();
  }

  let recentKey = '';
  function showRecentDrawings(drawings) {
    const list = get('recentDrawings');
    const recent = drawings.slice(0, 2);
    const key = JSON.stringify(recent);
    if (key === recentKey) return;
    recentKey = key;
    list.replaceChildren();
    list.hidden = !recent.length;
    for (const drawing of recent) {
      const card = create('figure', 'recent-drawing');
      if (drawing.hasThumbnail) {
        const image = document.createElement('img');
        image.alt = 'Recent drawing by ' + drawing.artist;
        image.onerror = () => { image.hidden = true; };
        image.src = '/tv-thumbnail.png?tv=' + encodeURIComponent(code) + '&id=' + encodeURIComponent(drawing.id);
        card.append(image);
      }
      const credits = create('figcaption', 'last-drawing-credits');
      for (const [label, value] of [['By:', drawing.artist], ['Guessed:', (drawing.guessers || []).join(', ') || 'None']]) {
        const row = document.createElement('span');
        const title = document.createElement('strong');
        title.textContent = label;
        const text = document.createElement('span');
        text.textContent = text.title = value;
        row.append(title, ' ', text);
        credits.append(row);
      }
      card.append(credits);
      list.append(card);
    }
  }

  // Size the white drawing frame to exactly 16:9 within the stage, so there is
  // no empty white band above or below the drawing.
  function fitFrame() {
    const stage = get('stage');
    const frame = get('drawingFrame');
    const label = get('artistLabel');
    if (!stage || !frame || get('party').hidden) return;
    const gap = parseFloat(getComputedStyle(stage).rowGap) || 0;
    const width = stage.clientWidth;
    const height = stage.clientHeight - label.offsetHeight - gap;
    if (width <= 0 || height <= 0) return;
    const frameWidth = Math.min(width, height * 16 / 9);
    frame.style.width = Math.floor(frameWidth) + 'px';
    frame.style.height = Math.floor(frameWidth * 9 / 16) + 'px';
    paint();
  }

  function showResult() {
    const game = state.game;
    const ended = state.phase === 'finished';
    const final = ended && game.isComplete;
    const banner = get('roundBanner');
    const title = final ? 'Game complete' : ended && state.answer ? 'The word was ' + state.answer
      : state.phase === 'paused' ? 'Round paused' : '';
    let detail = final && state.answer ? 'The word was ' + state.answer : '';
    if (final) {
      const entries = game.teams.length ? game.teams : game.standings;
      const winners = entries.filter(entry => game.winnerIDs.includes(entry.id || entry.team))
        .map(entry => entry.name || prettyTeam(entry.team) + ' team');
      if (winners.length) {
        detail = [winners.join(' & ') + (winners.length === 1 ? ' wins!' : ' share the win!'), detail].filter(Boolean).join(' · ');
      }
    }
    const titleNode = get('resultTitle');
    const detailNode = get('resultDetail');
    if (titleNode.textContent !== title) titleNode.textContent = title;
    if (detailNode.textContent !== detail) detailNode.textContent = detail;
    detailNode.hidden = !detail;
    banner.hidden = !title;
    banner.classList.toggle('is-final', final);
  }

  // Pencil mascot: thinking while waiting, confused when nobody guessed,
  // and a celebration with the winners' own avatars when the game is won.
  function showMascot() {
    const mascot = window.DoodleMascot;
    if (!mascot) return;
    const game = state.game;
    const phase = state.phase;
    const turn = game.number + ':' + state.round;
    if (phase === 'lobby' || phase === 'wordSelection') mascot.place(get('waitingMascot'), 'thinking:' + game.number, 'thinking');
    else mascot.clear(get('waitingMascot'));
    const final = phase === 'finished' && game.isComplete;
    if (phase === 'finished' && !final && state.solvers.length === 0) mascot.place(get('mascotCorner'), 'confused:' + turn, 'confused');
    else mascot.clear(get('mascotCorner'));
    if (!final) { mascot.clear(get('mascotWin')); return; }
    let winners = [];
    let title = 'Thanks for playing!';
    const everyone = state.players.slice();
    if (!everyone.some(player => player.id === 'ipad-host') && game.winnerIDs.includes('ipad-host')) {
      const host = game.standings.find(entry => entry.id === 'ipad-host');
      everyone.push({ id: 'ipad-host', name: host ? host.name : 'Host', avatar: state.hostAvatar });
    }
    if (game.teams.length) {
      const teams = game.teams.filter(entry => game.winnerIDs.includes(entry.team));
      winners = everyone.filter(player => teams.some(entry => entry.team === player.team));
      if (teams.length) title = teams.map(entry => prettyTeam(entry.team)).join(' & ') + (teams.length === 1 ? ' team wins!' : ' teams share the win!');
    } else {
      winners = everyone.filter(player => game.winnerIDs.includes(player.id));
      if (winners.length) title = winners.map(player => player.name).join(' & ') + (winners.length === 1 ? ' wins!' : ' share the win!');
    }
    mascot.celebrate(get('mascotWin'), 'win:' + game.number, title, winners.map(player => ({ name: player.name, avatar: winAvatar(player) })));
  }

  function winAvatar(player) {
    const badge = create('span', 'win-avatar');
    badge.textContent = player.name.trim().slice(0, 2).toUpperCase();
    if (player.avatar && (catalogAvatar.test(player.avatar) || /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(player.avatar))) {
      const image = document.createElement('img');
      image.alt = '';
      image.onload = () => { badge.textContent = ''; badge.appendChild(image); };
      image.src = catalogAvatar.test(player.avatar)
        ? '/avatars/' + player.avatar + '.png?tv=' + encodeURIComponent(code) : player.avatar;
    }
    return badge;
  }

  function showClock() {
    const clock = get('timer');
    const live = state.phase === 'drawing' || state.phase === 'paused';
    const seconds = Math.max(0, state.remainingSeconds);
    clock.textContent = live ? String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0') : '—:—';
    clock.classList.toggle('is-urgent', state.phase === 'drawing' && seconds > 0 && seconds <= 10);
    const bonus = get('bonus');
    bonus.hidden = !live || state.bonusRemainingSeconds == null;
    bonus.textContent = bonus.hidden ? '' : state.bonusRemainingSeconds + 's bonus';
  }

  function create(tag, className) {
    const element = document.createElement(tag);
    element.className = className;
    return element;
  }

  function animate(element, className) {
    element.classList.remove(className);
    requestAnimationFrame(() => element.classList.add(className));
  }

  function showPlayers(compareScores) {
    const game = state.game;
    const players = state.players.slice();
    const host = [state.artist, state.nextArtist].find(player => player && player.id === 'ipad-host');
    if (host && !players.some(player => player.id === host.id)) {
      players.unshift({ id: host.id, name: host.name, avatar: state.hostAvatar, connected: true });
    }
    const scoreOrder = new Map([['ipad-host', -1]]);
    game.standings.forEach((entry, index) => scoreOrder.set(entry.id, index));
    players.sort((a, b) => scoreOrder.get(a.id) - scoreOrder.get(b.id));
    get('scoresLabel').textContent = game.isComplete ? 'Final scores' : 'Scores';
    get('emptyScores').hidden = players.length > 0;
    const current = new Set(players.map(player => player.id));
    for (const [id, card] of cards) {
      if (!current.has(id)) {
        card.element.remove();
        cards.delete(id);
      }
    }
    for (const player of players) {
      let card = cards.get(player.id);
      if (!card) {
        card = {
          element: create('li', 'player'),
          avatar: create('span', 'player-avatar'),
          name: create('strong', 'player-name'),
          role: create('span', 'player-role'),
          score: create('span', 'score')
        };
        const identity = create('div', 'player-identity');
        identity.append(card.name, card.role);
        card.element.append(card.avatar, identity, card.score);
        cards.set(player.id, card);
      }
      if (card.profile !== player.avatar || card.name.textContent !== player.name) {
        card.profile = player.avatar;
        card.name.textContent = player.name;
        card.avatar.textContent = player.name.trim().slice(0, 2).toUpperCase();
        if (player.avatar && (catalogAvatar.test(player.avatar) || /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(player.avatar))) {
          const image = document.createElement('img');
          image.alt = '';
          image.onload = () => {
            if (player.avatar !== card.profile) return;
            card.avatar.textContent = '';
            card.avatar.appendChild(image);
          };
          image.src = catalogAvatar.test(player.avatar)
            ? '/avatars/' + player.avatar + '.png?tv=' + encodeURIComponent(code) : player.avatar;
        }
      }
      const artist = Boolean(state.artist && player.id === state.artist.id && state.phase !== 'finished');
      const next = Boolean(state.nextArtist && player.id === state.nextArtist.id);
      const standing = game.standings.find(entry => entry.id === player.id);
      const points = standing ? standing.points : (player.id === 'ipad-host' ? game.hostPoints : 0);
      card.element.classList.toggle('is-artist', artist);
      card.element.classList.toggle('is-winner', game.isComplete && !game.teams.length && game.winnerIDs.includes(player.id));
      card.element.classList.toggle('is-next', next);
      card.element.classList.toggle('is-away', !player.connected);
      if (player.team) card.element.dataset.team = player.team;
      else delete card.element.dataset.team;
      card.element.classList.toggle('is-correct', Boolean(player.correct));
      card.score.textContent = String(points);
      card.score.setAttribute('aria-label', points + ' points');
      const role = [artist ? (state.phase === 'wordSelection' ? 'Choosing' : 'Drawing') : next ? 'Up next' : player.correct ? 'Guessed!' : '', !player.connected ? 'Away' : player.team ? prettyTeam(player.team) : ''];
      card.role.textContent = role.filter(Boolean).join(' · ');
      if (compareScores && (points > card.points || (player.correct && !card.correct))) animate(card.element, 'gained');
      if (!compareScores) card.element.classList.remove('gained');
      card.points = points;
      card.correct = player.correct;
    }
    const scoreboard = get('players');
    players.forEach((player, index) => {
      const element = cards.get(player.id).element;
      if (scoreboard.children[index] !== element) scoreboard.insertBefore(element, scoreboard.children[index] || null);
    });
  }

  function showStandings() {
    const game = state.game;
    const list = get('rankings');
    const rows = game.teams;
    const key = JSON.stringify([game.isComplete, game.winnerIDs, rows]);
    if (key === standingsKey) return;
    standingsKey = key;
    list.textContent = '';
    list.hidden = !rows.length;
    if (!rows.length) return;
    const heading = document.createElement('h3');
    heading.textContent = 'Team scores';
    list.appendChild(heading);
    for (const entry of rows) {
      const winner = game.isComplete && game.winnerIDs.includes(entry.id || entry.team);
      const row = create('div', winner ? 'standing is-winner' : 'standing');
      const name = document.createElement('strong');
      name.textContent = entry.name || prettyTeam(entry.team);
      row.append(name, String(entry.points));
      list.appendChild(row);
    }
  }

  function updateEmptyGuesses() {
    const empty = !get('guesses').children.length && !get('correctGuesses').children.length;
    get('emptyGuesses').hidden = !empty;
    if (empty) {
      get('emptyGuesses').textContent = state.phase === 'finished' ? 'No correct guesses this round'
        : state.phase === 'drawing' ? 'Waiting for guesses' : 'Guesses will appear here';
    }
  }

  function showCorrectGuesses() {
    const list = get('correctGuesses');
    const solved = new Set(state.solvers.map(solver => solver.id));
    const partial = new Map();
    for (const reveal of state.revealedWords) {
      if (!solved.has(reveal.playerID)) partial.set(reveal.playerID, reveal.name);
    }
    // Announce the player, never their correct guess or any unrevealed answer.
    const entries = [...state.solvers.slice().reverse().map(solver => solver.name + ' got it!'),
      ...Array.from(partial.values(), name => name + ' found a word')].slice(0, 2);
    const key = JSON.stringify(entries);
    if (key === correctKey) return;
    correctKey = key;
    list.textContent = '';
    for (const entry of entries) {
      const row = create('li', 'solve');
      row.textContent = entry;
      list.appendChild(row);
    }
  }

  function showGuesses() {
    const list = get('guesses');
    const guessRows = state.phase === 'drawing' ? state.recentGuesses.slice(0, 3) : [];
    const key = JSON.stringify(guessRows);
    if (key === guessKey) { updateEmptyGuesses(); return; }
    guessKey = key;
    clearTimeout(guessTimer);
    list.textContent = '';
    for (const guess of guessRows) {
      const row = create('li', 'toast');
      const name = document.createElement('strong');
      name.textContent = guess.name;
      const text = document.createElement('span');
      text.textContent = guess.text;
      row.append(name, text);
      list.appendChild(row);
    }
    updateEmptyGuesses();
    if (guessRows.length) guessTimer = setTimeout(() => {
      list.textContent = '';
      updateEmptyGuesses();
    }, 6000);
  }

  function applyInk(message) {
    switch (message.type) {
      case 'stroke_begin':
      case 'stroke_redo':
        strokes.push(message.stroke);
        break;
      case 'stroke_update': {
        const stroke = strokes.find(item => item.id === message.strokeId);
        // Hosts from 0.9 send a batch in `points`; older hosts send one `point`.
        const added = Array.isArray(message.points)
          ? message.points.filter(p => Array.isArray(p) && p.length === 2).map(p => ({ x: p[0], y: p[1] }))
          : message.point ? [message.point] : [];
        if (stroke) for (const point of added) { if (stroke.points.length < 2000) stroke.points.push(point); }
        break;
      }
      case 'stroke_replace': {
        const index = strokes.findIndex(item => item.id === message.stroke.id);
        if (index !== -1) strokes[index] = message.stroke;
        break;
      }
      case 'stroke_undo':
        strokes = strokes.filter(item => item.id !== message.strokeId);
        break;
      default: return;
    }
    paint();
  }

  function chime() {
    if (!soundEnabled || !audio || audio.state !== 'running') return;
    for (const [index, frequency] of [523.25, 659.25, 783.99].entries()) {
      const note = audio.createOscillator();
      const volume = audio.createGain();
      const time = audio.currentTime + index * .09;
      note.type = 'sine';
      note.frequency.value = frequency;
      volume.gain.setValueAtTime(.075, time);
      volume.gain.exponentialRampToValueAtTime(.001, time + .2);
      note.connect(volume);
      volume.connect(audio.destination);
      note.start(time);
      note.stop(time + .21);
    }
  }

  get('pairForm').addEventListener('submit', event => {
    event.preventDefault();
    const entered = get('pairCode').value.trim().toUpperCase();
    if (!/^[A-F0-9]{8}$/.test(entered)) {
      get('pairStatus').textContent = 'Enter the eight-character code shown on the host device.';
      return;
    }
    pair(entered);
  });
  get('disconnect').addEventListener('click', disconnect);
  get('fullscreen').hidden = !document.documentElement.requestFullscreen;
  get('fullscreen').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  });
  document.addEventListener('fullscreenchange', () => {
    get('fullscreen').textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen';
    paint();
  });
  const Audio = window.AudioContext || window.webkitAudioContext;
  get('sound').hidden = !Audio;
  get('sound').addEventListener('click', () => {
    if (!audio) audio = new Audio();
    soundEnabled = !soundEnabled;
    if (soundEnabled) audio.resume().catch(() => {});
    get('sound').textContent = soundEnabled ? 'Sound on' : 'Sound off';
    get('sound').setAttribute('aria-pressed', String(soundEnabled));
  });
  window.addEventListener('resize', fitFrame);
  window.addEventListener('online', () => { if (code && !socket && hasConnected) connect(); });
  window.addEventListener('pagehide', () => { if (socket) socket.close(); });
  setInterval(() => { if (socket && Date.now() - lastMessage > 18000) socket.close(); }, 3000);

  // Keep the TV awake while the Party Screen is open. TV browsers and Cast
  // devices may sleep or start a screensaver when no video plays. Use the Screen
  // Wake Lock API where it exists (HTTPS only), and otherwise play a silent,
  // almost invisible 1 fps video, which TV browsers treat as video playing.
  let wakeLock = null;
  let keepAwakeVideo = null;
  function keepAwake() {
    if (document.visibilityState !== 'visible') return;
    if (!wakeLock && navigator.wakeLock?.request) {
      navigator.wakeLock.request('screen').then(lock => {
        wakeLock = lock;
        lock.addEventListener('release', () => { wakeLock = null; });
      }).catch(() => {});
    }
    try {
      if (!keepAwakeVideo) {
        const source = document.createElement('canvas');
        source.width = source.height = 16;
        if (!source.captureStream) return;
        const ink = source.getContext('2d');
        let frame = 0;
        const draw = () => { ink.fillStyle = frame++ % 2 ? '#2d105f' : '#2e1060'; ink.fillRect(0, 0, 16, 16); };
        draw();
        setInterval(draw, 1000);
        keepAwakeVideo = document.createElement('video');
        keepAwakeVideo.muted = true;
        keepAwakeVideo.loop = true;
        keepAwakeVideo.playsInline = true;
        keepAwakeVideo.setAttribute('playsinline', '');
        keepAwakeVideo.setAttribute('aria-hidden', 'true');
        keepAwakeVideo.srcObject = source.captureStream(1);
        Object.assign(keepAwakeVideo.style, { position: 'fixed', inset: '0', width: '100%', height: '100%',
          objectFit: 'cover', opacity: '0.01', zIndex: '-1', pointerEvents: 'none' });
        document.body.prepend(keepAwakeVideo);
      }
      if (keepAwakeVideo.paused) keepAwakeVideo.play().catch(() => {});
    } catch (_) { /* Not available on this TV browser. */ }
  }
  document.addEventListener('visibilitychange', keepAwake);
  for (const type of ['click', 'keydown', 'touchstart']) document.addEventListener(type, keepAwake, { passive: true });
  setInterval(keepAwake, 30000);
  keepAwake();

  // Host-launched presentations (AirPlay external display, Google Cast receiver)
  // pass the pairing code in the URL fragment, which is never sent to a server.
  const launch = new URLSearchParams(location.hash.slice(1));
  if (launch.get('embedded') === '1') document.body.classList.add('embedded');
  const launchCode = (launch.get('pair') || '').toUpperCase();
  if (/^[A-F0-9]{8}$/.test(launchCode)) {
    get('pairCode').value = launchCode;
    pair(launchCode);
  }
})();
