import React from 'react';
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed } from 'lucide-react';
import { CallLog } from '../types';

interface RecentsListProps {
  logs: CallLog[];
  onCall: (number: string) => void;
}

export const RecentsList: React.FC<RecentsListProps> = ({ logs, onCall }) => {
  return (
    <div className="w-full h-full flex flex-col px-4 py-2 overflow-y-auto bg-white select-none">
      <div className="text-xs font-medium text-[#5F6368] uppercase tracking-wider px-2 py-3">
        የቅርብ ጊዜ ጥሪዎች
      </div>

      <div className="flex flex-col divide-y divide-gray-100">
        {logs.map((log) => {
          return (
            <div
              key={log.id}
              onClick={() => onCall(log.number)}
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
    </div>
  );
};
