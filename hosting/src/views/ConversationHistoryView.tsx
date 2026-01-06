import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Markdown from 'react-markdown';
import { getConversationHistory, Conversation, ConversationMessage } from '../api/client';

function ConversationHistoryView() {
  const { date } = useParams<{ date: string }>();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadConversation() {
      if (!date) {
        setError('No date specified');
        setLoading(false);
        return;
      }

      try {
        const response = await getConversationHistory(date);
        setConversation(response.conversation);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load conversation');
      } finally {
        setLoading(false);
      }
    }

    loadConversation();
  }, [date]);

  if (loading) {
    return <div className="loading">Loading conversation...</div>;
  }

  if (error) {
    return (
      <div className="conversation-history-view">
        <Link to="/history" className="back-link">&larr; Back to history</Link>
        <div className="error-message">{error}</div>
      </div>
    );
  }

  const messages: ConversationMessage[] = conversation?.messages || [];

  return (
    <div className="conversation-history-view">
      <Link to="/history" className="back-link">&larr; Back to history</Link>
      <h1>Conversation: {date}</h1>

      {messages.length === 0 ? (
        <p className="empty-state">No conversation for this day.</p>
      ) : (
        <section className="chat-interface read-only">
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
          </div>
        </section>
      )}
    </div>
  );
}

export default ConversationHistoryView;
