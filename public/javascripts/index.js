/* global io:readonly */
const username = localStorage.getItem('username');
const color = localStorage.getItem('color');
if (!username || !color) window.location.replace('/login');
document.getElementById('peer-username').innerText = username[0].toUpperCase();

const PERCENT_LENGTH = 5;
const SPEED = 150;
const BACKGROUND_SPACING = 35;
const BACKGROUND_DOT_SIZE = 5;

const socket = io();
const peers = {};
const me = {
  username,
  color,
  movement: {
    velocity: { x: 0, y: 0 },
    position: { x: 0, y: 0 },
  },
};
const screenPos = { x: 0, y: 0 };
const statusText = document.getElementById('status');

let audioStream;
let framerate = 0;
let adjustedSpeed = SPEED / framerate;
let lastTime = performance.now();
let shouldUpdateCanvas = true;

/* WEBRTC CONNECTION */

function handleStream(RTCStream, socketId) {
  const stream = RTCStream.streams[0];
  const newAudioElement = document.createElement('audio');
  newAudioElement.id = socketId;
  newAudioElement.autoplay = true;
  newAudioElement.controls = true;
  newAudioElement.srcObject = stream;
  document.getElementById('connections').appendChild(newAudioElement);
  shouldUpdateCanvas = true;
}

function createRTCConn(peer) {
  console.log(peer);
  const newConn = new RTCPeerConnection(null);
  audioStream.getTracks().forEach((track) => newConn.addTrack(track, audioStream));
  newConn.onicecandidate = (event) => {
    socket.emit('signal', { target: peer.id, data: { type: 'candidate', candidate: event.candidate }, me });
  };
  newConn.ontrack = (e) => handleStream(e, peer.id);
  peers[peer.id] = { RTCConn: newConn, ...peer };
  statusText.innerHTML = `<span class="num-connected">${Object.keys(peers).length}</span> Connected`;
  return newConn;
}

navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
  statusText.innerHTML = 'Waiting for a connection.';
  audioStream = stream;
  socket.emit('ready', me);
  socket.on('movementChange', ({ id, movement }) => {
    if (peers[id]) {
      peers[id].movement = movement;
    }
  });
}).catch((err) => {
  alert('You can not use this page without a microphone');
  console.error(err);
});

/* MOVEMENT */

// add velocity in direction of keypress
window.addEventListener('keydown', (e) => {
  if (!e.repeat) {
    switch (e.code) {
      case 'ArrowLeft':
        me.movement.velocity.x = -1;
        break;
      case 'ArrowUp':
        me.movement.velocity.y = -1;
        break;
      case 'ArrowRight':
        me.movement.velocity.x = 1;
        break;
      case 'ArrowDown':
        me.movement.velocity.y = 1;
        break;
      default:
        return;
    }
  }
  socket.emit('movementChange', me.movement);
});

// remove velocity on keyup
window.addEventListener('keyup', (e) => {
  switch (e.code) {
    case 'ArrowLeft':
    case 'ArrowRight':
      me.movement.velocity.x = 0;
      break;
    case 'ArrowUp':
    case 'ArrowDown':
      me.movement.velocity.y = 0;
      break;
    default:
      return;
  }
  socket.emit('movementChange', me.movement);
});

/* SOCKET COMMUNICATION */

socket.on('socketsList', (list) => {
  Object.keys(list).forEach(async (peerId) => {
    const newConn = createRTCConn(list[peerId]);
    const desc = await newConn.createOffer({ offerToReceiveAudio: 1 });
    await newConn.setLocalDescription(desc);
    socket.emit('signal', { target: peerId, data: { type: 'offer', offer: desc }, me });
  });
});

socket.on('signal', async ({ sender, data }) => {
  const peer = peers[sender.id];
  if (!peer) createRTCConn(sender);

  switch (data.type) {
    case 'candidate': {
      await peer.RTCConn.addIceCandidate(data.candidate);
      break;
    }
    case 'offer': {
      await peer.RTCConn.setRemoteDescription(data.offer);
      const answerDesc = await peer.RTCConn.createAnswer({ offerToReceiveAudio: 1 });
      await peer.RTCConn.setLocalDescription(answerDesc);
      socket.emit('signal', { target: sender.id, data: { type: 'answer', desc: answerDesc }, me });
      break;
    }
    case 'answer': {
      await peer.RTCConn.setRemoteDescription(data.desc);
      break;
    }
    default: {
      console.log('Invalid data type:', data.type);
    }
  }
});

socket.on('socketDisconnected', (socketId) => {
  document.getElementById(socketId).remove();
  peers[socketId].RTCConn.close();
  delete peers[socketId];
  const peerConnNum = Object.keys(peers).length;
  statusText.innerHTML = peerConnNum > 0 ? `<span class="num-connected">${peerConnNum}</span> Connected` : 'Waiting for a connection';
  shouldUpdateCanvas = true;
});

