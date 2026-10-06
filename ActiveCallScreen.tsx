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
} from 'lucide-react';
import { CallState, IvrStep } from './types';
import { phoneAudio } from './audio';

import { LiveTranscriptItem } from './App';

interface ActiveCallScreenProps {
  number: string;
  callState: CallState;
  ivrStep: IvrStep;
  durationSeconds: number;
  isAgentSpeaking: boolean;
  isUserSpeaking: boolean;
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
  learnedClasses?: any[];
  selectedClassId?: string | null;
  onStartTeachingTurn?: () => void;
  onFinishTeachingTurn?: () => void;
  onSaveCompleteClass?: () => void;
  onSelectClass?: (classId: string) => void;
  onDeleteClass?: (classId: string) => void;
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
}

export const ActiveCallScreen: React.FC<ActiveCallScreenProps> = ({
  number,
  callState,
  ivrStep,
  durationSeconds,
  isAgentSpeaking,
  isUserSpeaking,
  isMuted = false,
  onToggleMute,
  isSpeakerOn = true,
  onToggleSpeaker,
  callStatusText,
  lastAgentPrompt = 'ምን ልርዳወት',
  liveTranscripts = [],
  liveUserSpeech = '',
  micVolume = 0,
  learningStats,
  liveTiming = { speakSeconds: 0, pauseSeconds: 0 },
  isTeachingTurnActive = false,
  draftStepsCount = 0,
  learnedClasses = [],
  selectedClassId = null,
  onStartTeachingTurn,
  onFinishTeachingTurn,
  onSaveCompleteClass,
  onSelectClass,
  onDeleteClass,
  isTestMode = false,
  onToggleTestMode,
  micPermissionDenied,
  onRequestMicPermission,
  onSendUserText,
  onFinishSpeaking,
  onEndCall,
  onDtmfKey,
}) => {
  const [isOnHold, setIsOnHold] = useState(false);
  const [showInCallKeypad, setShowInCallKeypad] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [customText, setCustomText] = useState('');
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll transcript container on new speech turns
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [liveTranscripts, liveUserSpeech]);

  // Automatically show keypad during IVR welcome menu if user needs to press 4
  useEffect(() => {
    if (ivrStep === 'welcome_menu') {
      setShowInCallKeypad(true);
    } else if (ivrStep === 'agent_intro' || ivrStep === 'active_call') {
      setShowInCallKeypad(false);
    }
  }, [ivrStep]);

  // Format call duration MM:SS
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

  const isRinging = callState === 'ringing' || callState === 'dialing';

  const quickPrompts = [
    'ገንዘብ አስተላልፌ ነበር እና ከኔ አካውንት ባላንስ ላይ ቆርጧል ሜሴጅም ገብቶልኛል ግን ሰውየው ጋ ሜሴጅ አልደረሰውም እና ባላንሱም ላይ አልደመረለትም',
    'አብሮኝ ነው እዚህ አሁን እቃ ገዝቼ ነበር',
    'አዎ አጠገቤ ናቸው የሂሳብ ቁጥር ነው ያልከኝ እኔ ሲቢኢ ብር ነው የምጠቀመው',
    'እሺ አዎ',
    '09',
    '59',
    '84',
    '28',
    '29',
    'ጁሩይጅ አብዱል መናል ሁሴን',
    'አብዱ ሰራጅ ሰኢድ',
    '5000 ብር',
    'ታሪኩ ደርጉ ቶላ',
    'አበበ በሶ በላ',
    '10001112131415',
    'እጠብቃለሁ',
    'ገብቷል ገንዘቡ? እና እሱ ጋ ለምን አልደረሰም? ገንዘቡ ገብቷል እርግጠኛ ነህ?',
    'እሺ እና ለምን ነው እሱ አካውንት ላይ ያልደመረው? 889 ላይ ቼክ አድርገን ነበር ምን ይሻላል?',
    'እሺ በ24 ሰዓት ውስጥ ይደርሳል አይ በቃ ሲስተም ነው እንጂ ብሩ ገብቷል',
    'ሌላ ጥያቄ የለኝም እሺ እናመሰግናለን',
  ];

  return (
    <div className="relative w-full h-full flex flex-col justify-between bg-white text-[#202124] overflow-hidden select-none font-sans">
      {/* Top Google Phone Status Bar (White Theme) */}
      <div className="pt-4 px-6 flex items-center justify-between z-10 text-xs text-[#5F6368]">
        <div className="flex items-center gap-1.5 font-medium">
          <span className="text-[11px] bg-[#E8F0FE] text-[#1A73E8] px-1.5 py-0.5 rounded font-semibold">HD</span>
        </div>

        {/* Call Timer */}
        <div className="font-mono text-xs tracking-wider text-[#3C4043] font-medium">
          {isRinging ? 'በመደወል ላይ...' : formatTime(durationSeconds)}
        </div>

        {/* Status Dot */}
        <div className="flex items-center justify-end w-6">
          {isUserSpeaking ? (
            <span
              className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.8)]"
              aria-label="Microphone recording"
            />
          ) : isAgentSpeaking ? (
            <span
              className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"
              aria-label="Speaker active"
            />
          ) : (
            <span className="w-2 h-2" />
          )}
        </div>
      </div>

      {/* Main Caller Profile Section */}
      <div className="flex-1 flex flex-col items-center justify-start px-4 pt-1 relative z-10 overflow-hidden w-full">
        {/* Contact Avatar (Compact for optimal transcript view) */}
        <div className="relative flex items-center justify-center mb-1.5">
          <div className="w-14 h-14 rounded-full bg-[#E8F0FE] border border-blue-100 flex items-center justify-center shadow-sm">
            <User className="w-7 h-7 text-[#1A73E8]" />
          </div>
          {isAgentSpeaking && (
            <span className="absolute -bottom-1 px-2 py-0.2 bg-emerald-500 text-white text-[9px] rounded-full font-bold shadow animate-bounce">
              እድሪስ
            </span>
          )}
        </div>

        {/* Number / Name Display */}
        <h1 className="text-2xl font-normal tracking-tight text-[#202124] mb-0.5 text-center font-mono">
          {number}
        </h1>
        <p className="text-xs font-normal text-[#5F6368] text-center">
          {isRinging ? 'በመደወል ላይ...' : 'የኢትዮጵያ ንግድ ባንክ'}
        </p>

        {/* Live Call Status Display */}
        {callStatusText && (
          <div className="mt-1.5 px-3 py-0.5 bg-[#F1F3F4] text-[#3C4043] rounded-full text-[11px] font-medium max-w-[300px] text-center truncate shadow-sm">
            {callStatusText}
          </div>
        )}

        {/* Live Speech-to-Text Transcription Box (Pixel Live Caption Style - ALWAYS VISIBLE WHEN CONNECTED) */}
        {callState === 'connected' && (
          <div className="mt-2 w-full max-w-[360px] bg-[#F8F9FA] border border-gray-200/90 rounded-2xl p-3 shadow-inner flex flex-col gap-2 h-[220px] overflow-y-auto">
            <div className="flex items-center justify-between pb-1.5 border-b border-gray-200 shrink-0">
              <span className="text-[10px] font-bold text-[#1A73E8] tracking-wider uppercase flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
                የቀጥታ ንግግር መከታተያ (Live Call Transcript)
              </span>
              {isUserSpeaking ? (
                <span className="text-[9px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-bold animate-pulse flex items-center gap-1">
                  🎙️ ድምፅ እየተቀረጸ ነው...
                </span>
              ) : isAgentSpeaking ? (
                <span className="text-[9px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold animate-pulse flex items-center gap-1">
                  🎧 እድሪስ እየተናገረ ነው...
                </span>
              ) : null}
            </div>

            {/* Conversation turns */}
            <div className="flex flex-col gap-2 text-xs overflow-y-auto pr-0.5">
              {liveTranscripts.length === 0 && !liveUserSpeech && (
                <div className="text-[11px] text-[#80868B] italic text-center py-6">
                  የሚናገሩት ቃል እዚህ ጋር በቅጽበት ወደ ጽሑፍ ተቀይሮ ይታያል...
                </div>
              )}

              {liveTranscripts.map((t) => (
                <div
                  key={t.id}
                  className={`flex flex-col rounded-xl px-3 py-2 shadow-xs ${
                    t.speaker === 'user'
                      ? 'bg-blue-50 border border-blue-200 text-[#1A73E8] self-end max-w-[92%]'
                      : 'bg-white border border-gray-200 text-[#202124] self-start max-w-[92%]'
                  }`}
                >
                  <span className="text-[9.5px] font-bold opacity-80 mb-0.5">
                    {t.speaker === 'user' ? '👤 እርሶ (ደንበኛ)፦' : '🎧 እድሪስ (የኢትዮጵያ ንግድ ባንክ)፦'}
                  </span>
                  <span className="text-[12px] leading-relaxed font-medium break-words">{t.text}</span>
                </div>
              ))}

              {/* Active real-time live speaking preview */}
              {isUserSpeaking && liveUserSpeech && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-3 py-2 self-end max-w-[92%] animate-pulse shadow-xs">
                  <span className="text-[9.5px] font-bold flex items-center gap-1 mb-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
                    እየተናገሩ ያሉት (Live)፦
                  </span>
                  <span className="text-[12px] leading-relaxed font-semibold break-words">
                    {liveUserSpeech}
                  </span>
                </div>
              )}
              <div ref={transcriptEndRef} />
            </div>
          </div>
        )}

        {/* Clean Named-Speaker Class Teaching & Testing Controls */}
        {callState === 'connected' && (
          <div className="mt-1.5 w-full max-w-[360px] flex flex-col gap-1.5">
            {(() => {
              const activeSpeaker =
                learnedClasses.find((c: any) => c.id === selectedClassId) ||
                learnedClasses[0] || { name: 'Jurey' };
              return (
                <>
                  {/* Row 1: 8 Named Speaker Classes Selector (Jurey, Tariku, Abebe, Abdu, Bereket, Sewbehone, Ramid, Ahmed) */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-2 flex flex-col gap-1">
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-700 px-1">
                      <span>👥 የሚያስተምረው / የሚፈተሸው ሰው ምረጥ፦</span>
                      <span className="text-purple-700">
                        ተመርጧል፦ {activeSpeaker.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      {learnedClasses.map((cls: any) => {
                        const isSelected = selectedClassId === cls.id;
                        const count = cls.turnSequence?.length || 0;
                        return (
                          <div key={cls.id} className="inline-flex items-center">
                            <button
                              type="button"
                              onClick={() => onSelectClass?.(cls.id)}
                              className={`px-2.5 py-1 rounded-full text-[10.5px] font-bold transition-all border flex items-center gap-1 ${
                                isSelected
                                  ? 'bg-purple-600 text-white border-purple-700 shadow-xs ring-2 ring-purple-200'
                                  : count > 0
                                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-300'
                                    : 'bg-white hover:bg-purple-50 text-slate-700 border-slate-300'
                              }`}
                            >
                              <span>{cls.name}</span>
                              <span
                                className={`text-[9.5px] px-1 rounded-full ${
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
                            {count > 0 && (
                              <button
                                type="button"
                                onClick={() => onDeleteClass?.(cls.id)}
                                className="ml-0.5 text-[10px] text-slate-400 hover:text-rose-600 px-0.5"
                                title={`የ ${cls.name} ትምህርት አጽዳ`}
                              >
                                ×
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Row 2: 🎓 አስተምር -> ✅ ጨረስኩ + 💾 ሙሉ ለሙሉ ጨረስኩ + 🧪 Test */}
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    {!isTeachingTurnActive ? (
                      <button
                        type="button"
                        onClick={() => onStartTeachingTurn?.()}
                        disabled={isAgentSpeaking}
                        className="px-3.5 py-1.5 rounded-full text-[11px] font-bold shadow-xs transition-all flex items-center gap-1 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white border border-amber-600 disabled:opacity-50"
                        title={`ለ ${activeSpeaker.name} ይህን ደረጃ ማስተማር ለመጀመር ይንኩ`}
                      >
                        <span>🎓 አስተምር ({activeSpeaker.name})</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onFinishTeachingTurn?.()}
                        className="px-4 py-1.5 rounded-full text-[11px] font-bold shadow-sm transition-all flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white border border-emerald-700 ring-2 ring-emerald-300 animate-pulse"
                        title="ተናግረው ሲጨርሱ ይህን ይንኩ — ራሱ መዝግቦ ወደ ቀጣዩ ይሻገራል"
                      >
                        <span>✅ ጨረስኩ</span>
                        <span className="text-[10.5px] font-mono bg-emerald-800/60 px-1.5 py-0.5 rounded-full">
                          {liveTiming.speakSeconds.toFixed(1)}s
                        </span>
                      </button>
                    )}

                    {/* 💾 ሙሉ ለሙሉ ጨረስኩ (Save Complete Session under Selected Person's Name) */}
                    <button
                      type="button"
                      onClick={() => onSaveCompleteClass?.()}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-bold shadow-xs transition-all flex items-center gap-1 border ${
                        draftStepsCount > 0
                          ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-700'
                          : 'bg-white hover:bg-blue-50 text-blue-700 border-blue-300'
                      }`}
                      title={`ሙሉ የተማረውን በ ${activeSpeaker.name} ስም በ LocalStorage ያስቀምጣል`}
                    >
                      <span>💾 ሙሉ ለሙሉ ጨረስኩ</span>
                      {draftStepsCount > 0 && (
                        <span className="text-[10px] bg-white/25 px-1.5 rounded-full">
                          {draftStepsCount}
                        </span>
                      )}
                    </button>

                    {/* 🧪 Test Mode Toggle Button for Selected Person */}
                    <button
                      type="button"
                      onClick={() => onToggleTestMode?.()}
                      className={`px-3.5 py-1.5 rounded-full text-[11px] font-bold shadow-xs transition-all flex items-center gap-1 border ${
                        isTestMode
                          ? 'bg-purple-600 text-white border-purple-700 ring-2 ring-purple-300 animate-pulse'
                          : 'bg-white hover:bg-purple-50 text-purple-700 border-purple-300'
                      }`}
                      title={`በ ${activeSpeaker.name} የተማረውን ይፈትሹ`}
                    >
                      <span>🧪 Test ({activeSpeaker.name})</span>
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* Direct Gboard & Voice Input Bar (Direct Keyboard + Mic Voice Typing) */}
        {callState === 'connected' && !isAgentSpeaking && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (customText.trim()) {
                onSendUserText?.(customText.trim());
                setCustomText('');
              }
            }}
            className="mt-2 w-full max-w-[360px] flex items-center gap-1.5"
          >
            <input
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder={
                isTestMode
                  ? '🧪 Test Mode፦ ያለ "ላክ" በተማረው ሰዓት በራሱ ይመልሳል...'
                  : 'በ Gboard ማይክ ወይም በጽሑፍ እዚህ ይናገሩ...'
              }
              className="flex-1 px-3.5 py-1.5 bg-white border border-blue-300 rounded-full text-xs text-[#202124] shadow-xs focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
            />
            {customText.trim() ? (
              <button
                type="submit"
                className="px-3.5 py-1.5 bg-[#1A73E8] hover:bg-blue-700 text-white rounded-full text-xs font-semibold shadow-xs transition-all"
              >
                ላክ
              </button>
            ) : isTestMode ? (
              <span className="px-3 py-1.5 bg-purple-100 text-purple-800 border border-purple-300 rounded-full text-[10.5px] font-bold whitespace-nowrap">
                ⚡ Auto
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onFinishSpeaking?.()}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full text-xs font-semibold shadow-xs transition-all flex items-center gap-1"
                title="በማይክሮፎን ያወሩትን ይላኩ"
              >
                <Check className="w-3.5 h-3.5 stroke-[3]" /> ላክ
              </button>
            )}
          </form>
        )}

        {/* Mic Permission Warning */}
        {micPermissionDenied && (
          <button
            onClick={onRequestMicPermission}
            className="mt-3 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs rounded-full font-medium shadow-sm transition-all"
          >
            🎙️ ማይክሮፎን ፍቀድ
          </button>
        )}
      </div>

      {/* Quick Text Input Drawer */}
      {showTextInput && (
        <div className="px-5 py-3 bg-white/95 backdrop-blur-md border-t border-gray-200 rounded-t-3xl z-30 shadow-2xl animate-slideUp">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-[#3C4043]">መልስ ይምረጡ ወይም ይፃፉ፦</span>
            <button
              onClick={() => setShowTextInput(false)}
              className="text-xs text-gray-500 hover:text-black px-1"
            >
              ✕
            </button>
          </div>

          {/* Quick reply chips */}
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto mb-2.5 pb-1">
            {quickPrompts.map((p) => (
              <button
                key={p}
                onClick={() => {
                  onSendUserText?.(p);
                  setShowTextInput(false);
                }}
                className="text-[11px] bg-blue-50 hover:bg-blue-100 text-[#1A73E8] px-2.5 py-1 rounded-full border border-blue-200 active:scale-95 transition-all text-left"
              >
                {p}
              </button>
            ))}
          </div>

          <form onSubmit={handleSendTextSubmit} className="flex items-center gap-2">
            <input
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="መልስዎን እዚህ ይፃፉ..."
              className="flex-1 px-3 py-2 bg-gray-100 rounded-full text-xs text-[#202124] focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
            />
            <button
              type="submit"
              className="w-8 h-8 rounded-full bg-[#1A73E8] hover:bg-blue-600 text-white flex items-center justify-center shadow"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* In-Call DTMF Keypad (Light Theme) */}
      {showInCallKeypad && (
        <div className="px-6 py-4 bg-white/95 backdrop-blur-md border-t border-gray-200 rounded-t-3xl z-20 shadow-lg animate-slideUp">
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
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((digit) => {
              const isRecommended = digit === '4' && ivrStep === 'welcome_menu';
              return (
                <button
                  key={digit}
                  onClick={() => handleKeypadPress(digit)}
                  className={`relative h-12 rounded-full font-medium text-xl flex items-center justify-center active:scale-95 transition-all shadow-sm ${
                    isRecommended
                      ? 'bg-[#1A73E8] text-white ring-4 ring-blue-200 animate-pulse'
                      : 'bg-[#F1F3F4] hover:bg-[#E8EAED] text-[#202124]'
                  }`}
                >
                  {digit}
                  {isRecommended && (
                    <span className="absolute -top-1.5 -right-1 text-[9px] bg-amber-400 text-black px-1.5 py-0.2 rounded-full font-bold shadow">
                      አማርኛ
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Google Phone Standard 6-Button Controls */}
      <div className="px-8 pb-8 z-10">
        <div className="grid grid-cols-3 gap-y-5 gap-x-6 max-w-xs mx-auto mb-8">
          {/* 1. Mute */}
          <button
            onClick={onToggleMute}
            className="flex flex-col items-center gap-1.5 group"
          >
            <div
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-sm ${
                isMuted
                  ? 'bg-[#C2E7FF] text-[#001D35] ring-2 ring-[#1A73E8]'
                  : 'bg-[#F1F3F4] hover:bg-[#E8EAED] text-[#3C4043] active:scale-95'
              }`}
            >
              {isMuted ? <MicOff className="w-6 h-6 text-[#1A73E8]" /> : <Mic className="w-6 h-6" />}
            </div>
            <span className="text-[11px] text-[#5F6368] font-medium">
              {isMuted ? 'ድምፅ ጠፍቷል' : 'ድምፅ አጥፋ'}
            </span>
          </button>

          {/* 2. Keypad */}
          <button
            onClick={() => setShowInCallKeypad(!showInCallKeypad)}
            className="flex flex-col items-center gap-1.5 group"
          >
            <div
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-sm ${
                showInCallKeypad
                  ? 'bg-[#C2E7FF] text-[#001D35] ring-2 ring-[#1A73E8]'
                  : 'bg-[#F1F3F4] hover:bg-[#E8EAED] text-[#3C4043] active:scale-95'
              }`}
            >
              <Grid className="w-6 h-6" />
            </div>
            <span className="text-[11px] text-[#5F6368]">ቁልፍ ሰሌዳ</span>
          </button>

          {/* 3. Speaker */}
          <button
            onClick={onToggleSpeaker}
            className="flex flex-col items-center gap-1.5 group"
          >
            <div
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-sm ${
                isSpeakerOn
                  ? 'bg-[#C2E7FF] text-[#001D35] ring-2 ring-[#1A73E8]'
                  : 'bg-[#F1F3F4] hover:bg-[#E8EAED] text-[#3C4043] active:scale-95'
              }`}
            >
              {isSpeakerOn ? <Volume2 className="w-6 h-6 text-[#1A73E8]" /> : <VolumeX className="w-6 h-6" />}
            </div>
            <span className="text-[11px] text-[#5F6368] font-medium">
              {isSpeakerOn ? 'ስፒከር (በርቷል)' : 'ስፒከር (ጠፍቷል)'}
            </span>
          </button>

          {/* 4. Add call */}
          <button
            onClick={() => {}}
            className="flex flex-col items-center gap-1.5 group"
          >
            <div className="w-14 h-14 rounded-full bg-[#F1F3F4] hover:bg-[#E8EAED] flex items-center justify-center text-[#3C4043] active:scale-95 transition-all shadow-sm">
              <UserPlus className="w-6 h-6" />
            </div>
            <span className="text-[11px] text-[#5F6368]">ጥሪ ጨምር</span>
          </button>

          {/* 5. Hold */}
          <button
            onClick={() => setIsOnHold(!isOnHold)}
            className="flex flex-col items-center gap-1.5 group"
          >
            <div
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-sm ${
                isOnHold
                  ? 'bg-[#1A73E8] text-white shadow-md'
                  : 'bg-[#F1F3F4] hover:bg-[#E8EAED] text-[#3C4043] active:scale-95'
              }`}
            >
              {isOnHold ? <Play className="w-6 h-6" /> : <Pause className="w-6 h-6" />}
            </div>
            <span className="text-[11px] text-[#5F6368]">አቆይ</span>
          </button>

          {/* 6. Message / Quick reply */}
          <button
            onClick={() => setShowTextInput(!showTextInput)}
            className="flex flex-col items-center gap-1.5 group"
          >
            <div
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-sm ${
                showTextInput
                  ? 'bg-[#C2E7FF] text-[#001D35] ring-2 ring-[#1A73E8]'
                  : 'bg-[#F1F3F4] hover:bg-[#E8EAED] text-[#3C4043] active:scale-95'
              }`}
            >
              <MessageSquare className="w-6 h-6" />
            </div>
            <span className="text-[11px] text-[#5F6368]">መልስ ጻፍ</span>
          </button>
        </div>

        {/* Circular Red Hang Up Button */}
        <div className="w-full flex items-center justify-center">
          <button
            onClick={onEndCall}
            className="w-16 h-16 rounded-full bg-[#EA4335] hover:bg-[#D93025] active:scale-95 transition-all shadow-lg shadow-red-500/25 flex items-center justify-center text-white"
            aria-label="ጥሪ ዝጋ"
          >
            <PhoneOff className="w-7 h-7 fill-current" />
          </button>
        </div>
      </div>
    </div>
  );
};
