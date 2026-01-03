import { useEffect, useState } from 'react';
import { getToday, TodayResponse } from '../api/client';
import MusicCard from '../components/MusicCard';
import ImageCard from '../components/ImageCard';
import TextCard from '../components/TextCard';
import FramingText from '../components/FramingText';
import ChatInterface from '../components/ChatInterface';

function TodayView() {
  const [data, setData] = useState<TodayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadToday() {
      console.log('[TodayView] Loading today data...');
      try {
        const response = await getToday();
        console.log('[TodayView] Loaded successfully:', {
          bundleId: response.bundle.id,
          arcTheme: response.arc.theme,
          hasConversation: !!response.conversation,
          messageCount: response.conversation?.messages.length ?? 0,
          sessionEnded: response.conversation?.sessionEnded ?? false,
        });
        setData(response);
      } catch (err) {
        console.error('[TodayView] Load failed:', err);
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    }

    loadToday();
  }, []);

  if (loading) {
    return <div className="loading">Preparing today's encounter...</div>;
  }

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  if (!data) {
    return <div className="error-message">No data available</div>;
  }

  const { bundle, conversation, arc, dayInArc } = data;

  return (
    <div className="today-view">
      <header className="today-header">
        <h1>Today</h1>
        <p className="arc-badge">
          {arc.theme} &middot; Day {dayInArc} of {arc.targetDurationDays}
        </p>
        {arc.description && <p className="arc-description">{arc.description}</p>}
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

      <ChatInterface
        initialConversation={conversation}
        sessionEnded={conversation?.sessionEnded ?? false}
        initialSuggestedReading={bundle.suggestedReading}
      />
    </div>
  );
}

export default TodayView;
