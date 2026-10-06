import React from 'react';
import { Delete, Phone } from 'lucide-react';
import { phoneAudio } from '../utils/audio';

interface KeypadProps {
  number: string;
  onNumberChange: (num: string) => void;
  onCall: (num: string) => void;
}

const KEYS = [
  { digit: '1', sub: '⚿' },
  { digit: '2', sub: 'ABC' },
  { digit: '3', sub: 'DEF' },
  { digit: '4', sub: 'GHI' },
  { digit: '5', sub: 'JKL' },
  { digit: '6', sub: 'MNO' },
  { digit: '7', sub: 'PQRS' },
  { digit: '8', sub: 'TUV' },
  { digit: '9', sub: 'WXYZ' },
  { digit: '*', sub: '' },
  { digit: '0', sub: '+' },
  { digit: '#', sub: '' },
];

export const Keypad: React.FC<KeypadProps> = ({ number, onNumberChange, onCall }) => {
  const handleKeyPress = (digit: string) => {
    phoneAudio.playDtmf(digit);
    onNumberChange(number + digit);
  };

  const handleDelete = () => {
    onNumberChange(number.slice(0, -1));
  };

  const handleClear = () => {
    onNumberChange('');
  };

  return (
    <div className="flex flex-col items-center justify-between w-full max-w-sm mx-auto h-full px-6 pb-6 pt-2 select-none">
      {/* Top Number Display (Google Light Theme) */}
      <div className="w-full flex flex-col items-center justify-center min-h-[80px]">
        {number ? (
          <div className="relative w-full flex items-center justify-center">
            <span className="text-4xl font-normal tracking-wider text-[#202124] select-all font-mono">
              {number}
            </span>
            <button
              onClick={handleDelete}
              onContextMenu={(e) => {
                e.preventDefault();
                handleClear();
              }}
              className="absolute right-2 p-2 text-[#5F6368] hover:text-[#202124] active:scale-90 transition-transform"
              title="አጥፋ"
              aria-label="Delete"
            >
              <Delete className="w-6 h-6" />
            </button>
          </div>
        ) : (
          <div className="text-[#80868B] text-sm">
            ቁጥር ይተይቡ
          </div>
        )}
      </div>

      {/* Dial Keys Grid (Google Phone Light Style) */}
      <div className="grid grid-cols-3 gap-x-6 gap-y-3.5 w-full max-w-[280px]">
        {KEYS.map((k) => (
          <button
            key={k.digit}
            onClick={() => handleKeyPress(k.digit)}
            className="w-18 h-18 mx-auto rounded-full bg-[#F1F3F4] hover:bg-[#E8EAED] active:bg-[#DADCE0] active:scale-95 transition-all duration-100 flex flex-col items-center justify-center shadow-sm"
          >
            <span className="text-2xl font-normal text-[#202124] leading-none">{k.digit}</span>
            {k.sub && (
              <span className="text-[10px] font-medium text-[#5F6368] tracking-widest mt-1 uppercase">
                {k.sub}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Bottom Google Phone Call Button (Material Green) */}
      <div className="w-full flex items-center justify-center pt-3">
        <button
          onClick={() => onCall(number || '951')}
          className="w-16 h-16 rounded-full bg-[#1E8E3E] hover:bg-[#188038] active:bg-[#137333] active:scale-95 text-white flex items-center justify-center shadow-lg shadow-emerald-600/30 transition-all duration-150"
          title="ደውል"
          aria-label="Call"
        >
          <Phone className="w-7 h-7 fill-current" />
        </button>
      </div>
    </div>
  );
};
