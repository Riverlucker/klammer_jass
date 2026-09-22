import type { ChatMessage } from './types';

export interface ChatMessageGroup {
  kind: ChatMessage['kind'];
  messages: ChatMessage[];
}

export function groupChatMessages(messages: ChatMessage[]): ChatMessageGroup[] {
  const groups: ChatMessageGroup[] = [];

  for (const message of messages) {
    const previousGroup = groups.at(-1);
    const previousMessage = previousGroup?.messages.at(-1);
    const sameDealerRun = Boolean(
      message.kind === 'dealer' &&
      previousGroup?.kind === 'dealer' &&
      previousMessage &&
      (previousMessage.gameNumber ?? 1) === (message.gameNumber ?? 1) &&
      (previousMessage.handNumber ?? 1) === (message.handNumber ?? 1),
    );

    if (sameDealerRun) {
      previousGroup!.messages.push(message);
    } else {
      groups.push({ kind: message.kind, messages: [message] });
    }
  }

  return groups;
}
