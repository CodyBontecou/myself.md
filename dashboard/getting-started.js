import { useEffect, useRef, useState } from 'react';
import { Select } from 'radix-ui';
import {
  IconArrowUpRight,
  IconCheck,
  IconChevronDown,
  IconCopy,
  IconDeviceMobile,
  IconSearch,
  IconUser,
} from '@tabler/icons-react';
import { agentSetupPrompt } from '../core/public-site.js';
import { datasetWorkflows } from '../core/dataset-workflows.js';
import { followDashboardLink } from './navigation.js';

const agents = [
  { name: 'Claude Code', logo: 'claude-code', tone: 'clay' },
  { name: 'Codex', logo: 'codex', tone: 'blue' },
  { name: 'OpenCode', logo: 'opencode', tone: 'stone' },
  { name: 'OpenClaw', logo: 'openclaw', tone: 'clay' },
  { name: 'Grok Bot', logo: 'grokbot', tone: 'stone' },
  { name: 'ChatGPT', logo: 'chatgpt', tone: 'green' },
  { name: 'Dots', logo: 'dots', tone: 'blue' },
  { name: 'Muse', logo: 'muse', tone: 'green' },
  { name: 'Pi', logo: 'pi', tone: 'stone' },
  { name: 'Other assistant', logo: null, tone: 'stone' },
];
const artwork = new Map([
  ['sleep-trends', 'sleep'],
  ['walking-trends', 'activity'],
  ['app-usage', 'focus'],
  ['recorded-locations', 'location'],
]);

/** Copy public text with a selectable fallback. @param {string} text */
function useCopyPrompt(text) {
  const [status, setStatus] = useState('');
  const [fallback, setFallback] = useState(false);
  const field = useRef(/** @type {HTMLTextAreaElement|null} */ (null));
  useEffect(() => {
    if (fallback) {
      field.current?.focus();
      field.current?.select();
    }
  }, [fallback]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus('Copied. Paste it into your agent’s chat.');
    } catch {
      setFallback(true);
      field.current?.focus();
      field.current?.select();
      setStatus('Copy the selected text manually.');
    }
  }
  return { status, fallback, field, copy };
}

/** @param {{workflow:typeof datasetWorkflows[number],image:string}} props */
function QuestionCard({ workflow, image }) {
  const { status, fallback, field, copy } = useCopyPrompt(workflow.prompt);
  return (
    <article className="start-question">
      <button className="start-question-button" onClick={() => void copy()}>
        <span className="start-question-image" data-scene={image}>
          <img
            src={`/dashboard/getting-started/${image}-marble.jpg`}
            alt=""
            width="1400"
            height="467"
            loading="lazy"
          />
        </span>
        <span className="start-question-caption">
          <span className="start-question-meta">
            <span>{workflow.topic}</span>
            <span className="start-question-copy">
              <IconCopy size={12} aria-hidden="true" /> copy
            </span>
          </span>
          <span className="start-question-title">{workflow.question}</span>
        </span>
      </button>
      {fallback && (
        <textarea
          ref={field}
          aria-label={`${workflow.topic} prompt`}
          className="start-fallback"
          readOnly
          value={workflow.prompt}
          rows={6}
        />
      )}
      <p className="start-copy-status" role="status">
        {status}
      </p>
    </article>
  );
}

