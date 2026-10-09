import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Mic,
  Square,
  Trash2,
  Scissors,
  Plus,
  Play,
  Pause,
  Check,
  X,
  Volume2,
  Sparkles,
} from 'lucide-react';
import {
  SupportAgentCharacter,
  SupportAgentStepDef,
  getAgentStepDefs,
  saveSupportAgentStepAudio,
  deleteSupportAgentStepAudio,
  expandSupportAgentSteps,
  getSupportAgentStepBlob,
  getSupportAgentStepPreviewUrl,
  deleteSupportAgent,
} from './localBrain';
import {
  decodeAudioBlob,
  extractWaveformPeaks,
  trimAudioBuffer,
  cutRegionFromAudioBuffer,
  concatAudioBuffers,
  audioBufferToWavFile,
} from './audioEditorUtils';

interface SupportAgentStudioModalProps {
  agent: SupportAgentCharacter;
  allAgents: SupportAgentCharacter[];
  onClose: () => void;
  onAgentsUpdated: (updated: SupportAgentCharacter[]) => void;
  onAgentDeleted?: (deletedId: string, updated: SupportAgentCharacter[]) => void;
}

export const SupportAgentStudioModal: React.FC<SupportAgentStudioModalProps> = ({
  agent,
  allAgents,
  onClose,
  onAgentsUpdated,
  onAgentDeleted,
}) => {
  const currentAgent = allAgents.find((a) => a.id === agent.id) || agent;
  const stepDefs = getAgentStepDefs(currentAgent);

  // Target Step Picker for Quick Upload / Quick Voice Record
  const [selectedTargetStepId, setSelectedTargetStepId] = useState<string>('step_1');

  // Direct Voice Recording State (for any chosen Step)
  const [isRecordingStep, setIsRecordingStep] = useState<boolean>(false);
  const [recordingStepId, setRecordingStepId] = useState<string | null>(null);
  const [recordSeconds, setRecordSeconds] = useState<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<any>(null);

  // Preview Playback State
  const [playingStepId, setPlayingStepId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Long-Press State on a Step Row
  const [longPressedStep, setLongPressedStep] = useState<SupportAgentStepDef | null>(null);
  const stepLongPressTimerRef = useRef<any>(null);
  const didStepLongPressRef = useRef<boolean>(false);

  // Full Step MP3 / Voice Editor State (Trim / Cut / + Upload MP3 / + Record Voice)
  const [editingStep, setEditingStep] = useState<SupportAgentStepDef | null>(null);
  const [editorBuffer, setEditorBuffer] = useState<AudioBuffer | null>(null);
  const [editorPeaks, setEditorPeaks] = useState<number[]>([]);
  const [selectionStartSec, setSelectionStartSec] = useState<number>(0);
  const [selectionEndSec, setSelectionEndSec] = useState<number>(0);
  const [editorStatus, setEditorStatus] = useState<string>('');
  const [isEditorPlaying, setIsEditorPlaying] = useState<boolean>(false);
  const [isPlusRecording, setIsPlusRecording] = useState<boolean>(false);
  const [plusRecordSeconds, setPlusRecordSeconds] = useState<number>(0);
  const plusRecorderRef = useRef<MediaRecorder | null>(null);
  const plusChunksRef = useRef<Blob[]>([]);
  const plusTimerRef = useRef<any>(null);
  const editorAudioCtxRef = useRef<AudioContext | null>(null);
  const editorSourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    return () => {
      stopPreviewAudio();
      stopEditorPlayback();
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      if (plusTimerRef.current) clearInterval(plusTimerRef.current);
    };
  }, []);

  const stopPreviewAudio = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    setPlayingStepId(null);
  };

  const handleTogglePlayStep = async (stepId: string) => {
    if (playingStepId === stepId) {
      stopPreviewAudio();
      return;
    }
    stopPreviewAudio();
    let url = getSupportAgentStepPreviewUrl(currentAgent.id, stepId);
    if (!url) {
      const blob = await getSupportAgentStepBlob(currentAgent.id, stepId);
      if (blob) {
        url = URL.createObjectURL(blob);
      }
    }
    if (!url) return;

    const audio = new Audio(url);
    previewAudioRef.current = audio;
    setPlayingStepId(stepId);
    audio.onended = () => {
      setPlayingStepId(null);
    };
    audio.onerror = () => {
      setPlayingStepId(null);
    };
    audio.play().catch(() => setPlayingStepId(null));
  };

  // Start direct voice recording into a chosen Step (Step 1..20+)
  const startStepVoiceRecording = async (targetStepId: string) => {
    stopPreviewAudio();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      recordChunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordChunksRef.current.push(e.data);
        }
      };

      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recordTimerRef.current) {
          clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
        const rawBlob = new Blob(recordChunksRef.current, { type: mr.mimeType || 'audio/webm' });
        if (rawBlob.size > 0) {
          try {
            const decoded = await decodeAudioBlob(rawBlob);
            const wavFile = audioBufferToWavFile(
              decoded,
              `Voice_${targetStepId}_${decoded.duration.toFixed(1)}s.wav`
            );
            const updated = await saveSupportAgentStepAudio(
              currentAgent.id,
              targetStepId,
              wavFile
            );
            onAgentsUpdated(updated);
          } catch {
            const fallbackFile = new File([rawBlob], `Voice_${targetStepId}.webm`, {
              type: rawBlob.type || 'audio/webm',
            });
            const updated = await saveSupportAgentStepAudio(
              currentAgent.id,
              targetStepId,
              fallbackFile
            );
            onAgentsUpdated(updated);
          }
        }
        setIsRecordingStep(false);
        setRecordingStepId(null);
        setRecordSeconds(0);
      };

      mr.start(150);
      setIsRecordingStep(true);
      setRecordingStepId(targetStepId);
      setRecordSeconds(0);
      const startMs = Date.now();
      recordTimerRef.current = setInterval(() => {
        setRecordSeconds(Number(((Date.now() - startMs) / 1000).toFixed(1)));
      }, 100);
    } catch (err) {
      console.warn('Mic recording error:', err);
    }
  };

  const stopStepVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  // Long-Press Handlers for each Step row
  const startStepLongPress = (step: SupportAgentStepDef) => {
    didStepLongPressRef.current = false;
    if (stepLongPressTimerRef.current) clearTimeout(stepLongPressTimerRef.current);
    stepLongPressTimerRef.current = setTimeout(() => {
      didStepLongPressRef.current = true;
      setLongPressedStep(step);
    }, 520);
  };

  const cancelStepLongPress = () => {
    if (stepLongPressTimerRef.current) {
      clearTimeout(stepLongPressTimerRef.current);
      stepLongPressTimerRef.current = null;
    }
  };

  // Open the Studio Audio Editor for a specific Step
  const openStepAudioEditor = async (step: SupportAgentStepDef) => {
    stopPreviewAudio();
    setLongPressedStep(null);
    setEditingStep(step);
    setEditorStatus('ድምፁን በመጫን ላይ...');

    const blob = await getSupportAgentStepBlob(currentAgent.id, step.stepId);
    if (!blob) {
      setEditorBuffer(null);
      setEditorPeaks([]);
      setSelectionStartSec(0);
      setSelectionEndSec(0);
      setEditorStatus('ይህ Step ባዶ ነው — ከታች MP3 ይጫኑ ወይም በድምፅ ይቅዱ!');
      return;
    }

    try {
      const buffer = await decodeAudioBlob(blob);
      setEditorBuffer(buffer);
      setEditorPeaks(extractWaveformPeaks(buffer, 60));
      setSelectionStartSec(0);
      setSelectionEndSec(Number(buffer.duration.toFixed(2)));
      setEditorStatus(`ርዝመት፦ ${buffer.duration.toFixed(2)} ሰከንድ — ለመቁረጥ ወይም ለመቀጠል (+) ዝግጁ ነው`);
    } catch (e) {
      console.warn('Failed to decode audio for editor:', e);
      setEditorBuffer(null);
      setEditorPeaks([]);
      setEditorStatus('ይህን ድምፅ ለኤዲተር መክፈት አልተቻለም፤ አዲስ MP3 ወይም ድምፅ ይጨምሩ።');
    }
  };

  const stopEditorPlayback = () => {
    if (editorSourceNodeRef.current) {
      try {
        editorSourceNodeRef.current.stop();
      } catch {}
      editorSourceNodeRef.current = null;
    }
    if (editorAudioCtxRef.current && editorAudioCtxRef.current.state !== 'closed') {
      editorAudioCtxRef.current.close().catch(() => {});
      editorAudioCtxRef.current = null;
    }
    setIsEditorPlaying(false);
  };

  const playEditorBufferRange = async (onlySelectedRange: boolean = false) => {
    if (!editorBuffer) return;
    if (isEditorPlaying) {
      stopEditorPlayback();
      return;
    }

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx();
    editorAudioCtxRef.current = ctx;
    const source = ctx.createBufferSource();
    source.buffer = editorBuffer;
    source.connect(ctx.destination);
    editorSourceNodeRef.current = source;

    setIsEditorPlaying(true);
    source.onended = () => {
      setIsEditorPlaying(false);
    };

    if (onlySelectedRange) {
      const start = Math.max(0, Math.min(selectionStartSec, selectionEndSec));
      const dur = Math.max(0.1, Math.abs(selectionEndSec - selectionStartSec));
      source.start(0, start, dur);
    } else {
      source.start(0);
    }
  };

  // 1) Trim: Keep ONLY [selectionStartSec, selectionEndSec]
  const handleTrimKeepSelection = () => {
    if (!editorBuffer) return;
    stopEditorPlayback();
    const start = Math.max(0, Math.min(selectionStartSec, selectionEndSec));
    const end = Math.min(editorBuffer.duration, Math.max(selectionStartSec, selectionEndSec));
    if (end - start < 0.15) {
      setEditorStatus('⚠️ የሚቀረው ድምፅ ቢያንስ 0.2 ሰከንድ መሆን አለበት');
      return;
    }
    const trimmed = trimAudioBuffer(editorBuffer, start, end);
    setEditorBuffer(trimmed);
    setEditorPeaks(extractWaveformPeaks(trimmed, 60));
    setSelectionStartSec(0);
    setSelectionEndSec(Number(trimmed.duration.toFixed(2)));
    setEditorStatus(`✂️ ተቆርጧል (Trimmed)! አዲስ ርዝመት፦ ${trimmed.duration.toFixed(2)}s`);
  };

  // 2) Cut Middle: Remove [selectionStartSec, selectionEndSec] and join the rest
  const handleCutRemoveSelection = () => {
    if (!editorBuffer) return;
    stopEditorPlayback();
    const start = Math.max(0, Math.min(selectionStartSec, selectionEndSec));
    const end = Math.min(editorBuffer.duration, Math.max(selectionStartSec, selectionEndSec));
    if (end - start <= 0.05) {
      setEditorStatus('⚠️ የሚቆረጠውን ቦታ በመጀመሪያና መጨረሻ ስላይደሩ ይምረጡ');
      return;
    }
    if (end - start >= editorBuffer.duration - 0.1) {
      setEditorStatus('⚠️ ሙሉ ድምፁን መቁረጥ አይቻልም፤ የተወሰነ ክፍል ብቻ ይምረጡ');
      return;
    }
    const afterCut = cutRegionFromAudioBuffer(editorBuffer, start, end);
    setEditorBuffer(afterCut);
    setEditorPeaks(extractWaveformPeaks(afterCut, 60));
    setSelectionStartSec(0);
    setSelectionEndSec(Number(afterCut.duration.toFixed(2)));
    setEditorStatus(`✂️ የተመረጠው ክፍል ወጥቷል (Cut)! አዲስ ርዝመት፦ ${afterCut.duration.toFixed(2)}s`);
  };

  // 3) Plus (+) Upload MP3: Merge another MP3 onto the end of this Step's audio!
  const handlePlusUploadMp3 = async (file: File) => {
    stopEditorPlayback();
    setEditorStatus('➕ አዲሱን MP3 ከነባሩ ድምፅ ጋር በመቀጠል (Plus/Merge) ላይ...');
    try {
      const incomingBuffer = await decodeAudioBlob(file);
      const merged = editorBuffer
        ? concatAudioBuffers(editorBuffer, incomingBuffer)
        : incomingBuffer;
      setEditorBuffer(merged);
      setEditorPeaks(extractWaveformPeaks(merged, 60));
      setSelectionStartSec(0);
      setSelectionEndSec(Number(merged.duration.toFixed(2)));
      setEditorStatus(
        `➕ ተቀጥሏል (Merged)! አጠቃላይ የ Step ድምፅ ርዝመት፦ ${merged.duration.toFixed(2)}s — «💾 Save» ይንኩ`
      );
    } catch (e) {
      console.warn('Plus MP3 decode error:', e);
      setEditorStatus('⚠️ የተመረጠውን የድምፅ ፋይል ማንበብ አልተቻለም');
    }
  };

  // 4) Plus (+) Voice Record: Record voice directly and merge it onto the end of this Step's audio!
  const startPlusVoiceRecord = async () => {
    stopEditorPlayback();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const mr = new MediaRecorder(stream);
      plusRecorderRef.current = mr;
      plusChunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) plusChunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (plusTimerRef.current) {
          clearInterval(plusTimerRef.current);
          plusTimerRef.current = null;
        }
        setIsPlusRecording(false);
        setPlusRecordSeconds(0);

        const recBlob = new Blob(plusChunksRef.current, { type: mr.mimeType || 'audio/webm' });
        if (recBlob.size > 0) {
          setEditorStatus('➕ የተቀዳውን ድምፅ ከነባሩ ጋር በመቀጠል (Plus) ላይ...');
          try {
            const incomingBuffer = await decodeAudioBlob(recBlob);
            const merged = editorBuffer
              ? concatAudioBuffers(editorBuffer, incomingBuffer)
              : incomingBuffer;
            setEditorBuffer(merged);
            setEditorPeaks(extractWaveformPeaks(merged, 60));
            setSelectionStartSec(0);
            setSelectionEndSec(Number(merged.duration.toFixed(2)));
            setEditorStatus(
              `➕ የተቀዳው ድምፅ ተቀጥሏል! አዲስ ርዝመት፦ ${merged.duration.toFixed(2)}s — «💾 Save» ይንኩ`
            );
          } catch (e) {
            console.warn('Plus voice decode error:', e);
            setEditorStatus('⚠️ የተቀዳውን ድምፅ መቀጠል አልተቻለም');
          }
        }
      };

      mr.start(150);
      setIsPlusRecording(true);
      setPlusRecordSeconds(0);
      const startMs = Date.now();
      plusTimerRef.current = setInterval(() => {
        setPlusRecordSeconds(Number(((Date.now() - startMs) / 1000).toFixed(1)));
      }, 100);
    } catch (err) {
      console.warn('Plus mic error:', err);
      setEditorStatus('⚠️ የማይክሮፎን ፈቃድ አልተሰጠም');
    }
  };

  const stopPlusVoiceRecord = () => {
    if (plusRecorderRef.current && plusRecorderRef.current.state !== 'inactive') {
      plusRecorderRef.current.stop();
    }
  };

  // Save edited/merged AudioBuffer as the permanent unified audio for this Step!
  const handleSaveEditedStepAudio = async () => {
    if (!editingStep || !editorBuffer) return;
    stopEditorPlayback();
    const wavFile = audioBufferToWavFile(
      editorBuffer,
      `Edited_${editingStep.stepId}_${editorBuffer.duration.toFixed(1)}s.wav`
    );
    const updated = await saveSupportAgentStepAudio(
      currentAgent.id,
      editingStep.stepId,
      wavFile
    );
    onAgentsUpdated(updated);
    setEditingStep(null);
  };

  const populatedCount = Object.keys(currentAgent.uploadedSteps || {}).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-2.5 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[385px] max-h-[90vh] bg-white rounded-3xl shadow-2xl p-3.5 flex flex-col gap-2.5 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
              <span>🎛️ የ «{currentAgent.name}» Step Studio</span>
            </h3>
            <p className="text-[10px] text-slate-500">
              {populatedCount} የተጫኑ Steps • 1 ብቻ ካስገቡ 1 ብቻ ይጫወታል፣ 5 ካስገቡ 5፣ 20 ካስገቡ 20!
            </p>
          </div>

          <div className="flex items-center gap-1">
            {!currentAgent.isDefault && (
              <button
                type="button"
                onClick={() => {
                  const updated = deleteSupportAgent(currentAgent.id);
                  onAgentDeleted?.(currentAgent.id, updated);
                  onClose();
                }}
                className="text-rose-600 hover:bg-rose-50 px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-0.5"
              >
                <Trash2 className="w-3.5 h-3.5" /> ሰርዝ
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-full hover:bg-slate-100 text-slate-500"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* QUICK TARGET STEP PICKER BAR: Choose which Step (Step 1 .. Step 20+) to Upload MP3 or Record Voice into! */}
        <div className="bg-blue-50/90 border border-blue-200 rounded-2xl p-2.5 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10.5px] font-bold text-blue-950">
              🎯 የሚገባበትን Step ይምረጡ (Step 1..{stepDefs.length})፦
            </span>
            <select
              value={selectedTargetStepId}
              onChange={(e) => setSelectedTargetStepId(e.target.value)}
              className="px-2.5 py-1 bg-white border border-blue-300 rounded-xl text-[11px] font-bold text-blue-900 focus:outline-none"
            >
              {stepDefs.map((s) => {
                const hasFile = Boolean(currentAgent.uploadedSteps?.[s.stepId]);
                return (
                  <option key={s.stepId} value={s.stepId}>
                    Step {s.stepNumber} {hasFile ? '✅ (ተጭኗል)' : '⚪ (ባዶ)'}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="flex items-center gap-2">
            {/* 1. Upload MP3 to Selected Step */}
            <label className="flex-1 py-2 px-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[11px] font-bold cursor-pointer flex items-center justify-center gap-1.5 shadow-xs active:scale-98 transition-all">
              <Upload className="w-3.5 h-3.5" />
              <span>
                ወደ Step {selectedTargetStepId.replace('step_', '')} MP3 ጫን
              </span>
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const updated = await saveSupportAgentStepAudio(
                      currentAgent.id,
                      selectedTargetStepId,
                      file
                    );
                    onAgentsUpdated(updated);
                  }
                }}
              />
            </label>

            {/* 2. Voice Record directly into Selected Step */}
            {isRecordingStep && recordingStepId === selectedTargetStepId ? (
              <button
                type="button"
                onClick={stopStepVoiceRecording}
                className="flex-1 py-2 px-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 shadow-xs animate-pulse"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>አቁምና አስቀምጥ ({recordSeconds.toFixed(1)}s)</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => startStepVoiceRecording(selectedTargetStepId)}
                disabled={isRecordingStep}
                className="flex-1 py-2 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 shadow-xs active:scale-98 transition-all disabled:opacity-50"
              >
                <Mic className="w-3.5 h-3.5" />
                <span>
                  ወደ Step {selectedTargetStepId.replace('step_', '')} ድምፅ ቅዳ
                </span>
              </button>
            )}
          </div>

          <p className="text-[9.5px] text-blue-800/90 leading-tight">
            💡 ማንኛውንም Step <strong>ጫን ብለው ሲይዙ (Long Press)</strong>፦ <strong>🗑️ Delete</strong> (ባዶ ለማድረግ) ወይም <strong>✂️ Edit / Cut / + Plus</strong> (ድምፅ ለመቁረጥና ሌላ MP3/ድምፅ ላይ ለመቀጠል) ይመጣል!
          </p>
        </div>

        {/* Scrollable List of 20+ Steps */}
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
          {stepDefs.map((step) => {
            const uploadedFileName = currentAgent.uploadedSteps?.[step.stepId];
            const isStepRec = isRecordingStep && recordingStepId === step.stepId;
            const isPlayingThis = playingStepId === step.stepId;

            return (
              <div
                key={step.stepId}
                onMouseDown={() => startStepLongPress(step)}
                onMouseUp={cancelStepLongPress}
                onMouseLeave={cancelStepLongPress}
                onTouchStart={() => startStepLongPress(step)}
                onTouchEnd={cancelStepLongPress}
                onTouchMove={cancelStepLongPress}
                onContextMenu={(e) => {
                  e.preventDefault();
                  cancelStepLongPress();
                  setLongPressedStep(step);
                }}
                className={`p-2 rounded-2xl border transition-all flex items-center justify-between gap-1.5 ${
                  uploadedFileName
                    ? 'bg-emerald-50/60 border-emerald-300'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                {/* Left Info */}
                <div
                  onClick={() => setSelectedTargetStepId(step.stepId)}
                  className="flex flex-col min-w-0 flex-1 cursor-pointer"
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`px-1.5 py-0.2 rounded-md text-[10px] font-extrabold ${
                        uploadedFileName
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      Step {step.stepNumber}
                    </span>
                    <span className="text-[11px] font-bold text-slate-800 truncate">
                      {step.title.replace(/^Step \d+፦\s*/, '')}
                    </span>
                  </div>
                  <span
                    className={`text-[9.5px] truncate mt-0.5 ${
                      uploadedFileName ? 'text-emerald-800 font-semibold' : 'text-slate-400'
                    }`}
                  >
                    {uploadedFileName
                      ? `✅ ${uploadedFileName} (ጫን ብለው ይያዙ፦ Edit / Delete)`
                      : '⚪ ባዶ ነው (MP3 ይጫኑ ወይም ድምፅ ይቅዱ)'}
                  </span>
                </div>

                {/* Right Quick Action Buttons */}
                <div className="flex items-center gap-1 shrink-0">
                  {uploadedFileName && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTogglePlayStep(step.stepId);
                        }}
                        className={`p-1.5 rounded-full text-white shadow-2xs ${
                          isPlayingThis ? 'bg-amber-500 animate-pulse' : 'bg-emerald-600 hover:bg-emerald-700'
                        }`}
                        title="አዳምጥ"
                      >
                        {isPlayingThis ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openStepAudioEditor(step);
                        }}
                        className="p-1.5 rounded-full bg-purple-600 hover:bg-purple-700 text-white shadow-2xs"
                        title="Edit / Cut / + Plus"
                      >
                        <Scissors className="w-3 h-3" />
                      </button>
                    </>
                  )}

                  {/* Per-row Voice Record */}
                  {isStepRec ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        stopStepVoiceRecording();
                      }}
                      className="px-2 py-1 bg-rose-600 text-white rounded-full text-[9.5px] font-bold flex items-center gap-1 animate-pulse"
                    >
                      <Square className="w-2.5 h-2.5 fill-current" />
                      <span>{recordSeconds.toFixed(1)}s</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        startStepVoiceRecording(step.stepId);
                      }}
                      disabled={isRecordingStep}
                      className="p-1.5 rounded-full bg-slate-200 hover:bg-emerald-600 hover:text-white text-slate-700 transition-colors"
                      title={`ወደ Step ${step.stepNumber} በድምፅ ቅዳ`}
                    >
                      <Mic className="w-3 h-3" />
                    </button>
                  )}

                  {/* Per-row MP3 Upload */}
                  <label
                    onClick={(e) => e.stopPropagation()}
                    className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-[9.5px] font-bold cursor-pointer flex items-center gap-0.5"
                  >
                    <Upload className="w-2.5 h-2.5" />
                    <span>MP3</span>
                    <input
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const updated = await saveSupportAgentStepAudio(
                            currentAgent.id,
                            step.stepId,
                            file
                          );
                          onAgentsUpdated(updated);
                        }
                      }}
                    />
                  </label>
                </div>
              </div>
            );
          })}

          {/* Button to add +5 more Steps beyond 20 if needed */}
          <button
            type="button"
            onClick={() => {
              const updated = expandSupportAgentSteps(currentAgent.id, 5);
              onAgentsUpdated(updated);
            }}
            className="w-full py-2 border border-dashed border-blue-400 rounded-2xl text-[11px] font-bold text-blue-700 hover:bg-blue-50 flex items-center justify-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>ተጨማሪ +5 Steps ጨምር (አሁን {stepDefs.length} Steps አሉ)</span>
          </button>
        </div>

        {/* Bottom Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-extrabold shadow"
        >
          ✅ ጨርሻለሁ (ዝጋ)
        </button>
      </div>

      {/* =====================================================================
          SUB-MODAL 1: LONG-PRESS MENU ON A STEP (Edit / Cut / + Plus / Delete)
         ===================================================================== */}
      {longPressedStep && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setLongPressedStep(null)}
        >
          <div
            className="w-full max-w-[310px] bg-white rounded-2xl shadow-2xl p-4 flex flex-col gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-xs font-extrabold text-slate-900 border-b pb-2">
              🎵 Step {longPressedStep.stepNumber} ምርጫዎች
              <div className="text-[10px] font-normal text-slate-500 mt-0.5">
                {currentAgent.uploadedSteps?.[longPressedStep.stepId]
                  ? `ፋይል፦ ${currentAgent.uploadedSteps[longPressedStep.stepId]}`
                  : 'ይህ Step አሁን ባዶ ነው'}
              </div>
            </div>

            {/* Option 1: Open Full Audio Editor (Cut / Trim / + Upload MP3 / + Record Voice) */}
            <button
              type="button"
              onClick={() => openStepAudioEditor(longPressedStep)}
              className="w-full py-2.5 px-3 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-900 font-bold text-xs flex items-center gap-2"
            >
              <Scissors className="w-4 h-4 text-purple-700" />
              <span>✂️ Edit / Cut / ➕ Plus (ድምፅ ቁረጥ ወይም ቀጥልበት)</span>
            </button>

            {/* Option 2: Delete Step Audio (makes the step empty so a new MP3/Voice can be added) */}
            {currentAgent.uploadedSteps?.[longPressedStep.stepId] && (
              <button
                type="button"
                onClick={async () => {
                  stopPreviewAudio();
                  const updated = await deleteSupportAgentStepAudio(
                    currentAgent.id,
                    longPressedStep.stepId
                  );
                  onAgentsUpdated(updated);
                  setLongPressedStep(null);
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4 text-rose-600" />
                <span>🗑️ Delete (ይህን Step ባዶ አድርግ)</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setLongPressedStep(null)}
              className="w-full py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold mt-1"
            >
              ዝጋ
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          SUB-MODAL 2: FULL MP3 & VOICE STUDIO EDITOR (Trim, Cut, + MP3, + Voice)
         ===================================================================== */}
      {editingStep && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3"
          onClick={() => {
            stopEditorPlayback();
            setEditingStep(null);
          }}
        >
          <div
            className="w-full max-w-[370px] bg-slate-900 text-white rounded-3xl shadow-2xl p-4 flex flex-col gap-3 border border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-700 pb-2">
              <div>
                <h4 className="text-xs font-extrabold text-amber-300 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" />
                  <span>✂️ Step {editingStep.stepNumber} MP3 & Voice Editor</span>
                </h4>
                <p className="text-[10px] text-slate-300 mt-0.5">{editorStatus}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  stopEditorPlayback();
                  setEditingStep(null);
                }}
                className="p-1 rounded-full bg-white/10 hover:bg-white/20"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Interactive Visual Waveform & Start/End Range Sliders */}
            {editorBuffer ? (
              <div className="bg-slate-800 rounded-2xl p-3 flex flex-col gap-2.5 border border-slate-700">
                {/* Waveform Bars with highlighted selection */}
                <div className="relative h-20 w-full flex items-end gap-[2px] bg-slate-950/80 rounded-xl p-2 overflow-hidden">
                  {editorPeaks.map((peak, idx) => {
                    const barSec = (idx / editorPeaks.length) * editorBuffer.duration;
                    const start = Math.min(selectionStartSec, selectionEndSec);
                    const end = Math.max(selectionStartSec, selectionEndSec);
                    const inSelection = barSec >= start && barSec <= end;
                    return (
                      <div
                        key={idx}
                        style={{ height: `${Math.round(peak * 100)}%` }}
                        className={`flex-1 rounded-full transition-colors ${
                          inSelection ? 'bg-amber-400' : 'bg-slate-600'
                        }`}
                      />
                    );
                  })}
                </div>

                {/* Start & End Time Sliders */}
                <div className="flex flex-col gap-1.5 text-[10.5px]">
                  <div className="flex items-center justify-between text-amber-200 font-mono">
                    <span>መጀመሪያ፦ {selectionStartSec.toFixed(2)}s</span>
                    <span>መጨረሻ፦ {selectionEndSec.toFixed(2)}s</span>
                    <span>ጠቅላላ፦ {editorBuffer.duration.toFixed(2)}s</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 w-12">Start:</span>
                    <input
                      type="range"
                      min={0}
                      max={Number(editorBuffer.duration.toFixed(2))}
                      step={0.05}
                      value={selectionStartSec}
                      onChange={(e) => setSelectionStartSec(Number(e.target.value))}
                      className="flex-1 accent-amber-400"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 w-12">End:</span>
                    <input
                      type="range"
                      min={0}
                      max={Number(editorBuffer.duration.toFixed(2))}
                      step={0.05}
                      value={selectionEndSec}
                      onChange={(e) => setSelectionEndSec(Number(e.target.value))}
                      className="flex-1 accent-amber-400"
                    />
                  </div>
                </div>

                {/* Playback & Cut/Trim Controls */}
                <div className="grid grid-cols-3 gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => playEditorBufferRange(false)}
                    className="py-2 px-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[10.5px] font-bold flex items-center justify-center gap-1"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>{isEditorPlaying ? 'አቁም' : 'ሙሉ አዳምጥ'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleTrimKeepSelection}
                    className="py-2 px-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10.5px] font-extrabold flex items-center justify-center gap-1"
                    title="የተመረጠውን ብቻ አስቀር (Trim)"
                  >
                    <Scissors className="w-3.5 h-3.5" />
                    <span>Trim (አስቀር)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCutRemoveSelection}
                    className="py-2 px-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-[10.5px] font-bold flex items-center justify-center gap-1"
                    title="የተመረጠውን ከመሃል ቁረጥና አውጣ (Cut)"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Cut (ቁረጥ)</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-slate-800 rounded-2xl p-4 text-center text-xs text-slate-300">
                ይህ Step ገና ድምፅ የለውም። ከታች MP3 ይጫኑ ወይም በድምፅ ይቅዱ!
              </div>
            )}

            {/* PLUS (+) MERGE SECTION: Append another MP3 or Append a Live Voice Recording right onto this Step! */}
            <div className="bg-slate-800/90 border border-purple-500/40 rounded-2xl p-3 flex flex-col gap-2">
              <div className="text-[11px] font-bold text-purple-300 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" />
                <span>እዚሁ Step ላይ ሌላ ድምፅ ቀጥልበት (Plus / Merge)፦</span>
              </div>
              <p className="text-[9.5px] text-slate-300 leading-snug">
                ሌላ MP3 ፋይል ቢጭኑ ወይም በድምፅ ቢቀዱ ከነባሩ የ Step {editingStep.stepNumber} ድምፅ ጋር ተደምሮ (Plus አድርጎ) የራሱ አካል ሆኖ አንድ ላይ ይጫወታል!
              </p>

              <div className="flex items-center gap-2">
                <label className="flex-1 py-2 px-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-[10.5px] font-bold cursor-pointer flex items-center justify-center gap-1 shadow">
                  <Plus className="w-3.5 h-3.5" />
                  <Upload className="w-3 h-3" />
                  <span>+ MP3 ቀጥልበት</span>
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handlePlusUploadMp3(file);
                      }
                    }}
                  />
                </label>

                {isPlusRecording ? (
                  <button
                    type="button"
                    onClick={stopPlusVoiceRecord}
                    className="flex-1 py-2 px-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-[10.5px] font-bold flex items-center justify-center gap-1 animate-pulse"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>አቁምና ደምር ({plusRecordSeconds.toFixed(1)}s)</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startPlusVoiceRecord}
                    className="flex-1 py-2 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10.5px] font-bold flex items-center justify-center gap-1 shadow"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <Mic className="w-3 h-3" />
                    <span>+ ድምፅ ቅዳና ቀጥል</span>
                  </button>
                )}
              </div>
            </div>

            {/* Save Unified Step Audio Button */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={!editorBuffer}
                onClick={handleSaveEditedStepAudio}
                className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-lg"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>💾 Save Step {editingStep.stepNumber} (አንድ አካል አድርገህ አስቀምጥ)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
