const elements = {
  fileInput: document.getElementById("fileInput"),
  dropzone: document.getElementById("dropzone"),
  fileMeta: document.getElementById("fileMeta"),
  watermarkModeGroup: document.getElementById("watermarkModeGroup"),
  watermarkText: document.getElementById("watermarkText"),
  watermarkImageInput: document.getElementById("watermarkImageInput"),
  watermarkImageMeta: document.getElementById("watermarkImageMeta"),
  bitString: document.getElementById("bitString"),
  bitLength: document.getElementById("bitLength"),
  wmWidth: document.getElementById("wmWidth"),
  wmHeight: document.getElementById("wmHeight"),
  passwordImg: document.getElementById("passwordImg"),
  passwordWm: document.getElementById("passwordWm"),
  outputFormat: document.getElementById("outputFormat"),
  platformAction: document.getElementById("platformAction"),
  platformTargetType: document.getElementById("platformTargetType"),
  platformTitle: document.getElementById("platformTitle"),
  platformTargetUrl: document.getElementById("platformTargetUrl"),
  platformQrPayload: document.getElementById("platformQrPayload"),
  platformPayloadMode: document.getElementById("platformPayloadMode"),
  platformDirectText: document.getElementById("platformDirectText"),
  platformMinConfidence: document.getElementById("platformMinConfidence"),
  attackType: document.getElementById("attackType"),
  referenceInput: document.getElementById("referenceInput"),
  referenceMeta: document.getElementById("referenceMeta"),
  status: document.getElementById("status"),
  runButton: document.getElementById("runButton"),
  downloadLink: document.getElementById("downloadLink"),
  resultDownloadLink: document.getElementById("resultDownloadLink"),
  payloadInfo: document.getElementById("payloadInfo"),
  shapeInfo: document.getElementById("shapeInfo"),
  imageInfo: document.getElementById("imageInfo"),
  previewCanvas: document.getElementById("previewCanvas"),
  resultCanvas: document.getElementById("resultCanvas"),
  emptyState: document.getElementById("emptyState"),
  resetImageButton: document.getElementById("resetImageButton"),
  langEn: document.getElementById("langEn"),
  langZh: document.getElementById("langZh"),
  toast: document.getElementById("toast"),
  toastTitle: document.getElementById("toastTitle"),
  toastBody: document.getElementById("toastBody"),
  toastClose: document.getElementById("toastClose"),
};

const previewCtx = elements.previewCanvas.getContext("2d", { willReadFrequently: true });
const resultCtx = elements.resultCanvas.getContext("2d", { willReadFrequently: true });
const worker = new Worker("/assets/watermark-worker.js");
const pending = new Map();

