import { useState } from 'react';
import Markdown from 'react-markdown';
import { sendMessage, endSession, sendArcRefinementMessage, Conversation, ConversationMessage, SuggestedReading, ArcCompletionData, ArcRefinementMessage } from '../api/client';

interface ChatInterfaceProps {
  initialConversation: Conversation | null;
  sessionEnded: boolean;
  initialSuggestedReading?: SuggestedReading;
}

function ChatInterface({ initialConversation, sessionEnded: initialSessionEnded, initialSuggestedReading }: ChatInterfaceProps) {
  console.log('[ChatInterface] Init:', {
    hasConversation: !!initialConversation,
    messageCount: initialConversation?.messages.length ?? 0,
    sessionEnded: initialSessionEnded,
    hasSuggestedReading: !!initialSuggestedReading,
  });

  const [messages, setMessages] = useState<ConversationMessage[]>(
    initialConversation?.messages || []
  );
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(initialSessionEnded);
  const [ending, setEnding] = useState(false);
  const [suggestedReading, setSuggestedReading] = useState<SuggestedReading | undefined>(initialSuggestedReading);
  const [arcCompletion, setArcCompletion] = useState<ArcCompletionData | undefined>();
  const [refiningArc, setRefiningArc] = useState(false);
  const [refinementMessages, setRefinementMessages] = useState<ArcRefinementMessage[]>([]);
  const [incompletePrompt, setIncompletePrompt] = useState<string | null>(null);
  const [pendingIncompleteMessage, setPendingIncompleteMessage] = useState<string | null>(null);

  const handleSend = async (forceComplete = false) => {
    if (!input.trim() || sending || sessionEnded) {
      console.log('[ChatInterface] handleSend blocked:', { empty: !input.trim(), sending, sessionEnded });
      return;
    }

    const userMessage = input.trim();
    // If we're resending while incomplete prompt is showing, force complete
    const shouldForceComplete = forceComplete || (incompletePrompt !== null && pendingIncompleteMessage !== null);

    console.log('[ChatInterface] Sending message:', userMessage.substring(0, 50) + (userMessage.length > 50 ? '...' : ''), { forceComplete: shouldForceComplete });
    setInput('');
    setSending(true);
    setIncompletePrompt(null);
    setPendingIncompleteMessage(null);

    // Optimistically add user message
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);

    try {
      const response = await sendMessage(userMessage, shouldForceComplete);
      console.log('[ChatInterface] Message response:', {
        messageCount: response.conversation.messages.length,
        sessionShouldEnd: response.sessionShouldEnd,
        incompleteMessageDetected: response.incompleteMessageDetected,
      });

      // Handle incomplete message detection
      if (response.incompleteMessageDetected) {
        console.log('[ChatInterface] Incomplete message detected, restoring input');
        // Remove the optimistic message
        setMessages((prev) => prev.slice(0, -1));
        // Restore the text to the input field
        setInput(userMessage);
        // Store the pending message and show the prompt
        setPendingIncompleteMessage(userMessage);
        setIncompletePrompt(response.response);
        setSending(false);
        return;
      }

      setMessages(response.conversation.messages);

      // Auto-end session if Claude detected user wants to end
      if (response.sessionShouldEnd) {
        console.log('[ChatInterface] Auto-ending session (sessionShouldEnd=true)');
        setEnding(true);
        try {
          const endResponse = await endSession();
          console.log('[ChatInterface] Auto-end session success:', {
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
          console.error('[ChatInterface] Auto-end session failed:', endError);
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
      const response = await endSession();
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (refiningArc) {
        handleSendRefinement();
      } else {
        handleSend();
      }
    }
  };

  const handleStartRefinement = () => {
    console.log('[ChatInterface] Starting arc refinement');
    setRefiningArc(true);
    // Add initial assistant message
    setRefinementMessages([{
      role: 'assistant',
      content: "I'd love to help you find a theme that feels right. What kind of territory would you like to explore? Is there something specific that's been on your mind, or would you prefer I suggest some alternatives?",
    }]);
  };

  const handleSendRefinement = async () => {
    if (!input.trim() || sending) return;

    const userMessage = input.trim();
    console.log('[ChatInterface] Sending refinement message:', userMessage.substring(0, 50));
    setInput('');
    setSending(true);

    // Optimistically add user message
    const updatedMessages: ArcRefinementMessage[] = [...refinementMessages, { role: 'user', content: userMessage }];
    setRefinementMessages(updatedMessages);

    try {
      const response = await sendArcRefinementMessage(userMessage, refinementMessages);
      console.log('[ChatInterface] Refinement response:', {
        hasArcUpdated: !!response.arcUpdated,
      });

      // Add assistant response
      setRefinementMessages([...updatedMessages, { role: 'assistant', content: response.response }]);

      // If arc was updated, update the display and exit refinement mode
      if (response.arcUpdated && arcCompletion) {
        setArcCompletion({
          ...arcCompletion,
          nextArc: response.arcUpdated,
        });
        setRefiningArc(false);
        setRefinementMessages([]);
      }
    } catch (error) {
      console.error('[ChatInterface] Refinement message failed:', error);
      // Remove optimistic message on error
      setRefinementMessages(refinementMessages);
    } finally {
      setSending(false);
    }
  };

  const handleCancelRefinement = () => {
    setRefiningArc(false);
    setRefinementMessages([]);
    setInput('');
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
            <div className="message-content typing">Thinking...</div>
          </div>
        )}
      </div>

      {sessionEnded ? (
        <div className="session-ended-container">
          <p className="session-ended">Session ended</p>

          {arcCompletion && (
            <div className="arc-completion">
              <div className="arc-summary">
                <p className="arc-completion-label">Arc Complete</p>
                <Markdown>{arcCompletion.summary}</Markdown>
              </div>
              <div className="next-arc-preview">
                <div className="next-arc-header">
                  <p className="next-arc-label">Coming tomorrow</p>
                  {!refiningArc && (
                    <button onClick={handleStartRefinement} className="change-arc-link">
                      Change
                    </button>
                  )}
                </div>
                <p className="next-arc-theme">{arcCompletion.nextArc.theme}</p>
                <p className="next-arc-description">{arcCompletion.nextArc.description}</p>
              </div>
            </div>
          )}

          {suggestedReading && (
            <div className="suggested-reading">
              <p className="suggested-reading-label">Further reading</p>
              <a href={suggestedReading.url} target="_blank" rel="noopener noreferrer" className="suggested-reading-link">
                {suggestedReading.title}
              </a>
              <p className="suggested-reading-rationale">{suggestedReading.rationale}</p>
            </div>
          )}

          {refiningArc && (
            <div className="arc-refinement">
              <div className="messages">
                {refinementMessages.map((msg, index) => (
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
                    <div className="message-content typing">Thinking...</div>
                  </div>
                )}
              </div>
              <div className="chat-input-area">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Describe what you'd prefer..."
                  disabled={sending}
                  rows={2}
                />
                <div className="chat-actions">
                  <button onClick={handleSendRefinement} disabled={!input.trim() || sending}>
                    Send
                  </button>
                  <button onClick={handleCancelRefinement} className="end-session">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : ending ? (
        <div className="chat-input-area">
          <p className="ending-message">Ending session...</p>
        </div>
      ) : (
        <>
          {incompletePrompt && (
            <div className="incomplete-prompt">
              <p>
                It looks like your message may have been cut off. Continue typing, or click{' '}
                <button
                  type="button"
                  className="complete-link"
                  onClick={() => handleSend(true)}
                  disabled={sending}
                >
                  send as-is
                </button>
                {' '}if that was complete.
              </p>
            </div>
          )}
          <div className="chat-input-area">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              disabled={sending}
              rows={2}
            />
            <div className="chat-actions">
              <button onClick={() => handleSend()} disabled={!input.trim() || sending}>
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
        </>
      )}
    </section>
  );
}

export default ChatInterface;
