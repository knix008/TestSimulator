const channelManager = require('./ChannelManager');
const mediasoupManager = require('./mediasoupManager');

/**
 * All socket events use the acknowledgement pattern:
 *   client emits event with data + callback
 *   server calls callback({ ...result }) or callback({ error: '...' })
 */
module.exports = function setupSignaling(io) {
  io.on('connection', (socket) => {
    console.log(`[+] ${socket.id}`);

    socket.on('disconnect', () => {
      console.log(`[-] ${socket.id}`);
      _cleanup(io, socket, socket.data.channelId);
    });

    // ── Channel management ───────────────────────────────────────────
    socket.on('getChannels', (_data, cb) => {
      cb({ channels: channelManager.getAllChannels() });
    });

    socket.on('createChannel', async (data, cb) => {
      try {
        const { name, description, password } = data;
        if (!name?.trim()) return cb({ error: 'Channel name is required' });

        const { channelInfo, ownerToken } = await channelManager.createChannel({
          name: name.trim(),
          description: description || '',
          password: password || null,
          creatorSocketId: socket.id,
        });

        const channel = channelManager.getChannel(channelInfo.id);
        channel.router = await mediasoupManager.createRouter();

        socket.broadcast.emit('channelCreated', channelInfo);
        cb({ channel: channelInfo, ownerToken });
      } catch (err) {
        cb({ error: err.message });
      }
    });

    socket.on('deleteChannel', async (data, cb) => {
      try {
        const { channelId, ownerToken } = data;
        const channel = channelManager.getChannel(channelId);
        if (!channel) return cb({ error: 'Channel not found' });

        _closeChannelResources(channel);
        channelManager.deleteChannel(channelId, ownerToken);

        io.to(`ch:${channelId}`).emit('channelDeleted', { channelId });
        cb({ success: true });
      } catch (err) {
        cb({ error: err.message });
      }
    });

    socket.on('setChannelPassword', async (data, cb) => {
      try {
        const { channelId, ownerToken, password } = data;
        const updated = await channelManager.setPassword(channelId, ownerToken, password || null);
        io.to(`ch:${channelId}`).emit('channelUpdated', updated);
        cb({ success: true, channel: updated });
      } catch (err) {
        cb({ error: err.message });
      }
    });

    // ── Broadcaster ─────────────────────────────────────────────────
    socket.on('joinAsProducer', async (data, cb) => {
      try {
        const { channelId, password } = data;
        const channel = channelManager.getChannel(channelId);
        if (!channel) return cb({ error: 'Channel not found' });

        const ok = await channelManager.verifyPassword(channelId, password);
        if (!ok) return cb({ error: 'Invalid password' });

        const { transport, params } = await mediasoupManager.createWebRtcTransport(channel.router);
        channel.producerTransports.set(socket.id, transport);

        socket.join(`ch:${channelId}`);
        socket.data.channelId = channelId;
        socket.data.role = 'producer';

        cb({ transportParams: params, rtpCapabilities: channel.router.rtpCapabilities });
      } catch (err) {
        cb({ error: err.message });
      }
    });

    socket.on('connectProducerTransport', async (data, cb) => {
      try {
        const channel = channelManager.getChannel(socket.data.channelId);
        if (!channel) return cb({ error: 'Not in a channel' });

        const transport = channel.producerTransports.get(socket.id);
        if (!transport) return cb({ error: 'Transport not found' });

        await transport.connect({ dtlsParameters: data.dtlsParameters });
        cb({ success: true });
      } catch (err) {
        cb({ error: err.message });
      }
    });

    socket.on('produce', async (data, cb) => {
      try {
        const { kind, rtpParameters } = data;
        const channelId = socket.data.channelId;
        const channel = channelManager.getChannel(channelId);
        if (!channel) return cb({ error: 'Not in a channel' });

        const transport = channel.producerTransports.get(socket.id);
        if (!transport) return cb({ error: 'Transport not found' });

        const producer = await transport.produce({ kind, rtpParameters });

        if (!channel.producers.has(socket.id)) channel.producers.set(socket.id, []);
        channel.producers.get(socket.id).push(producer);

        producer.on('score', (score) => {
          socket.emit('producerScore', { producerId: producer.id, score });
        });

        if (!channel.isLive) {
          channel.isLive = true;
          io.emit('channelUpdated', channelManager.getChannel(channelId)
            ? { ...channelManager._toPublicInfo?.(channel) ?? _publicInfo(channel) }
            : {});
        }

        // Notify viewers already in the room about the new producer
        socket.to(`ch:${channelId}`).emit('newProducer', {
          producerId: producer.id,
          kind,
        });

        cb({ producerId: producer.id });
      } catch (err) {
        cb({ error: err.message });
      }
    });

    // ── Viewer ───────────────────────────────────────────────────────
    socket.on('joinAsConsumer', async (data, cb) => {
      try {
        const { channelId, password, rtpCapabilities } = data;
        const channel = channelManager.getChannel(channelId);
        if (!channel) return cb({ error: 'Channel not found' });

        const ok = await channelManager.verifyPassword(channelId, password);
        if (!ok) return cb({ error: 'Invalid password' });

        const { transport, params } = await mediasoupManager.createWebRtcTransport(channel.router);
        channel.consumerTransports.set(socket.id, transport);

        socket.join(`ch:${channelId}`);
        socket.data.channelId = channelId;
        socket.data.role = 'consumer';
        socket.data.rtpCapabilities = rtpCapabilities;

        channel.viewerCount++;
        _broadcastChannelUpdate(io, channel);

        // Create Consumers for all active Producers in this channel
        const consumerParams = await _consumeAllProducers(channel, socket.id, transport, rtpCapabilities);

        cb({ transportParams: params, consumers: consumerParams });
      } catch (err) {
        cb({ error: err.message });
      }
    });

    socket.on('connectConsumerTransport', async (data, cb) => {
      try {
        const channel = channelManager.getChannel(socket.data.channelId);
        if (!channel) return cb({ error: 'Not in a channel' });

        const transport = channel.consumerTransports.get(socket.id);
        if (!transport) return cb({ error: 'Transport not found' });

        await transport.connect({ dtlsParameters: data.dtlsParameters });
        cb({ success: true });
      } catch (err) {
        cb({ error: err.message });
      }
    });

    // Called by viewers when a newProducer event arrives for them
    socket.on('consumeNewProducer', async (data, cb) => {
      try {
        const { producerId } = data;
        const channelId = socket.data.channelId;
        const channel = channelManager.getChannel(channelId);
        if (!channel) return cb({ error: 'Not in a channel' });

        const transport = channel.consumerTransports.get(socket.id);
        if (!transport) return cb({ error: 'Transport not found' });

        const rtpCapabilities = socket.data.rtpCapabilities;
        if (!channel.router.canConsume({ producerId, rtpCapabilities })) {
          return cb({ error: 'Cannot consume this producer' });
        }

        const consumer = await transport.consume({ producerId, rtpCapabilities, paused: true });
        if (!channel.consumers.has(socket.id)) channel.consumers.set(socket.id, []);
        channel.consumers.get(socket.id).push(consumer);

        cb({
          consumer: {
            id: consumer.id,
            producerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
          },
        });
      } catch (err) {
        cb({ error: err.message });
      }
    });

    socket.on('resumeConsumer', async (data, cb) => {
      try {
        const { consumerId } = data;
        const channel = channelManager.getChannel(socket.data.channelId);
        if (!channel) return cb({ error: 'Not in a channel' });

        const consumers = channel.consumers.get(socket.id) || [];
        const consumer = consumers.find((c) => c.id === consumerId);
        if (!consumer) return cb({ error: 'Consumer not found' });

        await consumer.resume();
        cb({ success: true });
      } catch (err) {
        cb({ error: err.message });
      }
    });

    socket.on('leaveChannel', (_data, cb) => {
      _cleanup(io, socket, socket.data.channelId);
      if (cb) cb({ success: true });
    });
  });
};

