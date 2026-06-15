const BLOCK_SIZE = 4;
const BLOCK_AREA = 16;
const D1_BASE = 36;
const D2_BASE = 20;
const SQRT1_4 = 0.5;
const SQRT2_4 = Math.SQRT1_2;

const JPEG_MASK = new Float64Array(BLOCK_AREA);
{
  const threshold = 3;
  for (let u = 0; u < BLOCK_SIZE; u += 1) {
    for (let v = 0; v < BLOCK_SIZE; v += 1) {
      JPEG_MASK[u * BLOCK_SIZE + v] = u + v > threshold ? 0 : 1;
    }
  }
}

class BCHCodec {
  constructor(n = 31, k = 16) {
    this.n = n;
    this.k = k;
    this.t = 3;
    this.GF_SIZE = 32;
    this.PRIM_POLY = 0b100101;
    this.gfExp = new Int32Array(this.GF_SIZE * 2);
    this.gfLog = new Int32Array(this.GF_SIZE);
    let val = 1;
    for (let i = 0; i < this.GF_SIZE - 1; i += 1) {
      this.gfExp[i] = val;
      this.gfLog[val] = i;
      val <<= 1;
      if (val & this.GF_SIZE) val ^= this.PRIM_POLY;
    }
    for (let i = this.GF_SIZE - 1; i < this.GF_SIZE * 2; i += 1) {
      this.gfExp[i] = this.gfExp[i - (this.GF_SIZE - 1)];
    }
    this.gen = new Int32Array([1, 0, 0, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 0, 1]);
  }

  gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return this.gfExp[this.gfLog[a] + this.gfLog[b]];
  }

  gfPow(a, n) {
    if (a === 0) return 0;
    return this.gfExp[(this.gfLog[a] * n) % (this.GF_SIZE - 1)];
  }

  gfPolyEval(poly, x) {
    let result = poly[0];
    for (let i = 1; i < poly.length; i += 1) {
      result = this.gfMul(result, x) ^ poly[i];
    }
    return result;
  }

  encode(dataBits) {
    const msg = new Int32Array(this.n);
    for (let i = 0; i < this.k; i += 1) msg[i] = dataBits[i] ? 1 : 0;
    const feedback = new Int32Array(this.k);
    for (let i = 0; i < this.k; i += 1) feedback[i] = msg[i];
    for (let i = this.k; i < this.n; i += 1) {
      if (feedback[0]) {
        for (let j = 0; j < this.k - 1; j += 1) feedback[j] = feedback[j + 1] ^ this.gen[j + 1];
        feedback[this.k - 1] = this.gen[this.k];
      } else {
        for (let j = 0; j < this.k - 1; j += 1) feedback[j] = feedback[j + 1];
        feedback[this.k - 1] = 0;
      }
    }
    for (let i = 0; i < this.n - this.k; i += 1) msg[this.k + i] = feedback[i];
    const out = new Array(this.n);
    for (let i = 0; i < this.n; i += 1) out[i] = msg[i] === 1;
    return out;
  }

  decode(receivedBits) {
    const received = new Int32Array(this.n);
    for (let i = 0; i < this.n; i += 1) received[i] = receivedBits[i] ? 1 : 0;
    const syndrome = new Int32Array(2 * this.t);
    for (let i = 1; i <= 2 * this.t; i += 1) {
      syndrome[i - 1] = this.gfPolyEval(received, this.gfExp[i]);
    }
    let hasError = false;
    for (let i = 0; i < syndrome.length; i += 1) {
      if (syndrome[i] !== 0) { hasError = true; break; }
    }
    if (!hasError) {
      const out = new Array(this.k);
      for (let i = 0; i < this.k; i += 1) out[i] = received[i] === 1;
      return { bits: out, errors: 0 };
    }
    const locator = this.berlekampMassey(syndrome);
    if (!locator) {
      const out = new Array(this.k);
      for (let i = 0; i < this.k; i += 1) out[i] = received[i] === 1;
      return { bits: out, errors: 0 };
    }
    const positions = this.chienSearch(locator);
    if (!positions || positions.length > this.t) {
      const out = new Array(this.k);
      for (let i = 0; i < this.k; i += 1) out[i] = received[i] === 1;
      return { bits: out, errors: 0 };
    }
    for (const pos of positions) received[pos] ^= 1;
    const out = new Array(this.k);
    for (let i = 0; i < this.k; i += 1) out[i] = received[i] === 1;
    return { bits: out, errors: positions.length };
  }

  berlekampMassey(syndrome) {
    const C = new Int32Array(this.t + 1);
    const B = new Int32Array(this.t + 1);
    C[0] = 1;
    B[0] = 1;
    let L = 0;
    let m = 1;
    let b = 1;
    for (let n = 0; n < this.t; n += 1) {
      let d = syndrome[n];
      for (let i = 1; i <= L; i += 1) d ^= this.gfMul(C[i], syndrome[n - i]);
      if (d === 0) { m += 1; continue; }
      const T = new Int32Array(C);
      const coeff = this.gfMul(d, this.gfPow(b, this.GF_SIZE - 2));
      for (let i = m; i <= this.t; i += 1) C[i] ^= this.gfMul(coeff, B[i - m]);
      if (2 * L <= n) {
        L = n + 1 - L;
        for (let i = 0; i <= this.t; i += 1) B[i] = T[i];
        b = d;
        m = 1;
      } else {
        m += 1;
      }
    }
    let maxIdx = -1;
    for (let i = this.t; i >= 0; i -= 1) {
      if (C[i] !== 0) { maxIdx = i; break; }
    }
    if (maxIdx < 0) return null;
    return C.slice(0, maxIdx + 1);
  }

  chienSearch(errorLocator) {
    const positions = [];
    for (let i = this.n - 1; i >= 0; i -= 1) {
      if (this.gfPolyEval(errorLocator, this.gfExp[i]) === 0) {
        positions.push(this.n - 1 - i);
      }
    }
    return positions.length > 0 ? positions : null;
  }
}

const bchCodec = new BCHCodec();

