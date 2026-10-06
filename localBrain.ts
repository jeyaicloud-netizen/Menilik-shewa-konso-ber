import { ChatMessage } from '../types';

export interface LocalAudioMatch {
  audioUrl: string;
  replyText: string;
}

export interface LearnedSamplePattern {
  id: string;
  speakDurationMs: number;
  pauseBeforeSendMs: number;
  totalTurnMs: number;
  avgVoicePeak: number;
  burstCount: number;
  voiceSignature?: number[];
  pitchDropRatio?: number;
  weight?: number;
  category?: 'ፈጣን' | 'መካከለኛ' | 'ረጅም';
  utteranceText?: string;
  timestamp: string;
}

export interface StepLearnedProfile {
  stepKey: string;
  sampleCount: number;
  avgSpeakDurationMs: number;
  avgPauseBeforeSendMs: number;
  avgTotalTurnMs: number;
  avgVoicePeak: number;
  learnedUtterances: string[];
  patterns?: LearnedSamplePattern[];
  lastUpdated: string;
}

export interface ClassStepRecord {
  stepKey: string;
  turnIndex: number;
  totalTurnMs: number;
  speakDurationMs: number;
  pauseBeforeSendMs: number;
  avgVoicePeak: number;
  voiceSignature?: number[];
  utteranceText?: string;
}

export interface LearnedTrainingClass {
  id: string;
  classNumber: number;
  name: string;
  steps: Record<string, ClassStepRecord>;
  turnSequence: ClassStepRecord[];
  createdAt: string;
}

export interface SelfLearningMemory {
  version: string;
  totalSamples: number;
  noiseFloorEstimate: number;
  steps: Record<string, StepLearnedProfile>;
}

const LOCAL_BRAIN_STORAGE_KEY = 'cbe_trained_brain_v2';
const SELF_LEARNING_STORAGE_KEY = 'cbe_self_learning_memory_v2';
const LEARNED_CLASSES_STORAGE_KEY = 'cbe_learned_classes_v1';
const AUDIO_CACHE_NAME = 'cbe-audio-mp3-cache-v2';

// List of all 16+ recorded MP3 files to cache locally on the phone
export const ALL_CBE_MP3_FILES = [
  '/audio/cbe951.mp3',
  '/audio/edris_greeting.mp3',
  '/audio/sew_abrot_nw.mp3',
  '/audio/yerson_account.mp3',
  '/audio/cbebirr_call_number.mp3',
  '/audio/phone_number.mp3',
  '/audio/eshe_interjection.mp3',
  '/audio/full_name.mp3',
  '/audio/amount_sent.mp3',
  '/audio/recipient_name.mp3',
  '/audio/recipient_account.mp3',
  '/audio/checking_hold.mp3',
  '/audio/sent_successfully.mp3',
  '/audio/money_deposited.mp3',
  '/audio/system_issue_24h.mp3',
  '/audio/thank_you_questions.mp3',
  '/audio/survey_rating.mp3',
];

// In-memory Blob URL map for 0ms instant offline/local playback
const blobUrlCache = new Map<string, string>();

// Default timing priors per dialogue step (refined automatically as user taps "✓ ላክ")
const DEFAULT_STEP_TIMINGS: Record<
  string,
  { speakMs: number; pauseMs: number }
> = {
  step_1_transfer: { speakMs: 5500, pauseMs: 1450 },
  step_2_together: { speakMs: 2200, pauseMs: 1200 },
  step_3_account: { speakMs: 3200, pauseMs: 1250 },
  step_4_cbebirr: { speakMs: 1200, pauseMs: 1000 },
  step_5_phone_pair: { speakMs: 850, pauseMs: 850 },
  step_6_fullname: { speakMs: 2400, pauseMs: 1200 },
  step_7_amount: { speakMs: 1500, pauseMs: 1100 },
  step_8_recipient_name: { speakMs: 2200, pauseMs: 1200 },
  step_9_recipient_acc: { speakMs: 4200, pauseMs: 1350 },
  step_10_hold: { speakMs: 1200, pauseMs: 1000 },
  step_11_sent_ok: { speakMs: 2800, pauseMs: 1250 },
  step_12_deposited: { speakMs: 4500, pauseMs: 1350 },
  step_13_system_24h: { speakMs: 3200, pauseMs: 1250 },
  step_14_more_questions: { speakMs: 1800, pauseMs: 1100 },
};

