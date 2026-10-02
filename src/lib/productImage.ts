export const NO_PHOTO = '/no-photo.jpg';

const STOCK_IMAGES = new Set([
  'https://cdn.poehali.dev/projects/3ae3beb2-6f64-4c04-99be-0b8f386617e0/files/341c11a5-5aac-4c15-9413-d91c5fabbfdd.jpg',
  'https://cdn.poehali.dev/projects/3ae3beb2-6f64-4c04-99be-0b8f386617e0/files/49154051-03a6-4ed5-87d0-181e5dda8ca5.jpg',
  'https://cdn.poehali.dev/projects/3ae3beb2-6f64-4c04-99be-0b8f386617e0/files/b0382c00-473e-4cf3-839b-83fb3871e7ae.jpg',
  'https://cdn.poehali.dev/projects/3ae3beb2-6f64-4c04-99be-0b8f386617e0/files/cbab4a1a-834a-470d-91c8-8ebdd00c9168.jpg',
]);

export const hasOwnPhoto = (image?: string | null) => {
  const src = (image || '').trim();
  return Boolean(src) && !src.startsWith('idb:') && !STOCK_IMAGES.has(src);
};

export const productImage = (image?: string | null) => (hasOwnPhoto(image) ? (image as string) : NO_PHOTO);
