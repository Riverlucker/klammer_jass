import PusherServer from 'pusher';
import PusherClient from 'pusher-js';

let client: PusherClient | null = null;

// Server-side Pusher instance (only used in API routes)
const serverConfig = {
  appId: process.env.PUSHER_APP_ID,
  key: process.env.NEXT_PUBLIC_PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
};

export const pusherServer = Object.values(serverConfig).every(Boolean)
  ? new PusherServer({
      appId: serverConfig.appId!,
      key: serverConfig.key!,
      secret: serverConfig.secret!,
      cluster: serverConfig.cluster!,
      useTLS: true,
    })
  : null;

// Client-side Pusher instance (used in React components)
// We only initialize this on the client side
export const getPusherClient = () => {
  if (typeof window === 'undefined') return null;
  if (client) return client;
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
  if (!key || !cluster) return null;
  client = new PusherClient(key, {
    cluster,
  });
  return client;
};
