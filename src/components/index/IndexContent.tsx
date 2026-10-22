import IndexMain from '@/components/index/IndexMain';
import TechnicianScreen from '@/components/technician/TechnicianScreen';
import StaffTasksSection from '@/components/staff-tasks/StaffTasksSection';
import { IndexController } from '@/components/index/useIndexController';

const IndexContent = ({ ctl }: { ctl: IndexController }) => {
  const {
    section,
    showTasks,
    staffTasks,
    targetId,
    user,
    pickedTech,
    setTargetId,
    inventoryOnly,
    isAccountant,
    managerPicked,
    activeTarget,
    canInventory,
    isAdmin,
    items,
    categories,
    addCategory,
    renameCategory,
    removeCategory,
    resetCategories,
    handleExport,
    handleImport,
    setSharedOpen,
    handleSelect,
    handleQuickPrint,
    handlePrintBatch,
    setDefrostOpen,
    setEditing,
    setFormOpen,
    removeProduct,
    prefs,
    savePrefs,
    setAdminOpen,
    expiredIds,
    getStatus,
    jobs,
    setJobs,
  } = ctl;

  return section === 'tasks' && showTasks ? (
    <StaffTasksSection
      data={staffTasks.data}
      setData={staffTasks.setData}
      loading={staffTasks.loading}
      now={staffTasks.now}
      onConfirm={staffTasks.confirm}
      viewedId={targetId && targetId !== user?.id ? targetId : null}
    />
  ) : pickedTech ? (
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
      section={section === 'tasks' ? 'labels' : section}
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
  );
};

export default IndexContent;
