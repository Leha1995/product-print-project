export type TaskPriority = 'urgent' | 'soon' | 'normal';

export const PRIORITY_OPTIONS: {
  value: TaskPriority;
  label: string;
  hint: string;
  icon: string;
  chip: string;
  border: string;
}[] = [
  {
    value: 'urgent',
    label: 'Очень срочно',
    hint: 'Бросить всё и сделать',
    icon: 'Siren',
    chip: 'border-red-700 bg-red-600 text-white',
    border: 'border-red-600',
  },
  {
    value: 'soon',
    label: 'Побыстрее',
    hint: 'В ближайшее время',
    icon: 'Timer',
    chip: 'border-yellow-600 bg-yellow-400 text-black',
    border: 'border-yellow-500',
  },
  {
    value: 'normal',
    label: 'Не срочно',
    hint: 'Когда будет время',
    icon: 'Leaf',
    chip: 'border-green-700 bg-green-600 text-white',
    border: 'border-green-600',
  },
];

export const priorityOf = (value?: string | null) =>
  PRIORITY_OPTIONS.find((p) => p.value === value) ?? PRIORITY_OPTIONS[2];
