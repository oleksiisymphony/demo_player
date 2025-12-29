// iOS WebAudio wiring helper for Wowza WebRTC streams
// Routes audio through WebAudio API using createMediaStreamSource (not createMediaElementSource)
// This is the correct approach for srcObject-based MediaStreams
// 
// IMPORTANT: AudioContext can only be created/resumed after a user gesture on iOS

(function () {
  const container = document.getElementById('wowza-player');
  if (!container) return console.warn('wowza-player container not found');

  // Find the player container wrapper
  const playerContainer = container.closest('.player-container') || container.parentElement;

  // Insert styled controls
  const controls = document.createElement('div');
  controls.className = 'audio-controls';
  controls.innerHTML = `
    <button id="dp-play" class="btn btn-primary btn-play">
      <i class="bi bi-play-fill" id="dp-play-icon"></i>
      <span id="dp-play-text">Play</span>
    </button>
    <div class="volume-wrapper">
      <i class="bi bi-volume-up-fill volume-icon" id="dp-vol-icon"></i>
      <input id="dp-vol" class="volume-slider" type="range" min="0" max="1" step="0.01" value="1">
    </div>
    <span id="dp-status" class="status-badge">Ready</span>
  `;
  playerContainer.appendChild(controls);

  const playBtn = document.getElementById('dp-play');
  const playIcon = document.getElementById('dp-play-icon');
  const playText = document.getElementById('dp-play-text');
  const volInput = document.getElementById('dp-vol');
  const volIcon = document.getElementById('dp-vol-icon');
  const status = document.getElementById('dp-status');

  let ctx = null;
  let gain = null;
  let wired = false;
  let userGestureReceived = false;
  let streamReady = false;
  let currentMediaElement = null;
  let isPlaying = false;

  function setStatus(msg, type = '') {
    console.log('[iOS WebRTC fix] ' + msg);
    if (status) {
      status.textContent = msg;
      status.className = 'status-badge ' + type;
    }
  }

  function updateVolumeIcon(value) {
    if (value === 0) {
      volIcon.className = 'bi bi-volume-mute-fill volume-icon';
    } else if (value < 0.5) {
      volIcon.className = 'bi bi-volume-down-fill volume-icon';
    } else {
      volIcon.className = 'bi bi-volume-up-fill volume-icon';
    }
  }

  function updateVolumeTrack(value) {
    const percent = value * 100;
    volInput.style.setProperty('--volume-percent', percent + '%');
  }

  function updatePlayButton(playing) {
    isPlaying = playing;
    if (playing) {
      playIcon.className = 'bi bi-pause-fill';
      playText.textContent = 'Pause';
    } else {
      playIcon.className = 'bi bi-play-fill';
      playText.textContent = 'Play';
    }
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
          setStatus('Stream ready', 'connected');
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
      setStatus('No media found');
      return false;
    }

    const stream = mediaElement.srcObject;
    if (!stream || !(stream instanceof MediaStream)) {
      setStatus('Waiting for stream...');
      return false;
    }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      setStatus('No audio tracks');
      return false;
    }

    setStatus('Connecting audio...');

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
      console.log('[iOS WebRTC fix] Successfully wired MediaStream to WebAudio');
      return true;
    } catch (err) {
      console.error('[iOS WebRTC fix] WebAudio wiring failed:', err);
      setStatus('Audio error');

      // Fallback: just use native audio (unmute it)
      mediaElement.muted = false;
      mediaElement.volume = Number(volInput.value);
      return false;
    }
  }

  // Volume control with visual feedback
  volInput.addEventListener('input', (e) => {
    const v = Number(e.target.value);
    updateVolumeIcon(v);
    updateVolumeTrack(v);
    
    if (gain) {
      gain.gain.value = v;
    } else if (currentMediaElement) {
      currentMediaElement.volume = v;
    }
  });

  // Initialize volume track
  updateVolumeTrack(1);

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

    const mediaElement = getMediaElement();
    if (!mediaElement) {
      setStatus('No media found');
      return;
    }

    // Toggle play/pause
    if (isPlaying && !mediaElement.paused) {
      mediaElement.pause();
      updatePlayButton(false);
      setStatus('Paused');
      return;
    }

    // Check if stream is available
    if (!mediaElement.srcObject) {
      setStatus('Waiting for stream...');
      // Wait a bit for stream to arrive
      await new Promise(resolve => setTimeout(resolve, 500));
      if (!mediaElement.srcObject) {
        setStatus('No stream yet');
        return;
      }
    }

    // Wire audio through WebAudio (this is safe now - we have user gesture)
    await wireMediaStreamToWebAudio();

    // Start playback
    try {
      await mediaElement.play();
      updatePlayButton(true);
      setStatus('Playing', 'playing');
    } catch (err) {
      console.error('[iOS WebRTC fix] play failed:', err);
      setStatus('Play failed');
      updatePlayButton(false);
    }
  });

  // Listen for external play/pause events
  const mediaElement = getMediaElement();
  if (mediaElement) {
    mediaElement.addEventListener('play', () => updatePlayButton(true));
    mediaElement.addEventListener('pause', () => updatePlayButton(false));
  }

  // Also handle volume slider touch as a user gesture opportunity
  volInput.addEventListener('touchstart', () => {
    userGestureReceived = true;
  }, { once: true });

  // Diagnostic logging for touch/slider events (debug mode)
  if (location.search.includes('debug')) {
    ['input', 'change', 'pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'touchend'].forEach(ev => {
      volInput.addEventListener(ev, (e) => {
        console.log('[iOS WebRTC fix] vol event:', ev, volInput.value);
      });
    });
  }

  setStatus('Ready');
})();
