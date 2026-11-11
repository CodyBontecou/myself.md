import { useMemo } from 'react';
import { useColorScheme } from 'react-native';

/** The Strands look: one color per strand, Geist with JetBrains Mono labels.
 * Dark is the original ground; light keeps the same structure on ivory. */
const strandsDark = {
  ground: '#0E0F0C',
  surface: '#181A15',
  dock: '#1C1E19',
  line: '#2A2C25',
  grid: '#22241E',
  rule: '#3A3C34',
  track: '#23251F',
  dot: '#6E7064',
  text: '#EDEBE3',
  soft: '#C9C7BE',
  muted: '#9A9C92',
  faint: '#8A8C82',
  place: '#C8E36A',
  attention: '#7B93FF',
  body: '#FF7A45',
};

/** @type {Palette} */
const strandsLight = {
  ground: '#F6F5EF',
  surface: '#FFFFFF',
  dock: '#FFFFFF',
  line: '#E2E0D6',
  grid: '#ECEAE2',
  rule: '#D3D1C6',
  track: '#ECEAE2',
  dot: '#A9AB9F',
  text: '#141512',
  soft: '#3F413A',
  muted: '#5E6057',
  faint: '#6E7066',
  place: '#55700F',
  attention: '#3550D9',
  body: '#C2410C',
};

/** @typedef {typeof strandsDark} Palette */

/** The Strands palette for the current system appearance. */
function useStrands() {
  return useColorScheme() === 'dark' ? strandsDark : strandsLight;
}

/** The opposite appearance's palette, for inverted surfaces such as the next-export card.
 * @param {Palette} palette */
export function inverse(palette) {
  return palette === strandsDark ? strandsLight : strandsDark;
}

/** Styles built from a palette, cached per palette so each appearance builds once.
 * @template T
 * @param {(palette:Palette)=>T} create */
export function themed(create) {
  /** @type {Map<Palette,T>} */
  const cache = new Map();
  return () => {
    const strands = useStrands();
    const styles = useMemo(() => {
      const hit = cache.get(strands);
      if (hit) return hit;
      const built = create(strands);
      cache.set(strands, built);
      return built;
    }, [strands]);
    return { strands, styles };
  };
}

export const fonts = {
  regular: 'Geist-Regular',
  medium: 'Geist-Medium',
  semibold: 'Geist-SemiBold',
  mono: 'JetBrainsMono-Regular',
};

/** @param {'place'|'attention'|'body'|string} strand @param {Palette} palette */
export function strandColor(strand, palette) {
  return strand === 'place'
    ? palette.place
    : strand === 'attention'
      ? palette.attention
      : palette.body;
}
