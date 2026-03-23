// Wake the service worker before doing anything else.
// If it's gone idle, the first sendMessage may fail — we retry once.
function wakeServiceWorker(callback) {
  chrome.runtime.sendMessage({ type: 'PING' }, (response) => {
    if (chrome.runtime.lastError || !response) {
      // Worker was asleep — give it 150ms to spin back up then continue
      setTimeout(callback, 150);
    } else {
      callback();
    }
  });
}

// Wrap everything in the wake check so the popup never opens to a dead worker
wakeServiceWorker(() => {

// popup.js

const siteInput   = document.getElementById('site-input');
const addButton   = document.getElementById('add-button');
const blockedList = document.getElementById('blocked-list');
const siteCount   = document.getElementById('site-count');
const ytAdToggle  = document.getElementById('yt-ad-toggle');
const exportButton= document.getElementById('export-button');
const dropZone    = document.getElementById('drop-zone');
const importFile  = document.getElementById('import-file');
const importStatus= document.getElementById('import-status');

// --- Redirect Blocker ---

function updateCount(n) {
    siteCount.textContent = n;
}

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

        li.appendChild(span);
        li.appendChild(btn);
        blockedList.appendChild(li);
    });
}

function loadBlockedSites() {
    chrome.storage.sync.get(['blockedSites'], (result) => {
        renderBlockedSites(result.blockedSites || []);
    });
}

function handleAddSite() {
    let newSite = siteInput.value.trim().toLowerCase();
    if (!newSite) { alert("Please enter a site hostname (e.g., example.com)."); return; }

    try {
        if (!newSite.startsWith('http://') && !newSite.startsWith('https://')) newSite = 'http://' + newSite;
        newSite = new URL(newSite).hostname;
    } catch (e) {
        newSite = siteInput.value.trim().toLowerCase();
        if (newSite.includes('/') || newSite.includes(':') || newSite.includes('?')) {
            alert("Invalid hostname. Enter just the domain (e.g., example.com).");
            return;
        }
    }

    if (!newSite) { alert("Invalid hostname format."); return; }

    chrome.storage.sync.get(['blockedSites'], (result) => {
        const sites = result.blockedSites || [];
        if (sites.includes(newSite)) {
            alert(`"${newSite}" is already blocked.`);
        } else {
            const updated = [...sites, newSite];
            chrome.storage.sync.set({ blockedSites: updated }, () => {
                renderBlockedSites(updated);
                siteInput.value = '';
            });
        }
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

// --- YouTube Ad Skipper Toggle ---

chrome.storage.sync.get(['ytAdSkip'], (result) => {
    ytAdToggle.checked = !!result.ytAdSkip;
});

ytAdToggle.addEventListener('change', () => {
    const enabled = ytAdToggle.checked;
    chrome.storage.sync.set({ ytAdSkip: enabled }, () => {
        chrome.runtime.sendMessage({ type: 'SET_YT_AD_SKIP', enabled });
    });
});

// --- Settings Backup ---

function showStatus(msg, isError = false) {
    importStatus.textContent = msg;
    importStatus.className = 'import-status' + (isError ? ' error' : '');
    setTimeout(() => { importStatus.textContent = ''; importStatus.className = 'import-status'; }, 3000);
}

exportButton.addEventListener('click', () => {
    chrome.storage.sync.get(['blockedSites', 'ytAdSkip'], (result) => {
        const settings = {
            blockedSites: result.blockedSites || [],
            ytAdSkip: !!result.ytAdSkip,
            exportedAt: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'redirect-blocker-settings.json';
        a.click();
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
        } catch (err) {
            showStatus('✗ ' + err.message, true);
        }
        importFile.value = '';
    };
    reader.readAsText(file);
}

importFile.addEventListener('change', (e) => processImportFile(e.target.files[0]));

dropZone.addEventListener('dragenter', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragover',  (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', (e) => { if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('drag-over'); });
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.json')) processImportFile(file);
    else showStatus('✗ Please drop a .json file.', true);
});

}); // end wakeServiceWorker
