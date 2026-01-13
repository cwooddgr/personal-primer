import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Markdown from 'react-markdown';
import { getConversationHistory, getTones, ConversationHistoryResponse, ConversationMessage, ToneDefinition, ToneId, ToneChange } from '../api/client';
import MusicCard from '../components/MusicCard';
import ImageCard from '../components/ImageCard';
import TextCard from '../components/TextCard';
import FramingText from '../components/FramingText';

function ConversationHistoryView() {
  const { date } = useParams<{ date: string }>();
  const [data, setData] = useState<ConversationHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tones, setTones] = useState<ToneDefinition[]>([]);

  useEffect(() => {
    async function loadConversation() {
      if (!date) {
        setError('No date specified');
        setLoading(false);
        return;
      }

      try {
        const [historyResponse, tonesResponse] = await Promise.all([
          getConversationHistory(date),
          getTones(),
        ]);
        setData(historyResponse);
        setTones(tonesResponse.tones);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load conversation');
      } finally {
        setLoading(false);
      }
    }

    loadConversation();
  }, [date]);

  // Helper to get tone name by ID
  const getToneName = (toneId: ToneId): string => {
    const tone = tones.find(t => t.id === toneId);
    return tone?.shortName || toneId;
  };

  if (loading) {
    return <div className="loading">Loading</div>;
  }

  if (error) {
    return (
      <div className="conversation-history-view">
        <Link to="/history" className="back-link">&larr; Back to history</Link>
        <div className="error-message">{error}</div>
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
  const toneChanges: ToneChange[] = conversation?.toneChanges || [];
  const initialTone = conversation?.initialTone || bundle.tone;

  // Render messages with tone change dividers
  const renderMessagesWithDividers = () => {
    const elements: React.ReactNode[] = [];

    // Build a map of messageIndex -> tone change
    const toneChangeMap = new Map<number, ToneId>();
    for (const tc of toneChanges) {
      toneChangeMap.set(tc.messageIndex, tc.tone);
    }

    for (let index = 0; index < messages.length; index++) {
      // Check if there's a tone change before this message
      if (toneChangeMap.has(index)) {
        const newTone = toneChangeMap.get(index)!;
        elements.push(
          <div key={`tone-change-${index}`} className="tone-change-marker">
            <span>Switched to {getToneName(newTone)}</span>
          </div>
        );
      }

      const msg = messages[index];
      elements.push(
        <div key={index} className={`message ${msg.role}`}>
          <div className="message-content">
            {msg.role === 'assistant' ? (
              <Markdown>{msg.content}</Markdown>
            ) : (
              msg.content
            )}
          </div>
        </div>
      );
    }

    return elements;
  };

  return (
    <div className="conversation-history-view">
      <Link to="/history" className="back-link">&larr; Back to history</Link>

      <header className="today-header">
        <h1>{date}</h1>
        {arc && (
          <>
            <p className="arc-badge">
              {arc.theme} &middot; Day {dayInArc} of {arc.targetDurationDays}
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
          appleMusicUrl={bundle.music.appleMusicUrl}
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
        <div className="chat-header">
          <h2>Conversation</h2>
          {initialTone && tones.length > 0 && (
            <span className="tone-label">{getToneName(initialTone)} voice</span>
          )}
        </div>

        <p className="chat-prompt">
          Share your thoughts on today's encounter...
        </p>

        {messages.length === 0 ? (
          <p className="empty-state">No messages recorded.</p>
        ) : (
          <div className="messages">
            {renderMessagesWithDividers()}
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
