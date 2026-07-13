import {
  advanceAutoCaptureIdentifierLock,
  advanceAutoCaptureLock,
  barcodeGuidanceStage,
  emptyAutoCaptureIdentifierLock,
  emptyAutoCaptureLock,
  extractValidGtin,
  isValidGtin,
} from './product-auto-capture';

describe('automatic product capture lock', () => {
  it('ignores frames without a useful product identity', () => {
    expect(advanceAutoCaptureLock(emptyAutoCaptureLock, 'Crème')).toEqual(
      emptyAutoCaptureLock,
    );
  });

  it('locks after three consistent recognized frames', () => {
    const detected = advanceAutoCaptureLock(
      emptyAutoCaptureLock,
      'CeraVe Crème hydratante',
    );
    const aligned = advanceAutoCaptureLock(detected, 'cerave creme hydratante');
    const locked = advanceAutoCaptureLock(aligned, 'CeraVe — Crème hydratante');

    expect(detected.stage).toBe(1);
    expect(aligned.stage).toBe(2);
    expect(locked.stage).toBe(3);
  });

  it('restarts progress when the recognized identity changes', () => {
    const detected = advanceAutoCaptureLock(
      emptyAutoCaptureLock,
      'CeraVe Crème hydratante',
    );
    const changed = advanceAutoCaptureLock(
      detected,
      'Eucerin Lotion hydratante',
    );

    expect(changed).toEqual({
      identity: 'eucerin lotion hydratante',
      stage: 1,
    });
  });

  it('keeps locking when OCR drops a secondary word between frames', () => {
    const detected = advanceAutoCaptureLock(
      emptyAutoCaptureLock,
      'CeraVe Crème hydratante visage',
    );
    const aligned = advanceAutoCaptureLock(detected, 'CeraVe Crème hydratante');
    const locked = advanceAutoCaptureLock(aligned, 'CeraVe hydratante visage');

    expect(aligned.stage).toBe(2);
    expect(locked.stage).toBe(3);
  });
});

describe('printed product identifiers', () => {
  it('extracts a valid printed EAN-13 without barcode bars', () => {
    expect(
      extractValidGtin('CeraVe\n3612623028162\nCrème visage hydratante'),
    ).toBe('3612623028162');
  });

  it('accepts separators inserted by OCR', () => {
    expect(extractValidGtin('3 612623 028162')).toBe('3612623028162');
  });

  it('rejects a number with an invalid checksum', () => {
    expect(extractValidGtin('3612623028163')).toBeNull();
  });

  it('distinguishes internal short codes from universal GTINs', () => {
    expect(isValidGtin('05110')).toBe(false);
    expect(isValidGtin('3612623028162')).toBe(true);
  });

  it('does not accept a valid prefix inside a longer number', () => {
    expect(extractValidGtin('361262302816200')).toBeNull();
  });

  it('requires the same identifier in two consecutive frames', () => {
    const first = advanceAutoCaptureIdentifierLock(
      emptyAutoCaptureIdentifierLock,
      '3612623028162',
    );
    const stable = advanceAutoCaptureIdentifierLock(first, '3612623028162');

    expect(first.observations).toBe(1);
    expect(stable).toEqual({ observations: 2, value: '3612623028162' });
  });

  it('restarts when the printed identifier changes', () => {
    const first = advanceAutoCaptureIdentifierLock(
      emptyAutoCaptureIdentifierLock,
      '3612623028162',
    );

    expect(advanceAutoCaptureIdentifierLock(first, '12345670')).toEqual({
      observations: 1,
      value: '12345670',
    });
  });
});

describe('barcode-first guidance', () => {
  it('progresses from barcode to rotation then fallback after failed probes', () => {
    expect(barcodeGuidanceStage(0)).toBe('seek');
    expect(barcodeGuidanceStage(1)).toBe('seek');
    expect(barcodeGuidanceStage(2)).toBe('rotate');
    expect(barcodeGuidanceStage(4)).toBe('rotate');
    expect(barcodeGuidanceStage(5)).toBe('fallback');
  });
});