// Training dataset rules saved into LocalStorage for offline & zero-latency execution
export const TRAINED_DATASET_RULES = {
  version: '2.0',
  trainedAt: new Date().toISOString(),
  steps: [
    {
      step: 0,
      audioUrl: '/audio/edris_greeting.mp3',
      replyText: 'የኢትዮጵያ ንግድ ባንክ እድሪስ ነኝ ባኳ ምን ልርዳወት',
      expectedUserText:
        'ገንዘብ አስተላልፌ ነበር እና ከኔ አካውንት ባላንስ ላይ ቆርጧል ሜሴጅም ገብቶልኛል ግን ሰውየው ጋ ሜሴጅ አልደረሰውም እና ባላንሱም ላይ አልደመረለትም',
    },
    {
      step: 1,
      audioUrl: '/audio/sew_abrot_nw.mp3',
      replyText: 'ገንዘቡ የተላከለት ሰው አጠገቦት ነው ገንዘቡ እንዳልደረሰው እንዴት አወቁ',
      expectedUserText: 'አብሮኝ ነው እዚህ አሁን እቃ ገዝቼ ነበር',
    },
    {
      step: 2,
      audioUrl: '/audio/yerson_account.mp3',
      replyText: 'አጠገቦት ናቸው እሽ የእርሶን የሂሳብ ይንገሩኝ',
      expectedUserText: 'አዎ አጠገቤ ናቸው የሂሳብ ቁጥር ነው ያልከኝ እኔ ሲቢኢ ብር ነው የምጠቀመው',
    },
    {
      step: 3,
      audioUrl: '/audio/cbebirr_call_number.mp3',
      replyText: 'እርሶ ሲቢኢ ብር የሚጠቀሙት አሁን የደወሉበት ነው',
      expectedUserText: 'እሺ አዎ',
    },
    {
      step: 4,
      audioUrl: '/audio/phone_number.mp3',
      replyText: 'እሽ ይንገሩኝ ስልክ ቁጥሮትን',
      expectedUserText: '09',
    },
    {
      step: 5,
      audioUrl: '/audio/eshe_interjection.mp3',
      replyText: 'እሽ',
      expectedUserText: '59 / 84 / 28 / 29',
    },
    {
      step: 6,
      audioUrl: '/audio/full_name.mp3',
      replyText: 'ስም እስከ አያት',
      expectedUserText: 'ጁሩይጅ አብዱል መናል ሁሴን',
    },
    {
      step: 7,
      audioUrl: '/audio/amount_sent.mp3',
      replyText: 'ስንት ብር ላኩ ደንበኛችን',
      expectedUserText: '5000 ብር',
    },
    {
      step: 8,
      audioUrl: '/audio/recipient_name.mp3',
      replyText: 'ለማን ብለው ነበር የላኩት',
      expectedUserText: 'ታሪኩ ደርጉ ቶላ',
    },
    {
      step: 9,
      audioUrl: '/audio/recipient_account.mp3',
      replyText: 'እሽ እርሶ የላኩላቸው ደንበኛ አካዉንት ቁጥር ይንገሩኝ',
      expectedUserText: '10001112131415',
    },
    {
      step: 10,
      audioUrl: '/audio/checking_hold.mp3',
      replyText: 'በማጣራት ላይ ነኝ እባኮትን ደንበኛችን አንዴ በመስመር ላይ ይጠብቁኝ',
      expectedUserText: 'እጠብቃለሁ',
    },
    {
      step: 11,
      audioUrl: '/audio/sent_successfully.mp3',
      replyText: 'ገንዘቡ በትክክል ተልኳል ደንበኛችን',
      expectedUserText: 'ገብቷል ገንዘቡ? እና እሱ ጋ ለምን አልደረሰም? ገንዘቡ ገብቷል እርግጠኛ ነህ?',
    },
    {
      step: 12,
      audioUrl: '/audio/money_deposited.mp3',
      replyText: 'ገንዘቡ ገብቷል',
      expectedUserText:
        'እሺ እና ለምን ነው እሱ አካውንት ላይ ያልደመረው? 889 ላይ ቼክ አድርገን ነበር ቀሪ ባላንሱ ላይ መደመር ነበረበት እኮ አሁን ምን ይሻላል?',
    },
    {
      step: 13,
      audioUrl: '/audio/system_issue_24h.mp3',
      replyText:
        'ወደ ተላከለት ደንበኛ ስልክ ወይም አካዉንት ሜሴጅ ያልደረሰው ወይም ቀሪ ሂሳቡ ላይ የተላከለት ገንዘብ ያልጨመረው አንዳንዴ በባንኩ ሲስተም መጨናነቅ እና የሲስተም ችግር እንደዚህ አይነት ነገር ስለሚገጥም ነው እና ገንዘቡ በአየር ላይ ስለሚሆን ነው ገንዘቡ ወደተላከለት ደንበኛ በ24 ሰአት ውስጥ ገቢ ይሆናል',
      expectedUserText:
        'እሺ በ24 ሰዓት ውስጥ ይደርሳል አይ በቃ ሲስተም ነው እንጂ ብሩ ገብቷል በ24 ሰዓት ይደርስሃል እንጂ እኔ ልኬያለሁ',
    },
    {
      step: 14,
      audioUrl: '/audio/thank_you_questions.mp3',
      replyText: 'ስለደወሉ እናመሰግናለን ደንበኛችን ሌላ ጥያቄ አለወት',
      expectedUserText: 'ሌላ ጥያቄ የለኝም እሺ እናመሰግናለን',
    },
    {
      step: 15,
      audioUrl: '/audio/survey_rating.mp3',
      replyText: 'እሽ ስለ አገልግሎት አስተዳደር ቀጣይ ያሉትን መሙያ ይሙሉ ስለደወሉ እናመሰግናለን',
      expectedUserText: '',
    },
  ],
};

/**
 * Loads the Self-Learning Memory from LocalStorage (or creates a fresh one)
 */
export function loadSelfLearningMemory(): SelfLearningMemory {
  try {
    const raw = localStorage.getItem(SELF_LEARNING_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.steps) {
        return parsed as SelfLearningMemory;
      }
    }
  } catch (e) {
    console.warn('Failed to load self-learning memory:', e);
  }
  return {
    version: '2.0',
    totalSamples: 0,
    noiseFloorEstimate: 6,
    steps: {},
  };
}

/**
 * Saves the Self-Learning Memory to LocalStorage
 */
export function saveSelfLearningMemory(mem: SelfLearningMemory): void {
  try {
    localStorage.setItem(SELF_LEARNING_STORAGE_KEY, JSON.stringify(mem));
  } catch (e) {
    console.warn('Failed to save self-learning memory:', e);
  }
}

/**
 * Identifies the current dialogue step key based on conversation history
 */
export function getCurrentStepKey(history: ChatMessage[]): string {
  const lastModelMsg = [...history].reverse().find((h) => h.role === 'model');
  const url = lastModelMsg?.audioUrl || '';
  const text = lastModelMsg?.text || '';

  if (url.includes('edris_greeting') || text.includes('ምን ልርዳወት')) {
    return 'step_1_transfer';
  }
  if (url.includes('sew_abrot_nw') || text.includes('አጠገቦት ነው')) {
    return 'step_2_together';
  }
  if (url.includes('yerson_account') || text.includes('የእርሶን የሂሳብ')) {
    return 'step_3_account';
  }
  if (url.includes('cbebirr_call_number') || text.includes('አሁን የደወሉበት ነው')) {
    return 'step_4_cbebirr';
  }
  if (
    url.includes('phone_number') ||
    url.includes('eshe_interjection') ||
    text.includes('ስልክ ቁጥሮትን') ||
    text === 'እሽ'
  ) {
    return 'step_5_phone_pair';
  }
  if (url.includes('full_name') || text.includes('ስም እስከ አያት')) {
    return 'step_6_fullname';
  }
  if (url.includes('amount_sent') || text.includes('ስንት ብር ላኩ')) {
    return 'step_7_amount';
  }
  if (url.includes('recipient_name') || text.includes('ለማን ብለው')) {
    return 'step_8_recipient_name';
  }
  if (url.includes('recipient_account') || text.includes('ደንበኛ አካዉንት ቁጥር')) {
    return 'step_9_recipient_acc';
  }
  if (url.includes('checking_hold') || text.includes('በማጣራት ላይ ነኝ')) {
    return 'step_10_hold';
  }
  if (url.includes('sent_successfully') || text.includes('በትክክል ተልኳል')) {
    return 'step_11_sent_ok';
  }
  if (url.includes('money_deposited') || text.includes('ገንዘቡ ገብቷል')) {
    return 'step_12_deposited';
  }
  if (url.includes('system_issue_24h') || text.includes('የሲስተም ችግር')) {
    return 'step_13_system_24h';
  }
  if (url.includes('thank_you_questions') || text.includes('ሌላ ጥያቄ አለወት')) {
    return 'step_14_more_questions';
  }
  return 'step_1_transfer';
}

/**
 * Automatically categorizes (ከፋፍሎ) all taught patterns for a step into 3 groups:
 * ፈጣን (Fast), መካከለኛ (Medium), and ረጅም (Slow/Deliberate) based on their recorded seconds
 */
