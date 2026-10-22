import PrintDialog from '@/components/PrintDialog';
import ProductFormDialog from '@/components/ProductFormDialog';
import StaffOverviewDialog from '@/components/StaffOverviewDialog';
import AdminLoginDialog from '@/components/AdminLoginDialog';
import UsersDialog from '@/components/UsersDialog';
import DirectPrintArea from '@/components/DirectPrintArea';
import BatchPrintArea from '@/components/BatchPrintArea';
import BatchPrintDialog from '@/components/BatchPrintDialog';
import DefrostDialog from '@/components/DefrostDialog';
import SharedCatalogDialog from '@/components/SharedCatalogDialog';
import DefrostPrintArea from '@/components/DefrostPrintArea';
import { toast } from '@/hooks/use-toast';
import TechnicianScreen from '@/components/technician/TechnicianScreen';
import { IndexController } from '@/components/index/useIndexController';

const IndexDialogs = ({ ctl }: { ctl: IndexController }) => {
  const {
    selected,
    open,
    setOpen,
    markPrinted,
    handlePrinted,
    settings,
    update,
    reset,
    isAdmin,
    quickPrint,
    quickStamp,
    handleQuickDone,
    sharedOpen,
    setSharedOpen,
    items,
    addProducts,
    defrostOpen,
    setDefrostOpen,
    handleDefrostConfirm,
    defrostInfo,
    defrostStamp,
    defrostCopies,
    handleDefrostDone,
    batchPick,
    batchLabel,
    batchOpen,
    setBatchOpen,
    handleBatchConfirm,
    batchPrint,
    batchStamp,
    handleBatchDone,
    editing,
    categories,
    formOpen,
    setFormOpen,
    saveProduct,
    adminOpen,
    setAdminOpen,
    user,
    logout,
    overviewOpen,
    setOverviewOpen,
    managed,
    staffTasks,
    setTargetId,
    scrollTo,
    usersOpen,
    setUsersOpen,
    isSuperAdmin,
    refreshManaged,
    refreshUser,
    setViewTech,
    viewTech,
  } = ctl;

  return (
    <>
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
        tasks={staffTasks.data.manage}
        now={staffTasks.now}
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
    </>
  );
};

export default IndexDialogs;
