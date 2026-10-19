import { useState } from 'react';
import {
  IconArrowUpRight,
  IconCheck,
  IconCopy,
  IconHeart,
  IconClock,
  IconMapPin,
  IconShieldCheck,
  IconArrowRight,
  IconBrandGithub,
} from '@tabler/icons-react';
import { publicFAQs, agentSetupPrompt } from '../core/public-site.js';
import { datasets } from './dataset-catalog.js';

const stories = [
  {
    label: 'Understand my sleep',
    question: 'What changed on the nights I slept well?',
    steps: [
      'Discover approved health types',
      'Read the selected date range',
      'Compare nights and daily activity',
    ],
    file: 'sleep-and-activity.jsonl',
  },
  {
    label: 'Find my focus',
    question: 'Where is my screen time actually going?',
    steps: [
      'Check platform availability',
      'Read approved usage aggregates',
      'Compare daily application totals',
    ],
    file: 'screen-time.jsonl',
  },
  {
    label: 'Connect the dots',
    question: 'What does my recorded day look like?',
    steps: [
      'Discover recorded location types',
      'Read points in the approved range',
      'Summarize the available timeline',
    ],
    file: 'location.jsonl',
  },
];
const catalog = [
  {
    title: 'Health',
    icon: IconHeart,
    logo: '/dashboard/brand-icons/apple-health.png',
    logoLabel: 'Apple Health',
    tone: 'rose',
    platform: 'HealthKit · Health Connect',
    href: '/datasets/health',
    items: ['Sleep & recovery', 'Heart rate & HRV', 'Activity & workouts', 'Body measurements'],
  },
  {
    title: 'Screen time',
    icon: IconClock,
    logo: '/dashboard/brand-icons/google-chrome.png',
    logoLabel: 'Google Chrome (screen-time example)',
    tone: 'blue',
    platform: 'Platform eligibility applies',
    href: '/datasets/screen-time',
    items: ['Application usage', 'Daily aggregates', 'Android sessions', 'iOS hourly aggregates'],
  },
  {
    title: 'Location',
    icon: IconMapPin,
    logo: '/dashboard/brand-icons/google-maps.png',
    logoLabel: 'Google Maps (location example)',
    tone: 'mint',
    platform: 'Points recorded by myself.md',
    href: '/datasets/location',
    items: ['Coordinates', 'Capture timestamps', 'Accuracy', 'Recorded point timeline'],
  },
  {
    title: 'WHOOP',
    icon: IconHeart,
    logo: 'https://img.logo.dev/whoop.com?token=pk_O_ZGdx4QSLCUENuM4MHPlg&size=96&format=png&retina=true&fallback=404',
    logoLabel: 'WHOOP',
    tone: 'peach',
    platform: 'Optional provider connection',
    href: '/datasets/health',
    items: ['Recovery scores', 'Sleep records', 'Cycles & strain', 'Workout records'],
  },
];