function categorizeStepPatterns(patterns: LearnedSamplePattern[]): void {
  if (patterns.length === 0) return;
  if (patterns.length === 1) {
    const p = patterns[0];
    p.category = p.pauseBeforeSendMs <= 1150 ? 'ፈጣን' : p.pauseBeforeSendMs <= 2000 ? 'መካከለኛ' : 'ረጅም';
    return;
  }

  const sortedByScore = [...patterns].sort(
    (a, b) => a.pauseBeforeSendMs + a.speakDurationMs * 0.4 - (b.pauseBeforeSendMs + b.speakDurationMs * 0.4)
  );
  const n = sortedByScore.length;
  sortedByScore.forEach((pat, rank) => {
    if (rank < Math.ceil(n / 3)) {
      pat.category = 'ፈጣን';
    } else if (rank < Math.ceil((2 * n) / 3)) {
      pat.category = 'መካከለኛ';
    } else {
      pat.category = 'ረጅም';
    }
  });
}

/**
 * Records a learned turn (Voice Signature + Seconds) into LocalStorage whenever the user presses "💾 መዝግብ" or "✓ ላክ"
 */
export function recordLearnedTurnTimingAndUtterance(params: {
  history: ChatMessage[];
  speakDurationMs: number;
  pauseBeforeSendMs: number;
  totalTurnMs: number;
  avgVoicePeak: number;
  burstCount?: number;
  voiceSignature?: number[];
  noiseFloor: number;
  utteranceText?: string;
}): SelfLearningMemory {
  const mem = loadSelfLearningMemory();
  const stepKey = getCurrentStepKey(params.history);
  const defaults = DEFAULT_STEP_TIMINGS[stepKey] || { speakMs: 2200, pauseMs: 1200 };

  const existing: StepLearnedProfile = mem.steps[stepKey] || {
    stepKey,
    sampleCount: 0,
    avgSpeakDurationMs: defaults.speakMs,
    avgPauseBeforeSendMs: defaults.pauseMs,
    avgTotalTurnMs: defaults.speakMs + defaults.pauseMs,
    avgVoicePeak: 28,
    learnedUtterances: [],
    patterns: [],
    lastUpdated: new Date().toISOString(),
  };

  if (!Array.isArray(existing.patterns)) {
    existing.patterns = [];
  }

  // Store the exact timing & voice signature taught by the user without fake time caps!
  const actualSpeak = Math.max(200, Math.round(params.speakDurationMs || defaults.speakMs));
  const actualPause = Math.max(250, Math.round(params.pauseBeforeSendMs || defaults.pauseMs));
  const actualTotal = Math.max(450, Math.round(params.totalTurnMs || actualSpeak + actualPause));
  const actualPeak = Math.max(8, Math.min(100, Math.round(params.avgVoicePeak || 28)));
  const actualBursts = Math.max(1, Math.round(params.burstCount || Math.ceil(actualSpeak / 650)));

  const newPattern: LearnedSamplePattern = {
    id: `pat_${Date.now()}_${existing.patterns.length + 1}`,
    speakDurationMs: actualSpeak,
    pauseBeforeSendMs: actualPause,
    totalTurnMs: actualTotal,
    avgVoicePeak: actualPeak,
    burstCount: actualBursts,
    voiceSignature: params.voiceSignature,
    utteranceText: params.utteranceText,
    timestamp: new Date().toISOString(),
  };

  existing.patterns.push(newPattern);
  if (existing.patterns.length > 50) {
    existing.patterns.shift();
  }

  // Automatically partition/categorize (ከፋፍሎ) all taught patterns for this step
  categorizeStepPatterns(existing.patterns);

  const count = existing.sampleCount;
  const alpha = count === 0 ? 1.0 : Math.max(0.25, 1 / (count + 1));
  existing.avgSpeakDurationMs = Math.round(
    existing.avgSpeakDurationMs * (1 - alpha) + actualSpeak * alpha
  );
  existing.avgPauseBeforeSendMs = Math.round(
    existing.avgPauseBeforeSendMs * (1 - alpha) + actualPause * alpha
  );
  existing.avgTotalTurnMs = Math.round(
    existing.avgTotalTurnMs * (1 - alpha) + actualTotal * alpha
  );
  existing.avgVoicePeak = Math.round(existing.avgVoicePeak * (1 - alpha) + actualPeak * alpha);
  existing.sampleCount = existing.patterns.length;
  existing.lastUpdated = new Date().toISOString();

  if (params.utteranceText && params.utteranceText.trim().length > 1) {
    const cleanText = params.utteranceText.trim();
    if (!existing.learnedUtterances.includes(cleanText)) {
      existing.learnedUtterances.push(cleanText);
      if (existing.learnedUtterances.length > 30) {
        existing.learnedUtterances.shift();
      }
    }
  }

  mem.steps[stepKey] = existing;
  mem.totalSamples = Object.values(mem.steps).reduce(
    (sum, s) => sum + (s.patterns?.length || s.sampleCount || 0),
    0
  );
  if (params.noiseFloor > 0) {
    mem.noiseFloorEstimate = Math.round(mem.noiseFloorEstimate * 0.7 + params.noiseFloor * 0.3);
  }

  saveSelfLearningMemory(mem);
  return mem;
}

/**
 * Saves a newly learned phrase for the current step when user types or uses Gboard
 */
export function recordLearnedUtteranceOnly(history: ChatMessage[], utteranceText: string): void {
  if (!utteranceText || utteranceText.trim().length < 2) return;
  const mem = loadSelfLearningMemory();
  const stepKey = getCurrentStepKey(history);
  const defaults = DEFAULT_STEP_TIMINGS[stepKey] || { speakMs: 2200, pauseMs: 1200 };

  const existing = mem.steps[stepKey] || {
    stepKey,
    sampleCount: 0,
    avgSpeakDurationMs: defaults.speakMs,
    avgPauseBeforeSendMs: defaults.pauseMs,
    avgTotalTurnMs: defaults.speakMs + defaults.pauseMs,
    avgVoicePeak: 28,
    learnedUtterances: [],
    lastUpdated: new Date().toISOString(),
  };

  const cleanText = utteranceText.trim();
  if (!existing.learnedUtterances.includes(cleanText)) {
    existing.learnedUtterances.push(cleanText);
    if (existing.learnedUtterances.length > 30) {
      existing.learnedUtterances.shift();
    }
  }
  existing.sampleCount += 1;
  existing.lastUpdated = new Date().toISOString();
  mem.steps[stepKey] = existing;
  mem.totalSamples = (mem.totalSamples || 0) + 1;
  saveSelfLearningMemory(mem);
}

/**
 * Real-Time Nearest-Neighbor Pattern Matcher ("የትኛውን በየትኛው ሰዓት መጠቀም እንዳለበት ማሰብ"):
 * Compares the caller's live speaking duration, syllable bursts, and vocal energy against ALL
 * stored training patterns for this step in LocalStorage (e.g. 1.0s pattern vs 2.0s pattern vs 2.5s pattern),
 * and selects the exact learned timing that matches how the current person is speaking right now!
 */
