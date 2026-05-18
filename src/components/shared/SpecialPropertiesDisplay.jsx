import { useSpecialPropertiesLookup } from '../../hooks/useSpecialPropertiesLookup';
import { getSpecialPropertyChipClass } from '../../data/specialPropertyColors';

/**
 * Renders special properties as colored chips with visible descriptions.
 *
 * @param {{ specialProperties: Array<{ id: string }>, compact?: boolean }} props
 */
export default function SpecialPropertiesDisplay({ specialProperties, compact = false, large = false }) {
  const resolved = useSpecialPropertiesLookup(specialProperties);

  if (!resolved || resolved.length === 0) return null;

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1">
        {resolved.map((prop) => (
          <span
            key={prop.id}
            title={prop.description}
            className={`text-[8px] px-1 py-0.5 rounded-sm cursor-default ${getSpecialPropertyChipClass(prop.color)}`}
          >
            {prop.name}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className={`flex flex-col w-full ${large ? 'gap-2 mt-2' : 'gap-1.5 mt-1.5'}`}>
      {resolved.map((prop) => (
        <div
          key={prop.id}
          className={`w-full rounded-sm border cursor-default ${getSpecialPropertyChipClass(prop.color)} ${
            large ? 'px-2.5 py-2' : 'px-1.5 py-1.5'
          }`}
        >
          <div className={`font-headline leading-tight ${large ? 'text-lg' : 'text-sm'}`}>
            {prop.name}
          </div>
          {prop.description && (
            <p
              className={`mt-1 leading-snug opacity-85 font-body normal-case ${
                large ? 'text-xs' : 'text-[10px]'
              }`}
            >
              {prop.description}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
