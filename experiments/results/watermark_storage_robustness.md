# Watermark Storage Robustness Benchmark

This benchmark compares two payload strategies using the original Python algorithm loaded from git.

## Setup

- Image: `/Users/a123/Documents/invisible_watermark/examples/pic/Lena_512x512.jpg` (567x567)
- Text payload: `@guofei9987 开源万岁！`
- Original Python text bits: `215`
- Stored 64-bit ID: `8bc6b6e5cae27961`
- Passwords: image=`1`, watermark=`1`
- Original Python source ref: `HEAD`

## Summary

- Experiments: `20`
- Original Python text average accuracy: `81.37%`
- Stored 64-bit ID average accuracy: `79.53%`
- Exact matches: original text `11`, stored ID `11`
- Wins: original text `6`, stored ID `3`, ties `11`

## Results

| # | Category | Attack | PSNR dB | Original text acc. | ID acc. | Winner |
|---:|---|---|---:|---:|---:|---|
| 1 | compression_blur | JPEG quality 95 | 41.45 | 100.0% | 100.0% | tie |
| 2 | compression_blur | JPEG quality 85 | 39.93 | 100.0% | 100.0% | tie |
| 3 | compression_blur | JPEG quality 75 | 37.11 | 100.0% | 100.0% | tie |
| 4 | compression_blur | JPEG quality 60 | 35.47 | 100.0% | 100.0% | tie |
| 5 | compression_blur | JPEG quality 45 | 34.39 | 76.74% | 70.31% | python_original_text |
| 6 | compression_blur | Gaussian blur 3x3 | 34.67 | 100.0% | 100.0% | tie |
| 7 | compression_blur | Gaussian blur 5x5 | 32.08 | 100.0% | 100.0% | tie |
| 8 | compression_blur | Gaussian blur 9x9 | 28.7 | 100.0% | 100.0% | tie |
| 9 | rotation | Rotate -10 degrees | 11.45 | 53.02% | 45.31% | python_original_text |
| 10 | rotation | Rotate -5 degrees | 13.57 | 53.49% | 48.44% | python_original_text |
| 11 | rotation | Rotate -2 degrees | 16.91 | 66.98% | 67.19% | stored_id_64 |
| 12 | rotation | Rotate +2 degrees | 17.1 | 65.58% | 70.31% | stored_id_64 |
| 13 | rotation | Rotate +5 degrees | 13.7 | 57.67% | 45.31% | python_original_text |
| 14 | rotation | Rotate +10 degrees | 11.54 | 52.56% | 48.44% | python_original_text |
| 15 | scale_crop | Scale 50%, restore to original size | 31.62 | 100.0% | 100.0% | tie |
| 16 | scale_crop | Scale 75%, restore to original size | 34.75 | 100.0% | 100.0% | tie |
| 17 | scale_crop | Scale 125%, restore to original size | 43.05 | 100.0% | 100.0% | tie |
| 18 | scale_crop | Scale 150%, restore to original size | 45.36 | 100.0% | 100.0% | tie |
| 19 | scale_crop | Center crop 10%, restore to original size | 13.54 | 53.49% | 46.88% | python_original_text |
| 20 | scale_crop | Center crop 25%, restore to original size | 11.49 | 47.91% | 48.44% | stored_id_64 |
