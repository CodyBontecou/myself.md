import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { usePhoneData } from './DataPanel.js';
import { historyPage, syncHistory } from './history.js';
/** Fetch and cache account/device-scoped history while the route is visible. */
export function useHistory() {
  const { session } = usePhoneData();
  const [events, setEvents] = useState(
    /** @type {import('../core/history.js').HistoryEvent[]} */ ([]),
  );
  const [loading, setLoading] = useState(true),
    [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(''),
    [hasMore, setHasMore] = useState(false);
  const limit = useRef(50),
    remoteOffset = useRef(0),
    remoteMore = useRef(false),
    revision = useRef(0),
    busy = useRef(false);
  const refresh = useCallback(async () => {
    const epoch = ++revision.current;
    setRefreshing(true);
    try {
      const local = historyPage(session, session.server, limit.current);
      setEvents(local);
      setHasMore(local.length === limit.current);
      setLoading(false);
      if (session.server) {
        const result = await syncHistory(session);
        if (epoch !== revision.current) return;
        remoteOffset.current = result.count;
        remoteMore.current = result.hasMore;
      }
      if (epoch !== revision.current) return;
      const page = historyPage(session, session.server, limit.current);
      setEvents(page);
      setHasMore(page.length === limit.current || remoteMore.current);
      setError('');
    } catch (err) {
      if (epoch === revision.current)
        setError(
          session.server
            ? 'Agent activity could not be refreshed. Saved history is still available.'
            : err instanceof Error
              ? err.message
              : 'History could not be loaded.',
        );
    } finally {
      if (epoch === revision.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [session]);
  useFocusEffect(
    useCallback(() => {
      limit.current = 50;
      remoteOffset.current = 0;
      remoteMore.current = false;
      void Promise.resolve().then(refresh);
      const timer = setInterval(() => void refresh(), 30000);
      return () => {
        revision.current++;
        clearInterval(timer);
      };
    }, [refresh]),
  );
  const loadMore = useCallback(async () => {
    if (busy.current || !hasMore || refreshing) return;
    busy.current = true;
    const epoch = revision.current;
    try {
      if (session.server && remoteMore.current) {
        const result = await syncHistory(session, remoteOffset.current);
        if (epoch !== revision.current) return;
        remoteOffset.current += result.count;
        remoteMore.current = result.hasMore;
      }
      if (epoch !== revision.current) return;
      limit.current += 50;
      const page = historyPage(session, session.server, limit.current);
      setEvents(page);
      setHasMore(page.length === limit.current || remoteMore.current);
    } catch {
      if (epoch === revision.current)
        setError('Older activity could not be loaded. Pull down to retry.');
    } finally {
      busy.current = false;
    }
  }, [session, hasMore, refreshing]);
  return { events, loading, refreshing, error, hasMore, refresh, loadMore };
}
