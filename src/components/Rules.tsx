import React, { useState } from 'react';
import { useStore } from '../store';
import { Card } from './ui';

/** Minimal markdown rendering — headings, lists, bold, and paragraphs. */
function render(md: string): React.ReactNode[] {
  const blocks = md.split(/\n{2,}/);
  return blocks.map((block, i) => {
    const lines = block.split('\n');
    if (/^#\s/.test(block)) return <h1 key={i}>{block.replace(/^#\s/, '')}</h1>;
    if (/^##\s/.test(block)) return <h2 key={i}>{block.replace(/^##\s/, '')}</h2>;
    if (lines.every((l) => /^[-*]\s/.test(l))) {
      return (
        <ul key={i}>
          {lines.map((l, j) => (
            <li key={j}>{inline(l.replace(/^[-*]\s/, ''))}</li>
          ))}
        </ul>
      );
    }
    return <p key={i}>{inline(block.replace(/\n/g, ' '))}</p>;
  });
}

function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i} style={{ color: 'var(--text-primary)' }}>
        {part.slice(2, -2)}
      </strong>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );
}

export function Rules() {
  const { state, setState } = useStore();
  const [editing, setEditing] = useState(false);

  return (
    <Card
      title="Operating rules"
      sub="The part the arithmetic cannot do for you"
      actions={
        <button className="btn sm" onClick={() => setEditing((e) => !e)}>
          {editing ? 'Done' : 'Edit'}
        </button>
      }
    >
      {editing ? (
        <textarea
          rows={30}
          value={state.rules}
          onChange={(e) => setState((s) => ({ ...s, rules: e.target.value }))}
        />
      ) : (
        <div className="markdown">{render(state.rules)}</div>
      )}
    </Card>
  );
}
