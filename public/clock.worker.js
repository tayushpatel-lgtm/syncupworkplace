let timer = null;

function tick() {
  self.postMessage(Date.now());
}

self.onmessage = function (event) {
  const data = event.data || {};
  if (data.type === 'stop') {
    clearInterval(timer);
    timer = null;
    return;
  }
  clearInterval(timer);
  tick();
  timer = setInterval(tick, 1000);
};
