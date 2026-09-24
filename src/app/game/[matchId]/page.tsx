'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { NON_TRUMP_ORDER, RANKS, SUITS, TRUMP_ORDER, type Card, type Suit } from '@/game/constants';
import { groupChatMessages } from '@/game/chatGroups';
import { revealedMeldCards } from '@/game/meldReveal';
import { extraCardPhase } from '@/game/extraDeal';
import { canExchangeTrumpSeven } from '@/game/trumpSeven';
import {
  otherPlayer,
  type MeldDecision,
  type MeldType,
  type PlayerID,
  type PlayerJassState,
  type ScoreDetails,
  type ChatMessage,
  type Trick,
} from '@/game/types';
import { getGoodMeldReplyOptions, meldReplySeed } from '@/game/meldReplies';
import {
  getAvailableMeldTypes,
  getBestSequenceMeld,
  getExpectedMeldResponse,
  isMoveLegal,
} from '@/game/validation';
import {
  MELD_DECISION_LABELS,
  MELD_RESPONSE_LABELS,
  useJassGame,
} from '../useJassGame';
import styles from './game.module.css';

const SUIT_SYMBOLS: Record<Suit, string> = { Spades: '♠', Hearts: '♥', Diamonds: '♦', Clubs: '♣' };
const SUIT_NAMES: Record<Suit, string> = { Spades: 'Pik', Hearts: 'Herz', Diamonds: 'Karo', Clubs: 'Kreuz' };
const PHASE_NAMES: Record<string, string> = {
  waitingRoom: 'Warteraum',
  deal: 'Geben',
  trumpSelection: 'Trumpf wählen',
  playing: 'Stich spielen',
  endOfHand: 'Hand beendet',
  endOfGame: 'Spiel beendet',
};

export default function GamePage() {
  const { matchId } = useParams<{ matchId: string }>();
  return <GameTable key={matchId} matchId={matchId} />;
}

