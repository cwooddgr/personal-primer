import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getHistory, ArcWithBundles } from '../api/client';
import ErrorDisplay from '../components/ErrorDisplay';

function HistoryView() {
  const [arcGroups, setArcGroups] = useState<ArcWithBundles[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getHistory(30);
      setArcGroups(response.arcGroups);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  if (loading) {
    return <div className="loading">Loading history</div>;
  }

  if (error) {
    return <ErrorDisplay error={error} onRetry={loadHistory} />;
  }

  if (arcGroups.length === 0) {
    return (
      <div className="history-view">
        <h1>History</h1>
        <p className="empty-state">No past encounters yet.</p>
      </div>
    );
  }

  return (
    <div className="history-view">
      <h1>History</h1>

      {arcGroups.map((group) => (
        <section key={group.arc.id} className="history-arc-group">
          <h2 className="history-arc-theme">{group.arc.theme}</h2>
          {group.arc.description && (
            <p className="history-arc-description">{group.arc.description}</p>
          )}
          <ul className="history-list">
            {[...group.bundles].reverse().map((bundle, index) => {
              // Display chronologically: day 1 first
              const dayInArc = index + 1;
              return (
                <li key={bundle.id} className="history-item">
                  <span className="history-date">
                    {bundle.id}
                    <span className="history-day-badge">Day {dayInArc}</span>
                  </span>
                  <div className="history-summary">
                    <p>
                      <strong>Music:</strong> {bundle.music.title} by {bundle.music.artist}
                    </p>
                    <p>
                      <strong>Image:</strong> {bundle.image.title}
                      {bundle.image.artist && ` by ${bundle.image.artist}`}
                    </p>
                    <p>
                      <strong>Text:</strong> {bundle.text.source} &mdash; {bundle.text.author}
                    </p>
                    {bundle.suggestedReading && (
                      <p>
                        <strong>Further reading:</strong>{' '}
                        <a href={bundle.suggestedReading.url} target="_blank" rel="noopener noreferrer">
                          {bundle.suggestedReading.title}
                        </a>
                      </p>
                    )}
                    <Link to={`/history/${bundle.id}/conversation`} className="conversation-link">
                      View conversation &rarr;
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default HistoryView;
