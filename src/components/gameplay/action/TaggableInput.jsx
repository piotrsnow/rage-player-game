import {
  useRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useState,
} from 'react';
import { TAG_COLORS, TAG_ICONS, MAX_ENTITY_TAGS, deduplicateTags } from '../../../../shared/domain/actionTag';
import { parseActionSegments } from '../../../services/actionParser';
import EntityAutocomplete from './EntityAutocomplete';
import { useEntityPool } from '../../../hooks/useEntityPool';

/**
 * Rich input that mixes plain text with inline entity-tag chips.
 *
 * Internal model: an ordered array of segments —
 *   { type: 'text', value: string }
 *   { type: 'tag',  tag: { kind, id, name, meta? } }
 *
 * Imperative API (via ref):
 *   .insertTag(tag)  — insert a tag at the caret (or append)
 *   .focus()         — focus the editable
 *   .getText()       — plain-text serialization (tags → their names)
 *   .getTags()       — current tag array (deduplicated)
 */
const TaggableInput = forwardRef(function TaggableInput(
  {
    value = '',
    onChange,
    onSubmit,
    onFocus: onFocusProp,
    onBlur: onBlurProp,
    disabled = false,
    readOnly = false,
    placeholder = '',
    className = '',
    autoPlayerTypingText = '',
  },
  ref,
) {
  const editorRef = useRef(null);
  const wrapperRef = useRef(null);
  const [segments, setSegments] = useState([{ type: 'text', value: value || '' }]);
  const suppressSyncRef = useRef(false);
  const lastExternalValueRef = useRef(value);
  const [autocomplete, setAutocomplete] = useState(null); // { query }
  const entityPool = useEntityPool();

  // ----- helpers -----

  const collectTags = useCallback(
    (segs) => deduplicateTags(segs.filter((s) => s.type === 'tag').map((s) => s.tag)),
    [],
  );

  const segmentsToPlainText = useCallback(
    (segs) => {
      let out = '';
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        if (s.type === 'tag') {
          if (out.length > 0 && !out.endsWith(' ')) out += ' ';
          out += s.tag.name;
          const next = segs[i + 1];
          if (next && !(next.type === 'text' && next.value.startsWith(' '))) out += ' ';
        } else {
          out += s.value;
        }
      }
      return out;
    },
    [],
  );

  // ----- sync external value → segments (for dictation / auto-player) -----

  useEffect(() => {
    const external = autoPlayerTypingText || value || '';
    if (external === lastExternalValueRef.current) return;
    lastExternalValueRef.current = external;

    setSegments((prev) => {
      const tags = prev.filter((s) => s.type === 'tag');
      if (tags.length === 0) {
        return [{ type: 'text', value: external }];
      }
      const textParts = external.split(new RegExp(tags.map((t) => escapeRegex(t.tag.name)).join('|')));
      const merged = [];
      let ti = 0;
      for (let i = 0; i < textParts.length; i++) {
        if (textParts[i]) merged.push({ type: 'text', value: textParts[i] });
        if (ti < tags.length) merged.push(tags[ti++]);
      }
      while (ti < tags.length) merged.push(tags[ti++]);
      return merged;
    });
    suppressSyncRef.current = true;
  }, [value, autoPlayerTypingText]);

  // ----- render segments into the contentEditable -----

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (!suppressSyncRef.current) return;
    suppressSyncRef.current = false;
    renderSegmentsToDOM(el, segments);
    requestAnimationFrame(() => {
      if (document.activeElement !== el && !el.contains(document.activeElement)) return;
      const sel = window.getSelection();
      if (!sel) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    });
  }, [segments]);

  // ----- read DOM back to segments (on input) -----

  const readDOMToSegments = useCallback(() => {
    const el = editorRef.current;
    if (!el) return [];
    const segs = [];
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent) segs.push({ type: 'text', value: node.textContent });
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const kind = node.dataset?.tagKind;
        if (kind) {
          segs.push({
            type: 'tag',
            tag: {
              kind,
              id: node.dataset.tagId || '',
              name: node.dataset.tagName || '',
              ...(node.dataset.tagMeta ? { meta: JSON.parse(node.dataset.tagMeta) } : {}),
            },
          });
        } else {
          const text = node.textContent;
          if (text) segs.push({ type: 'text', value: text });
        }
      }
    }
    return segs;
  }, []);

  const handleInput = useCallback(() => {
    const newSegs = readDOMToSegments();
    setSegments(newSegs);
    const text = segmentsToPlainText(newSegs);
    lastExternalValueRef.current = text;
    onChange?.(text, collectTags(newSegs));

    // Detect @mention trigger
    const atResult = getAtQuery(editorRef.current);
    setAutocomplete(atResult);
  }, [readDOMToSegments, segmentsToPlainText, onChange, collectTags]);

  // ----- keyboard handling -----

  const autocompleteUiOpen = autocomplete && entityPool.length > 0;

  const handleKeyDown = useCallback(
    (e) => {
      // Only steal keys when the autocomplete popup is actually mounted (needs a non-empty pool).
      // Otherwise @-trigger would block Enter forever when there are zero taggable entities.
      if (autocompleteUiOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Tab')) {
        return; // EntityAutocomplete captures these via document listener
      }
      if (autocomplete && e.key === 'Escape') {
        e.preventDefault();
        setAutocomplete(null);
        return;
      }
      if (autocompleteUiOpen && e.key === 'Enter') {
        return; // Let autocomplete handle Enter for selection
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSubmit?.();
        return;
      }

      if (e.key === 'Backspace') {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        if (!range.collapsed) return;

        const node = range.startContainer;
        const offset = range.startOffset;

        // If caret is right after a tag chip, delete it
        if (node === editorRef.current && offset > 0) {
          const prev = editorRef.current.childNodes[offset - 1];
          if (prev?.dataset?.tagKind) {
            e.preventDefault();
            prev.remove();
            handleInput();
            return;
          }
        }
        // If caret is at position 0 inside a text node, check previous sibling
        if (node.nodeType === Node.TEXT_NODE && offset === 0) {
          const prev = node.previousSibling;
          if (prev?.dataset?.tagKind) {
            e.preventDefault();
            prev.remove();
            handleInput();
            return;
          }
        }
      }
    },
    [onSubmit, handleInput, autocomplete, autocompleteUiOpen],
  );

  // ----- prevent rich-paste -----

  const handlePaste = useCallback(
    (e) => {
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      document.execCommand('insertText', false, text);
    },
    [],
  );

  // ----- imperative: insertTag (declared early — other callbacks reference it) -----

  const insertTag = useCallback(
    (tag) => {
      if (!tag?.kind || !tag?.id || !tag?.name) return;

      let notify = null;

      setSegments((prev) => {
        const existingTags = collectTags(prev);
        if (existingTags.length >= MAX_ENTITY_TAGS) return prev;
        if (existingTags.some((t) => t.kind === tag.kind && t.id === tag.id)) return prev;

        const el = editorRef.current;
        const sel = window.getSelection();
        let insertIndex = prev.length;

        if (el && sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          if (el.contains(range.startContainer)) {
            const caretNode = range.startContainer;
            const caretOffset = range.startOffset;

            if (caretNode === el) {
              insertIndex = caretOffset;
            } else {
              const children = Array.from(el.childNodes);
              const idx = children.indexOf(caretNode.nodeType === Node.TEXT_NODE ? caretNode : caretNode.parentNode);
              if (idx >= 0) {
                if (caretNode.nodeType === Node.TEXT_NODE && caretOffset < caretNode.textContent.length) {
                  let segIdx = 0;
                  let domIdx = 0;
                  for (; segIdx < prev.length; segIdx++) {
                    if (domIdx === idx) break;
                    domIdx++;
                  }
                  const seg = prev[segIdx];
                  if (seg?.type === 'text') {
                    const before = seg.value.slice(0, caretOffset);
                    const after = seg.value.slice(caretOffset);
                    const next = [...prev];
                    next.splice(segIdx, 1,
                      ...(before ? [{ type: 'text', value: before }] : []),
                      { type: 'tag', tag },
                      ...(after ? [{ type: 'text', value: after }] : []),
                    );
                    const text = segmentsToPlainText(next);
                    lastExternalValueRef.current = text;
                    suppressSyncRef.current = true;
                    notify = { text, tags: collectTags(next) };
                    return next;
                  }
                } else {
                  insertIndex = idx + 1;
                }
              }
            }
          }
        }

        const next = [...prev];
        next.splice(insertIndex, 0, { type: 'tag', tag });
        const text = segmentsToPlainText(next);
        lastExternalValueRef.current = text;
        suppressSyncRef.current = true;
        notify = { text, tags: collectTags(next) };
        return next;
      });

      if (notify) {
        onChange?.(notify.text, notify.tags);
      }
    },
    [collectTags, segmentsToPlainText, onChange],
  );

  // ----- autocomplete selection -----

  const handleAutocompleteSelect = useCallback(
    (entity) => {
      setAutocomplete(null);
      const el = editorRef.current;
      if (el) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          const node = range.startContainer;
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent;
            const offset = range.startOffset;
            const atIdx = text.lastIndexOf('@', offset - 1);
            if (atIdx >= 0) {
              node.textContent = text.slice(0, atIdx) + text.slice(offset);
              const newRange = document.createRange();
              newRange.setStart(node, atIdx);
              newRange.collapse(true);
              sel.removeAllRanges();
              sel.addRange(newRange);
            }
          }
        }
      }
      const newSegs = readDOMToSegments();
      setSegments(newSegs);
      insertTag(entity);
    },
    [readDOMToSegments, insertTag],
  );

  const handleAutocompleteClose = useCallback(() => setAutocomplete(null), []);

  // ----- caret → position 0 when empty (before CSS placeholder) -----

  const handleFocus = useCallback(() => {
    onFocusProp?.();
    const el = editorRef.current;
    if (!el || el.textContent) return;
    requestAnimationFrame(() => {
      const sel = window.getSelection();
      if (!sel) return;
      const range = document.createRange();
      range.setStart(el, 0);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    });
  }, [onFocusProp]);

  const handleBlur = useCallback(() => {
    onBlurProp?.();
  }, [onBlurProp]);

  // ----- tag removal via × button -----

  const handleClick = useCallback(
    (e) => {
      const btn = e.target.closest('[data-tag-remove]');
      if (!btn) return;
      const chip = btn.closest('[data-tag-kind]');
      if (chip) {
        chip.remove();
        handleInput();
      }
    },
    [handleInput],
  );

  // ----- imperative API -----

  useImperativeHandle(
    ref,
    () => ({
      insertTag,
      focus: () => editorRef.current?.focus(),
      getText: () => segmentsToPlainText(segments),
      getTags: () => collectTags(segments),
      clear: () => {
        setSegments([{ type: 'text', value: '' }]);
        suppressSyncRef.current = true;
        lastExternalValueRef.current = '';
      },
    }),
    [insertTag, segments, segmentsToPlainText, collectTags],
  );

  // ----- initial DOM render -----

  useEffect(() => {
    const el = editorRef.current;
    if (el && el.childNodes.length === 0) {
      renderSegmentsToDOM(el, segments);
    }
  }, []);

  // ----- dialogue highlight overlay -----

  const plainText = segmentsToPlainText(segments);
  const dialogueSegs = parseActionSegments(autoPlayerTypingText || plainText);
  const hasDialogue = dialogueSegs.some((s) => s.type === 'dialogue');
  const isAutoTyping = !!autoPlayerTypingText;

  return (
    <div ref={wrapperRef} className="relative flex-1 min-w-0">
      {/* Dialogue highlight overlay — contentEditable text is transparent when active */}
      {hasDialogue && !isAutoTyping && (
        <div
          aria-hidden="true"
          className="absolute inset-0 w-full text-sm py-3 px-2 pointer-events-none whitespace-pre-wrap break-words overflow-hidden leading-[1.5]"
        >
          {dialogueSegs.map((seg, i) =>
            seg.type === 'dialogue' ? (
              <span key={i} className="text-yellow-300">{seg.text}</span>
            ) : (
              <span key={i} className="text-on-surface">{seg.text}</span>
            ),
          )}
        </div>
      )}
      {autocomplete && entityPool.length > 0 && (
        <EntityAutocomplete
          query={autocomplete.query}
          pool={entityPool}
          anchorRect={autocomplete.rect}
          containerEl={wrapperRef.current}
          onSelect={handleAutocompleteSelect}
          onClose={handleAutocompleteClose}
        />
      )}
      <div
        ref={editorRef}
        contentEditable={!disabled && !readOnly && !isAutoTyping}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="false"
        data-testid="action-input"
        data-placeholder={placeholder}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onClick={handleClick}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={[
          'relative w-full bg-transparent border-0 border-b-2 focus:ring-0 text-sm py-3 px-2',
          'overflow-hidden transition-all duration-300 leading-[1.5] outline-none',
          'whitespace-pre-wrap break-words min-h-[3em] max-h-[7.5em]',
          disabled ? 'opacity-50' : '',
          hasDialogue && !isAutoTyping ? 'text-transparent caret-[#fffbfe]' : '',
          className,
          '[&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-on-surface-variant/60 [&:empty]:before:pointer-events-none [&:empty]:before:absolute',
        ].filter(Boolean).join(' ')}
      />
    </div>
  );
});

