import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const CBE_SYSTEM_PROMPT = `You are a professional, polite, warm, and highly knowledgeable customer service representative for the Commercial Bank of Ethiopia (የኢትዮጵያ ንግድ ባንክ - CBE).
You are answering a live telephone call on customer care shortcode 951.

Strict Rules:
1. Speak ONLY in authentic, clear, natural, and polite Amharic (አማርኛ).
2. Keep replies conversational, concise (2 to 4 sentences maximum), and professional as in a real telephone call.
3. Use respectful Ethiopian customer service courtesies:
   - "እሺ ክቡር ደንበኛችን"
   - "በደስታ እረዳዎታለሁ"
   - "አይዞዎት፣ ምንም አይጨነቁ"
   - "አመሰግናለሁ"

Specific Money Transfer Issue Protocol (ገንዘብ ተላልፎ ላልደረሰው ደንበኛ):
- When a customer says they transferred or sent money ("ገንዘብ ልኬ ነበር" or "ብር ልኬ አልደረሰም"):
  1. If they haven't specified the channel or recipient details, ask politely:
     "እሺ ክቡር ደንበኛችን፤ በምን መንገድ ነው የላኩት? እና የተላከለትን ሰው የአካውንት ስም እና የሂሳብ ቁጥር ይንገሩኝ?"
  2. When the customer tells you the recipient's account name or number (e.g. "ሰውየው ጋር አልደረሰም፣ ሜሴጅ አልደረሰውም ወይም ባላንስ አልጨመረም..."):
     Respond reassuringly:
     "እሺ እባክዎትን ጥቂት ሰከንድ መስመር ላይ ይጠብቁ፣ በሲስተማችን እያረጋገጥኩ ነው..."
     Followed immediately by:
     "አዎ ክቡር ደንበኛችን፣ ገንዘቡ ከእርስዎ ሂሳብ በትክክል ተላልፏል። ለተላከለት ሰው ወዲያው ያልደረሰው በጊዜያዊ የኔትዎርክ እና የሲስተም መጨናነቅ ምክንያት ነው። በ24 ሰዓት ውስጥ ወደ አካውንታቸው ይደርሳል፣ የማረጋገጫ የጽሁፍ መልዕክት (SMS) ይደርሳቸዋል፣ እንዲሁም ወደ ባላንሳቸው ይደመራል፤ ምንም አይጨነቁ። ሌላ የምረዳዎት ነገር አለ?"

Other CBE Services:
- CBE Birr (የሲቢኢ ብር ፒን መርሳት፣ የተሳሳተ ገንዘብ ማስተላለፍ፣ ሂሳብ ማገናኘት)
- Mobile Banking (*847# እና CBE Mobile App)
- ATM ካርድ (በማሽን የተዋጠ ካርድ፣ አዲስ ማውጣት፣ ፒን መቀየር)
- የሂሳብ ቀሪ ማወቅ እና የባንክ ሂሳብ መክፈት
- የውጭ ሀገር ገንዘብ ዝውውር እና የምንዛሬ ተመን
Always end with a polite closing like "ሌላ የምረዳዎት ነገር አለ?".`;

function matchRecordedAudioResponse(
  userText: string,
  history: any[]
): { audioUrl: string; replyText: string } | null {
  const norm = (userText || '').toLowerCase();

  const hasPlayedFile2 = history.some(
    (h) =>
      (h.text && h.text.includes('ወዴትኛው አካውንት ነው ያስተላለፉት')) ||
      (h.audioUrl && h.audioUrl.includes('2_genzeb_astelalfeh_neber'))
  );

  const hasPlayedFile3 = history.some(
    (h) =>
      (h.text && h.text.includes('የተመዘገቡበትን አካውንት ቁጥር')) ||
      (h.audioUrl && h.audioUrl.includes('3_eshe_yerson_acc_kuter'))
  );

  const isTransferTopic =
    norm.includes('ገንዘብ') ||
    norm.includes('ብር') ||
    norm.includes('አስተላልፍ') ||
    norm.includes('አስተላለፍኩ') ||
    norm.includes('ልኬ') ||
    norm.includes('ተላከ') ||
    norm.includes('አልደረሰ') ||
    norm.includes('ባላንስ') ||
    norm.includes('አካውንት');

  if (isTransferTopic && !hasPlayedFile2) {
    return {
      audioUrl: '/audio/2_genzeb_astelalfeh_neber.mp3',
      replyText:
        'ገንዘብ አስተላልፈው ነበር? ገንዘብ አስተላልፈው ነበር ወዴትኛው አካውንት ነው ያስተላለፉት? ማለት ከዚህ አካውንት ነው ያስተላለፉት? አሁን ከሚጠቀሙበት አካውንት?',
    };
  }

  if (hasPlayedFile2 && !hasPlayedFile3) {
    return {
      audioUrl: '/audio/3_eshe_yerson_acc_kuter.mp3',
      replyText:
        'እሺ የእርሶን የተመዘገቡበትን አካውንት ቁጥር ይንገሩኝ? እና ስም... ስሙን ይንገሩኝ? እና የእናት ስም አንድ ላይ ይንገሩኝ?',
    };
  }

  return null;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, history = [] } = req.body || {};
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const audioMatch = matchRecordedAudioResponse(message, history);
    if (audioMatch) {
      return res.json({
        replyText: audioMatch.replyText,
        audioUrl: audioMatch.audioUrl,
        audioBase64: null,
      });
    }

    const contents: any[] = [];
    if (Array.isArray(history)) {
      for (const item of history.slice(-6)) {
        contents.push({
          role: item.role === 'user' ? 'user' : 'model',
          parts: [{ text: item.text }],
        });
      }
    }
    contents.push({
      role: 'user',
      parts: [{ text: message }],
    });

    const chatResponse = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents,
      config: {
        systemInstruction: CBE_SYSTEM_PROMPT,
        temperature: 0.7,
      },
    });

    const replyText = chatResponse.text?.trim() || 'የኢትዮጵያ ንግድ ባንክ፤ እባክዎትን ምን ልርዳዎ?';

    let audioBase64: string | null = null;
    try {
      const ttsResponse = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [{ text: replyText }],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });
      audioBase64 = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
    } catch (e) {
      console.warn('Vercel TTS warning:', e);
    }

    return res.status(200).json({ replyText, audioBase64 });
  } catch (err: any) {
    console.error('Vercel handler error:', err);
    return res.status(500).json({
      error: err?.message || 'Server error',
      replyText: 'ይቅርታ ደንበኛችን፣ የመስመር መቆራረጥ አጋጥሟል። እባክዎትን በድጋሚ ይሞክሩ።',
    });
  }
}
