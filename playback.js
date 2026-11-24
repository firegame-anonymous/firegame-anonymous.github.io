'use strict';

const frameSeconds = 1 / 20;
const controlsTemplate = document.querySelector('#playback-controls');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function attachPlayer(panel) {
  const videos = [...panel.querySelectorAll('video')];
  const lead = panel.querySelector('.ours video');
  const grid = panel.querySelector('.video-grid');
  const controls = controlsTemplate.content.cloneNode(true);
  const inlineSlot = panel.querySelector('.case-inline-controls');
  if (inlineSlot) inlineSlot.append(controls);
  else grid.before(controls);

  const playButton = panel.querySelector('.play');
  const restartButton = panel.querySelector('.restart');
  const timeline = panel.querySelector('.timeline');
  const time = panel.querySelector('.time');
  const speed = panel.querySelector('.speed');
  const status = panel.querySelector('.player-status');
  const moments = panel.querySelector('.moments');
  let position = 0;
  let playing = false;
  let inView = false;
  let manuallyPaused = false;
  let autoStarted = false;
  let animationFrame = 0;

  for (const video of videos) {
    video.controls = false;
    video.addEventListener('loadedmetadata', () => {
      if (video === lead) updateProgress();
      if (position > 0) setPosition(video, position);
    });
    video.addEventListener('error', () => showMessage('A comparison clip could not be loaded.'));
  }

  function duration() {
    return Number.isFinite(lead.duration) ? lead.duration : Number(timeline.max);
  }

  function updateProgress() {
    timeline.max = duration().toFixed(2);
    timeline.value = position;
    time.value = `${position.toFixed(2)} / ${duration().toFixed(2)} s`;
  }

  function showMessage(message) {
    status.textContent = message;
    status.hidden = !message;
  }

  function setPosition(video, target) {
    const end = Number.isFinite(video.duration) ? video.duration : duration();
    // Keep the last frame visible when a shorter clip reaches the end of the shared timeline.
    video.currentTime = Math.min(target, Math.max(0, end - frameSeconds / 2));
  }

  function seek(target) {
    position = target;
    for (const video of videos) {
      if (video.preload === 'none') video.preload = 'auto';
      setPosition(video, target);
    }
    updateProgress();
  }

  function setPlaying(value) {
    playing = value;
    playButton.innerHTML = value ? '<span aria-hidden="true">Ⅱ</span> Pause' : '<span aria-hidden="true">▶</span> Play all';
  }

  function pause() {
    cancelAnimationFrame(animationFrame);
    for (const video of videos) video.pause();
    setPlaying(false);
  }

  function updatePlayback() {
    if (!playing) return;
    if (!lead.seeking && lead.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      position = lead.currentTime;
      for (const video of videos) {
        if (video === lead || video.seeking || video.ended || video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) continue;
        if (Math.abs(video.currentTime - position) > frameSeconds * 2) setPosition(video, position);
      }
      updateProgress();
    }
    animationFrame = requestAnimationFrame(updatePlayback);
  }

  function play() {
    showMessage('');
    if (position >= duration() - frameSeconds / 2) seek(0);
    setPlaying(true);
    for (const video of videos) {
      if (video.preload === 'none') video.preload = 'auto';
      setPosition(video, position);
      video.play().catch(error => {
        if (!playing || error.name === 'AbortError') return;
        if (video === lead) pause();
        showMessage('A clip could not play. Press Play all to retry.');
      });
    }
    animationFrame = requestAnimationFrame(updatePlayback);
  }

  playButton.addEventListener('click', () => {
    manuallyPaused = playing;
    autoStarted = false;
    if (playing) pause();
    else play();
  });
  restartButton.addEventListener('click', () => {
    const resume = playing;
    manuallyPaused = !resume;
    pause();
    seek(0);
    if (resume) play();
  });
  timeline.addEventListener('input', () => {
    const resume = playing;
    const target = Number(timeline.value);
    manuallyPaused = !resume || target >= duration() - frameSeconds / 2;
    pause();
    seek(target);
    if (resume && position < duration() - frameSeconds / 2) play();
  });
  speed.addEventListener('change', () => {
    for (const video of videos) video.playbackRate = Number(speed.value);
  });
  for (const marker of moments?.querySelectorAll('button') ?? []) {
    marker.addEventListener('click', () => {
      manuallyPaused = true;
      pause();
      seek(Number(marker.dataset.time));
    });
  }
  if (moments) moments.hidden = false;
  lead.addEventListener('ended', () => {
    pause();
    position = duration();
    updateProgress();
  });

  function syncVisibility() {
    if (document.hidden || !inView || (autoStarted && reducedMotion.matches)) {
      if (playing) pause();
    } else if (!playing && !manuallyPaused && !reducedMotion.matches) {
      autoStarted = true;
      play();
    }
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      const visible = entry.isIntersecting && entry.intersectionRatio >= 0.3;
      if (visible === inView) return;
      inView = visible;
      syncVisibility();
    }, { threshold: 0.3 }).observe(grid);
    document.addEventListener('visibilitychange', syncVisibility);
    reducedMotion.addEventListener('change', syncVisibility);
  }
}

document.querySelectorAll('.case').forEach(attachPlayer);

const backdrop = document.querySelector('.backdrop-video');
const backdropToggle = document.querySelector('.backdrop-toggle');
let backdropPaused = reducedMotion.matches;

function updateBackdrop() {
  if (backdropPaused || document.hidden) {
    backdrop.pause();
    return;
  }
  if (!backdrop.hasAttribute('src')) backdrop.src = backdrop.dataset.src;
  backdrop.play().catch(error => {
    if (error.name === 'AbortError') return;
    backdropPaused = true;
    updateBackdropButton();
  });
}

function updateBackdropButton() {
  backdropToggle.textContent = backdropPaused ? '▶' : 'Ⅱ';
  backdropToggle.setAttribute('aria-label', backdropPaused ? 'Play background video' : 'Pause background video');
}

backdropToggle.addEventListener('click', () => {
  backdropPaused = !backdropPaused;
  updateBackdropButton();
  updateBackdrop();
});
reducedMotion.addEventListener('change', event => {
  backdropPaused = event.matches;
  updateBackdropButton();
  updateBackdrop();
});
document.addEventListener('visibilitychange', updateBackdrop);
updateBackdropButton();
updateBackdrop();
backdropToggle.hidden = false;
