/**
 * Standardized error handling for API responses.
 * Maps backend errors to user-friendly messages while preserving developer details.
 */

export interface ParsedError {
  // User-friendly message to display
  userMessage: string;
  // Technical details for developers (shown in smaller text)
  developerInfo: string;
  // Whether this error is likely transient and retrying might help
  isRetryable: boolean;
  // Original error code (HTTP status or API error type)
  code: string;
}

interface AnthropicError {
  type: 'error';
  error: {
    type: string;
    message: string;
  };
  request_id?: string;
}

/**
 * Parse an error message or object into a user-friendly format.
 */
export function parseError(error: unknown): ParsedError {
  const errorString = error instanceof Error ? error.message : String(error);

  // Try to extract JSON from error message (backend often returns "CODE JSON")
  const jsonMatch = errorString.match(/^(\d+)\s+(.+)$/);
  if (jsonMatch) {
    const [, statusCode, jsonPart] = jsonMatch;
    try {
      const parsed = JSON.parse(jsonPart) as AnthropicError;
      if (parsed.type === 'error' && parsed.error) {
        return parseAnthropicError(parsed, statusCode);
      }
    } catch {
      // Not valid JSON, continue with generic parsing
    }
  }

  // Check for specific error patterns
  if (errorString.includes('overloaded') || errorString.includes('529')) {
    return {
      userMessage: "Claude API is temporarily overloaded. Please try again in a moment.",
      developerInfo: `Claude API 529: Service overloaded`,
      isRetryable: true,
      code: '529',
    };
  }

  if (errorString.includes('rate_limit') || errorString.includes('429')) {
    return {
      userMessage: "Claude API rate limit reached. Please wait a moment before trying again.",
      developerInfo: `Claude API 429: Rate limited`,
      isRetryable: true,
      code: '429',
    };
  }

  if (errorString.includes('401') || errorString.includes('Unauthorized')) {
    return {
      userMessage: "Your session has expired. Please sign in again.",
      developerInfo: `Firebase Auth 401: Token expired or invalid`,
      isRetryable: false,
      code: '401',
    };
  }

  if (errorString.includes('Not authenticated')) {
    return {
      userMessage: "You need to sign in to access this page.",
      developerInfo: `Firebase Auth: No authenticated user`,
      isRetryable: false,
      code: 'AUTH',
    };
  }

  if (errorString.includes('permission-denied') || errorString.includes('403')) {
    return {
      userMessage: "You don't have permission to access this resource.",
      developerInfo: `Firebase 403: Permission denied`,
      isRetryable: false,
      code: '403',
    };
  }

  if (errorString.includes('500')) {
    return {
      userMessage: "Server error. Please try again.",
      developerInfo: `Server 500: ${errorString.slice(0, 150)}`,
      isRetryable: true,
      code: '500',
    };
  }

  if (errorString.includes('network') || errorString.includes('Failed to fetch') || errorString.includes('fetch')) {
    return {
      userMessage: "Unable to connect to server. Please check your internet connection.",
      developerInfo: `Network error: ${errorString.slice(0, 150)}`,
      isRetryable: true,
      code: 'NETWORK',
    };
  }

  if (errorString.includes('timeout') || errorString.includes('ETIMEDOUT')) {
    return {
      userMessage: "Request timed out. Please try again.",
      developerInfo: `Timeout: ${errorString.slice(0, 150)}`,
      isRetryable: true,
      code: 'TIMEOUT',
    };
  }

  // Generic fallback
  return {
    userMessage: "Something went wrong. Please try again.",
    developerInfo: errorString.slice(0, 200),
    isRetryable: true,
    code: 'UNKNOWN',
  };
}

function parseAnthropicError(error: AnthropicError, statusCode: string): ParsedError {
  const errorType = error.error.type;
  const requestId = error.request_id;

  const requestIdInfo = requestId ? ` | Request: ${requestId}` : '';

  switch (errorType) {
    case 'overloaded_error':
      return {
        userMessage: "Claude API is temporarily overloaded. Please try again in a moment.",
        developerInfo: `Claude API ${statusCode}: overloaded_error${requestIdInfo}`,
        isRetryable: true,
        code: statusCode,
      };

    case 'rate_limit_error':
      return {
        userMessage: "Claude API rate limit reached. Please wait a moment before trying again.",
        developerInfo: `Claude API ${statusCode}: rate_limit_error${requestIdInfo}`,
        isRetryable: true,
        code: statusCode,
      };

    case 'invalid_request_error':
      return {
        userMessage: "Claude API rejected the request. This may be a bug.",
        developerInfo: `Claude API ${statusCode}: ${error.error.message}${requestIdInfo}`,
        isRetryable: false,
        code: statusCode,
      };

    case 'authentication_error':
      return {
        userMessage: "Claude API authentication failed. The API key may be invalid or expired.",
        developerInfo: `Claude API ${statusCode}: authentication_error${requestIdInfo}`,
        isRetryable: false,
        code: statusCode,
      };

    case 'api_error':
    default:
      return {
        userMessage: "Claude API returned an error. Please try again.",
        developerInfo: `Claude API ${statusCode}: ${errorType} - ${error.error.message}${requestIdInfo}`,
        isRetryable: true,
        code: statusCode,
      };
  }
}
