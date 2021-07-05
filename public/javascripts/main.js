/* global io */

const socket = io();
socket.on('joined!', () => {
  console.log('connection successfully created');
});