const translations = {
  en: {
    eyebrow: "blind watermark",
    title: "Invisible watermark workspace",
    tabEmbed: "Embed",
    tabExtract: "Extract",
    tabPlatform: "Platform",
    tabAttack: "Attack",
    choosePhoto: "Choose image",
    watermarkType: "Watermark type",
    wmText: "Text",
    wmImage: "Image",
    wmBit: "Bit",
    wmId: "64-bit ID",
    watermarkText: "Watermark text",
    watermarkTextPlaceholder: "@guofei9987 Open source forever!",
    chooseWatermarkImage: "Choose watermark image",
    bitString: "Bit sequence",
    bitPlaceholder: "101110",
    bitLength: "Watermark bit length",
    wmWidth: "Watermark width",
    wmHeight: "Watermark height",
    passwordImg: "Image password",
    passwordWm: "Watermark password",
    output: "Output format",
    platformAction: "Platform action",
    platformEmbed: "Save content + watermark",
    platformDecode: "Decode uploaded image",
    platformTargetType: "Content type",
    platformTargetUrl: "Website URL",
    platformTargetQr: "QR payload",
    platformTargetText: "Text payload",
    platformTitle: "Title",
    platformTargetUrlLabel: "Website URL",
    platformQrPayload: "QR / text payload",
    platformPayloadMode: "Payload mode",
    platformShortId: "Short ID lookup",
    platformDirectText: "Direct short text",
    platformDirectTextLabel: "Direct text",
    platformMinConfidence: "Minimum confidence",
    attackType: "Action",
    attackCrop: "Crop + resize",
    attackRecoverCrop: "Recover crop",
    attackEstimateCrop: "Estimate crop",
    attackResize: "Resize",
    attackRecoverResize: "Recover resize",
    attackBrightness: "Brightness",
    attackRecoverBrightness: "Recover brightness",
    attackShelter: "Shelter",
    attackSalt: "Salt & pepper",
    attackRotate: "Rotate",
    attackRecoverRotate: "Recover rotate",
    chooseReference: "Choose reference image",
    cropScale: "Scale",
    resizeWidth: "Output width",
    resizeHeight: "Output height",
    targetWidth: "Target width",
    targetHeight: "Target height",
    brightnessRatio: "Brightness ratio",
    shelterRatio: "Shelter ratio",
    shelterCount: "Shelter count",
    saltRatio: "Noise ratio",
    randomSeed: "Random seed",
    angle: "Angle",
    estimateMinScale: "Min scale",
    estimateMaxScale: "Max scale",
    estimateSteps: "Search steps",
    embedAction: "Embed watermark",
    extractAction: "Extract watermark",
    platformEmbedAction: "Create platform watermark",
    platformDecodeAction: "Decode platform watermark",
    attackAction: "Run action",
    download: "Download",
    downloading: "Downloading...",
    downloadResult: "Download result",
    payloadLabel: "Payload",
    shapeLabel: "Shape",
    imageLabel: "Image",
    preview: "Preview",
    resetImage: "Reset image",
    result: "Result",
    empty: "No image selected",
    footer: "DWT-DCT-SVD / MIT",
    ready: "Ready",
    unsupported: "Unsupported image type",
    loading: "Loading image...",
    chooseFirst: "Choose an image first.",
    embedding: "Embedding...",
    extracting: "Extracting...",
    processing: "Processing...",
    embedded: "Watermark embedded.",
    extracted: "Watermark extracted.",
    platformEmbedded: "Platform watermark embedded.",
    platformDecoded: "Platform watermark decoded.",
    platformNotFound: "No trusted platform watermark found.",
    platformUnavailable: "Platform API unavailable. Run python3 platform_server.py and open that local server.",
    processed: "Action complete.",
    errorTitle: "Processing failed",
    noDownloadTitle: "No downloadable file",
    noDownloadBody: "Run an action that produces an image first.",
    close: "Close",
  },
  zh: {
    eyebrow: "blind watermark",
    title: "隐形水印工作台",
    tabEmbed: "嵌入",
    tabExtract: "提取",
    tabPlatform: "平台",
    tabAttack: "攻击",
    choosePhoto: "选择图片",
    watermarkType: "水印类型",
    wmText: "文字",
    wmImage: "图片",
    wmBit: "Bit",
    wmId: "64-bit ID",
    watermarkText: "水印文本",
    watermarkTextPlaceholder: "@guofei9987 开源万岁！",
    chooseWatermarkImage: "选择水印图片",
    bitString: "Bit 序列",
    bitPlaceholder: "101110",
    bitLength: "水印 bit 长度",
    wmWidth: "水印宽",
    wmHeight: "水印高",
    passwordImg: "图片密码",
    passwordWm: "水印密码",
    output: "输出格式",
    platformAction: "平台操作",
    platformEmbed: "保存内容并加水印",
    platformDecode: "上传识别水印",
    platformTargetType: "内容类型",
    platformTargetUrl: "网站链接",
    platformTargetQr: "二维码内容",
    platformTargetText: "文本内容",
    platformTitle: "标题",
    platformTargetUrlLabel: "网站链接",
    platformQrPayload: "二维码/文本内容",
    platformPayloadMode: "写入模式",
    platformShortId: "短 ID 查链接",
    platformDirectText: "直接写入短文本",
    platformDirectTextLabel: "直接写入文本",
    platformMinConfidence: "最低置信度",
    attackType: "处理",
    attackCrop: "裁剪 + 缩放",
    attackRecoverCrop: "按参数恢复裁剪",
    attackEstimateCrop: "估计并恢复裁剪",
    attackResize: "缩放",
    attackRecoverResize: "恢复缩放",
    attackBrightness: "亮度",
    attackRecoverBrightness: "恢复亮度",
    attackShelter: "遮挡",
    attackSalt: "椒盐",
    attackRotate: "旋转",
    attackRecoverRotate: "恢复旋转",
    chooseReference: "选择参考原图",
    cropScale: "缩放倍数",
    resizeWidth: "输出宽",
    resizeHeight: "输出高",
    targetWidth: "目标宽",
    targetHeight: "目标高",
    brightnessRatio: "亮度比例",
    shelterRatio: "遮挡比例",
    shelterCount: "遮挡次数",
    saltRatio: "噪声比例",
    randomSeed: "随机种子",
    angle: "角度",
    estimateMinScale: "最小比例",
    estimateMaxScale: "最大比例",
    estimateSteps: "搜索步数",
    embedAction: "嵌入水印",
    extractAction: "提取水印",
    platformEmbedAction: "生成平台水印",
    platformDecodeAction: "识别平台水印",
    attackAction: "执行处理",
    download: "下载",
    downloading: "正在下载...",
    downloadResult: "下载结果",
    payloadLabel: "载荷",
    shapeLabel: "形状",
    imageLabel: "图片",
    preview: "预览",
    resetImage: "还原载入图",
    result: "结果",
    empty: "未选择图片",
    footer: "DWT-DCT-SVD / MIT",
    ready: "就绪",
    unsupported: "不支持这个图片格式",
    loading: "正在读取图片...",
    chooseFirst: "请先选择图片。",
    embedding: "正在嵌入...",
    extracting: "正在提取...",
    processing: "正在处理...",
    embedded: "已嵌入水印。",
    extracted: "已提取水印。",
    platformEmbedded: "已生成平台水印。",
    platformDecoded: "已识别平台水印。",
    platformNotFound: "没有找到可信的平台水印。",
    platformUnavailable: "平台 API 不可用。请运行 python3 platform_server.py 并打开这个本地服务。",
    processed: "处理完成。",
    errorTitle: "处理失败",
    noDownloadTitle: "没有可下载文件",
    noDownloadBody: "请先执行会生成图片的操作。",
    close: "关闭",
  },
};

