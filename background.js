// background.js

// ─── Draw the app icon onto the toolbar using Canvas ──────────────────────

function drawIcon(size) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const s = size / 64;

  const radius = 15 * s;
  function roundRect() {
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(size - radius, 0);
    ctx.quadraticCurveTo(size, 0, size, radius);
    ctx.lineTo(size, size - radius);
    ctx.quadraticCurveTo(size, size, size - radius, size);
    ctx.lineTo(radius, size);
    ctx.quadraticCurveTo(0, size, 0, size - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
  }

  const bgGrad = ctx.createLinearGradient(0, 0, size, size);
  bgGrad.addColorStop(0, '#1c2233');
  bgGrad.addColorStop(1, '#141926');
  roundRect(); ctx.fillStyle = bgGrad; ctx.fill();

  const glowGrad = ctx.createRadialGradient(size*0.5, size*0.46, 0, size*0.5, size*0.46, size*0.52);
  glowGrad.addColorStop(0, 'rgba(61,214,245,0.22)');
  glowGrad.addColorStop(1, 'rgba(61,214,245,0)');
  ctx.save(); roundRect(); ctx.clip();
  ctx.fillStyle = glowGrad; ctx.fillRect(0, 0, size, size);
  ctx.restore();

  function sp(x, y) { return [x * s, y * s]; }

  ctx.save();
  ctx.shadowColor = 'rgba(61,214,245,0.55)';
  ctx.shadowBlur = 6 * s;

  ctx.beginPath();
  ctx.moveTo(...sp(32, 11)); ctx.lineTo(...sp(47, 17.5)); ctx.lineTo(...sp(47, 33));
  ctx.bezierCurveTo(...sp(47, 41.5), ...sp(40.5, 48.5), ...sp(32, 52));
  ctx.bezierCurveTo(...sp(23.5, 48.5), ...sp(17, 41.5), ...sp(17, 33));
  ctx.lineTo(...sp(17, 17.5)); ctx.closePath();
  const fillGrad = ctx.createLinearGradient(...sp(32, 11), ...sp(32, 52));
  fillGrad.addColorStop(0, 'rgba(61,214,245,0.13)');
  fillGrad.addColorStop(1, 'rgba(129,140,248,0.06)');
  ctx.fillStyle = fillGrad; ctx.fill();

  ctx.beginPath();
  ctx.moveTo(...sp(32, 11)); ctx.lineTo(...sp(47, 17.5)); ctx.lineTo(...sp(47, 33));
  ctx.bezierCurveTo(...sp(47, 41.5), ...sp(40.5, 48.5), ...sp(32, 52));
  ctx.bezierCurveTo(...sp(23.5, 48.5), ...sp(17, 41.5), ...sp(17, 33));
  ctx.lineTo(...sp(17, 17.5)); ctx.closePath();
  const strokeGrad = ctx.createLinearGradient(...sp(32, 11), ...sp(32, 52));
  strokeGrad.addColorStop(0, '#3dd6f5'); strokeGrad.addColorStop(1, '#818cf8');
  ctx.strokeStyle = strokeGrad; ctx.lineWidth = 2.2 * s; ctx.lineJoin = 'round'; ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(...sp(28, 11.8)); ctx.lineTo(...sp(32, 10)); ctx.lineTo(...sp(36, 11.8));
  ctx.strokeStyle = strokeGrad; ctx.lineWidth = 2.2 * s;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.restore();

  return ctx.getImageData(0, 0, size, size);
}

function setIcon() {
  chrome.action.setIcon({
    imageData: { 16: drawIcon(16), 32: drawIcon(32), 48: drawIcon(48), 128: drawIcon(128) }
  });
}

chrome.runtime.onInstalled.addListener(setIcon);
chrome.runtime.onStartup.addListener(setIcon);
setIcon();

// ─── Service Worker Keepalive ──────────────────────────────────────────────

chrome.alarms.create('keepalive', { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepalive') setIcon();
});

// ─── Redirect Counter ──────────────────────────────────────────────────────
// sessionCounts: { hostname: count } — resets when the service worker restarts
// totalCounts stored in chrome.storage.local so they persist across sessions

const sessionCounts = {};

function recordRedirect(hostname) {
  // Session counter
  sessionCounts[hostname] = (sessionCounts[hostname] || 0) + 1;

  // Persistent total counter
  chrome.storage.local.get(['redirectTotals'], (result) => {
    const totals = result.redirectTotals || {};
    totals[hostname] = (totals[hostname] || 0) + 1;
    chrome.storage.local.set({ redirectTotals: totals });
  });
}

// ─── Redirect Blocker ─────────────────────────────────────────────────────

function getHostname(url) {
  try {
    if (url && (url.startsWith('http:') || url.startsWith('https:'))) {
      return new URL(url).hostname;
    }
    return null;
  } catch (e) { return null; }
}

chrome.tabs.onCreated.addListener(async (newTab) => {
  if (newTab.openerTabId) {
    try {
      const openerTab = await chrome.tabs.get(newTab.openerTabId);
      const openerHostname = getHostname(openerTab.url);
      if (!openerHostname) return;

      chrome.storage.sync.get(['blockedSites'], (result) => {
        const blockedSites = result.blockedSites || [];
        if (blockedSites.includes(openerHostname)) {
          console.log(`Redirect blocked from "${openerHostname}".`);
          recordRedirect(openerHostname);
          chrome.tabs.remove(newTab.id).catch(() => {});
        }
      });
    } catch (error) {
      console.error('Error retrieving opener tab details:', error);
    }
  }
});

// ─── Message Listener (PING + toggles + stats request) ────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.type === 'PING') {
    sendResponse({ alive: true });
    return true;
  }

  if (message.type === 'GET_STATS') {
    // Return session counts + totals for the popup to display
    chrome.storage.local.get(['redirectTotals'], (result) => {
      sendResponse({
        session: sessionCounts,
        totals: result.redirectTotals || {}
      });
    });
    return true; // async response
  }

  if (message.type === 'RESET_TOTALS') {
    chrome.storage.local.set({ redirectTotals: {} });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'SET_YT_AD_SKIP') {
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (tab.url && tab.url.includes('youtube.com')) {
          chrome.tabs.sendMessage(tab.id, message).catch(() => {});
        }
      }
    });
  }

});

console.log('Redirect Blocker background script loaded.');
