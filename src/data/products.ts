export type CategoryId = 'sushi' | 'pizza' | 'drinks';

export interface Product {
  id: string;
  name: string;
  category: CategoryId;
  price: number;
  weight: string;
  composition: string;
  image: string;
  barcode: string;
  hit?: boolean;
  shelfLifeHours?: number;
}

export const categories: { id: CategoryId | 'all'; label: string; icon: string }[] = [
  { id: 'all', label: 'Всё меню', icon: 'LayoutGrid' },
  { id: 'sushi', label: 'Суши бар', icon: 'Fish' },
  { id: 'pizza', label: 'Пицца', icon: 'Pizza' },
  { id: 'drinks', label: 'Напитки', icon: 'CupSoda' },
];

const SUSHI_IMG =
  'https://cdn.poehali.dev/projects/3ae3beb2-6f64-4c04-99be-0b8f386617e0/files/cbab4a1a-834a-470d-91c8-8ebdd00c9168.jpg';
const PIZZA_IMG =
  'https://cdn.poehali.dev/projects/3ae3beb2-6f64-4c04-99be-0b8f386617e0/files/b0382c00-473e-4cf3-839b-83fb3871e7ae.jpg';
const DRINK_IMG =
  'https://cdn.poehali.dev/projects/3ae3beb2-6f64-4c04-99be-0b8f386617e0/files/49154051-03a6-4ed5-87d0-181e5dda8ca5.jpg';

export const HERO_IMG =
  'https://cdn.poehali.dev/projects/3ae3beb2-6f64-4c04-99be-0b8f386617e0/files/341c11a5-5aac-4c15-9413-d91c5fabbfdd.jpg';

export const products: Product[] = [
  {
    id: 'sus-01',
    name: 'Филадельфия классик',
    category: 'sushi',
    price: 489,
    weight: '260 г',
    composition: 'Лосось, сыр творожный, огурец, рис, нори',
    image: SUSHI_IMG,
    barcode: '4600001000018',
    hit: true,
  },
  {
    id: 'sus-02',
    name: 'Калифорния с крабом',
    category: 'sushi',
    price: 419,
    weight: '245 г',
    composition: 'Краб-микс, авокадо, огурец, икра тобико, рис',
    image: SUSHI_IMG,
    barcode: '4600001000025',
  },
  {
    id: 'sus-03',
    name: 'Запечённый с угрём',
    category: 'sushi',
    price: 529,
    weight: '280 г',
    composition: 'Угорь, соус унаги, сыр, кунжут, рис',
    image: SUSHI_IMG,
    barcode: '4600001000032',
  },
  {
    id: 'sus-04',
    name: 'Сет «Автосуши 32»',
    category: 'sushi',
    price: 1690,
    weight: '1240 г',
    composition: '4 вида роллов, имбирь, васаби, соевый соус',
    image: SUSHI_IMG,
    barcode: '4600001000049',
    hit: true,
  },
  {
    id: 'piz-01',
    name: 'Пепперони острая',
    category: 'pizza',
    price: 649,
    weight: '480 г, 30 см',
    composition: 'Пепперони, моцарелла, томатный соус, чили',
    image: PIZZA_IMG,
    barcode: '4600002000017',
    hit: true,
  },
  {
    id: 'piz-02',
    name: 'Четыре сыра',
    category: 'pizza',
    price: 699,
    weight: '470 г, 30 см',
    composition: 'Моцарелла, дорблю, пармезан, чеддер, сливки',
    image: PIZZA_IMG,
    barcode: '4600002000024',
  },
  {
    id: 'piz-03',
    name: 'Мясная мега',
    category: 'pizza',
    price: 759,
    weight: '540 г, 30 см',
    composition: 'Бекон, ветчина, курица, лук, моцарелла, соус',
    image: PIZZA_IMG,
    barcode: '4600002000031',
  },
  {
    id: 'piz-04',
    name: 'Маргарита',
    category: 'pizza',
    price: 499,
    weight: '420 г, 30 см',
    composition: 'Томаты, моцарелла, базилик, оливковое масло',
    image: PIZZA_IMG,
    barcode: '4600002000048',
  },
  {
    id: 'drk-01',
    name: 'Кола классик 0,5',
    category: 'drinks',
    price: 129,
    weight: '500 мл',
    composition: 'Газированный напиток, сахар, кофеин',
    image: DRINK_IMG,
    barcode: '4600003000016',
  },
  {
    id: 'drk-02',
    name: 'Лимонад домашний',
    category: 'drinks',
    price: 189,
    weight: '400 мл',
    composition: 'Лимон, мята, тростниковый сахар, содовая',
    image: DRINK_IMG,
    barcode: '4600003000023',
    hit: true,
  },
  {
    id: 'drk-03',
    name: 'Зелёный чай холодный',
    category: 'drinks',
    price: 149,
    weight: '450 мл',
    composition: 'Чай сенча, лайм, лёд',
    image: DRINK_IMG,
    barcode: '4600003000030',
  },
  {
    id: 'drk-04',
    name: 'Вода без газа 0,5',
    category: 'drinks',
    price: 79,
    weight: '500 мл',
    composition: 'Питьевая вода первой категории',
    image: DRINK_IMG,
    barcode: '4600003000047',
  },
];