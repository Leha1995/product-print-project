import { useCallback, useEffect, useState } from 'react';
import useCatalog from '@/hooks/useCatalog';
import useManagedUsers from '@/hooks/useManagedUsers';
import { fetchOverview } from '@/lib/catalogApi';
import useCategories from '@/hooks/useCategories';
import useAuth from '@/hooks/useAuth';
import usePrintHistory from '@/hooks/usePrintHistory';
import useLabelSettings from '@/hooks/useLabelSettings';
import { PrintJob } from '@/components/PrintLog';
import { DefrostInfo } from '@/components/DefrostLabel';
import { Product } from '@/data/products';
import { toast } from '@/hooks/use-toast';
import useExpiryAlerts from '@/components/index/useExpiryAlerts';
import useCatalogTransfer from '@/components/index/useCatalogTransfer';
import useStaffTasks from '@/hooks/useStaffTasks';

const useIndexController = () => {
  const [selected, setSelected] = useState<Product | null>(null);
  const [section, setSection] = useState<'labels' | 'equipment' | 'tasks'>('labels');
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [editing, setEditing] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const {
    user,
    ready,
    kicked,
    login,
    logout,
    switchStructure,
    refreshUser,
    isAuthed,
    isAdmin,
    isSuperAdmin,
    canInventory,
    inventoryOnly,
    isAccountant,
  } =
    useAuth();
  const { managed, refreshManaged } = useManagedUsers(isAdmin || isAccountant);
  const isTechnician = user?.role === 'technician';
  const tasksEnabled = isAuthed && !isTechnician && !isAccountant;
  const staffTasks = useStaffTasks(tasksEnabled);
  const showTasks = tasksEnabled && (staffTasks.data.canManage || staffTasks.data.mine.length > 0);
  const [targetId, setTargetId] = useState<number | null>(null);
  const activeTarget = targetId ?? (inventoryOnly ? null : (user?.id ?? null));
  const pickedTech = isSuperAdmin
    ? managed.find((m) => m.id === targetId && m.role === 'technician') || null
    : null;
  const managerPicked = inventoryOnly && !isAccountant && targetId !== null;
  const viewingName = (() => {
    const found = managed.find((m) => m.id === targetId);
    return found ? found.fullName || found.username : '';
  })();
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
  } = useCatalog(
    isTechnician || isAccountant ? null : user?.id,
    isTechnician || isAccountant ? null : pickedTech ? (user?.id ?? null) : activeTarget,
  );
  const {
    categories,
    addCategory,
    renameCategory,
    removeCategory,
    resetCategories,
    replaceCategories,
  } = useCategories(catList, saveCategories);
  const [usersOpen, setUsersOpen] = useState(false);
  const [viewTech, setViewTech] = useState<{ id: number; name: string } | null>(null);
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
  const reloadTasks = staffTasks.reload;
  useEffect(() => {
    if (overviewOpen) reloadTasks();
  }, [overviewOpen, reloadTasks]);
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

  const { expiredIds } = useExpiryAlerts({
    items,
    getExpiry,
    getStatus,
    now,
    alertTune: settings.alertTune,
    expiredTune: settings.expiredTune,
  });

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSelect = (product: Product) => {
    setSelected(product);
    setOpen(true);
  };

  const { handleExport, handleImport } = useCatalogTransfer({
    categories,
    items,
    settings,
    replaceCategories,
    replaceCatalog,
    update,
  });

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

  return {
    selected,
    section,
    setSection,
    open,
    setOpen,
    jobs,
    setJobs,
    editing,
    setEditing,
    formOpen,
    setFormOpen,
    user,
    ready,
    kicked,
    login,
    logout,
    switchStructure,
    refreshUser,
    isAuthed,
    isAdmin,
    isSuperAdmin,
    canInventory,
    inventoryOnly,
    isAccountant,
    managed,
    refreshManaged,
    isTechnician,
    staffTasks,
    showTasks,
    targetId,
    setTargetId,
    activeTarget,
    pickedTech,
    managerPicked,
    viewingName,
    items,
    prefs,
    saveProduct,
    addProducts,
    removeProduct,
    savePrefs,
    categories,
    addCategory,
    renameCategory,
    removeCategory,
    resetCategories,
    usersOpen,
    setUsersOpen,
    viewTech,
    setViewTech,
    overviewOpen,
    setOverviewOpen,
    alertCount,
    markPrinted,
    getStatus,
    adminOpen,
    setAdminOpen,
    settings,
    update,
    reset,
    quickPrint,
    quickStamp,
    batchPrint,
    batchStamp,
    batchLabel,
    batchPick,
    batchOpen,
    setBatchOpen,
    defrostOpen,
    setDefrostOpen,
    sharedOpen,
    setSharedOpen,
    defrostInfo,
    defrostCopies,
    defrostStamp,
    expiredIds,
    scrollTo,
    handleSelect,
    handleExport,
    handleImport,
    handleQuickPrint,
    handleQuickDone,
    handleDefrostConfirm,
    handleDefrostDone,
    handlePrintBatch,
    handleBatchConfirm,
    handleBatchDone,
    handlePrinted,
  };
};

export type IndexController = ReturnType<typeof useIndexController>;

export default useIndexController;
