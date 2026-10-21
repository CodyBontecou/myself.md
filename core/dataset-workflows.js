/** Public examples of supported questions, never a connected person's data or grants. */
export const workflowPrerequisites = [
  'Connect a compatible AI assistant at https://myself.md/mcp and complete sign-in.',
  'Pair an installed myself.md phone app with the same account. Public store downloads are coming soon.',
  'Select the required data in a phone profile, allow the relevant OS permissions and separately approve its Agent permissions.',
];

export const workflowQuerySteps = [
  {
    tool: 'get_phone_data_catalog',
    instruction:
      'Discover connected phones, approved profiles and actual supported types. Catalog support does not prove that records exist.',
  },
  {
    tool: 'query_phone_data',
    instruction:
      'Use the discovered device/profile IDs and approved native types. Resolve the question to explicit date bounds and a timezone; request only the needed data.',
  },
  {
    tool: 'get_phone_request',
    instruction:
      'Poll queued or running requests. Use records only after complete; report failed, expired or missing requests. Follow every result cursor with a new bounded query.',
  },
];

export const datasetWorkflows = [
  {
    id: 'sleep-trends',
    dataset: 'health',
    topic: 'Sleep',
    question: 'How has my sleep changed this month?',
    description:
      'Ask your assistant to compare sleep duration across the nights with available records.',
    dataNeeded: 'Sleep records covering the dates you want to compare.',
    requiredTypes: {
      ios: ['native:HKCategoryTypeIdentifierSleepAnalysis'],
      android: ['native:SleepSession'],
    },
    availability:
      'Apple Health on iOS or Health Connect on Android, when sleep records are present and approved.',
    limitations: [
      'Overlapping sources and sleep stages need careful handling; time in bed is not time asleep.',
      'Missing nights cannot be treated as zero sleep. HealthKit cannot distinguish denied reads from missing samples. Android historical access may limit older records.',
    ],
    example:
      'Across 12 nights with records, your average sleep was 7 hours 10 minutes. Three nights have no records, so I excluded them from the average.',
    prompt:
      'How has my sleep changed this month? Compare nights with records and flag missing nights or overlapping sleep sources.',
  },
  {
    id: 'walking-trends',
    dataset: 'health',
    topic: 'Activity',
    question: 'Am I walking more than last month?',
    description:
      'Compare daily step counts over equivalent periods, with gaps and sources explained.',
    dataNeeded: 'Step records for two comparable date ranges.',
    requiredTypes: { ios: ['native:HKQuantityTypeIdentifierStepCount'], android: ['native:Steps'] },
    availability:
      'Apple Health on iOS or Health Connect on Android, when step records are present and approved.',
    limitations: [
      'Samples can overlap across sources; adding every sample may double count steps.',
      'A partial day or missing records can distort a comparison. Android historical access may limit last month’s records.',
    ],
    example:
      'For the first 14 complete days of each month with records, your daily average rose from 5,800 to 6,400 steps. These figures exclude days with missing coverage.',
    prompt:
      'Am I walking more than last month? Compare equivalent complete periods and avoid double-counting overlapping step sources.',
  },
  {
    id: 'app-usage',
    dataset: 'screen-time',
    topic: 'Screen time',
    question: 'Which apps took most of my time last week?',
    description: 'See which apps account for the most recorded usage during a chosen week.',
    dataNeeded: 'Application usage totals for the week.',
    requiredTypes: { ios: ['native:applications'], android: ['native:applications'] },
    availability:
      'Android requires usage access. iOS requires iOS 26.4+, the approved Family Controls data entitlement, EU eligibility and authorization with data access.',
    limitations: [
      'iOS provides hourly aggregates and may include other devices on the same Screen Time account; app identifiers may be redacted.',
      'Usage totals do not show browser history or prove attention. Android applications are daily aggregates.',
    ],
    example:
      'Reader had 3 hours 20 minutes of recorded usage last week, followed by Maps at 1 hour 5 minutes. One app could not be identified.',
    prompt:
      'Which apps took most of my time last week? Rank recorded usage and note gaps, unidentified apps or other included devices.',
  },
  {
    id: 'recorded-locations',
    dataset: 'location',
    topic: 'Location',
    question: 'Where did I record locations last week?',
    description: 'Review the location points you previously chose to record with myself.md.',
    dataNeeded: 'Points recorded by myself.md during the selected dates.',
    requiredTypes: { ios: ['native:points'], android: ['native:points'] },
    availability:
      'iOS and Android, after background recording is enabled with the required location permission.',
    limitations: [
      'myself.md cannot retrieve a historical location archive from the OS; recording must already have been running.',
      'Recorded points have accuracy and sampling gaps. They do not establish a complete route or confirmed place visits.',
    ],
    example:
      'Your recorded points form two clusters of coordinates during the week. There are no points for Tuesday, and I cannot confirm where you were that day.',
    prompt:
      'Where did I record locations last week? Summarize recorded points and their accuracy, without inferring a complete route or confirmed visits.',
  },
].map((workflow) =>
  Object.assign({}, workflow, {
    prompt: `Use myself.md: ${workflow.prompt}

Use approved records, confirm dates and timezone, and explain missing data. If needed, help me connect https://myself.md/mcp using https://myself.md/docs and wait for my approvals.`,
  }),
);
