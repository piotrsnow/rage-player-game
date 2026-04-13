/**
 * Merge arrays and single items into a deduplicated array.
 *
 * Accepts any mix of arrays, single values, and null/undefined (which are
 * treated as empty). Preserves insertion order of first occurrence.
 *
 *   mergeUnique(a, b)              // two arrays
 *   mergeUnique(arr, item)         // array + single item
 *   mergeUnique(arr, [x, y], z)    // array + array + single item
 *   mergeUnique(null, arr)         // null treated as empty
 */
export function mergeUnique(...args) {
  const flat = [];
  for (const x of args) {
    if (x == null) continue;
    if (Array.isArray(x)) flat.push(...x);
    else flat.push(x);
  }
  return [...new Set(flat)];
}
