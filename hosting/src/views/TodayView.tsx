import { useEffect, useRef, useState, useCallback } from 'react';
import { getToday, endArcEarly, TodayReadyResponse, ArcCompletionData, SuggestedReading } from '../api/client';
import MusicCard from '../components/MusicCard';
import ImageCard from '../components/ImageCard';
import TextCard from '../components/TextCard';
import FramingText from '../components/FramingText';
import ChatInterface from '../components/ChatInterface';
import ErrorDisplay from '../components/ErrorDisplay';

// How often to re-poll GET /api/today while the bundle is being generated.
const POLL_INTERVAL_MS = 4000;

function TodayView() {
  const [data, setData] = useState<TodayReadyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [endingArc, setEndingArc] = useState(false);
  const [arcCompletion, setArcCompletion] = useState<ArcCompletionData | undefined>();
  const [arcEndSuggestedReading, setArcEndSuggestedReading] = useState<SuggestedReading | undefined>();
  const [arcEndedSessionEarly, setArcEndedSessionEarly] = useState(false);

  // Holds the active polling interval so it can be cleared on unmount / ready.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const loadToday = useCallback(async () => {
    console.log('[TodayView] Loading today data...');
    setLoading(true);
    setError(null);
    setFailed(false);
    try {
      const todayResponse = await getToday();

      if (todayResponse.status === 'ready') {
        console.log('[TodayView] Loaded successfully:', {
          bundleId: todayResponse.bundle.id,
          arcTheme: todayResponse.arc.theme,
          hasConversation: !!todayResponse.conversation,
          messageCount: todayResponse.conversation?.messages.length ?? 0,
          sessionEnded: todayResponse.conversation?.sessionEnded ?? false,
        });
        stopPolling();
        setData(todayResponse);
        setGenerating(false);
      } else if (todayResponse.status === 'failed') {
        console.error('[TodayView] Bundle generation failed.');
        stopPolling();
        setData(null);
        setGenerating(false);
        setFailed(true);
      } else {
        // status === 'generating' — keep showing the loading state and poll.
        console.log('[TodayView] Bundle is generating; polling...');
        setData(null);
        setGenerating(true);
      }
    } catch (err) {
      console.error('[TodayView] Load failed:', err);
      stopPolling();
      setError(err);
      setGenerating(false);
    } finally {
      setLoading(false);
    }
  }, [stopPolling]);

  useEffect(() => {
    loadToday();
    return stopPolling;
  }, [loadToday, stopPolling]);

  // While the bundle is generating, poll GET /api/today until it is ready.
  useEffect(() => {
    if (!generating) {
      return;
    }
    if (pollRef.current !== null) {
      return;
    }
    pollRef.current = setInterval(() => {
      loadToday();
    }, POLL_INTERVAL_MS);
    return stopPolling;
  }, [generating, loadToday, stopPolling]);

  if (loading || generating) {
    return <div className="loading">Preparing today's encounter</div>;
  }

  if (failed) {
    return (
      <ErrorDisplay
        error={"Today's encounter could not be prepared. Please try again."}
        onRetry={loadToday}
      />
    );
  }

  if (error) {
    return <ErrorDisplay error={error} onRetry={loadToday} />;
  }

  if (!data) {
    return <div className="error-message">No data available</div>;
  }

  const { bundle, conversation, arc, dayInArc } = data;

  const handleEndArcEarly = async () => {
    if (endingArc) return;
    if (!window.confirm('End this arc and move to a new theme?')) return;

    setEndingArc(true);
    try {
      const response = await endArcEarly(bundle.id);
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

      <ChatInterface
        initialConversation={conversation}
        sessionEnded={conversation?.sessionEnded ?? false}
        bundleId={bundle.id}
        initialSuggestedReading={arcEndSuggestedReading || bundle.suggestedReading}
        initialArcCompletion={arcCompletion}
        forceSessionEnded={arcEndedSessionEarly}
      />
    </div>
  );
}

export default TodayView;
