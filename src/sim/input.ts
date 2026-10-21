// One player's input for one frame: a bitmask of held keys.

export type Input = number;

export const NO_INPUT: Input = 0;

export const KEYS = ['q', 'w', 'o', 'p', 'e', 'r'] as const;
export type Key = (typeof KEYS)[number];

export function bit(key: Key): Input {
  return 1 << KEYS.indexOf(key);
}

export function held(input: Input, key: Key): boolean {
  return (input & bit(key)) !== 0;
}

export function fromKeys(keys: Iterable<Key>): Input {
  let input = NO_INPUT;
  for (const k of keys) input |= bit(k);
  return input;
}
