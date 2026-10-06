export type TabType = 'speed_dial' | 'recents' | 'contacts';

export interface Contact {
  id: string;
  name: string;
  number: string;
  label?: string;
  avatarColor?: string;
  isCbe?: boolean;
}

export interface CallLog {
  id: string;
  name: string;
  number: string;
  type: 'incoming' | 'outgoing' | 'missed';
  time: string;
  duration?: string;
}

export type CallState =
  | 'idle'
  | 'dialing'
  | 'ringing'
  | 'connected'
  | 'ended';

export type IvrStep =
  | 'not_started'
  | 'welcome_menu'     // "እንኳን ወደ ኢትዮጵያ ንግድ ባንክ በደህና መጡ... ለአማርኛ 4ን ይጫኑ"
  | 'agent_intro'      // "የኢትዮጵያ ንግድ ባንክ፤ እባክዎትን ምን ልርዳዎ?"
  | 'active_call';     // User speaking & Agent replying hands-free

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  audioUrl?: string;
}
