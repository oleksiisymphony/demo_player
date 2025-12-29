// iOS WebAudio wiring helper for Wowza WebRTC streams
// Routes audio through WebAudio API using createMediaStreamSource (not createMediaElementSource)
// This is the correct approach for srcObject-based MediaStreams
// 
// IMPORTANT: AudioContext can only be created/resumed after a user gesture on iOS

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
  let userGestureReceived = false;
  let streamReady = false;
  let currentMediaElement = null;

  function setStatus(msg) {
    console.log('[iOS WebRTC fix] ' + msg);
    if (status) status.textContent = msg;
  }

  // Find the current media element
  function getMediaElement() {
    const video = container.querySelector('video');
    const audio = container.querySelector('audio');
    return video || audio;
  }

  // Check if stream is available (but don't wire yet - need user gesture)
  function checkStreamReady() {
    const mediaElement = getMediaElement();
    if (mediaElement && mediaElement.srcObject instanceof MediaStream) {
      const audioTracks = mediaElement.srcObject.getAudioTracks();
      if (audioTracks.length > 0) {
        if (!streamReady) {
          streamReady = true;
          setStatus('stream ready - tap Play for audio');
          console.log('[iOS WebRTC fix] Stream detected with', audioTracks.length, 'audio track(s)');
        }
        return true;
      }
    }
    return false;
  }

  // Wire the MediaStream to WebAudio - ONLY call after user gesture
  async function wireMediaStreamToWebAudio() {
    if (wired) return true;
    if (!userGestureReceived) {
      console.warn('[iOS WebRTC fix] Cannot wire - no user gesture yet');
      return false;
    }

    const mediaElement = getMediaElement();
    if (!mediaElement) {
      setStatus('no media element found');
      return false;
    }

    const stream = mediaElement.srcObject;
    if (!stream || !(stream instanceof MediaStream)) {
      setStatus('no MediaStream on element yet');
      return false;
    }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      setStatus('stream has no audio tracks');
      return false;
    }

    setStatus('wiring WebRTC stream to WebAudio...');

    try {
      // Create AudioContext only on user gesture
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      // Resume must happen in user gesture context
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      // Use createMediaStreamSource for srcObject MediaStreams (WebRTC)
      const source = ctx.createMediaStreamSource(stream);
      gain = ctx.createGain();
      gain.gain.value = Number(volInput.value);
      source.connect(gain).connect(ctx.destination);

      // Mute the native element so audio only comes from WebAudio
      mediaElement.muted = true;

      wired = true;
      currentMediaElement = mediaElement;
      setStatus('wired to WebAudio ✓');
      console.log('[iOS WebRTC fix] Successfully wired MediaStream to WebAudio');
      return true;
    } catch (err) {
      console.error('[iOS WebRTC fix] WebAudio wiring failed:', err);
      setStatus('wiring failed: ' + err.message);

      // Fallback: just use native audio (unmute it)
      mediaElement.muted = false;
      mediaElement.volume = Number(volInput.value);
      setStatus('fallback: native audio');
      return false;
    }
  }

  // Volume control
  volInput.addEventListener('input', (e) => {
    const v = Number(e.target.value);
    if (gain) {
      gain.gain.value = v;
      setStatus('gain: ' + v.toFixed(2));
    } else if (currentMediaElement) {
      currentMediaElement.volume = v;
      setStatus('volume: ' + v.toFixed(2));
    }
  });

  // Poll for stream availability (but don't wire until user gesture)
  const pollInterval = setInterval(() => {
    if (checkStreamReady()) {
      clearInterval(pollInterval);
    }
  }, 500);

  // Stop polling after 30 seconds
  setTimeout(() => clearInterval(pollInterval), 30000);

  // Play button handler - this is where we get the user gesture
  playBtn.addEventListener('click', async () => {
    userGestureReceived = true;
    setStatus('play pressed');

    const mediaElement = getMediaElement();
    if (!mediaElement) {
      setStatus('no media element found');
      return;
    }

    // Check if stream is available
    if (!mediaElement.srcObject) {
      setStatus('waiting for stream...');
      // Wait a bit for stream to arrive
      await new Promise(resolve => setTimeout(resolve, 500));
      if (!mediaElement.srcObject) {
        setStatus('no stream available yet');
        return;
      }
    }

    // Wire audio through WebAudio (this is safe now - we have user gesture)
    await wireMediaStreamToWebAudio();

    // Start playback
    try {
      await mediaElement.play();
      setStatus(wired ? 'playing (WebAudio)' : 'playing');
    } catch (err) {
      console.error('[iOS WebRTC fix] play failed:', err);
      setStatus('play failed: ' + err.message);
    }
  });

  // Also handle volume slider touch as a user gesture opportunity
  volInput.addEventListener('touchstart', () => {
    userGestureReceived = true;
  }, { once: true });

  // Diagnostic logging for touch/slider events
  if (location.search.includes('debug')) {
    ['input', 'change', 'pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'touchend'].forEach(ev => {
      volInput.addEventListener(ev, (e) => {
        console.log('[iOS WebRTC fix] vol event:', ev, volInput.value);
      });
    });
  }

  setStatus('ready - tap Play');
})();