const state = {
  page: "embed",
  wmMode: "str",
  language: localStorage.getItem("watermark-language") || "zh",
  sourceImageData: null,
  currentImageData: null,
  watermarkImageData: null,
  referenceImageData: null,
  fileName: "image",
  toastTimer: null,
  lastMeta: null,
};

worker.onmessage = (event) => {
  const { id, ok, result, error } = event.data;
  const deferred = pending.get(id);
  if (!deferred) return;
  pending.delete(id);
  if (ok) deferred.resolve(result);
  else deferred.reject(new Error(error));
};

document.querySelectorAll("[data-page]").forEach((button) => {
  button.addEventListener("click", () => setPage(button.dataset.page));
});

elements.watermarkModeGroup.addEventListener("click", (event) => {
  const button = event.target.closest("[data-wm-mode]");
  if (button) setWatermarkMode(button.dataset.wmMode);
});

elements.langEn.addEventListener("click", () => setLanguage("en"));
elements.langZh.addEventListener("click", () => setLanguage("zh"));
elements.fileInput.addEventListener("change", () => loadSelectedFile(elements.fileInput.files?.[0], "main"));
elements.watermarkImageInput.addEventListener("change", () => loadSelectedFile(elements.watermarkImageInput.files?.[0], "watermark"));
elements.referenceInput.addEventListener("change", () => loadSelectedFile(elements.referenceInput.files?.[0], "reference"));
elements.platformAction.addEventListener("change", updateControls);
elements.platformTargetType.addEventListener("change", updateControls);
elements.platformPayloadMode.addEventListener("change", updateControls);
elements.attackType.addEventListener("change", updateControls);
elements.runButton.addEventListener("click", run);
elements.downloadLink.addEventListener("click", handleDownloadClick);
elements.resultDownloadLink.addEventListener("click", handleResultDownloadClick);
elements.resetImageButton.addEventListener("click", resetImage);
elements.toastClose.addEventListener("click", hideToast);

for (const eventName of ["dragenter", "dragover"]) {
  elements.dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropzone.classList.add("is-over");
  });
}

for (const eventName of ["dragleave", "drop"]) {
  elements.dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropzone.classList.remove("is-over");
  });
}

elements.dropzone.addEventListener("drop", (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (file) loadSelectedFile(file, "main");
});

setLanguage(state.language);
setPage("embed");
setWatermarkMode("str");
setDownloadReady(elements.downloadLink, false);
setDownloadReady(elements.resultDownloadLink, false);
clearResult();

