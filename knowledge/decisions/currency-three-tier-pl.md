# Currency: Three-Tier PL

Waluta w RPGon ma trzy denominacje, wszystkie pod wspólnym mianownikiem `Korona`.

## Denominacje
| Nazwa | Skrót | Kod techniczny |
| --- | --- | --- |
| Złota Korona | `ZK` | `gold` |
| Srebrna Korona | `SK` | `silver` |
| Miedziana Korona | `MK` | `copper` |

## Kursy wymiany
- `1 ZK = 20 SK = 240 MK`
- `1 SK = 12 MK`

## Reguły implementacji
- **Kody techniczne** (`gold`, `silver`, `copper`) zostają niezmienione w danych — wszystkie istniejące kampanie i ich zapisane sakwy działają bez migracji.
- **Etykiety w UI** zawsze przez locale: `currency.goldShort`, `currency.silverShort`, `currency.copperShort`. Twarde literały typu `"GC"` w komponentach to bug.
- **Format wyświetlania**: `${value} ${t('currency.goldShort')}` itd. — nigdy nie mieszamy kodu z labelem.

Pełna definicja: [RPG_SYSTEM.md §10](../../../RPG_SYSTEM.md).

Powiązane: [[../concepts/rpgon-system]]
