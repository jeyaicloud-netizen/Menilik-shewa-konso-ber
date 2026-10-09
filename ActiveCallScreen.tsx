import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  PhoneOff,
  Grid,
  Pause,
  Play,
  UserPlus,
  Disc,
  User,
  Check,
  MessageSquare,
  Send,
  Plus,
  Trash2,
  Upload,
  Headphones,
  ArrowLeft,
  RotateCcw,
} from 'lucide-react';
import { CallState, IvrStep } from './types';
import { phoneAudio } from './audio';
import {
  SUPPORT_AGENT_STEPS,
  SupportAgentCharacter,
  LearnedTrainingClass,
} from './localBrain';
import { LiveTranscriptItem } from './App';
import { SupportAgentStudioModal } from './SupportAgentStudioModal';
import { SecretLiveCallPhase, loadSecretLiveBridgeConfig } from './secretLiveBridge';

interface ActiveCallScreenProps {
  number: string;
  callState: CallState;
  ivrStep: IvrStep;
  durationSeconds: number;
  isAgentSpeaking: boolean;
  isUserSpeaking: boolean;
  turnPhase?: 'red' | 'yellow' | 'green' | 'idle';
  isSecretStudioMode?: boolean;
  onExitSecretStudio?: () => void;
  isMuted?: boolean;
  onToggleMute?: () => void;
  isSpeakerOn?: boolean;
  onToggleSpeaker?: () => void;
  callStatusText?: string;
  lastAgentPrompt?: string;
  liveTranscripts?: LiveTranscriptItem[];
  liveUserSpeech?: string;
  micVolume?: number;
  learningStats?: {
    totalSamples: number;
    totalLearnedPhrases: number;
    currentStepSamples: number;
    currentStepPauseMs: number;
    currentStepSpeakMs: number;
    currentStepPatternsLabel?: string;
    currentStepPatterns?: any[];
  };
  liveTiming?: { speakSeconds: number; pauseSeconds: number };
  isTeachMode?: boolean;
  isTeachingTurnActive?: boolean;
  draftStepsCount?: number;
  learnedClasses?: LearnedTrainingClass[];
  selectedClassId?: string | null;
  onStartTeachingTurn?: () => void;
  onFinishTeachingTurn?: () => void;
  onSaveCompleteClass?: () => void;
  onSelectClass?: (classId: string) => void;
  onDeleteClass?: (classId: string) => void;
  onAddCustomClass?: (name: string) => void;
  supportAgents?: SupportAgentCharacter[];
  selectedSupportAgentId?: string;
  onSelectSupportAgent?: (agentId: string) => void;
  onAddSupportAgent?: (name: string, voiceLabel: string) => void;
  onDeleteSupportAgent?: (agentId: string) => void;
  onUploadSupportStepMp3?: (agentId: string, stepId: string, file: File) => void;
  onSupportAgentsUpdated?: (updated: SupportAgentCharacter[]) => void;
  onToggleTeachMode?: () => void;
  onSavePatternOnly?: (customText?: string) => void;
  onGiveFeedback?: (feedback: 'too_fast' | 'good' | 'too_slow') => void;
  isTestMode?: boolean;
  onToggleTestMode?: () => void;
  micPermissionDenied?: boolean;
  onRequestMicPermission?: () => void;
  onSendUserText?: (text: string) => void;
  onFinishSpeaking?: () => void;
  onEndCall: () => void;
  onDtmfKey: (digit: string) => void;
  secretLivePhase?: SecretLiveCallPhase;
  secretLiveAttemptCount?: number;
  onSimulateSecretAnswered?: () => void;
  onSimulateSecretRemoteEnded?: () => void;
  onOpenSecretBridgeModal?: () => void;
}

