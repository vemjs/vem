import { describe, expect, it } from 'bun:test';
import { parseKeys } from './parser';

describe('Vim Keybinding Parser', () => {
  it('should parse single motions', () => {
    expect(parseKeys(['w'])).toEqual({
      count: 1,
      motion: 'w',
      isComplete: true,
      isValid: true,
    });

    expect(parseKeys(['g', 'g'])).toEqual({
      count: 1,
      motion: 'gg',
      isComplete: true,
      isValid: true,
    });
  });

  it('should handle counts with motions', () => {
    expect(parseKeys(['3', 'w'])).toEqual({
      count: 3,
      motion: 'w',
      isComplete: true,
      isValid: true,
    });

    expect(parseKeys(['1', '0', 'j'])).toEqual({
      count: 10,
      motion: 'j',
      isComplete: true,
      isValid: true,
    });
  });

  it('should handle counts with operators and motions', () => {
    expect(parseKeys(['d', '3', 'w'])).toEqual({
      count: 3,
      operator: 'd',
      motion: 'w',
      isComplete: true,
      isValid: true,
    });

    expect(parseKeys(['2', 'c', '3', 'b'])).toEqual({
      count: 6,
      operator: 'c',
      motion: 'b',
      isComplete: true,
      isValid: true,
    });
  });

  it('should handle double operators', () => {
    expect(parseKeys(['d', 'd'])).toEqual({
      count: 1,
      operator: 'd',
      command: 'dd',
      isComplete: true,
      isValid: true,
    });

    expect(parseKeys(['3', 'y', 'y'])).toEqual({
      count: 3,
      operator: 'y',
      command: 'yy',
      isComplete: true,
      isValid: true,
    });
  });

  it('should handle text objects after operators', () => {
    expect(parseKeys(['d', 'i', 'w'])).toEqual({
      count: 1,
      operator: 'd',
      textObject: 'iw',
      isComplete: true,
      isValid: true,
    });

    expect(parseKeys(['2', 'c', 'a', 'w'])).toEqual({
      count: 2,
      operator: 'c',
      textObject: 'aw',
      isComplete: true,
      isValid: true,
    });
  });

  it('should return incomplete states for partial keys', () => {
    expect(parseKeys(['g'])).toEqual({
      count: 1,
      isComplete: false,
      isValid: true,
    });

    expect(parseKeys(['d', 'i'])).toEqual({
      count: 1,
      operator: 'd',
      isComplete: false,
      isValid: true,
    });

    expect(parseKeys(['3', 'c'])).toEqual({
      count: 3,
      operator: 'c',
      isComplete: false,
      isValid: true,
    });
  });

  it('should return invalid for incorrect sequences', () => {
    expect(parseKeys(['d', 'x'])).toEqual({
      count: 1,
      operator: 'd',
      isComplete: true,
      isValid: false,
    });
  });
});
