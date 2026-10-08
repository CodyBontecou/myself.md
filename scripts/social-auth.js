// No local credentials in browser, broker linking, or direct-grant authentication.
export const socialAuth = {
  browserFlow: 'social browser',
  directGrantFlow: 'deny password grants',
  registrationAllowed: false,
  resetPasswordAllowed: false,
  authenticationFlows: [
    {
      alias: 'social browser',
      description: 'Apple and GitHub sign-in only; unhinted MCP requests use GitHub.',
      providerId: 'basic-flow',
      topLevel: true,
      builtIn: false,
      authenticationExecutions: [
        {
          authenticator: 'auth-cookie',
          requirement: 'ALTERNATIVE',
          priority: 10,
          authenticatorFlow: false,
        },
        {
          authenticator: 'identity-provider-redirector',
          requirement: 'ALTERNATIVE',
          priority: 20,
          authenticatorFlow: false,
          authenticatorConfig: 'social redirect',
        },
      ],
    },
    {
      alias: 'social first login',
      description: 'Create a social account without password-based linking or email merging.',
      providerId: 'basic-flow',
      topLevel: true,
      builtIn: false,
      authenticationExecutions: [
        {
          authenticator: 'idp-review-profile',
          requirement: 'REQUIRED',
          priority: 10,
          authenticatorFlow: false,
        },
        {
          authenticator: 'idp-create-user-if-unique',
          requirement: 'REQUIRED',
          priority: 20,
          authenticatorFlow: false,
        },
      ],
    },
    {
      alias: 'deny password grants',
      providerId: 'basic-flow',
      topLevel: true,
      builtIn: false,
      authenticationExecutions: [
        {
          authenticator: 'deny-access-authenticator',
          requirement: 'REQUIRED',
          priority: 10,
          authenticatorFlow: false,
        },
      ],
    },
  ],
  authenticatorConfig: [{ alias: 'social redirect', config: { defaultProvider: 'github' } }],
};
