import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { useGame } from '../../contexts/GameContext';
import { useNarrator } from '../../hooks/useNarrator';
import { apiClient } from '../../services/apiClient';
import { parseBackendCampaign } from '../../services/storage/campaignParse';
import {
  getDialogueSpeakerLabel,
  filterDuplicateDialogueSegmentsWithIndex,
} from '../../services/dialogueSegments';
import { getPacingStyle } from '../gameplay/chat/pacingStyles';
import { NarrableText } from '../ui/NarrableText';
import {
  HighlightedText,
  NarratorHeaderButtons,
  NarrativeWithLoading,
} from '../gameplay/chat/ChatMessageParts';
import LoadingSpinner from '../ui/LoadingSpinner';

const RECAP_BATCH_SIZE = 20;

function AutoPlayToggle({ autoPlay, onToggle }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
        autoPlay
          ? 'bg-primary/15 border border-primary/40 text-primary'
          : 'bg-surface-container-high border border-outline-variant/20 text-on-surface-variant hover:text-primary hover:border-primary/30'
      }`}
    >
      <span className="material-symbols-outlined text-sm">
        {autoPlay ? 'play_circle' : 'play_disabled'}
      </span>
      {t('reader.autoPlay')}
    </button>
  );
}

function SceneDivider({ index }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-4 py-10">
      <div className="h-px flex-1 bg-gradient-to-r from-transparent to-outline-variant/30" />
      <span className="text-xs font-bold text-on-surface-variant/50 uppercase tracking-widest whitespace-nowrap">
        {t('reader.scene', { n: index + 1 })}
      </span>
      <div className="h-px flex-1 bg-gradient-to-l from-transparent to-outline-variant/30" />
    </div>
  );
}

function isSegmentActive(narrator, messageId, segmentIndex) {
  if (!narrator || narrator.currentMessageId !== messageId) return false;
  return narrator.currentSegmentIndex === segmentIndex;
}

function ActiveSegmentWrapper({ narrator, messageId, segmentIndex, children }) {
  const active = isSegmentActive(narrator, messageId, segmentIndex);
  const ref = useRef(null);

  useEffect(() => {
    if (active && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [active]);

  return (
    <div
      ref={ref}
      data-reader-seg={`${messageId}_${segmentIndex}`}
      className={`rounded-md transition-all duration-500 ${
        active
          ? 'bg-primary/[0.07] shadow-[inset_0_0_0_1px_rgba(149,71,247,0.15)] -mx-3 px-3 py-2'
          : ''
      }`}
    >
      {children}
    </div>
  );
}

function ReaderNarrative({ narrative, segments, narrator, messageId, scenePacing }) {
  const { t } = useTranslation();
  const sourceSegments = Array.isArray(segments) ? segments : [];
  const visibleSegments = filterDuplicateDialogueSegmentsWithIndex(sourceSegments, narrative);
  const hasDialogue = visibleSegments.some((s) => s?.type === 'dialogue');
  const shouldRenderSegments = visibleSegments.length > 0 && hasDialogue;

  if (shouldRenderSegments) {
    return (
      <div className="space-y-4">
        {visibleSegments.map((seg, i) => {
          const logicalIndex = Number.isInteger(seg?._logicalSegmentIndex) ? seg._logicalSegmentIndex : i;
          if (seg.type === 'dialogue') {
            const speaker = getDialogueSpeakerLabel(seg, t('reader.npc'));
            return (
              <ActiveSegmentWrapper key={i} narrator={narrator} messageId={messageId} segmentIndex={logicalIndex}>
                <div className="group/seg pl-5 border-l-2 border-tertiary-dim/40">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs font-bold text-tertiary uppercase tracking-wider">
                      {speaker}
                    </span>
                  </div>
                  <NarrableText
                    text={seg.text}
                    narrator={narrator}
                    messageId={messageId}
                    segmentIndex={logicalIndex}
                    seg={seg}
                    scenePacing={scenePacing}
                    className="flex items-start gap-0.5"
                    as="div"
                  >
                    <p className="text-base text-on-surface leading-relaxed flex-1">
                      &ldquo;<HighlightedText
                        text={seg.text}
                        highlightInfo={narrator?.highlightInfo}
                        segmentIndex={logicalIndex}
                        messageId={messageId}
                      />&rdquo;
                    </p>
                  </NarrableText>
                </div>
              </ActiveSegmentWrapper>
            );
          }
          return (
            <ActiveSegmentWrapper key={i} narrator={narrator} messageId={messageId} segmentIndex={logicalIndex}>
              <NarrativeWithLoading narrator={narrator} messageId={messageId} segmentIndex={logicalIndex}>
                <NarrableText
                  text={seg.text}
                  narrator={narrator}
                  messageId={messageId}
                  segmentIndex={logicalIndex}
                  scenePacing={scenePacing}
                  className="flex items-start gap-0.5"
                  as="div"
                >
                  <p className="text-base text-on-surface-variant leading-relaxed italic flex-1 whitespace-pre-line">
                    <HighlightedText
                      text={seg.text}
                      highlightInfo={narrator?.highlightInfo}
                      segmentIndex={logicalIndex}
                      messageId={messageId}
                    />
                  </p>
                </NarrableText>
              </NarrativeWithLoading>
            </ActiveSegmentWrapper>
          );
        })}
      </div>
    );
  }

  if (!narrative) return null;

  return (
    <ActiveSegmentWrapper narrator={narrator} messageId={messageId} segmentIndex={0}>
      <NarrativeWithLoading narrator={narrator} messageId={messageId} segmentIndex={0}>
        <NarrableText
          text={narrative}
          narrator={narrator}
          messageId={messageId}
          segmentIndex={0}
          scenePacing={scenePacing}
          className="flex items-start gap-0.5"
          as="div"
        >
          <p className="text-base text-on-surface-variant leading-relaxed italic flex-1 whitespace-pre-line">
            <HighlightedText
              text={narrative}
              highlightInfo={narrator?.highlightInfo}
              segmentIndex={0}
              messageId={messageId}
            />
          </p>
        </NarrableText>
      </NarrativeWithLoading>
    </ActiveSegmentWrapper>
  );
}

function SceneBlock({ scene, index, narrator, message }) {
  const { t } = useTranslation();
  const pacing = getPacingStyle(scene.scenePacing);
  const imageUrl = scene.imageUrl || scene.image || null;

  const diceRolls = Array.isArray(scene.diceRolls) && scene.diceRolls.length > 0
    ? scene.diceRolls
    : (scene.diceRoll ? [scene.diceRoll] : []);

  return (
    <article>
      <SceneDivider index={index} />

      {scene.chosenAction && (
        <div className="mb-8 px-6 py-5 rounded-lg border border-tertiary/20 bg-tertiary/[0.04]">
          <div className="text-[10px] font-bold text-tertiary uppercase tracking-widest mb-2">
            {t('reader.playerAction')}
          </div>
          <p className="text-base text-on-surface leading-relaxed">{scene.chosenAction}</p>
        </div>
      )}

      {diceRolls.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {diceRolls.map((dr, i) => {
            if (!dr || typeof dr !== 'object') return null;
            const label = dr.margin !== undefined
              ? `${dr.skill || '?'}: ${dr.total ?? dr.roll} vs ${dr.threshold ?? dr.target ?? dr.dc} (margines ${dr.margin ?? 0})`
              : `${dr.skill || '?'}: ${dr.roll} / ${dr.target || dr.dc} (SL ${dr.sl ?? 0})`;
            return (
              <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-container-high text-xs text-on-surface-variant border border-outline-variant/20">
                <span className="material-symbols-outlined text-sm text-primary-dim">casino</span>
                {label}
              </span>
            );
          })}
        </div>
      )}

      {imageUrl && (
        <div className="mb-8 rounded-lg overflow-hidden border border-outline-variant/10 shadow-lg">
          <img
            src={apiClient.resolveMediaUrl(imageUrl)}
            alt=""
            loading="lazy"
            className="w-full h-auto"
          />
        </div>
      )}

      <div className={`relative rounded-lg px-6 py-5 border-l-2 ${pacing.border} ${pacing.bg}`}>
        <div className="absolute bottom-2 right-3 pointer-events-none select-none">
          <span className={`material-symbols-outlined text-[48px] leading-none ${pacing.iconColor}`}>
            {pacing.icon}
          </span>
        </div>

        <div className="flex items-center justify-end mb-3">
          <NarratorHeaderButtons
            message={message}
            narrator={narrator}
            activeAccentClass="text-primary"
            idleHoverClass="hover:text-primary"
          />
        </div>

        <ReaderNarrative
          narrative={scene.narrative || ''}
          segments={scene.dialogueSegments}
          narrator={narrator}
          messageId={message.id}
          scenePacing={scene.scenePacing || 'exploration'}
        />
      </div>
    </article>
  );
}

function CampaignHeader({ campaign, character }) {
  return (
    <header className="text-center py-16 space-y-4">
      <h1 className="text-4xl font-headline text-on-surface tracking-tight">
        {campaign?.name || 'Untitled'}
      </h1>
      <div className="flex items-center justify-center gap-3">
        {campaign?.genre && (
          <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold border border-primary/20">
            {campaign.genre}
          </span>
        )}
        {campaign?.tone && (
          <span className="px-3 py-1 rounded-full bg-tertiary/10 text-tertiary-dim text-xs font-bold border border-tertiary/20">
            {campaign.tone}
          </span>
        )}
      </div>
      {character?.name && (
        <p className="text-on-surface-variant text-base">
          {character.name}
          {character.species ? ` · ${character.species}` : ''}
        </p>
      )}
    </header>
  );
}

function buildSceneMessages(scenes) {
  return scenes.map((scene, i) => ({
    id: scene.id || `reader_scene_${i}`,
    role: 'dm',
    content: scene.narrative || '',
    dialogueSegments: scene.dialogueSegments || [],
    scenePacing: scene.scenePacing || 'exploration',
    soundEffect: scene.soundEffect || null,
  }));
}

function RecapContent({ recapText, narrator }) {
  const recapMessage = useMemo(() => ({
    id: 'reader_recap',
    role: 'dm',
    content: recapText,
    dialogueSegments: [],
    scenePacing: 'exploration',
    soundEffect: null,
  }), [recapText]);

  return (
    <div className="relative rounded-lg px-6 py-5 border-l-2 border-amber-400/40 bg-amber-400/[0.04]">
      <div className="flex items-center justify-end mb-3">
        <NarratorHeaderButtons
          message={recapMessage}
          narrator={narrator}
          activeAccentClass="text-amber-300"
          idleHoverClass="hover:text-amber-300"
        />
      </div>
      <ActiveSegmentWrapper narrator={narrator} messageId="reader_recap" segmentIndex={0}>
        <NarrativeWithLoading narrator={narrator} messageId="reader_recap" segmentIndex={0}>
          <NarrableText
            text={recapText}
            narrator={narrator}
            messageId="reader_recap"
            segmentIndex={0}
            scenePacing="exploration"
            className="flex items-start gap-0.5"
            as="div"
          >
            <p className="text-base text-on-surface-variant leading-relaxed italic flex-1 whitespace-pre-line">
              <HighlightedText
                text={recapText}
                highlightInfo={narrator?.highlightInfo}
                segmentIndex={0}
                messageId="reader_recap"
              />
            </p>
          </NarrableText>
        </NarrativeWithLoading>
      </ActiveSegmentWrapper>
    </div>
  );
}

function RecapGeneratePanel({ scenes, campaignId, language, onRecapReady }) {
  const { t } = useTranslation();
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState(null);
  const [genPartial, setGenPartial] = useState('');
  const [genProgress, setGenProgress] = useState(null);
  const [optMode, setOptMode] = useState('story');
  const [optSentences, setOptSentences] = useState(1);

  const generate = useCallback(async () => {
    setGenLoading(true);
    setGenError(null);
    setGenPartial('');
    setGenProgress(null);

    const summaryStyle = { mode: optMode, literaryStyle: 50, dramaticity: 50, factuality: 50, dialogueParticipants: 3 };
    const batches = [];
    for (let i = 0; i < scenes.length; i += RECAP_BATCH_SIZE) {
      batches.push(scenes.slice(i, i + RECAP_BATCH_SIZE));
    }
    if (batches.length === 0) batches.push([]);

    try {
      const partials = [];
      for (let i = 0; i < batches.length; i++) {
        setGenProgress({ current: i + 1, total: batches.length });
        const data = await apiClient.post('/ai/generate-recap', {
          scenes: batches[i],
          language: language || 'pl',
          sentencesPerScene: optSentences,
          summaryStyle,
        });
        const text = typeof data?.result?.recap === 'string' ? data.result.recap : '';
        partials.push(text);
        setGenPartial(partials.filter(Boolean).join('\n\n'));
      }

      const finalText = partials.filter(Boolean).join('\n\n');
      if (!finalText) {
        setGenError(t('reader.generateError'));
        setGenLoading(false);
        return;
      }

      const cacheKey = `reader_full_${scenes.length}_${optMode}_${optSentences}`;
      try {
        await apiClient.post(`/campaigns/${campaignId}/recaps`, {
          key: cacheKey,
          recap: finalText,
          meta: { totalScenes: scenes.length, sentencesPerScene: optSentences, language: language || 'pl', summaryStyle },
        });
      } catch { /* save is best-effort */ }

      onRecapReady(finalText, { totalScenes: scenes.length });
    } catch (err) {
      setGenError(err?.message || t('reader.generateError'));
    } finally {
      setGenLoading(false);
      setGenProgress(null);
    }
  }, [scenes, campaignId, language, optMode, optSentences, onRecapReady, t]);

  return (
    <div className="rounded-lg border border-amber-400/20 bg-amber-400/[0.03] p-5 space-y-4">
      <div className="flex items-center gap-2 text-amber-300">
        <span className="material-symbols-outlined text-lg">auto_awesome</span>
        <span className="text-xs font-bold uppercase tracking-widest">{t('reader.generateSummary')}</span>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-on-surface-variant/70 uppercase tracking-widest whitespace-nowrap">
            {t('reader.summaryType')}
          </label>
          <select
            value={optMode}
            onChange={(e) => setOptMode(e.target.value)}
            disabled={genLoading}
            className="bg-surface-container-high border border-outline-variant/20 rounded-md text-xs text-on-surface px-2 py-1 min-w-[100px]"
          >
            <option value="story">{t('reader.modeStory')}</option>
            <option value="dialogue">{t('reader.modeDialogue')}</option>
            <option value="poem">{t('reader.modePoem')}</option>
            <option value="report">{t('reader.modeReport')}</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-[10px] text-on-surface-variant/70 uppercase tracking-widest whitespace-nowrap">
            {t('reader.sentencesPerScene')}
          </label>
          <input
            type="range"
            min={0.25} max={4} step={0.25}
            value={optSentences}
            onChange={(e) => setOptSentences(Number(e.target.value))}
            disabled={genLoading}
            className="w-24 h-6 appearance-none mana-slider bg-transparent cursor-ew-resize"
          />
          <span className="text-[10px] text-primary/80 font-label min-w-[36px] text-right">{optSentences.toFixed(2)}x</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={generate}
          disabled={genLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-amber-400/15 border border-amber-400/30 text-xs font-medium text-amber-300 hover:bg-amber-400/25 transition-all disabled:opacity-50"
        >
          <span className={`material-symbols-outlined text-sm ${genLoading ? 'animate-spin' : ''}`}>
            {genLoading ? 'progress_activity' : 'auto_awesome'}
          </span>
          {genLoading
            ? genProgress
              ? t('reader.generatingBatch', { current: genProgress.current, total: genProgress.total })
              : t('reader.generating')
            : t('reader.generateSummary')}
        </button>
      </div>

      {genError && (
        <p className="text-xs text-error">{genError}</p>
      )}

      {genPartial && genLoading && (
        <div className="rounded-md bg-surface-container-low/60 border border-outline-variant/15 p-4">
          <p className="text-sm text-on-surface-variant italic whitespace-pre-line opacity-70">{genPartial}</p>
        </div>
      )}
    </div>
  );
}

function ModeToggle({ showRecap, hasRecap, canGenerate, onToggle, autoPlay, onAutoPlayToggle }) {
  const { t } = useTranslation();
  const showSummaryButton = hasRecap || canGenerate;
  return (
    <div className="flex items-center justify-center gap-3 mb-8 flex-wrap">
      {showSummaryButton && (
        <button
          type="button"
          onClick={onToggle}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            showRecap
              ? 'bg-amber-400/15 border border-amber-400/40 text-amber-300'
              : 'bg-surface-container-high border border-outline-variant/20 text-on-surface-variant hover:text-amber-300 hover:border-amber-400/30'
          }`}
        >
          <span className="material-symbols-outlined text-sm">summarize</span>
          {t('reader.summary')}
        </button>
      )}
      <AutoPlayToggle autoPlay={autoPlay} onToggle={onAutoPlayToggle} />
    </div>
  );
}

