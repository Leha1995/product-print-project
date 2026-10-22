import TerminalHeader from '@/components/TerminalHeader';
import WorkspaceSwitcher from '@/components/WorkspaceSwitcher';
import IncomingTransfers from '@/components/equipment/IncomingTransfers';
import TelegramConnect from '@/components/TelegramConnect';
import MaxConnect from '@/components/MaxConnect';
import StructureSwitcher from '@/components/StructureSwitcher';
import AccountantExportButton from '@/components/AccountantExportButton';
import AccountantTechsPanel from '@/components/accountant/AccountantTechsPanel';
import AccountantTransfersPanel from '@/components/accountant/AccountantTransfersPanel';
import { isTaskOverdue } from '@/lib/staffTasksApi';
import { IndexController } from '@/components/index/useIndexController';

const IndexTopBar = ({ ctl }: { ctl: IndexController }) => {
  const {
    user,
    jobs,
    scrollTo,
    isAdmin,
    isSuperAdmin,
    setUsersOpen,
    setOverviewOpen,
    alertCount,
    staffTasks,
    setAdminOpen,
    section,
    setSection,
    canInventory,
    inventoryOnly,
    managerPicked,
    showTasks,
    switchStructure,
    isAccountant,
    managed,
    activeTarget,
    setTargetId,
    viewingName,
  } = ctl;

  return (
    <>
      <IncomingTransfers enabled={user?.role === 'manager'} />
      <TerminalHeader
        printedCount={jobs.length}
        onNavigate={scrollTo}
        isAdmin={isAdmin}
        isSuperAdmin={isSuperAdmin}
        userName={user?.fullName || user?.username || ''}
        onUsersClick={() => setUsersOpen(true)}
        onOverviewClick={() => setOverviewOpen(true)}
        alertCount={alertCount + staffTasks.data.manage.filter((t) => isTaskOverdue(t, staffTasks.now)).length}
        onAdminClick={() => setAdminOpen(true)}
        accessUntil={user?.accessUntil ?? null}
        section={section}
        onSectionChange={setSection}
        showSections={canInventory && (!inventoryOnly || managerPicked)}
        inventoryOnly={inventoryOnly && !managerPicked}
        showTasks={showTasks}
        tasksDue={staffTasks.due.length}
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
        <div className="grid gap-2 px-4 pt-4 md:px-8">
          <MaxConnect compact hint="Сообщим в MAX, когда придёт передача оборудования на подтверждение" />
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
            if (inventoryOnly && section !== 'tasks') setSection('equipment');
          }}
          label={inventoryOnly ? 'Точка' : 'Каталог сотрудника'}
          minCount={inventoryOnly ? 1 : 2}
          placeholder={isAccountant ? 'Выбери точку' : inventoryOnly ? 'Выбери сотрудника' : undefined}
          allowEmpty={inventoryOnly}
          viewingName={viewingName}
        />
      )}
    </>
  );
};

export default IndexTopBar;
