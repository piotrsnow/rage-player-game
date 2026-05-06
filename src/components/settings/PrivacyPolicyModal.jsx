import { useTranslation } from 'react-i18next';
import { useModalA11y } from '../../hooks/useModalA11y';

export default function PrivacyPolicyModal({ onClose }) {
  const { t } = useTranslation();
  const modalRef = useModalA11y(onClose);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('privacy.title')}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={modalRef}
        className="relative w-full max-w-3xl max-h-[90vh] bg-surface-container-highest/80 backdrop-blur-2xl border border-outline-variant/15 rounded-sm flex flex-col shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/15 shrink-0">
          <h2 className="font-headline text-xl text-tertiary flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-dim">shield</span>
            {t('privacy.title')}
          </h2>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="text-on-surface-variant hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="overflow-y-auto custom-scrollbar flex-1 px-6 lg:px-10 py-8">
          <div className="prose prose-invert prose-sm max-w-none space-y-6 text-on-surface-variant text-sm leading-relaxed">
            <p className="text-on-surface-variant/60 text-xs">
              Ostatnia aktualizacja: 6 maja 2026 r.
            </p>

            <Section title="1. Administrator danych osobowych">
              <p>
                Administratorem Twoich danych osobowych jest operator serwisu <strong>Nikczemny Krzemuch</strong> (dalej
                „Serwis"). Kontakt z administratorem: <strong>kontakt@nikczemny-krzemuch.pl</strong>.
              </p>
            </Section>

            <Section title="2. Zakres zbieranych danych">
              <p>
                Serwis zbiera i przetwarza wyłącznie następujące dane osobowe:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Adres e-mail</strong> — używany do logowania, identyfikacji konta oraz komunikacji związanej z płatnościami.</li>
                <li><strong>Hasło</strong> — przechowywane wyłącznie w postaci zahaszowanej (bcrypt); Serwis nie ma dostępu do hasła w formie jawnej.</li>
              </ul>
              <p>
                Serwis <strong>nie zbiera</strong> żadnych innych danych osobowych, w tym: imienia, nazwiska, adresu zamieszkania, numeru telefonu, danych lokalizacyjnych ani danych z urządzeń końcowych wykraczających poza niezbędne pliki cookie sesyjne.
              </p>
            </Section>

            <Section title="3. Cel i podstawa prawna przetwarzania">
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Wykonanie umowy</strong> (art. 6 ust. 1 lit. b RODO) — przetwarzanie adresu e-mail i hasła jest niezbędne do utworzenia i utrzymania konta użytkownika oraz do realizacji płatności za usługi Serwisu.
                </li>
                <li>
                  <strong>Prawnie uzasadniony interes administratora</strong> (art. 6 ust. 1 lit. f RODO) — zapewnienie bezpieczeństwa Serwisu, ochrona przed nadużyciami, prowadzenie logów bezpieczeństwa.
                </li>
              </ul>
            </Section>

            <Section title="4. Odbiorcy danych">
              <p>
                Twoje dane mogą być przekazywane wyłącznie następującym kategoriom podmiotów:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  <strong>Stripe, Inc.</strong> — operator płatności, który przetwarza Twój adres e-mail w celu realizacji transakcji płatniczych. Stripe działa jako niezależny administrator danych w zakresie obsługi płatności, zgodnie z własną polityką prywatności (<a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">stripe.com/privacy</a>).
                </li>
                <li>
                  <strong>Dostawca infrastruktury</strong> (Google Cloud Platform) — w zakresie niezbędnym do hostingu Serwisu. Dane przetwarzane na serwerach zlokalizowanych w UE.
                </li>
              </ul>
              <p>
                Serwis <strong>nie sprzedaje</strong> danych osobowych ani nie udostępnia ich w celach marketingowych podmiotom trzecim.
              </p>
            </Section>

            <Section title="5. Okres przechowywania danych">
              <p>
                Dane osobowe są przechowywane przez okres istnienia konta użytkownika. Po usunięciu konta dane są trwale usuwane z bazy danych w ciągu 30 dni, z wyjątkiem sytuacji, gdy dalsze przechowywanie jest wymagane przepisami prawa (np. dokumentacja podatkowa).
              </p>
            </Section>

            <Section title="6. Prawa użytkownika">
              <p>Na podstawie RODO przysługują Ci następujące prawa:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Dostęp</strong> do swoich danych (art. 15 RODO)</li>
                <li><strong>Sprostowanie</strong> danych (art. 16 RODO)</li>
                <li><strong>Usunięcie</strong> danych — „prawo do bycia zapomnianym" (art. 17 RODO)</li>
                <li><strong>Ograniczenie</strong> przetwarzania (art. 18 RODO)</li>
                <li><strong>Przenoszenie</strong> danych (art. 20 RODO)</li>
                <li><strong>Sprzeciw</strong> wobec przetwarzania (art. 21 RODO)</li>
              </ul>
              <p>
                Aby skorzystać z powyższych praw, skontaktuj się z nami pod adresem: <strong>kontakt@nikczemny-krzemuch.pl</strong>.
              </p>
              <p>
                Masz również prawo wniesienia skargi do organu nadzorczego — <strong>Prezesa Urzędu Ochrony Danych Osobowych</strong> (UODO), ul. Stawki 2, 00-193 Warszawa, <a href="https://uodo.gov.pl" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">uodo.gov.pl</a>.
              </p>
            </Section>

            <Section title="7. Pliki cookie i technologie śledzące">
              <p>
                Serwis wykorzystuje wyłącznie <strong>niezbędne pliki cookie sesyjne</strong> (token JWT) do utrzymania sesji zalogowanego użytkownika. Serwis <strong>nie stosuje</strong> plików cookie analitycznych, reklamowych ani śledzących. Nie korzystamy z Google Analytics, Facebooka Pixel ani żadnych podobnych narzędzi.
              </p>
            </Section>

            <Section title="8. Profilowanie i zautomatyzowane podejmowanie decyzji">
              <p>
                Serwis <strong>nie dokonuje profilowania</strong> użytkowników ani nie podejmuje wobec nich zautomatyzowanych decyzji wywołujących skutki prawne lub w podobny sposób istotnie na nich wpływających w rozumieniu art. 22 RODO.
              </p>
            </Section>

            <Section title="9. Treści generowane przez AI">
              <p>
                Serwis wykorzystuje modele sztucznej inteligencji do generowania treści fabularnych w ramach rozgrywki. Treści te są generowane automatycznie i mają charakter wyłącznie rozrywkowy. Administrator <strong>nie ponosi odpowiedzialności</strong> za treść wygenerowaną przez modele AI, w tym za jej dokładność, adekwatność czy ewentualną obraźliwość. Korzystanie z treści generowanych przez AI odbywa się na własne ryzyko użytkownika.
              </p>
            </Section>

            <Section title="10. Wyłączenie odpowiedzialności">
              <p>
                Serwis jest udostępniany w stanie „takim, jaki jest" (<em>as is</em>), bez jakichkolwiek gwarancji, wyraźnych ani dorozumianych. Administrator dokłada starań, aby Serwis działał poprawnie, jednak <strong>nie gwarantuje</strong> nieprzerwanego dostępu, braku błędów ani pełnego bezpieczeństwa danych transmitowanych przez Internet. Użytkownik korzysta z Serwisu na własną odpowiedzialność.
              </p>
            </Section>

            <Section title="11. Zmiany polityki prywatności">
              <p>
                Administrator zastrzega sobie prawo do zmiany niniejszej polityki prywatności. O wszelkich istotnych zmianach użytkownicy zostaną poinformowani za pośrednictwem Serwisu. Dalsze korzystanie z Serwisu po wprowadzeniu zmian oznacza ich akceptację.
              </p>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section>
      <h3 className="text-base font-semibold text-on-surface mb-2">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
