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

  /**
   * Regression: the g/z/Z/bracket-prefix lookup tables are keyed by the
   * SECOND character only (e.g. `gPrefixCommands.u === 'gu'`), but the
   * lookups originally indexed them by the FULL two-char sequence
   * (`gPrefixCommands['gu']`, `zPrefixCommands['zz']`, etc.) — a key that
   * never exists in any of these tables, so the lookup was always
   * `undefined` and every one of these commands silently fell through to
   * `isValid: false` in production. Only `gg` "worked", because it has its
   * own separately hardcoded motion check earlier in the function that
   * never depended on the broken lookup at all — which is exactly why this
   * bug class went unnoticed: the one command anyone tried by habit first
   * (`gg`) was never actually exercising the shared lookup path.
   */
  describe('g/z/Z/bracket two-key prefix commands (regression)', () => {
    it('resolves every g-prefix command via the shared lookup', () => {
      const cases: Array<[string, string]> = [
        ['f', 'gf'],
        ['v', 'gv'],
        ['i', 'gi'],
        [';', 'g;'],
        [',', 'g,'],
        ['u', 'gu'],
        ['U', 'gU'],
        ['q', 'gq'],
        ['J', 'gJ'],
        ['a', 'ga'],
        ['8', 'g8'],
      ];
      for (const [second, expected] of cases) {
        expect(parseKeys(['g', second])).toEqual({
          count: 1,
          command: expected,
          isComplete: true,
          isValid: true,
        });
      }
    });

    it('still resolves gg as a motion, not a gPrefixCommands lookup hit', () => {
      // gPrefixCommands.g happens to equal the string 'gg' too, so this is
      // the one case that must NOT go through the shared command lookup.
      expect(parseKeys(['g', 'g'])).toEqual({
        count: 1,
        motion: 'gg',
        isComplete: true,
        isValid: true,
      });
    });

    it('resolves every z-prefix command', () => {
      const cases: Array<[string, string]> = [
        ['z', 'zz'],
        ['t', 'zt'],
        ['b', 'zb'],
      ];
      for (const [second, expected] of cases) {
        expect(parseKeys(['z', second])).toEqual({
          count: 1,
          command: expected,
          isComplete: true,
          isValid: true,
        });
      }
    });

    it('resolves every Z-prefix command', () => {
      expect(parseKeys(['Z', 'Z'])).toEqual({
        count: 1,
        command: 'ZZ',
        isComplete: true,
        isValid: true,
      });
      expect(parseKeys(['Z', 'Q'])).toEqual({
        count: 1,
        command: 'ZQ',
        isComplete: true,
        isValid: true,
      });
    });

    it('resolves every bracket-prefix section-jump command', () => {
      const cases: Array<[string[], string]> = [
        [['[', '['], '[['],
        [[']', ']'], ']]'],
        [['[', ']'], '[]'],
        [[']', '['], ']['],
      ];
      for (const [keys, expected] of cases) {
        expect(parseKeys(keys)).toEqual({
          count: 1,
          command: expected,
          isComplete: true,
          isValid: true,
        });
      }
    });

    it('resolves gu/gU as commands in Visual mode too', () => {
      expect(parseKeys(['g', 'u'], 'VISUAL')).toEqual({
        count: 1,
        command: 'gu',
        isComplete: true,
        isValid: true,
      });
      expect(parseKeys(['g', 'U'], 'VISUAL')).toEqual({
        count: 1,
        command: 'gU',
        isComplete: true,
        isValid: true,
      });
    });

    it('resolves gu/gU after an operator (e.g. an operator-pending g-command)', () => {
      // Not a realistic Vim sequence on its own, but exercises the same
      // remOpStr-based lookup path that had the identical bug.
      expect(parseKeys(['d', 'g', 'u'])).toEqual({
        count: 1,
        operator: 'd',
        command: 'gu',
        isComplete: true,
        isValid: true,
      });
    });
  });
});
