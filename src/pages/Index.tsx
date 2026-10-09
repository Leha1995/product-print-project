import { useCallback, useEffect, useState } from 'react';
import TerminalHeader from '@/components/TerminalHeader';
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
import IncomingTransfers from '@/components/equipment/IncomingTransfers';
import TelegramConnect from '@/components/TelegramConnect';
import StructureSwitcher from '@/components/StructureSwitcher';
import UsersDialog from '@/components/UsersDialog';
import useAuth from '@/hooks/useAuth';
import usePrintHistory from '@/hooks/usePrintHistory';
import useLabelSettings from '@/hooks/useLabelSettings';
import DirectPrintArea from '@/components/DirectPrintArea';
import BatchPrintArea from '@/components/BatchPrintArea';
import BatchPrintDialog from '@/components/BatchPrintDialog';
import { PrintJob } from '@/components/PrintLog';
import DefrostDialog from '@/components/DefrostDialog';
import SharedCatalogDialog from '@/components/SharedCatalogDialog';
import DefrostPrintArea from '@/components/DefrostPrintArea';
import { DefrostInfo } from '@/components/DefrostLabel';
import Footer from '@/components/Footer';
import { Product } from '@/data/products';
import { toast } from '@/hooks/use-toast';
import IndexMain from '@/components/index/IndexMain';
import useExpiryAlerts from '@/components/index/useExpiryAlerts';
import useCatalogTransfer from '@/components/index/useCatalogTransfer';
import TechnicianScreen from '@/components/technician/TechnicianScreen';
import AccountantExportButton from '@/components/AccountantExportButton';
import AccountantTechsPanel from '@/components/accountant/AccountantTechsPanel';
import AccountantTransfersPanel from '@/components/accountant/AccountantTransfersPanel';

const Index = () => {
  const [selected, setSelected] = useState<Product | null>(null);
  const [section, setSection] = useState<'labels' | 'equipment'>('labels');
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

  if (isTechnician) {
    return (
      <TechnicianScreen
        userName={user?.fullName || user?.username || ''}
        onLogout={() => logout()}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <IncomingTransfers enabled={user?.role === 'manager'} />
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
        section={section}
        onSectionChange={canInventory && (!inventoryOnly || managerPicked) ? setSection : undefined}
        showSections={canInventory && (!inventoryOnly || managerPicked)}
        inventoryOnly={inventoryOnly && !managerPicked}
      />
      <StructureSwitcher
        structures={user?.structures ?? []}
        activeId={user?.activeStructureId ?? null}
        onSwitch={switchStructure}
        alwaysShow={isSuperAdmin}
      />
      {isAccountant && <AccountantExportButton />}
      {isAccountant && <AccountantTechsPanel />}
      {isAccountant && <AccountantTransfersPanel />}
      {user?.role === 'manager' && (
        <div className="px-4 pt-4 md:px-8">
          <TelegramConnect compact hint="Сообщим в Telegram, когда придёт передача оборудования на подтверждение" />
        </div>
      )}
      {(isAdmin || isAccountant) && user && (
        <WorkspaceSwitcher
          managed={managed}
          currentId={user.id}
          targetId={activeTarget ?? user.id}
          onChange={(id) => {
            setTargetId(id);
            if (inventoryOnly) setSection('equipment');
          }}
          label={inventoryOnly ? 'Точка' : 'Каталог сотрудника'}
          minCount={inventoryOnly ? 1 : 2}
          placeholder={isAccountant ? 'Выбери точку' : inventoryOnly ? 'Выбери сотрудника' : undefined}
          allowEmpty={inventoryOnly}
          viewingName={viewingName}
        />
      )}
      {pickedTech ? (
        <TechnicianScreen
          key={pickedTech.id}
          inline
          userName={pickedTech.fullName || pickedTech.username}
          viewTechId={pickedTech.id}
          onLogout={() => setTargetId(null)}
        />
      ) : (
      <IndexMain
        inventoryOnly={inventoryOnly}
        readOnly={isAccountant}
        canTransfer={user?.role === 'manager'}
        managerPicked={managerPicked}
        activeTarget={activeTarget}
        section={section}
        canInventory={canInventory}
        userId={user?.id}
        isAdmin={isAdmin}
        items={items}
        categories={categories}
        addCategory={addCategory}
        renameCategory={renameCategory}
        removeCategory={removeCategory}
        resetCategories={resetCategories}
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
        removeProduct={removeProduct}
        prefs={prefs}
        onPrefsChange={savePrefs}
        onRequestAdmin={() => setAdminOpen(true)}
        expiredIds={expiredIds}
        getStatus={getStatus}
        jobs={jobs}
        onClearJobs={() => setJobs([])}
      />
      )}
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
        managed={managed}
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
        readOnly={user?.role === 'manager'}
        onChanged={refreshManaged}
        structures={user?.structures ?? []}
        activeStructureId={user?.activeStructureId ?? null}
        onStructuresChanged={refreshUser}
        onViewTechnician={(id, name) => {
          setUsersOpen(false);
          setViewTech({ id, name });
        }}
      />
      {viewTech && isSuperAdmin && (
        <TechnicianScreen
          key={viewTech.id}
          userName={viewTech.name}
          viewTechId={viewTech.id}
          onLogout={() => setViewTech(null)}
        />
      )}
    </div>
  );
};

export default Index;