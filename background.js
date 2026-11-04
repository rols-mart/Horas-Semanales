// The report site is set in the popup. The content script is injected only on
// the origin the user allowed, so no site is hardcoded in the manifest.
const syncReportScript = async () => {
  const { host } = await chrome.storage.sync.get({ host: '' });
  await chrome.scripting.unregisterContentScripts({ ids: ['report'] }).catch(() => {});
  if (!host || !(await chrome.permissions.contains({ origins: [host] }))) return;
  await chrome.scripting.registerContentScripts([
    { id: 'report', matches: [host], js: ['content.js'], allFrames: true },
  ]);
};
chrome.runtime.onInstalled.addListener(syncReportScript);
chrome.runtime.onStartup.addListener(syncReportScript);
chrome.permissions.onAdded.addListener(syncReportScript);
chrome.storage.onChanged.addListener((changes) => changes.host && syncReportScript());

// Content script sends the leave timestamp; notify when it arrives.
chrome.runtime.onMessage.addListener(({ get, phone, cancel, when, name = 'salida' }, _sender, reply) => {
  if (cancel) {
    chrome.alarms.clear('salida');
    return;
  }
  if (get) {
    chrome.alarms.get('salida', (alarm) => reply(alarm && alarm.scheduledTime));
    return true;
  }
  // Arrival timestamps registered from the phone (fetched here to skip CORS).
  if (phone) {
    chrome.storage.sync.get({ endpoint: '', key: '' }, ({ endpoint, key }) => {
      if (!endpoint) return reply(null);
      fetch(`${endpoint.replace(/\/$/, '')}/arrivals?key=${encodeURIComponent(key)}`)
        .then((r) => r.json())
        .then((d) => reply(Object.values(d.days).filter(Boolean)))
        .catch(() => reply(null));
    });
    return true;
  }
  // Same alarm name, so a new arrival time replaces the previous alarm.
  if (when > Date.now()) chrome.alarms.create(name, { when });
});

chrome.alarms.onAlarm.addListener(() => {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon.png',
    title: 'Hora de salida',
    message: 'Ya cumpliste tu objetivo de horas de hoy.',
  });
});