async function loadSelectedFile(file, role) {
  if (!file) return;
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    setStatus(t("unsupported"), true);
    return;
  }

  try {
    setStatus(t("loading"));
    const imageData = await fileToImageData(file);
    if (role === "main") {
      state.sourceImageData = cloneImageData(imageData);
      state.currentImageData = cloneImageData(imageData);
      state.fileName = file.name.replace(/\.[^.]+$/, "") || "image";
      drawPreview(state.currentImageData);
      elements.fileMeta.textContent = `${file.name} / ${imageData.width} x ${imageData.height}`;
      elements.imageInfo.textContent = `${imageData.width} x ${imageData.height}`;
      elements.targetWidth.value = imageData.width;
      elements.targetHeight.value = imageData.height;
      setDownloadReady(elements.downloadLink, false);
      clearResult();
    } else if (role === "watermark") {
      state.watermarkImageData = imageData;
      elements.watermarkImageMeta.textContent = `${file.name} / ${imageData.width} x ${imageData.height}`;
      elements.wmWidth.value = imageData.width;
      elements.wmHeight.value = imageData.height;
    } else {
      state.referenceImageData = imageData;
      elements.referenceMeta.textContent = `${file.name} / ${imageData.width} x ${imageData.height}`;
      elements.targetWidth.value = imageData.width;
      elements.targetHeight.value = imageData.height;
    }
    setStatus(file.name);
  } catch (error) {
    setStatus(error.message || t("errorTitle"), true);
    showToast(t("errorTitle"), error.message || t("errorTitle"), true);
  }
}

async function fileToImageData(file) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

async function dataUrlToImageData(dataUrl) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return fileToImageData(blob);
}

async function imageDataToDataUrl(imageData, mime = "image/png") {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  canvas.getContext("2d").putImageData(imageData, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not encode image."));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("Could not read encoded image."));
      reader.readAsDataURL(blob);
    }, mime, mime === "image/jpeg" ? 0.94 : undefined);
  });
}

async function run() {
  if (!state.currentImageData) {
    setStatus(t("chooseFirst"), true);
    showToast(t("errorTitle"), t("chooseFirst"), true);
    return;
  }

  setBusy(true);
  try {
    if (state.page === "embed") await runEmbed();
    if (state.page === "extract") await runExtract();
    if (state.page === "platform") await runPlatform();
    if (state.page === "attack") await runAttack();
  } catch (error) {
    setStatus(error.message || t("errorTitle"), true);
    showToast(t("errorTitle"), error.message || t("errorTitle"), true);
  } finally {
    setBusy(false);
  }
}

async function runEmbed() {
  setStatus(t("embedding"));
  clearResult();
  const result = await callWorker("embed", {
    imageData: cloneImageData(state.currentImageData),
    wmMode: state.wmMode,
    text: elements.watermarkText.value.trim(),
    bitString: elements.bitString.value,
    watermarkImageData: state.watermarkImageData ? cloneImageData(state.watermarkImageData) : null,
    passwordImg: elements.passwordImg.value || "1",
    passwordWm: elements.passwordWm.value || "1",
  });

  state.currentImageData = result.imageData;
  state.lastMeta = result;
  drawPreview(result.imageData);
  await prepareDownload(elements.downloadLink, result.imageData, "watermarked");
  syncExtractFields(result);
  updateFacts(result);
  setStatus(t("embedded"));
  setResultText(formatEmbedResult(result));
}

async function runExtract() {
  setStatus(t("extracting"));
  setDownloadReady(elements.resultDownloadLink, false);
  clearResult();
  const payload = {
    imageData: cloneImageData(state.currentImageData),
    wmMode: state.wmMode,
    passwordImg: elements.passwordImg.value || "1",
    passwordWm: elements.passwordWm.value || "1",
  };

  if (state.wmMode === "img") {
    payload.wmShape = [Number.parseInt(elements.wmWidth.value, 10), Number.parseInt(elements.wmHeight.value, 10)];
  } else if (state.wmMode !== "id") {
    payload.bitLength = Number.parseInt(elements.bitLength.value, 10);
  }

  const result = await callWorker("extract", payload);
  updateFacts(result);

  if (result.imageData) {
    drawResultImage(result.imageData);
    await prepareDownload(elements.resultDownloadLink, result.imageData, "extracted-watermark");
  }

  setResultText(formatExtractResult(result));
  setStatus(t("extracted"));
}