const COS4 = Array.from({ length: BLOCK_SIZE }, (_, u) =>
  Array.from({ length: BLOCK_SIZE }, (_, x) =>
    Math.cos((Math.PI * (2 * x + 1) * u) / (2 * BLOCK_SIZE)),
  ),
);

const SCALE4 = [SQRT1_4, SQRT2_4, SQRT2_4, SQRT2_4];

self.onmessage = async (event) => {
  const { id, action, payload } = event.data;
  try {
    let result;
    if (action === "embed") result = await embed(payload);
    if (action === "extract") result = await extract(payload);
    if (action === "attack") result = await attack(payload);
    if (!result) throw new Error(`Unknown action: ${action}`);
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

async function embed(payload) {
  const { imageData, wmMode, passwordImg, passwordWm, adaptive, jpegAware, useEcc } = payload;
  const watermark = await buildWatermark(payload);
  let encryptedBits = shuffleCopy(watermark.bits, passwordWm);

  if (useEcc) {
    const originalSize = encryptedBits.length;
    const padLen = (bchCodec.k - originalSize % bchCodec.k) % bchCodec.k;
    const padded = encryptedBits.concat(new Array(padLen).fill(false));
    const encoded = [];
    for (let i = 0; i < padded.length; i += bchCodec.k) {
      const block = padded.slice(i, i + bchCodec.k);
      encoded.push(...bchCodec.encode(block));
    }
    encryptedBits = encoded;
  }

  const context = prepareImage(imageData);
  assertCapacity(context.blockNum, encryptedBits.length);

  const shufflers = blockShufflers(passwordImg, context.blockNum);
  const channelData = transformChannels(context);

  for (let channel = 0; channel < 3; channel += 1) {
    addWatermarkToChannel(
      channelData[channel].ca,
      context.caWidth,
      context.blockRows,
      context.blockCols,
      encryptedBits,
      shufflers,
      adaptive,
      jpegAware,
    );
  }

  return {
    imageData: rebuildImage(context, channelData),
    width: imageData.width,
    height: imageData.height,
    mode: wmMode,
    bitLength: watermark.bits.length,
    wmShape: watermark.shape,
    watermarkId: watermark.watermarkId,
    summary: watermark.summary,
  };
}

async function extract(payload) {
  const { imageData, wmMode, passwordImg, passwordWm, adaptive, jpegAware, useEcc } = payload;
  let wmSize = getWatermarkSize(payload);
  if (useEcc) {
    wmSize = Math.ceil(wmSize * bchCodec.n / bchCodec.k);
  }
  const context = prepareImage(imageData);
  assertCapacity(context.blockNum, wmSize);

  const shufflers = blockShufflers(passwordImg, context.blockNum);
  const channelData = transformChannels(context);
  const blockBits = Array.from({ length: 3 }, () => new Float64Array(context.blockNum));

  for (let channel = 0; channel < 3; channel += 1) {
    readWatermarkFromChannel(
      channelData[channel].ca,
      context.caWidth,
      context.blockRows,
      context.blockCols,
      shufflers,
      blockBits[channel],
      adaptive,
      jpegAware,
    );
  }

  const averaged = new Float64Array(wmSize);
  const confidence = new Float64Array(wmSize);
  for (let bit = 0; bit < wmSize; bit += 1) {
    let totalWeight = 0;
    let totalValue = 0;
    for (let channel = 0; channel < 3; channel += 1) {
      for (let index = bit; index < context.blockNum; index += wmSize) {
        const val = blockBits[channel][index];
        const weight = Math.abs(val - 0.5) * 2 + 1e-10;
        totalValue += val * weight;
        totalWeight += weight;
      }
    }
    averaged[bit] = totalValue / totalWeight;
    confidence[bit] = Math.abs(averaged[bit] - 0.5) * 2;
  }

  let decodedBits;
  let decodedScores;
  let originalWmSize = getWatermarkSize(payload);

  if (useEcc) {
    const eccBits = averaged.map((v) => v >= 0.5);
    const decoded = [];
    for (let i = 0; i < eccBits.length; i += bchCodec.n) {
      const block = eccBits.slice(i, i + bchCodec.n);
      const result = bchCodec.decode(block);
      decoded.push(...result.bits);
    }
    decodedBits = decoded.slice(0, originalWmSize);
    decodedScores = averaged.slice(0, originalWmSize);
  } else {
    decodedScores = averaged;
  }

  if (wmMode === "img") {
    const decrypted = unshuffleValues(Array.from(useEcc ? decodedScores : averaged), passwordWm);
    return {
      mode: wmMode,
      width: imageData.width,
      height: imageData.height,
      wmShape: payload.wmShape,
      imageData: scoresToImageData(decrypted, payload.wmShape),
      rawScores: roundScores(decrypted),
      confidence: Number((average(confidence) * 100).toFixed(1)),
    };
  }

  const classified = useEcc ? decodedBits : oneDimKmeans(averaged).map(Boolean);
  const restored = unshuffleValues(classified, passwordWm).map(Boolean);
  const rawScores = unshuffleValues(Array.from(useEcc ? decodedScores : averaged), passwordWm);
  const response = {
    mode: wmMode,
    width: imageData.width,
    height: imageData.height,
    bitLength: originalWmSize,
    bits: restored.map((bit) => (bit ? 1 : 0)).join(""),
    rawScores: roundScores(rawScores),
    confidence: Number((average(confidence) * 100).toFixed(1)),
  };

  if (wmMode === "str") response.text = bitsToText(restored);
  if (wmMode === "id") response.watermarkId = bitsToHex(restored);
  return response;
}

async function attack(payload) {
  const { imageData, attackType, params, referenceImageData } = payload;
  if (!imageData) throw new Error("Choose an image first.");

  if (attackType === "crop") {
    const loc = readLoc(params, imageData.width, imageData.height);
    let out = cropImage(imageData, loc);
    const scale = positiveNumber(params.scale, 1);
    if (scale !== 1) out = resizeImage(out, Math.max(1, Math.round(out.width * scale)), Math.max(1, Math.round(out.height * scale)));
    return { imageData: out, loc, suffix: "crop", summary: locSummary(loc, scale) };
  }

  if (attackType === "recoverCrop") {
    const targetWidth = positiveInteger(params.targetWidth, imageData.width);
    const targetHeight = positiveInteger(params.targetHeight, imageData.height);
    const loc = readLoc(params, targetWidth, targetHeight);
    return {
      imageData: recoverCrop(imageData, targetWidth, targetHeight, loc),
      loc,
      suffix: "crop-recovered",
      summary: locSummary(loc, 1),
    };
  }

  if (attackType === "estimateCrop") {
    if (!referenceImageData) throw new Error("Choose a reference image for crop estimation.");
    const estimate = estimateCrop(referenceImageData, imageData, params);
    return {
      imageData: recoverCrop(imageData, referenceImageData.width, referenceImageData.height, estimate.loc),
      loc: estimate.loc,
      score: estimate.score,
      scale: estimate.scale,
      suffix: "crop-estimated",
      summary: `x1=${estimate.loc.x1}, y1=${estimate.loc.y1}, x2=${estimate.loc.x2}, y2=${estimate.loc.y2}, scale=${estimate.scale.toFixed(3)}, score=${estimate.score.toFixed(3)}`,
    };
  }

  if (attackType === "resize") {
    const width = positiveInteger(params.resizeWidth, imageData.width);
    const height = positiveInteger(params.resizeHeight, imageData.height);
    return { imageData: resizeImage(imageData, width, height), suffix: "resize", summary: `${width} x ${height}` };
  }

  if (attackType === "recoverResize") {
    const width = positiveInteger(params.targetWidth, imageData.width);
    const height = positiveInteger(params.targetHeight, imageData.height);
    return { imageData: resizeImage(imageData, width, height), suffix: "resize-recovered", summary: `${width} x ${height}` };
  }

  if (attackType === "brightness") {
    const ratio = positiveNumber(params.brightnessRatio, 1);
    return { imageData: brightnessImage(imageData, ratio), suffix: "brightness", summary: `ratio=${ratio}` };
  }

  if (attackType === "recoverBrightness") {
    const ratio = positiveNumber(params.brightnessRatio, 1);
    return { imageData: brightnessImage(imageData, 1 / ratio), suffix: "brightness-recovered", summary: `ratio=${1 / ratio}` };
  }

  if (attackType === "shelter") {
    const ratio = clamp(positiveNumber(params.shelterRatio, 0.1), 0.01, 0.9);
    const count = positiveInteger(params.shelterCount, 3);
    const seed = normalizeSeed(params.randomSeed);
    return { imageData: shelterImage(imageData, ratio, count, seed), suffix: "shelter", summary: `ratio=${ratio}, n=${count}` };
  }

  if (attackType === "saltPepper") {
    const ratio = clamp(positiveNumber(params.saltRatio, 0.01), 0.0001, 0.8);
    const seed = normalizeSeed(params.randomSeed);
    return { imageData: saltPepperImage(imageData, ratio, seed), suffix: "salt-pepper", summary: `ratio=${ratio}` };
  }

  if (attackType === "rotate") {
    const angle = finiteNumber(params.angle, 45);
    return { imageData: rotateImage(imageData, angle), suffix: "rotate", summary: `angle=${angle}` };
  }

  if (attackType === "recoverRotate") {
    const angle = finiteNumber(params.angle, 45);
    return { imageData: rotateImage(imageData, -angle), suffix: "rotate-recovered", summary: `angle=${-angle}` };
  }

  throw new Error(`Unknown attack: ${attackType}`);
}

async function buildWatermark(payload) {
  if (payload.wmMode === "str") {
    const text = String(payload.text || "");
    if (!text) throw new Error("Enter watermark text.");
    const bits = textToBits(text);
    return { bits, shape: [bits.length], summary: `${bits.length} bits` };
  }

  if (payload.wmMode === "id") {
    const text = String(payload.text || "");
    if (!text) throw new Error("Enter text for the 64-bit ID.");
    const bits = await hashBits64(text);
    return {
      bits,
      shape: [64],
      watermarkId: bitsToHex(bits),
      summary: `${bitsToHex(bits)} / 64 bits`,
    };
  }

  if (payload.wmMode === "bit") {
    const bits = parseBitString(payload.bitString);
    if (!bits.length) throw new Error("Enter at least one bit.");
    return { bits, shape: [bits.length], summary: `${bits.length} bits` };
  }

  if (payload.wmMode === "img") {
    const wmImage = payload.watermarkImageData;
    if (!wmImage) throw new Error("Choose a watermark image.");
    const bits = imageToBits(wmImage);
    return {
      bits,
      shape: [wmImage.width, wmImage.height],
      summary: `${wmImage.width} x ${wmImage.height} / ${bits.length} bits`,
    };
  }

  throw new Error(`Unknown watermark mode: ${payload.wmMode}`);
}

function getWatermarkSize(payload) {
  if (payload.wmMode === "id") return 64;
  if (payload.wmMode === "img") {
    const [width, height] = payload.wmShape || [];
    const w = positiveInteger(width, 0);
    const h = positiveInteger(height, 0);
    if (!w || !h) throw new Error("Enter watermark image width and height.");
    return w * h;
  }
  const bitLength = positiveInteger(payload.bitLength, 0);
  if (!bitLength) throw new Error("Enter watermark bit length.");
  return bitLength;
}

function prepareImage(imageData) {
  const { width, height, data } = imageData;
  const paddedWidth = width + (width % 2);
  const paddedHeight = height + (height % 2);
  const size = paddedWidth * paddedHeight;
  const y = new Float64Array(size);
  const u = new Float64Array(size);
  const v = new Float64Array(size);
  const alpha = new Uint8ClampedArray(width * height);

  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const source = (row * width + col) * 4;
      const target = row * paddedWidth + col;
      const r = data[source];
      const g = data[source + 1];
      const b = data[source + 2];
      y[target] = 0.299 * r + 0.587 * g + 0.114 * b;
      u[target] = -0.14713 * r - 0.28886 * g + 0.436 * b + 128;
      v[target] = 0.615 * r - 0.51499 * g - 0.10001 * b + 128;
      alpha[row * width + col] = data[source + 3];
    }
  }

  const caWidth = paddedWidth / 2;
  const caHeight = paddedHeight / 2;
  const blockRows = Math.floor(caHeight / BLOCK_SIZE);
  const blockCols = Math.floor(caWidth / BLOCK_SIZE);

  return {
    width,
    height,
    paddedWidth,
    paddedHeight,
    caWidth,
    caHeight,
    blockRows,
    blockCols,
    blockNum: blockRows * blockCols,
    yuv: [y, u, v],
    alpha,
  };
}

