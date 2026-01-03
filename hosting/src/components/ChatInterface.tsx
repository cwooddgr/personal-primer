import { useState } from 'react';
import Markdown from 'react-markdown';
import { sendMessage, endSession, Conversation, ConversationMessage, SuggestedReading, ArcCompletionData } from '../api/client';

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
      const response = await sendMessage(userMessage);
      console.log('[ChatInterface] Message response:', {
        messageCount: response.conversation.messages.length,
        sessionShouldEnd: response.sessionShouldEnd,
      });
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
      handleSend();
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
                <p className="next-arc-label">Coming tomorrow</p>
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
        </div>
      ) : ending ? (
        <div className="chat-input-area">
          <p className="ending-message">Ending session...</p>
        </div>
      ) : (
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
