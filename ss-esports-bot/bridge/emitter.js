'use strict';

/**
 * Socket.IO singleton emitter.
 * Bot handlers call emitter.emit() after every DB write.
 * Safe to call before the bridge server starts — silently no-ops.
 */

let _io = null;

/**
 * Store the Socket.IO server instance (called once by bridge/server.js).
 * @param {import('socket.io').Server} io
 */
function setIo(io) {
  _io = io;
}

/**
 * Emit an event to all connected dashboard clients.
 * No-ops silently if the bridge server hasn't started yet.
 * @param {string} event
 * @param {unknown} data
 */
function emit(event, data) {
  if (_io) {
    _io.emit(event, data);
  }
}

/**
 * Get the current Socket.IO server instance (may be null).
 * @returns {import('socket.io').Server | null}
 */
function getIo() {
  return _io;
}

module.exports = { setIo, emit, getIo };