function transformChannels(context) {
  return context.yuv.map((channel) => haarDwt2(channel, context.paddedWidth, context.paddedHeight));
}

function rebuildImage(context, channelData) {
  const channels = channelData.map((channel) =>
    haarIdwt2(channel.ca, channel.h, channel.v, channel.d, context.caWidth, context.caHeight),
  );
  const output = new ImageData(context.width, context.height);
  const [y, u, v] = channels;

  for (let row = 0; row < context.height; row += 1) {
    for (let col = 0; col < context.width; col += 1) {
      const source = row * context.paddedWidth + col;
      const target = (row * context.width + col) * 4;
      const yy = y[source];
      const uu = u[source] - 128;
      const vv = v[source] - 128;
      output.data[target] = clampByte(yy + 1.13983 * vv);
      output.data[target + 1] = clampByte(yy - 0.39465 * uu - 0.5806 * vv);
      output.data[target + 2] = clampByte(yy + 2.03211 * uu);
      output.data[target + 3] = context.alpha[row * context.width + col];
    }
  }

  return output;
}

function haarDwt2(input, width, height) {
  const caWidth = width / 2;
  const caHeight = height / 2;
  const ca = new Float64Array(caWidth * caHeight);
  const h = new Float64Array(caWidth * caHeight);
  const v = new Float64Array(caWidth * caHeight);
  const d = new Float64Array(caWidth * caHeight);

  for (let row = 0; row < caHeight; row += 1) {
    for (let col = 0; col < caWidth; col += 1) {
      const p = row * 2 * width + col * 2;
      const a = input[p];
      const b = input[p + 1];
      const c = input[p + width];
      const e = input[p + width + 1];
      const target = row * caWidth + col;
      ca[target] = (a + b + c + e) / 2;
      h[target] = (a + b - c - e) / 2;
      v[target] = (a - b + c - e) / 2;
      d[target] = (a - b - c + e) / 2;
    }
  }

  return { ca, h, v, d };
}

