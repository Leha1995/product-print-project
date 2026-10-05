import { useState } from 'react';
import Icon from '@/components/ui/icon';
import TaskCard from '@/components/equipment/TaskCard';
import { EquipmentTask } from '@/lib/equipmentApi';

interface TasksPanelProps {
  tasks: EquipmentTask[];
  canManage: boolean;
  onCancel: (task: EquipmentTask) => void;
}

const TasksPanel = ({ tasks, canManage, onCancel }: TasksPanelProps) => {
  const [showClosed, setShowClosed] = useState(false);
  const openTasks = tasks.filter((t) => t.status === 'open');
  const closed = tasks.filter((t) => t.status !== 'open');
  if (!tasks.length) return null;

  return (
    <div className="mt-4 border-2 border-primary bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-head text-[0.85rem] font-black uppercase text-primary">
          <Icon name="ClipboardList" size={16} strokeWidth={2.5} />
          {`Задачи технику · в работе ${openTasks.length}`}
        </p>
        {closed.length > 0 && (
          <button
            onClick={() => setShowClosed((v) => !v)}
            className="flex items-center gap-1 font-head text-[0.68rem] font-bold uppercase text-muted-foreground hover:text-primary"
          >
            {showClosed ? 'Скрыть закрытые' : `Закрытые за 30 дней · ${closed.length}`}
            <Icon name={showClosed ? 'ChevronUp' : 'ChevronDown'} size={13} strokeWidth={2.5} />
          </button>
        )}
      </div>

      {openTasks.length === 0 && !showClosed && (
        <p className="mt-2 text-[13px] text-muted-foreground">Открытых задач нет</p>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {[...openTasks, ...(showClosed ? closed : [])].map((t) => (
          <TaskCard
            key={t.id}
            task={t}
            action={
              canManage && t.status === 'open' ? (
                <button
                  onClick={() => onCancel(t)}
                  className="flex w-full items-center justify-center gap-1.5 border-2 border-primary bg-background px-2 py-1.5 font-head text-[0.65rem] font-bold uppercase text-primary transition-colors hover:bg-muted"
                >
                  <Icon name="Ban" size={13} strokeWidth={2.5} />
                  Отменить задачу
                </button>
              ) : undefined
            }
          />
        ))}
      </div>
    </div>
  );
};

export default TasksPanel;