export function matchLiveSpeechToLearnedPattern(params: {
  history: ChatMessage[];
  liveSpeakDurationMs: number;
  liveVoicePeak: number;
  liveBurstCount: number;
  liveVoiceSignature?: number[];
  isFallingTone?: boolean;
}): {
  selectedPauseMs: number;
  selectedSpeakMs: number;
  matchedPatternIndex: number;
  matchedCategory: string;
  totalPatternsForStep: number;
  allStepPausesLabel: string;
  stepKey: string;
} {
  const mem = loadSelfLearningMemory();
  const stepKey = getCurrentStepKey(params.history);
  const learned = mem.steps[stepKey];
  const defaults = DEFAULT_STEP_TIMINGS[stepKey] || { speakMs: 2000, pauseMs: 1100 };

  const patterns = learned?.patterns || [];
  // Prosody adjustment: if voice tone is still flat/rising (mid-sentence), give 300ms extra breathing room;
  // if voice tone clearly dropped (end-of-turn falling pitch), respond right on time!
  const prosodyOffsetMs = params.isFallingTone === false ? 300 : 0;

  if (patterns.length > 0) {
    let bestIdx = 0;
    let bestScore = Infinity;

    for (let i = 0; i < patterns.length; i++) {
      const p = patterns[i];
      // 1. Compare speaking seconds (duration)
      const speakDiff =
        Math.abs(p.speakDurationMs - params.liveSpeakDurationMs) /
        Math.max(350, p.speakDurationMs);
      // 2. Compare word/syllable bursts
      const burstDiff =
        Math.abs((p.burstCount || 2) - params.liveBurstCount) /
        Math.max(2, p.burstCount || 2);
      // 3. Compare vocal peak loudness
      const peakDiff = Math.abs((p.avgVoicePeak || 28) - params.liveVoicePeak) / 45;

      // 4. Compare 8-band voice frequency signature (ድምፁን) if available
      let sigDiff = 0;
      if (
        p.voiceSignature &&
        params.liveVoiceSignature &&
        p.voiceSignature.length === params.liveVoiceSignature.length &&
        p.voiceSignature.length > 0
      ) {
        let sumSq = 0;
        for (let b = 0; b < p.voiceSignature.length; b++) {
          const d = (p.voiceSignature[b] - params.liveVoiceSignature[b]) / 100;
          sumSq += d * d;
        }
        sigDiff = Math.sqrt(sumSq / p.voiceSignature.length);
      }

      // Apply reinforcement weight bonus for patterns confirmed with "👍 ልክ ነው"
      const weightBonus = Math.min(0.25, ((p.weight || 1) - 1) * 0.05);
      const score =
        speakDiff * 0.50 + sigDiff * 0.25 + burstDiff * 0.15 + peakDiff * 0.10 - weightBonus;
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    const chosen = patterns[bestIdx];
    const allPauses = patterns
      .slice(-6)
      .map((p, idx) => `#${idx + 1}(${p.category || 'መካከለኛ'}:${(p.pauseBeforeSendMs / 1000).toFixed(1)}s)`)
      .join(' | ');

    return {
      selectedPauseMs: Math.max(250, chosen.pauseBeforeSendMs + prosodyOffsetMs),
      selectedSpeakMs: chosen.speakDurationMs,
      matchedPatternIndex: bestIdx + 1,
      matchedCategory: chosen.category || 'መካከለኛ',
      totalPatternsForStep: patterns.length,
      allStepPausesLabel: allPauses,
      stepKey,
    };
  }

  if (learned && learned.sampleCount > 0) {
    return {
      selectedPauseMs: Math.max(250, learned.avgPauseBeforeSendMs + prosodyOffsetMs),
      selectedSpeakMs: learned.avgSpeakDurationMs,
      matchedPatternIndex: 1,
      matchedCategory: 'መካከለኛ',
      totalPatternsForStep: learned.sampleCount,
      allStepPausesLabel: `${(learned.avgPauseBeforeSendMs / 1000).toFixed(1)}s`,
      stepKey,
    };
  }

  return {
    selectedPauseMs: defaults.pauseMs + prosodyOffsetMs,
    selectedSpeakMs: defaults.speakMs,
    matchedPatternIndex: 0,
    matchedCategory: 'Default',
    totalPatternsForStep: 0,
    allStepPausesLabel: `${(defaults.pauseMs / 1000).toFixed(1)}s (Default)`,
    stepKey,
  };
}

/**
 * Reinforcement Learning Feedback ("🐢 ፈጠንክ" / "👍 ልክ ነው" / "⚡ ዘገየህ"):
 * Adjusts the learned timing or boosts the confidence weight in LocalStorage when the user gives feedback!
 */
export function applyReinforcementFeedback(params: {
  history: ChatMessage[];
  feedback: 'too_fast' | 'good' | 'too_slow';
  patternIndex?: number;
}): { updatedPauseMs: number; message: string } {
  const mem = loadSelfLearningMemory();
  // Apply to the most recent user turn's step (or current step if at start)
  const prevHistory =
    params.history.length >= 2 ? params.history.slice(0, -2) : params.history;
  const stepKey = getCurrentStepKey(prevHistory);
  const defaults = DEFAULT_STEP_TIMINGS[stepKey] || { speakMs: 2000, pauseMs: 1100 };

  const existing: StepLearnedProfile = mem.steps[stepKey] || {
    stepKey,
    sampleCount: 1,
    avgSpeakDurationMs: defaults.speakMs,
    avgPauseBeforeSendMs: defaults.pauseMs,
    avgTotalTurnMs: defaults.speakMs + defaults.pauseMs,
    avgVoicePeak: 28,
    learnedUtterances: [],
    patterns: [
      {
        id: `pat_${Date.now()}_1`,
        speakDurationMs: defaults.speakMs,
        pauseBeforeSendMs: defaults.pauseMs,
        totalTurnMs: defaults.speakMs + defaults.pauseMs,
        avgVoicePeak: 28,
        burstCount: 2,
        weight: 1,
        category: 'መካከለኛ',
        timestamp: new Date().toISOString(),
      },
    ],
    lastUpdated: new Date().toISOString(),
  };

  if (!Array.isArray(existing.patterns) || existing.patterns.length === 0) {
    existing.patterns = [
      {
        id: `pat_${Date.now()}_1`,
        speakDurationMs: existing.avgSpeakDurationMs || defaults.speakMs,
        pauseBeforeSendMs: existing.avgPauseBeforeSendMs || defaults.pauseMs,
        totalTurnMs: existing.avgTotalTurnMs || defaults.speakMs + defaults.pauseMs,
        avgVoicePeak: existing.avgVoicePeak || 28,
        burstCount: 2,
        weight: 1,
        category: 'መካከለኛ',
        timestamp: new Date().toISOString(),
      },
    ];
  }

  const targetIdx =
    params.patternIndex && params.patternIndex > 0 && params.patternIndex <= existing.patterns.length
      ? params.patternIndex - 1
      : existing.patterns.length - 1;
  const targetPattern = existing.patterns[targetIdx];

  if (params.feedback === 'too_fast') {
    // AI interrupted too fast -> increase pause wait by +400ms
    targetPattern.pauseBeforeSendMs = Math.min(8000, targetPattern.pauseBeforeSendMs + 400);
    existing.avgPauseBeforeSendMs = Math.min(8000, existing.avgPauseBeforeSendMs + 350);
  } else if (params.feedback === 'too_slow') {
    // AI waited too long -> decrease pause wait by -350ms
    targetPattern.pauseBeforeSendMs = Math.max(250, targetPattern.pauseBeforeSendMs - 350);
    existing.avgPauseBeforeSendMs = Math.max(250, existing.avgPauseBeforeSendMs - 300);
  } else {
    // "👍 ልክ ነው" -> reinforce & boost weight of this pattern!
    targetPattern.weight = (targetPattern.weight || 1) + 2;
  }

  categorizeStepPatterns(existing.patterns);
  existing.lastUpdated = new Date().toISOString();
  mem.steps[stepKey] = existing;
  saveSelfLearningMemory(mem);

  const sec = (targetPattern.pauseBeforeSendMs / 1000).toFixed(1);
  const msg =
    params.feedback === 'too_fast'
      ? `🐢 ተስተካከለ! የመጠበቂያ ሰዓቱ ወደ ${sec}s ከፍ ብሏል`
      : params.feedback === 'too_slow'
        ? `⚡ ተስተካከለ! የመጠበቂያ ሰዓቱ ወደ ${sec}s ፈጥኗል`
        : `👍 በጣም ጥሩ! መንገድ #${targetIdx + 1} (${sec}s) ተጠናክሮ ተይዟል`;

  return { updatedPauseMs: targetPattern.pauseBeforeSendMs, message: msg };
}

/**
 * Returns summary statistics of what the LocalStorage Brain has learned so far,
 * including all distinct learned timing patterns and their categories for the current step!
 */
export function getLocalLearningSummary(history: ChatMessage[]): {
  totalSamples: number;
  totalLearnedPhrases: number;
  currentStepSamples: number;
  currentStepPauseMs: number;
  currentStepSpeakMs: number;
  currentStepTotalTurnMs: number;
  currentStepPatternsLabel: string;
  currentStepPatterns: LearnedSamplePattern[];
} {
  const mem = loadSelfLearningMemory();
  const stepKey = getCurrentStepKey(history);
  const stepProfile = mem.steps[stepKey];
  const defaults = DEFAULT_STEP_TIMINGS[stepKey] || { speakMs: 2000, pauseMs: 1200 };

  let totalLearnedPhrases = 0;
  let totalPatterns = 0;
  Object.values(mem.steps).forEach((s) => {
    totalLearnedPhrases += s.learnedUtterances?.length || 0;
    totalPatterns += s.patterns?.length || s.sampleCount || 0;
  });

  const patterns = stepProfile?.patterns || [];
  const patternsLabel =
    patterns.length > 0
      ? patterns
          .slice(-5)
          .map((p, i) => `#${i + 1}:${(p.pauseBeforeSendMs / 1000).toFixed(1)}s`)
          .join(' | ')
      : `${((stepProfile?.avgPauseBeforeSendMs || defaults.pauseMs) / 1000).toFixed(1)}s`;

  return {
    totalSamples: totalPatterns || mem.totalSamples || 0,
    totalLearnedPhrases,
    currentStepSamples: patterns.length || stepProfile?.sampleCount || 0,
    currentStepPauseMs: stepProfile?.avgPauseBeforeSendMs || defaults.pauseMs,
    currentStepSpeakMs: stepProfile?.avgSpeakDurationMs || defaults.speakMs,
    currentStepTotalTurnMs:
      stepProfile?.avgTotalTurnMs || defaults.speakMs + defaults.pauseMs,
    currentStepPatternsLabel: patternsLabel,
    currentStepPatterns: patterns,
  };
}

export const NAMED_SPEAKER_CLASSES: Array<{ id: string; classNumber: number; name: string }> = [
  { id: 'class_jurey', classNumber: 1, name: 'Jurey' },
  { id: 'class_tariku', classNumber: 2, name: 'Tariku' },
  { id: 'class_abebe', classNumber: 3, name: 'Abebe' },
  { id: 'class_abdu', classNumber: 4, name: 'Abdu' },
  { id: 'class_bereket', classNumber: 5, name: 'Bereket' },
  { id: 'class_sewbehone', classNumber: 6, name: 'Sewbehone' },
  { id: 'class_ramid', classNumber: 7, name: 'Ramid' },
  { id: 'class_ahmed', classNumber: 8, name: 'Ahmed' },
];

/**
 * Loads all 8 Named Speaker Classes (Jurey, Tariku, Abebe, Abdu, Bereket, Sewbehone, Ramid, Ahmed) from LocalStorage
 */
export function loadLearnedClasses(): LearnedTrainingClass[] {
  let stored: LearnedTrainingClass[] = [];
  try {
    const raw = localStorage.getItem(LEARNED_CLASSES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        stored = parsed as LearnedTrainingClass[];
      }
    }
  } catch (e) {
    console.warn('Failed to load learned classes:', e);
  }

  // Merge stored data with the 8 permanent named speaker classes
  const merged: LearnedTrainingClass[] = NAMED_SPEAKER_CLASSES.map((preset) => {
    const found =
      stored.find((c) => c.id === preset.id) ||
      stored.find((c) => c.name.toLowerCase() === preset.name.toLowerCase());
    if (found) {
      return {
        ...found,
        id: preset.id,
        classNumber: preset.classNumber,
        name: preset.name,
        steps: found.steps || {},
        turnSequence: Array.isArray(found.turnSequence) ? found.turnSequence : [],
      };
    }
    return {
      id: preset.id,
      classNumber: preset.classNumber,
      name: preset.name,
      steps: {},
      turnSequence: [],
      createdAt: new Date().toISOString(),
    };
  });

  return merged;
}

