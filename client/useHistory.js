import { errorJSON } from '../packages/support-chat/errors.js';
import { qaEnabled, qaSnapshot } from './qa-runtime.js';
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { usePhoneData } from './DataPanel.js';
import { historyPage, syncHistory } from './history.js';
import { subscribeLogs } from './log-updates.js';
import { debugReport } from './debug-log.js';
/** Fetch and observe account/device-scoped logs while the route is visible.
 * @param {boolean} [live] */
export function useHistory(live = false) {
  const { session } = usePhoneData();
  const [events, setEvents] = useState(
    /** @type {import('../core/history.js').HistoryEvent[]} */ ([]),
  );
  const [diagnostics, setDiagnostics] = useState(
    /** @type {import('../core/debug-log.js').DebugEntry[]} */ ([]),
  );
  const [diagnosticsTime, setDiagnosticsTime] = useState(0);
  const [diagnosticsError, setDiagnosticsError] = useState('');
  const [loading, setLoading] = useState(true),
    [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(''),
    [hasMore, setHasMore] = useState(events.length === 50);
  const limit = useRef(50),
    remoteOffset = useRef(0),
    remoteMore = useRef(false),
    revision = useRef(0),
    busy = useRef(false),
    syncing = useRef(false);
  const readLocal = useCallback(() => {
    if (qaEnabled && qaSnapshot().scenario === 'loading') return;
    try {
      const report = debugReport(session);
      setDiagnostics(report.entries);
      setDiagnosticsTime(report.generatedAt);
      setDiagnosticsError('');
    } catch (failure) {
      setDiagnosticsError(errorJSON(failure));
    }
    try {
      setEvents(
        qaEnabled
          ? qaSnapshot().events.slice(0, limit.current)
          : historyPage(session, session.server, limit.current),
      );
    } catch (failure) {
      setError(errorJSON(failure));
    }
  }, [session]);
  const refresh = useCallback(
    async (showIndicator = true, publish = true) => {
      if (syncing.current) return;
      syncing.current = true;
      const epoch = ++revision.current;
      setRefreshing(showIndicator);
      if (qaEnabled && qaSnapshot().scenario === 'loading') {
        setRefreshing(false);
        setLoading(true);
        syncing.current = false;
        return;
      }
      readLocal();
      const pageAt = () =>
        qaEnabled
          ? qaSnapshot().events.slice(0, limit.current)
          : historyPage(session, session.server, limit.current);
      try {
        const local = pageAt();
        if (qaEnabled && qaSnapshot().scenario === 'history-error') {
          setEvents(local);
          throw new Error('Synthetic history refresh failed. Saved entries are still available.');
        }
        setEvents(local);
        setHasMore(local.length === limit.current);
        setLoading(false);
        if (session.server) {
          const result = await syncHistory(session, 0, publish);
          if (epoch !== revision.current) return;
          if (publish) {
            remoteOffset.current = result.count;
            remoteMore.current = result.hasMore;
          }
        }
        if (epoch !== revision.current) return;
        const page = qaEnabled
          ? qaSnapshot().events.slice(0, limit.current)
          : historyPage(session, session.server, limit.current);
        setEvents(page);
        setHasMore(page.length === limit.current || remoteMore.current);
        setError('');
      } catch (err) {
        if (epoch === revision.current) setError(errorJSON(err));
      } finally {
        syncing.current = false;
        if (epoch === revision.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [session, readLocal],
  );
  useFocusEffect(
    useCallback(() => {
      limit.current = 50;
      remoteOffset.current = 0;
      remoteMore.current = false;
      void Promise.resolve().then(() => refresh(false));
      const unsubscribe = subscribeLogs(session, readLocal);
      const timer = setInterval(() => void refresh(false), 30000);
      return () => {
        revision.current++;
        clearInterval(timer);
        unsubscribe();
      };
    }, [refresh, session, readLocal]),
  );
  useFocusEffect(
    useCallback(() => {
      if (!live) return;
      const timer = setInterval(() => void refresh(false, false), 2000);
      return () => clearInterval(timer);
    }, [live, refresh]),
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
      const page = qaEnabled
        ? qaSnapshot().events.slice(0, limit.current)
        : historyPage(session, session.server, limit.current);
      setEvents(page);
      setHasMore(page.length === limit.current || remoteMore.current);
    } catch (failure) {
      if (epoch === revision.current) setError(errorJSON(failure));
    } finally {
      busy.current = false;
    }
  }, [session, hasMore, refreshing]);
  return {
    events,
    diagnostics,
    diagnosticsTime,
    diagnosticsError,
    loading,
    refreshing,
    error,
    hasMore,
    refresh,
    loadMore,
  };
}