/* CANVAS RENDERING */

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  shouldUpdateCanvas = true;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function updateFramerate() {
  const deltaTime = performance.now() - lastTime;
  lastTime = performance.now();
  framerate = 1000 / deltaTime;
  adjustedSpeed = SPEED / framerate;
}

// reposition peers based on their velocities
function calculatePeerPositions() {
  [me, ...Object.values(peers)].forEach((el) => {
    const { x: velX, y: velY } = el.movement.velocity;
    let { x: posX, y: posY } = el.movement.position;
    posX += velX * adjustedSpeed;
    posY += velY * adjustedSpeed;

    if (velX !== 0 || velY !== 0) {
      el.movement.position = { x: posX, y: posY };
      shouldUpdateCanvas = true;
    }
  });
}

// move the screen so that the controlled peer is in the center
function changeScreenPosition() {
  const lerp = (x, y, a) => x * (1 - a) + y * a;
  const wantedScreenX = me.movement.position.x - window.innerWidth / 2;
  const wantedScreenY = me.movement.position.y - window.innerHeight / 2;
  screenPos.x = lerp(screenPos.x, wantedScreenX, 0.02);
  screenPos.y = lerp(screenPos.y, wantedScreenY, 0.02);
  if (Math.abs(wantedScreenX - screenPos.x) > 5 || Math.abs(wantedScreenY - screenPos.y) > 5) {
    shouldUpdateCanvas = true;
  }
}

// create the repeating background pattern
const patternCanvas = document.createElement('canvas');
patternCanvas.width = BACKGROUND_SPACING;
patternCanvas.height = BACKGROUND_SPACING;
const patternCtx = patternCanvas.getContext('2d');
patternCtx.fillStyle = '#F2F3F6';
patternCtx.fillRect(0, 0, patternCanvas.width, patternCanvas.height);
patternCtx.beginPath();
patternCtx.arc(BACKGROUND_DOT_SIZE, BACKGROUND_DOT_SIZE, BACKGROUND_DOT_SIZE, 0, 2 * Math.PI);
patternCtx.fillStyle = '#EDEFF2';
patternCtx.fill();
patternCtx.closePath();
document.body.appendChild(patternCanvas);
const pattern = ctx.createPattern(patternCanvas, 'repeat');

window.addEventListener('resize', resizeCanvas);
changeScreenPosition();
resizeCanvas();
function renderCanvas() {
  updateFramerate();
  calculatePeerPositions();
  if (shouldUpdateCanvas) {
    shouldUpdateCanvas = false;
    changeScreenPosition();

    // render background
    ctx.save();
    ctx.fillStyle = pattern;
    ctx.translate((screenPos.x % BACKGROUND_SPACING) * -1, (screenPos.y % BACKGROUND_SPACING) * -1);
    ctx.fillRect(BACKGROUND_SPACING * -1, BACKGROUND_SPACING * -1, canvas.width + BACKGROUND_SPACING * 2, canvas.height + BACKGROUND_SPACING * 2);
    ctx.restore();

    const meX = me.movement.position.x - screenPos.x;
    const meY = me.movement.position.y - screenPos.y;

    // render all of the peers
    [...Object.values(peers), me].forEach((el) => {
      console.log(el.movement.position);
      const { x, y } = el.movement.position;
      const adjustedX = x - screenPos.x;
      const adjustedY = y - screenPos.y;
      if (el.id !== me.id) {
        // calculate and adjust peer volume
        const peerElement = document.getElementById(el.id);
        const distance = Math.hypot(adjustedX - meX, adjustedY - meY);
        let percentage = 100 - distance / PERCENT_LENGTH;
        if (percentage <= 0) percentage = 0;
        if (peerElement) peerElement.volume = percentage / 100;
        else {
          // console.warn(`Peer ${el.id} is missing!`);
          return;
        }

        // render the line between peers
        ctx.beginPath();
        ctx.moveTo(meX, meY);
        ctx.lineTo(adjustedX, adjustedY);
        ctx.strokeStyle = `rgba(112, 112, 112, ${percentage / 100})`;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.closePath();
      }

      // render peer
      ctx.beginPath();
      ctx.shadowBlur = 30;
      ctx.shadowColor = el.color;
      ctx.arc(adjustedX, adjustedY, 20, 0, 2 * Math.PI);
      ctx.fillStyle = el.color;
      ctx.fill();
      ctx.closePath();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'hanging';
      ctx.font = '700 15px Open Sans';
      ctx.fillStyle = 'white';

      // the fix is needed to center text inside circles with canvas
      const fix = ctx.measureText(el.username[0].toUpperCase()).actualBoundingBoxDescent / 2;
      ctx.fillText(el.username[0].toUpperCase(), adjustedX, adjustedY - fix);
    });

    // render the border of this peer
    ctx.beginPath();
    ctx.arc(meX, meY, 20, 0, 2 * Math.PI);
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.closePath();
  }
  requestAnimationFrame(renderCanvas);
}
renderCanvas();

// make the logout button functional
const logoutButton = document.getElementById('logout-button');
logoutButton.onclick = () => {
  delete localStorage.username;
  delete localStorage.color;
  window.location.reload();
};
