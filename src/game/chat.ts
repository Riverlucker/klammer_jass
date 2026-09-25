import { RANKS, type Card, type Rank, type Suit } from './constants';
import { MELD_TYPES, type ChatMessage, type JassState, type MeldType, type PlayerID, type ServerGameState } from './types';
import { isCard, isSuit } from './validation';

export const MAX_CHAT_MESSAGE_LENGTH = 280;
export const MAX_CHAT_MESSAGES = 200;

interface CommentedAction {
  move: string;
  args: unknown[];
  playerID: PlayerID;
}

const SUIT_NAMES: Record<Suit, string> = {
  Spades: '♠',
  Hearts: '♥',
  Diamonds: '♦',
  Clubs: '♣',
};

export function formatSuitNames(text: string): string {
  const symbols: Record<string, string> = { Pik: '♠', Herz: '♥', Karo: '♦', Kreuz: '♣' };
  return text.replace(/\b(Pik|Herz|Karo|Kreuz)\b/g, (suit) => symbols[suit]);
}

function exchangedCard(state: ServerGameState): string {
  const card = state.G.revealedCard;
  const article = card?.rank === 'A' ? 'das' : card && ['J', 'K'].includes(card.rank) ? 'den' : 'die';
  return card ? `${article} ${SUIT_NAMES[card.suit]} ${RANK_NAMES[card.rank]}` : 'die offene Karte';
}

const RANK_NAMES: Record<Rank, string> = {
  '7': 'Sieben',
  '8': 'Acht',
  '9': 'Neun',
  '10': 'Zehn',
  J: 'Bube',
  Q: 'Dame',
  K: 'König',
  A: 'Ass',
};

export function appendPlayerChat(
  state: ServerGameState,
  playerId: PlayerID,
  text: string,
  now = Date.now(),
): ServerGameState {
  const normalized = text.trim().slice(0, MAX_CHAT_MESSAGE_LENGTH);
  if (!normalized) return state;
  const nextState = structuredClone(state);
  appendMessage(nextState.G, {
    kind: 'player',
    playerId,
    speech: 'chat',
    text: normalized,
    createdAt: now,
  });
  return nextState;
}

export function appendDealerComments(
  previous: ServerGameState,
  next: ServerGameState,
  action: CommentedAction,
  now = Date.now(),
) {
  const melds = declaredMelds(action);
  if (melds.length > 0) {
    next.G.meldAnnouncement = {
      playerId: action.playerID,
      melds,
      createdAt: now,
    };
  }
  for (const text of describeAction(previous, next, action)) {
    const speech = speechCategory(action.move, text);
    appendMessage(next.G, {
      kind: 'dealer',
      playerId: speech ? action.playerID : null,
      ...(speech ? { speech, speechText: directSpeech(previous, next, action, text) } : {}),
      text,
      createdAt: now,
    });
  }
  const sameHand = previous.G.gameNumber === next.G.gameNumber && previous.G.handNumber === next.G.handNumber;
  const newDeal = next.ctx.phase === 'trumpSelection' && (
    previous.ctx.phase !== 'trumpSelection' || !sameHand || previous.G.redealCount !== next.G.redealCount
  );
  if (newDeal && next.G.revealedCard) {
    const card = next.G.revealedCard;
    appendMessage(next.G, {
      kind: 'dealer', playerId: null,
      text: `${card.rank} ${SUIT_NAMES[card.suit]} liegt offen.`,
      createdAt: now,
    });
  }
  const newMelds = next.G.shownMelds.slice(sameHand ? previous.G.shownMelds.length : 0);
  for (const meld of newMelds) {
    if (meld.type === 'Bella') continue;
    const cards = [...meld.cards].sort((a, b) => RANKS.indexOf(b.rank) - RANKS.indexOf(a.rank));
    const symbols: Record<Suit, string> = { Hearts: '♥', Diamonds: '♦', Clubs: '♣', Spades: '♠' };
    appendMessage(next.G, {
      kind: 'dealer',
      playerId: meld.player,
      speech: 'meld',
      meldCards: cards,
      text: `${meld.type} geht ${cards.map((card) => `${symbols[card.suit]} ${card.rank}`).join(', ')}`,
      createdAt: now,
    });
  }
}

