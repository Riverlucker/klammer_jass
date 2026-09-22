export const GOOD_MELD_REPLIES = [
  'Bravo',
  'Glückwunsch',
  'Du Glückspilz',
  'Ist gut',
  'Jaja - passt',
  'Kann ich leider nicht',
] as const;

export type GoodMeldReply = (typeof GOOD_MELD_REPLIES)[number];

export function isGoodMeldReply(value: unknown): value is GoodMeldReply {
  return typeof value === 'string' && GOOD_MELD_REPLIES.includes(value as GoodMeldReply);
}

export function meldReplySeed(gameNumber: number, handNumber: number, dealer: string): number {
  return gameNumber * 101 + handNumber * 17 + Number(dealer);
}

export function getGoodMeldReplyOptions(seed: number): [GoodMeldReply, GoodMeldReply] {
  const firstIndex = Math.abs(seed) % GOOD_MELD_REPLIES.length;
  const secondIndex = (firstIndex + 1 + (Math.abs(seed) % (GOOD_MELD_REPLIES.length - 1))) % GOOD_MELD_REPLIES.length;
  return [GOOD_MELD_REPLIES[firstIndex], GOOD_MELD_REPLIES[secondIndex]];
}
