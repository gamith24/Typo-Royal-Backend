let ioRef = null;

export function setRealtimeIO(io) {
  ioRef = io;
}

export function emitToUser(userId, eventName, payload) {
  if (!ioRef) return;
  ioRef.to(`user:${userId}`).emit(eventName, payload);
}

export function emitToRoom(room, eventName, payload) {
  if (!ioRef) return;
  ioRef.to(room).emit(eventName, payload);
}

