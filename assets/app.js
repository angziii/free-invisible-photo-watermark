const fileInput = document.getElementById("fileInput");
const dropzone = document.getElementById("dropzone");
const watermarkText = document.getElementById("watermarkText");
const secretKey = document.getElementById("secretKey");
const outputFormat = document.getElementById("outputFormat");
const statusEl = document.getElementById("status");
const runButton = document.getElementById("runButton");
const downloadLink = document.getElementById("downloadLink");
const watermarkId = document.getElementById("watermarkId");
const imageInfo = document.getElementById("imageInfo");
const canvas = document.getElementById("previewCanvas");
const emptyState = document.getElementById("emptyState");
const embedTab = document.getElementById("embedTab");
const verifyTab = document.getElementById("verifyTab");
const langEn = document.getElementById("langEn");
const langZh = document.getElementById("langZh");
const toast = document.getElementById("toast");
const toastTitle = document.getElementById("toastTitle");
const toastBody = document.getElementById("toastBody");
const toastClose = document.getElementById("toastClose");

const ctx = canvas.getContext("2d", { willReadFrequently: true });
const worker = new Worker("/assets/watermark-worker.js");
const pending = new Map();
const translations = {
  en: {
    eyebrow: "free invisible photo watermark",
    title: "Invisible photo watermark",
    tabEmbed: "Embed",
    tabVerify: "Verify",
    choosePhoto: "Choose photo",
    watermarkLine: "Watermark line",
    watermarkPlaceholder: "name, email, order id",
    watermarkHint: "This site embeds a fixed 64-bit ID. Recoverable text needs more encrypted bits as text grows, so longer text is easier to damage.",
    secretKey: "Secret key",
    secretHint: "Optional. Use the same key when embedding and verifying. Blank uses 1.",
    output: "Output",
    embedAction: "Embed watermark",
    verifyAction: "Verify watermark",
    download: "Download",
    downloading: "Downloading...",
    idLabel: "64-bit ID",
    imageLabel: "Image",
    empty: "No photo selected",
    footer: "Browser-only DWT-DCT-SVD implementation based on the MIT licensed blind_watermark project.",
    ready: "Ready",
    unsupported: "Unsupported image type",
    loading: "Loading image...",
    chooseFirst: "Choose a photo first",
    enterLine: "Enter one watermark line",
    embedding: "Embedding...",
    embedded: "Embedded. Download is ready.",
    verifying: "Verifying...",
    verified: "Watermark ID {id} · Confidence {confidence}%",
    verifyTitle: "Verification result",
    verifyBody: "Watermark ID: {id}\nConfidence: {confidence}%",
    errorTitle: "Could not process image",
    noDownloadTitle: "No download yet",
    noDownloadBody: "Embed a watermark first, then download the output image.",
    close: "Close",
  },
  zh: {
    eyebrow: "free invisible photo watermark",
    title: "隐形照片水印",
    tabEmbed: "加水印",
    tabVerify: "验证",
    choosePhoto: "选择照片",
    watermarkLine: "水印文本",
    watermarkPlaceholder: "姓名、邮箱、订单号",
    watermarkHint: "本站默认嵌入固定 64-bit ID。可还原原文时，文字越长需要加密的 bit 越多，也越容易被破坏。",
    secretKey: "密钥",
    secretHint: "可不填。不填时使用 1；验证时必须使用和加水印时相同的密钥。",
    output: "输出格式",
    embedAction: "加水印",
    verifyAction: "验证水印",
    download: "下载",
    downloading: "正在下载...",
    idLabel: "64-bit ID",
    imageLabel: "图片",
    empty: "未选择照片",
    footer: "基于 MIT 许可的 blind_watermark 项目，在浏览器本地运行 DWT-DCT-SVD 实现。",
    ready: "就绪",
    unsupported: "不支持这个图片格式",
    loading: "正在读取图片...",
    chooseFirst: "请先选择照片",
    enterLine: "请输入一行水印文本",
    embedding: "正在加水印...",
    embedded: "已加水印，可以下载。",
    verifying: "正在验证...",
    verified: "水印 ID {id} · 置信度 {confidence}%",
    verifyTitle: "验证结果",
    verifyBody: "水印 ID：{id}\n置信度：{confidence}%",
    errorTitle: "图片处理失败",
    noDownloadTitle: "还没有可下载图片",
    noDownloadBody: "请先加水印，再下载输出图片。",
    close: "关闭",
  },
};

