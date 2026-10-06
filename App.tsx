import { useState, useEffect, useRef } from 'react';
import {
  Phone,
  Clock,
  Users,
  Search,
  MoreVertical,
  X,
  User,
} from 'lucide-react';
import { TabType, CallState, IvrStep, CallLog, Contact } from './types';
import { phoneAudio } from './audio';
import { CbePhoneManager } from './cbeService';
import { loadLearnedClasses, LearnedTrainingClass } from './localBrain';
import { Keypad } from './Keypad';
import { ActiveCallScreen } from './ActiveCallScreen';
import { RecentsList } from './RecentsList';
import { ContactsList } from './ContactsList';
import { PWAInstallButton } from './PWAInstallButton';

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
  const [micPermissionDenied, setMicPermissionDenied] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState<boolean>(true);
  const [isTestMode, setIsTestMode] = useState<boolean>(false);
  const [isTeachMode, setIsTeachMode] = useState<boolean>(false);
  const [isTeachingTurnActive, setIsTeachingTurnActive] = useState<boolean>(false);
  const [draftStepsCount, setDraftStepsCount] = useState<number>(0);
  const [learnedClasses, setLearnedClasses] = useState<LearnedTrainingClass[]>(() =>
    loadLearnedClasses()
  );
  const [selectedClassId, setSelectedClassId] = useState<string | null>(() => {
    const initial = loadLearnedClasses();
    return initial.length > 0 ? initial[0].id : 'class_jurey';
  });
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

  // Call history & contacts
  const [callLogs, setCallLogs] = useState<CallLog[]>(INITIAL_LOGS);
  const [contacts] = useState<Contact[]>(INITIAL_CONTACTS);

  const managerRef = useRef<CbePhoneManager | null>(null);
  const timerRef = useRef<any>(null);

  // Initialize CBE Manager with event callbacks
  useEffect(() => {
    managerRef.current = new CbePhoneManager({
      onAgentSpeakingChange: (speaking) => {
        setIsAgentSpeaking(speaking);
      },
      onUserSpeakingChange: (speaking) => {
        setIsUserSpeaking(speaking);
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
      onError: (err) => {
        console.warn('Call manager warning:', err);
      },
    });

    return () => {
      if (managerRef.current) {
        managerRef.current.endCall();
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Call timer effect
  useEffect(() => {
    if (callState === 'connected') {
      timerRef.current = setInterval(() => {
        setDurationSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setDurationSeconds(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callState]);

  // Handle Initiating Call
  const handleStartCall = async (num: string) => {
    const targetNumber = num.trim() || '951';
    setCurrentCallNumber(targetNumber);
    setCallState('dialing');
    setDurationSeconds(0);
    setLiveTranscripts([]);
    setLiveUserSpeech('');
    setIsMuted(false);
    setIsSpeakerOn(true);
    phoneAudio.setSpeaker(true);
    phoneAudio.startRingback();

    // Log call
    const newLog: CallLog = {
      id: Date.now().toString(),
      name: targetNumber,
      number: targetNumber,
      type: 'outgoing',
      time: 'አሁን',
      duration: '00:00',
    };
    setCallLogs((prev) => [newLog, ...prev]);

    // Connect after 1.5s ring
    setTimeout(() => {
      phoneAudio.stopRingback();
      setCallState('connected');

      if (managerRef.current) {
        managerRef.current.startCall();

        // 951 flow: Play authentic welcome prompt
        if (targetNumber === '951' || targetNumber.includes('951')) {
          setIvrStep('welcome_menu');
          managerRef.current
            .playWelcomePrompt()
            .then(() => {
              // Waiting for DTMF key (e.g. 4)
            })
            .catch((e) => console.warn(e));
        } else {
          setIvrStep('active_call');
          managerRef.current.startListening(handleUserTurn);
        }
      }
    }, 1500);
  };

  // Toggle Mute
  const handleToggleMute = () => {
    setIsMuted((prev) => {
      const next = !prev;
      if (managerRef.current) {
        managerRef.current.setMuted(next);
      }
      return next;
    });
  };

  // Toggle Loudspeaker / Earpiece
  const handleToggleSpeaker = () => {
    setIsSpeakerOn((prev) => {
      const next = !prev;
      phoneAudio.setSpeaker(next);
      return next;
    });
  };

  // Handle DTMF keypad press during call
  const handleDtmfInput = async (digit: string) => {
    if (ivrStep === 'welcome_menu' && digit === '4') {
      setIvrStep('agent_intro');
      if (managerRef.current) {
        await managerRef.current.playAgentGreeting();
        setIvrStep('active_call');
        managerRef.current.startListening(handleUserTurn);
      }
    }
  };

  // Next turn callback
  const handleUserTurn = (userText: string) => {
    if (managerRef.current && userText.trim().length > 0) {
      managerRef.current.processUserMessage(userText, handleUserTurn);
    }
  };

  // Handle Ending Call
  const handleEndCall = () => {
    phoneAudio.stopRingback();
    if (managerRef.current) {
      managerRef.current.endCall();
    }
    setCallState('ended');
    setIvrStep('not_started');
    setIsAgentSpeaking(false);
    setIsUserSpeaking(false);

    setTimeout(() => {
      setCallState('idle');
      setCurrentCallNumber('');
    }, 800);
  };

  return (
    <div className="w-full min-h-screen bg-[#EEF2F6] flex items-center justify-center p-0 sm:p-4 text-[#202124] font-sans">
      {/* Phone Shell / Viewport (Clean Google Pixel Style in White Theme) */}
      <div className="relative w-full max-w-md h-screen sm:h-[840px] bg-white sm:rounded-[40px] overflow-hidden shadow-2xl flex flex-col border border-gray-200">
        {/* Active Call Overlay Screen */}
        {callState !== 'idle' ? (
          <ActiveCallScreen
            number={currentCallNumber}
            callState={callState}
            ivrStep={ivrStep}
            durationSeconds={durationSeconds}
            isAgentSpeaking={isAgentSpeaking}
            isUserSpeaking={isUserSpeaking}
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
          />
        ) : (
          /* Google Phone Main App Screen (White / Light Theme) */
          <div className="flex-1 flex flex-col justify-between h-full bg-white">
            {/* Top Search Bar (Google Pixel Phone Light Style) */}
            <div className="pt-4 px-4 pb-2">
              <div className="w-full h-12 bg-[#F1F3F4] hover:bg-[#E8EAED] rounded-full px-4 flex items-center justify-between text-[#3C4043] transition-colors shadow-sm">
                <div className="flex items-center gap-3">
                  <Search className="w-5 h-5 text-[#5F6368]" />
                  <span className="text-sm font-normal text-[#5F6368]">እውቂያዎችን ይፈልጉ...</span>
                </div>
                <div className="flex items-center gap-2">
                  <PWAInstallButton />
                  <MoreVertical className="w-4 h-4 text-[#5F6368]" />
                </div>
              </div>
            </div>

            {/* Main Content Area based on Selected Tab */}
            <div className="flex-1 overflow-hidden relative">
              {activeTab === 'recents' ? (
                <RecentsList logs={callLogs} onCall={handleStartCall} />
              ) : activeTab === 'contacts' ? (
                <ContactsList contacts={contacts} onCall={handleStartCall} />
              ) : (
                /* Speed Dial / Keypad View */
                <div className="w-full h-full flex flex-col">
                  {showKeypad ? (
                    <Keypad
                      number={dialNumber}
                      onNumberChange={setDialNumber}
                      onCall={handleStartCall}
                    />
                  ) : (
                    /* Speed Dial Favorites (Clean Light Google Style) */
                    <div className="p-4 flex flex-col gap-4">
                      <div className="text-xs font-medium text-[#5F6368] uppercase tracking-wider px-2">
                        ተመራጭ ቁጥሮች
                      </div>
                      <div
                        onClick={() => handleStartCall('951')}
                        className="bg-[#F8F9FA] hover:bg-[#F1F3F4] border border-gray-200 rounded-2xl p-4 flex items-center justify-between cursor-pointer transition-all shadow-sm group"
                      >
                        <div className="flex items-center gap-3.5">
                          <div className="w-12 h-12 rounded-full bg-[#E8F0FE] text-[#1A73E8] flex items-center justify-center font-bold text-base shadow-sm">
                            <User className="w-6 h-6 text-[#1A73E8]" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-base font-medium text-[#202124]">
                              951
                            </span>
                            <span className="text-xs text-[#5F6368]">
                              ስልክ
                            </span>
                          </div>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-[#E6F4EA] text-[#1E8E3E] flex items-center justify-center group-hover:bg-[#1E8E3E] group-hover:text-white transition-all">
                          <Phone className="w-5 h-5 fill-current" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Bottom Keypad Toggle */}
            <div className="px-6 py-1 flex items-center justify-center">
              {showKeypad && activeTab === 'speed_dial' && (
                <button
                  onClick={() => setShowKeypad(false)}
                  className="text-xs text-[#5F6368] hover:text-[#202124] py-1 px-3 rounded-full flex items-center gap-1 bg-[#F1F3F4]"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>የቁልፍ ሰሌዳ ደብቅ</span>
                </button>
              )}
            </div>

            {/* Bottom Navigation Bar (Google Material 3 Light Style) */}
            <div className="h-16 bg-[#F8F9FA] border-t border-gray-200 px-6 flex items-center justify-around select-none">
              {/* Dialpad Tab */}
              <button
                onClick={() => {
                  setActiveTab('speed_dial');
                  setShowKeypad(true);
                }}
                className={`flex flex-col items-center gap-1 py-1 transition-colors ${
                  activeTab === 'speed_dial'
                    ? 'text-[#001D35] font-semibold'
                    : 'text-[#444746] hover:text-[#1F1F1F]'
                }`}
              >
                <div
                  className={`px-4 py-0.5 rounded-full ${
                    activeTab === 'speed_dial' ? 'bg-[#C2E7FF]' : ''
                  }`}
                >
                  <Phone className="w-5 h-5" />
                </div>
                <span className="text-[11px]">መደወያ</span>
              </button>

              {/* Recents Tab */}
              <button
                onClick={() => {
                  setActiveTab('recents');
                  setShowKeypad(false);
                }}
                className={`flex flex-col items-center gap-1 py-1 transition-colors ${
                  activeTab === 'recents'
                    ? 'text-[#001D35] font-semibold'
                    : 'text-[#444746] hover:text-[#1F1F1F]'
                }`}
              >
                <div
                  className={`px-4 py-0.5 rounded-full ${
                    activeTab === 'recents' ? 'bg-[#C2E7FF]' : ''
                  }`}
                >
                  <Clock className="w-5 h-5" />
                </div>
                <span className="text-[11px]">የቅርብ ጊዜ</span>
              </button>

              {/* Contacts Tab */}
              <button
                onClick={() => {
                  setActiveTab('contacts');
                  setShowKeypad(false);
                }}
                className={`flex flex-col items-center gap-1 py-1 transition-colors ${
                  activeTab === 'contacts'
                    ? 'text-[#001D35] font-semibold'
                    : 'text-[#444746] hover:text-[#1F1F1F]'
                }`}
              >
                <div
                  className={`px-4 py-0.5 rounded-full ${
                    activeTab === 'contacts' ? 'bg-[#C2E7FF]' : ''
                  }`}
                >
                  <Users className="w-5 h-5" />
                </div>
                <span className="text-[11px]">ዕውቂያዎች</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