function haarIdwt2(ca, h, v, d, caWidth, caHeight) {
  const width = caWidth * 2;
  const output = new Float64Array(width * caHeight * 2);

  for (let row = 0; row < caHeight; row += 1) {
    for (let col = 0; col < caWidth; col += 1) {
      const source = row * caWidth + col;
      const target = row * 2 * width + col * 2;
      const ll = ca[source];
      const hh = h[source];
      const vv = v[source];
      const dd = d[source];
      output[target] = (ll + hh + vv + dd) / 2;
      output[target + 1] = (ll + hh - vv - dd) / 2;
      output[target + width] = (ll - hh + vv - dd) / 2;
      output[target + width + 1] = (ll - hh - vv + dd) / 2;
    }
  }

  return output;
}

function computeBlockD(blockDct) {
  let energy = 0;
  for (let i = 0; i < BLOCK_AREA; i += 1) energy += blockDct[i] ** 2;
  energy = Math.sqrt(energy / BLOCK_AREA);
  const scale = Math.min(2.0, Math.max(0.5, energy / 200));
  return [D1_BASE * scale, D2_BASE * scale];
}

function addWatermarkToChannel(ca, caWidth, blockRows, blockCols, bits, shufflers, adaptive, jpegAware) {
  const block = new Float64Array(BLOCK_AREA);
  for (let blockIndex = 0; blockIndex < blockRows * blockCols; blockIndex += 1) {
    readBlock(ca, caWidth, blockCols, blockIndex, block);
    let dctBlock = dct4(block);
    if (jpegAware) {
      for (let i = 0; i < BLOCK_AREA; i += 1) dctBlock[i] *= JPEG_MASK[i];
    }
    const shuffled = shuffleBlock(dctBlock, shufflers[blockIndex]);
    const svd = svd4(shuffled);
    const wm = bits[blockIndex % bits.length] ? 1 : 0;
    const [d1, d2] = adaptive ? computeBlockD(shuffled) : [D1_BASE, D2_BASE];
    svd.s[0] = (Math.floor(svd.s[0] / d1) + 0.25 + 0.5 * wm) * d1;
    svd.s[1] = (Math.floor(svd.s[1] / d2) + 0.25 + 0.5 * wm) * d2;
    const adjusted = reconstructFromSvd(svd.u, svd.s, svd.v);
    const unshuffled = unshuffleBlock(adjusted, shufflers[blockIndex]);
    writeBlock(ca, caWidth, blockCols, blockIndex, idct4(unshuffled));
  }
}

function readWatermarkFromChannel(ca, caWidth, blockRows, blockCols, shufflers, out, adaptive, jpegAware) {
  const block = new Float64Array(BLOCK_AREA);
  for (let blockIndex = 0; blockIndex < blockRows * blockCols; blockIndex += 1) {
    readBlock(ca, caWidth, blockCols, blockIndex, block);
    let dctBlock = dct4(block);
    if (jpegAware) {
      for (let i = 0; i < BLOCK_AREA; i += 1) dctBlock[i] *= JPEG_MASK[i];
    }
    const shuffled = shuffleBlock(dctBlock, shufflers[blockIndex]);
    const svd = svd4(shuffled);
    const [d1, d2] = adaptive ? computeBlockD(shuffled) : [D1_BASE, D2_BASE];
    const first = svd.s[0] % d1 > d1 / 2 ? 1 : 0;
    const second = svd.s[1] % d2 > d2 / 2 ? 1 : 0;
    out[blockIndex] = (first * 3 + second) / 4;
  }
}

