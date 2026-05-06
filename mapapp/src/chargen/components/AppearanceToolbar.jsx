// AppearanceToolbar — top bar with actor name + tag input + save/delete/
// randomize actions.
//
// Replaces the `<div class="px-4 py-2.5 glass-panel border-b …">` block
// at CharGenPage#295-341 which was a ~45-line flex row with 7 different
// controls. Pulling it into its own component lets CharGenPage focus on
// state wiring and also makes the "Save" CTA more prominent by bumping it
// to `size="lg"`.
//
// Keyboard: Enter in the tag input adds a tag; the underlying TagInput
// primitive handles Backspace-to-delete.

import React from 'react';
import Button from '../../ui/Button.jsx';
import { Input } from '../../ui/Input.jsx';
import Spinner from '../../ui/Spinner.jsx';
import TagInput from '../../ui/TagInput.jsx';

export default function AppearanceToolbar({
  name,
  onNameChange,
  tags,
  onTagsChange,
  onRandomizeAll,
  onSave,
  onDelete,
  saving,
  deleting,
  disabled,
  actorId,
  dirty,
}) {
  const saveLabel = saving
    ? 'Saving…'
    : actorId
      ? (dirty ? 'Update*' : 'Update')
      : (dirty ? 'Save*' : 'Save');

  return (
    <div className="px-4 py-3 glass-panel border-b border-tertiary-dim/20 flex gap-2.5 items-center flex-wrap sticky top-0 z-[1]">
      <Input
        placeholder="Actor name"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        className="!w-[240px]"
        data-tutorial-id="chargen-name"
      />
      <TagInput
        tags={tags}
        onChange={onTagsChange}
        data-tutorial-id="chargen-tags"
        className="flex-1 min-w-[220px]"
      />
      <div className="ml-auto flex gap-1.5 items-center">
        <Button
          disabled={disabled}
          onClick={onRandomizeAll}
          data-tutorial-id="chargen-randomize-all"
        >
          Randomize all
        </Button>
        <Button
          variant="primary"
          size="lg"
          onClick={onSave}
          disabled={saving || deleting}
          data-tutorial-id="chargen-save"
        >
          {saving && <Spinner size={14} color="currentColor" />}
          {saveLabel}
        </Button>
        {actorId && (
          <Button variant="danger" onClick={onDelete} disabled={saving || deleting}>
            {deleting && <Spinner size={12} color="currentColor" />}
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        )}
      </div>
    </div>
  );
}
