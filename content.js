// content.js - YouTube ad skipper

const hostname = window.location.hostname;
const isYouTube = hostname.includes('youtube.com');

if (!isYouTube) {
  // Nothing to do on non-YouTube pages
} else {

// ─── Helpers ──────────────────────────────────────────────────────────────

function getVideo() {
  return (
    document.querySelector('video.html5-main-video') ||
    document.querySelector('video')
  );
}

function isAdPlaying() {
  const adModule = document.querySelector('.ytp-ad-module');
  if (adModule && adModule.children.length > 0) return true;
  if (document.querySelector('.ytp-ad-player-overlay')) return true;
  if (document.querySelector('.ytp-ad-simple-ad-badge')) return true;
  if (document.querySelector('.ytp-ad-badge')) return true;
  return false;
}

// ─── YouTube Ad Skipper ────────────────────────────────────────────────────

const YT_SKIP_SELECTORS = [
  'button.ytp-ad-skip-button-modern',
  '.ytp-skip-ad-button',
  '.ytp-ad-skip-button',
  'button.ytp-button[class*="skip"]',
];

function trySkipAd() {
  for (const sel of YT_SKIP_SELECTORS) {
    const btn = document.querySelector(sel);
    if (btn) {
      btn.click();
      console.log('[Redirect Blocker] Clicked skip button (' + sel + ')');
      return;
    }
  }

  if (isAdPlaying()) {
    const video = getVideo();
    if (video && isFinite(video.duration) && video.duration > 0) {
      if (video.duration - video.currentTime > 0.5) {
        video.currentTime = video.duration;
        console.log('[Redirect Blocker] Jumped ad to end via currentTime');
      }
    }
  }
}

let ytObserver = null;

function startYouTubeAdSkipper() {
  if (ytObserver) return;
  trySkipAd();
  ytObserver = new MutationObserver(() => {
    if (isAdPlaying()) trySkipAd();
  });
  ytObserver.observe(document.body, { childList: true, subtree: true });
  console.log('[Redirect Blocker] YouTube ad skipper started');
}

function stopYouTubeAdSkipper() {
  if (ytObserver) {
    ytObserver.disconnect();
    ytObserver = null;
    console.log('[Redirect Blocker] YouTube ad skipper stopped');
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────

chrome.storage.sync.get(['ytAdSkip'], (result) => {
  if (result.ytAdSkip) startYouTubeAdSkipper();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'SET_YT_AD_SKIP') {
    message.enabled ? startYouTubeAdSkipper() : stopYouTubeAdSkipper();
  }
});

} // end isYouTube
