import { Resvg, initWasm } from '@resvg/resvg-wasm';
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm';
import { decode as decodePng } from 'fast-png';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import potrace from 'potrace-wasm';

const textEncoder = new TextEncoder();
let resvgReady;

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function artifact(filename, mimeType, bytes) {
  return {
    filename,
    mimeType,
    base64: bytesToBase64(bytes)
  };
}

function normalizeToRgba(decoded) {
  const { width, height, channels, depth } = decoded;
  if (depth !== 8) throw new Error(`Worker trace belum mendukung PNG ${depth}-bit.`);
  const source = decoded.data;
  const rgba = new Uint8ClampedArray(width * height * 4);

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const sourceOffset = pixel * channels;
    const targetOffset = pixel * 4;
    if (channels === 4) {
      rgba[targetOffset] = source[sourceOffset];
      rgba[targetOffset + 1] = source[sourceOffset + 1];
      rgba[targetOffset + 2] = source[sourceOffset + 2];
      rgba[targetOffset + 3] = source[sourceOffset + 3];
    } else if (channels === 3) {
      rgba[targetOffset] = source[sourceOffset];
      rgba[targetOffset + 1] = source[sourceOffset + 1];
      rgba[targetOffset + 2] = source[sourceOffset + 2];
      rgba[targetOffset + 3] = 255;
    } else if (channels === 2) {
      rgba[targetOffset] = source[sourceOffset];
      rgba[targetOffset + 1] = source[sourceOffset];
      rgba[targetOffset + 2] = source[sourceOffset];
      rgba[targetOffset + 3] = source[sourceOffset + 1];
    } else if (channels === 1) {
      rgba[targetOffset] = source[sourceOffset];
      rgba[targetOffset + 1] = source[sourceOffset];
      rgba[targetOffset + 2] = source[sourceOffset];
      rgba[targetOffset + 3] = 255;
    } else {
      throw new Error(`Worker trace tidak mendukung PNG dengan ${channels} channel.`);
    }
  }

  return rgba;
}

function buildTraceMask(rgba, width, height) {
  const sampleIndexes = [0, width - 1, (height - 1) * width, height * width - 1];
  const background = [0, 0, 0];
  let samples = 0;
  for (const pixel of sampleIndexes) {
    const offset = pixel * 4;
    if (rgba[offset + 3] < 16) continue;
    background[0] += rgba[offset];
    background[1] += rgba[offset + 1];
    background[2] += rgba[offset + 2];
    samples += 1;
  }
  if (samples > 0) background.forEach((value, index) => { background[index] = value / samples; });

  const mask = new Uint8ClampedArray(width * height * 4);
  let foregroundCount = 0;
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const source = pixel * 4;
    const distance = Math.abs(rgba[source] - background[0]) + Math.abs(rgba[source + 1] - background[1]) + Math.abs(rgba[source + 2] - background[2]);
    const foreground = rgba[source + 3] > 20 && distance > 30;
    const value = foreground ? 255 : 0;
    if (foreground) foregroundCount += 1;
    mask[source] = value;
    mask[source + 1] = value;
    mask[source + 2] = value;
    mask[source + 3] = 255;
  }

  if (foregroundCount < Math.max(4, Math.floor(width * height * 0.002))) {
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      const source = pixel * 4;
      const luminance = rgba[source] * 0.299 + rgba[source + 1] * 0.587 + rgba[source + 2] * 0.114;
      const foreground = rgba[source + 3] > 20 && luminance < 245;
      const value = foreground ? 255 : 0;
      mask[source] = value;
      mask[source + 1] = value;
      mask[source + 2] = value;
      mask[source + 3] = 255;
    }
  }
  return mask;
}

async function traceRgba(rgba, width, height) {
  const mask = buildTraceMask(rgba, width, height);
  const canvas = {
    width,
    height,
    getContext() {
      return {
        getImageData() {
          return { data: mask, width, height };
        }
      };
    }
  };
  return potrace.loadFromCanvas(canvas);
}

