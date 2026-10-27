# Third-party notices

DT Poster Studio source is private, with no distribution license granted by this repository. Third-party components retain their own licenses.

| Component | License | Source |
| --- | --- | --- |
| React / React DOM | MIT | https://github.com/facebook/react |
| Vite | MIT | https://github.com/vitejs/vite |
| Tauri v2 and plugins | MIT OR Apache-2.0 | https://github.com/tauri-apps/tauri |
| Python | PSF-2.0 | https://www.python.org/ |
| Playwright and driver | Apache-2.0; bundled Node retains its notices | https://github.com/microsoft/playwright-python |
| Chromium (downloaded separately) | BSD and third-party notices | https://www.chromium.org/ |
| PyInstaller | GPL-2.0 with bootloader distribution exception | https://pyinstaller.org/ |
| imageio-ffmpeg | BSD-2-Clause; bundled FFmpeg has separate terms | https://github.com/imageio/imageio-ffmpeg |
| FFmpeg (imageio binary) | GPL/LGPL and codec notices as built; retain source availability | https://ffmpeg.org/legal.html |
| OmniVoice (optional runtime) | Apache-2.0; model and dependencies retain their own terms | https://github.com/k2-fsa/OmniVoice |
| Express | MIT | https://github.com/expressjs/express |
| ONNX Runtime | MIT | https://github.com/microsoft/onnxruntime |
| sharp | Apache-2.0; bundled libvips and codecs retain their licenses | https://github.com/lovell/sharp |
| U²-Net architecture and model | Apache-2.0 | https://github.com/xuebinqin/U-2-Net |
| rembg model distribution | MIT; model authors retain model terms | https://github.com/danielgatis/rembg |
| Lucide icons | ISC | https://github.com/lucide-icons/lucide |
| Be Vietnam Pro | SIL Open Font License 1.1 | https://github.com/bettergui/BeVietnamPro |
| Playfair Display | SIL Open Font License 1.1 | https://github.com/clauseggers/Playfair |

U²-Net: Xuebin Qin, Zichen Zhang, Chenyang Huang, Masood Dehghan, Osmar R. Zaiane and Martin Jagersand, “U²-Net: Going Deeper with Nested U-Structure for Salient Object Detection,” Pattern Recognition 106 (2020). Model `u2net.onnx` comes from the rembg v0.0.0 release. Its upstream MD5 `60024c5c889badc19c04ad937298a77b` is checked at installation. This checksum establishes matching content with the upstream release; it is not an independent security audit.

Full dependency licenses remain in installed package directories. Tauri worker resources retain Python, Playwright, Node and imageio package license files. Chromium is installed separately with its own notices. OmniVoice/PyTorch are installed on demand. FFmpeg binary licensing and corresponding source obligations must be reviewed for redistribution; include the exact binary version/build source for each release. Retain this notice and the model/font license files under `licenses/` with distributions containing their assets. The product bottle illustration in `public/sample-product.svg` was created for this project; it is fictional demo branding.
