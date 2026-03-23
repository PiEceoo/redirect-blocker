// background.js

// ─── Draw the app icon onto the toolbar using Canvas ──────────────────────
// Chrome requires bitmap icons — we render our SVG-style shield via OffscreenCanvas
// so no PNG file is needed at all.

function drawIcon(size) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const s = size / 64; // scale factor (design is on a 64×64 grid)

  // ── Background rounded square ──
  const radius = 15 * s;
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

  const bgGrad = ctx.createLinearGradient(0, 0, size, size);
  bgGrad.addColorStop(0, '#1c2233');
  bgGrad.addColorStop(1, '#141926');
  ctx.fillStyle = bgGrad;
  ctx.fill();

  // ── Radial glow ──
  const glowGrad = ctx.createRadialGradient(size*0.5, size*0.46, 0, size*0.5, size*0.46, size*0.52);
  glowGrad.addColorStop(0, 'rgba(61,214,245,0.22)');
  glowGrad.addColorStop(1, 'rgba(61,214,245,0)');
  ctx.fillStyle = glowGrad;
  // clip to rounded rect still active? re-clip
  ctx.save();
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
  ctx.clip();
  ctx.fillRect(0, 0, size, size);
  ctx.restore();

  // ── Shield path (same proportions as popup SVG) ──
  // Original coords on 64px grid:
  // M32 11 L47 17.5 L47 33 C47 41.5 40.5 48.5 32 52 C23.5 48.5 17 41.5 17 33 L17 17.5 Z
  function sp(x, y) { return [x * s, y * s]; }

  ctx.save();
  ctx.shadowColor = 'rgba(61,214,245,0.55)';
  ctx.shadowBlur = 6 * s;

  // Shield fill
  ctx.beginPath();
  ctx.moveTo(...sp(32, 11));
  ctx.lineTo(...sp(47, 17.5));
  ctx.lineTo(...sp(47, 33));
  ctx.bezierCurveTo(...sp(47, 41.5), ...sp(40.5, 48.5), ...sp(32, 52));
  ctx.bezierCurveTo(...sp(23.5, 48.5), ...sp(17, 41.5), ...sp(17, 33));
  ctx.lineTo(...sp(17, 17.5));
  ctx.closePath();

  const fillGrad = ctx.createLinearGradient(...sp(32, 11), ...sp(32, 52));
  fillGrad.addColorStop(0, 'rgba(61,214,245,0.13)');
  fillGrad.addColorStop(1, 'rgba(129,140,248,0.06)');
  ctx.fillStyle = fillGrad;
  ctx.fill();

  // Shield stroke
  ctx.beginPath();
  ctx.moveTo(...sp(32, 11));
  ctx.lineTo(...sp(47, 17.5));
  ctx.lineTo(...sp(47, 33));
  ctx.bezierCurveTo(...sp(47, 41.5), ...sp(40.5, 48.5), ...sp(32, 52));
  ctx.bezierCurveTo(...sp(23.5, 48.5), ...sp(17, 41.5), ...sp(17, 33));
  ctx.lineTo(...sp(17, 17.5));
  ctx.closePath();

  const strokeGrad = ctx.createLinearGradient(...sp(32, 11), ...sp(32, 52));
  strokeGrad.addColorStop(0, '#3dd6f5');
  strokeGrad.addColorStop(1, '#818cf8');
  ctx.strokeStyle = strokeGrad;
  ctx.lineWidth = 2.2 * s;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Notch at top
  ctx.beginPath();
  ctx.moveTo(...sp(28, 11.8));
  ctx.lineTo(...sp(32, 10));
  ctx.lineTo(...sp(36, 11.8));
  ctx.strokeStyle = strokeGrad;
  ctx.lineWidth = 2.2 * s;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();

  ctx.restore();

  return ctx.getImageData(0, 0, size, size);
}

function setIcon() {
  chrome.action.setIcon({
    imageData: {
      16:  drawIcon(16),
      32:  drawIcon(32),
      48:  drawIcon(48),
      128: drawIcon(128),
    }
  });
}

// Set icon on startup and install
chrome.runtime.onInstalled.addListener(setIcon);
chrome.runtime.onStartup.addListener(setIcon);
setIcon();

// ─── Service Worker Keepalive ─────────────────────────────────────────────
// Chrome MV3 service workers shut down after ~30s of inactivity which causes
// the popup to silently fail to open. We use two mechanisms to prevent this:
//
// 1. A chrome.alarms ping every 25 seconds that wakes the worker back up
//    before Chrome can kill it (alarms are the only MV3-approved keepalive).
// 2. A message listener so the popup can ping us on open and confirm we're alive.

chrome.alarms.create('keepalive', { periodInMinutes: 0.4 }); // every ~25s
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepalive') {
    // Just waking up is enough — redraw icon in case it was reset
    setIcon();
  }
});

// ─── Redirect Blocker ─────────────────────────────────────────────────────

function getHostname(url) {
  try {
    if (url && (url.startsWith('http:') || url.startsWith('https:'))) {
       return new URL(url).hostname;
    }
    return null;
  } catch (e) {
    console.error("Error parsing URL:", url, e);
    return null;
  }
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
          console.log(`Redirect attempt from "${openerHostname}". Closing tab.`);
          chrome.tabs.remove(newTab.id).catch(err => console.error("Error closing tab:", err));
        }
      });
    } catch (error) {
      console.error("Error retrieving opener tab details:", error);
    }
  }
});

// ─── Single message listener (PING + toggle relay) ───────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ alive: true });
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

console.log("Redirect Blocker background script loaded.");
