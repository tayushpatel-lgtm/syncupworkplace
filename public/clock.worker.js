let timezone = 'Asia/Kolkata';
let timer = null;

function stamp() {
  try {
    return new Date().toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: timezone,
    });
  } catch {
    return new Date().toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  }
}

function tick() {
  self.postMessage(stamp());
}

self.onmessage = function (event) {
  const data = event.data || {};
  if (data.type === 'stop') {
    clearInterval(timer);
    timer = null;
    return;
  }
  if (data.timezone) timezone = data.timezone;
  clearInterval(timer);
  tick();
  timer = setInterval(tick, 1000);
};
