const mediasoup = require('mediasoup');
const config = require('./config');

class MediasoupManager {
  constructor() {
    /** @type {import('mediasoup').types.Worker[]} */
    this.workers = [];
    this.nextWorkerIdx = 0;
  }

  async init() {
    const { numWorkers, workerSettings } = config.mediasoup;
    for (let i = 0; i < numWorkers; i++) {
      const worker = await mediasoup.createWorker(workerSettings);
      worker.on('died', (error) => {
        console.error(`mediasoup Worker[${i}] died:`, error);
        // In production: spawn a replacement worker here
      });
      this.workers.push(worker);
    }
    console.log(`[mediasoup] ${numWorkers} worker(s) started`);
  }

  /** Round-robin worker selection for load balancing across channels. */
  _getWorker() {
    const worker = this.workers[this.nextWorkerIdx];
    this.nextWorkerIdx = (this.nextWorkerIdx + 1) % this.workers.length;
    return worker;
  }

  /** Create a new Router (one per channel). */
  async createRouter() {
    const worker = this._getWorker();
    return worker.createRouter(config.mediasoup.routerOptions);
  }

  /**
   * Create a WebRtcTransport on the given router.
   * Returns { transport, params } where params are sent to the client.
   */
  async createWebRtcTransport(router) {
    const { announcedIp } = config.server;
    const transport = await router.createWebRtcTransport({
      ...config.mediasoup.webRtcTransportOptions,
      listenIps: [{ ip: '0.0.0.0', announcedIp }],
    });

    transport.on('dtlsstatechange', (state) => {
      if (state === 'closed') transport.close();
    });

    return {
      transport,
      params: {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      },
    };
  }
}

module.exports = new MediasoupManager();