function readBlock(ca, caWidth, blockCols, blockIndex, out) {
  const blockRow = Math.floor(blockIndex / blockCols);
  const blockCol = blockIndex % blockCols;
  const start = blockRow * BLOCK_SIZE * caWidth + blockCol * BLOCK_SIZE;
  let index = 0;
  for (let row = 0; row < BLOCK_SIZE; row += 1) {
    for (let col = 0; col < BLOCK_SIZE; col += 1) {
      out[index] = ca[start + row * caWidth + col];
      index += 1;
    }
  }
}

function writeBlock(ca, caWidth, blockCols, blockIndex, block) {
  const blockRow = Math.floor(blockIndex / blockCols);
  const blockCol = blockIndex % blockCols;
  const start = blockRow * BLOCK_SIZE * caWidth + blockCol * BLOCK_SIZE;
  let index = 0;
  for (let row = 0; row < BLOCK_SIZE; row += 1) {
    for (let col = 0; col < BLOCK_SIZE; col += 1) {
      ca[start + row * caWidth + col] = block[index];
      index += 1;
    }
  }
}

function dct4(input) {
  const output = new Float64Array(BLOCK_AREA);
  for (let u = 0; u < BLOCK_SIZE; u += 1) {
    for (let v = 0; v < BLOCK_SIZE; v += 1) {
      let sum = 0;
      for (let x = 0; x < BLOCK_SIZE; x += 1) {
        for (let y = 0; y < BLOCK_SIZE; y += 1) {
          sum += input[x * BLOCK_SIZE + y] * COS4[u][x] * COS4[v][y];
        }
      }
      output[u * BLOCK_SIZE + v] = SCALE4[u] * SCALE4[v] * sum;
    }
  }
  return output;
}

function idct4(input) {
  const output = new Float64Array(BLOCK_AREA);
  for (let x = 0; x < BLOCK_SIZE; x += 1) {
    for (let y = 0; y < BLOCK_SIZE; y += 1) {
      let sum = 0;
      for (let u = 0; u < BLOCK_SIZE; u += 1) {
        for (let v = 0; v < BLOCK_SIZE; v += 1) {
          sum += SCALE4[u] * SCALE4[v] * input[u * BLOCK_SIZE + v] * COS4[u][x] * COS4[v][y];
        }
      }
      output[x * BLOCK_SIZE + y] = sum;
    }
  }
  return output;
}

function svd4(matrix) {
  const ata = new Float64Array(BLOCK_AREA);
  for (let row = 0; row < BLOCK_SIZE; row += 1) {
    for (let col = 0; col < BLOCK_SIZE; col += 1) {
      let sum = 0;
      for (let k = 0; k < BLOCK_SIZE; k += 1) {
        sum += matrix[k * BLOCK_SIZE + row] * matrix[k * BLOCK_SIZE + col];
      }
      ata[row * BLOCK_SIZE + col] = sum;
    }
  }

  const eigen = jacobiSymmetric4(ata);
  const order = [0, 1, 2, 3].sort((a, b) => eigen.values[b] - eigen.values[a]);
  const s = new Float64Array(BLOCK_SIZE);
  const v = new Float64Array(BLOCK_AREA);

  for (let outCol = 0; outCol < BLOCK_SIZE; outCol += 1) {
    const sourceCol = order[outCol];
    s[outCol] = Math.sqrt(Math.max(0, eigen.values[sourceCol]));
    for (let row = 0; row < BLOCK_SIZE; row += 1) {
      v[row * BLOCK_SIZE + outCol] = eigen.vectors[row * BLOCK_SIZE + sourceCol];
    }
  }

  const u = new Float64Array(BLOCK_AREA);
  for (let col = 0; col < BLOCK_SIZE; col += 1) {
    if (s[col] < 1e-10) {
      u[col * BLOCK_SIZE + col] = 1;
      continue;
    }
    for (let row = 0; row < BLOCK_SIZE; row += 1) {
      let sum = 0;
      for (let k = 0; k < BLOCK_SIZE; k += 1) {
        sum += matrix[row * BLOCK_SIZE + k] * v[k * BLOCK_SIZE + col];
      }
      u[row * BLOCK_SIZE + col] = sum / s[col];
    }
  }

  orthonormalizeColumns(u);
  return { u, s, v };
}

function jacobiSymmetric4(input) {
  const a = new Float64Array(input);
  const vectors = identity4();

  for (let iteration = 0; iteration < 60; iteration += 1) {
    let p = 0;
    let q = 1;
    let max = 0;
    for (let row = 0; row < BLOCK_SIZE; row += 1) {
      for (let col = row + 1; col < BLOCK_SIZE; col += 1) {
        const value = Math.abs(a[row * BLOCK_SIZE + col]);
        if (value > max) {
          max = value;
          p = row;
          q = col;
        }
      }
    }
    if (max < 1e-9) break;

    const app = a[p * BLOCK_SIZE + p];
    const aqq = a[q * BLOCK_SIZE + q];
    const apq = a[p * BLOCK_SIZE + q];
    const phi = 0.5 * Math.atan2(2 * apq, aqq - app);
    const c = Math.cos(phi);
    const s = Math.sin(phi);

    for (let k = 0; k < BLOCK_SIZE; k += 1) {
      const aik = a[p * BLOCK_SIZE + k];
      const aqk = a[q * BLOCK_SIZE + k];
      a[p * BLOCK_SIZE + k] = c * aik - s * aqk;
      a[q * BLOCK_SIZE + k] = s * aik + c * aqk;
    }
    for (let k = 0; k < BLOCK_SIZE; k += 1) {
      const akp = a[k * BLOCK_SIZE + p];
      const akq = a[k * BLOCK_SIZE + q];
      a[k * BLOCK_SIZE + p] = c * akp - s * akq;
      a[k * BLOCK_SIZE + q] = s * akp + c * akq;
    }
    for (let k = 0; k < BLOCK_SIZE; k += 1) {
      const vip = vectors[k * BLOCK_SIZE + p];
      const viq = vectors[k * BLOCK_SIZE + q];
      vectors[k * BLOCK_SIZE + p] = c * vip - s * viq;
      vectors[k * BLOCK_SIZE + q] = s * vip + c * viq;
    }
  }

  return {
    values: [a[0], a[5], a[10], a[15]],
    vectors,
  };
}

