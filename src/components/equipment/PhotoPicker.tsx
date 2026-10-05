import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { readFile, shrink } from '@/lib/imageFile';

interface PhotoPickerProps {
  photos: string[];
  onChange: (photos: string[]) => void;
  max?: number;
  label?: string;
  onBusyChange?: (busy: boolean) => void;
}

const PhotoPicker = ({ photos, onChange, max = 4, label = 'Фото', onBusyChange }: PhotoPickerProps) => {
  const [reading, setReading] = useState(false);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setReading(true);
    onBusyChange?.(true);
    try {
      const list = Array.from(files)
        .filter((f) => f.type.startsWith('image/'))
        .slice(0, max - photos.length);
      const ready = await Promise.all(list.map(async (f) => shrink(await readFile(f), 1280, 0.8)));
      onChange([...photos, ...ready].slice(0, max));
    } finally {
      setReading(false);
      onBusyChange?.(false);
    }
  };

  return (
    <div>
      <span className="font-head text-[0.68rem] font-bold uppercase tracking-[0.06em] text-primary">
        {`${label} · ${photos.length} из ${max}`}
      </span>
      <div className="mt-1 flex flex-wrap gap-2">
        {photos.map((src, i) => (
          <div key={i} className="relative h-16 w-16 border-2 border-primary">
            <img src={src} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(photos.filter((_, j) => j !== i))}
              aria-label="Убрать фото"
              className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center border-2 border-primary bg-destructive text-destructive-foreground"
            >
              <Icon name="X" size={12} strokeWidth={3} />
            </button>
          </div>
        ))}
        {photos.length < max && (
          <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-0.5 border-2 border-dashed border-primary bg-card text-primary transition-colors hover:bg-muted">
            <Icon
              name={reading ? 'Loader2' : 'Camera'}
              size={18}
              strokeWidth={2.5}
              className={reading ? 'animate-spin' : ''}
            />
            <span className="font-head text-[0.55rem] font-bold uppercase">Добавить</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
        )}
      </div>
    </div>
  );
};

export default PhotoPicker;
