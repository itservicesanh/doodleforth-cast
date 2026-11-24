// DoodleForth pencil mascot for the TV Party Screen and browser players.
// Decorative only: it never draws on the game canvas, never sends anything to
// the host and never shows the secret word. Images come from mascot/, with a
// random cap / no-cap pick each time a scene starts.
(() => {
  'use strict';

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
    if (!container || !container.dataset.mascotKey) return;
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

  window.DoodleMascot = { place, clear, celebrate, confetti };
})();
