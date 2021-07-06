/* global io:readonly */

const socket = io();

function handleStream(RTCStream, socketId) {
  const stream = RTCStream.streams[0];
  console.log('got a stream!!!');
  const div = document.createElement('div');
  div.id = socketId;
  const newAudioElement = document.createElement('audio');
  newAudioElement.autoplay = true;
  newAudioElement.controls = true;
  newAudioElement.srcObject = stream;
  // document.getElementById('connections').appendChild(newAudioElement);
  div.appendChild(newAudioElement);
  document.getElementById('connections').appendChild(div);
  const canvas = document.createElement('canvas');
  const context = new AudioContext();
  const src = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  canvas.width = 150;
  canvas.height = 150;
  const ctx = canvas.getContext('2d');

  src.connect(analyser);
  analyser.connect(context.destination);

  analyser.fftSize = 256;

  const bufferLength = analyser.frequencyBinCount;
  console.log(bufferLength);

  const dataArray = new Uint8Array(bufferLength);

  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;

  const barWidth = (WIDTH / bufferLength) * 2.5;
  let barHeight;
  let x = 0;

  function renderFrame() {
    requestAnimationFrame(renderFrame);

    x = 0;

    analyser.getByteFrequencyData(dataArray);

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    for (let i = 0; i < bufferLength; i++) {
      barHeight = dataArray[i];

      const r = barHeight + (50 * (i / bufferLength));
      const g = 250 * (i / bufferLength);
      const b = 50;

      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, HEIGHT - barHeight, barWidth, barHeight);

      x += barWidth + 1;
    }
  }

  renderFrame();
  div.appendChild(canvas);
}

const RTCConns = {};
let audioStream;
navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
  audioStream = stream;
  socket.emit('ready');
}).catch((err) => {
  alert('You can not use this page without a microphone');
  console.error(err);
});

function createRTCConn(socketId) {
  const newConn = new RTCPeerConnection(null);
  audioStream.getTracks().forEach((track) => newConn.addTrack(track, audioStream));
  newConn.onicecandidate = (event) => {
    socket.emit('signal', { target: socketId, data: { type: 'candidate', candidate: event.candidate } });
  };
  newConn.ontrack = (e) => handleStream(e, socketId);
  RTCConns[socketId] = newConn;
  return newConn;
}

socket.on('socketsList', (list) => {
  console.log(list);
  list.forEach(async (socketId) => {
    const newConn = createRTCConn(socketId);
    const desc = await newConn.createOffer({ offerToReceiveAudio: 1 });
    await newConn.setLocalDescription(desc);
    socket.emit('signal', { target: socketId, data: { type: 'offer', offer: desc } });
  });
});

socket.on('signal', async ({ senderId, data }) => {
  console.log(data);
  if (!RTCConns[senderId]) createRTCConn(senderId);

  switch (data.type) {
    case 'candidate': {
      await RTCConns[senderId].addIceCandidate(data.candidate);
      break;
    }
    case 'offer': {
      await RTCConns[senderId].setRemoteDescription(data.offer);
      const answerDesc = await RTCConns[senderId].createAnswer({ offerToReceiveAudio: 1 });
      await RTCConns[senderId].setLocalDescription(answerDesc);
      socket.emit('signal', { target: senderId, data: { type: 'answer', desc: answerDesc } });
      break;
    }
    case 'answer': {
      await RTCConns[senderId].setRemoteDescription(data.desc);
      break;
    }
    default: {
      console.log('Invalid data type:', data.type);
    }
  }
});

socket.on('socketDisconnected', (socketId) => {
  document.getElementById(socketId).remove();
  RTCConns[socketId].close();
  delete RTCConns[socketId];
});
