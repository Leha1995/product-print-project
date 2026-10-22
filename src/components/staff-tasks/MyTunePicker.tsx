import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/icon';
import { toast } from '@/hooks/use-toast';
import { TUNES, getTune, previewTune, stopTune, unlockAudio } from '@/lib/chiptune';
import { StaffTasksData, saveMyTune } from '@/lib/staffTasksApi';

interface MyTunePickerProps {
  value: string;
  onSaved: (data: StaffTasksData) => void;
}

const MyTunePicker = ({ value, onSaved }: MyTunePickerProps) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
      stopTune();
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

  const choose = async (id: string) => {
    if (busy || id === value) return;
    setBusy(id);
    try {
      onSaved(await saveMyTune(id));
      toast({ title: id ? `Мелодия: ${getTune(id).name}` : 'Мелодия как у руководителя' });
    } catch {
      toast({ title: 'Не удалось сохранить мелодию', description: 'Проверьте интернет и попробуйте ещё раз' });
    } finally {
      setBusy(null);
    }
  };

  const options: { id: string; name: string; hint: string }[] = [
    { id: '', name: 'Как выбрал руководитель', hint: 'У каждого задания своя мелодия' },
    ...TUNES.map((t) => ({ id: t.id, name: t.name, hint: t.hint })),
  ];

  return (
    <div className="mt-4 border-2 border-primary bg-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 p-3 text-left"
        aria-expanded={open}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-primary bg-accent text-accent-foreground">
          <Icon name="Music" size={18} strokeWidth={2.5} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-head text-[0.8rem] font-black uppercase text-primary">Моя мелодия сигнала</span>
          <span className="block text-[12px] text-muted-foreground">
            {value ? getTune(value).name : 'Как выбрал руководитель'}
          </span>
        </span>
        <Icon name={open ? 'ChevronUp' : 'ChevronDown'} size={18} strokeWidth={2.5} className="text-primary" />
      </button>

      {open && (
        <div className="grid gap-1.5 border-t-2 border-primary p-3">
          {options.map((o) => {
            const active = value === o.id;
            return (
              <div
                key={o.id || 'default'}
                className={`flex items-center border-2 border-primary transition-colors ${
                  active ? 'bg-primary text-primary-foreground' : 'bg-card text-primary'
                }`}
              >
                <button
                  onClick={() => choose(o.id)}
                  disabled={busy !== null}
                  className="flex min-h-[44px] flex-1 items-center gap-2 px-3 py-2 text-left disabled:opacity-70"
                >
                  <Icon
                    name={busy === o.id ? 'Loader2' : active ? 'CircleCheck' : 'Circle'}
                    size={15}
                    strokeWidth={2.5}
                    className={`shrink-0 ${busy === o.id ? 'animate-spin' : ''}`}
                  />
                  <span>
                    <span className="block font-head text-[0.72rem] font-medium uppercase tracking-[0.04em]">{o.name}</span>
                    <span className={`block text-[11px] ${active ? 'opacity-80' : 'text-muted-foreground'}`}>{o.hint}</span>
                  </span>
                </button>
                {o.id && (
                  <button
                    onClick={() => preview(o.id)}
                    aria-label={`Прослушать ${o.name}`}
                    className={`flex h-[44px] w-[44px] shrink-0 items-center justify-center border-l-2 border-primary transition-colors ${
                      active ? 'bg-primary text-primary-foreground hover:bg-primary/80' : 'bg-card text-primary hover:bg-muted'
                    }`}
                  >
                    <Icon name={playing === o.id ? 'Square' : 'Play'} size={15} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MyTunePicker;
