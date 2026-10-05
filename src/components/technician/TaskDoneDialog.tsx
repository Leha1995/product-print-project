import { useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import Icon from '@/components/ui/icon';
import { EquipmentTask } from '@/lib/equipmentApi';

interface TaskDoneDialogProps {
  task: EquipmentTask | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (task: EquipmentTask, comment: string) => Promise<void>;
}

const TaskDoneDialog = ({ task, open, onOpenChange, onConfirm }: TaskDoneDialogProps) => {
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setComment('');
      setBusy(false);
    }
  }, [open]);

  if (!task) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm(task, comment.trim());
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px] border-2 border-primary bg-background p-5">
        <form onSubmit={submit}>
          <h3 className="pr-8 font-head text-lg font-black uppercase text-primary">Задача выполнена</h3>
          <p className="mt-1 line-clamp-2 text-[13px] text-muted-foreground">{task.description}</p>
          <label className="mt-4 block">
            <span className="font-head text-[0.68rem] font-bold uppercase tracking-[0.06em] text-primary">
              Что сделано (необязательно)
            </span>
            <textarea
              autoFocus
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Заменил прокладку, проверил работу"
              className="mt-1 w-full resize-none border-2 border-primary bg-card px-3 py-2.5 font-body text-[14px] text-primary outline-none"
            />
          </label>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="border-2 border-primary bg-card px-4 py-2.5 font-head text-[0.72rem] font-bold uppercase text-primary transition-colors hover:bg-muted"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-2 border-2 border-primary bg-accent px-4 py-2.5 font-head text-[0.75rem] font-bold uppercase text-accent-foreground transition-transform hover:-translate-y-0.5 disabled:opacity-50"
            >
              <Icon
                name={busy ? 'Loader2' : 'CircleCheck'}
                size={16}
                strokeWidth={2.5}
                className={busy ? 'animate-spin' : ''}
              />
              Выполнено
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default TaskDoneDialog;
