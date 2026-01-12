import { useState, useEffect } from 'react';
import { ToneId, ToneDefinition, getTones, setDefaultTone } from '../api/client';
import ToneSelector from '../components/ToneSelector';

interface ToneSelectionViewProps {
  onComplete: (tone: ToneId) => void;
}

function ToneSelectionView({ onComplete }: ToneSelectionViewProps) {
  const [tones, setTones] = useState<ToneDefinition[]>([]);
  const [selectedTone, setSelectedTone] = useState<ToneId>('guided');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadTones() {
      try {
        const response = await getTones();
        setTones(response.tones);
        setSelectedTone(response.default);
      } catch (err) {
        console.error('Failed to load tones:', err);
        setError('Failed to load tone options');
      } finally {
        setLoading(false);
      }
    }
    loadTones();
  }, []);

  const handleContinue = async () => {
    setSaving(true);
    setError(null);
    try {
      await setDefaultTone(selectedTone);
      onComplete(selectedTone);
    } catch (err) {
      console.error('Failed to save tone:', err);
      setError('Failed to save your selection');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="tone-selection-view">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="tone-selection-view">
      <h1>Choose Your Guide's Voice</h1>
      <p className="tone-intro">
        How would you like your guide to engage with you? Each tone offers a different
        style of conversation. You can change this anytime, even mid-conversation.
      </p>

      {error && <p className="error-message">{error}</p>}

      <ToneSelector
        tones={tones}
        currentTone={selectedTone}
        onSelect={setSelectedTone}
        disabled={saving}
      />

      <button
        className="continue-button"
        onClick={handleContinue}
        disabled={saving}
      >
        {saving ? 'Saving...' : 'Continue'}
      </button>
    </div>
  );
}

export default ToneSelectionView;