function reconstructFromSvd(u, s, v) {
  const us = new Float64Array(BLOCK_AREA);
  const output = new Float64Array(BLOCK_AREA);

  for (let row = 0; row < BLOCK_SIZE; row += 1) {
    for (let col = 0; col < BLOCK_SIZE; col += 1) {
      us[row * BLOCK_SIZE + col] = u[row * BLOCK_SIZE + col] * s[col];
    }
  }

  for (let row = 0; row < BLOCK_SIZE; row += 1) {
    for (let col = 0; col < BLOCK_SIZE; col += 1) {
      let sum = 0;
      for (let k = 0; k < BLOCK_SIZE; k += 1) {
        sum += us[row * BLOCK_SIZE + k] * v[col * BLOCK_SIZE + k];
      }
      output[row * BLOCK_SIZE + col] = sum;
    }
  }

  return output;
}

function identity4() {
  const output = new Float64Array(BLOCK_AREA);
  for (let i = 0; i < BLOCK_SIZE; i += 1) output[i * BLOCK_SIZE + i] = 1;
  return output;
}

function orthonormalizeColumns(matrix) {
  for (let col = 0; col < BLOCK_SIZE; col += 1) {
    for (let prev = 0; prev < col; prev += 1) {
      let dot = 0;
      for (let row = 0; row < BLOCK_SIZE; row += 1) {
        dot += matrix[row * BLOCK_SIZE + col] * matrix[row * BLOCK_SIZE + prev];
      }
      for (let row = 0; row < BLOCK_SIZE; row += 1) {
        matrix[row * BLOCK_SIZE + col] -= dot * matrix[row * BLOCK_SIZE + prev];
      }
    }

    let norm = 0;
    for (let row = 0; row < BLOCK_SIZE; row += 1) {
      norm += matrix[row * BLOCK_SIZE + col] ** 2;
    }
    norm = Math.sqrt(norm);
    if (norm < 1e-10) {
      for (let row = 0; row < BLOCK_SIZE; row += 1) matrix[row * BLOCK_SIZE + col] = 0;
      matrix[col * BLOCK_SIZE + col] = 1;
    } else {
      for (let row = 0; row < BLOCK_SIZE; row += 1) matrix[row * BLOCK_SIZE + col] /= norm;
    }
  }
}

function shuffleBlock(block, order) {
  const out = new Float64Array(BLOCK_AREA);
  for (let i = 0; i < BLOCK_AREA; i += 1) out[i] = block[order[i]];
  return out;
}

function unshuffleBlock(block, order) {
  const out = new Float64Array(BLOCK_AREA);
  for (let i = 0; i < BLOCK_AREA; i += 1) out[order[i]] = block[i];
  return out;
}

function blockShufflers(seed, blockNum) {
  const random = mulberry32(normalizeSeed(seed));
  const shufflers = new Array(blockNum);
  for (let i = 0; i < blockNum; i += 1) {
    const values = Array.from({ length: BLOCK_AREA }, (_, index) => ({ index, value: random() }));
    values.sort((a, b) => valueSort(a, b));
    shufflers[i] = values.map((item) => item.index);
  }
  return shufflers;
}

function valueSort(a, b) {
  if (a.value === b.value) return a.index - b.index;
  return a.value - b.value;
}

function shuffleCopy(values, seed) {
  const out = values.slice();
  const random = mulberry32(normalizeSeed(seed));
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function unshuffleValues(values, seed) {
  const order = Array.from({ length: values.length }, (_, index) => index);
  const shuffled = shuffleCopy(order, seed);
  const out = new Array(values.length);
  for (let i = 0; i < values.length; i += 1) out[shuffled[i]] = values[i];
  return out;
}

function oneDimKmeans(values) {
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  let center0 = min;
  let center1 = max;
  let threshold = 0.5;

  for (let iteration = 0; iteration < 300; iteration += 1) {
    threshold = (center0 + center1) / 2;
    let total0 = 0;
    let count0 = 0;
    let total1 = 0;
    let count1 = 0;
    for (const value of values) {
      if (value > threshold) {
        total1 += value;
        count1 += 1;
      } else {
        total0 += value;
        count0 += 1;
      }
    }
    const next0 = count0 ? total0 / count0 : center0;
    const next1 = count1 ? total1 / count1 : center1;
    const nextThreshold = (next0 + next1) / 2;
    center0 = next0;
    center1 = next1;
    if (Math.abs(nextThreshold - threshold) < 1e-6) {
      threshold = nextThreshold;
      break;
    }
  }

  return Array.from(values, (value) => value > threshold);
}

function textToBits(text) {
  const bytes = new TextEncoder().encode(text);
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  if (!hex) return [];
  const binary = BigInt(`0x${hex}`).toString(2);
  return Array.from(binary, (char) => char === "1");
}

function bitsToText(bits) {
  const binary = bits.map((bit) => (bit ? "1" : "0")).join("");
  if (!binary) return "";
  let hex = BigInt(`0b${binary}`).toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function parseBitString(bitString) {
  return Array.from(String(bitString || "").replace(/[^01]/g, ""), (char) => char === "1");
}

function imageToBits(imageData) {
  const bits = [];
  for (let i = 0; i < imageData.data.length; i += 4) {
    const gray = 0.299 * imageData.data[i] + 0.587 * imageData.data[i + 1] + 0.114 * imageData.data[i + 2];
    bits.push(gray > 128);
  }
  return bits;
}

function scoresToImageData(scores, shape) {
  const [width, height] = shape || [];
  const output = new ImageData(width, height);
  for (let i = 0; i < width * height; i += 1) {
    const value = clampByte((scores[i] || 0) * 255);
    output.data[i * 4] = value;
    output.data[i * 4 + 1] = value;
    output.data[i * 4 + 2] = value;
    output.data[i * 4 + 3] = 255;
  }
  return output;
}

async function hashBits64(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  const bytes = new Uint8Array(digest).slice(0, 8);
  const bits = [];
  for (const byte of bytes) {
    for (let shift = 7; shift >= 0; shift -= 1) {
      bits.push(Boolean((byte >> shift) & 1));
    }
  }
  return bits;
}

function bitsToHex(bits) {
  let output = "";
  for (let i = 0; i < bits.length; i += 4) {
    let value = 0;
    for (let j = 0; j < 4; j += 1) {
      value = value * 2 + (bits[i + j] ? 1 : 0);
    }
    output += value.toString(16);
  }
  return output;
}

function cropImage(imageData, loc) {
  const width = Math.max(1, loc.x2 - loc.x1);
  const height = Math.max(1, loc.y2 - loc.y1);
  const output = new ImageData(width, height);
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const sourceX = clamp(loc.x1 + col, 0, imageData.width - 1);
      const sourceY = clamp(loc.y1 + row, 0, imageData.height - 1);
      copyPixel(imageData, output, sourceX, sourceY, col, row);
    }
  }
  return output;
}

