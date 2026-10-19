import { useRef, useState } from 'react';
import { agentSetup } from '../core/public-site.js';
import { Button } from './components/ui/button.js';

/** Public setup guidance only; copying never connects an account or grants data access. */
export function AgentSetup() {
  const prompt = useRef(/** @type {HTMLTextAreaElement|null} */ (null));
  const [copying, setCopying] = useState(false);
  const [message, setMessage] = useState('');
  async function copyPrompt() {
    setCopying(true);
    setMessage('');
    try {
      await navigator.clipboard.writeText(agentSetup.prompt);
      setMessage('Prompt copied. Paste it into your agent to begin setup.');
    } catch {
      prompt.current?.focus();
      prompt.current?.select();
      setMessage('Copy is unavailable in this browser. Copy the selected prompt manually.');
    } finally {
      setCopying(false);
    }
  }
  return (
    <section
      id="agent-setup"
      tabIndex={-1}
      aria-labelledby="agent-setup-title"
      className="agent-setup"
    >
      <h2 id="agent-setup-title" className="agent-setup-title">
        Give this to your agent
      </h2>
      <p id="agent-setup-help" className="sr-only">
        Paste this into your agent. You complete sign-in and decide what to share.
      </p>
      <label htmlFor="agent-setup-prompt" className="sr-only">
        Agent setup prompt
      </label>
      <div className="agent-setup-command">
        <span className="agent-setup-prefix" aria-hidden="true">
          $
        </span>
        <textarea
          ref={prompt}
          id="agent-setup-prompt"
          aria-describedby="agent-setup-help agent-setup-status"
          value={agentSetup.prompt}
          readOnly
          rows={1}
          spellCheck={false}
          className="agent-setup-prompt"
        />
        <Button
          type="button"
          aria-label="Copy setup prompt"
          className="agent-setup-copy"
          disabled={copying}
          onClick={() => void copyPrompt()}
        >
          {copying ? 'Copying…' : 'copy'}
        </Button>
      </div>
      <p id="agent-setup-status" role="status" className="agent-setup-status">
        {message}
      </p>
    </section>
  );
}
