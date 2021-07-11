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
app.use((req, res, next) => {
  console.log(process.env.NODE_ENV);
  if (process.env.NODE_ENV === 'production') {
    req.secure ? next() : res.redirect(`https://${req.headers.host}${req.url}`);
  } else {
    next();
  }
});

const server = http.createServer(app);
const listener = server.listen(port);
const io = socketio(listener);

app.get('/', (req, res) => {
  res.sendFile(`${__dirname}/pages/index.html`);
});
app.get('/login', (req, res) => {
  res.sendFile(`${__dirname}/pages/login.html`);
});
app.get('/settings', (req, res) => {
  res.sendFile(`${__dirname}/pages/settings.html`);
});

const socketsList = {};
io.on('connection', (socket) => {
  socket.on('ready', (peer) => {
    socket.emit('socketsList', socketsList);
    socketsList[socket.id] = { id: socket.id, ...peer };
  });
  socket.on('signal', ({ target, data, me }) => {
    io.to(target).emit('signal', { sender: { id: socket.id, ...me }, data });
  });
  socket.on('movementChange', (movement) => {
    if (socketsList[socket.id]) {
      socket.broadcast.emit('movementChange', { id: socket.id, movement });
      socketsList[socket.id].movement = movement;
    }
  });
  socket.on('disconnect', () => {
    socket.broadcast.emit('socketDisconnected', socket.id);
    delete socketsList[socket.id];
  });
});
