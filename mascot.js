// DoodleForth pencil mascot for the TV Party Screen and browser players.
// Decorative only: it never draws on the game canvas, never sends anything to
// the host and never shows the secret word. Images come from mascot/, with a
// random cap / no-cap pick each time a scene starts.
(() => {
  'use strict';

  // Quotes shown in a speech bubble while players wait. Kept as JSON between
  // the markers so the iOS app reads the same list (MascotQuotes in Swift).
  const quotes = /* quotes:start */{
    "fun": [
      "Warming up my eraser…",
      "I'm sharp today. Literally.",
      "Squiggles are just lines with big dreams.",
      "Every masterpiece starts as a doodle.",
      "No pressure. Well, a little pencil pressure.",
      "I've got a point to make.",
      "Draw it boldly. Guess it wildly.",
      "Stick figures are art. I said what I said.",
      "I'm a pencil of few words and lots of lines.",
      "Somebody bring the snacks!",
      "Ready, set, sketch!",
      "Is that a cat or a cloud? Yes.",
      "I never lose my temper. Just my cap.",
      "Graphite and chill.",
      "Let's make our mark!",
      "My favorite shape? All of them.",
      "Doodle first, ask questions later.",
      "Lead the way! Get it? Lead?",
      "To 2B or not to 2B…",
      "Life is short. Draw big.",
      "Wiggly lines count too!",
      "This room has great drawing energy.",
      "Mistakes are just happy squiggles.",
      "Keep calm and doodle on.",
      "I can hear the pencils sharpening.",
      "Get your guessing faces on!",
      "Every line tells a story.",
      "Today's forecast: 100% doodles.",
      "Snacks, friends, doodles. Perfect.",
      "I'm on a roll. Pencils don't roll far, though."
    ],
    "drawTips": [
      "Tip: Draw the big shape first, then add details.",
      "Tip: Arrows help show where to look.",
      "Tip: Short on time? Draw the most famous part.",
      "Tip: Use color to make your idea pop.",
      "Tip: Draw a few small clues for a big idea.",
      "Tip: Stuck? Draw what it does.",
      "Tip: Two words? Draw each part.",
      "Tip: Use the eraser. Fresh starts are fine.",
      "Tip: The fill tool colors a whole shape at once.",
      "Tip: Undo is your friend.",
      "Tip: Pick an easy word when you're nervous.",
      "Tip: Show where things are, like a sun above a house.",
      "Tip: Act it out with stick figures.",
      "Tip: Thick lines are easier to see.",
      "Tip: Keep your drawing near the middle.",
      "Tip: Draw the setting, like water for a fish.",
      "Tip: Silly drawings are the most fun."
    ],
    "gameTips": [
      "Tip: Guess often! Wrong guesses are free.",
      "Tip: Try a word that sounds similar.",
      "Tip: Use the category hint.",
      "Tip: Count the blanks before you guess.",
      "Tip: Skip letters and numbers. Make them guess!",
      "Tip: Guess fast. Quick guesses earn more points.",
      "Tip: Read other guesses for clues.",
      "Tip: Simple drawings are easier to guess.",
      "Tip: Guess the big idea first, then get specific.",
      "Tip: Rhymes can help when you're stuck.",
      "Tip: Warm up with Solo Practice.",
      "Tip: Tap your picture to change your character.",
      "Tip: A word already found? Build on it."
    ]
  }/* quotes:end */;

  const motions = {
    greeting: 'mascot-bob', drawing: 'mascot-lean', idea: 'mascot-bob', thinking: 'mascot-tilt',
    excited: 'mascot-jump', celebrate: 'mascot-jump', surprised: 'mascot-hop', confused: 'mascot-shrug',
    wink: 'mascot-lean', teaching: 'mascot-bob', 'drawing-action': 'mascot-lean', relaxed: 'mascot-sway'
  };

  function image(pose) {
    const img = document.createElement('img');
    img.src = 'mascot/' + (Math.random() < 0.5 ? 'cap' : 'plain') + '-' + pose + '.png';
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    return img;
  }

  // Shows `pose` in `container`. Calling again with the same key keeps the
  // current element, so live updates never restart the animation or swap caps.
  function place(container, key, pose) {
    if (!container) return null;
    if (container.dataset.mascotKey === key && container.firstElementChild) return container.firstElementChild;
    container.dataset.mascotKey = key;
    const figure = document.createElement('div');
    figure.className = 'mascot mascot-in ' + (motions[pose] || 'mascot-bob');
    figure.setAttribute('aria-hidden', 'true');
    figure.append(image(pose));
    container.replaceChildren(figure);
    container.hidden = false;
    return figure;
  }

  function clear(container) {
    if (!container) return;
    stopIdle(container);
    if (!container.dataset.mascotKey) return;
    delete container.dataset.mascotKey;
    container.replaceChildren();
    container.hidden = true;
  }

  function confetti(container, count) {
    const colors = ['#ffd43b', '#ff6fb5', '#4cc9f0', '#7bd389', '#b388ff', '#ff8a20'];
    const layer = document.createElement('div');
    layer.className = 'mascot-confetti';
    layer.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < (count || 36); i += 1) {
      const piece = document.createElement('i');
      piece.style.left = (Math.random() * 100).toFixed(1) + '%';
      piece.style.background = colors[i % colors.length];
      piece.style.animationDelay = (Math.random() * 0.6).toFixed(2) + 's';
      piece.style.setProperty('--drift', ((Math.random() - 0.5) * 160).toFixed(0) + 'px');
      piece.style.setProperty('--spin', ((Math.random() - 0.5) * 900).toFixed(0) + 'deg');
      layer.append(piece);
    }
    container.append(layer);
    setTimeout(() => layer.remove(), 3600);
  }

  // Winner celebration: the celebrating pencil and the winners' own avatars
  // high-five, with confetti. `winners` is [{ name, avatar: Element }].
  function celebrate(container, key, title, winners) {
    if (!container) return;
    if (container.dataset.mascotKey === key) return;
    container.dataset.mascotKey = key;
    const stage = document.createElement('div');
    stage.className = 'mascot-win';
    const pencil = document.createElement('div');
    pencil.className = 'mascot mascot-in mascot-jump mascot-win-pencil';
    pencil.append(image('celebrate'));
    const crowd = document.createElement('div');
    crowd.className = 'mascot-win-crowd';
    for (const winner of winners.slice(0, 4)) {
      const card = document.createElement('div');
      card.className = 'mascot-win-player';
      if (winner.avatar) card.append(winner.avatar);
      const name = document.createElement('strong');
      name.textContent = winner.name;
      card.append(name);
      crowd.append(card);
    }
    const heading = document.createElement('p');
    heading.className = 'mascot-win-title';
    heading.textContent = title;
    stage.append(pencil, crowd, heading);
    container.replaceChildren(stage);
    container.hidden = false;
    if (!window.matchMedia || !window.matchMedia('(prefers-reduced-motion: reduce)').matches) confetti(container, 44);
  }

  // A shuffled deck per kind, so a quote never repeats until all have shown.
  const decks = {};
  function nextQuote(kind) {
    const key = kind || 'mix';
    let deck = decks[key];
    if (!deck || !deck.length) {
      const tips = quotes.drawTips.concat(quotes.gameTips);
      const pool = kind === 'drawTips' ? quotes.drawTips : kind === 'tips' ? tips : kind === 'fun' ? quotes.fun : quotes.fun.concat(tips);
      const last = decks[key + ':last'];
      deck = pool.slice();
      for (let i = deck.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        const swap = deck[i]; deck[i] = deck[j]; deck[j] = swap;
      }
      if (deck.length > 1 && deck[deck.length - 1] === last) deck.unshift(deck.pop());
      decks[key] = deck;
    }
    const quote = deck.pop();
    decks[key + ':last'] = quote;
    return quote;
  }

  // Idle scene: rotates through `poses` and fresh quotes every 8 seconds while
  // players wait. Calling again with the same key keeps the scene running.
  const idleTimers = new WeakMap();
  function idle(container, bubble, key, poses, kind) {
    if (!container) return;
    if (container.dataset.idleKey === key) return;
    stopIdle(container);
    container.dataset.idleKey = key;
    let step = 0;
    const show = () => {
      place(container, key + ':' + step, poses[step % poses.length]);
      if (bubble) {
        bubble.textContent = nextQuote(kind);
        bubble.hidden = false;
        bubble.classList.remove('mascot-quote-in');
        void bubble.offsetWidth;
        bubble.classList.add('mascot-quote-in');
      }
      step += 1;
    };
    show();
    idleTimers.set(container, { timer: setInterval(show, 8000), bubble });
  }

  function stopIdle(container) {
    if (!container) return;
    const running = idleTimers.get(container);
    if (running) {
      clearInterval(running.timer);
      if (running.bubble) { running.bubble.hidden = true; running.bubble.textContent = ''; }
      idleTimers.delete(container);
    }
    delete container.dataset.idleKey;
  }

  window.DoodleMascot = { place, clear, celebrate, confetti, idle, stopIdle, nextQuote };
})();
