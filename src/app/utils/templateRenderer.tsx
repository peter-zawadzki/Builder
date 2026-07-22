import React from 'react';

// Shared renderer for the admin-editable Proposal and Customer Agreement
// templates (Super Admin "edit the entire raw content" feature). Both
// documents are stored as one big raw text string; this is the lightweight,
// explicit markup understood by that text, kept deliberately unambiguous
// (no auto-detected heuristics) so admins can predict exactly what they'll
// get:
//
//   ## Section Title              -> a section heading
//   - bullet text                 -> a bullet list item (consecutive lines group into one <ul>)
//   !!plan Name | Price | Scope | Description
//                                  -> a subscription-plan card (consecutive lines group into a 3-up grid)
//   !!box-orange Title            -> an orange callout box; title line + bullets/paragraph that follow
//   !!box-green Title             -> a green callout box, same shape
//   {{splice:name}}                -> replaced with a pre-built React node (tables, per-proposal data, etc.)
//   {{fieldName}}                  -> replaced with a merge-field string value, anywhere in text
//   **bold**                      -> inline emphasis
//
// Blocks are separated by one or more blank lines.

export interface TemplateRenderOptions {
  mergeFields?: Record<string, string>;
  spliceNodes?: Record<string, React.ReactNode>;
  Heading?: React.ComponentType<{ children: React.ReactNode }>;
  paragraphStyle?: React.CSSProperties;
  // When set, every Nth rendered paragraph-like block also gets
  // data-pdf-section, so pdfExport.ts still gets reasonable page-break
  // anchors even in documents (like the Customer Agreement) that have no
  // heading markers of their own to anchor on.
  pdfSectionEvery?: number;
}

function applyMergeFields(text: string, mergeFields: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => (key in mergeFields ? mergeFields[key] : match));
}

// **bold** -> <strong>. No nested/overlapping markup support needed for
// this content.
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : <React.Fragment key={i}>{part}</React.Fragment>));
}

const defaultParagraphStyle: React.CSSProperties = { lineHeight: 1.75, color: '#333', marginBottom: 10, fontSize: 13 };

export function renderTemplate(template: string, options: TemplateRenderOptions = {}): React.ReactNode[] {
  const { mergeFields = {}, spliceNodes = {}, Heading, paragraphStyle = defaultParagraphStyle, pdfSectionEvery } = options;
  const blocks = template.split(/\n\s*\n+/).map(b => b.trim()).filter(Boolean);
  const out: React.ReactNode[] = [];
  let paragraphCount = 0;

  blocks.forEach((block, idx) => {
    const spliceMatch = block.match(/^\{\{splice:(\w+)\}\}$/);
    if (spliceMatch) {
      const node = spliceNodes[spliceMatch[1]];
      if (node) out.push(<React.Fragment key={idx}>{node}</React.Fragment>);
      return;
    }

    const substituted = applyMergeFields(block, mergeFields);
    const lines = substituted.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return;

    // "## Section Title"
    if (lines.length === 1 && lines[0].startsWith('## ')) {
      const text = lines[0].slice(3).trim();
      out.push(Heading ? <Heading key={idx}>{text}</Heading> : <h2 key={idx}>{text}</h2>);
      return;
    }

    // "!!plan Name | Price | Scope | Description" (one or more consecutive lines)
    if (lines.every(l => l.startsWith('!!plan '))) {
      const plans = lines.map(l => {
        const [name, price, scope, desc] = l.slice(7).split('|').map(s => s.trim());
        return { name, price, scope, desc };
      });
      out.push(
        <div key={idx} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 10 }}>
          {plans.map(p => (
            <div key={p.name} style={{ border: '1px solid #ffd5cc', borderRadius: 8, padding: 16, textAlign: 'center' }}>
              <h3 style={{ fontSize: 13, color: '#FF5C39', marginBottom: 4 }}>{p.name}</h3>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1a1a' }}>{p.price}</div>
              <div style={{ fontSize: 11, color: '#777', marginBottom: 6 }}>{p.scope}</div>
              <p style={{ fontSize: 11.5, color: '#555', textAlign: 'left' }}>{renderInline(p.desc)}</p>
            </div>
          ))}
        </div>
      );
      return;
    }

    // "!!box-orange Title" / "!!box-green Title" — title line + bullets or a paragraph
    const boxMatch = lines[0].match(/^!!box-(orange|green)\s+(.*)$/);
    if (boxMatch) {
      const [, color, title] = boxMatch;
      const rest = lines.slice(1);
      const isBullets = rest.length > 0 && rest.every(l => l.startsWith('- '));
      const palette = color === 'orange'
        ? { bg: '#fff3f0', border: '#FF5C39', titleColor: '#FF5C39', textColor: '#333' }
        : { bg: '#f0fdf4', border: '#22c55e', titleColor: '#15803d', textColor: '#166534' };
      out.push(
        <div key={idx} style={{ background: palette.bg, border: `2px solid ${palette.border}`, borderRadius: 8, padding: '14px 18px', marginTop: 14 }}>
          <h3 style={{ color: palette.titleColor, fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{title}</h3>
          {isBullets ? (
            <ul style={{ listStyle: 'none', fontSize: 12.5, color: palette.textColor, lineHeight: 2 }}>
              {rest.map((l, i) => (
                <li key={i} style={{ paddingLeft: 14, position: 'relative' }}>
                  <span style={{ color: palette.border, fontWeight: 700, position: 'absolute', left: 0 }}>-</span>
                  {renderInline(l.slice(2))}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: palette.textColor, fontSize: 12.5, lineHeight: 1.8 }}>{renderInline(rest.join(' '))}</p>
          )}
        </div>
      );
      return;
    }

    // "- bullet" (one or more consecutive lines)
    if (lines.every(l => l.startsWith('- '))) {
      out.push(
        <ul key={idx} style={{ marginLeft: 18, lineHeight: 2.2, color: '#444', fontSize: 12.5 }}>
          {lines.map((l, i) => <li key={i}>{renderInline(l.slice(2))}</li>)}
        </ul>
      );
      return;
    }

    // Plain paragraph
    paragraphCount++;
    const needsPdfAnchor = !!pdfSectionEvery && paragraphCount % pdfSectionEvery === 1;
    out.push(
      <p key={idx} data-pdf-section={needsPdfAnchor ? true : undefined} style={paragraphStyle}>
        {renderInline(lines.join(' '))}
      </p>
    );
  });

  return out;
}
