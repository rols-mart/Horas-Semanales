const ids = ['profile', 'target', 'endpoint', 'key'];
const els = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
const modes = [...document.querySelectorAll('input[name="goalMode"]')];
// Office days per week, same as OFFICE_DAYS in content.js.
const DAYS = 3;

// Examples with the current goal, for a first day that falls 0.5 h short.
const showExamples = (target) => {
  if (!(target > 0)) return;
  const daily = target / DAYS;
  const day1 = daily - 0.5;
  const n = (v) => +v.toFixed(2);
  document.getElementById('ex-spread').textContent =
    `Divide lo que falta entre los días que quedan. Ej.: si el día 1 cierra en ${n(day1)} h, ` +
    `el día 2 pide ${n((target - day1) / (DAYS - 1))} h y el día 3 se ajusta con lo que resulte.`;
  document.getElementById('ex-next').textContent =
    `Mueve toda la diferencia solo al día siguiente. Ej.: si el día 1 cierra en ${n(day1)} h, ` +
    `el día 2 pide ${n(2 * daily - day1)} h; si el día 2 también queda corto, el día 3 carga con ese ajuste.`;
};

chrome.storage.sync.get({ profile: 'normal', target: 25.5, goalMode: 'spread', endpoint: '', key: '' }, (saved) => {
  ids.forEach((id) => (els[id].value = saved[id]));
  modes.forEach((radio) => (radio.checked = radio.value === saved.goalMode));
  showExamples(saved.target);
});
ids.forEach((id) => {
  els[id].onchange = () => {
    const value = els[id].value.trim();
    // Ignore an empty or invalid goal instead of saving it.
    if (id === 'target' && !(Number(value) > 0)) return;
    chrome.storage.sync.set({ [id]: id === 'target' ? Number(value) : value });
  };
});
els.target.oninput = () => showExamples(Number(els.target.value));

// Report site: save it and ask Chrome for access to that origin only.
// background.js injects the content script once the permission is granted.
const hostInput = document.getElementById('host');
const hostStatus = document.getElementById('host-status');
const toOrigin = (value) => {
  try {
    return `https://${new URL(value.includes('://') ? value : `https://${value}`).hostname}/*`;
  } catch {
    return null;
  }
};
chrome.storage.sync.get({ host: '' }, async ({ host }) => {
  if (!host) return (hostStatus.textContent = 'Sin configurar: escribe el dominio y pulsa "Permitir".');
  hostInput.value = new URL(host.replace('/*', '/')).hostname;
  const granted = await chrome.permissions.contains({ origins: [host] });
  hostStatus.textContent = granted ? 'Activo. Recarga el reporte tras cambiarlo.' : 'Falta el permiso: pulsa "Permitir".';
});
document.getElementById('allow').onclick = async () => {
  const origin = toOrigin(hostInput.value.trim());
  if (!origin) return (hostStatus.textContent = 'Escribe un dominio válido.');
  const { host: old } = await chrome.storage.sync.get({ host: '' });
  // Not awaited: the permission request has to run inside the click.
  chrome.storage.sync.set({ host: origin });
  const granted = await chrome.permissions.request({ origins: [origin] });
  if (granted && old && old !== origin) chrome.permissions.remove({ origins: [old] });
  hostStatus.textContent = granted ? 'Activo. Recarga el reporte.' : 'Permiso denegado.';
};
modes.forEach((radio) => (radio.onchange = () => chrome.storage.sync.set({ goalMode: radio.value })));
