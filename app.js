const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const sassMiddleware = require('node-sass-middleware');
const socketio = require('socket.io');
const http = require('http');

const app = express();
const port = process.env.PORT || '3000';
app.set('port', port);
app.set('views', './public/pages');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(sassMiddleware({
  src: path.join(__dirname, 'public'),
  dest: path.join(__dirname, 'public'),
  indentedSyntax: false,
  sourceMap: true,
}));
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const listener = server.listen(port);
const io = socketio(listener);

let socketsList = [];
io.on('connection', (socket) => {
  socket.on('ready', () => {
    socket.emit('socketsList', socketsList);
    socketsList.push(socket.id);
  });
  socket.on('signal', ({ target, data }) => {
    io.to(target).emit('signal', { senderId: socket.id, data });
  });
  socket.on('disconnect', () => {
    socket.broadcast.emit('socketDisconnected', socket.id);
    socketsList = socketsList.filter((socketId) => socketId !== socket.id);
  });
  // socket.on('gotMicAccess', () => {
  //   socket.broadcast.emit('someonejoined', { socketid: socket.id });
  // });
  // socket.on('signal', ({ me, target, data }) => {
  //   console.log(me, target);
  //   socket.broadcast.emit('signal', { targetguid: target.guid, sender: me, data });
  // });
});
