// popup.js

// ─── Wake service worker before doing anything ─────────────────────────────
function wakeServiceWorker(callback) {
  chrome.runtime.sendMessage({ type: 'PING' }, (response) => {
    if (chrome.runtime.lastError || !response) {
      setTimeout(callback, 150);
    } else {
      callback();
    }
  });
}

wakeServiceWorker(() => {

// ─── Element refs ──────────────────────────────────────────────────────────
const siteInput    = document.getElementById('site-input');
const addButton    = document.getElementById('add-button');
const blockedList  = document.getElementById('blocked-list');
const siteCount    = document.getElementById('site-count');
const ytAdToggle   = document.getElementById('yt-ad-toggle');
const exportButton = document.getElementById('export-button');
const dropZone     = document.getElementById('drop-zone');
const importFile   = document.getElementById('import-file');
const importStatus = document.getElementById('import-status');

// Stats elements
const statSession  = document.getElementById('stat-session');
const statTotal    = document.getElementById('stat-total');
const statsSites   = document.getElementById('stats-sites');
const statsReset   = document.getElementById('stats-reset');

// Update banner elements
const updateBanner  = document.getElementById('update-banner');
const updateVersion = document.getElementById('update-version');
const updateLink    = document.getElementById('update-link');

// ─── Update Checker ────────────────────────────────────────────────────────
// Fetches version.json from GitHub Pages
const VERSION_URL = 'https://PiEceoo.github.io/redirect-blocker/version.json';
const CURRENT_VERSION = chrome.runtime.getManifest().version;

function compareVersions(a, b) {
  // Returns true if b is newer than a
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0, nb = pb[i] || 0;
    if (nb > na) return true;
    if (nb < na) return false;
  }
  return false;
}

async function checkForUpdate() {
  try {
    const res = await fetch(VERSION_URL + '?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    if (compareVersions(CURRENT_VERSION, data.version)) {
      updateVersion.textContent = `v${CURRENT_VERSION} → v${data.version}${data.changelog ? ' · ' + data.changelog : ''}`;
      updateLink.href = data.download || VERSION_URL;
      updateBanner.classList.remove('hidden');
    }
  } catch (e) {
    // Silently fail — no internet or file not found yet
  }
}

checkForUpdate();

// ─── Stats ─────────────────────────────────────────────────────────────────

function renderStats(session, totals) {
  // Global totals
  const sessionTotal = Object.values(session).reduce((a, b) => a + b, 0);
  const allTimeTotal = Object.values(totals).reduce((a, b) => a + b, 0);

  statSession.textContent = sessionTotal;
  statTotal.textContent   = allTimeTotal;

  // Per-site breakdown — only show sites that have been blocked
  const allSites = new Set([...Object.keys(session), ...Object.keys(totals)]);

  if (allSites.size === 0) {
    statsSites.classList.add('hidden');
    statsReset.classList.add('hidden');
    return;
  }

  statsSites.innerHTML = '';
  statsSites.classList.remove('hidden');
  statsReset.classList.remove('hidden');

  // Sort by total count descending
  const sorted = [...allSites].sort((a, b) => (totals[b] || 0) - (totals[a] || 0));

  sorted.forEach(site => {
    const row = document.createElement('div');
    row.className = 'site-stat-row';

    const name = document.createElement('span');
    name.className = 'site-stat-name';
    name.textContent = site;
    name.title = site;

    const counts = document.createElement('div');
    counts.className = 'site-stat-counts';

    const sess = document.createElement('span');
    sess.className = 'site-stat-session';
    sess.textContent = (session[site] || 0) + ' session';
    sess.title = 'Blocked this session';

    const tot = document.createElement('span');
    tot.className = 'site-stat-total';
    tot.textContent = (totals[site] || 0) + ' total';
    tot.title = 'Blocked all time';

    counts.appendChild(sess);
    counts.appendChild(tot);
    row.appendChild(name);
    row.appendChild(counts);
    statsSites.appendChild(row);
  });
}

function loadStats() {
  chrome.runtime.sendMessage({ type: 'GET_STATS' }, (response) => {
    if (chrome.runtime.lastError || !response) return;
    renderStats(response.session || {}, response.totals || {});
  });
}

statsReset.addEventListener('click', () => {
  if (!confirm('Reset all-time redirect stats? This cannot be undone.')) return;
  chrome.runtime.sendMessage({ type: 'RESET_TOTALS' }, () => loadStats());
});

loadStats();

// ─── Redirect Blocker ──────────────────────────────────────────────────────

function updateCount(n) { siteCount.textContent = n; }

function renderBlockedSites(sites) {
  blockedList.innerHTML = '';
  updateCount(sites ? sites.length : 0);
  if (!sites || sites.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No sites blocked yet';
    li.className = 'empty-state';
    blockedList.appendChild(li);
    return;
  }
  sites.forEach(site => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = site;
    const btn = document.createElement('button');
    btn.textContent = 'Remove';
    btn.className = 'remove-button';
    btn.dataset.site = site;
    btn.addEventListener('click', handleRemoveSite);
    li.appendChild(span); li.appendChild(btn);
    blockedList.appendChild(li);
  });
}

