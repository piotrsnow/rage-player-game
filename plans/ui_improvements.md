# UI Improvements - Lepszy podgląd itemów

## Cel
Ulepszyć wyświetlanie informacji o przedmiotach - pełniejsze dane, hover popup z debounce.

## Obecny stan
- `ItemDetailBox.jsx` - panel szczegółów po kliknięciu itemu (obraz, nazwa, rarity, typ, properties, cena)
- `InventoryImage.jsx` - miniaturka z tooltip preview (360x360px obraz) po najechaniu
- `Tooltip.jsx` - portal-based tooltip, 300ms delay, smart positioning
- `constants.js` - rarity system (kolory, badge'e), typy itemów z ikonami
- Brak informacji o: statystykach bojowych, wymaganiach, porównaniu z equipped item

## Do zrobienia

### 1. Hover popup z debounce
- [ ] Nowy komponent `ItemTooltip` - bogaty popup po najechaniu na item w inventory
- [ ] Debounce ~400ms przed pokazaniem (żeby nie migało przy szybkim przesuwaniu myszy)
- [ ] Popup powinien zawierać: nazwę, rarity badge, typ, kluczowe staty, cenę
- [ ] Smart positioning - nie wychodzi poza viewport
- [ ] Wykorzystać istniejący `Tooltip.jsx` lub rozbudować go

### 2. Pełniejsze informacje o itemach
- [ ] Wyświetlanie statystyk bojowych (damage, armor value, range) z `gameDataService` catalog
- [ ] Wymagania do użycia (min. level umiejętności, min. atrybut)
- [ ] Waga przedmiotu
- [ ] Źródło/origin (skąd item pochodzi - quest, loot, zakup, craft)
- [ ] Flavor text / lore description

### 3. Porównanie z equipped itemem
- [ ] Gdy najedziesz na weapon - pokaż porównanie z aktualnie wyekwipowanym
- [ ] Strzałki góra/dół lub kolory (zielony = lepszy, czerwony = gorszy)
- [ ] Porównanie: damage, armor, special properties

### 4. Usprawnienia wizualne
- [ ] Rarity glow/border na miniaturkach w inventory grid
- [ ] Ikony typu itemu w rogu miniaturki
- [ ] Stack count na itemach stackowalnych
- [ ] Szybki equip/unequip z tooltip poziomu (bez otwierania pełnego detail)

## Pliki do modyfikacji
- `src/components/character/inventory/ItemDetailBox.jsx` - rozbudowa detali
- `src/components/character/inventory/InventoryImage.jsx` - hover popup
- `src/components/ui/Tooltip.jsx` - rozbudowa lub nowy wariant
- `src/components/character/Inventory.jsx` - integracja nowego tooltip
- `src/components/character/inventory/constants.js` - ewentualne nowe stałe
- `src/services/gameDataService.js` - pobieranie pełnych danych o itemach
- Nowy komponent: `ItemTooltip.jsx`
