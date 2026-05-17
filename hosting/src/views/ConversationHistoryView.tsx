import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import Markdown from 'react-markdown';
import { getConversationHistory, ConversationHistoryResponse, ConversationMessage } from '../api/client';
import MusicCard from '../components/MusicCard';
import ImageCard from '../components/ImageCard';
import TextCard from '../components/TextCard';
import FramingText from '../components/FramingText';
import ErrorDisplay from '../components/ErrorDisplay';

function ConversationHistoryView() {
  const { bundleId } = useParams<{ bundleId: string }>();
  const [data, setData] = useState<ConversationHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const loadConversation = useCallback(async () => {
    if (!bundleId) {
      setError(new Error('No bundle specified'));
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const historyResponse = await getConversationHistory(bundleId);
      setData(historyResponse);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [bundleId]);

  useEffect(() => {
    loadConversation();
  }, [loadConversation]);

  if (loading) {
    return <div className="loading">Loading</div>;
  }

  if (error) {
    return (
      <div className="conversation-history-view">
        <Link to="/history" className="back-link">&larr; Back to history</Link>
        <ErrorDisplay error={error} onRetry={loadConversation} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="conversation-history-view">
        <Link to="/history" className="back-link">&larr; Back to history</Link>
        <div className="error-message">No data available</div>
      </div>
    );
  }

  const { conversation, bundle, arc, dayInArc } = data;
  const messages: ConversationMessage[] = conversation?.messages || [];

  return (
    <div className="conversation-history-view">
      <Link to="/history" className="back-link">&larr; Back to history</Link>

      <header className="today-header">
        <h1>{arc ? arc.theme : 'Encounter'}</h1>
        {arc && (
          <>
            <p className="arc-badge">
              Day {dayInArc} of {arc.targetDurationDays}
            </p>
            {dayInArc === 1 && arc.description && (
              <p className="arc-description">{arc.description}</p>
            )}
            {dayInArc !== 1 && arc.shortDescription && (
              <p className="arc-description">{arc.shortDescription}</p>
            )}
          </>
        )}
      </header>

      <section className="artifacts">
        <MusicCard
          title={bundle.music.title}
          artist={bundle.music.artist}
          youtubeUrl={bundle.music.youtubeUrl}
        />

        <ImageCard
          title={bundle.image.title}
          artist={bundle.image.artist}
          year={bundle.image.year}
          sourceUrl={bundle.image.sourceUrl}
          imageUrl={bundle.image.imageUrl}
        />

        <TextCard
          content={bundle.text.content}
          source={bundle.text.source}
          author={bundle.text.author}
        />
      </section>

      <FramingText text={bundle.framingText} />

      <section className="chat-interface read-only">
        <h2>Conversation</h2>

        <p className="chat-prompt">
          Share your thoughts on today's encounter...
        </p>

        {messages.length === 0 ? (
          <p className="empty-state">No messages recorded.</p>
        ) : (
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
        )}

        {conversation?.sessionEnded && (
          <p className="session-ended">Session ended</p>
        )}

        {bundle.suggestedReading && (
          <div className="suggested-reading">
            <p className="suggested-reading-label">Further reading</p>
            <a href={bundle.suggestedReading.url} target="_blank" rel="noopener noreferrer" className="suggested-reading-link">
              {bundle.suggestedReading.title}
            </a>
            <p className="suggested-reading-rationale">{bundle.suggestedReading.rationale}</p>
          </div>
        )}
      </section>
    </div>
  );
}

export default ConversationHistoryView;
