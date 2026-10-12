/** A notification represents unread activity in one conversation.
 * Bulk actions acknowledge only the sequences observed at the start of each read.
 * Both entry points use the caller's existing owner or approved-agent transport.
 * @param {(action:string,input?:Record<string,unknown>)=>Promise<unknown>} request
 * @param {'markAllRead'|'clearNotifications'} action */
export async function acknowledgeSupportNotifications(request, action) {
  const inbox = /** @type {{conversations:{id:string,updatedAt:string,unreadCount:number}[]}} */ (
    await request('list')
  );
  const targets = inbox.conversations.filter((item) => item.unreadCount > 0);
  const outcomes = await Promise.all(
    targets.map(async (item) => {
      try {
        const conversation = /** @type {{messages:{sequence:number}[]}} */ (
          await request('read', { conversationId: item.id })
        );
        const readThrough = Math.max(
          0,
          ...conversation.messages.map((message) => message.sequence),
        );
        await request('readCursor', { conversationId: item.id, readThrough });
        return {
          conversationId: item.id,
          updatedAt: item.updatedAt,
          status: 'completed',
          readThrough,
        };
      } catch (error) {
        return {
          conversationId: item.id,
          updatedAt: item.updatedAt,
          status: 'failed',
          error:
            error instanceof Error ? error.message : 'Could not mark this notification as read.',
        };
      }
    }),
  );
  return {
    action,
    status: outcomes.some((item) => item.status === 'failed') ? 'failed' : 'completed',
    outcomes,
  };
}