async function runAttack() {
  setStatus(t("processing"));
  clearResult();
  const result = await callWorker("attack", {
    imageData: cloneImageData(state.currentImageData),
    referenceImageData: state.referenceImageData ? cloneImageData(state.referenceImageData) : null,
    attackType: elements.attackType.value,
    params: readAttackParams(),
  });

  state.currentImageData = result.imageData;
  drawPreview(result.imageData);
  await prepareDownload(elements.downloadLink, result.imageData, result.suffix || "processed");
  updateFacts({
    bitLength: state.lastMeta?.bitLength,
    wmShape: state.lastMeta?.wmShape,
    width: result.imageData.width,
    height: result.imageData.height,
    summary: result.summary,
  });
  setResultText(formatAttackResult(result));
  setStatus(t("processed"));
}

async function runPlatform() {
  if (elements.platformAction.value === "decode") {
    await runPlatformDecode();
  } else {
    await runPlatformEmbed();
  }
}

async function runPlatformEmbed() {
  setStatus(t("embedding"));
  clearResult();
  const payloadMode = elements.platformPayloadMode.value;
  const result = await callPlatformApi("/api/watermark/embed", {
    image_data: await imageDataToDataUrl(state.currentImageData, elements.outputFormat.value),
    output_mime: elements.outputFormat.value,
    payload_mode: payloadMode,
    direct_text: elements.platformDirectText.value.trim(),
    item: readPlatformItem(),
  });

  const imageData = await dataUrlToImageData(result.image_data);
  state.currentImageData = imageData;
  state.lastMeta = {
    mode: "id",
    bitLength: result.code_bits || result.bit_length,
    summary: result.code ? `${result.code} / ${result.payload_mode}` : result.payload_mode,
    watermarkId: result.code,
    width: imageData.width,
    height: imageData.height,
  };
  drawPreview(imageData);
  await prepareDownload(elements.downloadLink, imageData, "platform-watermarked");
  updateFacts(state.lastMeta);
  setResultText(formatPlatformEmbedResult(result));
  setStatus(t("platformEmbedded"));
}

async function runPlatformDecode() {
  setStatus(t("extracting"));
  clearResult();
  const result = await callPlatformApi("/api/watermark/decode", {
    image_data: await imageDataToDataUrl(state.currentImageData, "image/png"),
    payload_mode: "platform_id",
    min_confidence: Number.parseFloat(elements.platformMinConfidence.value || "0.58"),
  });
  updateFacts({
    bitLength: 64,
    summary: result.code || result.status,
    width: state.currentImageData.width,
    height: state.currentImageData.height,
  });
  setResultText(formatPlatformDecodeResult(result));
  setStatus(result.status === "found" ? t("platformDecoded") : t("platformNotFound"), result.status !== "found");
}

function readPlatformItem() {
  const targetType = elements.platformTargetType.value;
  return {
    target_type: targetType,
    title: elements.platformTitle.value.trim(),
    target_url: elements.platformTargetUrl.value.trim(),
    qr_payload: elements.platformQrPayload.value.trim(),
  };
}

async function callPlatformApi(path, payload) {
  let response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new Error(t("platformUnavailable"));
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || t("platformUnavailable"));
  return body;
}

function readAttackParams() {
  const ids = [
    "cropX1",
    "cropY1",
    "cropX2",
    "cropY2",
    "scale",
    "resizeWidth",
    "resizeHeight",
    "targetWidth",
    "targetHeight",
    "brightnessRatio",
    "shelterRatio",
    "shelterCount",
    "saltRatio",
    "randomSeed",
    "angle",
    "estimateMinScale",
    "estimateMaxScale",
    "estimateSteps",
  ];
  const params = {};
  ids.forEach((id) => {
    params[id] = document.getElementById(id).value;
  });
  return params;
}

function callWorker(action, payload) {
  const id = crypto.randomUUID();
  const promise = new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
  worker.postMessage({ id, action, payload });
  return promise;
}

function syncExtractFields(result) {
  if (result.mode === "img" && result.wmShape) {
    elements.wmWidth.value = result.wmShape[0];
    elements.wmHeight.value = result.wmShape[1];
  } else if (result.mode === "id") {
    elements.bitLength.value = 64;
  } else {
    elements.bitLength.value = result.bitLength || "";
  }
}

