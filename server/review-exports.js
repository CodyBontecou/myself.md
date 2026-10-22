import { scheduleCalendar } from './schedule-calendar.js';
/** Bounded, metered export reads shared by embedded reviews.
 * @param {{exportIds:string[],start:string,end:string,timezone:string}} args
 * @param {{cloud:import('./cloud-store.js').CloudStore,subject:string,readPage:(id:string,cursor:string)=>ReturnType<import('./cloud-store.js').CloudStore['page']>}} dependencies
 * @param {import('../core/data.js').Domain} domain */
export async function readReviewExports(
  { exportIds, start, end, timezone },
  { cloud, subject, readPage },
  domain,
) {
  const length = (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
  if (!Number.isInteger(length) || length < 1 || length > 31)
    throw new Error('Choose 1–31 completed days, with end on or after start.');
  const calendar = scheduleCalendar(timezone);
  const days = Array.from({ length }, (_, index) => {
    const date = new Date(Date.parse(start) + index * 86400000).toISOString().slice(0, 10);
    const next = new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10);
    const a = calendar.instant(date, 0, 0),
      b = calendar.instant(next, 0, 0);
    if (calendar.day(a) !== date || b <= a || Date.parse(b) > Date.now())
      throw new Error('Choose completed calendar days in this timezone.');
    return { date, start: a, end: b };
  });
  const available = cloud.list(subject, true);
  const files = exportIds.map((id) => {
    const file = available.find((f) => f.id === id && f.agentPermissions[domain]);
    if (!file)
      throw new Error('A selected export is unavailable. Refresh shared export discovery.');
    return file;
  });
  if (files.some((f) => f.deviceId !== files[0]?.deviceId || f.profileId !== files[0]?.profileId))
    throw new Error('Choose one phone and profile per review.');
  /** @param {string} id */
  function snapshot(id) {
    const row = cloud.row(subject, id);
    const permission = cloud.permission(subject, row.device, row.profile);
    if (!permission.agentPermissions[domain])
      throw new Error('Sharing changed. Refresh discovery.');
    return JSON.stringify([row.content_hash, row.size, row.created, permission]);
  }
  const snapshots = files.map((f) => snapshot(f.id));
  function verify() {
    for (const [index, file] of files.entries())
      if (snapshot(file.id) !== snapshots[index])
        throw new Error('Exports or sharing changed during review. Retry discovery.');
  }
  /** @type {{exportId:string,record:import('../core/data.js').DataRecord}[]} */
  const rows = [];
  let pages = 0;
  for (const file of files) {
    let cursor = '';
    do {
      if (++pages > 200)
        throw new Error(
          'Review exceeds 200 pages. Select fewer exports; no partial review returned.',
        );
      // Sequential metered reads preserve quota accounting and revocation checks.
      // oxlint-disable-next-line eslint/no-await-in-loop
      const page = await readPage(file.id, cursor);
      verify();
      rows.push(...page.records.map((record) => ({ exportId: file.id, record })));
      cursor = page.nextCursor ?? '';
    } while (cursor);
  }
  verify();
  const exports = files.map((f) => {
    const m = cloud.metadata(cloud.row(subject, f.id)).manifest;
    return {
      id: f.id,
      day: f.day,
      partial: m.status === 'partial' || m.complete === false || m.partial === true,
    };
  });
  return {
    verify,
    days,
    rows,
    exports,
    scope: { deviceId: files[0]?.deviceId ?? '', profileId: files[0]?.profileId ?? '' },
  };
}
