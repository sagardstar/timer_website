const DURATIONS = {
  breakStart: 4000,
  resume: 3000,
  streak: 4500,
  random: 3500
};

function mount(container, text, className, ms) {
  const el = document.createElement('div');
  el.className = `msg ${className}`;
  el.textContent = text;
  container.appendChild(el);

  // announce for screen readers
  const live = document.getElementById('aria-live');
  if (live) {
    live.textContent = '';
    setTimeout(() => { live.textContent = text; }, 10);
  }

  requestAnimationFrame(() => el.classList.add('show'));

  const timeout = setTimeout(() => {
    el.classList.remove('show');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
  }, ms);

  el.addEventListener('mouseenter', () => clearTimeout(timeout), { once: true });
}

export function createUIAdapter() {
  const top = document.getElementById('msg-top-center');
  const bottom = document.getElementById('msg-bottom');

  function showMessage(text, type) {
    switch (type) {
      case 'breakStart':
        mount(top, text, 'msg--break', DURATIONS.breakStart);
        break;
      case 'resume':
        mount(top, text, 'msg--resume', DURATIONS.resume);
        break;
      case 'streak':
        mount(bottom, text, 'msg--streak', DURATIONS.streak);
        break;
      case 'random':
      default:
        mount(bottom, text, 'msg--info', DURATIONS.random);
        break;
    }
  }

  return { showMessage };
}

