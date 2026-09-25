import type { JassState, PlayerID } from './types';

type CubeState = Pick<JassState, 'settings' | 'cube' | 'cubeOffer' | 'gameResult' | 'matchResult' | 'matchPaused'>;

export function canDouble(G: CubeState, phase: string | null, currentPlayer: string, playerID: PlayerID): boolean {
  return (phase === 'trumpSelection' || phase === 'playing')
    && currentPlayer === playerID
    && G.settings.cubeEnabled
    && !G.cubeOffer && !G.gameResult && !G.matchResult && !G.matchPaused
    && (G.cube.holder === null || G.cube.holder === playerID);
}
