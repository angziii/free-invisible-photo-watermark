# free invisible photo watermark

A lightweight browser-only tool for adding and verifying invisible photo watermarks.

Live site: [watermark.yeangzi.com](https://watermark.yeangzi.com)

![free invisible photo watermark interface](docs/打上水印的图.jpg)

## What it does

- Embeds an invisible 64-bit watermark ID into PNG, JPEG, and WebP images.
- Verifies a watermarked image locally in the browser.
- Keeps image processing on the user's device. No image upload or server-side processing is required.
- Supports an optional secret key. Use the same key for embedding and verification.
- Includes English and Chinese UI.

## Why 64-bit

This app stores a fixed 64-bit ID derived from the user's watermark line. The ID is short, so each bit can be repeated many times across the image, which improves robustness.

Recovering the original text directly would require embedding the text itself:

- ASCII text usually costs about 8 bits per character.
- Chinese text in UTF-8 usually costs about 24 bits per character.
- Length metadata and error correction add even more bits.

Longer payloads are easier to damage through cropping, compression, resizing, brightness changes, and other edits. For that reason this app verifies the watermark ID instead of trying to restore arbitrary original text.

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

This site is static. Any simple HTTP server works:

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
- `assets/app.js` - browser UI, i18n, download and verification flow
- `assets/watermark-worker.js` - DWT-DCT-SVD watermark implementation
- `vercel.json` - Vercel static deployment config

## Deployment

The production deployment is hosted on Vercel:

[https://watermark.yeangzi.com](https://watermark.yeangzi.com)

Deploy from the project root:

```bash
npx vercel --prod --yes
```

## Limitations

Invisible watermarks are not magic. The watermark is most reliable when the image is not heavily transformed. Rotating back to the original orientation, preserving the original crop position, and avoiding aggressive recompression all improve verification.

The current app verifies a 64-bit ID. It does not decrypt or restore arbitrary original text.

## License

This repository keeps the upstream MIT license from `blind_watermark`. See [LICENSE](LICENSE).