function recoverCrop(template, targetWidth, targetHeight, loc) {
  const output = new ImageData(targetWidth, targetHeight);
  for (let i = 0; i < output.data.length; i += 4) {
    output.data[i] = 255;
    output.data[i + 1] = 255;
    output.data[i + 2] = 255;
    output.data[i + 3] = 255;
  }
  const pasteWidth = Math.max(1, loc.x2 - loc.x1);
  const pasteHeight = Math.max(1, loc.y2 - loc.y1);
  const resized = resizeImage(template, pasteWidth, pasteHeight);
  for (let row = 0; row < pasteHeight; row += 1) {
    for (let col = 0; col < pasteWidth; col += 1) {
      const targetX = loc.x1 + col;
      const targetY = loc.y1 + row;
      if (targetX >= 0 && targetX < targetWidth && targetY >= 0 && targetY < targetHeight) {
        copyPixel(resized, output, col, row, targetX, targetY);
      }
    }
  }
  return output;
}

function resizeImage(imageData, width, height) {
  const output = new ImageData(width, height);
  const xRatio = imageData.width / width;
  const yRatio = imageData.height / height;

  for (let row = 0; row < height; row += 1) {
    const sourceY = (row + 0.5) * yRatio - 0.5;
    const y0 = Math.floor(sourceY);
    const y1 = y0 + 1;
    const wy = sourceY - y0;
    for (let col = 0; col < width; col += 1) {
      const sourceX = (col + 0.5) * xRatio - 0.5;
      const x0 = Math.floor(sourceX);
      const x1 = x0 + 1;
      const wx = sourceX - x0;
      writeBilinear(imageData, output, x0, y0, x1, y1, wx, wy, col, row);
    }
  }

  return output;
}

