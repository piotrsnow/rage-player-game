import { formatWeaponCatalog, formatBaseTypeCatalog, searchBestiary } from '../../../data/equipment/index.js';

export function handleGetEquipmentCatalog(category = 'all') {
  const catalog = formatWeaponCatalog(category || 'all');
  const baseTypes = formatBaseTypeCatalog();
  return `${catalog}\n\n${baseTypes}`;
}

export function handleGetBestiary(query) {
  if (!query) return 'Please provide a search query (enemy name, type, or threat level).';
  const result = searchBestiary(query);
  if (!result) {
    return `No bestiary entries found matching "${query}". Try: bandyta, orkowie, gobliny, nieumarli, zwierzeta, demony, trolle, pajaki, krasnoludy, elfy, niziolki, or difficulty: trivial, low, medium, high, deadly.`;
  }
  return result;
}
