import { useEffect, useState } from 'react';
import { getArc, Arc } from '../api/client';

function ArcView() {
  const [arc, setArc] = useState<Arc | null>(null);
  const [dayInArc, setDayInArc] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadArc() {
      try {
        const response = await getArc();
        setArc(response.arc);
        setDayInArc(response.dayInArc);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    }

    loadArc();
  }, []);

  if (loading) {
    return <div className="loading">Loading arc...</div>;
  }

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  if (!arc) {
    return (
      <div className="arc-view">
        <h1>No Active Arc</h1>
        <p>Create an arc in Firestore to begin.</p>
      </div>
    );
  }

  return (
    <div className="arc-view">
      <header className="arc-header">
        <h1>{arc.theme}</h1>
        <p className="arc-phase">{arc.currentPhase} phase</p>
      </header>

      <p className="arc-description">{arc.description}</p>

      <div className="arc-progress">
        <p className="day-count">
          Day {dayInArc} of ~{arc.targetDurationDays}
        </p>
      </div>
    </div>
  );
}

export default ArcView;
