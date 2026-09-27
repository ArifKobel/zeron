const FLAVOUR_WORDS = [
  'Zeroning', 'Thinking', 'Pondering', 'Scheming', 'Brewing', 'Weaving', 'Tinkering', 'Musing', 'Composing', 'Sifting',
  'Untangling', 'Distilling', 'Sketching', 'Plotting', 'Riffing', 'Combobulating', 'Percolating', 'Marinating',
  'Noodling', 'Puzzling', 'Conjuring',
];
const FLAVOUR_PERIOD_MS = 7_000;

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

export function flavourWord(chatId: string, elapsedMs: number): string {
  return FLAVOUR_WORDS[(fnv1a(chatId) + Math.floor(elapsedMs / FLAVOUR_PERIOD_MS)) % FLAVOUR_WORDS.length];
}
