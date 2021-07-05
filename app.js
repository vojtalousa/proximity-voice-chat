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

io.on('connection', (socket) => {
  console.log(socket.id, 'connected!');
  socket.emit('joined!');
});
