import { domains } from './data.js';

/** Retain known actionable errors; arbitrary native/network messages may contain secrets.
 * @param {unknown} error */
export function exportFailureMessage(error) {
  const message = error instanceof Error ? error.message : '';
  const safe = [
    'Select at least one data type.',
    'No selected sources could be read. Review permissions or edit the profile.',
    'Use an HTTPS endpoint without credentials or fragments.',
    'Save the HTTP credential for this endpoint before exporting.',
    'Authorize cloud uploads on this profile first.',
    'Cloud daily files are limited to 16 MiB. Reduce selected types.',
    'Sign in to check your shared export allowance.',
    'Reconnect your account to use its shared free exports.',
    'Please sign in again.',
    'Export cancelled: profile changed.',
    'Export cancelled: profile or schedule changed.',
    'Export cancelled before delivery.',
    'Export cancelled before upload.',
  ];
  if (
    safe.includes(message) ||
    /^(?:HTTP export failed|Cloud upload failed) \([1-5]\d{2}\)\.$/.test(message) ||
    /^Cloud upload could not start \([1-5]\d{2}\)\. Reauthorize if expired\.$/.test(message)
  )
    return message;
  return 'The export could not finish. Check source permissions and destination access.';
}

/** Return evidence and repair destinations without guessing a failure's cause.
 * Current configuration can differ from the saved export snapshot.
 * @param {import('./history.js').HistoryEvent} event
 * @param {{id:string,selection:Record<import('./data.js').Domain,string[]>}|null|undefined} profile
 * @param {{domain:import('./data.js').Domain,availableTypes:string[],notes:string[]}[]} sources
 */
export function exportDiagnostics(event, profile, sources) {
  const profileLink = profile
    ? `qrconnect://profiles/${encodeURIComponent(profile.id)}`
    : 'qrconnect://profiles';
  return {
    outcome: event.status,
    error: event.error,
    warnings: event.warnings,
    profileExists: profile === undefined ? null : Boolean(profile),
    selectionChanged: profile
      ? domains.some(
          (domain) =>
            profile.selection[domain].length !== event.profile.selection[domain].length ||
            profile.selection[domain].some(
              (type) => !event.profile.selection[domain].includes(type),
            ),
        )
      : null,
    actions: [
      {
        label: 'Review export details',
        deepLink: `qrconnect://history/${encodeURIComponent(event.id)}`,
      },
      { label: 'Review profile destination, output and schedule', deepLink: profileLink },
      ...domains
        .filter((domain) => event.profile.selection[domain].length > 0)
        .map((domain) => {
          const source = sources.find((item) => item.domain === domain);
          return {
            label: `Review ${domain} permissions`,
            deepLink: `qrconnect://data/${domain}`,
            notes: source?.notes ?? [],
            unavailableTypes: source
              ? event.profile.selection[domain].filter(
                  (type) => !source.availableTypes.includes(type),
                )
              : null,
          };
        }),
    ],
    guidance:
      'Use the saved error and warnings as evidence. Current settings do not prove what caused an earlier failure. Empty health results do not prove permission denial. Open the links on the paired phone, review changes and retry from the profile. Local exports do not require agent data grants.',
  };
}
