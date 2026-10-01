export type Appearance = { theme?: string; language?: "ko" | "en" };

const CHANNEL = "mygit-appearance";

export function publishAppearance(patch: Appearance): void {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage(patch);
  channel.close();
}

export function subscribeAppearance(apply: (patch: Appearance) => void): () => void {
  if (typeof BroadcastChannel === "undefined") return () => undefined;
  const channel = new BroadcastChannel(CHANNEL);
  const onMessage = (event: MessageEvent<Appearance>) => {
    const data = event.data;
    if (!data || typeof data !== "object") return;
    apply(data);
  };
  channel.addEventListener("message", onMessage);
  return () => {
    channel.removeEventListener("message", onMessage);
    channel.close();
  };
}
