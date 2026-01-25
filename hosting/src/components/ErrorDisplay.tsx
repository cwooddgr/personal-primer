import { ParsedError, parseError } from '../api/errors';

interface ErrorDisplayProps {
  error: unknown;
  onRetry?: () => void;
}

function ErrorDisplay({ error, onRetry }: ErrorDisplayProps) {
  const parsed: ParsedError = parseError(error);

  return (
    <div className="error-display">
      <div className="error-display-icon">⚠</div>
      <p className="error-display-message">{parsed.userMessage}</p>
      {parsed.isRetryable && onRetry && (
        <button className="error-display-retry" onClick={onRetry}>
          Try Again
        </button>
      )}
      <p className="error-display-details">{parsed.developerInfo}</p>
    </div>
  );
}

export default ErrorDisplay;
