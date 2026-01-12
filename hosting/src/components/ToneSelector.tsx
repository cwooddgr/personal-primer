import { useState } from 'react';
import { ToneId, ToneDefinition } from '../api/client';

interface ToneSelectorProps {
  tones: ToneDefinition[];
  currentTone: ToneId;
  onSelect: (tone: ToneId) => void;
  disabled?: boolean;
  compact?: boolean;
}

function ToneSelector({ tones, currentTone, onSelect, disabled, compact }: ToneSelectorProps) {
  const [expanded, setExpanded] = useState(false);

  if (compact) {
    // Compact dropdown for chat interface
    const currentToneDef = tones.find(t => t.id === currentTone);

    return (
      <div className="tone-selector-compact">
        <button
          className="tone-current"
          onClick={() => setExpanded(!expanded)}
          disabled={disabled}
          type="button"
        >
          {currentToneDef?.shortName || 'Guided'}
          <span className="tone-chevron">{expanded ? '\u25B2' : '\u25BC'}</span>
        </button>
        {expanded && (
          <div className="tone-dropdown">
            {tones.map(tone => (
              <button
                key={tone.id}
                className={`tone-option ${tone.id === currentTone ? 'selected' : ''}`}
                onClick={() => {
                  onSelect(tone.id);
                  setExpanded(false);
                }}
                type="button"
              >
                <span className="tone-name">{tone.shortName}</span>
                <span className="tone-subtitle">{tone.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Full card selector for onboarding/preferences
  return (
    <div className="tone-selector">
      {tones.map(tone => (
        <button
          key={tone.id}
          className={`tone-card ${tone.id === currentTone ? 'selected' : ''}`}
          onClick={() => onSelect(tone.id)}
          disabled={disabled}
          type="button"
        >
          <h4 className="tone-card-name">{tone.name}</h4>
          <p className="tone-card-short">{tone.shortName}</p>
          <p className="tone-card-description">{tone.description}</p>
        </button>
      ))}
    </div>
  );
}

export default ToneSelector;
