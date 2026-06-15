# free invisible photo watermark

基于浏览器本地处理的免费隐形照片水印工具，并带一个本地平台 MVP。

English README: [README.md](README.md)

在线网站：[watermark.yeangzi.com](https://watermark.yeangzi.com)

本项目徽章：

[![Website](https://img.shields.io/website?url=https%3A%2F%2Fwatermark.yeangzi.com&label=website)](https://watermark.yeangzi.com)
[![Vercel](https://img.shields.io/badge/deploy-Vercel-000000?logo=vercel)](https://watermark.yeangzi.com)
[![License](https://img.shields.io/github/license/angziii/free-invisible-photo-watermark)](LICENSE)
[![Top language](https://img.shields.io/github/languages/top/angziii/free-invisible-photo-watermark)](https://github.com/angziii/free-invisible-photo-watermark)
[![Repo size](https://img.shields.io/github/repo-size/angziii/free-invisible-photo-watermark)](https://github.com/angziii/free-invisible-photo-watermark)
[![Stars](https://img.shields.io/github/stars/angziii/free-invisible-photo-watermark?style=social)](https://github.com/angziii/free-invisible-photo-watermark/stargazers)
[![Forks](https://img.shields.io/github/forks/angziii/free-invisible-photo-watermark?style=social)](https://github.com/angziii/free-invisible-photo-watermark/forks)
![Browser only](https://img.shields.io/badge/runtime-browser--only-006c67)
![Local processing](https://img.shields.io/badge/privacy-local%20processing-006c67)

![free invisible photo watermark interface](docs/打上水印的图.jpg)

## 功能

- 给 PNG、JPEG、WebP 图片嵌入不可见的 64-bit 水印 ID。
- 在浏览器里验证带水印图片，提取 64-bit ID。
- 本地平台 API 可以保存网站、二维码内容或文本，只把短 ID 写入图片，再通过 `/r/<code>` 找回内容。
- 图片只在用户设备本地处理，不上传服务器。
- 支持可选密钥；加水印和验证时使用同一个密钥即可。
- 提供英文和中文界面。
- 支持下载 PNG、JPEG、WebP 输出图片。

## 为什么使用 64-bit

这个网站会把用户输入的一行水印文本转换成固定的 64-bit ID，再把这个 ID 嵌入图片。ID 较短，每个 bit 可以在图片中重复更多次，因此更稳。

如果要从图片里直接还原原始文字，就必须把原文全部嵌入：

- 英文、数字通常约 `8 bit / 字符`。
- 中文使用 UTF-8 时通常约 `24 bit / 字`。
- 实际还需要长度信息，最好还要加纠错码。

文字越长，需要嵌入的 bit 越多；每个 bit 能重复的次数越少，也就越容易被裁剪、压缩、缩放、亮度变化等操作破坏。所以当前版本默认验证 64-bit ID，而不是还原任意原文。

## 原理

浏览器实现沿用了上游 `blind_watermark` 项目的核心思路：

1. 将图片通道转换为亮度/颜色表示。
2. 进行 Haar DWT 变换。
3. 将低频区域切成 `4 x 4` 块。
4. 使用 DCT 和 SVD 在每个块中嵌入或提取一个 bit。
5. 将 64-bit 水印在多个块和通道中重复写入，提高冗余度。

上游项目是 Python 实现，采用 MIT 许可证：

- 文档：[BlindWatermark.github.io/blind_watermark](https://blindwatermark.github.io/blind_watermark/#/zh/)
- 源码：[github.com/guofei9987/blind_watermark](https://github.com/guofei9987/blind_watermark)

## 本地运行

浏览器演示版是静态网站，任意简单 HTTP 服务都可以运行：

```bash
python3 -m http.server 4175
```

然后打开：

```text
http://localhost:4175
```

主要文件：

- `index.html` - 页面结构
- `assets/app.css` - 页面样式
- `assets/app.js` - UI、双语切换、下载和验证流程
- `assets/watermark-worker.js` - DWT-DCT-SVD 水印算法实现
- `vercel.json` - Vercel 静态部署配置

平台 MVP 需要运行本地 API/静态服务：

```bash
python3 platform_server.py --port 4175
```

然后打开：

```text
http://localhost:4175
```

平台接口：

- `POST /api/items` - 创建保存的网站、二维码内容或文本，并生成 64-bit code。
- `POST /api/watermark/embed` - 把平台 code 嵌入图片。
- `POST /api/watermark/decode` - 上传图片识别，返回 `found` 或 `not_found`。
- `GET /r/<code>` - 根据 code 打开保存内容。

## 部署

线上版本部署在 Vercel：

[https://watermark.yeangzi.com](https://watermark.yeangzi.com)

从项目根目录部署：

```bash
npx vercel --prod --yes
```

## 局限

隐形水印不是绝对不可破坏。图片经过强压缩、大幅裁剪、直接旋转、强缩放、亮度大幅变化后，验证结果可能失败。

如果几何攻击能恢复到原方向、原尺寸、原位置，水印通常更容易被验证出来。

当前版本验证的是 64-bit ID，不会解密或还原任意原始文字。

## 许可证

本仓库保留上游 `blind_watermark` 的 MIT 许可证。详见 [LICENSE](LICENSE)。