function rotateImage(imageData, angle) {
  const output = new ImageData(imageData.width, imageData.height);
  const radians = (-angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const cx = (imageData.width - 1) / 2;
  const cy = (imageData.height - 1) / 2;

  for (let i = 0; i < output.data.length; i += 4) {
    output.data[i] = 0;
    output.data[i + 1] = 0;
    output.data[i + 2] = 0;
    output.data[i + 3] = 255;
  }

  for (let row = 0; row < imageData.height; row += 1) {
    for (let col = 0; col < imageData.width; col += 1) {
      const dx = col - cx;
      const dy = row - cy;
      const sourceX = dx * cos - dy * sin + cx;
      const sourceY = dx * sin + dy * cos + cy;
      if (sourceX >= 0 && sourceX <= imageData.width - 1 && sourceY >= 0 && sourceY <= imageData.height - 1) {
        const x0 = Math.floor(sourceX);
        const y0 = Math.floor(sourceY);
        writeBilinear(imageData, output, x0, y0, x0 + 1, y0 + 1, sourceX - x0, sourceY - y0, col, row);
      }
    }
  }

  return output;
}

function brightnessImage(imageData, ratio) {
  const output = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
  for (let i = 0; i < output.data.length; i += 4) {
    output.data[i] = clampByte(output.data[i] * ratio);
    output.data[i + 1] = clampByte(output.data[i + 1] * ratio);
    output.data[i + 2] = clampByte(output.data[i + 2] * ratio);
  }
  return output;
}

function shelterImage(imageData, ratio, count, seed) {
  const output = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
  const random = mulberry32(seed);
  const blockW = Math.max(1, Math.round(imageData.width * ratio));
  const blockH = Math.max(1, Math.round(imageData.height * ratio));
  for (let i = 0; i < count; i += 1) {
    const x = Math.floor(random() * Math.max(1, imageData.width - blockW));
    const y = Math.floor(random() * Math.max(1, imageData.height - blockH));
    for (let row = y; row < Math.min(imageData.height, y + blockH); row += 1) {
      for (let col = x; col < Math.min(imageData.width, x + blockW); col += 1) {
        const target = (row * imageData.width + col) * 4;
        output.data[target] = 255;
        output.data[target + 1] = 255;
        output.data[target + 2] = 255;
        output.data[target + 3] = 255;
      }
    }
  }
  return output;
}

function saltPepperImage(imageData, ratio, seed) {
  const output = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
  const random = mulberry32(seed);
  for (let i = 0; i < output.data.length; i += 4) {
    if (random() < ratio) {
      const value = random() < 0.5 ? 0 : 255;
      output.data[i] = value;
      output.data[i + 1] = value;
      output.data[i + 2] = value;
      output.data[i + 3] = 255;
    }
  }
  return output;
}

function estimateCrop(reference, template, params) {
  const minScale = positiveNumber(params.estimateMinScale, 0.5);
  const maxScale = positiveNumber(params.estimateMaxScale, 2);
  const steps = clamp(positiveInteger(params.estimateSteps, 24), 3, 60);
  const refScale = Math.min(1, 140 / Math.max(reference.width, reference.height));
  const refSmall = grayDownsample(reference, refScale);
  const templateGray = grayDownsample(template, refScale);
  let best = { score: Infinity, x: 0, y: 0, w: templateGray.width, h: templateGray.height, scale: 1 };

  for (let step = 0; step < steps; step += 1) {
    const scale = steps === 1 ? minScale : minScale + ((maxScale - minScale) * step) / (steps - 1);
    const scaledW = Math.max(4, Math.round(templateGray.width * scale));
    const scaledH = Math.max(4, Math.round(templateGray.height * scale));
    if (scaledW > refSmall.width || scaledH > refSmall.height) continue;
    const scaledTemplate = resizeGray(templateGray, scaledW, scaledH);
    const stride = Math.max(1, Math.floor(Math.min(scaledW, scaledH) / 24));
    for (let y = 0; y <= refSmall.height - scaledH; y += stride) {
      for (let x = 0; x <= refSmall.width - scaledW; x += stride) {
        const score = meanAbsoluteDifference(refSmall, scaledTemplate, x, y);
        if (score < best.score) best = { score, x, y, w: scaledW, h: scaledH, scale };
      }
    }
  }

  const inv = 1 / refScale;
  const loc = {
    x1: clamp(Math.round(best.x * inv), 0, reference.width - 1),
    y1: clamp(Math.round(best.y * inv), 0, reference.height - 1),
    x2: clamp(Math.round((best.x + best.w) * inv), 1, reference.width),
    y2: clamp(Math.round((best.y + best.h) * inv), 1, reference.height),
  };
  return { loc, score: 1 - best.score / 255, scale: best.scale };
}

function grayDownsample(imageData, scale) {
  const width = Math.max(1, Math.round(imageData.width * scale));
  const height = Math.max(1, Math.round(imageData.height * scale));
  const resized = resizeImage(imageData, width, height);
  const data = new Float64Array(width * height);
  for (let i = 0; i < data.length; i += 1) {
    const source = i * 4;
    data[i] = 0.299 * resized.data[source] + 0.587 * resized.data[source + 1] + 0.114 * resized.data[source + 2];
  }
  return { width, height, data };
}

function resizeGray(gray, width, height) {
  const output = new Float64Array(width * height);
  const xRatio = gray.width / width;
  const yRatio = gray.height / height;
  for (let row = 0; row < height; row += 1) {
    const sourceY = clamp(Math.round((row + 0.5) * yRatio - 0.5), 0, gray.height - 1);
    for (let col = 0; col < width; col += 1) {
      const sourceX = clamp(Math.round((col + 0.5) * xRatio - 0.5), 0, gray.width - 1);
      output[row * width + col] = gray.data[sourceY * gray.width + sourceX];
    }
  }
  return { width, height, data: output };
}

function meanAbsoluteDifference(ref, template, x, y) {
  let total = 0;
  const stride = Math.max(1, Math.floor(Math.min(template.width, template.height) / 40));
  let count = 0;
  for (let row = 0; row < template.height; row += stride) {
    for (let col = 0; col < template.width; col += stride) {
      total += Math.abs(ref.data[(y + row) * ref.width + x + col] - template.data[row * template.width + col]);
      count += 1;
    }
  }
  return total / count;
}

function writeBilinear(input, output, x0, y0, x1, y1, wx, wy, targetX, targetY) {
  const ix0 = clamp(x0, 0, input.width - 1);
  const iy0 = clamp(y0, 0, input.height - 1);
  const ix1 = clamp(x1, 0, input.width - 1);
  const iy1 = clamp(y1, 0, input.height - 1);
  const target = (targetY * output.width + targetX) * 4;
  const p00 = (iy0 * input.width + ix0) * 4;
  const p10 = (iy0 * input.width + ix1) * 4;
  const p01 = (iy1 * input.width + ix0) * 4;
  const p11 = (iy1 * input.width + ix1) * 4;
  const w00 = (1 - wx) * (1 - wy);
  const w10 = wx * (1 - wy);
  const w01 = (1 - wx) * wy;
  const w11 = wx * wy;
  for (let channel = 0; channel < 4; channel += 1) {
    output.data[target + channel] = clampByte(
      input.data[p00 + channel] * w00 +
        input.data[p10 + channel] * w10 +
        input.data[p01 + channel] * w01 +
        input.data[p11 + channel] * w11,
    );
  }
}

function copyPixel(input, output, sourceX, sourceY, targetX, targetY) {
  const source = (sourceY * input.width + sourceX) * 4;
  const target = (targetY * output.width + targetX) * 4;
  output.data[target] = input.data[source];
  output.data[target + 1] = input.data[source + 1];
  output.data[target + 2] = input.data[source + 2];
  output.data[target + 3] = input.data[source + 3];
}

function readLoc(params, width, height) {
  const x1 = clamp(Math.round(width * clamp(positiveNumber(params.cropX1, 0.1), 0, 0.99)), 0, width - 1);
  const y1 = clamp(Math.round(height * clamp(positiveNumber(params.cropY1, 0.1), 0, 0.99)), 0, height - 1);
  const x2 = clamp(Math.round(width * clamp(positiveNumber(params.cropX2, 0.7), 0.01, 1)), x1 + 1, width);
  const y2 = clamp(Math.round(height * clamp(positiveNumber(params.cropY2, 0.6), 0.01, 1)), y1 + 1, height);
  return { x1, y1, x2, y2 };
}

function locSummary(loc, scale) {
  return `x1=${loc.x1}, y1=${loc.y1}, x2=${loc.x2}, y2=${loc.y2}, scale=${scale}`;
}

function roundScores(scores) {
  const limit = Math.min(scores.length, 4096);
  const out = new Array(limit);
  for (let i = 0; i < limit; i += 1) out[i] = Number(scores[i].toFixed(4));
  return out;
}

function normalizeSeed(seed) {
  const value = Number.parseInt(seed || "1", 10);
  return Number.isFinite(value) ? value >>> 0 : 1;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return function random() {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function assertCapacity(blockNum, bitLength) {
  if (blockNum <= bitLength) {
    throw new Error(`Image capacity is ${blockNum} bits. Watermark needs ${bitLength + 1} or fewer repeated blocks; use a larger image or shorter watermark.`);
  }
}

function finiteNumber(value, fallback) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveNumber(value, fallback) {
  const number = finiteNumber(value, fallback);
  return number > 0 ? number : fallback;
}

function positiveInteger(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function average(values) {
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampByte(value) {
  if (value <= 0) return 0;
  if (value >= 255) return 255;
  return Math.round(value);
}
