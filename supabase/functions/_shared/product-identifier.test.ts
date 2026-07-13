import { isValidGtin } from './product-identifier';

describe('shared product identifiers', () => {
  it('accepts valid GTINs only', () => {
    expect(isValidGtin('3612623028162')).toBe(true);
    expect(isValidGtin('12345670')).toBe(true);
    expect(isValidGtin('3612623028163')).toBe(false);
  });

  it('does not treat manufacturer codes as public GTINs', () => {
    expect(isValidGtin('05110')).toBe(false);
    expect(isValidGtin('0435801')).toBe(false);
  });
});