function updateFacts(result = {}) {
  const payload = result.watermarkId || result.summary || (result.bitLength ? `${result.bitLength} bits` : "-");
  elements.payloadInfo.textContent = payload || "-";
  elements.shapeInfo.textContent = result.wmShape ? result.wmShape.join(" x ") : result.bitLength ? `${result.bitLength}` : "-";
  elements.imageInfo.textContent = result.width && result.height ? `${result.width} x ${result.height}` : elements.imageInfo.textContent || "-";
}

function formatEmbedResult(result) {
  const lines = [
    `${t("payloadLabel")}: ${result.summary || `${result.bitLength} bits`}`,
    `${t("shapeLabel")}: ${result.wmShape ? result.wmShape.join(" x ") : result.bitLength}`,
    `${t("imageLabel")}: ${result.width} x ${result.height}`,
  ];
  if (result.watermarkId) lines.push(`ID: ${result.watermarkId}`);
  return lines.join("\n");
}

function formatExtractResult(result) {
  const lines = [
    `${t("payloadLabel")}: ${result.bitLength || (result.wmShape ? result.wmShape.join(" x ") : "-")}`,
    `${t("imageLabel")}: ${result.width} x ${result.height}`,
    `confidence: ${result.confidence}%`,
  ];
  if (result.text !== undefined) lines.push(`text: ${result.text}`);
  if (result.watermarkId) lines.push(`ID: ${result.watermarkId}`);
  if (result.bits) lines.push(`bits: ${result.bits}`);
  if (result.rawScores?.length) lines.push(`raw: ${result.rawScores.join(" ")}`);
  return lines.join("\n");
}

function formatAttackResult(result) {
  const lines = [
    `${t("attackType")}: ${elements.attackType.options[elements.attackType.selectedIndex].textContent}`,
    `${t("imageLabel")}: ${result.imageData.width} x ${result.imageData.height}`,
  ];
  if (result.summary) lines.push(result.summary);
  return lines.join("\n");
}

function formatPlatformEmbedResult(result) {
  if (result.payload_mode === "direct_text") {
    return [
      `${t("platformPayloadMode")}: ${t("platformDirectText")}`,
      `${t("bitLength")}: ${result.bit_length}`,
      "robustness: low",
      `algorithm: ${result.algorithm}`,
    ].join("\n");
  }
  const lines = [
    `${t("platformPayloadMode")}: ${t("platformShortId")}`,
    `code: ${result.code}`,
    `resolve: ${new URL(result.resolve_url, window.location.href).href}`,
    `algorithm: ${result.algorithm}`,
    `ecc: ${result.ecc_level}`,
  ];
  if (result.item?.title) lines.push(`title: ${result.item.title}`);
  if (result.item?.target_url) lines.push(`url: ${result.item.target_url}`);
  if (result.item?.qr_payload) lines.push(`payload: ${result.item.qr_payload}`);
  return lines.join("\n");
}

function formatPlatformDecodeResult(result) {
  const lines = [
    `status: ${result.status}`,
    `code: ${result.code || "-"}`,
    `confidence: ${result.confidence}%`,
  ];
  if (result.variant) lines.push(`variant: ${result.variant}`);
  if (result.status === "found" && result.item) {
    lines.push(`title: ${result.item.title || "-"}`);
    if (result.item.target_url) lines.push(`open: ${result.item.target_url}`);
    if (result.item.qr_payload) lines.push(`payload: ${result.item.qr_payload}`);
  }
  return lines.join("\n");
}

async function prepareDownload(link, imageData, suffix) {
  const isResult = link === elements.resultDownloadLink;
  const mime = isResult ? "image/png" : elements.outputFormat.value;
  const extension = mime.split("/")[1].replace("jpeg", "jpg");
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = imageData.width;
  outputCanvas.height = imageData.height;
  outputCanvas.getContext("2d").putImageData(imageData, 0, 0);

  const blob = await new Promise((resolve) => {
    outputCanvas.toBlob(resolve, mime, mime === "image/jpeg" ? 0.94 : undefined);
  });
  if (!blob) throw new Error("Could not encode output image.");

  if (link.href) URL.revokeObjectURL(link.href);
  link.href = URL.createObjectURL(blob);
  link.download = `${state.fileName}-${suffix}.${extension}`;
  setDownloadReady(link, true);
}

function drawPreview(imageData) {
  elements.previewCanvas.width = imageData.width;
  elements.previewCanvas.height = imageData.height;
  previewCtx.putImageData(imageData, 0, 0);
  elements.emptyState.classList.add("is-hidden");
}

