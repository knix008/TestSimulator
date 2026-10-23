// Training on the CPU without a GPU: the TensorFlow.js WASM backend (SIMD) runs the forward pass much
// faster than the plain JavaScript CPU backend, but it lacks a few gradient kernels — the filter
// gradient of convolutions (Conv2D, depthwise), the input gradient of depthwise convolutions and
// UnsortedSegmentSum (the gradient of an embedding lookup). They are added here for 'wasm'.
//   • Conv2DBackpropFilter: im2col in JavaScript, then the backend's own BatchMatMul (SIMD) —
//     dW = colsᵀ · dy, the bulk of the work stays in WASM
//   • the depthwise kernels and UnsortedSegmentSum: direct loops (no channel mixing, cheap)
// Layout: channels last (NHWC), as MyTrainer builds its models.

function conv2dBackpropFilter(tf) {
  return ({ inputs, backend, attrs }) => {
    const { x, dy } = inputs;
    const { strides, pad, dataFormat, dimRoundingMode, filterShape } = attrs;
    if (dataFormat && dataFormat !== 'NHWC' && dataFormat !== 'channelsLast') throw new Error('Conv2DBackpropFilter (wasm): only NHWC');
    const conv = tf.backend_util.computeConv2DInfo(x.shape, filterShape, strides, 1, pad, dimRoundingMode, false, 'channelsLast');
    const { batchSize, inHeight, inWidth, inChannels, outHeight, outWidth, outChannels, filterHeight, filterWidth, strideHeight, strideWidth } = conv;
    const top = conv.padInfo.top; const left = conv.padInfo.left;
    const xv = backend.readSync(x.dataId);
    const dyv = backend.readSync(dy.dataId);
    const rows = batchSize * outHeight * outWidth;
    const k = filterHeight * filterWidth * inChannels;
    // im2col: one row per output position, the input patch it saw (zeros outside the picture).
    const cols = new Float32Array(rows * k);
    let row = 0;
    for (let b = 0; b < batchSize; b++) {
      for (let yR = 0; yR < outHeight; yR++) {
        for (let yC = 0; yC < outWidth; yC++, row++) {
          const base = row * k;
          for (let wR = 0; wR < filterHeight; wR++) {
            const xR = yR * strideHeight + wR - top;
            if (xR < 0 || xR >= inHeight) continue;
            for (let wC = 0; wC < filterWidth; wC++) {
              const xC = yC * strideWidth + wC - left;
              if (xC < 0 || xC >= inWidth) continue;
              const from = ((b * inHeight + xR) * inWidth + xC) * inChannels;
              cols.set(xv.subarray(from, from + inChannels), base + (wR * filterWidth + wC) * inChannels);
            }
          }
        }
      }
    }
    const a = backend.makeOutput([1, rows, k], 'float32', undefined, cols);
    const g = backend.makeOutput([1, rows, outChannels], 'float32', undefined, dyv);
    const matMul = tf.getKernel('BatchMatMul', 'wasm').kernelFunc;
    const product = matMul({ inputs: { a, b: g }, backend, attrs: { transposeA: true, transposeB: false } });
    const out = backend.makeOutput(filterShape, 'float32', undefined, backend.readSync(product.dataId));
    for (const info of [a, g, product]) backend.disposeData(info.dataId);
    return out;
  };
}

function depthwiseBackpropFilter(tf) {
  return ({ inputs, backend, attrs }) => {
    const { x, dy } = inputs;
    const { strides, dilations, pad, dimRoundingMode, filterShape } = attrs;
    const conv = tf.backend_util.computeConv2DInfo(x.shape, filterShape, strides, dilations, pad, dimRoundingMode, true);
    const { batchSize, inHeight, inWidth, inChannels, outHeight, outWidth, outChannels, filterHeight, filterWidth, strideHeight, strideWidth } = conv;
    const top = conv.padInfo.top; const left = conv.padInfo.left;
    const mul = outChannels / inChannels;
    const xv = backend.readSync(x.dataId);
    const dyv = backend.readSync(dy.dataId);
    const dw = new Float32Array(tf.util.sizeFromShape(conv.filterShape));
    for (let wR = 0; wR < filterHeight; wR++) {
      const yRMin = Math.max(0, Math.ceil((top - wR) / strideHeight));
      const yRMax = Math.min(outHeight, (inHeight + top - wR) / strideHeight);
      for (let wC = 0; wC < filterWidth; wC++) {
        const yCMin = Math.max(0, Math.ceil((left - wC) / strideWidth));
        const yCMax = Math.min(outWidth, (inWidth + left - wC) / strideWidth);
        for (let b = 0; b < batchSize; b++) {
          for (let yR = yRMin; yR < yRMax; yR++) {
            const xR = wR + yR * strideHeight - top;
            for (let yC = yCMin; yC < yCMax; yC++) {
              const xC = wC + yC * strideWidth - left;
              const xBase = ((b * inHeight + xR) * inWidth + xC) * inChannels;
              const dyBase = ((b * outHeight + yR) * outWidth + yC) * outChannels;
              const wBase = (wR * filterWidth + wC) * inChannels * mul;
              for (let d2 = 0; d2 < outChannels; d2++) dw[wBase + d2] += xv[xBase + Math.trunc(d2 / mul)] * dyv[dyBase + d2];
            }
          }
        }
      }
    }
    return backend.makeOutput(conv.filterShape, 'float32', undefined, dw);
  };
}

