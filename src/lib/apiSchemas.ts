import { z } from 'zod';
import { MELD_TYPES } from '../game/types';
import { isGoodMeldReply } from '../game/meldReplies';
import { isCard, isSuit } from '../game/validation';
import { MAX_CHAT_MESSAGE_LENGTH } from '../game/chat';

const TARGET_SCORES = [301, 401, 501, 601, 701, 801, 901, 1001] as const;
const MOVE_TIMES = Array.from({ length: 11 }, (_, index) => 10 + index * 5);
const CUBE_TIMES = Array.from({ length: 7 }, (_, index) => 30 + index * 15);
const playerNameSchema = z.string()
  .trim()
  .min(1)
  .max(32)
  .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value));
const passwordSchema = z.string()
  .max(128)
  .transform((value) => value.trim().length === 0 ? '' : value)
  .refine((value) => value.length === 0 || value.length >= 4);
const avatarSchema = z.number().int().min(0).max(15).nullable().optional();
const MOVE_NAMES = [
  'prepareCard',
  'inspectLastTrick',
  'setReady',
  'nextHand',
  'acceptOriginal',
  'decline',
  'announceSmallGame',
  'acceptSmallGame',
  'overruleSmallGame',
  'chooseTrump',
  'exchangeTrumpSeven',
  'keepTrumpSeven',
  'doubleCube',
  'acceptCube',
  'declineCube',
  'playCard',
  'respondMeld',
  'nameMeld',
  'resolveMeldContest',
  'nextGame',
  'endMatch',
  'resumeMatch',
] as const;

export const createMatchSchema = z.object({
  avatar: avatarSchema,
  playerName: playerNameSchema,
  password: passwordSchema,
  targetScore: z.coerce.number().int().refine((value) => TARGET_SCORES.includes(value as (typeof TARGET_SCORES)[number])),
  stake: z.coerce.number().int().min(1).max(1000),
  handicap: z.coerce.number().int().min(-1000).max(1000),
  schneiderRule: z.enum(['yes', 'no', 'only_if_doubled']),
  cubeEnabled: z.union([z.boolean(), z.enum(['enabled', 'disabled'])]).transform((value) => value === true || value === 'enabled'),
  moveTimeSeconds: z.coerce.number().int().refine((value) => MOVE_TIMES.includes(value)),
  cubeTimeSeconds: z.coerce.number().int().refine((value) => CUBE_TIMES.includes(value)),
}).strict();

export const joinMatchSchema = z.object({
  avatar: avatarSchema,
  playerName: playerNameSchema,
  password: passwordSchema,
}).strict();

const moveRequestSchema = z.object({
  matchId: z.string().uuid(),
  move: z.enum(MOVE_NAMES),
  args: z.array(z.unknown()).max(2).default([]),
  stateID: z.number().int().nonnegative(),
}).strict();

export type ParsedMoveRequest = z.infer<typeof moveRequestSchema>;

export function parseMoveRequest(value: unknown) {
  const parsed = moveRequestSchema.safeParse(value);
  if (!parsed.success) return parsed;

  const { move, args } = parsed.data;
  let valid = false;
  if (move === 'chooseTrump') {
    valid = args.length === 1 && isSuit(args[0]);
  } else if (move === 'respondMeld') {
    valid = (
      args[0] === 'good'
        ? args.length === 2 && isGoodMeldReply(args[1])
        : args.length === 1 && ['meToo', 'notGood'].includes(String(args[0]))
    );
  } else if (move === 'resolveMeldContest') {
    valid = args.length === 1 && ['show', 'concede'].includes(String(args[0]));
  } else if (move === 'prepareCard' && args.length === 0) {
    valid = true;
  } else if (move === 'playCard' || move === 'prepareCard') {
    valid = args.length >= 1 && isCard(args[0]) && (
      args.length === 1 || (
        Array.isArray(args[1]) &&
        args[1].length <= 2 &&
        args[1].every((item) => typeof item === 'string' && MELD_TYPES.includes(item as (typeof MELD_TYPES)[number]))
      )
    );
  } else {
    valid = args.length === 0;
  }

  if (!valid) {
    return {
      success: false as const,
      error: new z.ZodError([{ code: 'custom', path: ['args'], message: 'Ungültige Zugargumente.' }]),
    };
  }
  return parsed;
}

const chatRequestSchema = z.object({
  matchId: z.string().uuid(),
  message: z.string().trim().min(1).max(MAX_CHAT_MESSAGE_LENGTH),
}).strict();

export function parseChatRequest(value: unknown) {
  return chatRequestSchema.safeParse(value);
}
