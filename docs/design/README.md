# Dashboard design references

Saved from Vercel on 9 October 2026:

- [Design guide](vercel-design.md), from <https://vercel.com/design.md>.
- [Dark design guide](vercel-design-dark.md), from <https://vercel.com/design.dark.md>.

Both source URLs returned identical documents when downloaded. These snapshots are formatted with the repository’s Prettier configuration.

For myself.md, use the guides’ principles of clear hierarchy, alignment, restrained monochrome surfaces, accessible controls, and equivalent contrast in light and dark themes. Avoid decorative gradients and colored icon tiles. Keep the existing dashboard components and semantic theme tokens.

The source documents describe Vercel-authored reports. Their Vercel logos, authorship requirements, and report-specific framework instructions are reference material; myself.md retains its own identity and application structure. Explicit product requirements, including compact summary pills and the interactive demo, take precedence.

The post-onboarding mobile app follows the same principles using its existing React Native components and system typography. Light mode uses a near-white canvas, white grouped surfaces and dark actions; dark mode uses a near-black canvas, subtly raised surfaces and light actions. Shared actions and grouped surfaces use 12-point continuous corners, 16-point page gutters and a 4-point spacing rhythm. Red is reserved for destructive/error states. Native tabs, navigation, switches and segmented controls keep platform behavior. Profile creation sits in the page so it does not overlap the native tab bar.
