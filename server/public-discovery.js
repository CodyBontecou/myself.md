import { phoneQueryBodySchema } from './data-service.js';
import { privacyPolicy } from '../core/privacy.js';
import { healthGuides } from '../core/health-guides.js';

const origin = 'https://myself.md';
const card = {
  $schema: 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json',
  name: 'md.myself/mcp',
  title: 'myself.md',
  description:
    'myself.md: owner-approved phone data exports and remote MCP access. Reads Apple Health through HealthKit on iOS and Health Connect on Android, plus supported screen time and recorded location. Maintained by Cody Bontecou at github.com/CodyBontecou/myself.md. Official website: https://myself.md/; MCP: https://myself.md/mcp. Separate from self.md and other Apple Health MCP projects.',
  version: '1.0.0',
  websiteUrl: origin,
  repository: { url: 'https://github.com/CodyBontecou/myself.md', source: 'github' },
  remotes: [{ type: 'streamable-http', url: `${origin}/mcp` }],
};
const catalog = {
  specVersion: '1.0',
  host: { displayName: 'myself.md' },
  entries: [
    {
      identifier: 'urn:air:myself.md:mcp:personal-data',
      displayName: 'myself.md MCP',
      type: 'application/mcp-server-card+json',
      url: `${origin}/mcp/server-card`,
    },
    {
      identifier: 'urn:air:myself.md:api:public-discovery',
      displayName: 'myself.md public discovery API',
      type: 'application/vnd.oai.openapi+json',
      url: `${origin}/openapi.json`,
    },
  ],
};
/** @param {string} operationId @param {string} description @param {Record<string, unknown>} content */
function readOperation(operationId, description, content) {
  return {
    get: {
      operationId,
      summary: description,
      description,
      security: [],
      responses: {
        429: {
          description: 'Public read rate limit exceeded. Honor Retry-After.',
          headers: { 'Retry-After': { schema: { type: 'integer', minimum: 1 } } },
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ServiceError' } },
          },
        },
        200: {
          description: 'Public read completed.',
          headers: {
            'RateLimit-Limit': { schema: { type: 'integer' } },
            'RateLimit-Remaining': { schema: { type: 'integer' } },
            'RateLimit-Reset': { schema: { type: 'integer' } },
          },
          content,
        },
        503: {
          description: 'Service could not complete the request; retry later.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ServiceError' } },
          },
        },
      },
    },
  };
}
const textContent = {
  'text/markdown': {
    schema: { type: 'string', description: 'Public Markdown content; no personal records.' },
  },
};
/** Public discovery and the REST adapter share the live MCP query input contract. */
const openapi = {
  openapi: '3.1.1',
  info: {
    title: 'myself.md public discovery API',
    version: '1.0.0',
    description:
      'Public service discovery and authenticated asynchronous phone queries. Additional private account and phone operations are exposed through OAuth-protected MCP at /mcp; initialize and call tools/list for authoritative schemas. This specification does not describe private dashboard or phone-owner APIs. Public reads are versioned under /v1. Additive fields are compatible; breaking changes require a new major path. Deprecations are announced in /docs at least 90 days before removal, with Deprecation and Sunset response headers. No v1 endpoint is currently deprecated.',
    contact: {
      name: 'myself.md support',
      email: privacyPolicy.supportEmail,
      url: `${origin}/contact`,
    },
  },
  servers: [{ url: origin }],
  externalDocs: {
    description: 'MCP authentication and owner approval workflow',
    url: `${origin}/docs`,
  },
  components: {
    securitySchemes: {
      agentBearer: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'OAuth 2.0 access token',
        description:
          'Agent OAuth client, myselfmd scope and owner-approved phone data grants required. Discover the issuer at /.well-known/oauth-protected-resource/mcp.',
      },
    },
    schemas: {
      ServiceError: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'string',
            description: 'Safe human-readable failure message; contains no credentials.',
          },
        },
      },
    },
  },
  paths: {
    '/blog': readOperation(
      'listPublicBlogPosts',
      'Read the complete published blog index, newest first. Send Accept: text/markdown; HTML is the default. No account or private records.',
      { ...textContent, 'text/html': { schema: { type: 'string' } } },
    ),
    '/blog/{slug}': {
      get: {
        ...readOperation(
          'readPublicBlogPost',
          'Read a published post in full. Discover slugs at /blog. Send Accept: text/markdown, or append .md to the post URL. An unknown post returns 404.',
          { ...textContent, 'text/html': { schema: { type: 'string' } } },
        ).get,
        parameters: [
          {
            name: 'slug',
            in: 'path',
            required: true,
            schema: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
          },
        ],
        responses: {
          ...readOperation('readPublicBlogPost', 'Read a published post.', {
            ...textContent,
            'text/html': { schema: { type: 'string' } },
          }).get.responses,
          404: {
            description: 'Post not found. Return to /blog to discover published slugs.',
            content: { ...textContent, 'text/html': { schema: { type: 'string' } } },
          },
        },
      },
    },
    '/v1/dataset-catalog': {
      get: {
        ...readOperation(
          'listPublicDatasets',
          'Discover supported questions, starter prompts, platform requirements and query workflows alongside dataset adapters; follow nextCursor until hasMore is false. Examples are fictional; no personal records or grants.',
          {
            'application/json': {
              schema: {
                type: 'object',
                required: ['items', 'nextCursor', 'hasMore', 'total'],
                properties: {
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['slug', 'name', 'domain', 'description', 'url'],
                      properties: {
                        slug: { type: 'string' },
                        name: { type: 'string' },
                        domain: { type: 'string' },
                        description: { type: 'string' },
                        url: { type: 'string', format: 'uri' },
                        sources: { type: 'string' },
                        limitations: { type: 'array', items: { type: 'string' } },
                        workflows: {
                          type: 'array',
                          items: {
                            type: 'object',
                            required: [
                              'id',
                              'dataset',
                              'topic',
                              'question',
                              'description',
                              'dataNeeded',
                              'requiredTypes',
                              'availability',
                              'limitations',
                              'example',
                              'exampleKind',
                              'prompt',
                              'prerequisites',
                              'querySteps',
                              'setupUrl',
                              'interpretation',
                            ],
                            properties: {
                              id: { type: 'string' },
                              dataset: { type: 'string' },
                              topic: { type: 'string' },
                              question: { type: 'string' },
                              description: { type: 'string' },
                              dataNeeded: { type: 'string' },
                              requiredTypes: {
                                type: 'object',
                                required: ['ios', 'android'],
                                properties: {
                                  ios: { type: 'array', items: { type: 'string' } },
                                  android: { type: 'array', items: { type: 'string' } },
                                },
                              },
                              availability: { type: 'string' },
                              limitations: { type: 'array', items: { type: 'string' } },
                              example: { type: 'string' },
                              exampleKind: { type: 'string', const: 'fictional' },
                              prompt: { type: 'string' },
                              prerequisites: { type: 'array', items: { type: 'string' } },
                              querySteps: {
                                type: 'array',
                                items: {
                                  type: 'object',
                                  required: ['tool', 'instruction'],
                                  properties: {
                                    tool: { type: 'string' },
                                    instruction: { type: 'string' },
                                  },
                                },
                              },
                              setupUrl: { type: 'string', format: 'uri' },
                              interpretation: { type: 'string' },
                            },
                          },
                        },
                        groups: {
                          type: 'array',
                          items: {
                            type: 'object',
                            required: ['title', 'keys'],
                            properties: {
                              title: { type: 'string' },
                              keys: { type: 'array', items: { type: 'string' } },
                            },
                          },
                        },
                      },
                    },
                  },
                  nextCursor: { type: ['string', 'null'] },
                  hasMore: { type: 'boolean' },
                  total: { type: 'integer' },
                },
              },
            },
          },
        ).get,
        parameters: [
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 3, default: 3 },
          },
          {
            name: 'cursor',
            in: 'query',
            schema: { type: 'string', pattern: '^catalog-v1:[0-3]$' },
          },
        ],
      },
    },
    '/api/v1/queries': {
      post: {
        operationId: 'createPhoneQuery',
        summary:
          'Queue an owner-approved phone query. Poll the Location URL for the actual result.',
        security: [{ agentBearer: [] }],
        description:
          'Idempotency keys are scoped to account and agent client. Identical live retries reuse the job without another billing reservation. Changed arguments, unavailable originals and revoked grants fail. Jobs expire after five minutes; activity fingerprints are retained for 90 days. A 202 response does not prove completion.',
        parameters: [
          {
            name: 'Idempotency-Key',
            in: 'header',
            required: true,
            schema: { type: 'string', minLength: 1, maxLength: 200 },
          },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: phoneQueryBodySchema } },
        },
        responses: {
          429: {
            description: 'Agent REST local quota exceeded; honor Retry-After.',
            headers: { 'Retry-After': { schema: { type: 'integer', minimum: 1 } } },
          },
          202: {
            description: 'Query accepted, or original live query returned.',
            headers: { Location: { schema: { type: 'string' } } },
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['requestId', 'status', 'expiresAt'],
                  properties: {
                    requestId: { type: 'string', format: 'uuid' },
                    status: { type: 'string', enum: ['queued', 'running', 'complete', 'failed'] },
                    expiresAt: { type: 'integer', description: 'Unix epoch milliseconds.' },
                  },
                },
              },
            },
          },
          401: { description: 'Missing or expired OAuth token.' },
          403: { description: 'Invalid scope, blocked agent or first-party client.' },
          422: {
            description: 'Input, grant, billing, idempotency or phone availability failure.',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ServiceError' } },
            },
          },
        },
      },
    },
    '/api/v1/queries/{requestId}': {
      get: {
        operationId: 'getPhoneQuery',
        summary: 'Poll the actual phone query state and completed page.',
        security: [{ agentBearer: [] }],
        parameters: [
          {
            name: 'requestId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          200: {
            description: 'Current query state; queued and running require continued polling.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['requestId', 'status', 'expiresAt', 'result', 'error'],
                  properties: {
                    requestId: { type: 'string', format: 'uuid' },
                    status: { type: 'string', enum: ['queued', 'running', 'complete', 'failed'] },
                    expiresAt: { type: 'integer' },
                    result: {
                      type: ['object', 'null'],
                      description:
                        'Completed export page, schema and format. Follow result.page.nextCursor with a new query.',
                    },
                    error: { type: ['string', 'null'] },
                  },
                },
              },
            },
          },
          401: { description: 'Missing or expired OAuth token.' },
          403: { description: 'Invalid scope, blocked agent or first-party client.' },
          422: { description: 'Unknown, expired or inaccessible request.' },
        },
      },
    },
    '/v1/health': readOperation(
      'getServiceHealth',
      'Check whether the hosted service can respond. Does not prove phone availability.',
      {
        'application/json': {
          schema: {
            type: 'object',
            required: ['ok'],
            properties: {
              ok: { type: 'boolean' },
              platform: { type: 'string', description: 'Present on the hosted Worker.' },
            },
          },
        },
      },
    ),
    '/v1/dashboard/config': readOperation(
      'getDashboardConnectionConfiguration',
      'Discover the OAuth issuer and dashboard client ID. Sign-in and owner authorization remain required for dashboard actions.',
      {
        'application/json': {
          schema: {
            type: 'object',
            required: ['issuer', 'clientId'],
            properties: { issuer: { type: 'string', format: 'uri' }, clientId: { type: 'string' } },
          },
        },
      },
    ),
    '/v1/config': readOperation(
      'getConnectionConfiguration',
      'Discover the OAuth issuer, phone client ID and MCP resource URL.',
      {
        'application/json': {
          schema: {
            type: 'object',
            required: ['issuer', 'clientId', 'resource'],
            properties: {
              issuer: { type: 'string', format: 'uri' },
              clientId: { type: 'string' },
              resource: { type: 'string', format: 'uri' },
            },
          },
        },
      },
    ),
    '/v1/.well-known/oauth-protected-resource/mcp': readOperation(
      'getMcpProtectedResource',
      'Discover OAuth authorization servers and scopes for the MCP resource.',
      {
        'application/json': {
          schema: {
            type: 'object',
            required: [
              'resource',
              'authorization_servers',
              'scopes_supported',
              'bearer_methods_supported',
            ],
            properties: {
              resource: { type: 'string', format: 'uri' },
              authorization_servers: { type: 'array', items: { type: 'string', format: 'uri' } },
              scopes_supported: { type: 'array', items: { type: 'string' } },
              bearer_methods_supported: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    ),
    '/v1/llms.txt': readOperation(
      'getAgentInstructions',
      'Read public guidance on when to use myself.md and where to find developer resources.',
      { 'text/plain': { schema: { type: 'string' } } },
    ),
    '/v1/docs/reference': readOperation(
      'getApiReference',
      'Read detailed authentication, safe retries, pagination, asynchronous query and API compatibility rules. Send Accept: text/markdown.',
      textContent,
    ),
    '/v1/docs': readOperation(
      'getDeveloperGuide',
      'Read MCP onboarding, authentication, consent and result verification guidance. Send Accept: text/markdown to request the documented Markdown representation.',
      textContent,
    ),
    ...Object.fromEntries(
      healthGuides.map((guide) => [
        `/v1/docs/${guide.slug}`,
        readOperation(
          guide.slug === 'apple-health-claude-mcp'
            ? 'getAppleHealthClaudeGuide'
            : 'getHealthConnectGuide',
          guide.description,
          textContent,
        ),
      ]),
    ),
  },
};
/** @param {string} path */
export function publicDiscovery(path) {
  if (path === '/openapi.json') return openapi;
  if (['/mcp/server-card', '/.well-known/mcp/server-card.json'].includes(path)) return card;
  if (['/.well-known/ard.json', '/.well-known/ai-catalog.json'].includes(path)) return catalog;
  if (['/.well-known/mcp.json', '/mcp.json'].includes(path))
    return {
      servers: [
        {
          name: 'myself.md',
          description: card.description,
          url: `${origin}/mcp`,
          transport: 'streamable-http',
          card: `${origin}/mcp/server-card`,
          authentication: {
            type: 'oauth2',
            resourceMetadata: `${origin}/.well-known/oauth-protected-resource/mcp`,
          },
        },
      ],
    };
  return null;
}