function loadBlockedSites() {
  chrome.storage.sync.get(['blockedSites'], (result) => renderBlockedSites(result.blockedSites || []));
}

function handleAddSite() {
  let newSite = siteInput.value.trim().toLowerCase();
  if (!newSite) { alert('Please enter a site hostname (e.g., example.com).'); return; }
  try {
    if (!newSite.startsWith('http://') && !newSite.startsWith('https://')) newSite = 'http://' + newSite;
    newSite = new URL(newSite).hostname;
  } catch (e) {
    newSite = siteInput.value.trim().toLowerCase();
    if (newSite.includes('/') || newSite.includes(':') || newSite.includes('?')) {
      alert('Invalid hostname. Enter just the domain (e.g., example.com).'); return;
    }
  }
  if (!newSite) { alert('Invalid hostname format.'); return; }
  chrome.storage.sync.get(['blockedSites'], (result) => {
    const sites = result.blockedSites || [];
    if (sites.includes(newSite)) { alert(`"${newSite}" is already blocked.`); return; }
    const updated = [...sites, newSite];
    chrome.storage.sync.set({ blockedSites: updated }, () => { renderBlockedSites(updated); siteInput.value = ''; });
  });
}

function handleRemoveSite(event) {
  const toRemove = event.target.dataset.site;
  chrome.storage.sync.get(['blockedSites'], (result) => {
    const updated = (result.blockedSites || []).filter(s => s !== toRemove);
    chrome.storage.sync.set({ blockedSites: updated }, () => renderBlockedSites(updated));
  });
}

addButton.addEventListener('click', handleAddSite);
siteInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleAddSite(); });
document.addEventListener('DOMContentLoaded', loadBlockedSites);
loadBlockedSites();

// ─── YouTube Ad Skipper Toggle ─────────────────────────────────────────────

chrome.storage.sync.get(['ytAdSkip'], (result) => { ytAdToggle.checked = !!result.ytAdSkip; });
ytAdToggle.addEventListener('change', () => {
  const enabled = ytAdToggle.checked;
  chrome.storage.sync.set({ ytAdSkip: enabled }, () => {
    chrome.runtime.sendMessage({ type: 'SET_YT_AD_SKIP', enabled });
  });
});

// ─── Settings Backup ───────────────────────────────────────────────────────

function showStatus(msg, isError = false) {
  importStatus.textContent = msg;
  importStatus.className = 'import-status' + (isError ? ' error' : '');
  setTimeout(() => { importStatus.textContent = ''; importStatus.className = 'import-status'; }, 3000);
}

exportButton.addEventListener('click', () => {
  chrome.storage.sync.get(['blockedSites', 'ytAdSkip'], (result) => {
    const settings = { blockedSites: result.blockedSites || [], ytAdSkip: !!result.ytAdSkip, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'redirect-blocker-settings.json'; a.click();
    URL.revokeObjectURL(url);
  });
});

function processImportFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const settings = JSON.parse(e.target.result);
      if (!Array.isArray(settings.blockedSites)) throw new Error('Missing "blockedSites" array.');
      if (typeof settings.ytAdSkip !== 'boolean') throw new Error('Missing "ytAdSkip" value.');
      chrome.storage.sync.set({ blockedSites: settings.blockedSites, ytAdSkip: settings.ytAdSkip }, () => {
        renderBlockedSites(settings.blockedSites);
        ytAdToggle.checked = settings.ytAdSkip;
        chrome.runtime.sendMessage({ type: 'SET_YT_AD_SKIP', enabled: settings.ytAdSkip });
        showStatus('✓ Settings imported!');
      });
    } catch (err) { showStatus('✗ ' + err.message, true); }
    importFile.value = '';
  };
  reader.readAsText(file);
}

importFile.addEventListener('change', (e) => processImportFile(e.target.files[0]));
dropZone.addEventListener('dragenter', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragover',  (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', (e) => { if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('drag-over'); });
dropZone.addEventListener('drop', (e) => {
  e.preventDefault(); dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.name.endsWith('.json')) processImportFile(file);
  else showStatus('✗ Please drop a .json file.', true);
});

}); // end wakeServiceWorker
