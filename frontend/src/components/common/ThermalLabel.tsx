import React from 'react';
import { Printer } from 'lucide-react';
import Button from './Button';

const CODE39_PATTERNS: Record<string, string> = {
  '0': '000110100', '1': '100100001', '2': '001100001', '3': '101100000',
  '4': '000110001', '5': '100110000', '6': '001110000', '7': '000100101',
  '8': '100100100', '9': '001100100', 'A': '100001001', 'B': '001001001',
  'C': '101001000', 'D': '000011001', 'E': '100011000', 'F': '001011000',
  'G': '000001101', 'H': '100001100', 'I': '001001100', 'J': '000011100',
  'K': '100000011', 'L': '001000011', 'M': '101000010', 'N': '000010011',
  'O': '100010010', 'P': '001010010', 'Q': '000000111', 'R': '100000110',
  'S': '001000110', 'T': '000010110', 'U': '110000001', 'V': '011000001',
  'W': '111000000', 'X': '010010001', 'Y': '110010000', 'Z': '011010000',
  '-': '010000101', '.': '110000100', ' ': '011000100', '$': '010101000',
  '/': '010100010', '+': '010001010', '%': '000101010', '*': '010010100'
};

export const BarcodeSvg: React.FC<{
  text: string;
  height?: number;
  narrowWidth?: number;
  wideWidth?: number;
  color?: string;
  showText?: boolean;
}> = ({
  text,
  height = 42,
  narrowWidth = 2,
  wideWidth = 4.5,
  color = '#0f172a',
  showText = true,
}) => {
  const sanitized = String(text || '').toUpperCase().replace(/[^0-9A-Z\-\. \$\/\+\%]/g, '-');
  const fullText = `*${sanitized}*`;

  let currentX = 10;
  const rects: Array<{ x: number; width: number }> = [];

  for (let i = 0; i < fullText.length; i++) {
    const char = fullText[i];
    const pattern = CODE39_PATTERNS[char] || CODE39_PATTERNS['-'];

    for (let j = 0; j < 9; j++) {
      const isBar = j % 2 === 0;
      const isWide = pattern[j] === '1';
      const width = isWide ? wideWidth : narrowWidth;

      if (isBar) {
        rects.push({ x: currentX, width });
      }
      currentX += width;
    }
    currentX += narrowWidth;
  }

  const totalWidth = currentX + 10;
  const totalSvgHeight = showText ? height + 16 : height;

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox={`0 0 ${totalWidth} ${totalSvgHeight}`}
        className="w-full max-w-[240px] h-auto"
        xmlns="http://www.w3.org/2000/svg"
      >
        {rects.map((r, idx) => (
          <rect key={idx} x={r.x} y={0} width={r.width} height={height} fill={color} />
        ))}
        {showText && (
          <text
            x={totalWidth / 2}
            y={height + 12}
            textAnchor="middle"
            fontFamily="monospace"
            fontSize="10"
            fontWeight="bold"
            letterSpacing="2"
            fill={color}
          >
            {sanitized}
          </text>
        )}
      </svg>
    </div>
  );
};

interface ThermalLabelProps {
  title: string;
  barcode: string;
  subText?: string;
  extraInfo?: Array<{ label: string; value: string }>;
  facilityName?: string;
}

export const ThermalLabel: React.FC<ThermalLabelProps> = ({
  title,
  barcode,
  subText,
  extraInfo = [],
  facilityName = 'SupplySync WMS',
}) => {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Label Sticker Preview (50x30mm scale) */}
      <div className="w-72 rounded-lg border-2 border-dashed border-slate-300 bg-white p-4 shadow-sm text-center font-sans printable-thermal-label">
        <div className="flex items-center justify-between border-b border-slate-200 pb-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
          <span>{facilityName}</span>
          <span>TAG-PASOKAN</span>
        </div>

        <div className="my-2">
          <h4 className="text-xs font-bold text-slate-900 truncate">{title}</h4>
          {subText && <p className="text-[10px] text-slate-500">{subText}</p>}
        </div>

        <div className="my-2 flex justify-center">
          <BarcodeSvg text={barcode} height={36} />
        </div>

        {extraInfo.length > 0 && (
          <div className="grid grid-cols-2 gap-1 border-t border-slate-200 pt-1.5 text-[9px] text-left text-slate-600 font-mono">
            {extraInfo.map((info, idx) => (
              <div key={idx} className="truncate">
                <span className="text-slate-400">{info.label}:</span>{' '}
                <strong className="text-slate-800">{info.value}</strong>
              </div>
            ))}
          </div>
        )}
      </div>

      <Button
        variant="secondary"
        size="sm"
        onClick={handlePrint}
        icon={<Printer className="w-3.5 h-3.5" />}
      >
        Cetak Stiker Label
      </Button>
    </div>
  );
};

export default ThermalLabel;
