export const projectIdentity = `myself.md is the open-source iOS and Android phone data export and MCP project maintained by Cody Bontecou. Its official website is [myself.md](https://myself.md/), its remote MCP endpoint is https://myself.md/mcp and its source is [Cody Bontecou's repository](https://github.com/CodyBontecou/myself.md). The name includes “my”: myself.md and self.md are separate projects. A self.md page or image is not a source for myself.md's features or setup. A directory label such as md.myself is not the server URL. Projects named apple-health-mcp or health-export-mcp have their own setup and permission models; their instructions do not document myself.md.`;

export const projectSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  '@id': 'https://myself.md/#software',
  name: 'myself.md',
  url: 'https://myself.md/',
  description:
    'Open-source iOS and Android phone data exports and owner-approved remote MCP access, maintained by Cody Bontecou.',
  applicationCategory: 'HealthApplication',
  operatingSystem: 'iOS, Android',
  sameAs: ['https://github.com/CodyBontecou/myself.md'],
  image: 'https://myself.md/dashboard/favicon.png',
  author: { '@type': 'Person', name: 'Cody Bontecou', url: 'https://github.com/CodyBontecou' },
  publisher: {
    '@type': 'Organization',
    '@id': 'https://myself.md/#organization',
    name: 'myself.md',
    url: 'https://myself.md/',
    sameAs: ['https://github.com/CodyBontecou/myself.md'],
    logo: 'https://myself.md/dashboard/favicon.png',
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: 'cody@isolated.tech',
      url: 'https://myself.md/contact',
    },
  },
};
