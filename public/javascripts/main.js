/* global io:readonly Peer:readonly */

const socket = io();
const peer = new Peer({ debug: 2 });

let audioStream;
const peers = {};

peer.on('open', async (id) => {
  try {
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    socket.emit('peerReady', id);
  } catch (e) {
    alert('You can not use this page without a microphone');
  }
});

function handleCall(call) {
  peers[call.peer] = call;
  const newAudioElement = document.createElement('audio');
  newAudioElement.autoplay = true;
  newAudioElement.controls = true;
  newAudioElement.id = call.peer;
  call.on('stream', (stream) => {
    newAudioElement.srcObject = stream;
    document.getElementById('connections').appendChild(newAudioElement);
  });
}

peer.on('call', (call) => {
  call.answer(audioStream);
  handleCall(call);
});

socket.on('peerIsReady', (peerId) => {
  const call = peer.call(peerId, audioStream);
  handleCall(call);
});

socket.on('peerLeft', (peerId) => {
  peers[peerId].close();
  document.getElementById(peerId).remove();
});
