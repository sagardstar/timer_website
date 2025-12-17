export function bindTeaLevel(teaEl) {
  return (elapsedMs, totalMs) => {
    const pct = Math.max(0, Math.min(1, elapsedMs / totalMs));
    teaEl.style.setProperty('--tea-level', String(pct));
  };
}

export function setBreakVisual(isBreak) {
  document.body.classList.toggle('break-active', !!isBreak);
}

// Ambient sky engine: positions sun/moon and toggles day/night based on time.
let ambient = {
  enabled: true,
  useRealSunTimes: true,
  skyEl: null,
  sunEl: null,
  moonEl: null,
  starsEl: null,
  rect: null,
  // cached sunrise/sunset for today, next sunrise, prev sunset
  sunTimes: null,
  intervalId: null
};

export function initAmbientSky({ animatedBackground = true, useRealSunTimes = true } = {}) {
  ambient.enabled = !!animatedBackground;
  ambient.useRealSunTimes = !!useRealSunTimes;
  ambient.skyEl = document.querySelector('.sky');
  ambient.sunEl = document.querySelector('.sun');
  ambient.moonEl = document.querySelector('.moon');
  ambient.starsEl = document.querySelector('.stars');
  if (!ambient.skyEl || !ambient.sunEl || !ambient.moonEl) return;

  // toggle body class for animations
  document.body.classList.toggle('no-anim-bg', !ambient.enabled);

  // Prepare geometry cache
  const updateRect = () => { ambient.rect = ambient.skyEl.getBoundingClientRect(); };
  updateRect();
  window.addEventListener('resize', updateRect);

  // Fetch sun times (geolocation) if enabled; otherwise use fixed 6-20
  computeSunTimes().then(() => {
    // first draw immediately
    drawAmbient();
    // re-draw on visibility change
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') drawAmbient();
    });
    // update every minute (lightweight)
    if (ambient.intervalId) clearInterval(ambient.intervalId);
    ambient.intervalId = setInterval(drawAmbient, 60 * 1000);
  });
}

export function updateAmbientSettings({ animatedBackground, useRealSunTimes } = {}) {
  if (typeof animatedBackground === 'boolean') ambient.enabled = animatedBackground;
  if (typeof useRealSunTimes === 'boolean') ambient.useRealSunTimes = useRealSunTimes;
  document.body.classList.toggle('no-anim-bg', !ambient.enabled);
  computeSunTimes().then(drawAmbient);
}

export function setSunsetMode(on) {
  const sky = document.querySelector('.sky');
  if (!sky) return;
  sky.classList.toggle('goal-sunset', !!on);
}

async function computeSunTimes() {
  const today = new Date();
  if (!ambient.useRealSunTimes || !('geolocation' in navigator)) {
    ambient.sunTimes = fixedSunTimes(today);
    return;
  }
  try {
    const pos = await getLocationOnce({ timeout: 5000 });
    ambient.sunTimes = solarSunTimes(today, pos.coords.latitude, pos.coords.longitude);
  } catch {
    ambient.sunTimes = fixedSunTimes(today);
  }
}

function drawAmbient() {
  if (!ambient.skyEl || !ambient.sunEl || !ambient.moonEl) return;
  const now = new Date();
  const { sunrise, sunset, tomorrowSunrise, yesterdaySunset } = ambient.sunTimes || fixedSunTimes(now);
  const isDay = now >= sunrise && now < sunset;

  ambient.skyEl.setAttribute('data-mode', isDay ? 'day' : 'night');

  // Update background variables slightly near golden hours
  const minutesFromSunrise = Math.abs((now - sunrise) / 60000);
  const minutesToSunset = Math.abs((sunset - now) / 60000);
  const warmFactor = Math.max(0, Math.min(1, Math.max(0, 30 - minutesFromSunrise)/30, Math.max(0, 30 - minutesToSunset)/30));
  // We keep CSS gradients simple; optional: tint could be handled by goal-sunset overlay.

  if (isDay) {
    // Position sun along a smooth arc left->right
    const p = clamp01((now - sunrise) / (sunset - sunrise));
    positionSun(p);
    ambient.sunEl.style.opacity = '0.95';
    ambient.moonEl.style.opacity = '0.0';
  } else {
    // Night: moon moves during night interval across midnight
    let start, end;
    if (now >= sunset) { // tonight until tomorrow sunrise
      start = sunset; end = tomorrowSunrise;
    } else { // after midnight until today sunrise
      start = yesterdaySunset; end = sunrise;
    }
    const pN = clamp01((now - start) / (end - start));
    positionMoon(pN);
    ambient.sunEl.style.opacity = '0.0';
    ambient.moonEl.style.opacity = '0.95';
  }
}

