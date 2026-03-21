import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGame } from '../../contexts/GameContext';
import StatsGrid from './StatsGrid';
import Inventory from './Inventory';
import QuestLog from './QuestLog';
import StatusBar from '../ui/StatusBar';

export default function CharacterSheet() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { state } = useGame();
  const { character, campaign, quests } = state;

  if (!character || !campaign) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] px-6">
        <span className="material-symbols-outlined text-6xl text-outline/20 mb-4">person_off</span>
        <h2 className="font-headline text-2xl text-tertiary mb-2">{t('character.noActiveCharacter')}</h2>
        <p className="text-on-surface-variant text-sm mb-8">
          {t('character.noActiveDescription')}
        </p>
        <button
          onClick={() => navigate('/')}
          className="px-8 py-3 bg-surface-tint text-on-primary font-bold text-xs uppercase tracking-widest rounded-sm"
        >
          {t('character.goToLobby')}
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-10 py-12 max-w-7xl mx-auto">
      {/* Character Header */}
      <div className="mb-12 relative animate-fade-in">
        <h1 className="text-4xl md:text-5xl font-headline text-tertiary mb-2 drop-shadow-[0_2px_4px_rgba(197,154,255,0.1)]">
          {character.name}
        </h1>
        <div className="flex items-center gap-4 text-on-surface-variant font-label text-sm uppercase tracking-[0.2em]">
          <span>
            {character.class}
          </span>
          <span className="w-1 h-1 bg-primary rounded-full" />
          <span>{t('common.level')} {character.level}</span>
          <span className="w-1 h-1 bg-primary rounded-full" />
          <span>{character.xp} {t('common.xp')}</span>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Portrait & Vitals */}
        <div className="lg:col-span-3 space-y-6 animate-fade-in">
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-tr from-primary-dim to-primary opacity-20 blur-xl group-hover:opacity-30 transition duration-500" />
            <div className="relative bg-surface-container-high border border-outline-variant/15 p-1 rounded-sm overflow-hidden">
              <div className="w-full aspect-[3/4] bg-gradient-to-br from-surface-container to-surface-container-lowest flex items-center justify-center">
                <span className="material-symbols-outlined text-8xl text-outline/20">person</span>
              </div>
              <div className="absolute bottom-0 left-0 w-full p-4 bg-gradient-to-t from-surface-dim to-transparent">
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-tertiary font-headline text-lg">{t('character.inspiration')}</p>
                    <div className="flex gap-1 mt-1">
                      <span className="w-4 h-4 bg-primary rounded-full shadow-[0_0_6px_rgba(197,154,255,0.6)]" />
                      <span className="w-4 h-4 bg-surface-container rounded-full border border-outline-variant/30" />
                    </div>
                  </div>
                  <p className="text-primary font-headline text-2xl">LVL {character.level}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Vitals */}
          <div className="bg-surface-container-low p-6 border border-outline-variant/10 rounded-sm">
            <h3 className="text-tertiary font-headline mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">auto_fix_high</span>
              {t('character.vitals')}
            </h3>
            <div className="space-y-4">
              <StatusBar label={t('character.healthPoints')} current={character.hp} max={character.maxHp} color="error" />
              <StatusBar label={t('character.manaPool')} current={character.mana} max={character.maxMana} color="primary" />
            </div>
          </div>
        </div>

        {/* Center: Stats */}
        <div className="lg:col-span-5 animate-fade-in">
          <StatsGrid stats={character.stats} />
        </div>

        {/* Right: Inventory */}
        <div className="lg:col-span-4 animate-fade-in">
          <Inventory items={character.inventory} />
        </div>
      </div>

      {/* Bottom: Backstory & Quests */}
      <div className="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in">
        {/* Backstory */}
        <section className="bg-surface-container-low p-8 rounded-sm border border-outline-variant/15 relative">
          <div className="absolute top-0 right-0 p-4">
            <span className="material-symbols-outlined text-primary-dim text-sm opacity-50">
              psychology
            </span>
          </div>
          <h3 className="text-2xl font-headline text-tertiary mb-6">{t('character.origins')}</h3>
          <div className="text-on-surface-variant font-body leading-relaxed text-sm">
            {character.backstory || (
              <p className="italic text-outline">
                {t('character.originsEmpty')}
              </p>
            )}
          </div>
        </section>

        {/* Quest Log */}
        <QuestLog active={quests.active} completed={quests.completed} />
      </div>
    </div>
  );
}
