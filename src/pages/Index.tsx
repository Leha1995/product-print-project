import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TerminalHeader from '@/components/TerminalHeader';
import MenuSection from '@/components/MenuSection';
import PrintDialog from '@/components/PrintDialog';
import ProductFormDialog from '@/components/ProductFormDialog';
import useCatalog from '@/hooks/useCatalog';
import useManagedUsers from '@/hooks/useManagedUsers';
import StaffOverviewDialog from '@/components/StaffOverviewDialog';
import { fetchOverview } from '@/lib/catalogApi';
import WorkspaceSwitcher from '@/components/WorkspaceSwitcher';
import useCategories from '@/hooks/useCategories';
import AdminLoginDialog from '@/components/AdminLoginDialog';
import LoginScreen from '@/components/LoginScreen';
import UsersDialog from '@/components/UsersDialog';
import useAuth from '@/hooks/useAuth';
import usePrintHistory from '@/hooks/usePrintHistory';
import useLabelSettings from '@/hooks/useLabelSettings';
import DirectPrintArea from '@/components/DirectPrintArea';
import BatchPrintArea from '@/components/BatchPrintArea';
import BatchPrintDialog from '@/components/BatchPrintDialog';
import PrintLog, { PrintJob } from '@/components/PrintLog';
import DefrostDialog from '@/components/DefrostDialog';
import SharedCatalogDialog from '@/components/SharedCatalogDialog';
import DefrostPrintArea from '@/components/DefrostPrintArea';
import { DefrostInfo } from '@/components/DefrostLabel';
import Footer from '@/components/Footer';
import { Product, productCategories } from '@/data/products';
import { toast } from '@/hooks/use-toast';
import { playAlertTune, playFuneralTune, unlockAudio } from '@/lib/chiptune';

