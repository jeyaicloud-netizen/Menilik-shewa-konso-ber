import { useState, useEffect, useRef } from 'react';
import {
  Phone,
  Clock,
  Users,
  Search,
  MoreVertical,
  X,
  User,
  Plus,
  Trash2,
  Upload,
  Headphones,
  ArrowLeft,
  RotateCcw,
  PhoneForwarded,
  Code2,
  Download,
} from 'lucide-react';
import { TabType, CallState, IvrStep, CallLog, Contact } from './types';
import { phoneAudio } from './audio';
import { CbePhoneManager } from './cbeService';
import {
  loadLearnedClasses,
  LearnedTrainingClass,
  getSavedSelectedClassId,
  loadSupportAgents,
  SupportAgentCharacter,
  getSavedSelectedSupportAgentId,
  addSupportAgent,
  deleteSupportAgent,
  saveSupportAgentStepAudio,
  SUPPORT_AGENT_STEPS,
} from './localBrain';
import {
  loadSecretLiveBridgeConfig,
  saveSecretLiveBridgeConfig,
  SecretLiveBridgeConfig,
  SecretLiveCallPhase,
} from './secretLiveBridge';
import { Keypad } from './Keypad';
import { ActiveCallScreen } from './ActiveCallScreen';
import { RecentsList } from './RecentsList';
import { ContactsList } from './ContactsList';
import { PWAInstallButton } from './PWAInstallButton';
import { SupportAgentStudioModal } from './SupportAgentStudioModal';
import { SecretLiveBridgeModal } from './SecretLiveBridgeModal';

const CALL_LOGS_STORAGE_KEY = 'cbe_google_phone_call_logs_v1';

const INITIAL_LOGS: CallLog[] = [
  {
    id: '1',
    name: '951',
    number: '951',
    type: 'outgoing',
    time: 'ትናንት፣ 4:20 PM',
    duration: '02:45',
  },
  {
    id: '2',
    name: 'አቤል',
    number: '+251 911 234 567',
    type: 'incoming',
    time: 'ትናንት፣ 11:15 AM',
    duration: '01:10',
  },
  {
    id: '3',
    name: '951',
    number: '951',
    type: 'outgoing',
    time: 'መስከረም 28',
    duration: '03:12',
  },
  {
    id: '4',
    name: 'ኢትዮ ቴሌኮም',
    number: '994',
    type: 'outgoing',
    time: 'መስከረም 25',
    duration: '01:30',
  },
];

const INITIAL_CONTACTS: Contact[] = [
  {
    id: 'c1',
    name: '951',
    number: '951',
    label: 'ስልክ',
  },
  {
    id: 'c2',
    name: 'አቤል',
    number: '+251 911 234 567',
    label: 'ሞባይል',
  },
  {
    id: 'c3',
    name: 'ኢትዮ ቴሌኮም',
    number: '994',
    label: 'የደንበኞች አገልግሎት',
  },
  {
    id: 'c4',
    name: 'ፖሊስ',
    number: '991',
    label: 'አደጋ ጊዜ',
  },
];

export interface LiveTranscriptItem {
  id: string;
  speaker: 'user' | 'agent';
  text: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('speed_dial');
  const [showKeypad, setShowKeypad] = useState<boolean>(true);
  const [dialNumber, setDialNumber] = useState<string>('951');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Secret J11 Studio state (ONLY opened when user types "j11" in Contact Search Bar; never saved in recents!)
  const [isJ11StudioOpen, setIsJ11StudioOpen] = useState<boolean>(false);