function directSpeech(previous: ServerGameState, next: ServerGameState, action: CommentedAction, text: string): string {
  switch (action.move) {
    case 'chooseTrump': return isSuit(action.args[0]) ? `${SUIT_NAMES[action.args[0]]}!` : text;
    case 'acceptOriginal': return 'Original!';
    case 'decline': return previous.G.trumpSelectionPassedCount < 2 ? 'Nein!'
      : previous.G.trumpSelectionPassedCount === 2 ? 'Immer noch nicht!' : 'Neu geben!';
    case 'announceSmallGame': return 'Ein Kleines!';
    case 'acceptSmallGame': return 'Du darfst wählen!';
    case 'overruleSmallGame': return 'Ich spiele ♣!';
    case 'exchangeTrumpSeven': return `Ich nehme mir ${exchangedCard(previous)} mit der 7!`;
    case 'respondMeld': return meldResponse(action.args);
    case 'nameMeld': return next.G.meldContest?.namedRank ? `Bis ${RANK_NAMES[next.G.meldContest.namedRank]}!` : text;
    case 'resolveMeldContest': return action.args[0] === 'show' ? 'Meine ist höher!' : 'Deine ist gut!';
    case 'playCard': return `${text.split(' meldet ').at(-1)?.replace(/\.$/, '')}!`;
    default: return text;
  }
}

function speechCategory(move: string, text: string): ChatMessage['speech'] {
  switch (move) {
    case 'acceptOriginal':
    case 'announceSmallGame':
    case 'acceptSmallGame':
    case 'overruleSmallGame':
    case 'chooseTrump':
    case 'exchangeTrumpSeven':
      return 'trump';
    case 'decline':
      return text.startsWith('Alle haben gepasst') ? undefined : 'trump';
    case 'playCard':
      return text.includes(' meldet ') ? 'meld' : undefined;
    case 'respondMeld':
    case 'nameMeld':
    case 'resolveMeldContest':
      return 'meld';
    default:
      return undefined;
  }
}

function declaredMelds(action: CommentedAction): MeldType[] {
  if (action.move !== 'playCard' || !Array.isArray(action.args[1])) return [];
  return action.args[1].filter(
    (value): value is MeldType => typeof value === 'string' && MELD_TYPES.includes(value as MeldType),
  );
}

function appendMessage(
  G: JassState,
  message: Omit<ChatMessage, 'id'>,
) {
  G.chatMessages ??= [];
  G.chatSequence = (G.chatSequence ?? 0) + 1;
  G.chatMessages.push({
    id: G.chatSequence,
    ...message,
    gameNumber: G.gameNumber,
    handNumber: G.handNumber,
  });
  if (G.chatMessages.length > MAX_CHAT_MESSAGES) {
    G.chatMessages.splice(0, G.chatMessages.length - MAX_CHAT_MESSAGES);
  }
}