function positionSun(p) {
  if (!ambient.rect) ambient.rect = ambient.skyEl.getBoundingClientRect();
  const W = ambient.rect.width;
  const H = ambient.rect.height;
  const sunW = ambient.sunEl.offsetWidth;
  const sunH = ambient.sunEl.offsetHeight;
  const left = lerp(0 + 12, W - sunW - 12, p);
  const baseY = H * 0.70; // baseline lower in frame
  const amp = H * 0.38; // arc height
  const y = baseY - Math.sin(Math.PI * p) * amp;
  const top = clamp(8, H - sunH - 8, y - sunH / 2);
  ambient.sunEl.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
}

function positionMoon(p) {
  if (!ambient.rect) ambient.rect = ambient.skyEl.getBoundingClientRect();
  const W = ambient.rect.width;
  const H = ambient.rect.height;
  const moonW = ambient.moonEl.offsetWidth;
  const moonH = ambient.moonEl.offsetHeight;
  // right-to-left for contrast at night
  const left = lerp(W - moonW - 12, 12, p);
  const baseY = H * 0.55;
  const amp = H * 0.22;
  const y = baseY - Math.sin(Math.PI * p) * amp;
  const top = clamp(8, H - moonH - 8, y - moonH / 2);
  ambient.moonEl.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
}

function clamp(a, b, v) { return Math.max(a, Math.min(b, v)); }
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }

function fixedSunTimes(d) {
  const sunrise = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 6, 0, 0);
  const sunset = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 20, 0, 0);
  const tomorrow = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  const yesterday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
  const tomorrowSunrise = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 6, 0, 0);
  const yesterdaySunset = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 20, 0, 0);
  return { sunrise, sunset, tomorrowSunrise, yesterdaySunset };
}

function getLocationOnce({ timeout = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout, maximumAge: 3600_000 });
  });
}

// NOAA sunrise/sunset approximation
function solarSunTimes(date, latitude, longitude) {
  const zenith = 90.833; // civil
  const toRad = (d) => d * Math.PI / 180;
  const toDeg = (r) => r * 180 / Math.PI;
  const dayOfYear = (d) => {
    const start = new Date(d.getFullYear(), 0, 0);
    const diff = d - start + ((start.getTimezoneOffset() - d.getTimezoneOffset()) * 60000);
    return Math.floor(diff / 86400000);
  };
  const N = dayOfYear(date);
  const lngHour = longitude / 15;
  const tzOffset = -date.getTimezoneOffset() / 60;

  function compute(isSunrise) {
    const t = N + ((isSunrise ? 6 : 18) - lngHour) / 24;
    const M = (0.9856 * t) - 3.289;
    let L = M + (1.916 * Math.sin(toRad(M))) + (0.020 * Math.sin(toRad(2 * M))) + 282.634;
    L = (L + 360) % 360;
    let RA = toDeg(Math.atan(0.91764 * Math.tan(toRad(L))));
    RA = (RA + 360) % 360;
    const Lquadrant  = Math.floor(L / 90) * 90;
    const RAquadrant = Math.floor(RA / 90) * 90;
    RA = RA + (Lquadrant - RAquadrant);
    RA = RA / 15;
    const sinDec = 0.39782 * Math.sin(toRad(L));
    const cosDec = Math.cos(Math.asin(sinDec));
    const cosH = (Math.cos(toRad(zenith)) - (sinDec * Math.sin(toRad(latitude)))) / (cosDec * Math.cos(toRad(latitude)));
    if (cosH > 1 || cosH < -1) return null; // no sunrise/sunset
    let H = isSunrise ? 360 - toDeg(Math.acos(cosH)) : toDeg(Math.acos(cosH));
    H = H / 15;
    const T = H + RA - (0.06571 * t) - 6.622;
    let UT = (T - lngHour) % 24; if (UT < 0) UT += 24;
    const localT = UT + tzOffset; // local time hours
    const h = Math.floor(localT);
    const m = Math.floor((localT - h) * 60);
    const s = Math.floor((((localT - h) * 60) - m) * 60);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m, s);
  }

  let sunrise = compute(true);
  let sunset = compute(false);
  // Fallback to fixed if computation failed
  if (!sunrise || !sunset) return fixedSunTimes(date);
  // Tomorrow sunrise and yesterday sunset
  const tomorrow = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  const yesterday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
  const tomorrowSunrise = solarSunTimes(tomorrow, latitude, longitude).sunrise;
  const yesterdaySunset = solarSunTimes(yesterday, latitude, longitude).sunset;
  return { sunrise, sunset, tomorrowSunrise, yesterdaySunset };
}
