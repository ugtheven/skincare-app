import assert from 'node:assert/strict';
import test from 'node:test';

import sharp from 'sharp';

import {
  assertCommercialPackshot,
  normalizeProductPackshot,
} from './image.mjs';

test('normalizes a portrait source onto an exact 1024 square canvas', async () => {
  const source = await sharp({
    create: {
      width: 400,
      height: 800,
      channels: 3,
      background: '#ffffff',
    },
  })
    .composite([
      {
        input: await sharp({
          create: {
            width: 180,
            height: 600,
            channels: 3,
            background: '#2b65a8',
          },
        })
          .png()
          .toBuffer(),
      },
    ])
    .jpeg()
    .toBuffer();

  const normalized = await normalizeProductPackshot(source);
  const metadata = await sharp(normalized).metadata();

  assert.equal(metadata.width, 1024);
  assert.equal(metadata.height, 1024);
  assert.equal(metadata.format, 'webp');
});

test('rejects a user photo without a commercial background', async () => {
  const source = await sharp({
    create: {
      width: 600,
      height: 800,
      channels: 3,
      background: '#8c6b54',
    },
  })
    .jpeg()
    .toBuffer();

  await assert.rejects(
    () => assertCommercialPackshot(source),
    /non_commercial_background/,
  );
});
