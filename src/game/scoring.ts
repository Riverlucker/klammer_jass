import type {
  GameResult,
  HandResult,
  MatchSettings,
  PlayerID,
  ScoreDetails,
} from './types';
import { otherPlayer } from './types';

interface SettleHandInput {
  handScores: Record<PlayerID, number>;
  scoreDetails: Record<PlayerID, ScoreDetails>;
  currentScores: Record<PlayerID, number>;
  currentMatchPoints: Record<PlayerID, number>;
  declarer: PlayerID;
  dealer: PlayerID;
  cubeValue: number;
  settings: MatchSettings;
}

interface SettleHandOutput {
  handResult: HandResult;
  nextScores: Record<PlayerID, number>;
  nextMatchPoints: Record<PlayerID, number>;
  gameResult: GameResult | null;
}

export function settlePlayedHand(input: SettleHandInput): SettleHandOutput {
  const baseScores = { ...input.handScores };
  const defender = otherPlayer(input.declarer);
  const declarerFailed = baseScores[input.declarer] <= baseScores[defender];
  const awardedScores: Record<PlayerID, number> = declarerFailed
    ? {
        [input.declarer]: 0,
        [defender]: baseScores['0'] + baseScores['1'],
      } as Record<PlayerID, number>
    : { ...baseScores };
  const winner = declarerFailed ? defender : input.declarer;
  const dealerForNextHand = getDealerForNextHand(baseScores, input.dealer);
  const nextScores: Record<PlayerID, number> = {
    '0': input.currentScores['0'] + awardedScores['0'],
    '1': input.currentScores['1'] + awardedScores['1'],
  };
  const completedGame = settleTargetGame(
    nextScores,
    input.currentMatchPoints,
    input.cubeValue,
    input.settings,
  );

  return {
    handResult: {
      baseScores,
      awardedScores,
      winner,
      declarerFailed,
      dealerForNextHand,
    },
    nextScores,
    nextMatchPoints: completedGame.nextMatchPoints,
    gameResult: completedGame.gameResult,
  };
}

export function settleDeclinedCube(
  winner: PlayerID,
  scores: Record<PlayerID, number>,
  currentMatchPoints: Record<PlayerID, number>,
  cubeValue: number,
  stake: number,
): { gameResult: GameResult; nextMatchPoints: Record<PlayerID, number> } {
  const loser = otherPlayer(winner);
  const points = stake * cubeValue;
  const awardedMatchPoints: Record<PlayerID, number> = { '0': 0, '1': 0 };
  awardedMatchPoints[winner] = points;
  return {
    gameResult: {
      winner,
      loser,
      finalScores: { ...scores },
      awardedMatchPoints,
      cubeValue,
      schneider: false,
      reason: 'cube-declined',
    },
    nextMatchPoints: {
      '0': currentMatchPoints['0'] + awardedMatchPoints['0'],
      '1': currentMatchPoints['1'] + awardedMatchPoints['1'],
    },
  };
}

export function initialGameScores(handicap: number): Record<PlayerID, number> {
  return handicap >= 0
    ? { '0': 0, '1': handicap }
    : { '0': Math.abs(handicap), '1': 0 };
}

function settleTargetGame(
  scores: Record<PlayerID, number>,
  currentMatchPoints: Record<PlayerID, number>,
  cubeValue: number,
  settings: MatchSettings,
): { gameResult: GameResult | null; nextMatchPoints: Record<PlayerID, number> } {
  const winner = getGameWinner(scores, settings.targetScore);
  if (winner === undefined) {
    return { gameResult: null, nextMatchPoints: { ...currentMatchPoints } };
  }

  const loser = winner === null ? null : otherPlayer(winner);
  const schneider = winner !== null && loser !== null && shouldApplySchneider(
    settings.schneiderRule,
    cubeValue,
    scores[loser],
    settings.targetScore,
  );
  const awardedMatchPoints: Record<PlayerID, number> = { '0': 0, '1': 0 };
  if (winner !== null) {
    awardedMatchPoints[winner] = settings.stake * cubeValue * (schneider ? 2 : 1);
  }

  return {
    gameResult: {
      winner,
      loser,
      finalScores: { ...scores },
      awardedMatchPoints,
      cubeValue,
      schneider,
      reason: 'target-reached',
    },
    nextMatchPoints: {
      '0': currentMatchPoints['0'] + awardedMatchPoints['0'],
      '1': currentMatchPoints['1'] + awardedMatchPoints['1'],
    },
  };
}

function getGameWinner(
  scores: Record<PlayerID, number>,
  targetScore: number,
): PlayerID | null | undefined {
  const reached0 = scores['0'] >= targetScore;
  const reached1 = scores['1'] >= targetScore;
  if (!reached0 && !reached1) return undefined;
  if (reached0 && reached1 && scores['0'] === scores['1']) return null;
  return scores['0'] > scores['1'] ? '0' : '1';
}

function shouldApplySchneider(
  rule: MatchSettings['schneiderRule'],
  cubeValue: number,
  loserScore: number,
  targetScore: number,
): boolean {
  if (rule === 'no' || loserScore >= Math.ceil(targetScore / 2)) return false;
  return rule === 'yes' || cubeValue > 1;
}

function getDealerForNextHand(
  scores: Record<PlayerID, number>,
  currentDealer: PlayerID,
): PlayerID {
  if (scores['0'] === scores['1']) return currentDealer;
  return scores['0'] > scores['1'] ? '0' : '1';
}