function GameTable({ matchId }: { matchId: string }) {
  const router = useRouter();
  const {
    state,
    playerId,
    loading,
    isSending,
    isChatSending,
    error,
    remainingMilliseconds,
    remainingSeconds,
    trickDisplayMilliseconds,
    displayedTrick,
    inspectingLastTrick,
    extraDealMilliseconds,
    extraDealElapsedMilliseconds,
    now,
    clearError,
    dispatchMove: sendMove,
    sendChat,
  } = useJassGame(matchId);
  const [pendingSelection, setPendingSelection] = useState<{ card: Card; turn: number } | null>(null);
  const pendingCard = state && state.ctx.currentPlayer === playerId && state.ctx.phase === 'playing'
    && pendingSelection?.turn === state.ctx.turn && (!state.G.meldContest || state.G.meldContest.stage === 'dealerPlay')
    && state.G.hands[playerId!].some((card) => sameCard(card, pendingSelection.card))
    ? pendingSelection.card : null;
  const [selectedMelds, setSelectedMelds] = useState<MeldType[]>([]);
  const [copied, setCopied] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteCopyError, setInviteCopyError] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'score' | 'chat' | null>(null);
  const scoreToggle = useRef<HTMLButtonElement>(null);
  const chatToggle = useRef<HTMLButtonElement>(null);
  function closeMobilePanel() {
    (mobilePanel === 'score' ? scoreToggle : chatToggle).current?.focus();
    setMobilePanel(null);
  }
  useEffect(() => {
    if (!mobilePanel) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      (mobilePanel === 'score' ? scoreToggle : chatToggle).current?.focus();
      setMobilePanel(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobilePanel]);
  const dispatchMove: DispatchMove = async (move, args = []) => {
    const success = await sendMove(move, args);
    if (success && move === 'exchangeTrumpSeven') {
      setPendingSelection(null);
      setSelectedMelds([]);
    }
    if (success && move === 'endMatch') router.replace('/');
    return success;
  };

  if (loading) return <CenteredState title="Karten werden gemischt …" detail="Der aktuelle Spielstand wird sicher geladen." />;
  if (!state || !playerId) {
    return <CenteredState title="Kein Zugang zu diesem Tisch" detail={error ?? 'Das Match konnte nicht geladen werden.'} action />;
  }

  const activePlayerId: PlayerID = playerId;
  const { G, ctx } = state;
  const opponentId: PlayerID = playerId === '0' ? '1' : '0';
  const fullHand = G.hands[playerId];
  const extraDealActive = extraDealMilliseconds > 0 && extraDealElapsedMilliseconds !== null;
  const extraDealCards = extraDealActive ? fullHand.slice(-3) : [];
  const extraElapsed = extraDealElapsedMilliseconds ?? 0;
  const extraCardPhases = extraDealCards.map((_, index) => extraCardPhase(index, extraElapsed));
  const revealedExtraCardCount = extraCardPhases.filter((phase) => phase !== 'back').length;
  const allExtraCardsInserted = extraDealActive && extraCardPhases.every((phase) => phase === 'inserted');
  const insertedExtraCards = allExtraCardsInserted ? extraDealCards : [];
  const baseHand = extraDealActive
    ? fullHand.filter((card) => !extraDealCards.some((extra) => sameCard(card, extra)))
    : fullHand;
  const hand = sortHand([...baseHand, ...insertedExtraCards], G.trump);
  const myTurn = ctx.currentPlayer === playerId;
  const canRobNow = ctx.phase === 'playing' && myTurn && canExchangeTrumpSeven(G, playerId);
  const gameOver = Boolean(G.matchResult || ctx.gameover !== undefined);
  const inspectedTrick = inspectingLastTrick ? displayedTrick : null;
  const presentedTrick = !inspectingLastTrick ? displayedTrick : null;
  const tableTrick = presentedTrick ?? G.currentTrick;
  const hasTableTrick = Object.keys(tableTrick.cards).length > 0;
  const presentedWinner = presentedTrick?.winner ?? null;
  const collectingTrick = trickDisplayMilliseconds > 0 && trickDisplayMilliseconds <= 700;
  const settlementVisible = !presentedTrick && (ctx.phase === 'endOfHand' || ctx.phase === 'endOfGame');
  const canDouble = trickDisplayMilliseconds <= 0 && !extraDealActive && canPlayerDouble(G, ctx.phase ?? null, ctx.currentPlayer, playerId);
  const cardsBlocked = canRobNow || trickDisplayMilliseconds > 0 || extraDealActive || cardPlayBlocked(G, playerId);
  const myVisibleTricks = Math.max(0, trickCount(G.pastTricks, playerId) - (presentedWinner === playerId ? 1 : 0));
  const opponentVisibleTricks = Math.max(0, trickCount(G.pastTricks, opponentId) - (presentedWinner === opponentId ? 1 : 0));
  const canInspectLastTrick = ctx.phase === 'playing' && trickDisplayMilliseconds <= 0 && !extraDealActive
    && !G.cubeOffer && !G.matchPaused && !isSending;
  const deadline = {
    remainingMilliseconds,
    totalSeconds: G.cubeOffer ? G.settings.cubeTimeSeconds : G.settings.moveTimeSeconds,
  };
  const avatarSpeech = latestAvatarSpeech(G.chatMessages ?? [], now);

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(matchId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // The visible ID remains selectable when clipboard access is unavailable.
    }
  }

  async function copyInviteLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/invite/${matchId}`);
      setInviteCopied(true);
      setInviteCopyError(false);
      window.setTimeout(() => setInviteCopied(false), 1800);
    } catch {
      setInviteCopyError(true);
    }
  }

  function availableMeldsFor(card: Card): MeldType[] {
    if (!G.trump) return [];
    return getAvailableMeldTypes(fullHand, G.trump, activePlayerId).filter((type) => {
      if (type === 'Bella') {
        return !G.announcedBella.includes(activePlayerId) && card.suit === G.trump && (card.rank === 'K' || card.rank === 'Q');
      }
      return G.pastTricks.length === 0 && !G.meldContest;
    });
  }

  function selectCard(card: Card, legal: boolean) {
    if (!legal || !myTurn || isSending || cardsBlocked) return;
    const melds = availableMeldsFor(card);
    if (melds.length === 0) {
      void dispatchMove('playCard', [card]);
      return;
    }
    setPendingSelection({ card, turn: ctx.turn });
    setSelectedMelds(melds);
    void dispatchMove('prepareCard', [card, melds]).then((saved) => { if (!saved) setPendingSelection(null); });
  }

  function toggleMeld(type: MeldType) {
    if (!pendingCard || isSending) return;
    const melds = selectedMelds.includes(type) ? selectedMelds.filter((item) => item !== type)
      : type === 'Bella' ? [...selectedMelds, type] : [...selectedMelds.filter((item) => item === 'Bella'), type];
    setSelectedMelds(melds);
    void dispatchMove('prepareCard', [pendingCard, melds]).then((saved) => { if (!saved) setSelectedMelds(selectedMelds); });
  }

  async function confirmCard() {
    if (!pendingCard) return;
    const success = await dispatchMove('playCard', [pendingCard, selectedMelds]);
    if (success) {
      setPendingSelection(null);
      setSelectedMelds([]);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <nav className={styles.mobileControls} aria-label="Tischansicht">
          <button ref={scoreToggle} type="button" aria-expanded={mobilePanel === 'score'} aria-controls="table-score" onClick={() => setMobilePanel(mobilePanel === 'score' ? null : 'score')}>Punkte</button>
          {!gameOver && ctx.phase !== 'waitingRoom' && <button ref={chatToggle} type="button" aria-expanded={mobilePanel === 'chat'} aria-controls="table-chat" onClick={() => setMobilePanel(mobilePanel === 'chat' ? null : 'chat')}>Chat</button>}
          <span>Spiel {G.gameNumber} · Hand {G.handNumber}</span>
        </nav>
        <div id="table-score" className={styles.headerDetails} data-open={mobilePanel === 'score'}>
          <button type="button" className={styles.panelClose} onClick={closeMobilePanel} aria-label="Punktestand schließen">×</button>
          <div className={styles.headerContext}>
            <p className="eyebrow">Spiel {G.gameNumber} · Hand {G.handNumber} · {PHASE_NAMES[ctx.phase ?? ''] ?? 'Match beendet'}</p>
            <div className={styles.matchId}>
              <span title={matchId}>{shortId(matchId)}</span>
              <button type="button" onClick={copyInvite}>{copied ? 'Kopiert' : 'ID kopieren'}</button>
            </div>
            <button type="button" className={styles.inviteLinkButton} onClick={() => void copyInviteLink()}>{inviteCopied ? 'Link kopiert' : 'Einladungslink kopieren'}</button>
            {inviteCopyError && <p role="alert">Kopieren nicht möglich. <Link href={`/invite/${matchId}`}>Einladungslink öffnen</Link></p>}
          </div>
          <div className={styles.headerScoreStrip}>
            <div className={styles.headerPlayer} data-side="left">
              <small>Spieler 1</small>
              <strong>{gamePlayerName(G, '0')}</strong>
            </div>
            <ScoreBoard G={G} />
            <div className={styles.headerPlayer} data-side="right">
              <small>Spieler 2</small>
              <strong>{gamePlayerName(G, '1')}</strong>
            </div>
          </div>
        </div>
        <div className={styles.headerStatus}>
          <Deadline seconds={remainingSeconds} cube={Boolean(G.cubeOffer)} trickDisplayMilliseconds={trickDisplayMilliseconds} extraDealMilliseconds={extraDealMilliseconds} />
        </div>
      </header>

      {error && (
        <div className="notice notice-error" role="alert">
          <span>{error}</span>
          <button type="button" className={styles.dismiss} onClick={clearError} aria-label="Fehlermeldung schließen">×</button>
        </div>
      )}

      {gameOver ? (
        <MatchEnd G={G} playerId={playerId} />
      ) : ctx.phase === 'waitingRoom' ? (
        <WaitingRoom G={G} playerId={playerId} isSending={isSending} onReady={() => void dispatchMove('setReady')} />
      ) : (
        <div className={styles.gameLayout} data-settlement={settlementVisible}>
          <section
            className={styles.table}
            data-game-table
            data-settlement={settlementVisible}
            data-static-settlement={settlementVisible && G.matchPaused}
          >
          <OpponentArea
            name={gamePlayerName(G, opponentId)}
            count={G.handCounts[opponentId]}
            revealedCards={revealedMeldCards(G, opponentId, now)}
            tricks={opponentVisibleTricks}
            inspectedTrick={inspectedTrick?.winner === opponentId ? inspectedTrick : null}
            onInspect={canInspectLastTrick && G.pastTricks.at(-1)?.winner === opponentId ? () => void dispatchMove('inspectLastTrick') : undefined}
            speech={avatarSpeech?.playerId === opponentId ? avatarSpeech : null}
          />

          <div className={styles.center}>
            <div className={styles.tableScene}>
              {!settlementVisible && (
                <TalonAndOriginal
                  card={G.revealedCard}
                  talonCount={G.talonCount}
                  tucked={G.contract === 'small'}
                />
              )}
              <div className={styles.trickSlot}>
                {hasTableTrick && (
                  <CurrentTrick
                    trick={tableTrick}
                    playerId={playerId}
                    collecting={Boolean(presentedTrick) && collectingTrick}
                  />
                )}
              </div>
            </div>
          </div>

          <section className={styles.playerArea} aria-label="Deine Hand">
            {canDouble && !G.cubeOffer && (
              <div className={styles.playerActions}>
                <button className="button" type="button" disabled={isSending} onClick={() => void dispatchMove('doubleCube')}>
                  {G.afterMoveDoubleBy === playerId && !myTurn ? 'Nach dem Zug drehen' : 'Vor dem Zug drehen'}
                </button>
              </div>
            )}
            <div className={styles.playerActionField}>
            {extraDealActive ? (
              <StatusCard
                title="Drei neue Karten"
                detail={allExtraCardsInserted
                  ? 'Alle drei Karten werden gemeinsam in deine Hand eingeordnet.'
                  : revealedExtraCardCount === 0
                    ? 'Alle drei Karten liegen verdeckt rechts neben deiner Hand.'
                    : `Karte ${revealedExtraCardCount} von 3 wurde aufgedeckt.`}
              />
            ) : G.matchPaused ? (
              <PausedMatch G={G} playerId={playerId} isSending={isSending} onResume={() => void dispatchMove('resumeMatch')} onEnd={() => void dispatchMove('endMatch')} />
            ) : ctx.phase === 'endOfGame' ? (
              presentedTrick
                ? null
                : <GameEnd G={G} playerId={playerId} isSending={isSending} dispatchMove={dispatchMove} deadline={deadline} />
            ) : (
              <>
                {!settlementVisible && <TableStatus G={G} playerId={playerId} myTurn={myTurn} isSending={isSending} dispatchMove={dispatchMove} deadline={deadline} />}
                {ctx.phase === 'playing' && <MeldExchange G={G} playerId={playerId} myTurn={myTurn} isSending={isSending} dispatchMove={dispatchMove} deadline={deadline} />}
                {ctx.phase === 'endOfHand' && !presentedTrick && (
                  <HandEnd G={G} playerId={playerId} isSending={isSending} onReady={() => void dispatchMove('nextHand')} deadline={deadline} />
                )}
              </>
            )}
            </div>
            <div className={styles.playerCardsRow}>
              <PlayerIdentity name={gamePlayerName(G, playerId)} owner="self" speech={avatarSpeech?.playerId === playerId ? avatarSpeech : null} />
              <div className={styles.hand} style={{ '--hand-gaps': Math.max(1, fullHand.length - 1) } as CSSProperties}>
                {hand.map((card) => {
                  const leadCard = G.currentTrick.cards[G.currentTrick.leadPlayer];
                  const legal = ctx.phase === 'playing' && Boolean(G.trump) && isMoveLegal(
                    card,
                    fullHand,
                    Object.values(G.currentTrick.cards).filter(isDefined),
                    leadCard?.suit ?? null,
                    G.trump!,
                  );
                  const highlighted = legal && myTurn && !isSending && !cardsBlocked;
                  const timeoutSelected = highlighted && Boolean(G.timeoutCard) && sameCard(card, G.timeoutCard!);
                  const freshlyDealt = extraDealActive && insertedExtraCards.some((extra) => sameCard(card, extra));
                  return (
                    <CardView
                      key={`${card.suit}-${card.rank}`}
                      card={card}
                      disabled={!legal || !myTurn || isSending || cardsBlocked}
                      highlighted={highlighted}
                      freshlyDealt={freshlyDealt}
                      preserveColor={extraDealActive}
                      deadline={timeoutSelected ? deadline : undefined}
                      onClick={() => selectCard(card, legal)}
                    />
                  );
                })}
                {extraDealActive && !allExtraCardsInserted && (
                  <div className={styles.extraCards} aria-label="Drei neue Karten rechts neben der Hand">
                    {extraDealCards.map((card, index) => extraCardPhases[index] === 'back' ? (
                      <div className={`${styles.card} ${styles.extraCardBack}`} key={`${card.suit}-${card.rank}`} aria-label={`Zusatzkarte ${index + 1} verdeckt`}><i /></div>
                    ) : (
                      <CardView key={`${card.suit}-${card.rank}`} card={card} displayOnly extraReveal />
                    ))}
                  </div>
                )}
              </div>
            </div>
            <TrickPile count={myVisibleTricks} owner="self" inspectedTrick={inspectedTrick?.winner === playerId ? inspectedTrick : null} onInspect={canInspectLastTrick && G.pastTricks.at(-1)?.winner === playerId ? () => void dispatchMove('inspectLastTrick') : undefined} />
          </section>
          </section>
          <ChatBox
            mobileOpen={mobilePanel === 'chat'}
            onClose={closeMobilePanel}
            messages={G.chatMessages ?? []}
            playerId={playerId}
            playerNames={G.playerNames}
            isSending={isChatSending}
            onSend={sendChat}
          />
        </div>
      )}

      {canRobNow && !extraDealActive && trickDisplayMilliseconds <= 0 && G.revealedCard && (
        <TrumpSevenExchange card={G.revealedCard} isSending={isSending} dispatchMove={dispatchMove} deadline={deadline} error={error} />
      )}

      {pendingCard && G.trump && !canRobNow && (
        <div className={styles.modalBackdrop} role="presentation">
          <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="meld-title">
            <p className="eyebrow">Meldung</p>
            <h2 id="meld-title">Meldung ansagen?</h2>
            <p>Alle verfügbaren Meldungen sind standardmäßig aktiviert. Eine Folgenmeldung umfasst nach dem Vergleich alle deine gültigen Terze und Fünfziger.</p>
            <div className={styles.meldChoices}>
              {availableMeldsFor(pendingCard).map((type) => (
                <label key={type}>
                  <input type="checkbox" checked={selectedMelds.includes(type)} disabled={isSending} onChange={() => toggleMeld(type)} />
                  <span>{type} · {type === 'Fünfzig' ? 50 : 20} Punkte</span>
                </label>
              ))}
            </div>
            <div className="button-row">
              <button className="button button-primary" type="button" disabled={isSending} onClick={() => void confirmCard()}>Karte legen</button>
              <button className="button" type="button" disabled={isSending} onClick={() => { void dispatchMove('prepareCard').then((saved) => { if (saved) setPendingSelection(null); }); }}>Abbrechen</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

type DispatchMove = ReturnType<typeof useJassGame>['dispatchMove'];
type DeadlineInfo = {
  remainingMilliseconds: number | null;
  totalSeconds: number;
};

function TableStatus({ G, playerId, myTurn, isSending, dispatchMove, deadline }: {
  G: PlayerJassState;
  playerId: PlayerID;
  myTurn: boolean;
  isSending: boolean;
  dispatchMove: DispatchMove;
  deadline: DeadlineInfo;
}) {
  if (G.cubeOffer) {
    if (G.cubeOffer.from === playerId) {
      return (
        <StatusCard title="Würfel angeboten" detail="Der Gegner entscheidet über die Verdopplung.">
          <TimeoutNotice deadline={deadline}>Bei 0 gibt der Gegner dieses Spiel automatisch auf.</TimeoutNotice>
        </StatusCard>
      );
    }
    return (
      <StatusCard title="Würfel angeboten" detail={`Der Einsatz soll von ${G.cube.value} auf ${G.cube.value * 2} steigen.`}>
        <button className="button button-primary" type="button" disabled={isSending} onClick={() => void dispatchMove('acceptCube')}>Annehmen</button>
        <TimedDecision deadline={deadline} label="Automatisch bei 0">
          <button className="button button-danger" type="button" disabled={isSending} onClick={() => void dispatchMove('declineCube')}>Spiel aufgeben</button>
        </TimedDecision>
      </StatusCard>
    );
  }

  if (G.trump === null) {
    return <TrumpSelection G={G} playerId={playerId} myTurn={myTurn} isSending={isSending} dispatchMove={dispatchMove} deadline={deadline} />;
  }

  const turnSeconds = deadline.remainingMilliseconds === null
    ? null
    : Math.ceil(deadline.remainingMilliseconds / 1000);

  return (
    <div className={styles.playStatus}>
      <div>
        <p className="eyebrow">Trumpf</p>
        <strong className={isRedSuit(G.trump) ? styles.redSuit : ''}>{SUIT_SYMBOLS[G.trump]} {SUIT_NAMES[G.trump]}</strong>
        <span>{G.contract === 'original' ? 'Original' : 'Kleines'} · {G.declarer ? gamePlayerName(G, G.declarer) : '–'}</span>
      </div>
      <div
        className={styles.turnIndicator}
        data-active={myTurn}
        data-urgent={myTurn && turnSeconds !== null && turnSeconds <= 5}
        style={myTurn ? timeoutStyle(deadline) : undefined}
      >
        <span>{myTurn ? 'Dein Zug' : `${gamePlayerName(G, otherPlayer(playerId))} am Zug`}</span>
        {myTurn && turnSeconds !== null && <small aria-live="polite">{turnSeconds}s</small>}
        {myTurn && turnSeconds !== null && <i aria-hidden="true" />}
      </div>
      <small>{G.shownMelds.length > 0 ? `${G.shownMelds.length} Meldung(en) gezeigt` : 'Noch keine Meldung gezeigt'}</small>
    </div>
  );
}

function MeldExchange({ G, playerId, myTurn, isSending, dispatchMove, deadline }: {
  G: PlayerJassState;
  playerId: PlayerID;
  myTurn: boolean;
  isSending: boolean;
  dispatchMove: DispatchMove;
  deadline: DeadlineInfo;
}) {
  const contest = G.meldContest;
  if (!contest) return null;
  if (contest.stage === 'awaitingResponse') {
    if (playerId !== G.dealer || !myTurn) {
      return (
        <StatusCard title={`${contest.frontType} gemeldet`} detail="Der Spieler am Button muss antworten.">
          <TimeoutNotice deadline={deadline}>Bei 0 wird die regelkonforme Antwort automatisch gegeben.</TimeoutNotice>
        </StatusCard>
      );
    }
    const automaticResponse = G.trump
      ? getExpectedMeldResponse(contest.frontType, firstTrickHand(G, G.dealer), G.trump, G.dealer)
      : null;
    if (automaticResponse === 'good') {
      const replyOptions = getGoodMeldReplyOptions(meldReplySeed(G.gameNumber, G.handNumber, G.dealer));
      return (
        <StatusCard title={`${contest.frontType} gemeldet`} detail="Du kannst nicht höher melden – such dir eine passende Antwort aus.">
          {replyOptions.map((reply, index) => (
            index === 0 ? (
              <TimedDecision key={reply} deadline={deadline} label="Automatisch bei 0">
                <button className="button" type="button" disabled={isSending} onClick={() => void dispatchMove('respondMeld', ['good', reply])}>{reply}</button>
              </TimedDecision>
            ) : (
              <button key={reply} className="button" type="button" disabled={isSending} onClick={() => void dispatchMove('respondMeld', ['good', reply])}>{reply}</button>
            )
          ))}
        </StatusCard>
      );
    }
    if (!automaticResponse) return null;
    const responseLabel = MELD_RESPONSE_LABELS[automaticResponse];
    return (
      <StatusCard title={`${contest.frontType} gemeldet`} detail="Antworte entsprechend deiner besten Folge.">
        <TimedDecision deadline={deadline} label="Automatisch bei 0">
          <button className="button" type="button" disabled={isSending} onClick={() => void dispatchMove('respondMeld', [automaticResponse])}>{responseLabel}</button>
        </TimedDecision>
      </StatusCard>
    );
  }
  if (contest.stage === 'dealerPlay') {
    const responseLabel = contest.response === 'good' && contest.replyComment
      ? contest.replyComment
      : MELD_RESPONSE_LABELS[contest.response!];
    return (
      <StatusCard title={responseLabel} detail={playerId === G.dealer ? 'Lege jetzt deine Karte für den ersten Stich.' : 'Der Gegner beendet den ersten Stich.'}>
        <TimeoutNotice deadline={deadline}>{playerId === G.dealer
          ? 'Bei 0 wird die gold umrandete Karte gespielt.'
          : 'Bei 0 spielt der Gegner seine vorab ausgewählte erlaubte Karte.'}</TimeoutNotice>
      </StatusCard>
    );
  }
  if (contest.stage === 'awaitingFrontName') {
    if (playerId !== G.vorne || !myTurn) {
      return (
        <StatusCard title="Meldungen vergleichen" detail="Der vordere Spieler nennt seine höchste Folge.">
          <TimeoutNotice deadline={deadline}>Bei 0 wird die höchste Folge automatisch genannt.</TimeoutNotice>
        </StatusCard>
      );
    }
    return (
      <StatusCard title="Höchste Folge nennen" detail="Nach dem ersten Stich wird jetzt der höchste Rang genannt.">
        <TimedDecision deadline={deadline} label="Automatisch bei 0">
          <button className="button button-primary" type="button" disabled={isSending} onClick={() => void dispatchMove('nameMeld')}>Höchste Folge nennen</button>
        </TimedDecision>
      </StatusCard>
    );
  }
  if (playerId !== G.dealer || !myTurn) {
    return (
      <StatusCard title={`Folge bis ${contest.namedRank ?? '…'}`} detail="Der Spieler am Button entscheidet, ob er höher ist.">
        <TimeoutNotice deadline={deadline}>Bei 0 wird die regelkonforme Entscheidung automatisch getroffen.</TimeoutNotice>
      </StatusCard>
    );
  }
  const automaticDecision = expectedDealerDecision(G);
  return (
    <StatusCard title={`Folge bis ${contest.namedRank ?? '…'}`} detail="Zeige deine höhere Folge oder bestätige die erste Meldung.">
      {(Object.entries(MELD_DECISION_LABELS) as [MeldDecision, string][]).map(([decision, label]) => (
        decision === automaticDecision ? (
          <TimedDecision key={decision} deadline={deadline} label="Automatisch bei 0">
            <button className="button" type="button" disabled={isSending} onClick={() => void dispatchMove('resolveMeldContest', [decision])}>{label}</button>
          </TimedDecision>
        ) : (
          <button key={decision} className="button" type="button" disabled={isSending} onClick={() => void dispatchMove('resolveMeldContest', [decision])}>{label}</button>
        )
      ))}
    </StatusCard>
  );
}

function TrumpSevenExchange({ card, isSending, dispatchMove, deadline, error }: {
  card: Card;
  isSending: boolean;
  dispatchMove: DispatchMove;
  deadline: DeadlineInfo;
  error: string | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog ref={dialogRef} className={`${styles.modal} ${styles.exchangeDialog}`} aria-labelledby="exchange-title" aria-describedby="exchange-description" onCancel={(event) => event.preventDefault()}>
      <p className="eyebrow">Vor deiner ersten Karte</p>
      <h2 id="exchange-title">Möchtest du räubern?</h2>
      <p id="exchange-description">Du kannst deine {SUIT_NAMES[card.suit]} 7 gegen die offene {SUIT_NAMES[card.suit]} {card.rank} tauschen – unabhängig vom gewählten Trumpf.</p>
      <div className={styles.exchangeCards} aria-hidden="true">
        <CardView card={{ suit: card.suit, rank: '7' }} displayOnly />
        <span>→</span>
        <CardView card={card} displayOnly />
      </div>
      <div className="button-row">
        <button className="button button-primary" type="button" disabled={isSending} onClick={() => void dispatchMove('exchangeTrumpSeven')}>Räubern</button>
        <button className="button" type="button" disabled={isSending} onClick={() => void dispatchMove('keepTrumpSeven')}>Nicht räubern</button>
      </div>
      <TimeoutNotice deadline={deadline}>Bei 0 wird nicht geräubert und die normale Standardaktion ausgeführt.</TimeoutNotice>
      {error && <p role="alert">{error}</p>}
    </dialog>
  );
}

function TrumpSelection({ G, playerId, myTurn, isSending, dispatchMove, deadline }: {
  G: PlayerJassState;
  playerId: PlayerID;
  myTurn: boolean;
  isSending: boolean;
  dispatchMove: DispatchMove;
  deadline: DeadlineInfo;
}) {
  if (!myTurn) {
    return (
      <StatusCard title="Original" detail={originalDescription(G)}>
        <TimeoutNotice deadline={deadline}>{trumpWaitingDefault(G)}</TimeoutNotice>
      </StatusCard>
    );
  }
  const disabled = isSending;

  if (G.trumpSelectionPassedCount < 2) {
    return (
      <StatusCard title="Original spielen?" detail={originalDescription(G)}>
        <button className="button button-primary" type="button" disabled={disabled} onClick={() => void dispatchMove('acceptOriginal')}>Annehmen</button>
        <TimedDecision deadline={deadline} label="Automatisch bei 0">
          <button className="button" type="button" disabled={disabled} onClick={() => void dispatchMove('decline')}>Nein</button>
        </TimedDecision>
      </StatusCard>
    );
  }

  if (G.smallGameAnnounced && !G.smallGameAccepted && playerId === G.dealer) {
    return (
      <StatusCard title="Kleines angesagt" detail="Lässt du die freie Trumpfwahl zu oder sagst du Besser mit Kreuz?">
        <TimedDecision deadline={deadline} label="Automatisch bei 0">
          <button className="button button-primary" type="button" disabled={disabled} onClick={() => void dispatchMove('acceptSmallGame')}>OK</button>
        </TimedDecision>
        <button className="button" type="button" disabled={disabled} onClick={() => void dispatchMove('overruleSmallGame')}>Besser · Kreuz</button>
      </StatusCard>
    );
  }

  if (G.trumpSelectionPassedCount === 2 && playerId === G.vorne && !G.smallGameAnnounced) {
    return (
      <StatusCard title="Kleines?" detail="Sage ein Kleines an oder gib die freie Wahl zum Button weiter.">
        <button className="button button-primary" type="button" disabled={disabled} onClick={() => void dispatchMove('announceSmallGame')}>Kleines ansagen</button>
        <TimedDecision deadline={deadline} label="Automatisch bei 0">
          <button className="button" type="button" disabled={disabled} onClick={() => void dispatchMove('decline')}>Nein</button>
        </TimedDecision>
      </StatusCard>
    );
  }

  const mayChoose =
    (G.smallGameAccepted && playerId === G.vorne) ||
    (!G.smallGameAnnounced && G.trumpSelectionPassedCount === 3 && playerId === G.dealer);
  if (mayChoose) {
    const availableSuits = SUITS.filter((suit) => suit !== G.revealedCard?.suit);
    const automaticSuit = G.smallGameAccepted ? availableSuits[0] : null;
    return (
      <StatusCard title="Trumpf wählen" detail="Die ursprüngliche Farbe steht in der zweiten Runde nicht zur Wahl.">
        {availableSuits.map((suit) => (
          suit === automaticSuit ? (
            <TimedDecision key={suit} deadline={deadline} label="Automatisch bei 0">
              <button className={`button ${isRedSuit(suit) ? styles.redSuit : ''}`} type="button" disabled={disabled} onClick={() => void dispatchMove('chooseTrump', [suit])}>
                {SUIT_SYMBOLS[suit]} {SUIT_NAMES[suit]}
              </button>
            </TimedDecision>
          ) : (
            <button key={suit} className={`button ${isRedSuit(suit) ? styles.redSuit : ''}`} type="button" disabled={disabled} onClick={() => void dispatchMove('chooseTrump', [suit])}>
              {SUIT_SYMBOLS[suit]} {SUIT_NAMES[suit]}
            </button>
          )
        ))}
        {!G.smallGameAnnounced && (
          <TimedDecision deadline={deadline} label="Automatisch bei 0">
            <button className="button" type="button" disabled={disabled} onClick={() => void dispatchMove('decline')}>Neu geben</button>
          </TimedDecision>
        )}
      </StatusCard>
    );
  }
  return <StatusCard title="Trumpfwahl" detail="Auswahl wird vorbereitet …" />;
}

function GameEnd({ G, playerId, isSending, dispatchMove, deadline }: {
  G: PlayerJassState;
  playerId: PlayerID;
  isSending: boolean;
  dispatchMove: DispatchMove;
  deadline: DeadlineInfo;
}) {
  const result = G.gameResult;
  if (!result) return null;
  const nextReady = G.nextGamePlayers.includes(playerId);
  return (
    <section className={styles.gameEnd}>
      <GameResultHero G={G} playerId={playerId} />
      <p>{result.reason === 'cube-declined' ? 'Das Würfelangebot wurde abgelehnt.' : `Ziel von ${G.settings.targetScore} Augen erreicht.`}</p>
      <div className={styles.breakdown}>
        {(['0', '1'] as PlayerID[]).map((id) => (
          <div key={id}><span>{gamePlayerName(G, id)}</span><strong>{result.finalScores[id]}</strong><small>Match +{result.awardedMatchPoints[id]}</small></div>
        ))}
      </div>
      <TrickSettlement G={G} tricks={G.pastTricks} playerId={playerId} />
      <SpecialScoreBreakdown G={G} playerId={playerId} />
      {result.schneider && <div className="notice notice-success">Schneider: Matchpunkte verdoppelt</div>}
      <TimeoutNotice deadline={deadline}>Bei 0 wird das Match automatisch pausiert.</TimeoutNotice>
      <div className="button-row">
        {!nextReady ? (
          <button className="button button-primary" type="button" disabled={isSending} onClick={() => void dispatchMove('nextGame')}>Nächstes Spiel</button>
        ) : <div className={styles.pulse}>Warten auf den Gegner</div>}
        <button className="button button-danger" type="button" disabled={isSending} onClick={() => void dispatchMove('endMatch')}>Match beenden</button>
      </div>
    </section>
  );
}

function PausedMatch({ G, playerId, isSending, onResume, onEnd }: {
  G: PlayerJassState;
  playerId: PlayerID;
  isSending: boolean;
  onResume: () => void;
  onEnd: () => void;
}) {
  const ready = G.resumePlayers.includes(playerId);
  return (
    <section className={styles.pausedMatch}>
      <GameResultHero G={G} playerId={playerId} paused />
      <div className={styles.pauseAction}>
        <p><strong>Match pausiert.</strong> Beide Spieler müssen bestätigen, dass sie weiterspielen möchten.</p>
        <div className="button-row">
        {!ready
          ? <button className="button button-primary" type="button" disabled={isSending} onClick={onResume}>Match fortsetzen</button>
          : <div className={styles.pulse}>Warten auf den Gegner</div>}
        <button className="button button-danger" type="button" disabled={isSending} onClick={onEnd}>Match beenden</button>
        </div>
      </div>
    </section>
  );
}

function GameResultHero({ G, playerId, paused = false }: {
  G: PlayerJassState;
  playerId: PlayerID;
  paused?: boolean;
}) {
  const result = G.gameResult;
  if (!result) return null;
  const opponent: PlayerID = playerId === '0' ? '1' : '0';
  const outcome = result.winner === null ? 'draw' : result.winner === playerId ? 'win' : 'loss';
  const title = outcome === 'draw'
    ? `Spiel ${G.gameNumber} endet unentschieden`
    : outcome === 'win' ? `Du gewinnst Spiel ${G.gameNumber}` : `${gamePlayerName(G, opponent)} gewinnt Spiel ${G.gameNumber}`;
  return (
    <section className={styles.resultHero} data-outcome={outcome} aria-label="Ergebnis und aktueller Matchstand">
      <p className="eyebrow">{paused ? 'Letztes Ergebnis' : 'Spiel beendet'}</p>
      <h2>{title}</h2>
      <div className={styles.matchScoreHero}>
        <div><span>{gamePlayerName(G, playerId)}</span><strong>{G.matchPoints[playerId]}</strong></div>
        <div><small>Aktueller Matchstand</small><b>:</b></div>
        <div><span>{gamePlayerName(G, opponent)}</span><strong>{G.matchPoints[opponent]}</strong></div>
      </div>
    </section>
  );
}

function StatusCard({ title, detail, children }: { title: string; detail: string; children?: React.ReactNode }) {
  return <div className={styles.statusCard}><p className="eyebrow">Am Tisch</p><h2>{title}</h2><p>{detail}</p>{children && <div className="button-row">{children}</div>}</div>;
}

function TalonAndOriginal({ card, talonCount, tucked }: { card: Card | null; talonCount: number; tucked: boolean }) {
  if (!card) return null;
  const stackSize = Math.min(3, Math.max(1, talonCount));
  return (
    <aside
      className={styles.tableCards}
      data-tucked={tucked}
      aria-label={tucked
        ? `Talon mit ${talonCount} Karten; die ungenommene offene Karte steckt darunter`
        : `Talon mit ${talonCount} Karten und offene Originalkarte`}
    >
      <div className={styles.tableCardStack}>
        <div className={`${styles.tableCardSlot} ${styles.talonSlot}`}>
          <div className={styles.talon} aria-hidden="true">
            {Array.from({ length: stackSize }, (_, index) => <i key={index} />)}
            <b>{talonCount}</b>
          </div>
        </div>
        <div className={`${styles.tableCardSlot} ${styles.originalCardSlot}`}>
          <CardView card={card} displayOnly />
        </div>
      </div>
    </aside>
  );
}

function WaitingRoom({ G, playerId, isSending, onReady }: { G: PlayerJassState; playerId: PlayerID; isSending: boolean; onReady: () => void }) {
  const ready = G.readyPlayers.includes(playerId);
  return (
    <section className={styles.waiting}>
      <p className="eyebrow">Privater Tisch</p><h1>{ready ? `Warten auf ${gamePlayerName(G, playerId === '0' ? '1' : '0')}` : 'Bereit für das erste Spiel?'}</h1>
      <p>{G.readyPlayers.length} von 2 Spielern sind bereit. Teile die Match-ID mit deinem Gegenüber.</p>
      {!ready && <button className="button button-primary" type="button" disabled={isSending} onClick={onReady}>Ich bin bereit</button>}
      {ready && <div className={styles.pulse}>Verbindung aktiv</div>}
    </section>
  );
}

function HandEnd({ G, playerId, isSending, onReady, deadline }: { G: PlayerJassState; playerId: PlayerID; isSending: boolean; onReady: () => void; deadline: DeadlineInfo }) {
  const result = G.lastHandResult;
  const ready = G.readyPlayers.includes(playerId);
  return (
    <section className={styles.handEnd}>
      <p className="eyebrow">Hand abgeschlossen</p><h2>{result ? `${gamePlayerName(G, result.winner)} gewinnt die Hand` : 'Hand beendet'}</h2>
      <div className={styles.breakdown}>
        {(['0', '1'] as PlayerID[]).map((id) => <div key={id}><span>{gamePlayerName(G, id)}</span><strong>{result?.awardedScores[id] ?? G.handScores[id]}</strong><small>Gezählt {result?.baseScores[id] ?? 0}</small></div>)}
      </div>
      <TrickSettlement G={G} tricks={G.pastTricks} playerId={playerId} />
      <SpecialScoreBreakdown G={G} playerId={playerId} />
      {result?.declarerFailed && <div className="notice notice-success">Falte: Der Trumpfmacher erhält keine Augen.</div>}
      {!ready ? (
        <TimedDecision deadline={deadline} label="Automatisch bei 0">
          <button className="button button-primary" type="button" disabled={isSending} onClick={onReady}>Bereit für Hand {G.handNumber + 1}</button>
        </TimedDecision>
      ) : (
        <>
          <div className={styles.pulse}>Warten auf den Gegner</div>
          <TimeoutNotice deadline={deadline}>Bei 0 wird der Gegner automatisch bereit gemeldet.</TimeoutNotice>
        </>
      )}
    </section>
  );
}

function MatchEnd({ G, playerId }: { G: PlayerJassState; playerId: PlayerID }) {
  const endedBy = G.matchResult?.endedBy;
  const title = endedBy === playerId ? 'Du hast das Match verlassen.'
    : endedBy ? `${gamePlayerName(G, endedBy)} hat das Match verlassen.` : 'Das Match ist beendet.';
  return (
    <section className={styles.matchEnd}>
      <p className="eyebrow">Match beendet</p><h1>{title}</h1>
      <p>Das Match wurde nach Spiel {G.gameNumber} beendet.</p>
      <div className={styles.finalScore}><strong>{G.matchPoints[playerId]}</strong><span>:</span><strong>{G.matchPoints[playerId === '0' ? '1' : '0']}</strong></div>
      <Link className="button button-primary" href="/">Zurück zur Lobby</Link>
    </section>
  );
}

function SpecialScoreBreakdown({ G, playerId }: { G: PlayerJassState; playerId: PlayerID }) {
  const opponent: PlayerID = playerId === '0' ? '1' : '0';
  return (
    <section className={styles.specialBreakdown} aria-label="Sonderwertungen der letzten Hand">
      <h3>Wertung der letzten Hand</h3>
      <div>
        {([playerId, opponent] as PlayerID[]).map((id) => (
          <ScoreDetailList key={id} title={gamePlayerName(G, id)} details={G.handScoreDetails[id]} />
        ))}
      </div>
    </section>
  );
}

function ScoreDetailList({ title, details }: { title: string; details: ScoreDetails }) {
  const jass = details.jass ?? 0;
  const mi = details.mi ?? 0;
  const rows = [
    ['Übrige Kartenwerte', Math.max(0, details.tricks - jass - mi)],
    ['Jass', jass],
    ['Mi', mi],
    ['Terz', details.terz ?? 0],
    ['Fünfzig', details.fifty ?? 0],
    ['Bella', details.bella ?? 0],
    ['Letzter Stich', details.lastTrick],
  ] as const;
  return (
    <div className={styles.scoreDetailList}>
      <strong>{title}</strong>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label} data-empty={value === 0}><dt>{label}</dt><dd>+{value}</dd></div>
        ))}
      </dl>
    </div>
  );
}

function ScoreBoard({ G }: { G: PlayerJassState }) {
  return (
    <div className={styles.score} aria-label={`Augen ${G.scores['0']} zu ${G.scores['1']}, Match ${G.matchPoints['0']} zu ${G.matchPoints['1']}, Würfel ${G.cube.value}`}>
      <span className={styles.scoreMatch}><small>Match</small><strong>{G.matchPoints['0']}<i>:</i>{G.matchPoints['1']}</strong></span>
      <span className={styles.scoreEyes}><small>Augen</small><strong>{G.scores['0']}<i>:</i>{G.scores['1']}</strong></span>
      <span className={styles.scoreCube}><small>Würfel</small><strong>{G.cube.value}</strong></span>
    </div>
  );
}

function Deadline({ seconds, cube, trickDisplayMilliseconds, extraDealMilliseconds }: { seconds: number | null; cube: boolean; trickDisplayMilliseconds: number; extraDealMilliseconds: number }) {
  if (extraDealMilliseconds > 0) {
    return <div className={styles.deadline}>Karten · {Math.ceil(extraDealMilliseconds / 1000)}s</div>;
  }
  if (trickDisplayMilliseconds > 0) {
    return <div className={styles.deadline}>Stich · {Math.ceil(trickDisplayMilliseconds / 1000)}s</div>;
  }
  if (seconds === null) return null;
  return <div className={styles.deadline} data-urgent={seconds <= 5} aria-live="polite">Noch {seconds}s · {cube ? 'Dreher' : 'Zug'}</div>;
}

function TimedDecision({ deadline, label, children }: { deadline: DeadlineInfo; label: string; children: React.ReactNode }) {
  const seconds = deadline.remainingMilliseconds === null ? null : Math.ceil(deadline.remainingMilliseconds / 1000);
  return (
    <div
      className={styles.timedDecision}
      data-urgent={seconds !== null && seconds <= 5}
      style={timeoutStyle(deadline)}
    >
      <div className={styles.timedButtonRing}>{children}</div>
      <span>{label}{seconds === null ? '' : ` · ${seconds}s`}</span>
    </div>
  );
}

function ChatBox({ messages, playerId, playerNames, isSending, onSend, mobileOpen, onClose }: {
  mobileOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  playerId: PlayerID;
  playerNames: Record<PlayerID, string | null>;
  isSending: boolean;
  onSend: (message: string) => Promise<boolean>;
}) {
  const [message, setMessage] = useState('');
  const messageList = useRef<HTMLDivElement>(null);
  const messageGroups = groupChatMessages(messages);
  const latestMessageId = messages.at(-1)?.id;

  useEffect(() => {
    const list = messageList.current;
    if (!list) return;
    const scrollToLatest = () => { list.scrollTop = list.scrollHeight; };
    scrollToLatest();
    const frame = window.requestAnimationFrame(scrollToLatest);
    return () => window.cancelAnimationFrame(frame);
  }, [latestMessageId, mobileOpen]);

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = message.trim();
    if (!text || isSending) return;
    if (await onSend(text)) setMessage('');
  }

  return (
    <aside id="table-chat" className={styles.chatPanel} data-open={mobileOpen} aria-label="Tisch-Chat">
      <header>
        <div>
          <p className="eyebrow">Am Tisch</p>
          <h2>Spielverlauf &amp; Chat</h2>
        </div>
        <span aria-label={`${messages.length} Nachrichten`}>{messages.length}</span>
        <button type="button" className={styles.panelClose} onClick={onClose} aria-label="Chat schließen">×</button>
      </header>
      <div className={styles.chatMessages} ref={messageList} role="log" aria-live="polite">
        {messages.length === 0 ? (
          <p className={styles.emptyChat}>Der Dealer kommentiert hier Karten, Meldungen und Entscheidungen.</p>
        ) : messageGroups.map((group) => {
          const firstEntry = group.messages[0];
          const isSelf = group.kind === 'player' && firstEntry.playerId === playerId;
          return (
            <article
              className={styles.chatMessage}
              data-kind={group.kind}
              data-self={isSelf}
              key={`${group.kind}-${firstEntry.id}`}
            >
              <div>
                <strong>{group.kind === 'dealer' ? 'Dealer' : firstEntry.playerId ? playerNames[firstEntry.playerId] ?? (isSelf ? 'Du' : 'Gast') : 'Spieler'}</strong>
                <time dateTime={new Date(firstEntry.createdAt).toISOString()}>{chatTime(firstEntry.createdAt)}</time>
              </div>
              {group.messages.map((entry) => <p key={entry.id}>{entry.text}</p>)}
            </article>
          );
        })}
      </div>
      <form className={styles.chatForm} onSubmit={submitMessage}>
        <label htmlFor="table-chat-message">Nachricht</label>
        <div>
          <input
            id="table-chat-message"
            type="text"
            value={message}
            maxLength={280}
            placeholder="Etwas schreiben …"
            autoComplete="off"
            onChange={(event) => setMessage(event.target.value)}
          />
          <button className="button button-primary" type="submit" disabled={isSending || message.trim().length === 0}>
            {isSending ? '…' : 'Senden'}
          </button>
        </div>
        <small>{message.length}/280</small>
      </form>
    </aside>
  );
}

function chatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('de-AT', { hour: '2-digit', minute: '2-digit' }).format(timestamp);
}

function TimeoutNotice({ deadline, children }: { deadline: DeadlineInfo; children: React.ReactNode }) {
  const seconds = deadline.remainingMilliseconds === null ? null : Math.ceil(deadline.remainingMilliseconds / 1000);
  if (seconds === null) return null;
  return (
    <div className={styles.timeoutNotice} data-urgent={seconds <= 5} style={timeoutStyle(deadline)}>
      <span>{children}</span>
      <strong aria-live="polite">{seconds}s</strong>
      <i aria-hidden="true" />
    </div>
  );
}

function OpponentArea({ name, count, tricks, speech, revealedCards, inspectedTrick, onInspect }: { name: string; count: number; tricks: number; speech: AvatarSpeech | null; revealedCards: Card[]; inspectedTrick: Trick | null; onInspect?: () => void }) {
  return (
    <section className={styles.opponent}>
      <div className={styles.opponentCardsRow}>
        <PlayerIdentity name={name} owner="opponent" speech={speech} />
        <div className={styles.cardBacks}>{Array.from({ length: count }, (_, index) => {
          const card = revealedCards[index];
          return card
            ? <div className={styles.meldRevealedCard} key={`${card.suit}-${card.rank}`}><CardView card={card} displayOnly compact /></div>
            : <div className={styles.cardBack} key={index} />;
        })}</div>
      </div>
      <TrickPile count={tricks} owner="opponent" inspectedTrick={inspectedTrick} onInspect={onInspect} />
    </section>
  );
}

const AVATAR_PALETTES = [
  { background: '#315f55', skin: '#f0c5a0', hair: '#4b2d22' },
  { background: '#584b78', skin: '#d99b73', hair: '#241b1a' },
  { background: '#8a593c', skin: '#f3d0b1', hair: '#9b653d' },
  { background: '#315a78', skin: '#b97854', hair: '#1f1715' },
  { background: '#6b4a5f', skin: '#e7b58e', hair: '#5c3427' },
] as const;

function PlayerIdentity({ name, owner, speech = null }: { name: string; owner: 'self' | 'opponent'; speech?: AvatarSpeech | null }) {
  return (
    <div className={styles.playerIdentity} data-owner={owner}>
      {speech && <AvatarSpeechBubble speech={speech} />}
      <PlayerAvatar name={name} />
      <strong>{name}</strong>
    </div>
  );
}

function PlayerAvatar({ name }: { name: string }) {
  const hash = nameHash(name);
  const palette = AVATAR_PALETTES[hash % AVATAR_PALETTES.length];
  const hairStyle = (hash >>> 4) % 3;
  return (
    <svg className={styles.playerAvatar} viewBox="0 0 100 100" role="img" aria-label={`Avatar von ${name}`}>
      <circle cx="50" cy="50" r="48" fill={palette.background} />
      <circle cx="22" cy="55" r="7" fill={palette.skin} />
      <circle cx="78" cy="55" r="7" fill={palette.skin} />
      <ellipse cx="50" cy="54" rx="29" ry="34" fill={palette.skin} />
      {hairStyle === 0 && <path d="M22 48C21 23 34 13 51 13c18 0 29 12 28 34-9-4-13-12-16-19-9 10-23 16-41 20Z" fill={palette.hair} />}
      {hairStyle === 1 && <path d="M22 43c2-22 15-31 29-31 17 0 27 11 28 32-7-6-11-13-13-19-11 8-26 13-44 18Z" fill={palette.hair} />}
      {hairStyle === 2 && <path d="M21 46c0-21 12-34 30-34 17 0 28 12 28 34l-9-14-7 5-8-10-9 9-8-8-8 13-9 5Z" fill={palette.hair} />}
      <circle cx="39" cy="54" r="2.8" fill="#231b18" />
      <circle cx="61" cy="54" r="2.8" fill="#231b18" />
      <path d="M47 64c2 2 4 2 6 0" fill="none" stroke="#9c604f" strokeWidth="2" strokeLinecap="round" />
      <path d="M40 73c6 5 14 5 20 0" fill="none" stroke="#713f39" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function nameHash(name: string): number {
  let hash = 2166136261;
  for (const character of name.trim().toLocaleLowerCase('de-AT')) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

type AvatarSpeech = ChatMessage & {
  playerId: PlayerID;
  speech: NonNullable<ChatMessage['speech']>;
};

function latestAvatarSpeech(messages: ChatMessage[], now: number): AvatarSpeech | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.playerId && message.speech && now - message.createdAt < 7_000) {
      return message as AvatarSpeech;
    }
  }
  return null;
}

function AvatarSpeechBubble({ speech }: { speech: AvatarSpeech }) {
  const labels: Record<AvatarSpeech['speech'], string> = {
    chat: 'Chat',
    meld: 'Meldung',
    trump: 'Trumpf',
  };
  return (
    <div
      className={styles.avatarSpeechBubble}
      data-kind={speech.speech}
      key={speech.id}
      role="status"
      aria-live="polite"
    >
      <strong>{speech.speechText ?? speech.text}</strong>
      {speech.speech !== 'chat' && <span>{labels[speech.speech]}</span>}
    </div>
  );
}

function CurrentTrick({ trick, playerId, collecting = false }: { trick: Trick; playerId: PlayerID; collecting?: boolean }) {
  const respondingPlayer: PlayerID = trick.leadPlayer === '0' ? '1' : '0';
  const cards = ([trick.leadPlayer, respondingPlayer] as PlayerID[])
    .flatMap((id) => trick.cards[id] ? [{ id, card: trick.cards[id]! }] : []);
  const collectTo = trick.winner === playerId ? 'self' : 'opponent';
  const trickRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const trickElement = trickRef.current;
    const table = trickElement?.closest('[data-game-table]');
    if (!collecting || !trickElement || !table) return;

    const pile = table.querySelector<HTMLElement>(`.${styles.trickPile}[data-owner="${collectTo}"]`);
    if (!pile) return;

    const trickBounds = trickElement.getBoundingClientRect();
    const pileBounds = pile.getBoundingClientRect();
    trickElement.style.setProperty('--collect-trick-x', `${pileBounds.left + pileBounds.width / 2 - trickBounds.left - trickBounds.width / 2}px`);
    trickElement.style.setProperty('--collect-trick-y', `${pileBounds.top + pileBounds.height / 2 - trickBounds.top - trickBounds.height / 2}px`);
  }, [collectTo, collecting]);

  return <div ref={trickRef} className={styles.trick} data-collecting={collecting} data-collect-to={collectTo} aria-label="Aktueller Stich">{cards.length === 0 ? <span>Noch keine Karte im Stich</span> : cards.map(({ id, card }) => <div key={id}><CardView card={card} displayOnly /></div>)}</div>;
}

function TrickPile({ count, owner, onInspect, inspectedTrick = null }: { count: number; owner: 'self' | 'opponent'; onInspect?: () => void; inspectedTrick?: Trick | null }) {
  const cardCount = count * 2;
  return (
    <button
      type="button"
      disabled={!onInspect}
      onClick={onInspect}
      title={onInspect ? 'Letzten Stich für beide Spieler ansehen' : undefined}
      className={styles.trickPile}
      data-owner={owner}
      data-empty={count === 0}
      aria-hidden={count === 0}
      aria-label={onInspect ? 'Letzten Stich für beide Spieler ansehen' : `${count} gewonnene Stiche mit ${cardCount} Karten`}
    >
      {Array.from({ length: inspectedTrick ? Math.max(0, cardCount - 2) : cardCount }, (_, index) => {
        const centeredIndex = index - (cardCount - 1) / 2;
        const cardStyle: CSSProperties = {
          zIndex: index + 1,
          transform: `translate(${centeredIndex * 3.8}px, ${-index * 1.1}px) rotate(${centeredIndex * 0.72}deg)`,
        };
        return <i key={index} style={cardStyle} aria-hidden="true" />;
      })}
      {inspectedTrick && <span className={styles.inspectedTrick} style={{ zIndex: cardCount + 1 }} aria-label="Letzter Stich">
        {[inspectedTrick.leadPlayer, otherPlayer(inspectedTrick.leadPlayer)].map((id) => {
          const card = inspectedTrick.cards[id];
          return card ? <CardView key={id} card={card} displayOnly /> : null;
        })}
      </span>}
      <b style={{ zIndex: cardCount + 1 }}>{count}</b>
    </button>
  );
}

function TrickSettlement({ G, tricks, playerId }: { G: PlayerJassState; tricks: Trick[]; playerId: PlayerID }) {
  const settlementRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const settlement = settlementRef.current;
    const table = settlement?.closest('[data-game-table]');
    if (!settlement || !table) return;

    const trickElements = Array.from(settlement.querySelectorAll<HTMLElement>('[data-settlement-trick]'));
    const settlingPiles = new Set<HTMLElement>();
    const originIndexes: Record<'self' | 'opponent', number> = { self: 0, opponent: 0 };

    for (const trickElement of trickElements) {
      const origin = trickElement.dataset.origin === 'self' ? 'self' : 'opponent';
      const pile = table.querySelector<HTMLElement>(`.${styles.trickPile}[data-owner="${origin}"]`);
      if (!pile) continue;

      const pileBounds = pile.getBoundingClientRect();
      const targetBounds = trickElement.getBoundingClientRect();
      const originIndex = originIndexes[origin];
      originIndexes[origin] += 1;

      trickElement.style.setProperty('--settlement-flight-x', `${pileBounds.left + pileBounds.width / 2 - targetBounds.left - targetBounds.width / 2}px`);
      trickElement.style.setProperty('--settlement-flight-y', `${pileBounds.top + pileBounds.height / 2 - targetBounds.top - targetBounds.height / 2}px`);
      trickElement.style.setProperty('--settlement-flight-delay', `${originIndex * 85}ms`);
      trickElement.style.setProperty('--settlement-flight-rotation', `${origin === 'opponent' ? -5 - originIndex : 5 + originIndex}deg`);
      trickElement.dataset.ready = 'true';
      pile.dataset.settling = 'true';
      settlingPiles.add(pile);
    }

    settlement.dataset.ready = 'true';
    return () => {
      for (const pile of settlingPiles) delete pile.dataset.settling;
    };
  }, [playerId, tricks.length]);

  if (tricks.length === 0) return null;
  return (
    <section className={styles.trickSettlement} aria-label="Gewonnene Stiche dieser Hand" ref={settlementRef}>
      <h3>Stiche dieser Hand</h3>
      <div>
        {(['0', '1'] as PlayerID[]).map((player) => {
          const wonTricks = tricks
            .map((trick, index) => ({ trick, index }))
            .filter(({ trick }) => trick.winner === player);
          return (
            <section className={styles.wonTricks} key={player} aria-label={`Stiche von ${gamePlayerName(G, player)}`}>
              <header><strong>{gamePlayerName(G, player)}</strong><span>{wonTricks.length} {wonTricks.length === 1 ? 'Stich' : 'Stiche'}</span></header>
              {wonTricks.length === 0 ? (
                <p>Keine Stiche</p>
              ) : (
                <div className={styles.wonTrickGrid}>
                  {wonTricks.map(({ trick, index }) => (
                    <article
                      key={index}
                      aria-label={`Stich ${index + 1}`}
                      data-settlement-trick
                      data-origin={player === playerId ? 'self' : 'opponent'}
                    >
                      {([trick.leadPlayer, otherPlayer(trick.leadPlayer)] as PlayerID[]).map((id) => trick.cards[id] && (
                        <CardView key={id} card={trick.cards[id]!} compact displayOnly />
                      ))}
                      <span>{index + 1}</span>
                    </article>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}

function gamePlayerName(G: Pick<PlayerJassState, 'playerNames'>, playerId: PlayerID): string {
  return G.playerNames[playerId] ?? (playerId === '0' ? 'Host' : 'Mitspieler');
}

function CardView({ card, onClick, disabled = false, displayOnly = false, compact = false, highlighted = false, freshlyDealt = false, extraReveal = false, preserveColor = false, deadline }: { card: Card; onClick?: () => void; disabled?: boolean; displayOnly?: boolean; compact?: boolean; highlighted?: boolean; freshlyDealt?: boolean; extraReveal?: boolean; preserveColor?: boolean; deadline?: DeadlineInfo }) {
  const className = `${styles.card} ${isRedSuit(card.suit) ? styles.redCard : ''} ${compact ? styles.compactCard : ''} ${highlighted ? styles.playableCard : ''} ${deadline ? styles.timeoutCard : ''} ${freshlyDealt ? styles.freshCard : ''} ${extraReveal ? styles.turningExtraCard : ''} ${preserveColor ? styles.preserveCardColor : ''}`;
  const content = <><span>{card.rank}<i>{SUIT_SYMBOLS[card.suit]}</i></span><b>{SUIT_SYMBOLS[card.suit]}</b><span>{card.rank}<i>{SUIT_SYMBOLS[card.suit]}</i></span></>;
  if (displayOnly) return <div className={className} aria-label={`${SUIT_NAMES[card.suit]} ${card.rank}`}>{content}</div>;
  return <button type="button" className={className} style={deadline ? timeoutStyle(deadline) : undefined} onClick={onClick} disabled={disabled} aria-label={`${SUIT_NAMES[card.suit]} ${card.rank} spielen${deadline ? ' – wird bei Zeitablauf automatisch gespielt' : ''}`}>{content}</button>;
}

function CenteredState({ title, detail, action = false }: { title: string; detail: string; action?: boolean }) {
  return <main className={styles.centered}><section className="panel"><p className="eyebrow">Klammer Jass</p><h1>{title}</h1><p>{detail}</p>{action && <Link className="button button-primary" href="/">Zur Startseite</Link>}</section></main>;
}

function canPlayerDouble(G: PlayerJassState, phase: string | null, currentPlayer: string, playerId: PlayerID): boolean {
  return Boolean(
    (phase === 'trumpSelection' || phase === 'playing') &&
      G.settings.cubeEnabled &&
      !G.cubeOffer &&
      !G.gameResult &&
      (currentPlayer === playerId || G.afterMoveDoubleBy === playerId) &&
      (G.cube.holder === null || G.cube.holder === playerId),
  );
}

function cardPlayBlocked(G: PlayerJassState, playerId: PlayerID): boolean {
  if (G.cubeOffer || G.matchPaused) return true;
  if (!G.meldContest) return false;
  return G.meldContest.stage !== 'dealerPlay' || playerId !== G.dealer;
}

function sortHand(hand: Card[], trump: Suit | null): Card[] {
  const suitOrder: Suit[] = ['Spades', 'Hearts', 'Clubs', 'Diamonds'];
  return [...hand].sort((a, b) => a.suit === b.suit
    ? (a.suit === trump ? TRUMP_ORDER : NON_TRUMP_ORDER).indexOf(a.rank) - (a.suit === trump ? TRUMP_ORDER : NON_TRUMP_ORDER).indexOf(b.rank)
    : suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit));
}

function timeoutStyle(deadline: DeadlineInfo): CSSProperties & { '--timeout-progress': string } {
  const totalMilliseconds = Math.max(1, deadline.totalSeconds * 1000);
  const progress = deadline.remainingMilliseconds === null
    ? 1
    : Math.min(1, Math.max(0, deadline.remainingMilliseconds / totalMilliseconds));
  return { '--timeout-progress': `${progress * 100}%` };
}

function originalDescription(G: PlayerJassState): string {
  if (!G.revealedCard) return 'Die offene Karte bestimmt die mögliche Originalfarbe.';
  return `${SUIT_NAMES[G.revealedCard.suit]} ${G.revealedCard.rank} liegt offen – Original ist ${SUIT_NAMES[G.revealedCard.suit]}.`;
}

function trumpWaitingDefault(G: PlayerJassState): string {
  if (G.smallGameAnnounced && !G.smallGameAccepted) return 'Bei 0 bestätigt der Gegner das Kleine automatisch mit OK.';
  if (G.smallGameAccepted) {
    const suit = SUITS.find((candidate) => candidate !== G.revealedCard?.suit);
    return `Bei 0 wählt der Gegner automatisch ${suit ? SUIT_NAMES[suit] : 'eine gültige Farbe'}.`;
  }
  if (G.trumpSelectionPassedCount === 3) return 'Bei 0 lässt der Gegner automatisch neu geben.';
  return 'Bei 0 antwortet der Gegner automatisch mit Nein.';
}

function expectedDealerDecision(G: PlayerJassState): MeldDecision | null {
  if (!G.trump || !G.meldContest?.namedRank) return null;
  const dealerMeld = getBestSequenceMeld(firstTrickHand(G, G.dealer), G.trump, G.dealer);
  if (!dealerMeld?.highestCard) return 'concede';
  const dealerRank = RANKS.indexOf(dealerMeld.highestCard.rank);
  const frontRank = RANKS.indexOf(G.meldContest.namedRank);
  if (dealerRank !== frontRank) return dealerRank > frontRank ? 'show' : 'concede';
  return dealerMeld.highestCard.suit === G.trump ? 'show' : 'concede';
}

function firstTrickHand(G: PlayerJassState, player: PlayerID): Card[] {
  const playedCard = G.pastTricks[0]?.cards[player] ?? G.currentTrick.cards[player];
  return playedCard ? [...G.hands[player], playedCard] : [...G.hands[player]];
}

function sameCard(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

function trickCount(tricks: Trick[], playerId: PlayerID): number { return tricks.filter((trick) => trick.winner === playerId).length; }
function shortId(matchId: string): string { return `${matchId.slice(0, 8)}…${matchId.slice(-4)}`; }
function isRedSuit(suit: Suit): boolean { return suit === 'Hearts' || suit === 'Diamonds'; }
function isDefined<T>(value: T | undefined): value is T { return value !== undefined; }
