function loadBitmapFromBlob(blob) {
  if ('createImageBitmap' in window) {
    return createImageBitmap(blob);
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = (error) => {
      URL.revokeObjectURL(url);
      reject(error);
    };
    image.src = url;
  });
}

function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Gagal membuat preview gambar.'));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

export function calculateContainedDimensions(width, height, maxEdge) {
  const normalizedWidth = Math.max(1, Number(width) || 1);
  const normalizedHeight = Math.max(1, Number(height) || 1);
  const normalizedMaxEdge = Math.max(1, Number(maxEdge) || 1);
  const scale = Math.min(1, normalizedMaxEdge / Math.max(normalizedWidth, normalizedHeight));

  return {
    width: Math.max(1, Math.round(normalizedWidth * scale)),
    height: Math.max(1, Math.round(normalizedHeight * scale))
  };
}

export function hasTransparentPixels(pixelData) {
  for (let offset = 3; offset < pixelData.length; offset += 4) {
    if (pixelData[offset] < 255) return true;
  }
  return false;
}

export async function createNormalizedImagePreviewBlob(blob, { maxEdge = 480, type = 'image/png', quality } = {}) {
  if (!(blob instanceof Blob)) {
    throw new Error('Preview gambar hanya bisa dibuat dari Blob atau File.');
  }

  const bitmap = await loadBitmapFromBlob(blob);
  const dimensions = calculateContainedDimensions(bitmap.width, bitmap.height, maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;

  const context = canvas.getContext('2d');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  if ('close' in bitmap && typeof bitmap.close === 'function') {
    bitmap.close();
  }

  return canvasToBlob(canvas, type, quality);
}

export async function prepareAiRedrawInput(blob, { maxEdge = 1080, quality = 0.85 } = {}) {
  if (!(blob instanceof Blob)) {
    throw new Error('Input AI redraw hanya bisa dibuat dari Blob atau File.');
  }

  let bitmap;
  try {
    bitmap = await loadBitmapFromBlob(blob);
    const sourceDimensions = { width: bitmap.width, height: bitmap.height };
    const preparedDimensions = calculateContainedDimensions(bitmap.width, bitmap.height, maxEdge);
    const canvas = document.createElement('canvas');
    canvas.width = preparedDimensions.width;
    canvas.height = preparedDimensions.height;

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Browser tidak dapat menyiapkan canvas untuk AI redraw.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const hasAlpha = hasTransparentPixels(pixels);
    const requestedType = hasAlpha ? 'image/png' : 'image/webp';
    const preparedBlob = await canvasToBlob(canvas, requestedType, hasAlpha ? undefined : quality);
    const outputType = preparedBlob.type || requestedType;
    const extension = outputType === 'image/png' ? 'png' : outputType === 'image/jpeg' ? 'jpg' : 'webp';
    const file = new File([preparedBlob], `ai-redraw-input.${extension}`, {
      type: outputType,
      lastModified: Date.now()
    });

    return {
      file,
      metadata: {
        sourceDimensions,
        sourceBytes: blob.size,
        preparedDimensions,
        preparedBytes: file.size,
        preparedFormat: outputType,
        inputMaxEdge: maxEdge
      }
    };
  } catch (error) {
    throw new Error(`Gagal menyiapkan gambar hemat token: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    if (bitmap && 'close' in bitmap && typeof bitmap.close === 'function') bitmap.close();
  }
}
