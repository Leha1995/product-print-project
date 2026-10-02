import { Equipment } from '@/lib/equipmentApi';

const DAY = 24 * 60 * 60 * 1000;

export const daysInService = (item: Equipment, at = new Date()) => {
  if (!item.commissionedAt) return 0;
  const start = new Date(`${item.commissionedAt.slice(0, 10)}T00:00:00`);
  const end = item.active === false && item.writtenOffAt ? new Date(item.writtenOffAt) : at;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / DAY));
};

export const hasDepreciation = (item: Equipment) =>
  Boolean(item.commissionedAt) && (item.depreciationPerDay || 0) > 0 && (item.price || 0) > 0;

export const residualValue = (item: Equipment, at = new Date()) => {
  const price = item.price || 0;
  if (!hasDepreciation(item)) return price;
  const lost = daysInService(item, at) * (item.depreciationPerDay || 0);
  return Math.max(0, price - lost);
};

export const depreciationDaysLeft = (item: Equipment, at = new Date()) => {
  if (!hasDepreciation(item)) return null;
  return Math.ceil(residualValue(item, at) / (item.depreciationPerDay || 1));
};
