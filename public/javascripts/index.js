/* global io:readonly */
const username = localStorage.getItem('username');
const color = localStorage.getItem('color');
if (!username || !color) window.location.replace('/login');

const PERCENT_LENGTH = 5;
const SPEED = 150;
const socket = io();
const peerConnections = {};
const me = {
  username,
  color,
  movement: {
    velocity: { x: 0, y: 0 },
    position: { x: 0, y: 0 },
  },
};
let audioStream;
let framerate = 0;
let adjustedSpeed = SPEED / framerate;
let lastTime = performance.now();
let shouldUpdateCanvas = true;

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
  peerConnections[peer.id] = { RTCConn: newConn, ...peer };
  return newConn;
}

navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
  audioStream = stream;
  socket.emit('ready', me);
  socket.on('movementChange', ({ id, movement }) => {
    if (peerConnections[id]) {
      peerConnections[id].movement = movement;
    }
  });
}).catch((err) => {
  alert('You can not use this page without a microphone');
  console.error(err);
});

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

socket.on('socketsList', (list) => {
  Object.keys(list).forEach(async (peerId) => {
    const newConn = createRTCConn(list[peerId]);
    const desc = await newConn.createOffer({ offerToReceiveAudio: 1 });
    await newConn.setLocalDescription(desc);
    socket.emit('signal', { target: peerId, data: { type: 'offer', offer: desc }, me });
  });
});

socket.on('signal', async ({ sender, data }) => {
  if (!peerConnections[sender.id]) createRTCConn(sender);

  switch (data.type) {
    case 'candidate': {
      await peerConnections[sender.id].RTCConn.addIceCandidate(data.candidate);
      break;
    }
    case 'offer': {
      await peerConnections[sender.id].RTCConn.setRemoteDescription(data.offer);
      const answerDesc = await peerConnections[sender.id].RTCConn.createAnswer({ offerToReceiveAudio: 1 });
      await peerConnections[sender.id].RTCConn.setLocalDescription(answerDesc);
      socket.emit('signal', { target: sender.id, data: { type: 'answer', desc: answerDesc }, me });
      break;
    }
    case 'answer': {
      await peerConnections[sender.id].RTCConn.setRemoteDescription(data.desc);
      break;
    }
    default: {
      console.log('Invalid data type:', data.type);
    }
  }
});

socket.on('socketDisconnected', (socketId) => {
  document.getElementById(socketId).remove();
  peerConnections[socketId].RTCConn.close();
  delete peerConnections[socketId];
  shouldUpdateCanvas = true;
});

const c = document.getElementById('canvas');
const ctx = c.getContext('2d');

function resizeCanvas() {
  shouldUpdateCanvas = true;
  c.width = window.innerWidth;
  c.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// updates the speed of peers according to the framerate, so they always move at the
// same speed, regardless of framerate
function updateFramerate() {
  const deltaTime = performance.now() - lastTime;
  lastTime = performance.now();
  framerate = 1000 / deltaTime;
  adjustedSpeed = SPEED / framerate;
}

function calculatePeerPositions() { // reposition peers based on their velocities
  [me, ...Object.values(peerConnections)].forEach((el) => {
    let {
      position: { x: posX, y: posY },
      velocity: { x: velX, y: velY },
    } = el.movement;
    const [origPosX, origPosY] = [posX, posY];
    posX += velX * adjustedSpeed;
    posY += velY * adjustedSpeed;

    // don't allow peers to exit out of screen
    if (posX > c.width) posX = c.width;
    else if (posX < 0) posX = 0;
    if (posY > c.height) posY = c.height;
    else if (posY < 0) posY = 0;
    if (posX !== origPosX || posY !== origPosY) {
      el.movement.position = { x: posX, y: posY };
      shouldUpdateCanvas = true;
    }
  });
}

function renderCanvas() {
  updateFramerate();
  calculatePeerPositions();
  if (shouldUpdateCanvas) {
    shouldUpdateCanvas = false;
    ctx.clearRect(0, 0, c.width, c.height);
    [...Object.values(peerConnections), me].forEach((el) => {
      const { x, y } = el.movement.position;

      if (el.id !== me.id) {
        // calculate and adjust peer volume
        const peerElement = document.getElementById(el.id);
        const distance = Math.hypot(x - me.movement.position.x, y - me.movement.position.y);
        let percentage = 100 - distance / PERCENT_LENGTH;
        if (percentage <= 0) percentage = 0;
        if (peerElement) peerElement.volume = percentage / 100;
        else {
          console.warn(`Peer ${el.id} is missing!`);
          return;
        }

        // render the line between peers
        ctx.beginPath();
        ctx.moveTo(me.movement.position.x, me.movement.position.y);
        ctx.lineTo(x, y);
        ctx.strokeStyle = `rgba(112, 112, 112, ${percentage / 100})`;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.closePath();
      }

      // render peer
      ctx.beginPath();
      ctx.shadowBlur = 30;
      ctx.shadowColor = el.color;
      ctx.arc(x, y, 20, 0, 2 * Math.PI);
      ctx.fillStyle = el.color;
      ctx.fill();
      ctx.closePath();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'hanging';
      ctx.font = '700 15px Open Sans';
      ctx.fillStyle = 'white';

      // the fix is needed to center text inside circles with canvas
      const fix = ctx.measureText(el.username[0].toUpperCase()).actualBoundingBoxDescent / 2;
      ctx.fillText(el.username[0].toUpperCase(), x, y - fix);
    });

    // render the border of this peer
    ctx.beginPath();
    ctx.arc(me.movement.position.x, me.movement.position.y, 20, 0, 2 * Math.PI);
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.closePath();
  }
  requestAnimationFrame(renderCanvas);
}
renderCanvas();
