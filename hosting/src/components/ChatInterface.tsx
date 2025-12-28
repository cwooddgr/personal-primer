import { useState } from 'react';
import { sendMessage, endSession, Conversation, ConversationMessage } from '../api/client';

interface ChatInterfaceProps {
  initialConversation: Conversation | null;
  sessionEnded: boolean;
}

function ChatInterface({ initialConversation, sessionEnded: initialSessionEnded }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ConversationMessage[]>(
    initialConversation?.messages || []
  );
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(initialSessionEnded);
  const [ending, setEnding] = useState(false);

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
      await endSession();
      setSessionEnded(true);
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
            <div className="message-content">{msg.content}</div>
          </div>
        ))}
        {sending && (
          <div className="message assistant">
            <div className="message-content typing">Thinking...</div>
          </div>
        )}
      </div>

      {sessionEnded ? (
        <p className="session-ended">Session ended</p>
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