function drawResultImage(imageData) {
  elements.resultCanvas.width = imageData.width;
  elements.resultCanvas.height = imageData.height;
  resultCtx.putImageData(imageData, 0, 0);
  elements.resultCanvas.classList.add("has-image");
}

function resetImage() {
  if (!state.sourceImageData) return;
  state.currentImageData = cloneImageData(state.sourceImageData);
  drawPreview(state.currentImageData);
  setDownloadReady(elements.downloadLink, false);
  updateFacts({ width: state.currentImageData.width, height: state.currentImageData.height, summary: state.lastMeta?.summary, bitLength: state.lastMeta?.bitLength, wmShape: state.lastMeta?.wmShape });
  setStatus(t("ready"));
}

function clearResult() {
  setResultText("-");
  elements.resultCanvas.width = 320;
  elements.resultCanvas.height = 180;
  resultCtx.clearRect(0, 0, elements.resultCanvas.width, elements.resultCanvas.height);
  elements.resultCanvas.classList.remove("has-image");
  setDownloadReady(elements.resultDownloadLink, false);
}

function setResultText(text) {
  document.getElementById("resultText").textContent = text;
}

function setPage(page) {
  state.page = page;
  document.querySelectorAll("[data-page]").forEach((button) => {
    const isActive = button.dataset.page === page;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });
  elements.runButton.textContent = actionLabelForPage(page);
  updateControls();
  setStatus(t("ready"));
}

function actionLabelForPage(page) {
  if (page === "embed") return t("embedAction");
  if (page === "extract") return t("extractAction");
  if (page === "platform") {
    return elements.platformAction.value === "decode" ? t("platformDecodeAction") : t("platformEmbedAction");
  }
  return t("attackAction");
}

function setWatermarkMode(mode) {
  state.wmMode = mode;
  document.querySelectorAll("[data-wm-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.wmMode === mode);
  });
  if (mode === "id") elements.bitLength.value = 64;
  updateControls();
}

function updateControls() {
  const page = state.page;
  document.querySelectorAll(".embed-only, .extract-only, .platform-only, .attack-only, .watermark-only, .watermark-controls, .text-mode, .img-mode, .bit-mode, .id-mode").forEach((node) => {
    let hidden = false;
    if (node.classList.contains("embed-only") && page !== "embed") hidden = true;
    if (node.classList.contains("extract-only") && page !== "extract") hidden = true;
    if (node.classList.contains("platform-only") && page !== "platform") hidden = true;
    if (node.classList.contains("attack-only") && page !== "attack") hidden = true;
    if ((node.classList.contains("watermark-only") || node.classList.contains("watermark-controls")) && (page === "attack" || page === "platform")) hidden = true;

    const modeMatches = [];
    if (node.classList.contains("text-mode")) modeMatches.push("str");
    if (node.classList.contains("img-mode")) modeMatches.push("img");
    if (node.classList.contains("bit-mode")) modeMatches.push("bit");
    if (node.classList.contains("id-mode")) modeMatches.push("id");
    if (modeMatches.length && !modeMatches.includes(state.wmMode)) hidden = true;

    setHidden(node, hidden);
  });

  const attackType = elements.attackType.value;
  const attackMap = {
    "crop-param": attackType === "crop",
    "recover-crop-param": attackType === "recoverCrop",
    "estimate-param": attackType === "estimateCrop",
    "resize-param": attackType === "resize",
    "recover-resize-param": attackType === "recoverResize",
    "brightness-param": attackType === "brightness",
    "recover-brightness-param": attackType === "recoverBrightness",
    "shelter-param": attackType === "shelter",
    "salt-param": attackType === "saltPepper",
    "rotate-param": attackType === "rotate",
    "recover-rotate-param": attackType === "recoverRotate",
  };
  Object.entries(attackMap).forEach(([className, visible]) => {
    document.querySelectorAll(`.${className}`).forEach((node) => setHidden(node, page !== "attack" || !visible));
  });

  const platformAction = elements.platformAction.value;
  const targetType = elements.platformTargetType.value;
  const payloadMode = elements.platformPayloadMode.value;
  document.querySelectorAll(".platform-embed-param").forEach((node) => setHidden(node, page !== "platform" || platformAction !== "embed"));
  document.querySelectorAll(".platform-decode-param").forEach((node) => setHidden(node, page !== "platform" || platformAction !== "decode"));
  document.querySelectorAll(".platform-url-param").forEach((node) => setHidden(node, page !== "platform" || platformAction !== "embed" || payloadMode === "direct_text" || targetType !== "url"));
  document.querySelectorAll(".platform-qr-param, .platform-text-param").forEach((node) => setHidden(node, page !== "platform" || platformAction !== "embed" || payloadMode === "direct_text" || !["qr", "text"].includes(targetType)));
  document.querySelectorAll(".platform-direct-param").forEach((node) => setHidden(node, page !== "platform" || platformAction !== "embed" || payloadMode !== "direct_text"));
  elements.runButton.textContent = actionLabelForPage(page);
}