/** @param {{workspace:import('./workspace.js').Workspace}} props */
export function GettingStarted({ workspace }) {
  const [agentName, setAgentName] = useState('Claude Code');
  const agent = agents.find((item) => item.name === agentName) ?? agents[0];
  const { status, field, copy } = useCopyPrompt(agentSetupPrompt);
  const paired = workspace.devices.length > 0;
  const approved = workspace.profiles.some(
    (profile) =>
      workspace.devices.some((device) => device.id === profile.deviceId) &&
      profile.permissionsSynced &&
      (!profile.revision || profile.confirmedRevision === profile.revision) &&
      (profile.agentPermissions?.health ||
        profile.agentPermissions?.time ||
        profile.agentPermissions?.location),
  );
  return (
    <div className="getting-started">
      <a href="#start-content" className="start-skip">
        Skip to content
      </a>
      <main className="start-content" id="start-content">
        <div className="start-heading">
          <h1>Start</h1>
          <a href="/datasets" target="_blank" rel="noopener noreferrer" className="start-explore">
            <IconSearch size={15} aria-hidden="true" />
            Explore datasets…
          </a>
        </div>
        <section className="start-setup start-panel" aria-labelledby="setup-title">
          <div className="start-agent-column">
            <div className="start-agent-heading">
              <h2 id="setup-title">
                <span className="start-step">1</span>Set up your
              </h2>
              <Select.Root value={agentName} onValueChange={setAgentName}>
                <Select.Trigger className="start-agent-select" aria-label="Choose your assistant">
                  <Select.Value />
                  <Select.Icon className="start-agent-chevron">
                    <IconChevronDown size={12} aria-hidden="true" />
                  </Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content
                    className="start-agent-menu"
                    position="popper"
                    align="end"
                    sideOffset={6}
                    collisionPadding={12}
                  >
                    <Select.Viewport>
                      {agents.map((item) => (
                        <Select.Item
                          key={item.name}
                          value={item.name}
                          className="start-agent-option"
                        >
                          <Select.ItemText>
                            <span className="start-agent-option-label">
                              {item.logo ? (
                                <img
                                  src={`/dashboard/agent-logos/${item.logo}.svg`}
                                  alt=""
                                  width="20"
                                  height="20"
                                />
                              ) : (
                                <IconUser size={20} stroke={1.5} aria-hidden="true" />
                              )}
                              <span>{item.name}</span>
                            </span>
                          </Select.ItemText>
                        </Select.Item>
                      ))}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            </div>
            <div className={`start-agent-art start-agent-art-${agent?.tone}`}>
              {agent?.logo ? (
                <img
                  src={`/dashboard/agent-logos/${agent.logo}.svg`}
                  alt=""
                  width="250"
                  height="250"
                />
              ) : (
                <IconDeviceMobile
                  className="start-other-art"
                  size={210}
                  stroke={0.7}
                  aria-hidden="true"
                />
              )}
              <span>{agentName}</span>
            </div>
          </div>
          <div className="start-instructions">
            <p className="start-setting-up">
              Setting up myself.md for <strong>{agentName}</strong>
            </p>
            <div className="start-prompt-box">
              <label htmlFor="agent-setup-prompt">In your agent’s chat, send:</label>
              <div className="start-command">
                <textarea
                  id="agent-setup-prompt"
                  ref={field}
                  readOnly
                  rows={1}
                  value={agentSetupPrompt}
                />
                <button onClick={() => void copy()}>Copy</button>
              </div>
              <p className="start-copy-status" role="status">
                {status}
              </p>
            </div>
            <div className="start-phone-box">
              <h3>{paired ? 'Your phone, connected' : 'Connect your phone'}</h3>
              <p>
                Sign in with the same account, pair your phone and choose the data your assistant
                can read.
              </p>
              <div className="start-phone-actions">
                <a href="/docs#connect-an-ai-assistant" target="_blank" rel="noopener noreferrer">
                  {paired ? (
                    <IconCheck size={13} aria-hidden="true" />
                  ) : (
                    <IconDeviceMobile size={13} aria-hidden="true" />
                  )}
                  {paired ? 'Phone paired' : 'Pair your phone'}
                  <IconArrowUpRight size={12} aria-hidden="true" />
                </a>
                <a href="/dashboard?view=profiles" onClick={followDashboardLink}>
                  {approved && <IconCheck size={13} aria-hidden="true" />}
                  {approved ? 'Data approved' : 'Choose what to share'}
                  <IconArrowUpRight size={12} aria-hidden="true" />
                </a>
              </div>
              <p className="start-phone-note">
                Public store downloads are coming soon. Use an installed app or authorized test
                build.
              </p>
            </div>
          </div>
        </section>
        <section className="start-examples start-panel" aria-labelledby="try-title">
          <h2 id="try-title">
            <span className="start-step">2</span>Try it out
          </h2>
          <p className="start-section-intro">Copy an example below and send it to your agent.</p>
          <div className="start-question-grid">
            {datasetWorkflows.map((workflow) => (
              <QuestionCard
                key={workflow.id}
                workflow={workflow}
                image={artwork.get(workflow.id) ?? 'sleep'}
              />
            ))}
          </div>
        </section>
        <section className="start-sources" aria-labelledby="start-sources-title">
          <h2 id="start-sources-title">Choose the context your assistant can use</h2>
          <div>
            {[
              ['health', 'Health records'],
              ['screen-time', 'Screen time'],
              ['location', 'Recorded locations'],
            ].map(([slug, label]) => (
              <a key={slug} href={`/datasets/${slug}`} target="_blank" rel="noopener noreferrer">
                {label}
                <IconArrowUpRight size={12} aria-hidden="true" />
              </a>
            ))}
          </div>
        </section>
        <details className="start-manual">
          <summary>
            Prefer to connect manually? MCP setup &amp; permissions{' '}
            <span aria-hidden="true">→</span>
          </summary>
          <div>
            <p>
              Add <code>https://myself.md/mcp</code> as a remote MCP server in a compatible
              assistant and sign in. The assistant guides pairing; you confirm on your phone and
              review OS and Agent permissions.
            </p>
            <p>
              Connection and permission badges reflect the latest account snapshot, not phone
              availability or a completed query. Refresh after setup. Copying a prompt grants no
              access.
            </p>
            <a href="/docs#connect-an-ai-assistant" target="_blank" rel="noopener noreferrer">
              Read connection instructions ↗
            </a>
          </div>
        </details>
        <footer className="start-footer">
          <a href="/docs" target="_blank" rel="noopener noreferrer">
            Documentation
          </a>
          <a href="/privacy" target="_blank" rel="noopener noreferrer">
            Privacy
          </a>
        </footer>
      </main>
    </div>
  );
}
