import { useEffect, useState, useCallback } from 'react';
import { getToday, getTones, endArcEarly, TodayResponse, ToneDefinition, ToneId, ArcCompletionData, SuggestedReading } from '../api/client';
import MusicCard from '../components/MusicCard';
import ImageCard from '../components/ImageCard';
import TextCard from '../components/TextCard';
import FramingText from '../components/FramingText';
import ChatInterface from '../components/ChatInterface';
import ErrorDisplay from '../components/ErrorDisplay';

function TodayView() {
  const [data, setData] = useState<TodayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [tones, setTones] = useState<ToneDefinition[]>([]);
  const [currentTone, setCurrentTone] = useState<ToneId>('guided');
  const [endingArc, setEndingArc] = useState(false);
  const [arcCompletion, setArcCompletion] = useState<ArcCompletionData | undefined>();
  const [arcEndSuggestedReading, setArcEndSuggestedReading] = useState<SuggestedReading | undefined>();
  const [arcEndedSessionEarly, setArcEndedSessionEarly] = useState(false);

  const loadToday = useCallback(async () => {
    console.log('[TodayView] Loading today data...');
    setLoading(true);
    setError(null);
    try {
      const [todayResponse, tonesResponse] = await Promise.all([
        getToday(),
        getTones(),
      ]);
      console.log('[TodayView] Loaded successfully:', {
        bundleId: todayResponse.bundle.id,
        arcTheme: todayResponse.arc.theme,
        hasConversation: !!todayResponse.conversation,
        messageCount: todayResponse.conversation?.messages.length ?? 0,
        sessionEnded: todayResponse.conversation?.sessionEnded ?? false,
        currentTone: todayResponse.currentTone,
      });
      setData(todayResponse);
      setTones(tonesResponse.tones);
      setCurrentTone(todayResponse.currentTone);
    } catch (err) {
      console.error('[TodayView] Load failed:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadToday();
  }, [loadToday]);

  if (loading) {
    return <div className="loading">Preparing today's encounter</div>;
  }

  if (error) {
    return <ErrorDisplay error={error} onRetry={loadToday} />;
  }

  if (!data) {
    return <div className="error-message">No data available</div>;
  }

  const handleEndArcEarly = async () => {
    if (endingArc) return;
    if (!window.confirm('End this arc and move to a new theme?')) return;

    setEndingArc(true);
    try {
      const response = await endArcEarly();
      if (response.arcCompletion) {
        setArcCompletion(response.arcCompletion);
      }
      if (response.suggestedReading) {
        setArcEndSuggestedReading(response.suggestedReading);
      }
      setArcEndedSessionEarly(true);
    } catch (err) {
      console.error('[TodayView] End arc early failed:', err);
    } finally {
      setEndingArc(false);
    }
  };

  const { bundle, conversation, arc, dayInArc } = data;
  const isLastDay = dayInArc >= arc.targetDurationDays;

  return (
    <div className="today-view">
      <header className="today-header">
        <h1>Today</h1>
        <p className="arc-badge">
          {arc.theme} &middot; Day {dayInArc} of {arc.targetDurationDays}
          {!isLastDay && !arcCompletion && (
            <button
              onClick={handleEndArcEarly}
              disabled={endingArc}
              className="move-on-link"
            >
              {endingArc ? 'Ending arc...' : 'Move on'}
            </button>
          )}
        </p>
        {(arc.shortDescription || arc.description) && (
          <p className="arc-description">
            {dayInArc === 1 ? arc.description : (arc.shortDescription || arc.description)}
          </p>
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

      <ChatInterface
        initialConversation={conversation}
        sessionEnded={conversation?.sessionEnded ?? false}
        initialSuggestedReading={arcEndSuggestedReading || bundle.suggestedReading}
        initialArcCompletion={arcCompletion}
        forceSessionEnded={arcEndedSessionEarly}
        tones={tones}
        currentTone={currentTone}
        onToneChange={setCurrentTone}
      />
    </div>
  );
}

export default TodayView;
