# Batch Watermark Storage Robustness Benchmark

This run compares original Python raw-text storage with browser-style 64-bit ID storage.

## Setup

- Images: `10` at `384x384`
- Payload batches: `3`
- Image/payload groups: `30`
- Attacks per group: `20`
- Detail rows: `600`
- Passwords: image=`1`, watermark=`1`
- Original Python source ref: `HEAD`

## Overall

- Original Python text average accuracy: `80.25%`
- Stored 64-bit ID average accuracy: `80.73%`
- Exact matches: original text `279`, stored ID `308`
- Wins: original text `129`, stored ID `194`, ties `277`

## By Attack Category

| Category | Rows | Text Avg | ID Avg | Winner |
| --- | --- | --- | --- | --- |
| compression_blur | 240 | 92.92 | 92.25 | python_original_text |
| rotation | 180 | 61.04 | 63.56 | stored_id_64 |
| scale_crop | 180 | 82.57 | 82.55 | python_original_text |

## By Payload

| Payload | Rows | Text Avg | ID Avg | Winner |
| --- | --- | --- | --- | --- |
| ascii_sentence | 200 | 79.42 | 81.7 | stored_id_64 |
| mixed_order | 200 | 80.23 | 80.76 | stored_id_64 |
| readme_zh | 200 | 81.1 | 79.75 | python_original_text |

## By Image

| Image | Rows | Text Avg | ID Avg | Winner |
| --- | --- | --- | --- | --- |
| checker | 60 | 83.34 | 83.57 | stored_id_64 |
| dark_scene | 60 | 82.9 | 84.24 | stored_id_64 |
| geometric | 60 | 82.99 | 82.45 | python_original_text |
| gradient | 60 | 80.02 | 80.94 | stored_id_64 |
| high_texture | 60 | 65.72 | 66.72 | stored_id_64 |
| lena_photo | 60 | 83.61 | 83.07 | python_original_text |
| low_contrast | 60 | 83.11 | 83.98 | stored_id_64 |
| noise_photo | 60 | 78.77 | 79.45 | stored_id_64 |
| ori_photo | 60 | 79.25 | 80.78 | stored_id_64 |
| text_page | 60 | 82.76 | 82.14 | python_original_text |

## 30 Image/Payload Groups

| Image | Payload | Rows | Text Avg | ID Avg | Winner |
| --- | --- | --- | --- | --- | --- |
| checker | ascii_sentence | 20 | 82.47 | 83.98 | stored_id_64 |
| checker | mixed_order | 20 | 83.14 | 83.2 | stored_id_64 |
| checker | readme_zh | 20 | 84.42 | 83.51 | python_original_text |
| dark_scene | ascii_sentence | 20 | 81.75 | 85.39 | stored_id_64 |
| dark_scene | mixed_order | 20 | 82.83 | 83.98 | stored_id_64 |
| dark_scene | readme_zh | 20 | 84.12 | 83.36 | python_original_text |
| geometric | ascii_sentence | 20 | 81.93 | 84.06 | stored_id_64 |
| geometric | mixed_order | 20 | 83.32 | 82.27 | python_original_text |
| geometric | readme_zh | 20 | 83.72 | 81.02 | python_original_text |
| gradient | ascii_sentence | 20 | 79.32 | 81.41 | stored_id_64 |
| gradient | mixed_order | 20 | 79.91 | 82.03 | stored_id_64 |
| gradient | readme_zh | 20 | 80.84 | 79.37 | python_original_text |
| high_texture | ascii_sentence | 20 | 65.63 | 66.25 | stored_id_64 |
| high_texture | mixed_order | 20 | 65.81 | 67.66 | stored_id_64 |
| high_texture | readme_zh | 20 | 65.72 | 66.25 | stored_id_64 |
| lena_photo | ascii_sentence | 20 | 82.42 | 84.61 | stored_id_64 |
| lena_photo | mixed_order | 20 | 83.87 | 83.75 | python_original_text |
| lena_photo | readme_zh | 20 | 84.53 | 80.86 | python_original_text |
| low_contrast | ascii_sentence | 20 | 81.98 | 85.62 | stored_id_64 |
| low_contrast | mixed_order | 20 | 83.48 | 82.81 | python_original_text |
| low_contrast | readme_zh | 20 | 83.88 | 83.52 | python_original_text |
| noise_photo | ascii_sentence | 20 | 78.12 | 80.08 | stored_id_64 |
| noise_photo | mixed_order | 20 | 78.49 | 80.0 | stored_id_64 |
| noise_photo | readme_zh | 20 | 79.7 | 78.28 | python_original_text |
| ori_photo | ascii_sentence | 20 | 78.69 | 82.11 | stored_id_64 |
| ori_photo | mixed_order | 20 | 78.91 | 79.92 | stored_id_64 |
| ori_photo | readme_zh | 20 | 80.16 | 80.31 | stored_id_64 |
| text_page | ascii_sentence | 20 | 81.92 | 83.44 | stored_id_64 |
| text_page | mixed_order | 20 | 82.51 | 81.95 | python_original_text |
| text_page | readme_zh | 20 | 83.86 | 81.01 | python_original_text |

## Worst Stored-ID Attacks

| Attack | Category | Text Avg | ID Avg | Winner |
| --- | --- | --- | --- | --- |
| crop_center_25_restore | scale_crop | 51.32 | 51.35 | stored_id_64 |
| rotate_pos10 | rotation | 52.29 | 52.81 | stored_id_64 |
| crop_center_10_restore | scale_crop | 53.76 | 54.06 | stored_id_64 |
| rotate_neg10 | rotation | 50.94 | 54.69 | stored_id_64 |
| jpeg_q45 | compression_blur | 60.8 | 55.05 | python_original_text |
| rotate_pos5 | rotation | 56.02 | 57.08 | stored_id_64 |
| rotate_neg5 | rotation | 55.56 | 57.87 | stored_id_64 |
| rotate_neg2 | rotation | 75.75 | 78.75 | stored_id_64 |
