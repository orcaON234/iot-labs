// Electron renderer TCP client.
// Sends one JSON object per line to the Raspberry Pi server.
const net = require('net');

const $ = (id) => document.getElementById(id);
const hostInput = $('host');
const portInput = $('port');
const connectButton = $('connectBtn');
const stateDot = $('stateDot');
const stateText = $('stateText');
const responseText = $('responseText');

let socket = null;
let connected = false;
let receiveBuffer = '';
let statusTimer = null;
let activeCommand = 'stop';
let toastTimer;

const STEERING_LIMIT_DEG = 30;

function setState(state, message) {
  connected = state === 'connected';
  stateDot.className =
    'dot' + (connected ? ' connected' : state === 'error' ? ' error' : '');
  stateText.textContent = message;
  connectButton.textContent = connected ? 'Disconnect' : 'Connect';
  connectButton.classList.toggle('disconnect', connected);

  document.querySelectorAll('[data-command]').forEach((button) => {
    button.disabled = !connected;
  });
}

function showMessage(message, type = '') {
  responseText.textContent = message;
  responseText.className = 'response' + (type ? ` ${type}` : '');
}

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

function send(payload) {
  if (!connected || !socket || socket.destroyed) return;
  socket.write(JSON.stringify(payload) + '\n');
}

function applyStatus(data) {
  const status =
    data.status && typeof data.status === 'object' ? data.status : data;

  if (status.battery !== undefined) {
    const value = Number(status.battery);
    if (Number.isFinite(value)) {
      const pct = Math.max(0, Math.min(100, value));
      $('batteryText').textContent = `${pct}%`;
      $('batteryFill').style.width = `${pct}%`;
      $('batteryFill').style.background =
        pct < 20 ? 'var(--red)' : 'var(--green)';
    }
  }

  if (status.moving !== undefined) {
    $('movingText').textContent = String(status.moving);
  }

  if (status.turning !== undefined) {
    $('turningText').textContent = String(status.turning);
  }

  $('dataTag').textContent = 'LIVE';
  showMessage('Live status received from Raspberry Pi.', 'ok');
}

function receiveLine(line) {
  if (!line.trim()) return;

  try {
    const data = JSON.parse(line);

    if (
      data.type === 'status' ||
      data.status ||
      data.battery !== undefined ||
      data.moving !== undefined
    ) {
      applyStatus(data);
    } else {
      showMessage(data.message || JSON.stringify(data), 'ok');
    }
  } catch {
    showMessage(`Pi replied: ${line.slice(0, 140)}`, 'ok');
  }
}

function connect() {
  const host = hostInput.value.trim();
  const port = Number(portInput.value);

  if (!host) {
    showMessage('Enter the Raspberry Pi IP address first.', 'error');
    hostInput.focus();
    return;
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    showMessage('Enter a valid port from 1 to 65535.', 'error');
    portInput.focus();
    return;
  }

  setState('connecting', 'Connecting…');
  showMessage(`Connecting to ${host}:${port}…`);

  socket = new net.Socket();
  attachSocketEvents(socket);
  socket.connect(port, host);
}

function disconnect() {
  clearInterval(statusTimer);

  if (connected) {
    send({ type: 'command', command: 'stop' });
  }

  const oldSocket = socket;
  socket = null;

  if (oldSocket) {
    oldSocket.destroy();
  }

  setState('disconnected', 'Not connected');
  $('dataTag').textContent = 'WAITING';
  showMessage('Disconnected.');
}

connectButton.addEventListener('click', () => {
  connected ? disconnect() : connect();
});