/**
 * Saves the array of LearnedTrainingClass to LocalStorage
 */
export function saveLearnedClassesList(classes: LearnedTrainingClass[]): void {
  try {
    localStorage.setItem(LEARNED_CLASSES_STORAGE_KEY, JSON.stringify(classes));
  } catch (e) {
    console.warn('Failed to save learned classes:', e);
  }
}

/**
 * Appends/updates a single step turn directly into the currently selected Speaker Class (e.g. Jurey) in LocalStorage
 */
export function appendStepToSpeakerClass(
  targetClassId: string | null,
  stepRec: ClassStepRecord
): LearnedTrainingClass[] {
  const allClasses = loadLearnedClasses();
  const idToUse = targetClassId || 'class_jurey';
  const target = allClasses.find((c) => c.id === idToUse) || allClasses[0];

  if (target) {
    target.turnSequence[stepRec.turnIndex] = stepRec;
    // Filter out any undefined holes if user jumped steps
    target.turnSequence = target.turnSequence.filter(Boolean);
    target.steps[`${stepRec.stepKey}_${stepRec.turnIndex}`] = stepRec;
    target.steps[stepRec.stepKey] = stepRec;
    target.createdAt = new Date().toISOString();
    saveLearnedClassesList(allClasses);
  }
  return allClasses;
}

