/**
 * The picture comparison off the page's thread.
 *
 * It is given the two pictures' addresses, fetches and decodes them itself, reads
 * their pixels on an OffscreenCanvas and answers with the difference, whose pixel
 * buffer is handed back rather than copied. Decoding a picture the page already
 * shows costs the page nothing this way; making an ImageBitmap of the page's own
 * <img> cost it 160 ms on a 12-megapixel pair.
 */
import { diffPixels, pixelsOf } from "./imageDiff.js";

type Request = { id: number; left: string; right: string };

async function bitmap(url: string): Promise<ImageBitmap> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return createImageBitmap(await response.blob());
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const { id } = event.data;
  try {
    const [left, right] = await Promise.all([bitmap(event.data.left), bitmap(event.data.right)]);
    const width = Math.max(left.width, right.width);
    const height = Math.max(left.height, right.height);
    const canvas = new OffscreenCanvas(width, height);
    const a = pixelsOf(left, width, height, canvas);
    const b = pixelsOf(right, width, height, canvas);
    left.close();
    right.close();
    const diff = diffPixels(a, b, width, height);
    (self as unknown as Worker).postMessage({ id, diff }, [diff.map.buffer]);
  } catch (error) {
    (self as unknown as Worker).postMessage({ id, error: String(error) });
  }
};
