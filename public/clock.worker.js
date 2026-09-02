let tickTimer = null;
let heartbeatTimer = null;
let heartbeatMs = 60_000;

function postTick() {
  self.postMessage({ type: 'tick', now: Date.now() });
}

async function beat() {
  try {
    const res = await fetch('/api/day/heartbeat', {
      method: 'POST',
      keepalive: true,
      credentials: 'include',
    });
    const data = await res.json().catch(() => ({}));
    self.postMessage({
      type: 'heartbeat',
      ok: res.ok,
      running: data.running !== false,
      reconciled: !!data.reconciled,
    });
  } catch {
    self.postMessage({ type: 'heartbeat', ok: false, running: true });
  }
}

function stopTick() {
  clearInterval(tickTimer);
  tickTimer = null;
}

function stopHeartbeat() {
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

function startTick() {
  stopTick();
  postTick();
  tickTimer = setInterval(postTick, 1000);
}

function startHeartbeat(ms) {
  stopHeartbeat();
  heartbeatMs = ms || heartbeatMs;
  beat();
  heartbeatTimer = setInterval(beat, heartbeatMs);
}

function stopAll() {
  stopTick();
  stopHeartbeat();
}

function configure(data) {
  if (data.tick) startTick();
  else stopTick();
  if (data.heartbeat) startHeartbeat(data.heartbeatMs);
  else stopHeartbeat();
}

self.onmessage = function (event) {
  const data = event.data || {};
  if (data.type === 'stop') {
    stopAll();
    return;
  }
  if (data.type === 'ping-heartbeat') {
    beat();
    return;
  }
  if (data.type === 'configure') {
    configure(data);
  }
};
