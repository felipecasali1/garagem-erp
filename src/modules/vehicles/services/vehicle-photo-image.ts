export const MAX_VEHICLE_PHOTO_LONG_EDGE = 1920;
export const MAX_VEHICLE_PHOTO_BYTES = 5 * 1024 * 1024;
export const VEHICLE_PHOTO_INPUT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

type DecodedImage = {
  width: number;
  height: number;
  close?: () => void;
};

type CanvasContext = {
  drawImage: (image: DecodedImage, x: number, y: number, width: number, height: number) => void;
};

type PhotoCanvas = {
  width: number;
  height: number;
  getContext: (contextId: "2d") => CanvasContext | null;
  toBlob: (callback: BlobCallback, type?: string, quality?: number) => void;
};

export type VehiclePhotoImageRuntime = {
  decode: (file: File) => Promise<DecodedImage>;
  createCanvas: () => PhotoCanvas;
};

function browserImageRuntime(): VehiclePhotoImageRuntime {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    throw new Error("Este navegador não consegue processar imagens para envio.");
  }

  return {
    decode: (file) => createImageBitmap(file),
    createCanvas: () => document.createElement("canvas") as unknown as PhotoCanvas,
  };
}

function canvasBlob(canvas: PhotoCanvas, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Não foi possível comprimir a foto. Tente outra imagem."));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

export async function optimizeVehiclePhoto(
  file: File,
  runtime: VehiclePhotoImageRuntime = browserImageRuntime(),
) {
  if (
    !VEHICLE_PHOTO_INPUT_TYPES.includes(file.type as (typeof VEHICLE_PHOTO_INPUT_TYPES)[number])
  ) {
    throw new Error(
      "Envie uma imagem JPEG, PNG ou WebP. Vídeos e outros arquivos não são aceitos.",
    );
  }

  let image: DecodedImage;
  try {
    image = await runtime.decode(file);
  } catch {
    throw new Error("Não foi possível abrir esta imagem. Escolha outro arquivo e tente novamente.");
  }

  try {
    if (
      !Number.isFinite(image.width) ||
      !Number.isFinite(image.height) ||
      image.width < 1 ||
      image.height < 1
    ) {
      throw new Error("A imagem selecionada não tem dimensões válidas.");
    }

    const initialScale = Math.min(
      1,
      MAX_VEHICLE_PHOTO_LONG_EDGE / Math.max(image.width, image.height),
    );
    const initialWidth = Math.max(1, Math.round(image.width * initialScale));
    const initialHeight = Math.max(1, Math.round(image.height * initialScale));
    let dimensionScale = 1;
    let quality = 0.9;

    for (let attempt = 0; attempt < 18; attempt += 1) {
      const width = Math.max(1, Math.round(initialWidth * dimensionScale));
      const height = Math.max(1, Math.round(initialHeight * dimensionScale));
      const canvas = runtime.createCanvas();
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Não foi possível preparar a imagem para envio.");

      context.drawImage(image, 0, 0, width, height);
      const optimized = await canvasBlob(canvas, quality);
      if (optimized.type !== "image/jpeg") {
        throw new Error("O navegador não conseguiu gerar uma foto JPEG otimizada.");
      }
      if (optimized.size <= MAX_VEHICLE_PHOTO_BYTES) return optimized;

      if (quality > 0.55) {
        quality = Math.max(0.55, quality - 0.1);
      } else if (Math.max(width, height) > 640) {
        dimensionScale *= 0.85;
        quality = 0.82;
      } else {
        break;
      }
    }

    throw new Error("A foto continua maior que 5 MB após a compressão. Escolha uma imagem menor.");
  } finally {
    image.close?.();
  }
}
