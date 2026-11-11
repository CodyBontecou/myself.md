import { useEffect, useState } from 'react';
import { addDays, nextOccurrence } from '../core/schedules.js';
import { scheduledRuns } from '../core/profile-timeline.js';
import { formatNextExport, localCalendar } from './calendar.js';
import { scheduleState } from './export-task.js';
import ProfileExports from './ProfileExports.js';
import { SectionLabel, TodaySchedule } from '../src/screens/strands/ProfileStrands.js';

/** Profiles tab overview: the soonest scheduled export, an optional suggestion, and today's slots.
 * Reads the same persisted schedule progress and `nextOccurrence` rules as the export worker.
 * @param {{session:import('./session.js').Session,profiles:import('../core/profiles.js').ExportProfile[],disabled:boolean,suggestion:import('react').ReactNode}} props */
export default function ProfilesOverview({ session, profiles, disabled, suggestion }) {
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date().toISOString()), 30000);
    return () => clearInterval(timer);
  }, []);
  const today = localCalendar.day(now);
  const start = localCalendar.instant(today, 0, 0);
  const end = localCalendar.instant(addDays(today, 1), 0, 0);
  const span = Date.parse(end) - Date.parse(start);
  const rows = profiles.map((profile) => {
    const { progress } = scheduleState(session.deviceId, profile);
    return {
      profile,
      progress,
      next: nextOccurrence(profile.schedule, progress, now, localCalendar),
    };
  });
  // The soonest scheduled profile leads; with nothing scheduled, the first profile does.
  const lead = rows.reduce(
    (best, row) => (row.next && (!best?.next || row.next < best.next) ? row : best),
    rows[0],
  );
  const automatic = rows.filter((row) => row.progress.enabled).length;
  const lanes = rows.map(({ profile, progress, next }) => {
    const runs = scheduledRuns(profile.schedule, progress, start, end, localCalendar);
    return {
      id: profile.id,
      name: profile.name,
      runs: runs.map((at) => ({
        at: (Date.parse(at) - Date.parse(start)) / span,
        passed: at <= now,
      })),
      label: progress.enabled
        ? `${profile.name}: ${runs.length} scheduled ${runs.length === 1 ? 'slot' : 'slots'} today${next ? `, next ${formatNextExport(next, now)}` : ''}`
        : `${profile.name}: automatic exports off`,
    };
  });
  const time = new Date(now).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return (
    <>
      {lead && (
        <ProfileExports
          key={lead.profile.id}
          hero
          session={session}
          profile={lead.profile}
          disabled={disabled}
        />
      )}
      {suggestion}
      <TodaySchedule
        testID="profiles-today"
        lanes={lanes}
        now={(Date.parse(now) - Date.parse(start)) / span}
        caption={`${automatic} automatic · now ${time}`}
      />
      <SectionLabel title="All profiles" />
    </>
  );
}