function describeAction(
  previous: ServerGameState,
  next: ServerGameState,
  action: CommentedAction,
): string[] {
  const player = playerName(previous.G, action.playerID);
  switch (action.move) {
    case 'startPlaying':
      return [];
    case 'inspectLastTrick': {
      const trick = next.G.pastTricks.at(-1);
      if (!trick) return [];
      const symbols: Record<Suit, string> = { Hearts: '♥', Diamonds: '♦', Clubs: '♣', Spades: '♠' };
      const cards = [trick.cards[trick.leadPlayer], trick.cards[trick.leadPlayer === '0' ? '1' : '0']].filter(isCard);
      return [`${player} schaut letzten Stich: ${cards.map((card) => `${symbols[card.suit]} ${card.rank === '10' ? 'T' : card.rank}`).join(', ')}`];
    }
    case 'setReady':
      return [`${player} ist bereit.`];
    case 'nextHand':
      return [`${player} ist bereit für die nächste Hand.`];
    case 'acceptOriginal':
      return previous.G.revealedCard
        ? [`${player} spielt Original. ${SUIT_NAMES[previous.G.revealedCard.suit]} ist Trumpf.`]
        : [`${player} spielt Original.`];
    case 'decline': {
      const refusal = previous.G.trumpSelectionPassedCount < 2 ? `${player} sagt Nein.`
        : previous.G.trumpSelectionPassedCount === 2 ? `${player} sagt „Immer noch nicht“.`
          : `${player} lässt neu geben.`;
      return next.G.redealCount > previous.G.redealCount
        ? [refusal, 'Alle haben gepasst – der Dealer gibt neu.']
        : [refusal];
    }
    case 'announceSmallGame':
      return [`${player} sagt ein Kleines an.`];
    case 'acceptSmallGame':
      return [`${player} gibt die freie Trumpfwahl weiter.`];
    case 'overruleSmallGame':
      return [`${player} übernimmt das Kleine. ♣ ist Trumpf.`];
    case 'chooseTrump': {
      const suit = isSuit(action.args[0]) ? action.args[0] : next.G.trump;
      return suit ? [`${player} wählt ${SUIT_NAMES[suit]} als Trumpf.`] : [];
    }
    case 'exchangeTrumpSeven':
      return [`${player} nimmt sich ${exchangedCard(previous)} mit der 7.`];
    case 'keepTrumpSeven':
      return [];
    case 'doubleCube':
      return [`${player} dreht den Würfel auf ${previous.G.cube.value * 2}.`];
    case 'acceptCube':
      return [`${player} nimmt den Dreher an. Der Würfel steht jetzt auf ${next.G.cube.value}.`];
    case 'declineCube':
      return [`${player} lehnt den Dreher ab.`];
    case 'playCard':
      return describeCardPlay(previous, next, action);
    case 'respondMeld':
      return [`${player} antwortet: „${meldResponse(action.args)}“.`];
    case 'nameMeld':
      return next.G.meldContest?.namedRank
        ? [`${player} nennt ${RANK_NAMES[next.G.meldContest.namedRank]} als höchste Karte.`]
        : [];
    case 'resolveMeldContest':
      return [action.args[0] === 'show'
        ? `${player} zeigt die höhere Folge.`
        : `${player} bestätigt die erste Meldung.`];
    case 'nextGame':
      return [`${player} ist bereit für das nächste Spiel.`];
    case 'endMatch':
      return [`${player} beendet das Match.`];
    case 'pauseMatch':
      return ['Der Dealer pausiert das Match.'];
    case 'interruptMatch':
      return ['Spiel unterbrochen: Beide Spieler haben dreimal in Folge nicht rechtzeitig geantwortet.'];
    case 'resumeMatch':
      return [`${player} möchte das Match fortsetzen.`];
    default:
      return [`${player} führt ${action.move} aus.`];
  }
}

function describeCardPlay(
  previous: ServerGameState,
  next: ServerGameState,
  action: CommentedAction,
): string[] {
  const card = isCard(action.args[0]) ? action.args[0] : null;
  if (!card) return [];
  const player = playerName(previous.G, action.playerID);
  const messages = [`${player} spielt ${cardName(card)}.`];
  const declarations = Array.isArray(action.args[1]) ? action.args[1] : [];
  for (const declaration of declarations) {
    if (declaration === 'Terz' || declaration === 'Fünfzig' || declaration === 'Bella') {
      messages.push(`${player} meldet ${declaration}.`);
    }
  }
  if (next.G.pastTricks.length > previous.G.pastTricks.length) {
    const winner = next.G.pastTricks.at(-1)?.winner;
    if (winner) messages.push(`${playerName(next.G, winner)} gewinnt den Stich.`);
  }
  if (!previous.G.lastHandResult && next.G.lastHandResult) {
    messages.push(`Die Hand endet ${next.G.handScores['0']} zu ${next.G.handScores['1']}.`);
  }
  return messages;
}

function playerName(G: JassState, playerId: PlayerID): string {
  return G.playerNames?.[playerId] ?? (playerId === '0' ? 'Host' : 'Gast');
}

function cardName(card: Card): string {
  return `${SUIT_NAMES[card.suit]} ${RANK_NAMES[card.rank]}`;
}

function meldResponse(args: unknown[]): string {
  if (args[0] === 'good' && typeof args[1] === 'string') return args[1];
  if (args[0] === 'meToo') return 'Ich auch';
  if (args[0] === 'notGood') return 'Ist nicht gut';
  return 'Antwort abgegeben';
}