async function renderSvgToPng(svg) {
  if (!resvgReady) resvgReady = initWasm(resvgWasm);
  await resvgReady;
  const renderer = new Resvg(svg, {
    font: { loadSystemFonts: false },
    shapeRendering: 2,
    imageRendering: 0
  });
  try {
    const rendered = renderer.render();
    try {
      return rendered.asPng();
    } finally {
      rendered.free();
    }
  } finally {
    renderer.free();
  }
}

async function pngToPdf(pngBytes, width, height) {
  const document = await PDFDocument.create();
  const image = await document.embedPng(pngBytes);
  const page = document.addPage([width, height]);
  page.drawImage(image, { x: 0, y: 0, width, height });
  return document.save();
}

async function zipArtifacts(entries) {
  const zip = new JSZip();
  for (const [name, bytes] of entries) zip.file(name, bytes);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export async function traceAiPngArtifacts(aiPngBytes, settings = {}) {
  const decoded = decodePng(aiPngBytes);
  const rgba = normalizeToRgba(decoded);
  const svgText = await traceRgba(rgba, decoded.width, decoded.height);
  const svgBytes = textEncoder.encode(svgText);
  const tracedPngBytes = await renderSvgToPng(svgText);
  const pdfBytes = await pngToPdf(tracedPngBytes, decoded.width, decoded.height);
  const zipEntries = [
    ['hasil-ai-mentah.png', aiPngBytes],
    ['hasil-trace.png', tracedPngBytes],
    ['hasil-trace.svg', svgBytes],
    ['hasil-trace.pdf', pdfBytes]
  ];
  const bundleBytes = await zipArtifacts(zipEntries);

  let separationZip = null;
  let separations = [];
  if (settings.productionType === 'sablon' || settings.separateColors) {
    const separationBytes = await zipArtifacts([
      ['film-trace.svg', svgBytes],
      ['film-trace.pdf', pdfBytes],
      ['film-trace-preview.png', tracedPngBytes]
    ]);
    separationZip = artifact('film-trace.zip', 'application/zip', separationBytes);
    separations = [
      {
        index: 1,
        kind: 'trace',
        hex: '#000000',
        label: 'FILM TRACE',
        spotName: 'TRACE',
        chokePx: 0,
        svg: artifact('film-trace.svg', 'image/svg+xml', svgBytes),
        pdf: artifact('film-trace.pdf', 'application/pdf', pdfBytes),
        preview: artifact('film-trace-preview.png', 'image/png', tracedPngBytes)
      }
    ];
  }

  const includeCutline = settings.productionType === 'sticker' && settings.stickerCutlineEnabled !== false;
  return {
    message: 'AI redraw selesai dan langsung ditrace di Worker.',
    separationFilmCount: separations.length,
    settings,
    palette: separations.length ? ['#000000'] : [],
    artifacts: {
      aiRawPng: artifact('hasil-ai-mentah.png', 'image/png', aiPngBytes),
      tracedPng: artifact('hasil-trace.png', 'image/png', tracedPngBytes),
      fullPng: artifact('hasil-trace.png', 'image/png', tracedPngBytes),
      fullSvg: artifact('hasil-trace.svg', 'image/svg+xml', svgBytes),
      fullPdf: artifact('hasil-trace.pdf', 'application/pdf', pdfBytes),
      zip: artifact('hasil-ai-dan-trace.zip', 'application/zip', bundleBytes),
      separationZip,
      stickerCutlineSvg: includeCutline ? artifact('sticker-cutline.svg', 'image/svg+xml', svgBytes) : null,
      stickerCutlinePdf: includeCutline ? artifact('sticker-cutline.pdf', 'application/pdf', pdfBytes) : null,
      separations
    },
    manifest: {
      trace: {
        processor: 'cloudflare_worker',
        vectorEngine: 'potrace-wasm',
        rasterEngine: 'resvg-wasm',
        source: 'ai_raw_png',
        width: decoded.width,
        height: decoded.height
      }
    }
  };
}
