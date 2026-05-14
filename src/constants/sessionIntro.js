/** First-visit intro gate — see IntroOverlay + useCampaignLoader resume flow. */
export const INTRO_SEEN_SESSION_KEY = 'rpgon_intro_seen';
export const RESUME_PLAY_CAMPAIGN_SESSION_KEY = 'rpgon_resume_play_campaign_id';

/** Timestamp set when GameplayPage mounts — survives Ctrl+R so main.jsx can
 *  decide whether to keep the /play/:id URL or redirect to lobby.
 *  >=10 s elapsed → stay in campaign; <10 s → treat as fresh deep-link. */
export const PLAY_SESSION_START_KEY = 'rpgon_play_session_start';
