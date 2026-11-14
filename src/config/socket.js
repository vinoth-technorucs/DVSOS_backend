const { Server } = require('socket.io');
const env = require('./env');

let io;

const initializeSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    console.info(`Socket connected: ${socket.id}`);

    socket.on('join_user_room', (userId) => {
      if (userId) {
        socket.join(`user:${userId}`);
        console.info(`[Socket] User ${userId} joined room user:${userId} (socket: ${socket.id})`);
      }
    });

    socket.on('join_location_room', (locationId) => {
      if (locationId) {
        socket.join(`location:${locationId}`);
        console.info(`[Socket] Joined room location:${locationId} (socket: ${socket.id})`);
      }
    });

    socket.on('joinRoom', (room) => {
      if (room) {
        socket.join(room);
        if (typeof room === 'string') {
          if (room.startsWith('location_')) {
            const locId = room.replace('location_', '');
            socket.join(`location:${locId}`);
          } else if (room.startsWith('role_')) {
            const role = room.replace('role_', '');
            socket.join(`role:${role}`);
          }
        }
      }
    });

    socket.on('join', (data) => {
      if (!data) return;
      if (typeof data === 'string') {
        socket.join(data);
        return;
      }
      if (data.userId) {
        socket.join(`user:${data.userId}`);
      }
      if (data.locationId) {
        socket.join(`location:${data.locationId}`);
      }
      if (data.role) {
        socket.join(`role:${data.role}`);
      }
    });

    socket.on('join_chat_room', (jobCardId) => {
      if (jobCardId) {
        socket.join(`chat:job_card_${jobCardId}`);
        console.info(`[Socket] Joined chat room chat:job_card_${jobCardId} (socket: ${socket.id})`);
      }
    });

    socket.on('leave_chat_room', (jobCardId) => {
      if (jobCardId) {
        socket.leave(`chat:job_card_${jobCardId}`);
        console.info(`[Socket] Left chat room chat:job_card_${jobCardId} (socket: ${socket.id})`);
      }
    });

    socket.on('disconnect', () => {
      console.info(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
};

const getSocket = () => io;

module.exports = {
  initializeSocket,
  getSocket
};
