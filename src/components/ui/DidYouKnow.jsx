import { useEffect, useRef, useState } from 'react';

const FACTS = [
  'System RPGon używa kości d50 — rzut 50 to krytyczny sukces, a 1 to krytyczna porażka.',
  'Atrybut Szczęście działa jak procentowa szansa na automatyczny sukces dowolnego rzutu.',
  'W świecie gry obowiązuje trzystopniowy system walutowy: Złota Korona, Srebrna Korona i Miedziana Korona.',
  '1 Złota Korona = 20 Srebrnych Koron = 240 Miedzianych Koron.',
  'Każda postać zaczyna z wartością 1 we wszystkich atrybutach oprócz Szczęścia, które startuje od 0.',
  'System magii oferuje 9 drzew zaklęć — każde zaklęcie kosztuje od 1 do 5 many.',
  'Zaklęcia można nauczyć się wyłącznie ze znalezionych zwojów, nie z levelowania.',
  'Formuła obrażeń to: Siła + broń - Wytrzymałość przeciwnika - pancerz.',
  'W RPGon nie ma klas ani zawodów — tożsamość postaci budują tytuły zdobywane za osiągnięcia.',
  'Istnieje 31 umiejętności, każda powiązana z jednym z 6 atrybutów bazowych.',
  'Świat gry jest współdzielony między kampaniami — decyzje jednego gracza mogą wpłynąć na świat innego.',
  'Stolica świata, Yeralden, jest sercem mapy kanonowej osadzonej na stałej siatce -10..10.',
  'System Living World pozwala NPC-om żyć własnym życiem między sesjami różnych graczy.',
  'Mgła Wojny oznacza, że nowe lokacje odkrywasz dopiero odwiedzając je lub słysząc o nich od NPC.',
  'Każda kampania otrzymuje osady dopasowane do jej długości — krótkie mają mniej miast.',
  'AI nigdy nie tworzy nowych lokacji z powietrza — wszystkie miejsca są albo kanoniczne, albo sandbox.',
  'Generowanie sceny używa dwuetapowej pipeline: model nano wybiera kontekst, premium pisze narrację.',
  'Model nano klasyfikuje intencję gracza zanim cokolwiek trafi do głównego modelu AI.',
  'Kontekst dla AI jest składany równolegle z bazy danych — każda kategoria ładuje się niezależnie.',
  'Cały prompt premium modelu mieści się w 3.5-7k tokenów dzięki upstream caps i kompresji.',
  'Pamięć kampanii jest kompresowana do maksymalnie 15 faktów, co stabilizuje rozmiar promptu.',
  'Rzuty kośćmi są pre-rollowane po stronie backendu (3 wartości d50) jako fallback.',
  'Odpowiedzi AI są zawsze walidowane Zodem przed wysłaniem do frontendu.',
  'Sceny są streamowane przez Server-Sent Events (SSE) — narracja pojawia się w czasie rzeczywistym.',
  'Po każdej scenie uruchamia się asynchroniczna praca: embeddingi, kompresja pamięci, sync NPC.',
  'NPC-e mają indywidualną pamięć — łączą bazę wiedzy kanonicznej z doświadczeniami z tej kampanii.',
  'Embeddingi wektorowe (pgvector) pozwalają AI przeszukiwać historię kampanii semantycznie.',
  'Wyszukiwanie wektorowe używa kosinusowej metryki odległości przez natywne zapytania SQL.',
  'Backend jest jedyną ścieżką komunikacji z AI — frontend nigdy nie łączy się bezpośrednio z OpenAI.',
  'Projekt używa trzech tierów modeli AI: nano (planowanie), standard (rutyna), premium (narracja).',
  'Timeouty LLM są konfigurowalne przez gracza w ustawieniach DM.',
  'System walki używa marginesu sukcesu zamiast Stopni Sukcesu znanych z WFRP.',
  'Postać może mieć aktywne maksymalnie jedno zaklęcie podtrzymywane (concentration).',
  'Mapa świata korzysta z systemu biomów opartych na wielokątach Beziera.',
  'Poruszanie się po świecie skanuje POI w promieniu 250m od ścieżki gracza.',
  'Bariery świata (smok na zachodzie, robaki na północy/południu, ocean na wschodzie) blokują eksplorację.',
  'Każdy NPC w Living World ma sieć znanych lokacji z proweniencją (seed/awans/dialog).',
  'Kampania multiplayer synchronizuje stan przez WebSocket z host-owned architekturą.',
  'Generowanie obrazów scen używa Stable Diffusion z checkpointem DreamShaperXL Turbo.',
  'System craftingu i alchemii pozwala łączyć materiały w nowe przedmioty wg receptur.',
  'Quick Beat ("mała akcja") to lekki tryb RP bez pełnej pipeline sceny — szybki dialog z NPC.',
  'Streak Quick Beatów jest ograniczony do 5 — potem gra wymusza pełną scenę.',
  'AI DM pamięta narracyjne haczyki (pending hooks) i wraca do nich w przyszłych scenach.',
  'Promocja NPC z kampanii do świata kanonicznego wymaga weryfikacji AI (Haiku) + admin review.',
  'System osiągnięć odblokowuje tytuły, które można nosić jako część tożsamości postaci.',
  'Rzemiosło i handel używają dedykowanych silników (craftingEngine, tradeEngine) z własnymi regułami.',
  'Refresh tokeny są przechowywane w Postgresie z automatycznym czyszczeniem co 10 minut.',
  'Idempotency requestów jest zapewniona przez in-memory store z kluczem po stronie backendu.',
  'Sceny kampanii mają embeddingi HNSW indeksowane pgvectorem dla szybkiego wyszukiwania.',
  'Intencja "podróż" rozróżnia trzy tryby: cel nazwany, wektor kierunkowy i nawigację dungeonową.',
];