/**
 * Saves an entire full-call training session into the selected Named Speaker Class
 * (Jurey, Tariku, Abebe, Abdu, Bereket, Sewbehone, Ramid, or Ahmed) when the user clicks "💾 ሙሉ ለሙሉ ጨረስኩ"!
 */
export function saveFullLearnedClass(
  draftTurns: ClassStepRecord[],
  targetClassId?: string | null
): {
  savedClass: LearnedTrainingClass;
  allClasses: LearnedTrainingClass[];
} {
  const allClasses = loadLearnedClasses();
  const idToUse = targetClassId || 'class_jurey';
  const target = allClasses.find((c) => c.id === idToUse) || allClasses[0];

  if (draftTurns.length > 0) {
    const stepsMap: Record<string, ClassStepRecord> = {};
    draftTurns.forEach((t, idx) => {
      stepsMap[`${t.stepKey}_${idx}`] = t;
      stepsMap[t.stepKey] = t;
    });
    target.steps = stepsMap;
    target.turnSequence = [...draftTurns];
    target.createdAt = new Date().toISOString();
  }

  saveLearnedClassesList(allClasses);
  return { savedClass: target, allClasses };
}

/**
 * Resets/clears the recorded steps of a specific Named Speaker Class in LocalStorage
 */
export function deleteLearnedClass(classId: string): LearnedTrainingClass[] {
  const allClasses = loadLearnedClasses().map((c) =>
    c.id === classId
      ? { ...c, steps: {}, turnSequence: [], createdAt: new Date().toISOString() }
      : c
  );
  saveLearnedClassesList(allClasses);
  return allClasses;
}

/**
 * Retrieves the exact learned step timing for the currently selected Class (Class 1 .. Class 10)
 * during 🧪 Test Mode!
 */
export function getStepTimingFromSelectedClass(params: {
  selectedClassId: string | null;
  history: ChatMessage[];
  liveSpeakDurationMs?: number;
  liveVoicePeak?: number;
  liveVoiceSignature?: number[];
}): {
  totalTurnMs: number;
  pauseBeforeSendMs: number;
  speakDurationMs: number;
  className: string;
  turnNumber: number;
} {
  const classes = loadLearnedClasses();
  const stepKey = getCurrentStepKey(params.history);
  const userTurnIndex = params.history.filter((h) => h.role === 'user').length;
  const defaults = DEFAULT_STEP_TIMINGS[stepKey] || { speakMs: 2000, pauseMs: 1100 };

  let targetClass: LearnedTrainingClass | undefined;

  if (params.selectedClassId && params.selectedClassId !== 'auto') {
    targetClass = classes.find((c) => c.id === params.selectedClassId);
  }

  // If 'auto' or no specific class selected, pick the closest matching Class from Class 1..10
  if (!targetClass && classes.length > 0) {
    if (params.liveSpeakDurationMs && params.liveSpeakDurationMs > 0) {
      let bestScore = Infinity;
      for (const cls of classes) {
        const rec = cls.turnSequence[userTurnIndex] || cls.steps[stepKey];
        if (rec) {
          const diff = Math.abs(rec.speakDurationMs - params.liveSpeakDurationMs);
          if (diff < bestScore) {
            bestScore = diff;
            targetClass = cls;
          }
        }
      }
    }
    if (!targetClass) {
      targetClass = classes[classes.length - 1];
    }
  }

  if (targetClass) {
    // First match exact turn sequence index (handles all 5 phone pairs 09, 59, 84, 28, 29 in exact order!),
    // or fallback to stepKey within that Class
    const exactTurnRec =
      targetClass.turnSequence[userTurnIndex] || targetClass.steps[stepKey];
    if (exactTurnRec) {
      return {
        totalTurnMs: Math.max(600, exactTurnRec.totalTurnMs),
        pauseBeforeSendMs: Math.max(300, exactTurnRec.pauseBeforeSendMs),
        speakDurationMs: Math.max(250, exactTurnRec.speakDurationMs),
        className: targetClass.name,
        turnNumber: userTurnIndex + 1,
      };
    }
  }

  // Fallback to general pattern memory if Class doesn't have this step recorded
  const fallback = matchLiveSpeechToLearnedPattern({
    history: params.history,
    liveSpeakDurationMs: params.liveSpeakDurationMs || defaults.speakMs,
    liveVoicePeak: params.liveVoicePeak || 28,
    liveBurstCount: 2,
    liveVoiceSignature: params.liveVoiceSignature,
  });

  return {
    totalTurnMs: fallback.selectedSpeakMs + fallback.selectedPauseMs,
    pauseBeforeSendMs: fallback.selectedPauseMs,
    speakDurationMs: fallback.selectedSpeakMs,
    className: targetClass ? targetClass.name : 'Default',
    turnNumber: userTurnIndex + 1,
  };
}

/**
 * Saves the trained dataset into LocalStorage and preloads all 16 MP3 files into CacheStorage + Blob memory
 */
export async function initLocalBrainAndCache(
  onProgress?: (loaded: number, total: number) => void
): Promise<void> {
  try {
    localStorage.setItem(LOCAL_BRAIN_STORAGE_KEY, JSON.stringify(TRAINED_DATASET_RULES));
    // Ensure self-learning memory is initialized
    const mem = loadSelfLearningMemory();
    saveSelfLearningMemory(mem);
  } catch (e) {
    console.warn('LocalStorage save warning:', e);
  }

  const total = ALL_CBE_MP3_FILES.length;
  let loaded = 0;

  const cache =
    typeof window !== 'undefined' && 'caches' in window
      ? await window.caches.open(AUDIO_CACHE_NAME).catch(() => null)
      : null;

  await Promise.all(
    ALL_CBE_MP3_FILES.map(async (url) => {
      try {
        if (blobUrlCache.has(url)) {
          loaded++;
          onProgress?.(loaded, total);
          return;
        }

        let response: Response | undefined;
        if (cache) {
          response = await cache.match(url);
        }

        if (!response) {
          const fetched = await fetch(url);
          if (fetched.ok) {
            if (cache) {
              await cache.put(url, fetched.clone()).catch(() => {});
            }
            response = fetched;
          }
        }

        if (response && response.ok) {
          const blob = await response.blob();
          const localBlobUrl = URL.createObjectURL(blob);
          blobUrlCache.set(url, localBlobUrl);
        }
      } catch (err) {
        console.warn('Preload warning for', url, err);
      } finally {
        loaded++;
        onProgress?.(loaded, total);
      }
    })
  );
}

/**
 * Returns the cached local Blob URL if available so playback requires 0 internet
 */
