# free invisible photo watermark

基于浏览器本地处理的免费隐形照片水印工具。

English README: [README.md](README.md)

在线网站：[watermark.yeangzi.com](https://watermark.yeangzi.com)

上游算法项目 [`guofei9987/blind_watermark`](https://github.com/guofei9987/blind_watermark) 的徽章：

[![PyPI](https://img.shields.io/pypi/v/blind_watermark)](https://pypi.org/project/blind_watermark/)
[![Build Status](https://travis-ci.com/guofei9987/blind_watermark.svg?branch=master)](https://travis-ci.com/guofei9987/blind_watermark)
[![codecov](https://codecov.io/gh/guofei9987/blind_watermark/branch/master/graph/badge.svg)](https://codecov.io/gh/guofei9987/blind_watermark)
[![License](https://img.shields.io/pypi/l/blind_watermark.svg)](https://github.com/guofei9987/blind_watermark/blob/master/LICENSE)
![Python](https://img.shields.io/badge/python-%3E%3D3.5-green.svg)
![Platform](https://img.shields.io/badge/platform-windows%20%7C%20linux%20%7C%20macos-green.svg)
[![Stars](https://img.shields.io/github/stars/guofei9987/blind_watermark.svg?style=social)](https://github.com/guofei9987/blind_watermark/)
[![Forks](https://img.shields.io/github/forks/guofei9987/blind_watermark?style=social)](https://github.com/guofei9987/blind_watermark/fork)
[![Downloads](https://pepy.tech/badge/blind-watermark)](https://pepy.tech/project/blind-watermark)
[![Discussions](https://img.shields.io/badge/discussions-green.svg)](https://github.com/guofei9987/blind_watermark/discussions)
<a href="https://hellogithub.com/repository/guofei9987/blind_watermark" target="_blank"><img src="https://abroad.hellogithub.com/v1/widgets/recommend.svg?rid=3834302ff46a40f188a651ef8bd26ff5&claim_uid=se0WHo8cbiLv2w1&theme=small" alt="HelloGitHub 推荐项目" /></a>

![free invisible photo watermark interface](docs/打上水印的图.jpg)

## 功能

- 给 PNG、JPEG、WebP 图片嵌入不可见的 64-bit 水印 ID。
- 在浏览器里验证带水印图片，提取 64-bit ID。
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

这是一个静态网站，任意简单 HTTP 服务都可以运行：

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
