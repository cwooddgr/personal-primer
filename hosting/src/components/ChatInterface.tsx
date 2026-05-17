import { useState, useRef, useEffect } from 'react';
import Markdown from 'react-markdown';
import { sendMessage, endSession, endArcEarly, Conversation, ConversationMessage, SuggestedReading, ArcCompletionData } from '../api/client';

interface ChatInterfaceProps {
  initialConversation: Conversation | null;
  sessionEnded: boolean;
  bundleId?: string;
  initialSuggestedReading?: SuggestedReading;
  initialArcCompletion?: ArcCompletionData;
  forceSessionEnded?: boolean;
}

function ChatInterface({ initialConversation, sessionEnded: initialSessionEnded, bundleId, initialSuggestedReading, initialArcCompletion, forceSessionEnded }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ConversationMessage[]>(
    initialConversation?.messages || []
  );
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(initialSessionEnded);
  const [ending, setEnding] = useState(false);
  const [suggestedReading, setSuggestedReading] = useState<SuggestedReading | undefined>(initialSuggestedReading);
  const [arcCompletion, setArcCompletion] = useState<ArcCompletionData | undefined>(initialArcCompletion);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const suggestedReadingRef = useRef<HTMLDivElement>(null);
  const arcCompletionRef = useRef<HTMLDivElement>(null);

  // Handle parent-driven arc completion (end arc early)
  useEffect(() => {
    if (initialArcCompletion) {
      setArcCompletion(initialArcCompletion);
    }
  }, [initialArcCompletion]);

  useEffect(() => {
    if (forceSessionEnded) {
      setSessionEnded(true);
    }
  }, [forceSessionEnded]);

  useEffect(() => {
    if (initialSuggestedReading) {
      setSuggestedReading(initialSuggestedReading);
    }
  }, [initialSuggestedReading]);

  // Auto-scroll to new messages when they arrive
  useEffect(() => {
    if (messagesEndRef.current && messages.length > 0) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, sending]);

  // Auto-scroll to arc completion when it appears
  useEffect(() => {
    if (arcCompletion && arcCompletionRef.current) {
      arcCompletionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [arcCompletion]);

  // Auto-scroll to suggested reading when it appears (after arc completion scroll if both present)
  useEffect(() => {
    if (suggestedReading && suggestedReadingRef.current) {
      // Small delay to let arc completion scroll finish first if both appear together
      const timeout = setTimeout(() => {
        suggestedReadingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, arcCompletion ? 500 : 0);
      return () => clearTimeout(timeout);
    }
  }, [suggestedReading, arcCompletion]);

  const handleSend = async () => {
    if (!input.trim() || sending || sessionEnded) {
      console.log('[ChatInterface] handleSend blocked:', { empty: !input.trim(), sending, sessionEnded });
      return;
    }

    const userMessage = input.trim();
    console.log('[ChatInterface] Sending message:', userMessage.substring(0, 50) + (userMessage.length > 50 ? '...' : ''));
    setInput('');
    setSending(true);

    // Optimistically add user message
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);

    try {
      const response = await sendMessage(userMessage, bundleId);
      console.log('[ChatInterface] Message response:', {
        messageCount: response.conversation.messages.length,
        sessionShouldEnd: response.sessionShouldEnd,
        arcShouldEnd: response.arcShouldEnd,
      });

      setMessages(response.conversation.messages);

      // Auto-end session (or arc) if the guide signalled a natural close
      if (response.sessionShouldEnd) {
        const isArcEnd = response.arcShouldEnd;
        console.log(`[ChatInterface] Auto-ending ${isArcEnd ? 'arc' : 'session'}`);
        setEnding(true);
        try {
          const endResponse = isArcEnd
            ? await endArcEarly(bundleId)
            : await endSession(bundleId);
          console.log('[ChatInterface] Auto-end success:', {
            hasSuggestedReading: !!endResponse.suggestedReading,
            hasArcCompletion: !!endResponse.arcCompletion,
          });
          setSessionEnded(true);
          if (endResponse.suggestedReading) {
            setSuggestedReading(endResponse.suggestedReading);
          }
          if (endResponse.arcCompletion) {
            setArcCompletion(endResponse.arcCompletion);
          }
        } catch (endError) {
          console.error('[ChatInterface] Auto-end failed:', endError);
        } finally {
          setEnding(false);
        }
      }
    } catch (error) {
      console.error('[ChatInterface] Send message failed:', error);
      // Remove optimistic message on error
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setSending(false);
    }
  };

  const handleEndSession = async () => {
    if (ending || sessionEnded) {
      console.log('[ChatInterface] handleEndSession blocked:', { ending, sessionEnded });
      return;
    }

    console.log('[ChatInterface] Ending session manually...');
    setEnding(true);
    try {
      const response = await endSession(bundleId);
      console.log('[ChatInterface] End session success:', {
        hasSuggestedReading: !!response.suggestedReading,
        hasArcCompletion: !!response.arcCompletion,
      });
      setSessionEnded(true);
      if (response.suggestedReading) {
        setSuggestedReading(response.suggestedReading);
      }
      if (response.arcCompletion) {
        setArcCompletion(response.arcCompletion);
      }
    } catch (error) {
      console.error('[ChatInterface] End session failed:', error);
    } finally {
      setEnding(false);
    }
  };

  return (
    <section className="chat-interface">
      <h2>Conversation</h2>

      {messages.length === 0 && !sessionEnded && (
        <p className="chat-prompt">
          Share your thoughts on today's encounter...
        </p>
      )}

      <div className="messages">
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.role}`}>
            <div className="message-content">
              {msg.role === 'assistant' ? (
                <Markdown>{msg.content}</Markdown>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div className="message assistant">
            <div className="message-content typing">Thinking</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {sessionEnded ? (
        <div className="session-ended-container">
          <p className="session-ended">Session ended</p>

          {arcCompletion && (
            <div className="arc-completion" ref={arcCompletionRef}>
              <div className="arc-summary">
                <p className="arc-completion-label">Arc Complete</p>
                <Markdown>{arcCompletion.summary}</Markdown>
              </div>
              {arcCompletion.nextArc && (
                <div className="next-arc-preview">
                  <p className="next-arc-label">Coming tomorrow</p>
                  <p className="next-arc-theme">{arcCompletion.nextArc.theme}</p>
                  <p className="next-arc-description">{arcCompletion.nextArc.description}</p>
                </div>
              )}
            </div>
          )}

          {suggestedReading && (
            <div className="suggested-reading" ref={suggestedReadingRef}>
              <p className="suggested-reading-label">Further reading</p>
              <a href={suggestedReading.url} target="_blank" rel="noopener noreferrer" className="suggested-reading-link">
                {suggestedReading.title}
              </a>
              <p className="suggested-reading-rationale">{suggestedReading.rationale}</p>
            </div>
          )}
        </div>
      ) : ending ? (
        <div className="chat-input-area">
          <p className="ending-message">Ending session</p>
        </div>
      ) : (
        <div className="chat-input-area">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (input.trim() && !sending) {
                  handleSend();
                }
              }
            }}
            placeholder="Type your message..."
            disabled={sending}
            rows={2}
          />
          <div className="chat-actions">
            <button onClick={handleSend} disabled={!input.trim() || sending}>
              Send
            </button>
            <button
              onClick={handleEndSession}
              disabled={messages.length === 0}
              className="end-session"
            >
              End Session
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export default ChatInterface;
