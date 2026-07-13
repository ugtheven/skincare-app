import sharp from 'sharp';

const canvasSize = 1024;
const productMaxSize = 820;

export async function assertCommercialPackshot(source) {
  const sampleSize = 64;
  const cornerSize = 10;
  const { data, info } = await sharp(source, {
    failOn: 'warning',
    limitInputPixels: 50_000_000,
  })
    .rotate()
    .flatten({ background: '#ffffff' })
    .resize(sampleSize, sampleSize, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const corners = [
    [0, 0],
    [sampleSize - cornerSize, 0],
    [0, sampleSize - cornerSize],
    [sampleSize - cornerSize, sampleSize - cornerSize],
  ];
  const lightNeutralCorners = corners.filter(([originX, originY]) => {
    let red = 0;
    let green = 0;
    let blue = 0;
    const pixels = cornerSize * cornerSize;
    for (let y = originY; y < originY + cornerSize; y += 1) {
      for (let x = originX; x < originX + cornerSize; x += 1) {
        const offset = (y * info.width + x) * info.channels;
        red += data[offset];
        green += data[offset + 1];
        blue += data[offset + 2];
      }
    }
    const channels = [red / pixels, green / pixels, blue / pixels];
    return (
      Math.min(...channels) >= 225 &&
      Math.max(...channels) - Math.min(...channels) <= 18
    );
  }).length;
  if (lightNeutralCorners < 3) throw new Error('non_commercial_background');
}

export async function normalizeProductPackshot(source) {
  await assertCommercialPackshot(source);
  const fitted = await sharp(source, {
    failOn: 'warning',
    limitInputPixels: 50_000_000,
  })
    .rotate()
    .trim({ background: '#ffffff', threshold: 12 })
    .resize(productMaxSize, productMaxSize, { fit: 'inside' })
    .toBuffer();
  const metadata = await sharp(fitted).metadata();
  if (!metadata.width || !metadata.height)
    throw new Error('invalid_dimensions');

  const horizontalSpace = canvasSize - metadata.width;
  const verticalSpace = canvasSize - metadata.height;
  return sharp(fitted)
    .extend({
      top: Math.floor(verticalSpace / 2),
      bottom: Math.ceil(verticalSpace / 2),
      left: Math.floor(horizontalSpace / 2),
      right: Math.ceil(horizontalSpace / 2),
      background: '#ffffff',
    })
    .webp({ quality: 88, effort: 4 })
    .toBuffer();
}
