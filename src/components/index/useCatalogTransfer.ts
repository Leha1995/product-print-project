import { Product } from '@/data/products';
import { toast } from '@/hooks/use-toast';

interface CatalogTransferParams<C, S> {
  categories: C[];
  items: Product[];
  settings: S;
  replaceCategories: (list: C[]) => void;
  replaceCatalog: (list: Product[]) => Promise<boolean>;
  update: (next: Partial<S>) => void;
}

const useCatalogTransfer = <C, S>({
  categories,
  items,
  settings,
  replaceCategories,
  replaceCatalog,
  update,
}: CatalogTransferParams<C, S>) => {
  const handleExport = () => {
    const payload = {
      type: 'asap-catalog',
      version: 1,
      exportedAt: new Date().toISOString(),
      categories,
      products: items,
      settings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `katalog-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Каталог выгружен', description: `${items.length} позиций в файле` });
  };

  const handleImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(String(reader.result));
        const nextProducts = Array.isArray(data) ? data : data.products;
        if (!Array.isArray(nextProducts) || !nextProducts.length) {
          throw new Error('empty');
        }
        toast({
          title: 'Загружаем каталог',
          description: `${nextProducts.length} позиций, это займёт несколько секунд`,
        });
        if (Array.isArray(data.categories) && data.categories.length) {
          replaceCategories(data.categories);
        }
        const ok = await replaceCatalog(nextProducts as Product[]);
        if (!ok) return;
        if (data.settings) update(data.settings);
        toast({
          title: 'Каталог загружен',
          description: `${nextProducts.length} позиций перенесено`,
        });
      } catch {
        toast({
          title: 'Не удалось прочитать файл',
          description: 'Нужен файл, выгруженный кнопкой «Выгрузить»',
        });
      }
    };
    reader.readAsText(file);
  };

  return { handleExport, handleImport };
};

export default useCatalogTransfer;