export default function CampaignReaderPage() {
  const { campaignId, shareToken } = useParams();
  const { t } = useTranslation();
  const { settings } = useSettings();
  const { dispatch } = useGame();
  const loadedRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [campaign, setCampaign] = useState(null);
  const [character, setCharacter] = useState(null);
  const [scenes, setScenes] = useState([]);
  const [autoPlay, setAutoPlay] = useState(false);
  const [recapText, setRecapText] = useState(null);
  const [recapMeta, setRecapMeta] = useState(null);
  const [showRecap, setShowRecap] = useState(false);

  const viewerBackendUrl = apiClient.getBaseUrl() || settings.backendUrl || window.location.origin;
  const narrator = useNarrator(
    shareToken
      ? { viewerMode: true, shareToken, backendUrl: viewerBackendUrl }
      : undefined,
  );

  const fetchCampaign = useCallback(async () => {
    if (loadedRef.current) return;

    const base = apiClient.getBaseUrl() || settings.backendUrl || window.location.origin;
    if (!base) {
      setError(t('reader.backendRequired'));
      setLoading(false);
      return;
    }

    try {
      let raw;
      let fetchedCampaignId = null;
      if (shareToken) {
        const res = await fetch(`${base}/v1/campaigns/share/${shareToken}`);
        if (!res.ok) { setError(t('reader.notFound')); setLoading(false); return; }
        raw = await res.json();
        fetchedCampaignId = raw.id;
      } else if (campaignId) {
        raw = await apiClient.get(`/campaigns/${campaignId}`);
        fetchedCampaignId = campaignId;
      } else {
        setError(t('reader.notFound'));
        setLoading(false);
        return;
      }

      const parsed = parseBackendCampaign(raw);
      loadedRef.current = true;

      dispatch({ type: 'LOAD_CAMPAIGN', payload: parsed });

      setCampaign(parsed.campaign || { name: raw.name, genre: raw.genre, tone: raw.tone });
      setCharacter(parsed.character || null);
      setScenes(parsed.scenes || []);

      if (fetchedCampaignId) {
        try {
          let recapRes;
          if (shareToken) {
            const r = await fetch(`${base}/v1/campaigns/share/${shareToken}/recaps/best`);
            recapRes = r.ok ? await r.json() : null;
          } else {
            recapRes = await apiClient.get(`/campaigns/${fetchedCampaignId}/recaps/best`);
          }
          if (recapRes?.found && recapRes.recap) {
            setRecapText(recapRes.recap);
            setRecapMeta(recapRes.meta || null);
          }
        } catch { /* recap is optional */ }
      }
    } catch {
      setError(t('reader.notFound'));
    } finally {
      setLoading(false);
    }
  }, [campaignId, shareToken, t, dispatch]);

  useEffect(() => { fetchCampaign(); }, [fetchCampaign]);

  const messages = useMemo(() => buildSceneMessages(scenes), [scenes]);

  const prevPlaybackRef = useRef(narrator.playbackState);
  const handleRecapReady = useCallback((text, meta) => {
    setRecapText(text);
    setRecapMeta(meta);
  }, []);

  useEffect(() => {
    const prev = prevPlaybackRef.current;
    prevPlaybackRef.current = narrator.playbackState;

    if (!autoPlay) return;
    const IDLE = narrator.STATES?.IDLE;
    if (!IDLE) return;
    if (narrator.playbackState !== IDLE || prev === IDLE) return;

    const finishedId = narrator.currentMessageId;
    if (!finishedId || showRecap) return;

    const idx = messages.findIndex((m) => m.id === finishedId);
    if (idx < 0 || idx >= messages.length - 1) return;

    const next = messages[idx + 1];
    setTimeout(() => {
      narrator.speakSingle(next, next.id);

      const el = document.querySelector(`[data-reader-scene="${next.id}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 600);
  }, [narrator.playbackState, narrator.currentMessageId, narrator.STATES, autoPlay, showRecap, messages, narrator]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner size="lg" text={t('reader.loading')} />
      </div>
    );
  }

  if (error || scenes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <span className="material-symbols-outlined text-6xl text-outline/30">
          {error ? 'link_off' : 'auto_stories'}
        </span>
        <p className="text-on-surface-variant text-lg">
          {error || t('reader.noScenes')}
        </p>
        <Link to="/" className="text-primary hover:text-primary/80 text-sm underline underline-offset-4">
          {t('reader.goHome')}
        </Link>
      </div>
    );
  }

  const isAuthenticated = !shareToken && !!campaignId;
  const recapSceneCount = Number(recapMeta?.totalScenes) || 0;
  const canGenerate = isAuthenticated && (!recapText || scenes.length > recapSceneCount);

  return (
    <div className="max-w-3xl mx-auto px-4 pb-24">
      <CampaignHeader campaign={campaign} character={character} />

      <ModeToggle
        showRecap={showRecap}
        hasRecap={!!recapText}
        canGenerate={canGenerate}
        onToggle={() => setShowRecap((v) => !v)}
        autoPlay={autoPlay}
        onAutoPlayToggle={() => setAutoPlay((v) => !v)}
      />

      {showRecap ? (
        <>
          {canGenerate && (
            <div className="mb-6">
              <RecapGeneratePanel
                scenes={scenes}
                campaignId={campaignId}
                language={settings.language}
                onRecapReady={handleRecapReady}
              />
            </div>
          )}
          {recapText && <RecapContent recapText={recapText} narrator={narrator} />}
        </>
      ) : (
        scenes.map((scene, i) => (
          <div key={scene.id || i} data-reader-scene={messages[i].id}>
            <SceneBlock
              scene={scene}
              index={i}
              narrator={narrator}
              message={messages[i]}
            />
          </div>
        ))
      )}

      {narrator.playbackState !== narrator.STATES?.IDLE && (
        <div className="fixed bottom-6 right-6 z-50">
          <button
            type="button"
            onClick={narrator.stop}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-surface-container-highest border border-outline-variant/30 text-on-surface-variant hover:text-error shadow-xl transition-colors"
          >
            <span className="material-symbols-outlined text-sm">stop</span>
          </button>
        </div>
      )}
    </div>
  );
}
