import {
  fitWithin,
  IMAGE_MAX_BYTES,
  IMAGE_MAX_SIDE,
  type ImageKind,
  OUTPUT_TYPES,
} from '@/lib/pro/brand';

/** Smaller long sides to try when a picture at full size does not fit the cap. */
const FALLBACK_SIDES = [900, 600];

const JPEG_QUALITY = 0.9;

/** A chosen picture made fit for upload: whatever the browser can open (a HEIC or WebP, a JPEG
 * with a phone's trailer after its end, a 12-megapixel photo) is drawn upright, its long side at
 * most `IMAGE_MAX_SIDE`, and saved as a plain PNG or JPEG under the jobs worker's 1 MB cap. The
 * seller should not have to make such a file. Null when the browser cannot open it or no size
 * fits. */
export async function prepareImage(file: File, kind: ImageKind): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    // An <img> is drawn as the camera held it: browsers apply the EXIF orientation.
    await image.decode();
    if (image.naturalWidth < 1 || image.naturalHeight < 1) return null;

    const sides = [IMAGE_MAX_SIDE, ...FALLBACK_SIDES];
    let types: string[] | null = null;
    for (const side of sides) {
      const canvas = draw(image, side);
      if (!canvas) return null;
      types ??= transparent(canvas) ? OUTPUT_TYPES[kind].transparent : OUTPUT_TYPES[kind].opaque;
      for (const type of types) {
        const blob = await encode(canvas, type);
        if (blob && blob.size > 0 && blob.size <= IMAGE_MAX_BYTES) return blob;
      }
    }
    return null;
  } catch {
    // Not a picture this browser can open, or a canvas it refuses to read back.
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function draw(image: HTMLImageElement, side: number): HTMLCanvasElement | null {
  const { width, height } = fitWithin(image.naturalWidth, image.naturalHeight, side);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);
  return canvas;
}

/** Whether any pixel lets the background through. */
function transparent(canvas: HTMLCanvasElement): boolean {
  const context = canvas.getContext('2d');
  if (!context) return false;
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < data.length; i += 4) {
    if ((data[i] as number) < 255) return true;
  }
  return false;
}

/** The canvas as `type`, or null when the browser cannot write that type (it would hand back a
 * PNG instead). */
function encode(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob?.type === type ? blob : null), type, JPEG_QUALITY);
  });
}