const ROTATION_INTERVAL_MS = 20_000;

const PHASE_STYLES = {
  visible:  { opacity: 1, transform: 'translateY(0)',    transition: 'opacity 420ms ease, transform 420ms ease' },
  exiting:  { opacity: 0, transform: 'translateY(-6px)', transition: 'opacity 420ms ease, transform 420ms ease' },
  entering: { opacity: 0, transform: 'translateY(6px)',  transition: 'none' },
};

export default function DidYouKnow() {
  const [currentIndex, setCurrentIndex] = useState(() => Math.floor(Math.random() * FACTS.length));
  const [phase, setPhase] = useState('visible');
  const timerRef = useRef(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setPhase('exiting');
      setTimeout(() => {
        setCurrentIndex((prev) => {
          let next;
          do {
            next = Math.floor(Math.random() * FACTS.length);
          } while (next === prev && FACTS.length > 1);
          return next;
        });
        setPhase('entering');
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setPhase('visible'));
        });
      }, 420);
    }, ROTATION_INTERVAL_MS);

    return () => clearInterval(timerRef.current);
  }, []);

  return (
    <div className="w-full max-w-lg mx-auto mt-6 px-4">
      <div
        className="relative rounded-xl p-5"
        style={{
          background: 'rgba(2, 4, 10, 0.85)',
          border: '1px solid rgba(125, 211, 252, 0.3)',
          boxShadow: '0 0 12px rgba(125, 211, 252, 0.07), inset 0 0 12px rgba(125, 211, 252, 0.03)',
        }}
      >

        <div className="relative flex items-start gap-3">
          <span
            className="material-symbols-outlined text-sky-300 text-xl shrink-0 mt-0.5"
            style={{ textShadow: '0 0 12px rgba(125, 211, 252, 0.6)' }}
          >
            auto_awesome
          </span>

          <div className="min-w-0">
            <p
              className="text-xs uppercase tracking-widest font-bold mb-2"
              style={{ color: 'rgba(125, 211, 252, 0.85)', textShadow: '0 0 8px rgba(125, 211, 252, 0.3)' }}
            >
              Czy wiesz, że...?
            </p>
            <p
              className="text-sm leading-relaxed text-sky-100/90"
              style={PHASE_STYLES[phase]}
            >
              {FACTS[currentIndex]}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
