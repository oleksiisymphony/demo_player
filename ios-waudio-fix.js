// iOS WebAudio wiring helper for Wowza WebRTC streams
// Routes audio through WebAudio API using createMediaStreamSource (not createMediaElementSource)
// This is the correct approach for srcObject-based MediaStreams

(function () {
  const container = document.getElementById('wowza-player');
  if (!container) return console.warn('wowza-player container not found');

  // Insert simple controls
  const controls = document.createElement('div');
  controls.style.marginTop = '8px';
  controls.innerHTML = `
    <button id="dp-play">Play</button>
    <input id="dp-vol" type="range" min="0" max="1" step="0.01" value="1">
    <span id="dp-status">idle</span>
  `;
  container.appendChild(controls);

  const playBtn = document.getElementById('dp-play');
  const volInput = document.getElementById('dp-vol');
  const status = document.getElementById('dp-status');

  let ctx = null;
  let gain = null;
  let wired = false;
  let currentMediaElement = null;

  function setStatus(msg) {
    console.log('[iOS WebRTC fix] ' + msg);
    if (status) status.textContent = msg;
  }

  async function wireMediaStreamToWebAudio(mediaElement) {
    if (wired && currentMediaElement === mediaElement) return;
    
    const stream = mediaElement.srcObject;
    if (!stream || !(stream instanceof MediaStream)) {
      setStatus('no MediaStream on element yet');
      return false;
    }

    // Check if stream has audio tracks
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      setStatus('stream has no audio tracks');
      return false;
    }

    setStatus('wiring WebRTC stream to WebAudio');
    
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      await ctx.resume();

      // Use createMediaStreamSource for srcObject MediaStreams (WebRTC)
      const source = ctx.createMediaStreamSource(stream);
      gain = ctx.createGain();
      gain.gain.value = Number(volInput.value);
      source.connect(gain).connect(ctx.destination);

      // Mute the native element so audio only comes from WebAudio
      mediaElement.muted = true;

      wired = true;
      currentMediaElement = mediaElement;
      setStatus('wired to WebAudio (native muted)');
      console.log('[iOS WebRTC fix] Successfully wired MediaStream to WebAudio');
      return true;
    } catch (err) {
      console.error('[iOS WebRTC fix] WebAudio wiring failed:', err);
      setStatus('wiring failed: ' + err.message);
      
      // Fallback: just use native audio
      mediaElement.muted = false;
      mediaElement.volume = Number(volInput.value);
      setStatus('fallback: using native audio');
      return false;
    }
  }

  // Volume control
  volInput.addEventListener('input', (e) => {
    const v = Number(e.target.value);
    if (gain) {
      gain.gain.value = v;
      setStatus('WebAudio gain: ' + v.toFixed(2));
    } else if (currentMediaElement) {
      currentMediaElement.volume = v;
      setStatus('native volume: ' + v.toFixed(2));
    }
  });

  // Watch for video/audio elements getting srcObject assigned
  function findAndWireMediaElement() {
    const video = container.querySelector('video');
    const audio = container.querySelector('audio');
    const mediaElement = video || audio;
    
    if (mediaElement && mediaElement.srcObject) {
      wireMediaStreamToWebAudio(mediaElement);
    }
  }

  // Use MutationObserver to detect when srcObject is assigned or elements are added
  const observer = new MutationObserver((mutations) => {
    findAndWireMediaElement();
  });
  
  observer.observe(container, { 
    childList: true, 
    subtree: true, 
    attributes: true,
    attributeFilter: ['srcObject', 'src']
  });

  // Also poll periodically as srcObject changes don't trigger mutation events
  const pollInterval = setInterval(() => {
    if (!wired) {
      findAndWireMediaElement();
    } else {
      clearInterval(pollInterval);
    }
  }, 500);

  // Stop polling after 30 seconds
  setTimeout(() => clearInterval(pollInterval), 30000);

  // Listen for loadedmetadata which fires when stream is ready
  container.addEventListener('loadedmetadata', (e) => {
    if (e.target.srcObject) {
      wireMediaStreamToWebAudio(e.target);
    }
  }, true);

  // Play button handler
  playBtn.addEventListener('click', async () => {
    setStatus('play pressed');
    
    // Initialize AudioContext on user gesture (required for iOS)
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    await ctx.resume();
    
    const video = container.querySelector('video');
    const audio = container.querySelector('audio');
    const mediaElement = video || audio;
    
    if (!mediaElement) {
      setStatus('no media element found');
      return;
    }

    // Try to wire before playing
    if (mediaElement.srcObject) {
      await wireMediaStreamToWebAudio(mediaElement);
    }

    try {
      await mediaElement.play();
      setStatus('playing');
    } catch (err) {
      console.error('[iOS WebRTC fix] play failed:', err);
      setStatus('play failed: ' + err.message);
    }
  });

  // Diagnostic logging for touch/slider events
  ['input', 'change', 'pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'touchend'].forEach(ev => {
    volInput.addEventListener(ev, (e) => {
      console.log('[iOS WebRTC fix] vol event:', ev, volInput.value);
    });
  });

  setStatus('ready - waiting for stream');
})();
