import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { setGlobalOptions } from 'firebase-functions/v2';
import { anthropicApiKey } from './services/anthropic';
import { googleSearchApiKey, googleSearchCx } from './services/linkValidator';
import { handleGetToday } from './api/today';
import { handlePostMessage } from './api/message';
import { handleEndSession } from './api/endSession';
import { handleReact } from './api/react';
import { handleGetArc } from './api/arc';
import { handleGetHistory } from './api/history';
import { handleGetConversation } from './api/conversationHistory';
import { handleRefineArcMessage } from './api/refineArc';
import { handleRegister, handleForgotPassword, handleResendVerification } from './api/auth';
import { checkInactiveSessions } from './scheduled/inactivityCheck';
import { verifyAuth } from './middleware/auth';
import { ensureUserExists } from './utils/firestore';

// Set global options
setGlobalOptions({
  region: 'us-west3',
  memory: '256MiB',
});

// Main API function
export const api = onRequest(
  {
    secrets: [anthropicApiKey, googleSearchApiKey, googleSearchCx],
    cors: true,
  },
  async (req, res) => {
    const path = req.path;
    const method = req.method;

    // Auth endpoints (no authentication required)
    if (path === '/api/auth/register' && method === 'POST') {
      return handleRegister(req, res);
    }

    if (path === '/api/auth/forgot-password' && method === 'POST') {
      return handleForgotPassword(req, res);
    }

    // All other endpoints require authentication
    const authResult = await verifyAuth(req);
    if (!authResult) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { userId, email } = authResult;

    // Ensure user document exists in Firestore
    await ensureUserExists(userId, email);

    // Resend verification requires auth
    if (path === '/api/auth/resend-verification' && method === 'POST') {
      return handleResendVerification(req, res, userId, email);
    }

    // Route handling - pass userId to all handlers
    if (path === '/api/today' && method === 'GET') {
      return handleGetToday(req, res, userId);
    }

    if (path === '/api/today/message' && method === 'POST') {
      return handlePostMessage(req, res, userId);
    }

    if (path === '/api/today/end-session' && method === 'POST') {
      return handleEndSession(req, res, userId);
    }

    if (path === '/api/today/react' && method === 'POST') {
      return handleReact(req, res, userId);
    }

    if (path === '/api/arc' && method === 'GET') {
      return handleGetArc(req, res, userId);
    }

    if (path === '/api/history' && method === 'GET') {
      return handleGetHistory(req, res, userId);
    }

    // Match /api/history/:date/conversation pattern
    if (path.match(/^\/api\/history\/\d{4}-\d{2}-\d{2}\/conversation$/) && method === 'GET') {
      return handleGetConversation(req, res, userId);
    }

    if (path === '/api/arc/refine/message' && method === 'POST') {
      return handleRefineArcMessage(req, res, userId);
    }

    res.status(404).json({ error: 'Not found' });
  }
);

// Scheduled function to check for inactive sessions
export const inactivityChecker = onSchedule(
  {
    schedule: 'every 15 minutes',
    secrets: [anthropicApiKey],
    timeZone: 'America/Los_Angeles',
  },
  async () => {
    await checkInactiveSessions();
  }
);
