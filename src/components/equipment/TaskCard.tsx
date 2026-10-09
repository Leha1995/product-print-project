import Icon from '@/components/ui/icon';
import RepairPhotos from '@/components/equipment/RepairPhotos';
import { EquipmentTask } from '@/lib/equipmentApi';
import { priorityOf } from '@/lib/taskPriority';

interface TaskCardProps {
  task: EquipmentTask;
  showOwner?: boolean;
  action?: React.ReactNode;
  large?: boolean;
}

const dateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '';

const TaskCard = ({ task, showOwner = false, action, large = false }: TaskCardProps) => {
  const open = task.status === 'open';
  const pr = priorityOf(task.priority);
  const where = [showOwner ? task.ownerName : '', task.equipmentName, task.location].filter(Boolean).join(' · ');

  return (
    <div
      className={`flex flex-col justify-between gap-3 border-2 bg-card p-3 ${
        open ? `${pr.border} border-l-[10px]` : 'border-muted-foreground opacity-70'
      }`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 border-2 px-1.5 py-0.5 font-head text-[0.6rem] font-bold uppercase ${pr.chip}`}
          >
            <Icon name={pr.icon} fallback="Flag" size={12} strokeWidth={2.5} />
            {pr.label}
          </span>
          <span
            className={`inline-flex items-center gap-1 border-2 px-1.5 py-0.5 font-head text-[0.6rem] font-bold uppercase ${
              open
                ? 'border-warning bg-warning text-warning-foreground'
                : task.status === 'done'
                  ? 'border-success bg-success text-success-foreground'
                  : 'border-muted-foreground bg-muted text-muted-foreground'
            }`}
          >
            <Icon
              name={open ? 'Clock' : task.status === 'done' ? 'CircleCheck' : 'Ban'}
              size={12}
              strokeWidth={2.5}
            />
            {open ? 'В работе' : task.status === 'done' ? 'Выполнено' : 'Отменено'}
          </span>
          {task.kind === 'repair' && (
            <span className="inline-flex items-center gap-1 border-2 border-primary bg-accent px-1.5 py-0.5 font-head text-[0.6rem] font-bold uppercase text-accent-foreground">
              <Icon name="Wrench" size={12} strokeWidth={2.5} />
              Ремонт
            </span>
          )}
          <span className="text-[11px] text-muted-foreground">{`№${task.id} · ${dateTime(task.createdAt)}`}</span>
        </div>

        {where && (
          <p className="mt-1.5 truncate font-head text-[0.85rem] font-black uppercase text-primary">{where}</p>
        )}
        <p
          className={`whitespace-pre-line text-primary ${
            large ? 'mt-2 text-[17px] font-semibold leading-snug md:text-[18px]' : 'mt-1 text-[13px]'
          }`}
        >
          {task.description}
        </p>
        <RepairPhotos photos={task.photos} size={56} />

        <p className="mt-2 text-[11px] text-muted-foreground">
          {`Поставил: ${task.createdByName || '—'} · Техник: ${task.technicianName || 'любой закреплённый'}`}
        </p>
        {!open && (
          <p className="mt-1 text-[12px] text-muted-foreground">
            {`${task.status === 'done' ? 'Выполнил' : 'Отменил'}: ${task.doneByName || '—'} · ${dateTime(task.doneAt)}`}
            {task.status === 'done' && (
              <span className="mt-0.5 block font-bold text-primary">
                {`Потрачено: ${Math.round(task.cost || 0).toLocaleString('ru-RU')} ₽`}
              </span>
            )}
            {task.doneComment && (
              <span className="mt-0.5 block whitespace-pre-line text-primary">{task.doneComment}</span>
            )}
          </p>
        )}
      </div>
      {action}
    </div>
  );
};

export default TaskCard;
