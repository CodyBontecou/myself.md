import { publicErrorMessage } from '../core/public-errors.js';

/** @param {{error:unknown,actionHref?:string,actionLabel?:string}} props */
export function AccountError({ error, actionHref = location.href, actionLabel = 'Try again' }) {
  return (
    <div role="alert" className="account-error account-error-message">
      <p>{publicErrorMessage(error)}</p>
      <a href={actionHref}>{actionLabel}</a>
    </div>
  );
}
