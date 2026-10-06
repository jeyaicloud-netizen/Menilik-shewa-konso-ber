import React from 'react';
import { Phone, User } from 'lucide-react';
import { Contact } from '../types';

interface ContactsListProps {
  contacts: Contact[];
  onCall: (number: string) => void;
}

export const ContactsList: React.FC<ContactsListProps> = ({ contacts, onCall }) => {
  return (
    <div className="w-full h-full flex flex-col px-4 py-2 overflow-y-auto bg-white select-none">
      <div className="text-xs font-medium text-[#5F6368] uppercase tracking-wider px-2 py-3">
        ዕውቂያዎች
      </div>

      <div className="flex flex-col divide-y divide-gray-100">
        {contacts.map((c) => {
          return (
            <div
              key={c.id}
              onClick={() => onCall(c.number)}
              className="flex items-center justify-between py-3.5 px-2 hover:bg-[#F8F9FA] active:bg-[#F1F3F4] rounded-xl cursor-pointer transition-colors group"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-full bg-[#E8F0FE] text-[#1A73E8] flex items-center justify-center font-medium text-sm">
                  {c.name ? c.name.slice(0, 1) : <User className="w-5 h-5 text-[#1A73E8]" />}
                </div>

                <div className="flex flex-col">
                  <span className="text-sm font-medium text-[#202124]">
                    {c.name}
                  </span>
                  <div className="flex items-center gap-1.5 text-xs text-[#5F6368] mt-0.5">
                    <span>{c.number}</span>
                    {c.label && <span>• {c.label}</span>}
                  </div>
                </div>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCall(c.number);
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
