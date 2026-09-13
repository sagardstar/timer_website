const DURATIONS = {
  breakStart: 4000,
  resume: 3000,
  streak: 4500,
  random: 3500
};

function mount(container, text, className, ms, action) {
  container.querySelector('.msg')?.remove();
  const el = document.createElement('div');
  el.className = `msg ${className}`;
  const label = document.createElement('span');
  label.textContent = text;
  el.appendChild(label);
  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'msg__action';
    button.textContent = action.label;
    button.addEventListener('click', async () => {
      button.disabled = true;
      await action.onClick();
      removeNow();
    }, { once: true });
    el.appendChild(button);
  }
  container.appendChild(el);

  // announce for screen readers
  const live = document.getElementById('aria-live');
  if (live) {
    live.textContent = '';
    setTimeout(() => { live.textContent = text; }, 10);
  }

  requestAnimationFrame(() => el.classList.add('show'));

  let remaining = ms;
  let startedAt = Date.now();
  let timeout;
  let removeFallback;

  function removeNow() {
    clearTimeout(timeout);
    clearTimeout(removeFallback);
    el.classList.remove('show');
    removeFallback = setTimeout(() => el.remove(), 350);
    el.addEventListener('transitionend', () => {
      clearTimeout(removeFallback);
      el.remove();
    }, { once: true });
  }

  function schedule() {
    startedAt = Date.now();
    timeout = setTimeout(removeNow, remaining);
  }

  function pauseDismissal() {
    clearTimeout(timeout);
    remaining = Math.max(0, remaining - (Date.now() - startedAt));
  }

  function resumeDismissal() {
    if (!el.isConnected) return;
    if (remaining <= 0) removeNow();
    else schedule();
  }

  el.addEventListener('mouseenter', pauseDismissal);
  el.addEventListener('mouseleave', resumeDismissal);
  el.addEventListener('focusin', pauseDismissal);
  el.addEventListener('focusout', resumeDismissal);
  schedule();
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

  function showActionMessage(text, label, onClick) {
    mount(bottom, text, 'msg--info', 7000, { label, onClick });
  }

  return { showMessage, showActionMessage };
}
