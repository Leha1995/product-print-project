import { useCallback, useState } from 'react';
import TerminalHeader from '@/components/TerminalHeader';
import MenuSection from '@/components/MenuSection';
import PrintDialog from '@/components/PrintDialog';
import ProductFormDialog from '@/components/ProductFormDialog';
import useCatalog from '@/hooks/useCatalog';
import useCategories from '@/hooks/useCategories';
import AdminLoginDialog from '@/components/AdminLoginDialog';
import useAdmin from '@/hooks/useAdmin';
import useLabelSettings from '@/hooks/useLabelSettings';
import DirectPrintArea from '@/components/DirectPrintArea';
import BatchPrintArea from '@/components/BatchPrintArea';
import BatchPrintDialog from '@/components/BatchPrintDialog';
import PrintLog, { PrintJob } from '@/components/PrintLog';
import Footer from '@/components/Footer';
import { Product, productCategories } from '@/data/products';
import { toast } from '@/hooks/use-toast';

const Index = () => {
  const [selected, setSelected] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [editing, setEditing] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const { items, saveProduct, removeProduct, resetCatalog, replaceCatalog } = useCatalog();
  const {
    categories,
    addCategory,
    renameCategory,
    removeCategory,
    resetCategories,
    replaceCategories,
  } = useCategories();
  const { isAdmin, login, logout } = useAdmin(() =>
    toast({
      title: 'Режим администратора отключён',
      description: '10 минут без действий — вход сброшен для безопасности',
    }),
  );
  const [adminOpen, setAdminOpen] = useState(false);
  const { settings, update, reset } = useLabelSettings();
  const [quickPrint, setQuickPrint] = useState<Product | null>(null);
  const [quickStamp, setQuickStamp] = useState(() => new Date());
  const [batchPrint, setBatchPrint] = useState<Product[] | null>(null);
  const [batchStamp, setBatchStamp] = useState(() => new Date());
  const [batchLabel, setBatchLabel] = useState('');
  const [batchPick, setBatchPick] = useState<Product[]>([]);
  const [batchOpen, setBatchOpen] = useState(false);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSelect = (product: Product) => {
    setSelected(product);
    setOpen(true);
  };

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
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        const nextProducts = Array.isArray(data) ? data : data.products;
        if (!Array.isArray(nextProducts) || !nextProducts.length) {
          throw new Error('empty');
        }
        replaceCatalog(nextProducts as Product[]);
        if (Array.isArray(data.categories) && data.categories.length) {
          replaceCategories(data.categories);
        }
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

  const handleQuickPrint = (product: Product) => {
    setQuickStamp(new Date());
    setQuickPrint(product);
  };

  const handleQuickDone = useCallback((product: Product) => {
    setQuickPrint(null);
    handlePrinted(product, 1);
  }, []);

  const handlePrintBatch = (list: Product[], label: string) => {
    if (!list.length) {
      toast({ title: 'В категории нет товаров' });
      return;
    }
    setBatchLabel(label);
    setBatchPick(list);
    setBatchOpen(true);
  };

  const handleBatchConfirm = (list: Product[]) => {
    setBatchStamp(new Date());
    setBatchPrint(list);
  };

  const handleBatchDone = useCallback((list: Product[]) => {
    setBatchPrint(null);
    const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const grouped = new Map<string, { product: Product; copies: number }>();
    list.forEach((p) => {
      const row = grouped.get(p.id);
      if (row) row.copies += 1;
      else grouped.set(p.id, { product: p, copies: 1 });
    });
    setJobs((prev) => [
      ...Array.from(grouped.values()).map(({ product, copies }) => ({
        id: `${product.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: product.name,
        price: product.price,
        copies,
        time,
      })),
      ...prev,
    ]);
    toast({
      title: 'Партия отправлена на принтер',
      description: `${batchLabel} · ${list.length} этикеток`,
    });
  }, [batchLabel]);

  const handlePrinted = (product: Product, copies: number) => {
    setJobs((prev) => [
      {
        id: `${product.id}-${Date.now()}`,
        name: product.name,
        price: product.price,
        copies,
        time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      },
      ...prev,
    ]);
    toast({
      title: 'Маркировка отправлена на принтер',
      description: `${product.name} · ${copies} шт.`,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <TerminalHeader
        printedCount={jobs.length}
        onNavigate={scrollTo}
        isAdmin={isAdmin}
        onAdminClick={() => setAdminOpen(true)}
      />
      <main>
        <MenuSection
          products={items}
          categories={categories}
          onAddCategory={(label, icon) => {
            addCategory(label, icon);
            toast({ title: 'Категория добавлена', description: label });
          }}
          onRenameCategory={renameCategory}
          onRemoveCategory={(category) => {
            const used = items.filter((p) =>
              productCategories(p).includes(category.id),
            ).length;
            if (used) {
              toast({
                title: 'Категория не пустая',
                description: `Сначала удалите или перенесите товары (${used} шт.)`,
              });
              return;
            }
            removeCategory(category.id);
            toast({ title: 'Категория удалена', description: category.label });
          }}
          onResetCategories={resetCategories}
          onExport={handleExport}
          onImport={handleImport}
          onSelect={handleSelect}
          onPrint={handleQuickPrint}
          onPrintBatch={handlePrintBatch}
          onAdd={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          onEdit={(product) => {
            setEditing(product);
            setFormOpen(true);
          }}
          onDelete={(product) => {
            removeProduct(product.id);
            toast({ title: 'Товар удалён', description: product.name });
          }}
          onReset={() => {
            resetCatalog();
            toast({ title: 'Каталог возвращён к исходному списку' });
          }}
          isAdmin={isAdmin}
          onRequestAdmin={() => setAdminOpen(true)}
        />
        <PrintLog jobs={jobs} onClear={() => setJobs([])} />
      </main>
      <Footer />
      <PrintDialog
        product={selected}
        open={open}
        onOpenChange={setOpen}
        onPrinted={handlePrinted}
        settings={settings}
        onSettingsChange={update}
        onSettingsReset={reset}
        isAdmin={isAdmin}
      />
      <DirectPrintArea
        product={quickPrint}
        settings={settings}
        printedAt={quickStamp}
        onDone={handleQuickDone}
      />
      <BatchPrintDialog
        products={batchPick}
        label={batchLabel}
        open={batchOpen}
        onOpenChange={setBatchOpen}
        onConfirm={handleBatchConfirm}
      />
      <BatchPrintArea
        products={batchPrint}
        settings={settings}
        printedAt={batchStamp}
        onDone={handleBatchDone}
      />
      <ProductFormDialog
        product={editing}
        categories={categories}
        open={formOpen}
        onOpenChange={setFormOpen}
        onSave={(product) => {
          saveProduct(product);
          toast({
            title: editing ? 'Товар обновлён' : 'Товар добавлен',
            description: `${product.name} · ${product.price} ₽`,
          });
        }}
      />
      <AdminLoginDialog
        open={adminOpen}
        onOpenChange={setAdminOpen}
        isAdmin={isAdmin}
        onLogin={(pin) => {
          const ok = login(pin);
          if (ok) toast({ title: 'Вход выполнен', description: 'Редактирование каталога доступно' });
          return ok;
        }}
        onLogout={() => {
          logout();
          toast({ title: 'Вы вышли из режима администратора' });
        }}
      />
    </div>
  );
};

export default Index;