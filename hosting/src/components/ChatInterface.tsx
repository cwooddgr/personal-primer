import { useState } from 'react';
import Markdown from 'react-markdown';
import { sendMessage, endSession, Conversation, ConversationMessage, SuggestedReading } from '../api/client';

interface ChatInterfaceProps {
  initialConversation: Conversation | null;
  sessionEnded: boolean;
  initialSuggestedReading?: SuggestedReading;
}

function ChatInterface({ initialConversation, sessionEnded: initialSessionEnded, initialSuggestedReading }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ConversationMessage[]>(
    initialConversation?.messages || []
  );
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(initialSessionEnded);
  const [ending, setEnding] = useState(false);
  const [suggestedReading, setSuggestedReading] = useState<SuggestedReading | undefined>(initialSuggestedReading);

  const handleSend = async () => {
    if (!input.trim() || sending || sessionEnded) return;

    const userMessage = input.trim();
    setInput('');
    setSending(true);

    // Optimistically add user message
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);

    try {
      const response = await sendMessage(userMessage);
      setMessages(response.conversation.messages);

      // Auto-end session if Claude detected user wants to end
      if (response.sessionShouldEnd) {
        try {
          const endResponse = await endSession();
          setSessionEnded(true);
          if (endResponse.suggestedReading) {
            setSuggestedReading(endResponse.suggestedReading);
          }
        } catch (endError) {
          console.error('Failed to auto-end session:', endError);
        }
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      // Remove optimistic message on error
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setSending(false);
    }
  };

  const handleEndSession = async () => {
    if (ending || sessionEnded) return;

    setEnding(true);
    try {
      const response = await endSession();
      setSessionEnded(true);
      if (response.suggestedReading) {
        setSuggestedReading(response.suggestedReading);
      }
    } catch (error) {
      console.error('Failed to end session:', error);
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
              disabled={ending || messages.length === 0}
              className="end-session"
            >
              {ending ? 'Ending...' : 'End Session'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export default ChatInterface;
