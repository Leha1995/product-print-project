import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import Icon from '@/components/ui/icon';

interface RepairPhotosProps {
  photos: string[];
  size?: number;
}

const RepairPhotos = ({ photos, size = 56 }: RepairPhotosProps) => {
  const [index, setIndex] = useState<number | null>(null);
  if (!photos.length) return null;
  const current = index !== null ? photos[index] : null;

  return (
    <>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {photos.map((src, i) => (
          <button
            key={src}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Фото поломки ${i + 1}`}
            className="overflow-hidden border-2 border-primary transition-transform hover:-translate-y-0.5"
            style={{ width: size, height: size }}
          >
            <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>

      <Dialog open={index !== null} onOpenChange={(v) => !v && setIndex(null)}>
        <DialogContent className="max-w-[min(92vw,900px)] border-2 border-primary bg-background p-2">
          {current && (
            <div className="relative">
              <img src={current} alt="Фото поломки" className="max-h-[80vh] w-full object-contain" />
              {photos.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setIndex((i) => ((i ?? 0) - 1 + photos.length) % photos.length)}
                    aria-label="Предыдущее фото"
                    className="absolute left-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center border-2 border-primary bg-card text-primary"
                  >
                    <Icon name="ChevronLeft" size={20} strokeWidth={2.5} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIndex((i) => ((i ?? 0) + 1) % photos.length)}
                    aria-label="Следующее фото"
                    className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center border-2 border-primary bg-card text-primary"
                  >
                    <Icon name="ChevronRight" size={20} strokeWidth={2.5} />
                  </button>
                  <p className="mt-1 text-center font-head text-[0.7rem] font-bold uppercase text-muted-foreground">
                    {`${(index ?? 0) + 1} из ${photos.length}`}
                  </p>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default RepairPhotos;
