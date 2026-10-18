/** Existing OS-adapter fixtures keep their provider boundary disconnected.
 * WHOOP behavior is exercised through the real adapter in verify-whoop.js. */
export const disconnectedWhoop = {
  whoopHealthTypes: async () => [],
  whoopStatus: async () => ({
    provider: 'whoop',
    connected: false,
    scopes: [],
    handoff: 'myselfmd://whoop',
    instructions: 'Disconnected fixture.',
  }),
  whoopPage: async () => {
    throw new Error('Unexpected WHOOP read in an OS-adapter fixture.');
  },
};
