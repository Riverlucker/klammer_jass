import { useState, useEffect } from 'react';
import { getPusherClient } from '@/lib/pusher';

export function useJassGame(matchId: string, playerId: string | null) {
  const [state, setState] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchState = () => {
    fetch(`/api/matches/${matchId}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setState(data.state);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  // Initial fetch
  useEffect(() => {
    if (!matchId) return;
    fetchState();
  }, [matchId]);

  // Pusher subscription
  useEffect(() => {
    if (!matchId) return;

    const pusher = getPusherClient();
    if (!pusher) return;

    const channel = pusher.subscribe(`match-${matchId}`);
    channel.bind('state-update', () => {
      fetchState(); // Refetch from DB instead of using payload due to 10kb limit
    });

    return () => {
      pusher.unsubscribe(`match-${matchId}`);
    };
  }, [matchId]);

  const dispatchMove = async (action: any) => {
    if (!playerId) {
       console.error("No player ID, cannot dispatch move.");
       return;
    }

    try {
      // Optimistic UI update could go here, but for simplicity we rely on Pusher
      await fetch('/api/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId,
          playerID: playerId,
          action,
          state: state // Send current state so server knows what we are basing our move on
        })
      });
    } catch (err) {
      console.error("Failed to dispatch move:", err);
    }
  };

  return { state, loading, dispatchMove };
}
