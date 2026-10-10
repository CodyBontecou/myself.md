/** @typedef {'myself.md.export.v1'} ExportSchema */
const originalExportSchema = /** @type {const} */ ('myself.md.export.v1');
export const defaultExportSchema = originalExportSchema;
const recordDefinition = {
  type: 'object',
  required: ['domain', 'type', 'source', 'start', 'end', 'native'],
  properties: {
    domain: { enum: ['health', 'time', 'location'] },
    type: { type: 'string' },
    source: { type: 'string' },
    start: { type: ['string', 'null'] },
    end: { type: ['string', 'null'] },
    native: {},
    timeSeries: {
      type: 'object',
      additionalProperties: {
        type: 'array',
        items: {
          type: 'object',
          required: ['timestamp', 'value'],
          properties: {
            timestamp: { type: ['string', 'null'] },
            value: {},
            unit: { type: 'string' },
            metadata: {},
            offsetSeconds: { type: 'number' },
          },
          additionalProperties: true,
        },
      },
    },
  },
  additionalProperties: true,
};
/** Released contracts only. Add a new descriptor and serializer together; never rewrite v1. */
const schemas = [
  {
    id: originalExportSchema,
    version: 'v1',
    title: 'Original',
    description:
      'Source records and explicit time series. Preserves native fields, every available observation, timestamps, precision and metadata.',
    changes: [
      'Initial export contract. No summaries, resampling, deduplication or unit conversion.',
    ],
    definition: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: 'myself.md export v1',
      type: 'object',
      required: ['schema', 'records'],
      properties: {
        schema: { const: originalExportSchema },
        records: { type: 'array', items: recordDefinition },
      },
      additionalProperties: true,
    },
    jsonlRecordDefinition: recordDefinition,
    example: {
      schema: originalExportSchema,
      records: [
        {
          domain: 'health',
          type: 'HeartRate',
          source: 'native',
          start: '2026-10-08T08:00:00.000Z',
          end: '2026-10-08T08:00:00.000Z',
          native: { quantity: 70, unit: 'count/min' },
          timeSeries: {
            samples: [{ timestamp: '2026-10-08T08:00:00.000Z', value: 70, unit: 'count/min' }],
          },
        },
      ],
    },
  },
];
/** Return detached descriptors so consumers cannot change the released contract. */
export function exportSchemas() {
  return {
    recommended: defaultExportSchema,
    versions: /** @type {typeof schemas} */ (JSON.parse(JSON.stringify(schemas))),
  };
}
/** Missing settings always resolve to the original contract, even after new releases.
 * @param {unknown} value @returns {ExportSchema} */
export function parseExportSchema(value = originalExportSchema) {
  if (!schemas.some((schema) => schema.id === value))
    throw new Error(
      `Unsupported export schema: ${String(value)}. Choose a released schema version.`,
    );
  return /** @type {ExportSchema} */ (value);
}
/** Version-specific serialization must preserve the complete source record.
 * @param {import('./data.js').DataRecord} record @param {ExportSchema} [schema] */
export function serializeExportRecord(record, schema = defaultExportSchema) {
  parseExportSchema(schema);
  switch (schema) {
    case 'myself.md.export.v1':
      return JSON.stringify(record);
  }
}