export function getCachedAudioUrl(url: string): string {
  return blobUrlCache.get(url) || url;
}

/**
 * Infers the caller's spoken phrase locally from the trained dataset + learned utterances in LocalStorage
 */
export function inferLocalCallerTurn(history: ChatMessage[]): string {
  const stepKey = getCurrentStepKey(history);
  const mem = loadSelfLearningMemory();
  const learnedList = mem.steps[stepKey]?.learnedUtterances || [];

  // For phone number pairs, always keep strict 09 -> 59 -> 84 -> 28 -> 29 sequence
  if (stepKey === 'step_5_phone_pair') {
    const esheCount = history.filter(
      (h) =>
        h.role === 'model' &&
        ((h.audioUrl && h.audioUrl.includes('eshe_interjection')) || h.text === 'እሽ')
    ).length;
    const phonePairs = ['09', '59', '84', '28', '29'];
    return phonePairs[Math.min(esheCount, phonePairs.length - 1)];
  }

  // If user has taught custom utterances at this step in LocalStorage, use the latest learned utterance!
  if (learnedList.length > 0) {
    return learnedList[learnedList.length - 1];
  }

  const lastModelMsg = [...history].reverse().find((h) => h.role === 'model');
  const url = lastModelMsg?.audioUrl || '';
  const text = lastModelMsg?.text || '';

  if (url.includes('edris_greeting') || text.includes('ምን ልርዳወት')) {
    return 'ገንዘብ አስተላልፌ ነበር እና ከኔ አካውንት ባላንስ ላይ ቆርጧል ሜሴጅም ገብቶልኛል ግን ሰውየው ጋ ሜሴጅ አልደረሰውም እና ባላንሱም ላይ አልደመረለትም';
  }
  if (url.includes('sew_abrot_nw') || text.includes('አጠገቦት ነው')) {
    return 'አብሮኝ ነው እዚህ አሁን እቃ ገዝቼ ነበር';
  }
  if (url.includes('yerson_account') || text.includes('የእርሶን የሂሳብ')) {
    return 'አዎ አጠገቤ ናቸው የሂሳብ ቁጥር ነው ያልከኝ እኔ ሲቢኢ ብር ነው የምጠቀመው';
  }
  if (url.includes('cbebirr_call_number') || text.includes('አሁን የደወሉበት ነው')) {
    return 'እሺ አዎ';
  }
  if (url.includes('full_name') || text.includes('ስም እስከ አያት')) {
    return 'ጁሩይጅ አብዱል መናል ሁሴን';
  }
  if (url.includes('amount_sent') || text.includes('ስንት ብር ላኩ')) {
    return '5000 ብር';
  }
  if (url.includes('recipient_name') || text.includes('ለማን ብለው')) {
    return 'ታሪኩ ደርጉ ቶላ';
  }
  if (url.includes('recipient_account') || text.includes('ደንበኛ አካዉንት ቁጥር')) {
    return '10001112131415';
  }
  if (url.includes('checking_hold') || text.includes('በማጣራት ላይ ነኝ')) {
    return 'እጠብቃለሁ';
  }
  if (url.includes('sent_successfully') || text.includes('በትክክል ተልኳል')) {
    return 'ገብቷል ገንዘቡ? እና እሱ ጋ ለምን አልደረሰም? ገንዘቡ ገብቷል እርግጠኛ ነህ?';
  }
  if (url.includes('money_deposited') || text.includes('ገንዘቡ ገብቷል')) {
    return 'እሺ እና ለምን ነው እሱ አካውንት ላይ ያልደመረው? 889 ላይ ቼክ አድርገን ነበር ቀሪ ባላንሱ ላይ መደመር ነበረበት እኮ አሁን ምን ይሻላል?';
  }
  if (url.includes('system_issue_24h') || text.includes('የሲስተም ችግር')) {
    return 'እሺ በ24 ሰዓት ውስጥ ይደርሳል አይ በቃ ሲስተም ነው እንጂ ብሩ ገብቷል በ24 ሰዓት ይደርስሃል እንጂ እኔ ልኬያለሁ';
  }
  if (url.includes('thank_you_questions') || text.includes('ሌላ ጥያቄ አለወት')) {
    return 'ሌላ ጥያቄ የለኝም እሺ እናመሰግናለን';
  }
  return 'ገንዘብ አስተላልፌ ነበር አልደረሰም';
}

/**
 * Zero-Latency Client-Side Trained Brain Matcher (runs in 0.001s on the phone with 0 internet needed)
 */