let mode = "embed";
let loadedFile = null;
let loadedImageData = null;
let objectUrl = null;
let currentLanguage = localStorage.getItem("watermark-language") || "en";
let toastTimer = null;

worker.onmessage = (event) => {
  const { id, ok, result, error } = event.data;
  const deferred = pending.get(id);
  if (!deferred) return;
  pending.delete(id);
  if (ok) deferred.resolve(result);
  else deferred.reject(new Error(error));
};

embedTab.addEventListener("click", () => setMode("embed"));
verifyTab.addEventListener("click", () => setMode("verify"));
langEn.addEventListener("click", () => setLanguage("en"));
langZh.addEventListener("click", () => setLanguage("zh"));
fileInput.addEventListener("change", () => loadSelectedFile(fileInput.files?.[0]));
runButton.addEventListener("click", run);
downloadLink.addEventListener("click", handleDownloadClick);
toastClose.addEventListener("click", hideToast);

for (const eventName of ["dragenter", "dragover"]) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("is-over");
  });
}

for (const eventName of ["dragleave", "drop"]) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-over");
  });
}

dropzone.addEventListener("drop", (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (file) loadSelectedFile(file);
});

setLanguage(currentLanguage);
setDownloadReady(false);

function setMode(nextMode) {
  mode = nextMode;
  const isEmbed = mode === "embed";
  document.body.classList.toggle("verify-mode", !isEmbed);
  embedTab.classList.toggle("is-active", isEmbed);
  verifyTab.classList.toggle("is-active", !isEmbed);
  embedTab.setAttribute("aria-selected", String(isEmbed));
  verifyTab.setAttribute("aria-selected", String(!isEmbed));
  runButton.textContent = isEmbed ? t("embedAction") : t("verifyAction");
  watermarkId.textContent = "-";
  setStatus(t("ready"));
}

async function loadSelectedFile(file) {
  if (!file) return;
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    setStatus(t("unsupported"), true);
    return;
  }

  loadedFile = file;
  setDownloadReady(false);
  watermarkId.textContent = "-";
  setStatus(t("loading"));

  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);

  try {
    const bitmap = await createImageBitmap(file);
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    loadedImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    emptyState.classList.add("is-hidden");
    imageInfo.textContent = `${bitmap.width} x ${bitmap.height}`;
    setStatus(`${file.name}`);
    bitmap.close?.();
  } catch (error) {
    loadedImageData = null;
    imageInfo.textContent = "-";
    setStatus(error.message || "Could not load image", true);
    showToast(t("errorTitle"), error.message || "Could not load image", true);
  }
}

async function run() {
  if (!loadedImageData) {
    setStatus(t("chooseFirst"), true);
    showToast(t("errorTitle"), t("chooseFirst"), true);
    return;
  }

  if (mode === "embed" && !watermarkText.value.trim()) {
    setStatus(t("enterLine"), true);
    watermarkText.focus();
    return;
  }

  const password = secretKey.value.trim() || "1";
  setBusy(true);

  try {
    if (mode === "embed") {
      setStatus(t("embedding"));
      setDownloadReady(false);
      const result = await callWorker("embed", {
        imageData: cloneImageData(loadedImageData),
        watermarkText: watermarkText.value.trim(),
        password,
      });
      canvas.width = result.imageData.width;
      canvas.height = result.imageData.height;
      ctx.putImageData(result.imageData, 0, 0);
      loadedImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      watermarkId.textContent = result.watermarkId;
      imageInfo.textContent = `${result.width} x ${result.height}`;
      await prepareDownload(result.imageData);
      setStatus(t("embedded"));
    } else {
      setStatus(t("verifying"));
      const result = await callWorker("verify", {
        imageData: cloneImageData(loadedImageData),
        password,
      });
      watermarkId.textContent = result.watermarkId;
      imageInfo.textContent = `${result.width} x ${result.height}`;
      setStatus(formatMessage("verified", { id: result.watermarkId, confidence: result.confidence }));
      showToast(
        t("verifyTitle"),
        formatMessage("verifyBody", { id: result.watermarkId, confidence: result.confidence }),
      );
    }
  } catch (error) {
    setStatus(error.message || "Processing failed", true);
    showToast(t("errorTitle"), error.message || "Processing failed", true);
  } finally {
    setBusy(false);
  }
}