/** @param {{source:(typeof catalog)[number]}} props */
function SourceLogo({ source }) {
  const [failed, setFailed] = useState(false);
  const Icon = source.icon;
  return failed ? (
    <Icon size={24} stroke={1.6} aria-hidden="true" />
  ) : (
    <img
      className="source-brand-logo"
      src={source.logo}
      alt={source.logoLabel}
      width="28"
      height="28"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

const agents = [
  { name: 'Claude Code', file: 'claude-code' },
  { name: 'Codex', file: 'codex' },
  { name: 'OpenCode', file: 'opencode' },
  { name: 'Grok Bot', file: 'grokbot' },
  { name: 'ChatGPT', file: 'chatgpt' },
  { name: 'Dots', file: 'dots' },
  { name: 'Muse', file: 'muse' },
  { name: 'Pi', file: 'pi' },
];
function AgentLogos() {
  return (
    <span className="agent-identities">
      {agents.map(({ name, file }) => (
        <img
          key={file}
          src={`/dashboard/agent-logos/${file}.svg`}
          alt={name}
          title={name}
          width="20"
          height="20"
        />
      ))}
    </span>
  );
}
/** @param {{clip:string,title:string,description:string,landscape?:boolean}} props */
function ShowcaseVideo({ clip, title, description, landscape = false }) {
  return (
    <figure className={`showcase-video ${landscape ? 'landscape' : ''}`}>
      <div className="showcase-chrome" aria-hidden="true">
        <i />
        <i />
        <i />
        <span>{title}</span>
      </div>
      <div className="showcase-stage">
        <video
          controls
          playsInline
          preload="none"
          poster={`/dashboard/showcase/${clip}.jpg`}
          aria-label={title}
        >
          <source src={`/dashboard/showcase/${clip}.mp4`} type="video/mp4" />
          <a href={`/dashboard/showcase/${clip}.mp4`}>Watch {title}</a>
        </video>
      </div>
      <figcaption>{description}</figcaption>
      <details>
        <summary>Recording details</summary>
        <p>{description} Recorded in October 2026. App UI may differ from the current release.</p>
        <a href={`/dashboard/showcase/${clip}.mp4`}>Open recording</a>
      </details>
    </figure>
  );
}
function AgentPrompt() {
  const [status, setStatus] = useState('');
  const [manual, setManual] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(agentSetupPrompt);
      setStatus('Copied. Paste into your agent.');
      setManual(false);
    } catch {
      setManual(true);
      setStatus('Select and copy the prompt below.');
    }
  }
  return (
    <div className="agent-prompt">
      <div className="agent-prompt-caption">
        Give this to your agent <AgentLogos />
      </div>
      <div className="agent-prompt-command">
        <span aria-hidden="true">$</span>
        <code>{agentSetupPrompt}</code>
        <button type="button" onClick={() => void copy()} aria-label="Copy agent setup prompt">
          {status.startsWith('Copied') ? <IconCheck size={16} /> : <IconCopy size={16} />}
          <span>{status.startsWith('Copied') ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <p className="agent-prompt-status" role="status">
        {status}
      </p>
      {manual && (
        <textarea
          readOnly
          aria-label="Agent setup prompt"
          value={agentSetupPrompt}
          onFocus={(event) => event.currentTarget.select()}
        />
      )}
    </div>
  );
}

export function Landing() {
  const [active, setActive] = useState(0);
  const story = stories[active] ?? stories[0];
  if (!story) throw new Error('A homepage workflow is required.');
  const typeCount = Object.values(datasets).reduce(
    (count, dataset) => count + new Set(dataset.groups.flatMap((group) => group.keys)).size,
    0,
  );
  return (
    <div className="personal-site">
      <header className="personal-header">
        <a className="personal-brand" href="/" aria-label="myself.md home">
          myself<span className="brand-extension">.md</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="/datasets">Datasets</a>
          <a href="/docs">Docs</a>
          <a href="/pricing">Pricing</a>
          <a className="personal-signin" href="/dashboard">
            Sign in
          </a>
          <a className="personal-button" href="/demo">
            Try the demo <IconArrowUpRight size={14} />
          </a>
        </nav>
      </header>
      <main>
        <section className="personal-hero" aria-labelledby="personal-title">
          <div className="personal-hero-heading">
            <a className="personal-eyebrow" href="/datasets">
              <span className="status-dot" />
              Your phone. Your files. Your context.
              <IconArrowUpRight size={12} />
            </a>
            <h1 id="personal-title">
              Your agent.
              <br className="mobile-break" /> Now with your context.
            </h1>
            <p>
              Health, screen time, and location.
              <br className="mobile-break" /> The missing context is you.
            </p>
          </div>
          <div className="story-picker" role="group" aria-label="Explore example workflows">
            {stories.map((item, index) => (
              <button
                type="button"
                key={item.label}
                aria-pressed={active === index}
                onClick={() => setActive(index)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="personal-flow">
            <div className="flow-agent">
              <span className="flow-overline">YOUR AGENT</span>
              <div className="agent-question">
                <span className="agent-avatar">
                  <img
                    src="/dashboard/agent-logos/claude-code.svg"
                    alt="Claude Code"
                    width="34"
                    height="34"
                  />
                </span>
                <div>
                  <strong>One better question.</strong>
                  <p>{story.question}</p>
                </div>
              </div>
              <ol>
                {story.steps.map((step) => (
                  <li key={step}>
                    <IconCheck size={13} />
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
              <span className="example-note">Illustrative workflow · requires your approval</span>
            </div>
            <div
              className="context-object"
              aria-label="Your selected personal data, saved as a file"
            >
              <div className="context-orbit" aria-hidden="true" />
              <div className="context-stack" aria-hidden="true">
                <div className="context-layer layer-one" />
                <div className="context-layer layer-two" />
                <div className="context-layer layer-three" />
                <div className="context-file">
                  <span className="file-topline">
                    myself.md <span>↗</span>
                  </span>
                  <div className="context-portrait" />
                  <span className="file-bottomline">
                    a little more you.<strong>.md</strong>
                  </span>
                </div>
              </div>
              <code className="flow-receipt">
                <span>↳</span> {story.file} <IconCheck size={12} />
              </code>
            </div>
            <div className="flow-sources">
              <span className="flow-overline">THE CONTEXT YOU CHOOSE</span>
              <div className="source-tiles">
                {catalog.map((source) => {
                  const { title, tone, href, platform } = source;
                  return (
                    <a key={title} className={`source-tile source-${tone}`} href={href}>
                      <SourceLogo source={source} />
                      <strong>{title}</strong>
                      <span>{platform}</span>
                    </a>
                  );
                })}
              </div>
              <span className="source-permission">
                <IconShieldCheck size={13} /> Only what you approve.
              </span>
            </div>
          </div>
          <AgentPrompt />
          <div className="agent-compatibility" aria-label="MCP clients">
            {agents.map(({ name, file }) => (
              <span key={file}>
                <img src={`/dashboard/agent-logos/${file}.svg`} alt={name} width="18" height="18" />
                {name}
              </span>
            ))}
            <span>+ compatible MCP clients</span>
          </div>
          <div className="hero-bottom">
            <span>MCP · REST · JavaScript SDK · CLI</span>
            <a href="/docs">
              See how it works <IconArrowRight size={13} />
            </a>
          </div>
        </section>
        <section
          className="personal-catalog personal-section"
          aria-labelledby="context-catalog-title"
        >
          <div className="section-intro">
            <span className="flow-overline">THE DATA CATALOG</span>
            <h2 id="context-catalog-title">A fuller picture of you.</h2>
            <p>
              Real context from your phone and wearables.
              <br />
              Explore {typeCount} supported data types before connecting anything.
            </p>
          </div>
          <div className="catalog-columns">
            {catalog.map((source) => {
              const { title, tone, href, platform, items } = source;
              return (
                <div key={title} className={`catalog-column source-${tone}`}>
                  <a className="catalog-heading" href={href}>
                    <SourceLogo source={source} />
                    <h3>{title}</h3>
                    <IconArrowUpRight size={15} />
                  </a>
                  <p>{platform}</p>
                  <ul>
                    {items.map((item) => (
                      <li key={item}>
                        <a href={href}>
                          <span>{item}</span>
                          <IconArrowUpRight size={12} />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          <div className="catalog-foot">
            <p>
              Availability depends on your device, OS permissions, and provider consent. Chrome and
              Maps illustrate data categories.
            </p>
            <a href="/datasets">
              Explore datasets & example JSON <IconArrowRight size={14} />
            </a>
          </div>
        </section>
        <section className="personal-section story-section" aria-labelledby="files-title">
          <div className="explanation">
            <span className="flow-overline">01 / MAKE IT YOURS</span>
            <h2 id="files-title">
              A file you can keep.
              <br />
              Context you can use.
            </h2>
            <p>
              Choose the data types, dates, and destination. Save readable exports locally, send
              them to your own HTTPS endpoint, or use the paired cloud service.
            </p>
            <div className="inline-notes">
              <span>JSON & JSONL</span>
              <span>Local or cloud</span>
              <span>Your selected data</span>
            </div>
            <a className="text-link" href="/datasets">
              Build an example export <IconArrowRight size={14} />
            </a>
          </div>
          <ShowcaseVideo
            clip="selection"
            title="Choose your context"
            description="Recorded app walkthrough: select data types and choose JSON or JSONL export files. Isolated QA session."
          />
        </section>
        <section
          className="personal-section story-section reverse-story"
          aria-labelledby="permission-title"
        >
          <ShowcaseVideo
            clip="approval"
            title="Approve agent access"
            description="Recorded owner approval in an isolated QA profile. Permissions are reviewed on the phone; agents cannot approve themselves."
          />
          <div className="explanation">
            <span className="flow-overline">02 / STAY IN CONTROL</span>
            <h2 id="permission-title">
              Personal by nature.
              <br />
              Permissioned by design.
            </h2>
            <p>
              You decide which profiles and data types your agent can read. Review access and
              activity from the app or dashboard, and revoke future reads whenever you choose.
            </p>
            <p className="fine-print">
              Cloud export content is encrypted at rest. Authorized reads are decrypted by the
              service. Revoking access cannot recall copies already delivered.
            </p>
            <a className="text-link" href="/privacy">
              Read the privacy details <IconArrowRight size={14} />
            </a>
          </div>
        </section>
        <section className="personal-section story-section" aria-labelledby="agent-path-title">
          <div className="explanation">
            <span className="flow-overline">03 / BUILT FOR THE WHOLE WORKFLOW</span>
            <h2 id="agent-path-title">
              From “can you?”
              <br />
              to a completed result.
            </h2>
            <p>
              Start with public discovery. Connect through MCP, discover approved data, request a
              bounded query, and wait for the actual result. The SDK, CLI, and REST API follow the
              same permissions.
            </p>
            <a className="text-link" href="/docs/reference">
              Explore the agent reference <IconArrowRight size={14} />
            </a>
          </div>
          <ShowcaseVideo
            clip="overview"
            title="From phone to agent"
            landscape
            description="App setup footage and an illustrated replay of an actual MCP run using synthetic phone data. The agent UI is illustrative."
          />
        </section>
        <section className="personal-section personal-faq" aria-labelledby="questions-title">
          <span className="flow-overline">BEFORE YOU CONNECT</span>
          <h2 id="questions-title">A few good questions.</h2>
          {publicFAQs.map(({ question, answer }) => (
            <details key={question}>
              <summary>
                {question}
                <span aria-hidden="true">+</span>
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </section>
        <section className="personal-closing">
          <span className="flow-overline">A LITTLE MORE CONTEXT. A LOT MORE POSSIBILITY.</span>
          <h2>
            Make your agent
            <br />a little more yours.
          </h2>
          <p>Start with fictional data. Connect your own when you’re ready.</p>
          <div>
            <a className="personal-button" href="/demo">
              Explore the demo <IconArrowUpRight size={15} />
            </a>
            <a className="closing-secondary" href="/docs">
              Connect your agent <IconArrowRight size={15} />
            </a>
          </div>
          <a href="/pricing" className="closing-pricing">
            See free usage, Lifetime access & optional cloud storage ↗
          </a>
        </section>
      </main>
      <footer className="personal-footer">
        <div>
          <a className="personal-brand" href="/">
            myself<span className="brand-extension">.md</span>
          </a>
          <p>Your data. In your context.</p>
          <a href="https://github.com/CodyBontecou/myself.md">
            <IconBrandGithub size={15} /> Open source
          </a>
        </div>
        <nav aria-label="Explore">
          <span>EXPLORE</span>
          <a href="/datasets">Datasets</a>
          <a href="/demo">Dashboard demo</a>
          <a href="/pricing">Pricing</a>
        </nav>
        <nav aria-label="Build">
          <span>BUILD</span>
          <a href="/docs">Documentation</a>
          <a href="/docs/reference">API reference</a>
          <a href="/llms.txt">llms.txt</a>
        </nav>
        <nav aria-label="Company">
          <span>MYSELF.MD</span>
          <a href="/blog">Blog</a>
          <a href="/contact">Contact</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="https://logo.dev" rel="noreferrer">
            Logos provided by Logo.dev
          </a>
        </nav>
        <div className="footer-wordmark" aria-hidden="true">
          myself.md
        </div>
      </footer>
    </div>
  );
}
