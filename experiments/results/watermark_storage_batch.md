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

- Original Python text average accuracy: `80.41%`
- Stored 64-bit ID average accuracy: `81.1%`
- Stored 64-bit ID exact success rate: `51.5%`
- Stored 64-bit ID false positive rate: `0.0%`
- Exact matches: original text `267`, stored ID `309`
- Wins: original text `136`, stored ID `197`, ties `267`

## By Attack Category

| Category | Rows | Text Avg | ID Avg | ID Exact % | ID False + % | Winner |
| --- | --- | --- | --- | --- | --- | --- |
| compression_blur | 240 | 93.78 | 93.7 | 81.25 | 0.0 | python_original_text |
| rotation | 180 | 60.49 | 63.08 | 0.0 | 0.0 | stored_id_64 |
| scale_crop | 180 | 82.49 | 82.33 | 63.33 | 0.0 | python_original_text |

## By Payload

| Payload | Rows | Text Avg | ID Avg | ID Exact % | Winner |
| --- | --- | --- | --- | --- | --- |
| ascii_sentence | 200 | 79.57 | 81.83 | 51.5 | stored_id_64 |
| mixed_order | 200 | 80.52 | 81.41 | 51.0 | stored_id_64 |
| readme_zh | 200 | 81.13 | 80.08 | 52.0 | python_original_text |

## By Image

| Image | Rows | Text Avg | ID Avg | ID Exact % | Winner |
| --- | --- | --- | --- | --- | --- |
| checker | 60 | 83.36 | 83.96 | 55.0 | stored_id_64 |
| dark_scene | 60 | 83.54 | 84.37 | 55.0 | stored_id_64 |
| geometric | 60 | 83.0 | 82.53 | 53.33 | python_original_text |
| gradient | 60 | 80.36 | 81.77 | 55.0 | stored_id_64 |
| high_texture | 60 | 65.6 | 65.94 | 30.0 | stored_id_64 |
| lena_photo | 60 | 83.67 | 83.7 | 55.0 | stored_id_64 |
| low_contrast | 60 | 83.9 | 85.49 | 55.0 | stored_id_64 |
| noise_photo | 60 | 78.9 | 80.08 | 55.0 | stored_id_64 |
| ori_photo | 60 | 78.76 | 80.76 | 55.0 | stored_id_64 |
| text_page | 60 | 82.97 | 82.45 | 46.67 | python_original_text |

## 30 Image/Payload Groups

| Image | Payload | Rows | Text Avg | ID Avg | ID Exact % | Winner |
| --- | --- | --- | --- | --- | --- | --- |
| checker | ascii_sentence | 20 | 82.17 | 84.61 | 55.0 | stored_id_64 |
| checker | mixed_order | 20 | 83.6 | 83.83 | 55.0 | stored_id_64 |
| checker | readme_zh | 20 | 84.3 | 83.44 | 55.0 | python_original_text |
| dark_scene | ascii_sentence | 20 | 82.42 | 85.16 | 55.0 | stored_id_64 |
| dark_scene | mixed_order | 20 | 83.6 | 84.53 | 55.0 | stored_id_64 |
| dark_scene | readme_zh | 20 | 84.58 | 83.44 | 55.0 | python_original_text |
| geometric | ascii_sentence | 20 | 81.42 | 83.98 | 55.0 | stored_id_64 |
| geometric | mixed_order | 20 | 83.28 | 83.05 | 50.0 | python_original_text |
| geometric | readme_zh | 20 | 84.3 | 80.55 | 55.0 | python_original_text |
| gradient | ascii_sentence | 20 | 79.68 | 81.72 | 55.0 | stored_id_64 |
| gradient | mixed_order | 20 | 80.29 | 83.05 | 55.0 | stored_id_64 |
| gradient | readme_zh | 20 | 81.12 | 80.55 | 55.0 | python_original_text |
| high_texture | ascii_sentence | 20 | 65.88 | 65.31 | 30.0 | python_original_text |
| high_texture | mixed_order | 20 | 65.3 | 66.09 | 30.0 | stored_id_64 |
| high_texture | readme_zh | 20 | 65.63 | 66.41 | 30.0 | stored_id_64 |
| lena_photo | ascii_sentence | 20 | 82.71 | 84.77 | 55.0 | stored_id_64 |
| lena_photo | mixed_order | 20 | 84.05 | 84.45 | 55.0 | stored_id_64 |
| lena_photo | readme_zh | 20 | 84.26 | 81.88 | 55.0 | python_original_text |
| low_contrast | ascii_sentence | 20 | 82.75 | 86.33 | 55.0 | stored_id_64 |
| low_contrast | mixed_order | 20 | 84.39 | 85.31 | 55.0 | stored_id_64 |
| low_contrast | readme_zh | 20 | 84.56 | 84.84 | 55.0 | stored_id_64 |
| noise_photo | ascii_sentence | 20 | 78.44 | 80.78 | 55.0 | stored_id_64 |
| noise_photo | mixed_order | 20 | 78.57 | 80.39 | 55.0 | stored_id_64 |
| noise_photo | readme_zh | 20 | 79.7 | 79.06 | 55.0 | python_original_text |
| ori_photo | ascii_sentence | 20 | 78.12 | 81.88 | 55.0 | stored_id_64 |
| ori_photo | mixed_order | 20 | 78.71 | 80.55 | 55.0 | stored_id_64 |
| ori_photo | readme_zh | 20 | 79.44 | 79.84 | 55.0 | stored_id_64 |
| text_page | ascii_sentence | 20 | 82.07 | 83.75 | 45.0 | stored_id_64 |
| text_page | mixed_order | 20 | 83.39 | 82.81 | 45.0 | python_original_text |
| text_page | readme_zh | 20 | 83.44 | 80.78 | 50.0 | python_original_text |

## Worst Stored-ID Attacks

| Attack | Category | Text Avg | ID Avg | ID Exact % | Winner |
| --- | --- | --- | --- | --- | --- |
| crop_center_25_restore | scale_crop | 50.52 | 51.09 | 0.0 | stored_id_64 |
| rotate_pos10 | rotation | 51.91 | 52.55 | 0.0 | stored_id_64 |
| crop_center_10_restore | scale_crop | 54.62 | 53.28 | 0.0 | python_original_text |
| rotate_neg10 | rotation | 51.48 | 54.53 | 0.0 | stored_id_64 |
| rotate_neg5 | rotation | 54.64 | 57.24 | 0.0 | stored_id_64 |
| rotate_pos5 | rotation | 55.71 | 57.71 | 0.0 | stored_id_64 |
| jpeg_q45 | compression_blur | 68.29 | 67.08 | 0.0 | python_original_text |
| rotate_pos2 | rotation | 74.37 | 78.13 | 0.0 | stored_id_64 |
