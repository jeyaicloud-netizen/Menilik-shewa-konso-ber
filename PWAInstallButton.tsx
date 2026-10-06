import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const PWAInstallButton: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setShowGuide(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setDeferredPrompt(null);
      }
    } else {
      setShowGuide(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        className="flex items-center gap-1.5 rounded-full bg-[#1A73E8] hover:bg-blue-700 active:scale-95 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition-all"
        title="አፑን በስልክዎ ላይ ይጫኑ (Install App)"
      >
        <Download className="w-3.5 h-3.5" />
        <span>አፑን ጫን</span>
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl text-left">
            <h3 className="text-base font-bold text-slate-900">
              📲 አፑን በስልክዎ ላይ ለመጫን፦
            </h3>
            <div className="mt-2.5 space-y-2 text-xs text-slate-700 leading-relaxed">
              <p>
                1. በ <strong>Google Chrome</strong> ከላይ በቀኝ ጥግ ያለውን <strong>3 ነጥብ (⋮)</strong> ይንኩ።
              </p>
              <p>
                2. <strong>«Install app»</strong> ወይም <strong>«Add to Home screen»</strong> የሚለውን ይንኩ።
              </p>
              <p className="text-emerald-700 font-semibold pt-1">
                ✅ አፑ ከነ Icon-ኡ ስልክዎ ስክሪን ላይ ይቀመጣል!
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-4 w-full rounded-full bg-[#1A73E8] py-2 text-xs font-bold text-white hover:bg-blue-700"
            >
              እሺ ተረድቻለሁ
            </button>
          </div>
        </div>
      )}
    </>
  );
};