function depthwiseBackpropInput(tf) {
  return ({ inputs, backend, attrs }) => {
    const { dy, filter } = inputs;
    const { strides, dilations, pad, dimRoundingMode, inputShape } = attrs;
    const conv = tf.backend_util.computeConv2DInfo(inputShape, filter.shape, strides, dilations, pad, dimRoundingMode, true);
    const { batchSize, inHeight, inWidth, inChannels, outHeight, outWidth, outChannels, filterHeight, filterWidth, strideHeight, strideWidth } = conv;
    const top = filterHeight - 1 - conv.padInfo.top; const left = filterWidth - 1 - conv.padInfo.left;
    const mul = outChannels / inChannels;
    const dyv = backend.readSync(dy.dataId);
    const fv = backend.readSync(filter.dataId);
    const dx = new Float32Array(tf.util.sizeFromShape(conv.inShape));
    for (let b = 0; b < batchSize; b++) {
      for (let xR = 0; xR < inHeight; xR++) {
        const rCorner = xR - top;
        const yRMin = Math.max(0, Math.ceil(rCorner / strideHeight));
        const yRMax = Math.min(outHeight, (filterHeight + rCorner) / strideHeight);
        for (let xC = 0; xC < inWidth; xC++) {
          const cCorner = xC - left;
          const yCMin = Math.max(0, Math.ceil(cCorner / strideWidth));
          const yCMax = Math.min(outWidth, (filterWidth + cCorner) / strideWidth);
          const dxBase = ((b * inHeight + xR) * inWidth + xC) * inChannels;
          for (let yR = yRMin; yR < yRMax; yR++) {
            const wR = yR * strideHeight - rCorner;
            for (let yC = yCMin; yC < yCMax; yC++) {
              const wC = yC * strideWidth - cCorner;
              const dyBase = ((b * outHeight + yR) * outWidth + yC) * outChannels;
              const fBase = ((filterHeight - 1 - wR) * filterWidth + (filterWidth - 1 - wC)) * inChannels * mul;
              for (let d1 = 0; d1 < inChannels; d1++) {
                let sum = 0;
                for (let m = 0; m < mul; m++) sum += dyv[dyBase + d1 * mul + m] * fv[fBase + d1 * mul + m];
                dx[dxBase + d1] += sum;
              }
            }
          }
        }
      }
    }
    return backend.makeOutput(conv.inShape, 'float32', undefined, dx);
  };
}

function unsortedSegmentSum(tf) {
  return ({ inputs, backend, attrs }) => {
    const { x, segmentIds } = inputs;
    const { numSegments } = attrs;
    const rows = tf.util.sizeFromShape(segmentIds.shape);
    const inner = tf.util.sizeFromShape(x.shape) / Math.max(1, rows);
    const xv = backend.readSync(x.dataId);
    const ids = backend.readSync(segmentIds.dataId);
    const out = new Float32Array(numSegments * inner);
    for (let r = 0; r < rows; r++) {
      const s = ids[r];
      if (s < 0 || s >= numSegments) continue;
      const from = r * inner; const to = s * inner;
      for (let i = 0; i < inner; i++) out[to + i] += xv[from + i];
    }
    return backend.makeOutput([numSegments, ...x.shape.slice(segmentIds.shape.length)], x.dtype === 'int32' ? 'int32' : 'float32', undefined, x.dtype === 'int32' ? Int32Array.from(out) : out);
  };
}

/** Registers the missing training kernels for the 'wasm' backend (those it already has are left alone). */
export function registerWasmTrainingKernels(tf) {
  const kernels = {
    Conv2DBackpropFilter: conv2dBackpropFilter(tf),
    DepthwiseConv2dNativeBackpropFilter: depthwiseBackpropFilter(tf),
    DepthwiseConv2dNativeBackpropInput: depthwiseBackpropInput(tf),
    UnsortedSegmentSum: unsortedSegmentSum(tf),
  };
  for (const [kernelName, kernelFunc] of Object.entries(kernels)) {
    if (!tf.getKernel(kernelName, 'wasm')) tf.registerKernel({ kernelName, backendName: 'wasm', kernelFunc });
  }
}
