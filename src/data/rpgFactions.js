// RPGon — Faction Definitions
// System-agnostic faction/reputation data

export const FACTION_DEFINITIONS = {
  merchants_guild: {
    id: 'merchants_guild',
    name: 'Gildia Kupcow',
    icon: 'storefront',
    description: 'Zorganizowana siec kupców, sklepikarzy i domow handlowych',
    effects: {
      allied: 'Najlepsze ceny, ekskluzywne towary, kontakty handlowe',
      friendly: 'Dobre ceny, szerszy asortyment',
      neutral: 'Standardowe ceny i obsluga',
      unfriendly: 'Podwyzszone ceny, ograniczony asortyment',
      hostile: 'Odmowa handlu',
    },
  },
  thieves_guild: {
    id: 'thieves_guild',
    name: 'Gildia Zlodziei',
    icon: 'visibility_off',
    description: 'Swiat przestepczy — paserzy, przemytnicy i zabojcy',
    effects: {
      allied: 'Dostep do czarnego rynku, pasowanie kradzionych towarow, kontakty w podziemiu',
      friendly: 'Mozliwosc pasowania, informacje o sekretach',
      neutral: 'Zostawiony w spokoju',
      unfriendly: 'Drobne kradzieze, nękanie',
      hostile: 'Cel napadow, kontrakty zabojcow',
    },
  },
  temple_sigmar: {
    id: 'temple_sigmar',
    name: 'Swiatynia Sigmara',
    icon: 'church',
    description: 'Dominujaca religia — kaplanow-wojownicy, lowcy czarownic i zeloci',
    effects: {
      allied: 'Leczenie, blogoslawienstwa, azyl, wsparcie lowcow czarownic',
      friendly: 'Tańsze leczenie, nocleg w swiatyni',
      neutral: 'Standardowe uslugi swiatynne',
      unfriendly: 'Obserwowanie z podejrzliwoscia, odmowa uslug',
      hostile: 'Oskarzenie o herezje, aktywne sciganie',
    },
  },
  temple_morr: {
    id: 'temple_morr',
    name: 'Swiatynia Morra',
    icon: 'deceased',
    description: 'Bog smierci i snow — opiekunowie umarlych, widzacy sny',
    effects: {
      allied: 'Ochrona przed nieumarłymi, prorocze sny, rytualy pogrzebowe',
      friendly: 'Uslugi pogrzebowe, wiedza o nieumarłych, interpretacja snow',
      neutral: 'Standardowe rytualy pogrzebowe',
      unfriendly: 'Ostrzezenie przed niepokojeniem umarlych',
      hostile: 'Napietnowanie jako nekromanta, odmowa pochowku',
    },
  },
  military: {
    id: 'military',
    name: 'Wojsko',
    icon: 'shield',
    description: 'Armia, straz miejska i milicja',
    effects: {
      allied: 'Eskorta wojskowa, dostep do broni, kontakty z oficerami',
      friendly: 'Przychylnosc, troche informacji wojskowych',
      neutral: 'Standardowe kontakty z wladza',
      unfriendly: 'Dodatkowa kontrola, przeszukiwanie przy bramach',
      hostile: 'Nakazy aresztowania, zakaz wstepu do miast',
    },
  },
  noble_houses: {
    id: 'noble_houses',
    name: 'Domy Szlacheckie',
    icon: 'castle',
    description: 'Arystokratyczne rodziny rzadzace prowincjami i miastami',
    effects: {
      allied: 'Zaproszenia na dwor, przyslugi polityczne, szlacheckie patronat',
      friendly: 'Audiencja u szlachty, przedstawienia w towarzystwie',
      neutral: 'Ignorowanie przez szlachte',
      unfriendly: 'Wykluczenie towarzyskie, odmowa audiencji',
      hostile: 'Represje polityczne, konfiskata majatku',
    },
  },
  chaos_cults: {
    id: 'chaos_cults',
    name: 'Kulty Chaosu',
    icon: 'whatshot',
    description: 'Tajni wyznawcy Mrocznych Bogow — niebezpieczni i zepsuci',
    effects: {
      allied: 'Mroczne rytualy, mutacje, zakazana wiedza (korupcja!)',
      friendly: 'Informacje o dzialaniach kultow, drobne mroczne przyslugi',
      neutral: 'Nieznany kultom',
      unfriendly: 'Kult probuje zwerbowac lub uciszyc',
      hostile: 'Przeznaczony na ofiarę, aktywnie scigany przez kulty',
    },
  },
  witch_hunters: {
    id: 'witch_hunters',
    name: 'Lowcy Czarownic',
    icon: 'local_fire_department',
    description: 'Zakon Srebrnego Mlota — gorliwi lowcy heretykow i mutantow',
    effects: {
      allied: 'Ochrona przed oskarzeniami, wsparcie sledcze, oczyszczenie',
      friendly: 'Przychylne traktowanie, dostep do zastrzezonej wiedzy',
      neutral: 'Standardowa kontrola',
      unfriendly: 'Pod sledztwa, scisle obserwowanie',
      hostile: 'Aktywnie scigany, oskarzony o czary/herezje',
    },
  },
  wizards_college: {
    id: 'wizards_college',
    name: 'Kolegium Magii',
    icon: 'auto_awesome',
    description: 'Usankcjonowane kolegia magii',
    effects: {
      allied: 'Trening magiczny, zaklete przedmioty, wiedza tajemna',
      friendly: 'Drobne uslugi magiczne, identyfikacja artefaktow',
      neutral: 'Dystans, ale bez wrogosci',
      unfriendly: 'Odmowa uslug magicznych',
      hostile: 'Doniesienie lowcom czarownic jako dzikim magu',
    },
  },
  peasant_folk: {
    id: 'peasant_folk',
    name: 'Prosty Lud',
    icon: 'agriculture',
    description: 'Farmerzy, robotnicy i zwykli mieszkancy',
    effects: {
      allied: 'Darmowy nocleg, lokalna wiedza, ostrzezenia o niebezpieczenstwach',
      friendly: 'Cieple powitanie, plotki, lokalni przewodnicy',
      neutral: 'Ostroznosc, ale uprzejmosc',
      unfriendly: 'Zamkniete drzwi, plotki o tobie',
      hostile: 'Wygnanie z wiosek, agresja tłumu',
    },
  },
};

export const REPUTATION_TIERS = [
  { min: -100, max: -61, tier: 'hostile', label: 'Wrogi', color: 'error' },
  { min: -60, max: -21, tier: 'unfriendly', label: 'Nieprzychylny', color: 'error' },
  { min: -20, max: 20, tier: 'neutral', label: 'Neutralny', color: 'outline' },
  { min: 21, max: 60, tier: 'friendly', label: 'Przyjazny', color: 'primary' },
  { min: 61, max: 100, tier: 'allied', label: 'Sojusznik', color: 'tertiary' },
];

export function getReputationTier(reputation) {
  for (const tier of REPUTATION_TIERS) {
    if (reputation >= tier.min && reputation <= tier.max) {
      return tier.tier;
    }
  }
  return 'neutral';
}

export function getReputationTierData(reputation) {
  for (const tier of REPUTATION_TIERS) {
    if (reputation >= tier.min && reputation <= tier.max) {
      return tier;
    }
  }
  return REPUTATION_TIERS[2];
}