function callWorker(action, payload) {
  const id = crypto.randomUUID();
  const promise = new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
  worker.postMessage({ id, action, payload });
  return promise;
}

async function prepareDownload(imageData) {
  const mime = outputFormat.value;
  const extension = mime.split("/")[1].replace("jpeg", "jpg");
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = imageData.width;
  outputCanvas.height = imageData.height;
  outputCanvas.getContext("2d").putImageData(imageData, 0, 0);

  const blob = await new Promise((resolve) => {
    outputCanvas.toBlob(resolve, mime, mime === "image/jpeg" ? 0.94 : undefined);
  });
  if (!blob) throw new Error("Could not encode output image");

  if (downloadLink.href) URL.revokeObjectURL(downloadLink.href);
  const base = loadedFile?.name?.replace(/\.[^.]+$/, "") || "watermarked";
  downloadLink.href = URL.createObjectURL(blob);
  downloadLink.download = `${base}-watermarked.${extension}`;
  setDownloadReady(true);
}

function cloneImageData(imageData) {
  return new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", isError);
}

function setBusy(isBusy) {
  runButton.disabled = isBusy;
  fileInput.disabled = isBusy;
  watermarkText.disabled = isBusy;
  secretKey.disabled = isBusy;
  outputFormat.disabled = isBusy;
}

function setLanguage(language) {
  currentLanguage = translations[language] ? language : "en";
  localStorage.setItem("watermark-language", currentLanguage);
  document.documentElement.lang = currentLanguage === "zh" ? "zh-CN" : "en";
  langEn.classList.toggle("is-active", currentLanguage === "en");
  langZh.classList.toggle("is-active", currentLanguage === "zh");

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  });

  toastClose.setAttribute("aria-label", t("close"));
  runButton.textContent = mode === "embed" ? t("embedAction") : t("verifyAction");
  if (!downloadLink.classList.contains("is-downloading")) {
    downloadLink.textContent = t("download");
  }
  if (statusEl.textContent === "Ready" || statusEl.textContent === "就绪") {
    setStatus(t("ready"));
  }
}

function t(key) {
  return translations[currentLanguage][key] || translations.en[key] || key;
}

function formatMessage(key, values) {
  return t(key).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? "");
}

function setDownloadReady(isReady) {
  if (!isReady && downloadLink.href) {
    URL.revokeObjectURL(downloadLink.href);
    downloadLink.removeAttribute("href");
  }
  downloadLink.classList.toggle("is-disabled", !isReady);
  downloadLink.classList.remove("is-downloading");
  downloadLink.setAttribute("aria-disabled", String(!isReady));
  downloadLink.textContent = t("download");
}

function handleDownloadClick(event) {
  if (downloadLink.classList.contains("is-disabled") || !downloadLink.href) {
    event.preventDefault();
    showToast(t("noDownloadTitle"), t("noDownloadBody"), true);
    return;
  }

  downloadLink.classList.add("is-downloading");
  downloadLink.setAttribute("aria-disabled", "true");
  downloadLink.textContent = t("downloading");
  window.setTimeout(() => {
    downloadLink.classList.remove("is-downloading");
    downloadLink.setAttribute("aria-disabled", "false");
    downloadLink.textContent = t("download");
  }, 1200);
}

function showToast(title, body, isError = false) {
  window.clearTimeout(toastTimer);
  toastTitle.textContent = title;
  toastBody.textContent = body;
  toast.classList.toggle("is-error", isError);
  toast.classList.add("is-visible");
  toast.setAttribute("aria-hidden", "false");
  toastTimer = window.setTimeout(hideToast, isError ? 6000 : 8000);
}

function hideToast() {
  window.clearTimeout(toastTimer);
  toast.classList.remove("is-visible");
  toast.setAttribute("aria-hidden", "true");
}