function attachSocketEvents(activeSocket) {
  receiveBuffer = '';

  activeSocket.on('connect', () => {
    if (socket !== activeSocket) return;

    setState(
      'connected',
      `Connected · ${hostInput.value.trim()}:${Number(portInput.value)}`
    );
    $('dataTag').textContent = 'LIVE';
    showMessage('Connected. Requesting car status…', 'ok');

    send({ type: 'status' });
    statusTimer = setInterval(() => send({ type: 'status' }), 1000);
  });

  activeSocket.on('data', (chunk) => {
    if (socket !== activeSocket) return;

    receiveBuffer += chunk.toString('utf8');
    const lines = receiveBuffer.split('\n');
    receiveBuffer = lines.pop();

    lines.forEach(receiveLine);
  });

  activeSocket.on('error', (err) => {
    if (socket !== activeSocket) return;

    clearInterval(statusTimer);
    setState('error', 'Connection failed');
    showMessage(
      `${err.message} — check the Pi IP, port, server, and Wi-Fi.`,
      'error'
    );
  });

  activeSocket.on('close', () => {
    if (socket !== activeSocket) return;

    clearInterval(statusTimer);
    const wasConnected = connected;
    socket = null;
    setState('disconnected', 'Not connected');

    if (wasConnected) {
      showMessage('Connection closed by the server.');
    }
  });
}

function commandFor(button) {
  const command = button.dataset.command;

  if (!connected) {
    toast('Connect to the Raspberry Pi first.');
    return;
  }

  activeCommand = command;
  button.classList.add('pressed');

  const steeringAngle =
    command === 'left'
      ? -STEERING_LIMIT_DEG
      : command === 'right'
        ? STEERING_LIMIT_DEG
        : 0;

  if (command === 'forward' || command === 'backward') {
    $('movingText').textContent = command;
  }

  if (command === 'left' || command === 'right') {
    $('turningText').textContent = command;
  }

  if (command === 'stop') {
    $('movingText').textContent = 'Stopped';
    $('turningText').textContent = 'No';
  }

  if (
    command === 'forward' ||
    command === 'backward' ||
    command === 'stop'
  ) {
    $('turningText').textContent = 'No';
  }

  send({
    type: 'command',
    command,
    steering_angle: steeringAngle,
    speed: 35
  });
}

function releaseCommand(button) {
  if (!button.classList.contains('pressed')) return;

  button.classList.remove('pressed');

  if (
    button.dataset.command !== 'stop' &&
    activeCommand === button.dataset.command &&
    connected
  ) {
    activeCommand = 'stop';

    send({
      type: 'command',
      command: 'stop',
      steering_angle: 0
    });

    $('movingText').textContent = 'Stopped';
    $('turningText').textContent = 'No';
  }
}

document.querySelectorAll('[data-command]').forEach((button) => {
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    commandFor(button);
  });

  button.addEventListener('pointerup', () => releaseCommand(button));
  button.addEventListener('pointerleave', () => releaseCommand(button));
  button.addEventListener('pointercancel', () => releaseCommand(button));
});

const keys = {
  ArrowUp: 'forward',
  ArrowDown: 'backward',
  ArrowLeft: 'left',
  ArrowRight: 'right'
};

window.addEventListener('keydown', (event) => {
  if (keys[event.key] && !event.repeat) {
    event.preventDefault();

    const button = document.querySelector(
      `[data-command="${keys[event.key]}"]`
    );

    if (button) commandFor(button);
  }

  if (event.code === 'Space') {
    event.preventDefault();
    commandFor(document.querySelector('[data-command="stop"]'));
  }
});

window.addEventListener('keyup', (event) => {
  if (keys[event.key]) {
    const button = document.querySelector(
      `[data-command="${keys[event.key]}"]`
    );

    if (button) releaseCommand(button);
  }
});

window.addEventListener('blur', () => {
  document
    .querySelectorAll('[data-command].pressed')
    .forEach(releaseCommand);
});

// Card cursor glow and subtle tilt.
document.querySelectorAll('.panel').forEach((card) => {
  card.addEventListener('pointermove', (event) => {
    const rect = card.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    card.style.setProperty('--mx', `${x}px`);
    card.style.setProperty('--my', `${y}px`);

    if (window.matchMedia('(pointer:fine)').matches) {
      const rx = (0.5 - y / rect.height) * 1.5;
      const ry = (x / rect.width - 0.5) * 1.5;
      card.style.transform =
        `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg)`;
    }
  });

  card.addEventListener('pointerleave', () => {
    card.style.transform = '';
  });
});

setState('disconnected', 'Not connected');
