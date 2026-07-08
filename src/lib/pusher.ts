import PusherServer from 'pusher';
import PusherClient from 'pusher-js';

// Server-side Pusher instance (only used in API routes)
export const pusherServer = new PusherServer({
  appId: process.env.PUSHER_APP_ID || '',
  key: process.env.NEXT_PUBLIC_PUSHER_KEY || '',
  secret: process.env.PUSHER_SECRET || '',
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || '',
  useTLS: true,
});

// Client-side Pusher instance (used in React components)
// We only initialize this on the client side
export const getPusherClient = () => {
  if (typeof window === 'undefined') return null;
  
  return new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY || '', {
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || '',
  });
};
