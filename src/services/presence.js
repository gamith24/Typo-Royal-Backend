const onlineUsers = new Set();
const connectionCount = new Map();

export function setUserOnline(userId) {
  const key = String(userId);
  const wasOnline = onlineUsers.has(key);
  const nextCount = (connectionCount.get(key) || 0) + 1;
  connectionCount.set(key, nextCount);
  onlineUsers.add(key);
  return !wasOnline;
}

export function setUserOffline(userId) {
  const key = String(userId);
  const current = connectionCount.get(key) || 0;
  const nextCount = Math.max(0, current - 1);
  if (nextCount === 0) {
    connectionCount.delete(key);
    onlineUsers.delete(key);
    return true;
  }
  connectionCount.set(key, nextCount);
  return false;
}

export function isUserOnline(userId) {
  return onlineUsers.has(String(userId));
}

export function listOnlineUserIds() {
  return [...onlineUsers];
}
