export const SHELF_STEPS = [3, 12, 48, 72, 120, 168, 720, 1440, 2160, 4320, 8760];

const round = (n: number) => Math.round(n * 10) / 10;

export const shelfLabel = (hours: number) => {
  if (hours < 24) return `${round(hours)} ч`;
  const days = hours / 24;
  if (days < 30) return `${round(days)} сут`;
  if (days < 365) return `${round(days / 30)} мес`;
  const years = round(days / 365);
  return `${years} ${years === 1 ? 'год' : years < 5 ? 'года' : 'лет'}`;
};

export interface ShelfOption {
  hours: number;
  label: string;
  count: number;
}
