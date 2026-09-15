import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/icon';
import { TUNES, previewTune, stopTune, unlockAudio } from '@/lib/chiptune';

interface SoundPickerProps {
  title: string;
  icon: string;
  value: string;
  onChange: (id: string) => void;
}

const SoundPicker = ({ title, icon, value, onChange }: SoundPickerProps) => {
  const [playing, setPlaying] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const preview = (id: string) => {
    unlockAudio();
    if (timer.current) window.clearTimeout(timer.current);
    if (playing === id) {
      stopTune();
      setPlaying(null);
      return;
    }
    previewTune(id, 6);
    setPlaying(id);
    timer.current = window.setTimeout(() => setPlaying(null), 6000);
  };

  return (
    <div className="mt-3 border-2 border-dashed border-primary p-3">
      <span className="flex items-center gap-2 font-head text-[0.65rem] font-medium uppercase tracking-[0.06em] text-primary">
        <Icon name={icon} size={13} strokeWidth={2.5} />
        {title}
      </span>

      <div className="mt-2 grid gap-1.5">
        {TUNES.map((tune) => {
          const active = value === tune.id;
          const isPlaying = playing === tune.id;
          return (
            <div
              key={tune.id}
              className={`flex items-center gap-2 border-2 border-primary transition-colors ${
                active ? 'bg-primary text-primary-foreground' : 'bg-card text-primary'
              }`}
            >
              <button
                onClick={() => onChange(tune.id)}
                className="flex flex-1 items-center gap-2 px-3 py-2 text-left"
              >
                <Icon
                  name={active ? 'CircleCheck' : 'Circle'}
                  size={15}
                  strokeWidth={2.5}
                  className="shrink-0"
                />
                <span>
                  <span className="block font-head text-[0.72rem] font-medium uppercase tracking-[0.04em]">
                    {tune.name}
                  </span>
                  <span
                    className={`block text-[11px] ${active ? 'opacity-80' : 'text-muted-foreground'}`}
                  >
                    {tune.hint}
                  </span>
                </span>
              </button>
              <button
                onClick={() => preview(tune.id)}
                aria-label={`Прослушать ${tune.name}`}
                className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center border-l-2 border-primary transition-colors ${
                  active
                    ? 'bg-primary text-primary-foreground hover:bg-primary/80'
                    : 'bg-card text-primary hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                <Icon name={isPlaying ? 'Square' : 'Play'} size={15} strokeWidth={2.5} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SoundPicker;
