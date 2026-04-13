export const TYPE_STYLES = {
  main: 'bg-primary/15 text-primary border-primary/25',
  side: 'bg-tertiary/15 text-tertiary border-tertiary/25',
  personal: 'bg-secondary/15 text-secondary border-secondary/25',
};

export const TYPE_ICONS = {
  main: 'local_fire_department',
  side: 'explore',
  personal: 'person',
};

export function isReadyToTurnIn(quest) {
  return quest.objectives?.length > 0 && quest.objectives.every((o) => o.completed);
}

export function getVisibleObjectives(objectives) {
  if (!objectives?.length) return { visible: [], hiddenCount: 0 };
  const visible = [];
  let foundFirstIncomplete = false;
  for (const obj of objectives) {
    if (obj.completed) {
      visible.push(obj);
    } else if (!foundFirstIncomplete) {
      visible.push(obj);
      foundFirstIncomplete = true;
    }
  }
  return { visible, hiddenCount: objectives.length - visible.length };
}
