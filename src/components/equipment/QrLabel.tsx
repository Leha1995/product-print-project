import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Equipment } from '@/lib/equipmentApi';

export const makeQrDataUrl = (code: string) =>
  QRCode.toDataURL(code, { margin: 0, width: 320, errorCorrectionLevel: 'M' });

interface QrLabelProps {
  item: Equipment;
}

const QrLabel = ({ item }: QrLabelProps) => {
  const [src, setSrc] = useState('');

  useEffect(() => {
    let alive = true;
    makeQrDataUrl(item.code)
      .then((url) => {
        if (alive) setSrc(url);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [item.code]);

  return (
    <div className="print-area mx-auto w-full max-w-[320px] border-2 border-primary bg-white p-3 text-black">
      <p className="text-center font-head text-[13px] font-black uppercase leading-tight">
        {item.name}
      </p>
      <div className="mt-2 flex justify-center">
        {src && <img src={src} alt={item.code} className="h-[130px] w-[130px]" />}
      </div>
    </div>
  );
};

export default QrLabel;