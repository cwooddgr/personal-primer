import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getHistory, ArcWithBundles } from '../api/client';

function HistoryView() {
  const [arcGroups, setArcGroups] = useState<ArcWithBundles[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadHistory() {
      try {
        const response = await getHistory(30);
        setArcGroups(response.arcGroups);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    }

    loadHistory();
  }, []);

  if (loading) {
    return <div className="loading">Loading history...</div>;
  }

  if (error) {
    return <div className="error-message">{error}</div>;
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
          <ul className="history-list">
            {group.bundles.map((bundle, index) => {
              // Bundles are newest-first, so day 1 is the last item
              const dayInArc = group.bundles.length - index;
              const isDay1 = dayInArc === 1;
              return (
                <li key={bundle.id} className="history-item">
                  <span className="history-date">
                    {bundle.id}
                    <span className="history-day-badge">Day {dayInArc}</span>
                  </span>
                  {isDay1 && group.arc.description && (
                    <p className="history-arc-description">{group.arc.description}</p>
                  )}
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
