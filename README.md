# free invisible photo watermark

Project badges:

[![Website](https://img.shields.io/website?url=https%3A%2F%2Fwatermark.yeangzi.com&label=website)](https://watermark.yeangzi.com)
[![Vercel](https://img.shields.io/badge/deploy-Vercel-000000?logo=vercel)](https://watermark.yeangzi.com)
[![License](https://img.shields.io/github/license/angziii/free-invisible-photo-watermark)](LICENSE)
[![Top language](https://img.shields.io/github/languages/top/angziii/free-invisible-photo-watermark)](https://github.com/angziii/free-invisible-photo-watermark)
[![Repo size](https://img.shields.io/github/repo-size/angziii/free-invisible-photo-watermark)](https://github.com/angziii/free-invisible-photo-watermark)
[![Stars](https://img.shields.io/github/stars/angziii/free-invisible-photo-watermark?style=social)](https://github.com/angziii/free-invisible-photo-watermark/stargazers)
[![Forks](https://img.shields.io/github/forks/angziii/free-invisible-photo-watermark?style=social)](https://github.com/angziii/free-invisible-photo-watermark/forks)
![Browser only](https://img.shields.io/badge/runtime-browser--only-006c67)
![Local processing](https://img.shields.io/badge/privacy-local%20processing-006c67)

A browser workspace and local platform MVP for embedding, extracting, and stress-testing invisible photo watermarks.

Live site: [watermark.yeangzi.com](https://watermark.yeangzi.com)

中文说明：[README_cn.md](README_cn.md)

![free invisible photo watermark interface](docs/打上水印的图.jpg)

## What it does

- Embeds and extracts text watermarks, image watermarks, raw bit watermarks, and short 64-bit ID watermarks.
- Adds a local platform API that stores a URL/QR/text item, embeds only a short ID, and resolves `/r/<code>` back to the saved content.
- Supports the README-style extraction metadata: text/bit payload length and image watermark width/height.
- Keeps image processing on the user's device. No image upload or server-side processing is required.
- Supports separate image and watermark passwords.
- Includes an attack lab for crop, resize, brightness, shelter, salt-and-pepper noise, rotation, and common recovery steps.
- Includes English and Chinese UI.

## Payload size

Short payloads remain more robust because each bit can be repeated more often across the image. Text and image watermarks are recoverable now, but they need more bits than a 64-bit ID and can degrade sooner under heavy cropping, compression, resizing, brightness changes, and other edits.

## How it works

The browser implementation follows the same core idea as the original `blind_watermark` project:

1. Convert image channels into a luminance/color representation.
2. Apply Haar DWT.
3. Split the low-frequency area into 4 x 4 blocks.
4. Use DCT and SVD to embed or extract one watermark bit per block.
5. Repeat the 64-bit payload across blocks and channels for redundancy.

The original upstream project is Python-based and MIT licensed:

- Documentation: [BlindWatermark.github.io/blind_watermark](https://blindwatermark.github.io/blind_watermark/#/en/)
- Source: [github.com/guofei9987/blind_watermark](https://github.com/guofei9987/blind_watermark)

## Local development

For the browser-only demo, any simple HTTP server works:

```bash
python3 -m http.server 4175
```

Then open:

```text
http://localhost:4175
```

Core files:

- `index.html` - app shell
- `assets/app.css` - UI styles
- `assets/app.js` - browser UI, i18n, download, extraction, and attack flow
- `assets/watermark-worker.js` - DWT-DCT-SVD watermark, extraction, and image attack implementation
- `vercel.json` - Vercel static deployment config

For the platform MVP, run the local API/static server:

```bash
python3 platform_server.py --port 4175
```

Then open:

```text
http://localhost:4175
```

Platform endpoints:

- `POST /api/items` - create a saved URL/QR/text item and 64-bit code.
- `POST /api/watermark/embed` - embed the platform code into an image.
- `POST /api/watermark/decode` - decode an uploaded image and return `found` or `not_found`.
- `GET /r/<code>` - resolve a code to the saved target.

## Deployment

The production deployment is hosted on Vercel:

[https://watermark.yeangzi.com](https://watermark.yeangzi.com)

Deploy from the project root:

```bash
npx vercel --prod --yes
```

## Limitations

Invisible watermarks are not magic. The watermark is most reliable when the image is not heavily transformed. Rotating back to the original orientation, preserving the original crop position, and avoiding aggressive recompression all improve extraction quality.

## License

This repository keeps the upstream MIT license from `blind_watermark`. See [LICENSE](LICENSE).
