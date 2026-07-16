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
    async selectAudioPath() {
      return null;
    },
    async selectWavPath() {
      return null;
    },
    async selectMp3Path() {
      return null;
    },
    async exportWav() {
      return null;
    },
    async exportMp3() {
      return null;
    }
  };
}