// ── Helpers ──────────────────────────────────────────────────────────────────

async function _consumeAllProducers(channel, socketId, transport, rtpCapabilities) {
  const result = [];
  for (const producers of channel.producers.values()) {
    for (const producer of producers) {
      if (!channel.router.canConsume({ producerId: producer.id, rtpCapabilities })) continue;
      const consumer = await transport.consume({ producerId: producer.id, rtpCapabilities, paused: true });
      if (!channel.consumers.has(socketId)) channel.consumers.set(socketId, []);
      channel.consumers.get(socketId).push(consumer);
      result.push({
        id: consumer.id,
        producerId: producer.id,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      });
    }
  }
  return result;
}

function _cleanup(io, socket, channelId) {
  if (!channelId) return;
  const channel = channelManager.getChannel(channelId);
  if (!channel) return;

  // Producer side
  const pt = channel.producerTransports.get(socket.id);
  if (pt) { try { pt.close(); } catch (_) {} channel.producerTransports.delete(socket.id); }

  const prods = channel.producers.get(socket.id);
  if (prods) {
    prods.forEach((p) => { try { p.close(); } catch (_) {} });
    channel.producers.delete(socket.id);
    if (channel.producers.size === 0) {
      channel.isLive = false;
      _broadcastChannelUpdate(io, channel);
    }
  }

  // Consumer side
  const ct = channel.consumerTransports.get(socket.id);
  if (ct) { try { ct.close(); } catch (_) {} channel.consumerTransports.delete(socket.id); }

  const cons = channel.consumers.get(socket.id);
  if (cons) {
    cons.forEach((c) => { try { c.close(); } catch (_) {} });
    channel.consumers.delete(socket.id);
    channel.viewerCount = Math.max(0, channel.viewerCount - 1);
    _broadcastChannelUpdate(io, channel);
  }

  socket.leave(`ch:${channelId}`);
  delete socket.data.channelId;
  delete socket.data.role;
  delete socket.data.rtpCapabilities;
}

function _closeChannelResources(channel) {
  for (const t of channel.producerTransports.values()) { try { t.close(); } catch (_) {} }
  for (const ps of channel.producers.values()) ps.forEach((p) => { try { p.close(); } catch (_) {} });
  for (const t of channel.consumerTransports.values()) { try { t.close(); } catch (_) {} }
  for (const cs of channel.consumers.values()) cs.forEach((c) => { try { c.close(); } catch (_) {} });
  if (channel.router) { try { channel.router.close(); } catch (_) {} }
}

function _broadcastChannelUpdate(io, channel) {
  io.emit('channelUpdated', {
    id: channel.id,
    viewerCount: channel.viewerCount,
    isLive: channel.isLive,
    hasPassword: channel.hasPassword,
  });
}

function _publicInfo(ch) {
  return {
    id: ch.id,
    name: ch.name,
    description: ch.description,
    hasPassword: ch.hasPassword,
    viewerCount: ch.viewerCount,
    isLive: ch.isLive,
    createdAt: ch.createdAt,
  };
}
