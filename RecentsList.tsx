import React, { useState, useRef } from 'react';
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Trash2 } from 'lucide-react';
import { CallLog } from './types';

interface RecentsListProps {
  logs: CallLog[];
  onCall: (number: string) => void;
  onDeleteLog?: (id: string) => void;
}

export const RecentsList: React.FC<RecentsListProps> = ({ logs, onCall, onDeleteLog }) => {
  const [longPressedLog, setLongPressedLog] = useState<CallLog | null>(null);
  const pressTimerRef = useRef<any>(null);
  const didLongPressRef = useRef<boolean>(false);

  const startLongPress = (log: CallLog) => {
    didLongPressRef.current = false;
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    pressTimerRef.current = setTimeout(() => {
      didLongPressRef.current = true;
      setLongPressedLog(log);
    }, 450);
  };

  const cancelLongPress = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  return (
    <div className="w-full h-full flex flex-col px-4 py-2 overflow-y-auto bg-white select-none relative">
      <div className="text-xs font-medium text-[#5F6368] uppercase tracking-wider px-2 py-3">
        የቅርብ ጊዜ ጥሪዎች
      </div>

      {logs.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs text-[#5F6368]">
          ምንም የጥሪ ታሪክ የለም
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-gray-100">
          {logs.map((log) => {
            return (
              <div
                key={log.id}
                onMouseDown={() => startLongPress(log)}
                onMouseUp={cancelLongPress}
                onMouseLeave={cancelLongPress}
                onTouchStart={() => startLongPress(log)}
                onTouchEnd={cancelLongPress}
                onTouchMove={cancelLongPress}
                onContextMenu={(e) => {
                  e.preventDefault();
                  cancelLongPress();
                  setLongPressedLog(log);
                }}
                onClick={() => {
                  if (didLongPressRef.current) {
                    didLongPressRef.current = false;
                    return;
                  }
                  onCall(log.number);
                }}
                className="flex items-center justify-between py-3.5 px-2 hover:bg-[#F8F9FA] active:bg-[#F1F3F4] rounded-xl cursor-pointer transition-colors group"
              >
                <div className="flex items-center gap-3.5">
                  {/* Standard Google Avatar */}
                  <div className="w-11 h-11 rounded-full bg-[#E8F0FE] text-[#1A73E8] flex items-center justify-center font-medium text-sm">
                    {log.name ? log.name.slice(0, 1) : log.number.slice(0, 1)}
                  </div>

                  {/* Details */}
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-[#202124]">
                      {log.name || log.number}
                    </span>
                    <div className="flex items-center gap-1.5 text-xs text-[#5F6368] mt-0.5">
                      {log.type === 'outgoing' && <PhoneOutgoing className="w-3 h-3 text-[#1E8E3E]" />}
                      {log.type === 'incoming' && <PhoneIncoming className="w-3 h-3 text-[#1A73E8]" />}
                      {log.type === 'missed' && <PhoneMissed className="w-3 h-3 text-[#EA4335]" />}
                      <span>{log.number}</span>
                      <span>•</span>
                      <span>{log.time}</span>
                    </div>
                  </div>
                </div>

                {/* Call Icon Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCall(log.number);
                  }}
                  className="w-10 h-10 rounded-full bg-[#F1F3F4] hover:bg-[#E8F0FE] hover:text-[#1A73E8] text-[#5F6368] flex items-center justify-center transition-all"
                  title="ደውል"
                >
                  <Phone className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Long-Press Google Phone Call History Context Menu */}
      {longPressedLog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setLongPressedLog(null)}
        >
          <div
            className="w-full max-w-[300px] bg-white rounded-2xl shadow-xl overflow-hidden py-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-2.5 border-b border-gray-100">
              <div className="text-sm font-semibold text-[#202124]">
                {longPressedLog.name || longPressedLog.number}
              </div>
              <div className="text-xs text-[#5F6368]">
                {longPressedLog.number} • {longPressedLog.time}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                const num = longPressedLog.number;
                setLongPressedLog(null);
                onCall(num);
              }}
              className="w-full px-4 py-3 text-left text-sm text-[#202124] hover:bg-[#F8F9FA] flex items-center gap-3"
            >
              <Phone className="w-4 h-4 text-[#5F6368]" />
              <span>ደውል ({longPressedLog.number})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onDeleteLog?.(longPressedLog.id);
                setLongPressedLog(null);
              }}
              className="w-full px-4 py-3 text-left text-sm text-[#EA4335] hover:bg-red-50 flex items-center gap-3 font-medium"
            >
              <Trash2 className="w-4 h-4 text-[#EA4335]" />
              <span>ከጥሪ ታሪክ ሰርዝ (Delete)</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