  // Call state
  const [callState, setCallState] = useState<CallState>('idle');
  const [currentCallNumber, setCurrentCallNumber] = useState<string>('');
  const [ivrStep, setIvrStep] = useState<IvrStep>('not_started');
  const [durationSeconds, setDurationSeconds] = useState<number>(0);
  const [callStatusText, setCallStatusText] = useState<string>('');
  const [lastAgentPrompt, setLastAgentPrompt] = useState<string>('ምን ልርዳወት');
  const [liveTranscripts, setLiveTranscripts] = useState<LiveTranscriptItem[]>([]);
  const [liveUserSpeech, setLiveUserSpeech] = useState<string>('');
  const [micVolume, setMicVolume] = useState<number>(0);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState<boolean>(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState<boolean>(false);
  const [turnPhase, setTurnPhase] = useState<'red' | 'yellow' | 'green' | 'idle'>('idle');
  const [micPermissionDenied, setMicPermissionDenied] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState<boolean>(true);
  const [isTestMode, setIsTestMode] = useState<boolean>(false);
  const [isTeachMode, setIsTeachMode] = useState<boolean>(false);
  const [isTeachingTurnActive, setIsTeachingTurnActive] = useState<boolean>(false);
  const [draftStepsCount, setDraftStepsCount] = useState<number>(0);

  // Caller Characters (Jurey, Tariku, Abebe, Abdu, Bereket, Sewbehone, Ramid, Ahmed + Custom)
  const [learnedClasses, setLearnedClasses] = useState<LearnedTrainingClass[]>(() =>
    loadLearnedClasses()
  );
  const [selectedClassId, setSelectedClassId] = useState<string | null>(() => {
    const initial = loadLearnedClasses();
    const saved = getSavedSelectedClassId();
    if (initial.some((c) => c.id === saved)) return saved;
    return initial.length > 0 ? initial[0].id : 'class_jurey';
  });

  // Customer Support Characters (እድሪስ + Custom Support Voices with Step 1..17 MP3s)
  const [supportAgents, setSupportAgents] = useState<SupportAgentCharacter[]>(() =>
    loadSupportAgents()
  );
  const [selectedSupportAgentId, setSelectedSupportAgentId] = useState<string>(() =>
    getSavedSelectedSupportAgentId()
  );

  // Modals inside J11 Pre-Call Dashboard
  const [longPressedCharacter, setLongPressedCharacter] = useState<LearnedTrainingClass | null>(null);
  const charPressTimerRef = useRef<any>(null);
  const didCharLongPressRef = useRef<boolean>(false);
  const [showAddCharModal, setShowAddCharModal] = useState(false);
  const [newCharName, setNewCharName] = useState('');
  const [showAddSupportModal, setShowAddSupportModal] = useState(false);
  const [newSupportName, setNewSupportName] = useState('');
  const [newSupportLabel, setNewSupportLabel] = useState('');
  const [uploadingSupportAgent, setUploadingSupportAgent] = useState<SupportAgentCharacter | null>(null);
  const [secretBridgeConfig, setSecretBridgeConfig] = useState<SecretLiveBridgeConfig>(() =>
    loadSecretLiveBridgeConfig()
  );
  const [showSecretBridgeModal, setShowSecretBridgeModal] = useState(false);
  const [secretBridgeModalTab, setSecretBridgeModalTab] = useState<'config_mp3' | 'java_nide'>('config_mp3');
  const [secretLivePhase, setSecretLivePhase] = useState<SecretLiveCallPhase>('idle');
  const [secretLiveAttemptCount, setSecretLiveAttemptCount] = useState<number>(0);

  const [liveTiming, setLiveTiming] = useState<{ speakSeconds: number; pauseSeconds: number }>({
    speakSeconds: 0,
    pauseSeconds: 0,
  });
  const [learningStats, setLearningStats] = useState<{
    totalSamples: number;
    totalLearnedPhrases: number;
    currentStepSamples: number;
    currentStepPauseMs: number;
    currentStepSpeakMs: number;
    currentStepPatternsLabel?: string;
    currentStepPatterns?: any[];
  }>({
    totalSamples: 0,
    totalLearnedPhrases: 0,
    currentStepSamples: 0,
    currentStepPauseMs: 1200,
    currentStepSpeakMs: 2200,
    currentStepPatternsLabel: '',
    currentStepPatterns: [],
  });

  // Call history (persisted in LocalStorage so Long-Press Delete stays deleted!)
  const [callLogs, setCallLogs] = useState<CallLog[]>(() => {
    try {
      const saved = localStorage.getItem(CALL_LOGS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return INITIAL_LOGS;
  });
  const [contacts] = useState<Contact[]>(INITIAL_CONTACTS);

  const managerRef = useRef<CbePhoneManager | null>(null);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    managerRef.current = new CbePhoneManager({
      onAgentSpeakingChange: (speaking) => {
        setIsAgentSpeaking(speaking);
      },
      onUserSpeakingChange: (speaking) => {
        setIsUserSpeaking(speaking);
      },
      onTurnPhaseChange: (phase) => {
        setTurnPhase(phase);
      },
      onStatusChange: (status) => {
        setCallStatusText(status);
      },
      onMicVolume: (vol) => {
        setMicVolume(vol);
      },
      onTranscriptUpdate: (speaker, text) => {
        if (!text || !text.trim()) return;
        const cleanText = text.trim();
        const uniqueId = `${speaker}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

        if (speaker === 'agent') {
          setLastAgentPrompt(cleanText);
          setLiveUserSpeech('');
          setLiveTranscripts((prev) => [
            ...prev,
            { id: uniqueId, speaker: 'agent', text: cleanText },
          ]);
        } else if (speaker === 'user') {
          setLiveUserSpeech(cleanText);
          setLiveTranscripts((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.speaker === 'user') {
              return [...prev.slice(0, -1), { ...last, text: cleanText }];
            }
            return [...prev, { id: uniqueId, speaker: 'user', text: cleanText }];
          });
        }
      },
      onMicPermissionDenied: (denied) => {
        setMicPermissionDenied(denied);
      },
      onLiveTimingUpdate: (timing) => {
        setLiveTiming(timing);
      },
      onDraftClassProgressUpdate: (count) => {
        setDraftStepsCount(count);
      },
      onClassesUpdated: (classes, selId) => {
        setLearnedClasses(classes);
        setSelectedClassId(selId);
      },
      onLearningUpdate: (stats) => {
        setLearningStats(stats);
      },
      onSecretLivePhaseChange: (phase, attemptCount) => {
        setSecretLivePhase(phase);
        setSecretLiveAttemptCount(attemptCount);
      },
      onError: (err) => {
        console.warn('Call manager warning:', err);
      },
    });

    return () => {
      if (managerRef.current) {
        managerRef.current.endCall();
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (callState === 'connected') {
      setDurationSeconds(0);
      timerRef.current = setInterval(() => {
        setDurationSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [callState]);

  const saveCallLogsToStorage = (updated: CallLog[]) => {
    setCallLogs(updated);
    try {
      localStorage.setItem(CALL_LOGS_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const handleDeleteCallLog = (id: string) => {
    const updated = callLogs.filter((l) => l.id !== id);
    saveCallLogsToStorage(updated);
  };

  // Handle Search Input — Secret "j11" trigger!
  const handleSearchInputChange = (val: string) => {
    if (val.trim().toLowerCase() === 'j11') {
      // Immediately clear search box so "j11" is NEVER left in search or recents!
      setSearchQuery('');
      setIsJ11StudioOpen(true);
      return;
    }
    setSearchQuery(val);
  };

  const handleStartCall = (numberToDial: string, openInStudioMode?: boolean) => {
    const cleanNum = numberToDial.trim() || '951';
    // Never log "j11" in Call History!
    if (cleanNum.toLowerCase() === 'j11') {
      setSearchQuery('');
      setIsJ11StudioOpen(true);
      return;
    }

    const inStudio = openInStudioMode !== undefined ? openInStudioMode : isJ11StudioOpen;

    setCurrentCallNumber(cleanNum);
    setCallState('ringing');
    setIvrStep('not_started');
    setIsMuted(false);
    setTurnPhase('idle');
    setCallStatusText('በመደወል ላይ...');
    setLiveTranscripts([]);
    setLiveUserSpeech('');

    // When calling on the Normal Google Phone (!inStudio), automatically enable Test/Live Mode
    // so the selected Character + selected Customer Support Agent run automatically when 4 is pressed!
    if (!inStudio) {
      setIsTestMode(true);
      managerRef.current?.setTestMode(true);
    }

    const newLog: CallLog = {
      id: Date.now().toString(),
      name: cleanNum === '951' ? '951' : cleanNum,
      number: cleanNum,
      type: 'outgoing',
      time: 'አሁን',
    };
    saveCallLogsToStorage([newLog, ...callLogs]);

    phoneAudio.startRingback();

    setTimeout(() => {
      phoneAudio.stopRingback();
      phoneAudio.playCallConnected();
      setCallState('connected');

      if (managerRef.current) {
        managerRef.current.startCall();
        managerRef.current.setSelectedClassId(selectedClassId);
        managerRef.current.setSelectedSupportAgentId(selectedSupportAgentId);
        if (!inStudio) {
          managerRef.current.setTestMode(true);
        }

        if (cleanNum === '951') {
          setIvrStep('welcome_menu');
          managerRef.current.playWelcomePrompt().catch((e) => console.warn(e));
        } else {
          setIvrStep('active_call');
          managerRef.current.startListening(handleUserTurn);
        }
      }
    }, 1500);
  };

  const handleToggleMute = () => {
    setIsMuted((prev) => {
      const next = !prev;
      if (managerRef.current) {
        managerRef.current.setMuted(next);
      }
      return next;
    });
  };

  const handleToggleSpeaker = () => {
    setIsSpeakerOn((prev) => {
      const next = !prev;
      phoneAudio.setSpeaker(next);
      return next;
    });
  };

  const handleDtmfInput = async (digit: string) => {
    if (managerRef.current?.secretLivePhase === 'playing_survey_mp3') {
      managerRef.current.handleSecretSurveyRatingKey(digit);
      setTimeout(() => {
        handleEndCall();
      }, 1200);
      return;
    }

    if (ivrStep === 'welcome_menu' && digit === '4') {
      setIvrStep('agent_intro');
      if (managerRef.current) {
        // On Normal Google Phone (!isJ11StudioOpen), ensure Test/Live mode is active for the selected Class & Support Agent!
        if (!isJ11StudioOpen) {
          setIsTestMode(true);
          managerRef.current.setTestMode(true);
        }
        await managerRef.current.playAgentGreeting();
        setIvrStep('active_call');
        managerRef.current.startListening(handleUserTurn);
      }
    }
  };

  const handleUserTurn = (userText: string) => {
    if (managerRef.current && userText.trim().length > 0) {
      managerRef.current.processUserMessage(userText, handleUserTurn);
    }
  };

  const handleEndCall = () => {
    phoneAudio.stopRingback();
    if (managerRef.current) {
      managerRef.current.endCall();
    }
    setCallState('ended');
    setIvrStep('not_started');
    setIsAgentSpeaking(false);
    setIsUserSpeaking(false);
    setTurnPhase('idle');

    setTimeout(() => {
      setCallState('idle');
      setCurrentCallNumber('');
    }, 800);
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

  const activeSpeaker =
    learnedClasses.find((c) => c.id === selectedClassId) ||
    learnedClasses[0] || { id: 'class_jurey', name: 'Jurey', turnSequence: [] };

  const activeSupportAgent =
    supportAgents.find((a) => a.id === selectedSupportAgentId) ||
    supportAgents[0] || { id: 'support_edris', name: 'እድሪስ (ነባሪ)', uploadedSteps: {} };

  const filteredContacts = searchQuery.trim()
    ? contacts.filter(
        (c) =>
          c.name.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
          c.number.includes(searchQuery.trim())
      )
    : contacts;

  return (
    <div className="w-full min-h-screen bg-[#EEF2F6] flex items-center justify-center p-0 sm:p-4 text-[#202124] font-sans">
      <div className="relative w-full max-w-md h-screen sm:h-[840px] bg-white sm:rounded-[40px] overflow-hidden shadow-2xl flex flex-col border border-gray-200">
        {/* 1. Active Call Screen (Either Normal Google Phone Stealth Mode OR J11 Studio Mode) */}
        {callState !== 'idle' ? (
          <ActiveCallScreen
            number={currentCallNumber}
            callState={callState}
            ivrStep={ivrStep}
            durationSeconds={durationSeconds}
            isAgentSpeaking={isAgentSpeaking}
            isUserSpeaking={isUserSpeaking}
            turnPhase={turnPhase}
            isSecretStudioMode={isJ11StudioOpen}
            onExitSecretStudio={() => setIsJ11StudioOpen(false)}
            isMuted={isMuted}
            onToggleMute={handleToggleMute}
            isSpeakerOn={isSpeakerOn}
            onToggleSpeaker={handleToggleSpeaker}
            callStatusText={callStatusText}
            lastAgentPrompt={lastAgentPrompt}
            liveTranscripts={liveTranscripts}
            liveUserSpeech={liveUserSpeech}
            micVolume={micVolume}
            learningStats={learningStats}
            liveTiming={liveTiming}
            isTeachMode={isTeachMode}
            isTeachingTurnActive={isTeachingTurnActive}
            draftStepsCount={draftStepsCount}
            learnedClasses={learnedClasses}
            selectedClassId={selectedClassId}
            onStartTeachingTurn={() => {
              if (isTestMode) {
                setIsTestMode(false);
                managerRef.current?.setTestMode(false);
              }
              if (ivrStep === 'welcome_menu') {
                handleDtmfInput('4');
              }
              setIsTeachingTurnActive(true);
              managerRef.current?.startTeachingTurn();
            }}
            onFinishTeachingTurn={() => {
              setIsTeachingTurnActive(false);
              managerRef.current?.finishTeachingTurnAndAdvance();
            }}
            onSaveCompleteClass={() => {
              setIsTeachingTurnActive(false);
              managerRef.current?.saveCompleteClass();
            }}
            onSelectClass={(classId) => {
              setSelectedClassId(classId);
              managerRef.current?.setSelectedClassId(classId);
            }}
            onDeleteClass={(classId) => {
              managerRef.current?.deleteClassById(classId);
            }}
            onAddCustomClass={(name) => {
              managerRef.current?.addCustomClass(name);
            }}
            supportAgents={supportAgents}
            selectedSupportAgentId={selectedSupportAgentId}
            onSelectSupportAgent={(agentId) => {
              setSelectedSupportAgentId(agentId);
              managerRef.current?.setSelectedSupportAgentId(agentId);
            }}
            onAddSupportAgent={(name, voiceLabel) => {
              const updated = addSupportAgent(name, voiceLabel);
              setSupportAgents(updated);
              const newest = updated[updated.length - 1];
              if (newest) {
                setSelectedSupportAgentId(newest.id);
                managerRef.current?.setSelectedSupportAgentId(newest.id);
              }
            }}
            onDeleteSupportAgent={(agentId) => {
              const updated = deleteSupportAgent(agentId);
              setSupportAgents(updated);
              if (selectedSupportAgentId === agentId) {
                setSelectedSupportAgentId('support_edris');
                managerRef.current?.setSelectedSupportAgentId('support_edris');
              }
            }}
            onUploadSupportStepMp3={async (agentId, stepId, file) => {
              const updated = await saveSupportAgentStepAudio(agentId, stepId, file);
              setSupportAgents(updated);
            }}
            onSupportAgentsUpdated={(updated) => {
              setSupportAgents(updated);
            }}
            onToggleTeachMode={() => {
              const next = !isTeachMode;
              setIsTeachMode(next);
              if (next && isTestMode) {
                setIsTestMode(false);
                managerRef.current?.setTestMode(false);
              }
              if (next && ivrStep === 'welcome_menu') {
                handleDtmfInput('4');
              }
            }}
            onSavePatternOnly={(customText) => {
              managerRef.current?.savePatternOnly(customText);
            }}
            onGiveFeedback={(feedback) => {
              managerRef.current?.giveFeedback(feedback);
            }}
            isTestMode={isTestMode}
            onToggleTestMode={() => {
              const next = !isTestMode;
              setIsTestMode(next);
              setIsTeachingTurnActive(false);
              if (next && isTeachMode) {
                setIsTeachMode(false);
              }
              managerRef.current?.setTestMode(next);
              if (next && ivrStep === 'welcome_menu') {
                handleDtmfInput('4');
              }
            }}
            micPermissionDenied={micPermissionDenied}
            onRequestMicPermission={async () => {
              if (managerRef.current) {
                const granted = await managerRef.current.requestMicPermission();
                if (granted && ivrStep === 'active_call') {
                  managerRef.current.startListening(handleUserTurn);
                }
              }
            }}
            onSendUserText={handleUserTurn}
            onFinishSpeaking={() => {
              managerRef.current?.finishSpeakingManually();
            }}
            onEndCall={handleEndCall}
            onDtmfKey={handleDtmfInput}
            secretLivePhase={secretLivePhase}
            secretLiveAttemptCount={secretLiveAttemptCount}
            onSimulateSecretAnswered={() => managerRef.current?.triggerSecretLiveAnswered()}
            onSimulateSecretRemoteEnded={() => managerRef.current?.triggerSecretLiveRemoteEnded()}
            onOpenSecretBridgeModal={() => {
              setSecretBridgeModalTab('config_mp3');
              setShowSecretBridgeModal(true);
            }}
          />
        ) : isJ11StudioOpen ? (
          /* 2. SECRET J11 CONTROL & TRAINING PAGE (Opened when typing "j11" in Search Bar) */
          <div className="flex-1 flex flex-col justify-between h-full bg-slate-50 overflow-y-auto select-none">
            {/* Top Header */}
            <div className="bg-slate-900 text-white px-4 py-3.5 flex items-center justify-between shadow-sm">
              <button
                type="button"
                onClick={() => setIsJ11StudioOpen(false)}
                className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-full text-xs font-bold transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>ወደ ኖርማል Google Phone ተመለስ</span>
              </button>
              <span className="text-xs font-bold text-amber-300">🔐 J11 Studio</span>
            </div>

            <div className="flex-1 p-4 space-y-4 overflow-y-auto">
              {/* Active Selection Summary Card */}
              <div className="bg-white border border-purple-200 rounded-2xl p-3.5 shadow-xs">
                <div className="text-xs font-bold text-slate-800 mb-1">
                  ✅ አሁን ለ 951 ጥሪ የተመረጡት (Ready for Normal Call)፦
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="px-3 py-1 rounded-full bg-purple-100 text-purple-900 font-bold">
                    👤 ደዋይ፦ {activeSpeaker.name} ({activeSpeaker.turnSequence?.length || 0} ደረጃ)
                  </span>
                  <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-900 font-bold">
                    🎧 Support፦ {activeSupportAgent.name}
                  </span>
                  {secretBridgeConfig.enabled && (
                    <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-900 font-bold">
                      📞 ድብቅ ቀጥታ ጥሪ፦ {secretBridgeConfig.targetPhoneNumber} (በ951 ስም)
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                  እዚህ የመረጥከው ካራክተር እና Customer Support ተዘጋጅተዋል። ወደ ኖርማል ስልክ ተመልሰህ <strong>951</strong> ደውለህ <strong>4</strong> ስትነካ በቀጥታ ይሰራሉ!
                </p>
              </div>

              {/* Card 1: Caller Characters (Long-Press for Delete / New Learn + Add New Character) */}
              <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xs font-bold text-slate-900">
                      👥 1. የደዋይ ካራክተሮች (Caller Characters)
                    </h2>
                    <p className="text-[10.5px] text-slate-500">
                      ለመምረጥ አንዴ ይንኩ • ለ <strong>Delete / New Learn</strong> ጫን ብለው ይያዙ (Long Press)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddCharModal(true)}
                    className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-full text-[11px] font-bold flex items-center gap-1 shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" /> New Character
                  </button>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap pt-1">
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
                          setSelectedClassId(cls.id);
                          managerRef.current?.setSelectedClassId(cls.id);
                        }}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border flex items-center gap-1.5 select-none ${
                          isSelected
                            ? 'bg-purple-600 text-white border-purple-700 shadow-sm ring-2 ring-purple-200'
                            : count > 0
                              ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-300'
                              : 'bg-slate-50 hover:bg-purple-50 text-slate-700 border-slate-300'
                        }`}
                      >
                        <span>{cls.name}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                            isSelected
                              ? 'bg-white/25 text-white'
                              : count > 0
                                ? 'bg-emerald-200/80 text-emerald-900'
                                : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Card 2: Customer Support Characters (እድሪስ + Custom Support Voices with Step 1..20+ MP3/Voice Studio) */}
              <div className="bg-white border border-blue-200 rounded-2xl p-3.5 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xs font-bold text-blue-950 flex items-center gap-1.5">
                      <Headphones className="w-4 h-4 text-blue-600" />
                      <span>2. Customer Support ድምፆች (እድሪስ እና ሌሎች)</span>
                    </h2>
                    <p className="text-[10.5px] text-slate-500">
                      Step 1..20+ MP3 መጫን፣ በድምፅ መቅዳት፣ መቁረጥ (Cut/Trim) እና መቀጠል (+) ይችላሉ
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddSupportModal(true)}
                    className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-[11px] font-bold flex items-center gap-1 shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Support
                  </button>
                </div>

                <div className="flex flex-col gap-2 pt-1">
                  {supportAgents.map((agent) => {
                    const isSel = selectedSupportAgentId === agent.id;
                    const uploadedCount = Object.keys(agent.uploadedSteps || {}).length;
                    const totalSteps = Math.max(20, agent.maxStepsCount || 20);
                    return (
                      <div
                        key={agent.id}
                        className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-all ${
                          isSel
                            ? 'bg-blue-50/90 border-blue-500 ring-2 ring-blue-200'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSupportAgentId(agent.id);
                            managerRef.current?.setSelectedSupportAgentId(agent.id);
                          }}
                          className="flex-1 text-left flex items-center gap-2.5"
                        >
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                              isSel ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            🎧
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                              <span>{agent.name}</span>
                              {isSel && (
                                <span className="text-[9.5px] bg-blue-600 text-white px-2 py-0.2 rounded-full">
                                  ተመርጧል
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {agent.voiceTypeLabel} • {uploadedCount}/{totalSteps} Steps ተጭኗል
                            </div>
                          </div>
                        </button>

                        {!agent.isDefault && (
                          <button
                            type="button"
                            onClick={() => setUploadingSupportAgent(agent)}
                            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-full text-[11px] font-bold flex items-center gap-1 shadow-xs"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            <span>Step Studio (MP3/ቅዳ/Edit)</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Card 2.5: Secret Live Phone Bridge (4 ሲነካ ወደ 0965848508 በድብቅ መደወያ + Busy/Survey MP3 + Java N-IDE + GitHub ZIP) */}
              <div className="bg-white border border-emerald-200 rounded-2xl p-3.5 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                      <PhoneForwarded className="w-4 h-4 text-emerald-600" />
                      <span>3. ድብቅ የቀጥታ ስልክ ጥሪ (4 ሲነካ ወደ {secretBridgeConfig.targetPhoneNumber})</span>
                    </h2>
                    <p className="text-[10.5px] text-slate-500">
                      ስክሪኑ ላይ <strong>951</strong> ብቻ እየታየ በድብቅ ይደውላል • 2 ጊዜ ጠርቶ ካልተነሳ Busy MP3 እያጫወተ ድጋሚ ይደውላል • ስልኩ ሲዘጋ የአስተያየት መስጫ MP3 ይጫወታል
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const updated = saveSecretLiveBridgeConfig({
                        enabled: !secretBridgeConfig.enabled,
                      });
                      setSecretBridgeConfig(updated);
                    }}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-all shrink-0 shadow-xs ${
                      secretBridgeConfig.enabled
                        ? 'bg-emerald-600 text-white ring-2 ring-emerald-200'
                        : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                    }`}
                  >
                    {secretBridgeConfig.enabled ? '✅ በርቷል (ON)' : '⚪ ጠፍቷል (OFF)'}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSecretBridgeModalTab('config_mp3');
                      setShowSecretBridgeModal(true);
                    }}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-bold flex items-center gap-1.5 shadow-xs"
                  >
                    <PhoneForwarded className="w-3.5 h-3.5" />
                    <span>ስልክ ቁጥር እና Busy / Survey MP3 Studio ክፈት</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSecretBridgeModalTab('java_nide');
                      setShowSecretBridgeModal(true);
                    }}
                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[11px] font-bold flex items-center gap-1.5 shadow-xs"
                  >
                    <Code2 className="w-3.5 h-3.5" />
                    <span>📱 Java N-IDE ሙሉ ኮድ (XML + Java)</span>
                  </button>

                  <a
                    href="/api/export-github-zip"
                    download="cbe-951-github-vercel-root.zip"
                    className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[11px] font-bold flex items-center gap-1.5 shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    <span>📦 GitHub Root ZIP አውርድ (ለVercel)</span>
                  </a>
                </div>
              </div>

              {/* Card 3: Launch Call Inside J11 Studio for Training or Testing */}
              <div className="bg-gradient-to-r from-amber-500 to-purple-600 rounded-2xl p-4 text-white shadow-md flex flex-col gap-2.5">
                <div className="text-xs font-bold">
                  🎓 እዚሁ J11 ውስጥ ማስተማር ወይም መፈተሽ ይፈልጋሉ?
                </div>
                <p className="text-[11px] text-white/90">
                  «{activeSpeaker.name}»ን ከ «{activeSupportAgent.name}» ጋር እዚሁ J11 ውስጥ ደውለው ለማስተማር (`🎓 አስተምር ➔ ✅ ጨረስኩ ➔ 💾 ሙሉ ለሙሉ ጨረስኩ`) ወይም ለመፈተሽ (`🧪 Test`) ከታች ያለውን ይንኩ፦
                </p>
                <button
                  type="button"
                  onClick={() => handleStartCall('951', true)}
                  className="w-full py-2.5 bg-white text-slate-900 hover:bg-slate-100 rounded-xl text-xs font-extrabold shadow flex items-center justify-center gap-2 active:scale-98 transition-all"
                >
                  <Phone className="w-4 h-4 text-emerald-600 fill-current" />
                  <span>በ J11 Studio ውስጥ 951 ደውል (አስተምር / Test)</span>
                </button>
              </div>
            </div>

            {/* Modals inside J11 Pre-Call Dashboard */}
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
                      setSelectedClassId(longPressedCharacter.id);
                      managerRef.current?.setSelectedClassId(longPressedCharacter.id);
                      setLongPressedCharacter(null);
                      handleStartCall('951', true);
                    }}
                    className="w-full py-2.5 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-xs flex items-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4 text-amber-700" />
                    <span>🎓 New Learn (አዲስ አስተምር)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      managerRef.current?.deleteClassById(longPressedCharacter.id);
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
                          managerRef.current?.addCustomClass(newCharName.trim());
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
                          const updated = addSupportAgent(
                            newSupportName.trim(),
                            newSupportLabel.trim()
                          );
                          setSupportAgents(updated);
                          const newest = updated[updated.length - 1];
                          if (newest) {
                            setSelectedSupportAgentId(newest.id);
                            managerRef.current?.setSelectedSupportAgentId(newest.id);
                            setUploadingSupportAgent(newest);
                          }
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

            {uploadingSupportAgent && (
              <SupportAgentStudioModal
                agent={uploadingSupportAgent}
                allAgents={supportAgents}
                onClose={() => setUploadingSupportAgent(null)}
                onAgentsUpdated={(updated) => setSupportAgents(updated)}
                onAgentDeleted={(deletedId, updated) => {
                  setSupportAgents(updated);
                  if (selectedSupportAgentId === deletedId) {
                    setSelectedSupportAgentId('support_edris');
                    managerRef.current?.setSelectedSupportAgentId('support_edris');
                  }
                }}
              />
            )}

            {showSecretBridgeModal && (
              <SecretLiveBridgeModal
                initialTab={secretBridgeModalTab}
                onClose={() => setShowSecretBridgeModal(false)}
                onConfigUpdated={(cfg) => setSecretBridgeConfig(cfg)}
              />
            )}
          </div>
        ) : (
          /* 3. Normal Google Phone Main Screen (100% Authentic Google Phone) */
          <div className="flex-1 flex flex-col justify-between h-full bg-white">
            {/* Top Search Bar (Type "j11" here to enter Secret Studio!) */}
            <div className="pt-4 px-4 pb-2">
              <div className="w-full h-12 bg-[#F1F3F4] hover:bg-[#E8EAED] rounded-full px-4 flex items-center justify-between text-[#3C4043] transition-colors shadow-sm">
                <div className="flex items-center gap-3 flex-1">
                  <Search className="w-5 h-5 text-[#5F6368] shrink-0" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearchInputChange(e.target.value)}
                    placeholder="እውቂያዎችን ይፈልጉ..."
                    className="w-full bg-transparent text-sm text-[#202124] placeholder-[#5F6368] focus:outline-none"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="text-[#5F6368] hover:text-[#202124]"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <PWAInstallButton />
                  <MoreVertical className="w-4 h-4 text-[#5F6368]" />
                </div>
              </div>
            </div>

            {/* Main Content Area based on Selected Tab */}
            <div className="flex-1 overflow-hidden relative">
              {searchQuery.trim() ? (
                <ContactsList
                  contacts={filteredContacts}
                  onCall={(num) => handleStartCall(num, false)}
                />
              ) : activeTab === 'recents' ? (
                <RecentsList
                  logs={callLogs}
                  onCall={(num) => handleStartCall(num, false)}
                  onDeleteLog={handleDeleteCallLog}
                />
              ) : activeTab === 'contacts' ? (
                <ContactsList
                  contacts={contacts}
                  onCall={(num) => handleStartCall(num, false)}
                />
              ) : (
                <div className="w-full h-full flex flex-col">
                  {showKeypad ? (
                    <Keypad
                      number={dialNumber}
                      onNumberChange={setDialNumber}
                      onCall={(num) => handleStartCall(num, false)}
                    />
                  ) : (
                    <div className="p-4 flex flex-col gap-4">
                      <div className="text-xs font-medium text-[#5F6368] uppercase tracking-wider px-2">
                        ተመራጭ ቁጥሮች
                      </div>
                      <div
                        onClick={() => handleStartCall('951', false)}
                        className="p-4 rounded-2xl bg-[#F8F9FA] hover:bg-[#F1F3F4] border border-gray-200 flex items-center justify-between cursor-pointer transition-all shadow-sm"
                      >
                        <div className="flex items-center gap-3.5">
                          <div className="w-12 h-12 rounded-full bg-[#E8F0FE] text-[#1A73E8] flex items-center justify-center font-semibold text-base">
                            <User className="w-6 h-6" />
                          </div>
                          <div>
                            <div className="text-base font-medium text-[#202124]">951</div>
                            <div className="text-xs text-[#5F6368]">ስልክ • 951</div>
                          </div>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-[#1E8E3E] text-white flex items-center justify-center shadow">
                          <Phone className="w-4 h-4 fill-current" />
                        </div>
                      </div>

                      <button
                        onClick={() => setShowKeypad(true)}
                        className="fixed bottom-24 right-6 w-14 h-14 rounded-2xl bg-[#1A73E8] hover:bg-[#1557B0] text-white shadow-xl flex items-center justify-center transition-all"
                        title="ቁልፍ ሰሌዳ ክፈት"
                      >
                        <Phone className="w-6 h-6" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Bottom Navigation Bar (Google Material 3 Light Pill Indicators) */}
            <div className="h-20 bg-[#F8F9FA] border-t border-gray-200 flex items-center justify-around px-4 z-20">
              <button
                onClick={() => {
                  setActiveTab('speed_dial');
                  setShowKeypad(true);
                }}
                className="flex flex-col items-center gap-1 py-1 px-5 group"
              >
                <div
                  className={`px-5 py-1.5 rounded-full transition-all ${
                    activeTab === 'speed_dial'
                      ? 'bg-[#C2E7FF] text-[#001D35]'
                      : 'text-[#5F6368] group-hover:bg-gray-200/60'
                  }`}
                >
                  <Phone className="w-5 h-5" />
                </div>
                <span
                  className={`text-xs font-medium ${
                    activeTab === 'speed_dial' ? 'text-[#202124] font-semibold' : 'text-[#5F6368]'
                  }`}
                >
                  ቁልፍ ሰሌዳ
                </span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('recents');
                  setShowKeypad(false);
                }}
                className="flex flex-col items-center gap-1 py-1 px-5 group"
              >
                <div
                  className={`px-5 py-1.5 rounded-full transition-all ${
                    activeTab === 'recents'
                      ? 'bg-[#C2E7FF] text-[#001D35]'
                      : 'text-[#5F6368] group-hover:bg-gray-200/60'
                  }`}
                >
                  <Clock className="w-5 h-5" />
                </div>
                <span
                  className={`text-xs font-medium ${
                    activeTab === 'recents' ? 'text-[#202124] font-semibold' : 'text-[#5F6368]'
                  }`}
                >
                  የቅርብ ጊዜ
                </span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('contacts');
                  setShowKeypad(false);
                }}
                className="flex flex-col items-center gap-1 py-1 px-5 group"
              >
                <div
                  className={`px-5 py-1.5 rounded-full transition-all ${
                    activeTab === 'contacts'
                      ? 'bg-[#C2E7FF] text-[#001D35]'
                      : 'text-[#5F6368] group-hover:bg-gray-200/60'
                  }`}
                >
                  <Users className="w-5 h-5" />
                </div>
                <span
                  className={`text-xs font-medium ${
                    activeTab === 'contacts' ? 'text-[#202124] font-semibold' : 'text-[#5F6368]'
                  }`}
                >
                  እውቂያዎች
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
