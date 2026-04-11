import { splitTextForHighlight } from '../../../services/elevenlabs';

export function splitIntoSentences(text) {
  if (!text) return [];
  const parts = text.split(/(?<=[.!?…])\s+(?=[A-ZĄĆĘŁŃÓŚŹŻ"„«»—\-(])/);
  const result = parts.map((s) => s.trim()).filter(Boolean);
  return result.length > 0 ? result : [text];
}

export default function HighlightedNarrative({ text, highlightInfo }) {
  const isActive = highlightInfo && highlightInfo.wordIndex >= 0 && highlightInfo.fullText;

  if (!isActive) {
    return <>{text}</>;
  }

  const fullText = highlightInfo.fullText;
  const startIdx = text.indexOf(fullText);
  if (startIdx < 0) {
    return <>{text}</>;
  }

  const before = text.slice(0, startIdx);
  const after = text.slice(startIdx + fullText.length);
  const segmentWords = splitTextForHighlight(fullText);
  let wordIdx = -1;

  return (
    <>
      {before}
      {segmentWords.map((part, i) => {
        if (/^\s+$/.test(part)) {
          return <span key={i}>{part}</span>;
        }
        wordIdx++;
        const isCurrent = wordIdx === highlightInfo.wordIndex;
        return (
          <span
            key={i}
            className={`rounded-sm transition-colors duration-100 ${isCurrent ? 'text-primary bg-primary/20' : ''}`}
            style={isCurrent ? { boxShadow: '-2px 0 0 0 rgba(197,154,255,0.2), 2px 0 0 0 rgba(197,154,255,0.2)' } : undefined}
          >
            {part}
          </span>
        );
      })}
      {after}
    </>
  );
}
