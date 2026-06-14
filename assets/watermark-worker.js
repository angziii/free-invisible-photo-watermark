const BLOCK_SIZE = 4;
const BLOCK_AREA = 16;
const D1 = 36;
const D2 = 20;
const SQRT1_4 = 0.5;
const SQRT2_4 = Math.SQRT1_2;

const COS4 = Array.from({ length: BLOCK_SIZE }, (_, u) =>
  Array.from({ length: BLOCK_SIZE }, (_, x) =>
    Math.cos((Math.PI * (2 * x + 1) * u) / (2 * BLOCK_SIZE))
  )
);

const SCALE4 = [SQRT1_4, SQRT2_4, SQRT2_4, SQRT2_4];

self.onmessage = async (event) => {
  const { id, action, payload } = event.data;
  try {
    let result;
    if (action === "embed") result = await embed(payload);
    if (action === "verify") result = await verify(payload);
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
  const { imageData, watermarkText, password } = payload;
  const bits = await hashBits64(watermarkText);
  const watermarkId = bitsToHex(bits);
  const shuffledBits = bits.slice();
  shuffleInPlace(shuffledBits, password);

  const context = prepareImage(imageData);
  assertCapacity(context.blockNum, shuffledBits.length);

  const shufflers = blockShufflers(password, context.blockNum);
  const channelData = transformChannels(context);

  for (let channel = 0; channel < 3; channel += 1) {
    addWatermarkToChannel(channelData[channel].ca, context.caWidth, context.blockRows, context.blockCols, shuffledBits, shufflers);
  }

  const output = rebuildImage(context, channelData);
  return {
    imageData: output,
    watermarkId,
    width: imageData.width,
    height: imageData.height,
  };
}

async function verify(payload) {
  const { imageData, password } = payload;
  const wmSize = 64;
  const context = prepareImage(imageData);
  assertCapacity(context.blockNum, wmSize);

  const shufflers = blockShufflers(password, context.blockNum);
  const channelData = transformChannels(context);
  const blockBits = Array.from({ length: 3 }, () => new Float64Array(context.blockNum));

  for (let channel = 0; channel < 3; channel += 1) {
    readWatermarkFromChannel(channelData[channel].ca, context.caWidth, context.blockRows, context.blockCols, shufflers, blockBits[channel]);
  }

  const averaged = new Float64Array(wmSize);
  const confidence = new Float64Array(wmSize);
  for (let bit = 0; bit < wmSize; bit += 1) {
    let total = 0;
    let count = 0;
    for (let channel = 0; channel < 3; channel += 1) {
      for (let index = bit; index < context.blockNum; index += wmSize) {
        total += blockBits[channel][index];
        count += 1;
      }
    }
    averaged[bit] = total / count;
  }

  const classified = oneDimKmeans(averaged);
  const restored = unshuffleBits(classified, password);
  for (let i = 0; i < averaged.length; i += 1) {
    confidence[i] = Math.abs(averaged[i] - 0.5) * 2;
  }

  return {
    watermarkId: bitsToHex(Array.from(restored, Boolean)),
    confidence: Number((average(confidence) * 100).toFixed(1)),
    width: imageData.width,
    height: imageData.height,
  };
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
    haarIdwt2(channel.ca, channel.h, channel.v, channel.d, context.caWidth, context.caHeight)
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
      const p = (row * 2) * width + col * 2;
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
      const target = (row * 2) * width + col * 2;
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

function addWatermarkToChannel(ca, caWidth, blockRows, blockCols, bits, shufflers) {
  const block = new Float64Array(BLOCK_AREA);
  for (let blockIndex = 0; blockIndex < blockRows * blockCols; blockIndex += 1) {
    readBlock(ca, caWidth, blockRows, blockCols, blockIndex, block);
    const dctBlock = dct4(block);
    const shuffled = shuffleBlock(dctBlock, shufflers[blockIndex]);
    const svd = svd4(shuffled);
    const wm = bits[blockIndex % bits.length] ? 1 : 0;
    svd.s[0] = (Math.floor(svd.s[0] / D1) + 0.25 + 0.5 * wm) * D1;
    svd.s[1] = (Math.floor(svd.s[1] / D2) + 0.25 + 0.5 * wm) * D2;
    const adjusted = reconstructFromSvd(svd.u, svd.s, svd.v);
    const unshuffled = unshuffleBlock(adjusted, shufflers[blockIndex]);
    writeBlock(ca, caWidth, blockRows, blockCols, blockIndex, idct4(unshuffled));
  }
}

function readWatermarkFromChannel(ca, caWidth, blockRows, blockCols, shufflers, out) {
  const block = new Float64Array(BLOCK_AREA);
  for (let blockIndex = 0; blockIndex < blockRows * blockCols; blockIndex += 1) {
    readBlock(ca, caWidth, blockRows, blockCols, blockIndex, block);
    const dctBlock = dct4(block);
    const shuffled = shuffleBlock(dctBlock, shufflers[blockIndex]);
    const svd = svd4(shuffled);
    const first = svd.s[0] % D1 > D1 / 2 ? 1 : 0;
    const second = svd.s[1] % D2 > D2 / 2 ? 1 : 0;
    out[blockIndex] = (first * 3 + second) / 4;
  }
}

function readBlock(ca, caWidth, blockRows, blockCols, blockIndex, out) {
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

function writeBlock(ca, caWidth, blockRows, blockCols, blockIndex, block) {
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
    values.sort((a, b) => a.value - b.value);
    shufflers[i] = values.map((item) => item.index);
  }
  return shufflers;
}

function shuffleInPlace(bits, seed) {
  const random = mulberry32(normalizeSeed(seed));
  for (let i = bits.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [bits[i], bits[j]] = [bits[j], bits[i]];
  }
}

function unshuffleBits(bits, seed) {
  const order = Array.from({ length: bits.length }, (_, index) => index);
  shuffleInPlace(order, seed);
  const out = new Array(bits.length);
  for (let i = 0; i < bits.length; i += 1) out[order[i]] = bits[i];
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
    throw new Error("Image is too small for a 64-bit invisible watermark. Use at least 80 x 80 px.");
  }
}

function average(values) {
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

function clampByte(value) {
  if (value <= 0) return 0;
  if (value >= 255) return 255;
  return Math.round(value);
}