function setHidden(node, hidden) {
  node.classList.toggle("is-hidden", hidden);
}

function setLanguage(language) {
  state.language = translations[language] ? language : "zh";
  localStorage.setItem("watermark-language", state.language);
  document.documentElement.lang = state.language === "zh" ? "zh-CN" : "en";
  elements.langEn.classList.toggle("is-active", state.language === "en");
  elements.langZh.classList.toggle("is-active", state.language === "zh");

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  });
  document.querySelectorAll("[data-i18n-option]").forEach((element) => {
    element.textContent = t(element.dataset.i18nOption);
  });

  elements.toastClose.setAttribute("aria-label", t("close"));
  elements.runButton.textContent = actionLabelForPage(state.page);
  if (!elements.downloadLink.classList.contains("is-downloading")) elements.downloadLink.textContent = t("download");
  if (!elements.resultDownloadLink.classList.contains("is-downloading")) elements.resultDownloadLink.textContent = t("downloadResult");
}

function t(key) {
  return translations[state.language][key] || translations.en[key] || key;
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle("is-error", isError);
}

function setBusy(isBusy) {
  elements.runButton.disabled = isBusy;
  [
    elements.fileInput,
    elements.watermarkText,
    elements.watermarkImageInput,
    elements.bitString,
    elements.bitLength,
    elements.wmWidth,
    elements.wmHeight,
    elements.passwordImg,
    elements.passwordWm,
    elements.outputFormat,
    elements.platformAction,
    elements.platformTargetType,
    elements.platformTitle,
    elements.platformTargetUrl,
    elements.platformQrPayload,
    elements.platformPayloadMode,
    elements.platformDirectText,
    elements.platformMinConfidence,
    elements.attackType,
    elements.referenceInput,
  ].forEach((element) => {
    element.disabled = isBusy;
  });
}

function setDownloadReady(link, isReady) {
  if (!isReady && link.href) {
    URL.revokeObjectURL(link.href);
    link.removeAttribute("href");
  }
  link.classList.toggle("is-disabled", !isReady);
  link.classList.remove("is-downloading");
  link.setAttribute("aria-disabled", String(!isReady));
  link.textContent = link === elements.resultDownloadLink ? t("downloadResult") : t("download");
}

function handleDownloadClick(event) {
  handleAnyDownloadClick(event, elements.downloadLink, t("download"));
}

function handleResultDownloadClick(event) {
  handleAnyDownloadClick(event, elements.resultDownloadLink, t("downloadResult"));
}

function handleAnyDownloadClick(event, link, label) {
  if (link.classList.contains("is-disabled") || !link.href) {
    event.preventDefault();
    showToast(t("noDownloadTitle"), t("noDownloadBody"), true);
    return;
  }
  link.classList.add("is-downloading");
  link.setAttribute("aria-disabled", "true");
  link.textContent = t("downloading");
  window.setTimeout(() => {
    link.classList.remove("is-downloading");
    link.setAttribute("aria-disabled", "false");
    link.textContent = label;
  }, 1200);
}

function showToast(title, body, isError = false) {
  window.clearTimeout(state.toastTimer);
  elements.toastTitle.textContent = title;
  elements.toastBody.textContent = body;
  elements.toast.classList.toggle("is-error", isError);
  elements.toast.classList.add("is-visible");
  elements.toast.setAttribute("aria-hidden", "false");
  state.toastTimer = window.setTimeout(hideToast, isError ? 6000 : 8000);
}

function hideToast() {
  window.clearTimeout(state.toastTimer);
  elements.toast.classList.remove("is-visible");
  elements.toast.setAttribute("aria-hidden", "true");
}

function cloneImageData(imageData) {
  return new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
}