export default TaggableInput;

// ----- DOM helpers -----

function renderSegmentsToDOM(el, segments) {
  el.innerHTML = '';
  for (const seg of segments) {
    if (seg.type === 'text') {
      el.appendChild(document.createTextNode(seg.value));
    } else if (seg.type === 'tag') {
      el.appendChild(buildChipNode(seg.tag));
    }
  }
  const last = el.lastChild;
  if (!last || last.nodeType !== Node.TEXT_NODE) {
    el.appendChild(document.createTextNode(''));
  }
}

function buildChipNode(tag) {
  const colors = TAG_COLORS[tag.kind] || TAG_COLORS.npc;
  const icon = TAG_ICONS[tag.kind] || 'label';

  const chip = document.createElement('span');
  chip.contentEditable = 'false';
  chip.dataset.tagKind = tag.kind;
  chip.dataset.tagId = tag.id;
  chip.dataset.tagName = tag.name;
  if (tag.meta && Object.keys(tag.meta).length > 0) {
    chip.dataset.tagMeta = JSON.stringify(tag.meta);
  }
  chip.className = [
    'inline-flex items-center gap-0.5 px-1.5 py-0.5 mx-0.5 rounded-sm border text-xs font-bold',
    'align-baseline select-none cursor-default whitespace-nowrap',
    colors.bg, colors.text, colors.border,
  ].join(' ');

  const iconEl = document.createElement('span');
  iconEl.className = 'material-symbols-outlined text-[13px] leading-none';
  iconEl.textContent = icon;
  chip.appendChild(iconEl);

  const nameEl = document.createElement('span');
  nameEl.textContent = tag.name;
  chip.appendChild(nameEl);

  const removeBtn = document.createElement('span');
  removeBtn.dataset.tagRemove = '1';
  removeBtn.className = 'ml-0.5 cursor-pointer opacity-60 hover:opacity-100 text-[11px] leading-none';
  removeBtn.textContent = '×';
  chip.appendChild(removeBtn);

  return chip;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extracts the @query text immediately before the caret.
 * Returns { query, rect } if @ trigger is active, or null.
 * `rect` is the DOMRect of the '@' character — used to anchor the popup.
 */
function getAtQuery(el) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !el) return null;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return null;
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return null;
  if (!el.contains(node)) return null;
  const text = node.textContent.slice(0, range.startOffset);
  const atIdx = text.lastIndexOf('@');
  if (atIdx < 0) return null;
  if (atIdx > 0 && !/\s/.test(text[atIdx - 1])) return null;
  const query = text.slice(atIdx + 1);
  if (query.includes(' ')) return null;

  const atRange = document.createRange();
  atRange.setStart(node, atIdx);
  atRange.setEnd(node, atIdx + 1);
  const rect = atRange.getBoundingClientRect();

  return { query, rect };
}
