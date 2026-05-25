const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

class ChannelManager {
  constructor() {
    /** @type {Map<string, Channel>} */
    this.channels = new Map();
  }

  /**
   * Create a new channel.
   * Returns { channelInfo, ownerToken } — the ownerToken is the client's
   * permanent credential for managing this channel (delete / set password).
   */
  async createChannel({ name, description = '', password = null, creatorSocketId }) {
    const id = uuidv4();
    const ownerToken = uuidv4();
    const hashedPassword = password ? await bcrypt.hash(password, 10) : null;

    /** @type {Channel} */
    const channel = {
      id,
      name,
      description,
      ownerToken,
      hashedPassword,
      hasPassword: !!password,
      createdAt: new Date(),

      // Populated by mediasoupManager after creation
      router: null,

      // socketId → WebRtcTransport
      producerTransports: new Map(),
      // socketId → mediasoup.Producer[]
      producers: new Map(),
      // socketId → WebRtcTransport
      consumerTransports: new Map(),
      // socketId → mediasoup.Consumer[]
      consumers: new Map(),

      viewerCount: 0,
      isLive: false,
    };

    this.channels.set(id, channel);
    return { channelInfo: this._toPublicInfo(channel), ownerToken };
  }

  /** Returns true if password is correct (or channel has no password). */
  async verifyPassword(channelId, password) {
    const ch = this.channels.get(channelId);
    if (!ch) return false;
    if (!ch.hasPassword) return true;
    return bcrypt.compare(password || '', ch.hashedPassword);
  }

  /** Set, change, or remove (password === null) channel password. */
  async setPassword(channelId, ownerToken, newPassword) {
    const ch = this._requireOwner(channelId, ownerToken);
    if (newPassword) {
      ch.hashedPassword = await bcrypt.hash(newPassword, 10);
      ch.hasPassword = true;
    } else {
      ch.hashedPassword = null;
      ch.hasPassword = false;
    }
    return this._toPublicInfo(ch);
  }

  /** Permanently delete a channel. */
  deleteChannel(channelId, ownerToken) {
    this._requireOwner(channelId, ownerToken);
    this.channels.delete(channelId);
  }

  getChannel(channelId) {
    return this.channels.get(channelId) || null;
  }

  getAllChannels() {
    return Array.from(this.channels.values()).map(this._toPublicInfo);
  }

  // ------------------------------------------------------------------

  _requireOwner(channelId, ownerToken) {
    const ch = this.channels.get(channelId);
    if (!ch) throw new Error('Channel not found');
    if (ch.ownerToken !== ownerToken) throw new Error('Not authorized');
    return ch;
  }

  _toPublicInfo(ch) {
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
}

module.exports = new ChannelManager();