const Index = () => {
  const [selected, setSelected] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [editing, setEditing] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const { user, ready, kicked, login, logout, isAuthed, isAdmin, isSuperAdmin } = useAuth();
  const { managed, refreshManaged } = useManagedUsers(isAdmin);
  const [targetId, setTargetId] = useState<number | null>(null);
  const activeTarget = targetId ?? user?.id ?? null;
  const {
    items,
    categories: catList,
    prefs,
    history,
    saveHistory,
    saveProduct,
    addProducts,
    removeProduct,
    replaceCatalog,
    saveCategories,
    savePrefs,
  } = useCatalog(user?.id, activeTarget);
  const {
    categories,
    addCategory,
    renameCategory,
    removeCategory,
    resetCategories,
    replaceCategories,
  } = useCategories(catList, saveCategories);
  const [usersOpen, setUsersOpen] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const { markPrinted, getExpiry, getStatus, now } = usePrintHistory(history, saveHistory);

  useEffect(() => {
    if (!isAdmin) {
      setAlertCount(0);
      return;
    }
    const load = () =>
      fetchOverview()
        .then((list) =>
          setAlertCount(list.reduce((sum, s) => sum + s.expired.length + s.soon.length, 0)),
        )
        .catch(() => undefined);
    load();
    const timer = window.setInterval(load, 120000);
    return () => window.clearInterval(timer);
  }, [isAdmin, overviewOpen]);
  const [adminOpen, setAdminOpen] = useState(false);
  const { settings, update, reset } = useLabelSettings();
  const [quickPrint, setQuickPrint] = useState<Product | null>(null);
  const [quickStamp, setQuickStamp] = useState(() => new Date());
  const [batchPrint, setBatchPrint] = useState<Product[] | null>(null);
  const [batchStamp, setBatchStamp] = useState(() => new Date());
  const [batchLabel, setBatchLabel] = useState('');
  const [batchPick, setBatchPick] = useState<Product[]>([]);
  const [batchOpen, setBatchOpen] = useState(false);
  const [defrostOpen, setDefrostOpen] = useState(false);
  const [sharedOpen, setSharedOpen] = useState(false);
  const [defrostInfo, setDefrostInfo] = useState<DefrostInfo | null>(null);
  const [defrostCopies, setDefrostCopies] = useState(1);
  const [defrostStamp, setDefrostStamp] = useState(() => new Date());

  const expiredIds = useMemo(() => {
    const set = new Set<string>();
    items.forEach((p) => {
      if (getExpiry(p).expired) set.add(p.id);
    });
    return set;
  }, [items, getExpiry, now]);

  const soonIds = useMemo(() => {
    const set = new Set<string>();
    items.forEach((p) => {
      if (getStatus(p).soon) set.add(p.id);
    });
    return set;
  }, [items, getStatus, now]);

  const alertedRef = useRef<Set<string>>(new Set());
  const deadRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    const fresh = Array.from(soonIds).filter((id) => !alertedRef.current.has(id));
    alertedRef.current.forEach((id) => {
      if (!soonIds.has(id) && !expiredIds.has(id)) alertedRef.current.delete(id);
    });
    if (!fresh.length) return;
    fresh.forEach((id) => alertedRef.current.add(id));
    playAlertTune(settings.alertTune, 10);
    const names = fresh
      .map((id) => items.find((p) => p.id === id)?.name)
      .filter(Boolean)
      .join(', ');
    toast({
      title: 'Меньше часа до конца срока',
      description: names || `${fresh.length} позиций пора перепечатать`,
    });
  }, [soonIds, expiredIds, items, settings.alertTune]);

  useEffect(() => {
    deadRef.current.forEach((id) => {
      if (!expiredIds.has(id)) deadRef.current.delete(id);
    });
    const fresh = Array.from(expiredIds).filter((id) => !deadRef.current.has(id));
    if (!fresh.length) return;
    fresh.forEach((id) => deadRef.current.add(id));
    playFuneralTune(settings.expiredTune, 17);
    const names = fresh
      .map((id) => items.find((p) => p.id === id)?.name)
      .filter(Boolean)
      .join(', ');
    toast({
      title: 'Срок годности вышел',
      description: names || `${fresh.length} позиций нужно снять и перепечатать`,
    });
  }, [expiredIds, items, settings.expiredTune]);

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

  const handleQuickPrint = (product: Product) => {
    setQuickStamp(new Date());
    setQuickPrint(product);
  };

  const handleQuickDone = useCallback(
    (product: Product) => {
      setQuickPrint(null);
      markPrinted([product.id]);
      handlePrinted(product, 1);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [markPrinted, settings.makerName],
  );

  const handleDefrostConfirm = (info: DefrostInfo, copies: number) => {
    setDefrostCopies(copies);
    setDefrostStamp(new Date());
    setDefrostInfo(info);
  };

  const handleDefrostDone = useCallback(
    (info: DefrostInfo) => {
      setDefrostInfo(null);
      setJobs((prev) => [
        {
          id: `defrost-${Date.now()}`,
          name: 'Дефрост',
          staff: info.staff,
          copies: defrostCopies,
          time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
        },
        ...prev,
      ]);
      toast({
        title: 'Маркировка дефроста отправлена',
        description: `${info.staff} · ${info.temp}`,
      });
    },
    [defrostCopies],
  );

  const handlePrintBatch = (list: Product[], label: string) => {
    if (!list.length) {
      toast({ title: 'В категории нет продуктов' });
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
    markPrinted(list.map((p) => p.id));
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
        staff: settings.makerName,
        copies,
        time,
      })),
      ...prev,
    ]);
    toast({
      title: 'Партия отправлена на принтер',
      description: `${batchLabel} · ${list.length} этикеток`,
    });
  }, [batchLabel, markPrinted, settings.makerName]);

  const handlePrinted = (product: Product, copies: number) => {
    setJobs((prev) => [
      {
        id: `${product.id}-${Date.now()}`,
        name: product.name,
        staff: settings.makerName,
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

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background font-head uppercase text-primary">
        Загрузка...
      </div>
    );
  }

  if (!isAuthed) {
    return <LoginScreen onLogin={login} kicked={kicked} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <TerminalHeader
        printedCount={jobs.length}
        onNavigate={scrollTo}
        isAdmin={isAdmin}
        isSuperAdmin={isSuperAdmin}
        userName={user?.fullName || user?.username || ''}
        onUsersClick={() => setUsersOpen(true)}
        onOverviewClick={() => setOverviewOpen(true)}
        alertCount={alertCount}
        onAdminClick={() => setAdminOpen(true)}
        accessUntil={user?.accessUntil ?? null}
      />
      {isAdmin && user && (
        <WorkspaceSwitcher
          managed={managed}
          currentId={user.id}
          targetId={activeTarget ?? user.id}
          onChange={setTargetId}
        />
      )}
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
                description: `Сначала удалите или перенесите продукты (${used} шт.)`,
              });
              return;
            }
            removeCategory(category.id);
            toast({ title: 'Категория удалена', description: category.label });
          }}
          onResetCategories={resetCategories}
          onExport={handleExport}
          onImport={handleImport}
          onSharedBase={() => setSharedOpen(true)}
          onSelect={handleSelect}
          onPrint={handleQuickPrint}
          onPrintBatch={handlePrintBatch}
          onDefrost={() => setDefrostOpen(true)}
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
            toast({ title: 'Продукт удалён', description: product.name });
          }}
          isAdmin={isAdmin}
          prefs={prefs}
          onPrefsChange={savePrefs}
          onRequestAdmin={() => setAdminOpen(true)}
          expiredIds={expiredIds}
          getStatus={getStatus}
        />
        <PrintLog jobs={jobs} onClear={() => setJobs([])} />
      </main>
      <Footer />
      <PrintDialog
        product={selected}
        open={open}
        onOpenChange={setOpen}
        onPrinted={(product, copies) => {
          markPrinted([product.id]);
          handlePrinted(product, copies);
        }}
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
      <SharedCatalogDialog
        open={sharedOpen}
        onOpenChange={setSharedOpen}
        localProducts={items}
        onImport={async (list) => {
          const added = await addProducts(list);
          if (added) {
            toast({ title: 'Карточки добавлены', description: `${added} шт. из общей базы` });
          }
        }}
      />
      <DefrostDialog
        staffList={settings.staffList}
        open={defrostOpen}
        onOpenChange={setDefrostOpen}
        onConfirm={handleDefrostConfirm}
      />
      <DefrostPrintArea
        info={defrostInfo}
        settings={settings}
        printedAt={defrostStamp}
        copies={defrostCopies}
        onDone={handleDefrostDone}
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
            title: editing ? 'Продукт обновлён' : 'Продукт добавлен',
            description: product.name,
          });
        }}
      />
      <AdminLoginDialog
        open={adminOpen}
        onOpenChange={setAdminOpen}
        user={user}
        onLogout={(forget) => {
          logout(forget);
          toast({
            title: 'Вы вышли из аккаунта',
            description: forget ? 'Сохранённый вход на устройстве удалён' : undefined,
          });
        }}
      />
      <StaffOverviewDialog
        open={overviewOpen}
        onOpenChange={setOverviewOpen}
        onOpenStaff={(id) => {
          setTargetId(id);
          scrollTo('menu');
        }}
      />
      <UsersDialog
        open={usersOpen}
        onOpenChange={setUsersOpen}
        currentId={user?.id}
        isSuperAdmin={isSuperAdmin}
        onChanged={refreshManaged}
      />
    </div>
  );
};

export default Index;