export function matchLocalTrainedResponse(
  userText: string,
  history: ChatMessage[]
): LocalAudioMatch | null {
  const norm = (userText || '').trim().toLowerCase();

  const hasInHistory = (keywordOrUrl: string) => {
    return history.some(
      (h) =>
        (h.text && h.text.includes(keywordOrUrl)) ||
        (h.audioUrl && h.audioUrl.includes(keywordOrUrl))
    );
  };

  const esheInterjectionCount = history.filter(
    (h) =>
      h.role === 'model' &&
      ((h.audioUrl && h.audioUrl.includes('eshe_interjection')) || h.text === 'እሽ')
  ).length;

  // Check if userText matches any custom learned utterances for step 1
  const mem = loadSelfLearningMemory();
  const learnedStep1 = mem.steps['step_1_transfer']?.learnedUtterances || [];
  const matchesLearnedStep1 = learnedStep1.some(
    (u) => norm.includes(u.toLowerCase()) || u.toLowerCase().includes(norm)
  );

  const isTransferTopic =
    matchesLearnedStep1 ||
    norm.includes('ገንዘብ') ||
    norm.includes('ብር') ||
    norm.includes('አስተላልፍ') ||
    norm.includes('አስተላልፌ') ||
    norm.includes('አስተላለፍኩ') ||
    norm.includes('ልኬ') ||
    norm.includes('ላክሁ') ||
    norm.includes('ላኩ') ||
    norm.includes('ተላከ') ||
    norm.includes('አልደረሰ') ||
    norm.includes('አልገባ') ||
    norm.includes('ባላንስ') ||
    norm.includes('አካውንት') ||
    norm.includes('ቆረጠ') ||
    norm.includes('ቆርጧል') ||
    norm.includes('ሜሴጅ') ||
    norm.includes('መልእክት') ||
    norm.includes('ሰውየው') ||
    norm.includes('አልደመረ') ||
    norm.includes('ዝውውር') ||
    norm.includes('ትራንስፈር') ||
    norm.includes('ችግር') ||
    norm.includes('genezeb') ||
    norm.includes('genzeb') ||
    norm.includes('astelalefe') ||
    norm.includes('balance') ||
    norm.includes('kortual') ||
    norm.includes('message') ||
    norm.includes('alderesewm') ||
    norm.includes('aldemereletem') ||
    norm.includes('sewyew');

  const hasAskedIfTogether =
    hasInHistory('sew_abrot_nw') ||
    hasInHistory('አጠገቦት ነው') ||
    hasInHistory('እንዴት አወቁ');

  const hasAskedYersonAccount =
    hasInHistory('yerson_account') ||
    hasInHistory('የእርሶን የሂሳብ');

  const hasAskedCbeBirrNumber =
    hasInHistory('cbebirr_call_number') ||
    hasInHistory('አሁን የደወሉበት ነው');

  const hasAskedPhoneNumber =
    hasInHistory('phone_number') ||
    hasInHistory('ስልክ ቁጥሮትን');

  const hasAskedFullName =
    hasInHistory('full_name') ||
    hasInHistory('ስም እስከ አያት');

  const hasAskedAmount =
    hasInHistory('amount_sent') ||
    hasInHistory('ስንት ብር ላኩ');

  const hasAskedRecipientName =
    hasInHistory('recipient_name') ||
    hasInHistory('ለማን ብለው');

  const hasAskedRecipientAccount =
    hasInHistory('recipient_account') ||
    hasInHistory('ደንበኛ አካዉንት ቁጥር');

  const hasAskedHold =
    hasInHistory('checking_hold') ||
    hasInHistory('በማጣራት ላይ ነኝ');

  const hasConfirmedSent =
    hasInHistory('sent_successfully') ||
    hasInHistory('በትክክል ተልኳል');

  const hasConfirmedDeposited =
    hasInHistory('money_deposited') ||
    hasInHistory('ገንዘቡ ገብቷል');

  const hasExplainedSystem =
    hasInHistory('system_issue_24h') ||
    hasInHistory('የሲስተም ችግር') ||
    hasInHistory('24 ሰአት');

  const hasAskedMoreQuestions =
    hasInHistory('thank_you_questions') ||
    hasInHistory('ሌላ ጥያቄ አለወት');

  const hasClosedSurvey =
    hasInHistory('survey_rating') ||
    hasInHistory('ቀጣይ ያሉትን መሙያ') ||
    hasInHistory('አስተያየት') ||
    hasInHistory('አስተዳደር');

  if (hasAskedMoreQuestions && !hasClosedSurvey) {
    return {
      audioUrl: '/audio/survey_rating.mp3',
      replyText: 'እሽ ስለ አገልግሎት አስተዳደር ቀጣይ ያሉትን መሙያ ይሙሉ ስለደወሉ እናመሰግናለን',
    };
  }

  if (hasExplainedSystem && !hasAskedMoreQuestions) {
    return {
      audioUrl: '/audio/thank_you_questions.mp3',
      replyText: 'ስለደወሉ እናመሰግናለን ደንበኛችን ሌላ ጥያቄ አለወት',
    };
  }

  if (hasConfirmedDeposited && !hasExplainedSystem) {
    return {
      audioUrl: '/audio/system_issue_24h.mp3',
      replyText:
        'ወደ ተላከለት ደንበኛ ስልክ ወይም አካዉንት ሜሴጅ ያልደረሰው ወይም ቀሪ ሂሳቡ ላይ የተላከለት ገንዘብ ያልጨመረው አንዳንዴ በባንኩ ሲስተም መጨናነቅ እና የሲስተም ችግር እንደዚህ አይነት ነገር ስለሚገጥም ነው እና ገንዘቡ በአየር ላይ ስለሚሆን ነው ገንዘቡ ወደተላከለት ደንበኛ በ24 ሰአት ውስጥ ገቢ ይሆናል',
    };
  }

  if (hasConfirmedSent && !hasConfirmedDeposited) {
    return {
      audioUrl: '/audio/money_deposited.mp3',
      replyText: 'ገንዘቡ ገብቷል',
    };
  }

  if (hasAskedHold && !hasConfirmedSent) {
    return {
      audioUrl: '/audio/sent_successfully.mp3',
      replyText: 'ገንዘቡ በትክክል ተልኳል ደንበኛችን',
    };
  }

  if (hasAskedRecipientAccount && !hasAskedHold) {
    return {
      audioUrl: '/audio/checking_hold.mp3',
      replyText: 'በማጣራት ላይ ነኝ እባኮትን ደንበኛችን አንዴ በመስመር ላይ ይጠብቁኝ',
    };
  }

  if (hasAskedRecipientName && !hasAskedRecipientAccount) {
    return {
      audioUrl: '/audio/recipient_account.mp3',
      replyText: 'እሽ እርሶ የላኩላቸው ደንበኛ አካዉንት ቁጥር ይንገሩኝ',
    };
  }

  if (hasAskedAmount && !hasAskedRecipientName) {
    return {
      audioUrl: '/audio/recipient_name.mp3',
      replyText: 'ለማን ብለው ነበር የላኩት',
    };
  }

  if (hasAskedFullName && !hasAskedAmount) {
    return {
      audioUrl: '/audio/amount_sent.mp3',
      replyText: 'ስንት ብር ላኩ ደንበኛችን',
    };
  }

  if (hasAskedPhoneNumber && !hasAskedFullName) {
    const digitsInCurrentTurn = (norm.match(/\d/g) || []).length;
    if (digitsInCurrentTurn >= 9 || esheInterjectionCount >= 4) {
      return {
        audioUrl: '/audio/full_name.mp3',
        replyText: 'ስም እስከ አያት',
      };
    }
    return {
      audioUrl: '/audio/eshe_interjection.mp3',
      replyText: 'እሽ',
    };
  }

  if (hasAskedCbeBirrNumber && !hasAskedPhoneNumber) {
    return {
      audioUrl: '/audio/phone_number.mp3',
      replyText: 'እሽ ይንገሩኝ ስልክ ቁጥሮትን',
    };
  }

  if (hasAskedYersonAccount && !hasAskedCbeBirrNumber) {
    return {
      audioUrl: '/audio/cbebirr_call_number.mp3',
      replyText: 'እርሶ ሲቢኢ ብር የሚጠቀሙት አሁን የደወሉበት ነው',
    };
  }

  if (hasAskedIfTogether && !hasAskedYersonAccount) {
    return {
      audioUrl: '/audio/yerson_account.mp3',
      replyText: 'አጠገቦት ናቸው እሽ የእርሶን የሂሳብ ይንገሩኝ',
    };
  }

  if (isTransferTopic && !hasAskedIfTogether) {
    return {
      audioUrl: '/audio/sew_abrot_nw.mp3',
      replyText: 'ገንዘቡ የተላከለት ሰው አጠገቦት ነው ገንዘቡ እንዳልደረሰው እንዴት አወቁ',
    };
  }

  // Also if the conversation is already past greeting and user spoke any learned response
  if (history.length > 0 && norm.length > 0 && !hasAskedIfTogether) {
    return {
      audioUrl: '/audio/sew_abrot_nw.mp3',
      replyText: 'ገንዘቡ የተላከለት ሰው አጠገቦት ነው ገንዘቡ እንዳልደረሰው እንዴት አወቁ',
    };
  }

  return null;
}