export const ActiveCallScreen: React.FC<ActiveCallScreenProps> = ({
  number,
  callState,
  ivrStep,
  durationSeconds,
  isAgentSpeaking,
  isUserSpeaking,
  turnPhase = 'idle',
  isSecretStudioMode = false,
  onExitSecretStudio,
  isMuted = false,
  onToggleMute,
  isSpeakerOn = true,
  onToggleSpeaker,
  callStatusText,
  liveTranscripts = [],
  liveUserSpeech = '',
  isTeachingTurnActive = false,
  draftStepsCount = 0,
  learnedClasses = [],
  selectedClassId = null,
  onStartTeachingTurn,
  onFinishTeachingTurn,
  onSaveCompleteClass,
  onSelectClass,
  onDeleteClass,
  onAddCustomClass,
  supportAgents = [],
  selectedSupportAgentId = 'support_edris',
  onSelectSupportAgent,
  onAddSupportAgent,
  onDeleteSupportAgent,
  onSupportAgentsUpdated,
  isTestMode = false,
  onToggleTestMode,
  micPermissionDenied,
  onRequestMicPermission,
  onSendUserText,
  onFinishSpeaking,
  onEndCall,
  onDtmfKey,
  liveTiming = { speakSeconds: 0, pauseSeconds: 0 },
  secretLivePhase = 'idle',
  secretLiveAttemptCount = 0,
  onSimulateSecretAnswered,
  onSimulateSecretRemoteEnded,
  onOpenSecretBridgeModal,
}) => {
  const [isOnHold, setIsOnHold] = useState(false);
  const [showInCallKeypad, setShowInCallKeypad] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [customText, setCustomText] = useState('');
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Long-press state for Caller Character pills inside j11
  const [longPressedCharacter, setLongPressedCharacter] = useState<LearnedTrainingClass | null>(null);
  const charPressTimerRef = useRef<any>(null);
  const didCharLongPressRef = useRef<boolean>(false);

  // Add New Caller Character modal state
  const [showAddCharModal, setShowAddCharModal] = useState(false);
  const [newCharName, setNewCharName] = useState('');

  // Customer Support Agent Manager & MP3 Uploader modal state
  const [showAddSupportModal, setShowAddSupportModal] = useState(false);
  const [newSupportName, setNewSupportName] = useState('');
  const [newSupportLabel, setNewSupportLabel] = useState('');
  const [uploadingSupportAgent, setUploadingSupportAgent] = useState<SupportAgentCharacter | null>(null);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [liveTranscripts, liveUserSpeech]);

  useEffect(() => {
    if (ivrStep === 'welcome_menu' || secretLivePhase === 'playing_survey_mp3') {
      setShowInCallKeypad(true);
    } else if (ivrStep === 'agent_intro' || ivrStep === 'active_call') {
      setShowInCallKeypad(false);
    }
  }, [ivrStep, secretLivePhase]);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  const handleKeypadPress = (digit: string) => {
    phoneAudio.playDtmf(digit);
    onDtmfKey(digit);
  };

  const handleSendTextSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (customText.trim() && onSendUserText) {
      onSendUserText(customText.trim());
      setCustomText('');
      setShowTextInput(false);
    }
  };

  const startCharLongPress = (cls: LearnedTrainingClass) => {
    didCharLongPressRef.current = false;
    if (charPressTimerRef.current) clearTimeout(charPressTimerRef.current);
    charPressTimerRef.current = setTimeout(() => {
      didCharLongPressRef.current = true;
      setLongPressedCharacter(cls);
    }, 450);
  };

  const cancelCharLongPress = () => {
    if (charPressTimerRef.current) {
      clearTimeout(charPressTimerRef.current);
      charPressTimerRef.current = null;
    }
  };

  const isRinging = callState === 'ringing' || callState === 'dialing';

  // Determine the tiny stealth dot color after pressing 4 (active_call or agent_intro)
  const effectiveDotPhase: 'red' | 'yellow' | 'green' | 'idle' =
    ivrStep === 'welcome_menu' || isRinging
      ? 'idle'
      : turnPhase !== 'idle'
        ? turnPhase
        : isAgentSpeaking
          ? 'green'
          : 'red';

  // ============================================================================
  // MODE 1: NORMAL GOOGLE PHONE CALL SCREEN (100% Stealth — No AI UI Visible!)
  // ============================================================================
  if (!isSecretStudioMode) {
    return (
      <div className="relative w-full h-full flex flex-col justify-between bg-white text-[#202124] overflow-hidden select-none font-sans">
        {/* Top Google Phone Status Bar */}
        <div className="pt-6 px-6 flex items-center justify-between z-10 text-xs text-[#5F6368]">
          <div className="flex items-center gap-1.5 font-medium">
            <span className="text-[11px] bg-[#E8F0FE] text-[#1A73E8] px-1.5 py-0.5 rounded font-semibold">
              HD
            </span>
          </div>

          {/* Call Timer + Tiny Stealth Dot (🔴 Red = Speak, 🟡 Yellow = Stop/Wait, 🟢 Green = Agent Speaking) */}
          <div className="flex items-center gap-1.5 font-mono text-xs tracking-wider text-[#3C4043] font-medium">
            <span>{isRinging ? 'Calling...' : formatTime(durationSeconds)}</span>
            {effectiveDotPhase !== 'idle' && (
              <span
                className={`w-1.5 h-1.5 rounded-full transition-colors duration-150 ${
                  effectiveDotPhase === 'red'
                    ? 'bg-red-500'
                    : effectiveDotPhase === 'yellow'
                      ? 'bg-amber-400'
                      : 'bg-emerald-500'
                }`}
              />
            )}
          </div>

          <div className="w-6" />
        </div>

        {/* Main Normal Google Phone Caller Profile */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 -mt-8 relative z-10">
          <div className="w-24 h-24 rounded-full bg-[#E8F0FE] flex items-center justify-center mb-4 shadow-xs">
            <User className="w-12 h-12 text-[#1A73E8]" />
          </div>

          <h1 className="text-3xl font-normal tracking-tight text-[#202124] mb-1 text-center">
            የኢትዮጵያ ንግድ ባንክ
          </h1>
          <p className="text-sm font-normal text-[#5F6368] text-center font-mono">
            {number}
          </p>
        </div>

        {/* In-Call DTMF Keypad (Normal Google Phone Style) */}
        {showInCallKeypad && (
          <div className="px-6 py-4 bg-white/95 backdrop-blur-md border-t border-gray-200 rounded-t-3xl z-20 shadow-lg">
            <div className="flex items-center justify-between mb-3 px-3">
              <span className="text-xs font-medium text-[#5F6368]">ቁልፍ ሰሌዳ</span>
              <button
                onClick={() => setShowInCallKeypad(false)}
                className="text-xs text-[#5F6368] hover:text-[#202124] px-2 py-1"
              >
                ዝጋ ✕
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 max-w-[260px] mx-auto">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((digit) => (
                <button
                  key={digit}
                  onClick={() => handleKeypadPress(digit)}
                  className="h-12 rounded-full font-medium text-xl flex items-center justify-center active:scale-95 transition-all shadow-xs bg-[#F1F3F4] hover:bg-[#E8EAED] text-[#202124]"
                >
                  {digit}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Google Phone Standard 6-Button Controls */}
        <div className="px-8 pb-8 z-10">
          <div className="grid grid-cols-3 gap-y-5 gap-x-6 max-w-xs mx-auto mb-8">
            <button onClick={onToggleMute} className="flex flex-col items-center gap-1.5">
              <div
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                  isMuted
                    ? 'bg-[#C2E7FF] text-[#001D35]'
                    : 'bg-[#F1F3F4] hover:bg-[#E8EAED] text-[#3C4043]'
                }`}
              >
                {isMuted ? <MicOff className="w-6 h-6 text-[#1A73E8]" /> : <Mic className="w-6 h-6" />}
              </div>
              <span className="text-[11px] text-[#5F6368] font-medium">ድምፅ አጥፋ</span>
            </button>

            <button
              onClick={() => setShowInCallKeypad(!showInCallKeypad)}
              className="flex flex-col items-center gap-1.5"
            >
              <div
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                  showInCallKeypad
                    ? 'bg-[#C2E7FF] text-[#001D35]'
                    : 'bg-[#F1F3F4] hover:bg-[#E8EAED] text-[#3C4043]'
                }`}
              >
                <Grid className="w-6 h-6" />
              </div>
              <span className="text-[11px] text-[#5F6368]">ቁልፍ ሰሌዳ</span>
            </button>

            <button onClick={onToggleSpeaker} className="flex flex-col items-center gap-1.5">
              <div
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                  isSpeakerOn
                    ? 'bg-[#C2E7FF] text-[#001D35]'
                    : 'bg-[#F1F3F4] hover:bg-[#E8EAED] text-[#3C4043]'
                }`}
              >
                {isSpeakerOn ? <Volume2 className="w-6 h-6 text-[#1A73E8]" /> : <VolumeX className="w-6 h-6" />}
              </div>
              <span className="text-[11px] text-[#5F6368] font-medium">ስፒከር</span>
            </button>

            <button onClick={() => {}} className="flex flex-col items-center gap-1.5">
              <div className="w-14 h-14 rounded-full bg-[#F1F3F4] flex items-center justify-center text-[#3C4043]">
                <UserPlus className="w-6 h-6" />
              </div>
              <span className="text-[11px] text-[#5F6368]">ጥሪ ጨምር</span>
            </button>

            <button
              onClick={() => setIsOnHold(!isOnHold)}
              className="flex flex-col items-center gap-1.5"
            >
              <div
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                  isOnHold ? 'bg-[#1A73E8] text-white' : 'bg-[#F1F3F4] text-[#3C4043]'
                }`}
              >
                {isOnHold ? <Play className="w-6 h-6" /> : <Pause className="w-6 h-6" />}
              </div>
              <span className="text-[11px] text-[#5F6368]">አቆይ</span>
            </button>

            <button onClick={() => {}} className="flex flex-col items-center gap-1.5">
              <div className="w-14 h-14 rounded-full bg-[#F1F3F4] flex items-center justify-center text-[#3C4043]">
                <Disc className="w-6 h-6" />
              </div>
              <span className="text-[11px] text-[#5F6368]">ቅዳ</span>
            </button>
          </div>

          <div className="w-full flex items-center justify-center">
            <button
              onClick={onEndCall}
              className="w-16 h-16 rounded-full bg-[#EA4335] hover:bg-[#D93025] active:scale-95 transition-all shadow-lg flex items-center justify-center text-white"
              aria-label="ጥሪ ዝጋ"
            >
              <PhoneOff className="w-7 h-7 fill-current" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // MODE 2: J11 SECRET STUDIO CALL SCREEN (Full Training, Characters & Support MP3s)
  // ============================================================================
  const activeSpeaker =
    learnedClasses.find((c) => c.id === selectedClassId) ||
    learnedClasses[0] || { id: 'class_jurey', name: 'Jurey', turnSequence: [] };

  const activeSupportAgent =
    supportAgents.find((a) => a.id === selectedSupportAgentId) ||
    supportAgents[0] || { id: 'support_edris', name: 'እድሪስ (ነባሪ)', uploadedSteps: {} };

  return (
    <div className="relative w-full h-full flex flex-col justify-between bg-white text-[#202124] overflow-hidden select-none font-sans">
      {/* J11 Secret Studio Top Bar */}
      <div className="pt-3 px-4 pb-1.5 bg-slate-900 text-white flex items-center justify-between z-10 text-xs">
        <button
          type="button"
          onClick={onExitSecretStudio}
          className="flex items-center gap-1 text-[11px] bg-white/15 hover:bg-white/25 px-2.5 py-1 rounded-full font-bold"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>ወደ ኖርማል ስልክ</span>
        </button>

        <div className="flex items-center gap-2 font-mono text-xs">
          <span>{isRinging ? 'በመደወል ላይ...' : formatTime(durationSeconds)}</span>
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              effectiveDotPhase === 'red'
                ? 'bg-red-500 animate-pulse'
                : effectiveDotPhase === 'yellow'
                  ? 'bg-amber-400 animate-bounce'
                  : effectiveDotPhase === 'green'
                    ? 'bg-emerald-400 animate-pulse'
                    : 'bg-slate-500'
            }`}
          />
        </div>

        <span className="text-[10px] font-bold text-amber-300">🔐 J11 Studio</span>
      </div>

      {/* Main Content Area in J11 Studio */}
      <div className="flex-1 flex flex-col items-center justify-start px-3 pt-1.5 relative z-10 overflow-y-auto w-full">
        {/* Call Status Banner */}
        {callStatusText && (
          <div className="mb-1.5 px-3 py-1 bg-[#F1F3F4] text-[#3C4043] rounded-full text-[11px] font-medium max-w-[340px] text-center truncate">
            {callStatusText}
          </div>
        )}

        {/* Live Call Transcript */}
        {callState === 'connected' && (
          <div className="w-full max-w-[360px] bg-[#F8F9FA] border border-gray-200 rounded-2xl p-2.5 shadow-inner flex flex-col gap-1.5 h-[145px] overflow-y-auto shrink-0">
            <div className="flex items-center justify-between pb-1 border-b border-gray-200 shrink-0">
              <span className="text-[10px] font-bold text-[#1A73E8] uppercase flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
                የቀጥታ ንግግር ({activeSupportAgent.name} ⇄ {activeSpeaker.name})
              </span>
            </div>

            <div className="flex flex-col gap-1.5 text-xs overflow-y-auto pr-0.5">
              {liveTranscripts.map((t) => (
                <div
                  key={t.id}
                  className={`flex flex-col rounded-xl px-2.5 py-1.5 shadow-2xs ${
                    t.speaker === 'user'
                      ? 'bg-blue-50 border border-blue-200 text-[#1A73E8] self-end max-w-[92%]'
                      : 'bg-white border border-gray-200 text-[#202124] self-start max-w-[92%]'
                  }`}
                >
                  <span className="text-[9px] font-bold opacity-80">
                    {t.speaker === 'user' ? `👤 ${activeSpeaker.name}፦` : `🎧 ${activeSupportAgent.name}፦`}
                  </span>
                  <span className="text-[11.5px] leading-snug font-medium break-words">
                    {t.text}
                  </span>
                </div>
              ))}
              <div ref={transcriptEndRef} />
            </div>
          </div>
        )}

        {/* J11 Controls: 1) Caller Characters (Long-Press for Delete / New Learn + Add Character)
                        2) Customer Support Characters (Edris + Add Support & Upload Step 1..17 MP3s)
                        3) 🎓 አስተምር -> ✅ ጨረስኩ -> 💾 ሙሉ ለሙሉ ጨረስኩ -> 🧪 Test */}
        <div className="mt-1.5 w-full max-w-[360px] flex flex-col gap-1.5">
          {/* Section 1: Caller Characters */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-2 flex flex-col gap-1">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-700 px-1">
              <span>👥 ደዋይ ካራክተር (ጫን ብለው ይያዙ፦ Delete / New Learn)</span>
              <button
                type="button"
                onClick={() => setShowAddCharModal(true)}
                className="px-2 py-0.5 bg-purple-600 hover:bg-purple-700 text-white rounded-full text-[9.5px] font-bold flex items-center gap-0.5"
              >
                <Plus className="w-3 h-3" /> New Character
              </button>
            </div>

            <div className="flex items-center gap-1 flex-wrap">
              {learnedClasses.map((cls) => {
                const isSelected = selectedClassId === cls.id;
                const count = cls.turnSequence?.length || 0;
                return (
                  <button
                    key={cls.id}
                    type="button"
                    onMouseDown={() => startCharLongPress(cls)}
                    onMouseUp={cancelCharLongPress}
                    onMouseLeave={cancelCharLongPress}
                    onTouchStart={() => startCharLongPress(cls)}
                    onTouchEnd={cancelCharLongPress}
                    onTouchMove={cancelCharLongPress}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      cancelCharLongPress();
                      setLongPressedCharacter(cls);
                    }}
                    onClick={() => {
                      if (didCharLongPressRef.current) {
                        didCharLongPressRef.current = false;
                        return;
                      }
                      onSelectClass?.(cls.id);
                    }}
                    className={`px-2.5 py-1 rounded-full text-[10.5px] font-bold transition-all border flex items-center gap-1 select-none ${
                      isSelected
                        ? 'bg-purple-600 text-white border-purple-700 shadow-xs ring-2 ring-purple-200'
                        : count > 0
                          ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-300'
                          : 'bg-white hover:bg-purple-50 text-slate-700 border-slate-300'
                    }`}
                  >
                    <span>{cls.name}</span>
                    <span
                      className={`text-[9px] px-1 rounded-full ${
                        isSelected
                          ? 'bg-white/25 text-white'
                          : count > 0
                            ? 'bg-emerald-200/80 text-emerald-900'
                            : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Customer Support Characters (እድሪስ + Custom Support Agents with Step 1..17 MP3 Upload) */}
          <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-2 flex flex-col gap-1">
            <div className="flex items-center justify-between text-[10px] font-bold text-blue-900 px-1">
              <span className="flex items-center gap-1">
                <Headphones className="w-3 h-3" /> Customer Support (4 ሲነካ የሚመጣው)፦
              </span>
              <button
                type="button"
                onClick={() => setShowAddSupportModal(true)}
                className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-[9.5px] font-bold flex items-center gap-0.5"
              >
                <Plus className="w-3 h-3" /> Add Support
              </button>
            </div>

            <div className="flex items-center gap-1 flex-wrap">
              {supportAgents.map((agent) => {
                const isSel = selectedSupportAgentId === agent.id;
                const uploadedCount = Object.keys(agent.uploadedSteps || {}).length;
                const totalSteps = Math.max(20, agent.maxStepsCount || 20);
                return (
                  <div key={agent.id} className="inline-flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => onSelectSupportAgent?.(agent.id)}
                      className={`px-2.5 py-1 rounded-full text-[10.5px] font-bold transition-all border flex items-center gap-1 ${
                        isSel
                          ? 'bg-blue-600 text-white border-blue-700 shadow-xs ring-2 ring-blue-200'
                          : 'bg-white hover:bg-blue-50 text-slate-700 border-blue-200'
                      }`}
                    >
                      <span>🎧 {agent.name}</span>
                      <span className="text-[9px] opacity-80">({uploadedCount}/{totalSteps})</span>
                    </button>
                    {!agent.isDefault && (
                      <button
                        type="button"
                        onClick={() => setUploadingSupportAgent(agent)}
                        className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-full text-[9.5px] font-bold flex items-center gap-0.5"
                        title="Step 1..20+ Studio (MP3 ጫን / ድምፅ ቅዳ / Edit / Cut / + Plus)"
                      >
                        <Upload className="w-2.5 h-2.5" /> Studio
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 3: 🎓 አስተምር -> ✅ ጨረስኩ + 💾 ሙሉ ለሙሉ ጨረስኩ + 🧪 Test */}
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {!isTeachingTurnActive ? (
              <button
                type="button"
                onClick={() => onStartTeachingTurn?.()}
                disabled={isAgentSpeaking}
                className="px-3.5 py-1.5 rounded-full text-[11px] font-bold shadow-xs transition-all flex items-center gap-1 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white border border-amber-600 disabled:opacity-50"
              >
                <span>🎓 አስተምር ({activeSpeaker.name})</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onFinishTeachingTurn?.()}
                className="px-4 py-1.5 rounded-full text-[11px] font-bold shadow-sm transition-all flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white border border-emerald-700 ring-2 ring-emerald-300 animate-pulse"
              >
                <span>✅ ጨረስኩ</span>
                <span className="text-[10.5px] font-mono bg-emerald-800/60 px-1.5 py-0.5 rounded-full">
                  {liveTiming.speakSeconds.toFixed(1)}s
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onSaveCompleteClass?.()}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold shadow-xs transition-all flex items-center gap-1 border ${
                draftStepsCount > 0
                  ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-700'
                  : 'bg-white hover:bg-blue-50 text-blue-700 border-blue-300'
              }`}
            >
              <span>💾 ሙሉ ለሙሉ ጨረስኩ</span>
              {draftStepsCount > 0 && (
                <span className="text-[10px] bg-white/25 px-1.5 rounded-full">
                  {draftStepsCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => onToggleTestMode?.()}
              className={`px-3.5 py-1.5 rounded-full text-[11px] font-bold shadow-xs transition-all flex items-center gap-1 border ${
                isTestMode
                  ? 'bg-purple-600 text-white border-purple-700 ring-2 ring-purple-300 animate-pulse'
                  : 'bg-white hover:bg-purple-50 text-purple-700 border-purple-300'
              }`}
            >
              <span>🧪 Test ({activeSpeaker.name})</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenSecretBridgeModal?.()}
              className="px-3 py-1.5 rounded-full text-[10.5px] font-bold shadow-xs transition-all flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700"
            >
              <span>📞 ድብቅ ቀጥታ ጥሪ Studio ({loadSecretLiveBridgeConfig().targetPhoneNumber})</span>
            </button>
          </div>

          {secretLivePhase !== 'idle' && (
            <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-2 flex flex-wrap items-center justify-between gap-1.5 text-[10.5px]">
              <span className="font-bold text-emerald-950">
                📞 ድብቅ ጥሪ ሁኔታ፦{' '}
                {secretLivePhase === 'dialing_ringing'
                  ? `እየጠራ ነው (ሙከራ #${secretLiveAttemptCount} - 2 ጊዜ ጠርቶ ካልተነሳ Busy MP3 ይጫወታል)`
                  : secretLivePhase === 'playing_busy_mp3'
                    ? '⏳ Busy MP3 እየተጫወተ ነው (ሲጨርስ ድጋሚ ይደውላል)'
                    : secretLivePhase === 'live_connected'
                      ? '🟢 ተነስቷል! የቀጥታ ንግግር ላይ ነዎት'
                      : '⭐ ስልኩ ተዘግቷል - የአስተያየት መስጫ (Survey) MP3 እየተጫወተ ነው'}
              </span>
              <div className="flex items-center gap-1">
                {(secretLivePhase === 'dialing_ringing' || secretLivePhase === 'playing_busy_mp3') && (
                  <button
                    type="button"
                    onClick={() => onSimulateSecretAnswered?.()}
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold"
                  >
                    ✅ ስልኩ ተነሳ (Simulate Answer)
                  </button>
                )}
                {secretLivePhase === 'live_connected' && (
                  <button
                    type="button"
                    onClick={() => onSimulateSecretRemoteEnded?.()}
                    className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold"
                  >
                    ☎️ Support ዘጋው ➔ Survey MP3 አጫውት
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Direct Gboard & Voice Input Bar inside J11 Studio */}
        {callState === 'connected' && !isAgentSpeaking && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (customText.trim()) {
                onSendUserText?.(customText.trim());
                setCustomText('');
              }
            }}
            className="mt-1.5 w-full max-w-[360px] flex items-center gap-1.5"
          >
            <input
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="በ Gboard ማይክ ወይም በጽሑፍ እዚህ ይናገሩ..."
              className="flex-1 px-3 py-1.5 bg-white border border-blue-300 rounded-full text-xs text-[#202124]"
            />
            {customText.trim() ? (
              <button
                type="submit"
                className="px-3 py-1.5 bg-[#1A73E8] text-white rounded-full text-xs font-semibold"
              >
                ላክ
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onFinishSpeaking?.()}
                className="px-3 py-1.5 bg-emerald-600 text-white rounded-full text-xs font-semibold flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5 stroke-[3]" /> ላክ
              </button>
            )}
          </form>
        )}

        {micPermissionDenied && (
          <button
            onClick={onRequestMicPermission}
            className="mt-2 px-3 py-1 bg-amber-100 text-amber-900 text-xs rounded-full font-medium"
          >
            🎙️ ማይክሮፎን ፍቀድ
          </button>
        )}
      </div>

      {/* In-Call Keypad */}
      {showInCallKeypad && (
        <div className="px-6 py-3 bg-white border-t border-gray-200 rounded-t-3xl z-20 shadow-lg">
          <div className="flex items-center justify-between mb-2 px-3">
            <span className="text-xs font-medium text-[#5F6368]">ቁልፍ ሰሌዳ (4 ይጫኑ)</span>
            <button
              onClick={() => setShowInCallKeypad(false)}
              className="text-xs text-[#5F6368] px-2 py-0.5"
            >
              ዝጋ ✕
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2.5 max-w-[240px] mx-auto">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((digit) => (
              <button
                key={digit}
                onClick={() => handleKeypadPress(digit)}
                className={`h-11 rounded-full font-medium text-lg flex items-center justify-center ${
                  digit === '4' && ivrStep === 'welcome_menu'
                    ? 'bg-[#1A73E8] text-white ring-2 ring-blue-300'
                    : 'bg-[#F1F3F4] text-[#202124]'
                }`}
              >
                {digit}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Compact Bottom Call Controls in J11 Studio */}
      <div className="px-6 pb-4 pt-2 z-10 flex items-center justify-around border-t border-gray-100">
        <button
          onClick={() => setShowInCallKeypad(!showInCallKeypad)}
          className="px-3 py-2 rounded-full bg-[#F1F3F4] text-xs font-medium text-[#3C4043] flex items-center gap-1.5"
        >
          <Grid className="w-4 h-4" /> ቁልፍ (4)
        </button>

        <button
          onClick={onEndCall}
          className="w-13 h-13 rounded-full bg-[#EA4335] hover:bg-[#D93025] active:scale-95 transition-all shadow-md flex items-center justify-center text-white"
          aria-label="ጥሪ ዝጋ"
        >
          <PhoneOff className="w-6 h-6 fill-current" />
        </button>

        <button
          onClick={onToggleSpeaker}
          className="px-3 py-2 rounded-full bg-[#F1F3F4] text-xs font-medium text-[#3C4043] flex items-center gap-1.5"
        >
          <Volume2 className="w-4 h-4" /> ስፒከር
        </button>
      </div>

      {/* MODAL 1: Long-Press Caller Character Menu (New Learn / Delete) */}
      {longPressedCharacter && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setLongPressedCharacter(null)}
        >
          <div
            className="w-full max-w-[300px] bg-white rounded-2xl shadow-xl p-4 flex flex-col gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-bold text-slate-900 border-b pb-2">
              👤 {longPressedCharacter.name} ({longPressedCharacter.turnSequence?.length || 0} ደረጃዎች ተምሯል)
            </div>

            <button
              type="button"
              onClick={() => {
                onSelectClass?.(longPressedCharacter.id);
                setLongPressedCharacter(null);
                onStartTeachingTurn?.();
              }}
              className="w-full py-2.5 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-xs flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4 text-amber-700" />
              <span>🎓 New Learn (አዲስ አስተምር)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onDeleteClass?.(longPressedCharacter.id);
                setLongPressedCharacter(null);
              }}
              className="w-full py-2.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4 text-rose-600" />
              <span>🗑️ Delete (የተማረውን አጥፋ)</span>
            </button>

            <button
              type="button"
              onClick={() => setLongPressedCharacter(null)}
              className="w-full py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold mt-1"
            >
              ዝጋ
            </button>
          </div>
        </div>
      )}

      {/* MODAL 2: Add New Caller Character */}
      {showAddCharModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowAddCharModal(false)}
        >
          <div
            className="w-full max-w-[300px] bg-white rounded-2xl shadow-xl p-4 flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-slate-900">➕ አዲስ ደዋይ ካራክተር ጨምር</h3>
            <input
              type="text"
              value={newCharName}
              onChange={(e) => setNewCharName(e.target.value)}
              placeholder="የሰውየውን ስም ይፃፉ (ምሳሌ፦ ዳዊት)"
              className="px-3 py-2 border border-slate-300 rounded-xl text-xs"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (newCharName.trim()) {
                    onAddCustomClass?.(newCharName.trim());
                    setNewCharName('');
                    setShowAddCharModal(false);
                  }
                }}
                className="flex-1 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold"
              >
                ጨምር
              </button>
              <button
                type="button"
                onClick={() => setShowAddCharModal(false)}
                className="flex-1 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold"
              >
                ተው
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Add New Customer Support Agent */}
      {showAddSupportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowAddSupportModal(false)}
        >
          <div
            className="w-full max-w-[310px] bg-white rounded-2xl shadow-xl p-4 flex flex-col gap-2.5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-slate-900">
              🎧 አዲስ Customer Support ካራክተር ጨምር
            </h3>
            <input
              type="text"
              value={newSupportName}
              onChange={(e) => setNewSupportName(e.target.value)}
              placeholder="ስም (ምሳሌ፦ ሰላም - የሴት ድምፅ / አቶ ተስፋዬ)"
              className="px-3 py-2 border border-slate-300 rounded-xl text-xs"
              autoFocus
            />
            <input
              type="text"
              value={newSupportLabel}
              onChange={(e) => setNewSupportLabel(e.target.value)}
              placeholder="የድምፅ አይነት (ምሳሌ፦ የሴት / የሽማግሌ ድምፅ)"
              className="px-3 py-2 border border-slate-300 rounded-xl text-xs"
            />
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  if (newSupportName.trim()) {
                    onAddSupportAgent?.(newSupportName.trim(), newSupportLabel.trim());
                    setNewSupportName('');
                    setNewSupportLabel('');
                    setShowAddSupportModal(false);
                  }
                }}
                className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold"
              >
                ፍጠርና MP3 አስገባ
              </button>
              <button
                type="button"
                onClick={() => setShowAddSupportModal(false)}
                className="flex-1 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold"
              >
                ተው
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Step 1..20+ Studio (Upload MP3 / Record Voice / Long-Press Delete / Trim / Cut / + Plus Merge) */}
      {uploadingSupportAgent && (
        <SupportAgentStudioModal
          agent={uploadingSupportAgent}
          allAgents={supportAgents}
          onClose={() => setUploadingSupportAgent(null)}
          onAgentsUpdated={(updated) => onSupportAgentsUpdated?.(updated)}
          onAgentDeleted={(deletedId) => {
            onDeleteSupportAgent?.(deletedId);
          }}
        />
      )}
    </div>
  );
};
