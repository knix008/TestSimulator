export function createBrowserBridge() {
  return window.ttsBridge || {
    async getModelCatalog() {
      return [];
    },
    async downloadAndPrepareModel() {
      return null;
    },
    async speak() {
      return { audioBuffer: [], sampleRate: 22050 };
    },
    async selectWavPath() {
      return null;
    },
    async exportWav() {
      return null;
    }
  };
}
