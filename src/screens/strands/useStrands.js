import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePhoneData } from '../../../client/DataPanel.js';
import {
  dateKey,
  loadStrandsRows,
  localDays,
  localHourSlots,
  saveStrandsProfile,
  strandsCoverage,
  strandsProfile,
} from '../../../client/strands.js';

/** @typedef {import('../../../core/profiles.js').ExportProfile} ExportProfile */

export const today = () => dateKey(new Date());

/** @param {string} date @param {number} delta */
export function shiftDate(date, delta) {
  return (
    localDays(date, 1).map((d) => {
      const s = new Date(d.start);
      return dateKey(new Date(s.getFullYear(), s.getMonth(), s.getDate() + delta));
    })[0] ?? date
  );
}

/** The profile Strands reads through, with a way to switch between eligible profiles. */
export function useStrandsProfile() {
  const { session, profiles } = usePhoneData();
  const all = useMemo(() => profiles?.profiles ?? [], [profiles]);
  const eligible = useMemo(() => all.filter((p) => strandsCoverage(p).count > 0), [all]);
  const [version, setVersion] = useState(0);
  const profile = useMemo(
    () => (version >= 0 ? strandsProfile(session.owner, all) : undefined),
    [session.owner, all, version],
  );
  const next = useCallback(() => {
    if (eligible.length < 2 || !profile) return;
    const index = eligible.findIndex((p) => p.id === profile.id);
    const choice = eligible[(index + 1) % eligible.length];
    if (!choice) return;
    saveStrandsProfile(session.owner, choice.id);
    setVersion((v) => v + 1);
  }, [eligible, profile, session.owner]);
  return { session, profile, eligible, next };
}

/** Heart rate, resting heart rate and steps only draw the Today Body strand; multi-day
 * Patterns and Try skip them (sleep stays) to keep 31-day reads small. */
const dayOnlyBody = /(HeartRate|StepCount|:Steps)$/;

/** Load strand records for consecutive local days ending on `last`.
 * @param {ExportProfile|undefined} profile @param {string} last @param {number} count
 * @param {{heart?:boolean,extraDays?:number,locationOnly?:boolean}} [options] `heart: false` skips day-only Body types. */
export function useStrandsWindow(profile, last, count, options = {}) {
  const { session } = usePhoneData();
  const heart = options.heart ?? true;
  const locationOnly = options.locationOnly ?? false;
  const extra = options.extraDays ?? 0;
  const [state, setState] = useState(
    /** @type {{status:'idle'|'loading'|'ready'|'error',rows:import('../../../core/screen-time-review.js').ReviewRecord[],warnings:string[],error:string,key:string}} */ ({
      status: 'idle',
      rows: [],
      warnings: [],
      error: '',
      key: '',
    }),
  );
  const [reload, setReload] = useState(0);
  const days = useMemo(() => localDays(last, count + extra), [last, count, extra]);
  const slots = useMemo(() => localHourSlots(days), [days]);
  const key = `${profile?.id ?? ''}:${last}:${count}:${extra}:${heart}:${locationOnly}:${reload}`;
  useEffect(() => {
    if (!profile) return;
    let active = true;
    const first = days[0],
      end = days.at(-1);
    if (!first || !end) return;
    const filtered = {
      ...profile,
      selection: {
        location: profile.selection.location,
        time: locationOnly ? [] : profile.selection.time,
        health: locationOnly
          ? []
          : profile.selection.health.filter((t) => heart || !dayOnlyBody.test(t)),
      },
    };
    const read = async () => {
      try {
        const result = await loadStrandsRows(session.owner, filtered, days);
        if (active)
          setState({
            status: 'ready',
            rows: result.rows,
            warnings: result.warnings,
            error: '',
            key,
          });
      } catch (error) {
        if (active)
          setState({
            status: 'error',
            rows: [],
            warnings: [],
            error: error instanceof Error ? error.message : 'Data could not be read.',
            key,
          });
      }
    };
    void read();
    return () => {
      active = false;
    };
  }, [profile, days, heart, locationOnly, key, session.owner]);
  return {
    days,
    slots,
    rows: state.rows,
    warnings: state.warnings,
    error: state.error,
    status: state.key === key ? state.status : 'loading',
    refresh: () => setReload((r) => r + 1),
  };
}
