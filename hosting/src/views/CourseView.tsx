import { useEffect, useState, useCallback, useRef } from 'react';
import Markdown from 'react-markdown';
import {
  getSeason,
  sendSeasonSteerMessage,
  Arc,
  Season,
  SeasonSteerMessage,
} from '../api/client';
import ErrorDisplay from '../components/ErrorDisplay';

function statusLabel(status: Arc['status']): string {
  switch (status) {
    case 'completed':
      return 'Completed';
    case 'active':
      return 'In progress';
    case 'planned':
    default:
      return 'Planned';
  }
}

function CourseView() {
  const [season, setSeason] = useState<Season | null>(null);
  const [arcs, setArcs] = useState<Arc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  // Steering conversation state
  const [steerMessages, setSteerMessages] = useState<SeasonSteerMessage[]>([]);
  const [steerInput, setSteerInput] = useState('');
  const [steerSending, setSteerSending] = useState(false);

  const steerEndRef = useRef<HTMLDivElement>(null);

  const loadSeason = useCallback(async () => {
    console.log('[CourseView] Loading season...');
    setLoading(true);
    setError(null);
    try {
      const response = await getSeason();
      setSeason(response.season);
      setArcs([...response.arcs].sort((a, b) => a.orderInSeason - b.orderInSeason));
    } catch (err) {
      console.error('[CourseView] Load failed:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSeason();
  }, [loadSeason]);

  // Auto-scroll the steering conversation
  useEffect(() => {
    if (steerEndRef.current && steerMessages.length > 0) {
      steerEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [steerMessages, steerSending]);

  const handleSteerSend = async () => {
    if (!steerInput.trim() || steerSending) return;

    const userMessage = steerInput.trim();
    console.log('[CourseView] Sending steer message:', userMessage.substring(0, 50));
    setSteerInput('');
    setSteerSending(true);

    const history = steerMessages;
    setSteerMessages((prev) => [...prev, { role: 'user', content: userMessage }]);

    try {
      const response = await sendSeasonSteerMessage(userMessage, history);
      console.log('[CourseView] Steer response:', {
        seasonUpdated: !!response.arcs,
      });
      setSteerMessages((prev) => [...prev, { role: 'assistant', content: response.response }]);

      // If the syllabus changed, refresh it.
      if (response.arcs) {
        setArcs([...response.arcs].sort((a, b) => a.orderInSeason - b.orderInSeason));
        if (response.season) {
          setSeason(response.season);
        }
      }
    } catch (err) {
      console.error('[CourseView] Steer message failed:', err);
      setSteerMessages((prev) => prev.slice(0, -1));
      setSteerInput(userMessage);
    } finally {
      setSteerSending(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading your course</div>;
  }

  if (error) {
    return <ErrorDisplay error={error} onRetry={loadSeason} />;
  }

  if (!season || arcs.length === 0) {
    return (
      <div className="course-view">
        <h1>Your Course</h1>
        <p className="empty-state">No course planned yet.</p>
      </div>
    );
  }

  return (
    <div className="course-view">
      <header className="course-header">
        <h1>Your Course</h1>
        <p className="course-subtitle">
          A syllabus of {arcs.length} themes &mdash; Season {season.seasonNumber}
        </p>
      </header>

      <ol className="syllabus">
        {arcs.map((arc) => (
          <li key={arc.id} className={`syllabus-item status-${arc.status}`}>
            <div className="syllabus-item-head">
              <span className="syllabus-order">{arc.orderInSeason}</span>
              <h2 className="syllabus-theme">{arc.theme}</h2>
              <span className={`status-badge status-${arc.status}`}>
                {statusLabel(arc.status)}
              </span>
            </div>
            <p className="syllabus-description">
              {arc.description || arc.shortDescription}
            </p>
          </li>
        ))}
      </ol>

      <section className="steering-panel">
        <h2>Steer your course</h2>
        <p className="steering-intro">
          Talk through the planned themes here. You can swap, reorder, remove,
          or add a topic, or ask for more from a particular angle. Completed and
          in-progress themes stay fixed.
        </p>

        <div className="messages">
          {steerMessages.map((msg, index) => (
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
          {steerSending && (
            <div className="message assistant">
              <div className="message-content typing">Thinking</div>
            </div>
          )}
          <div ref={steerEndRef} />
        </div>

        <div className="chat-input-area">
          <textarea
            value={steerInput}
            onChange={(e) => setSteerInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (steerInput.trim() && !steerSending) {
                  handleSteerSend();
                }
              }
            }}
            placeholder="Suggest a change to the planned themes..."
            disabled={steerSending}
            rows={2}
          />
          <div className="chat-actions">
            <button
              onClick={handleSteerSend}
              disabled={!steerInput.trim() || steerSending}
            >
              Send
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default CourseView;
