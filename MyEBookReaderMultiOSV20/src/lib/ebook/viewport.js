// The page → screen mapping an e-book page hands out from getViewport().
//
// It is pdf.js's PageViewport (which the library does not export), so the
// viewer, the text layer and the link layer treat an e-book page exactly the
// way they treat a PDF page: page space has its origin at the bottom-left and
// y going up, and `transform` turns it into canvas pixels.
export class EbookViewport {
  constructor({ viewBox, scale = 1, rotation = 0, offsetX = 0, offsetY = 0, dontFlip = false }) {
    this.viewBox = viewBox;
    this.userUnit = 1;
    this.scale = scale;
    this.rotation = rotation;
    this.offsetX = offsetX;
    this.offsetY = offsetY;

    const centerX = (viewBox[2] + viewBox[0]) / 2;
    const centerY = (viewBox[3] + viewBox[1]) / 2;
    let rotateA; let rotateB; let rotateC; let rotateD;
    let turn = rotation % 360;
    if (turn < 0) turn += 360;
    switch (turn) {
      case 180: rotateA = -1; rotateB = 0; rotateC = 0; rotateD = 1; break;
      case 90: rotateA = 0; rotateB = 1; rotateC = 1; rotateD = 0; break;
      case 270: rotateA = 0; rotateB = -1; rotateC = -1; rotateD = 0; break;
      case 0: rotateA = 1; rotateB = 0; rotateC = 0; rotateD = -1; break;
      default: throw new Error('The page can only be turned in steps of 90 degrees.');
    }
    if (dontFlip) { rotateC = -rotateC; rotateD = -rotateD; }

    let offsetCanvasX; let offsetCanvasY; let width; let height;
    if (rotateA === 0) {
      offsetCanvasX = Math.abs(centerY - viewBox[1]) * scale + offsetX;
      offsetCanvasY = Math.abs(centerX - viewBox[0]) * scale + offsetY;
      width = (viewBox[3] - viewBox[1]) * scale;
      height = (viewBox[2] - viewBox[0]) * scale;
    } else {
      offsetCanvasX = Math.abs(centerX - viewBox[0]) * scale + offsetX;
      offsetCanvasY = Math.abs(centerY - viewBox[1]) * scale + offsetY;
      width = (viewBox[2] - viewBox[0]) * scale;
      height = (viewBox[3] - viewBox[1]) * scale;
    }
    this.transform = [
      rotateA * scale, rotateB * scale, rotateC * scale, rotateD * scale,
      offsetCanvasX - rotateA * scale * centerX - rotateC * scale * centerY,
      offsetCanvasY - rotateB * scale * centerX - rotateD * scale * centerY,
    ];
    this.width = width;
    this.height = height;
  }

  get rawDims() {
    const [x0, y0, x1, y1] = this.viewBox;
    return { pageWidth: x1 - x0, pageHeight: y1 - y0, pageX: x0, pageY: y0 };
  }

  clone({ scale = this.scale, rotation = this.rotation, offsetX = this.offsetX, offsetY = this.offsetY, dontFlip = false } = {}) {
    return new EbookViewport({ viewBox: this.viewBox.slice(), scale, rotation, offsetX, offsetY, dontFlip });
  }

  convertToViewportPoint(x, y) {
    const m = this.transform;
    return [x * m[0] + y * m[2] + m[4], x * m[1] + y * m[3] + m[5]];
  }

  convertToViewportRectangle(rect) {
    const a = this.convertToViewportPoint(rect[0], rect[1]);
    const b = this.convertToViewportPoint(rect[2], rect[3]);
    return [a[0], a[1], b[0], b[1]];
  }

  convertToPdfPoint(x, y) {
    const m = this.transform;
    const d = m[0] * m[3] - m[1] * m[2];
    return [
      (x * m[3] - y * m[2] + m[2] * m[5] - m[4] * m[3]) / d,
      (-x * m[1] + y * m[0] + m[4] * m[1] - m[5] * m[0]) / d,
    ];
  }
}
