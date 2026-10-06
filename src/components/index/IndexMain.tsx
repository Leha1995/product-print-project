import { ComponentProps } from 'react';
import Icon from '@/components/ui/icon';
import MenuSection from '@/components/MenuSection';
import PrintLog, { PrintJob } from '@/components/PrintLog';
import EquipmentSection from '@/components/equipment/EquipmentSection';
import { Product, productCategories } from '@/data/products';
import { toast } from '@/hooks/use-toast';

type MenuProps = ComponentProps<typeof MenuSection>;

interface IndexMainProps {
  inventoryOnly: boolean;
  readOnly?: boolean;
  managerPicked: boolean;
  activeTarget: number | null;
  section: 'labels' | 'equipment';
  canInventory: boolean;
  userId?: number;
  isAdmin: boolean;
  items: Product[];
  categories: MenuProps['categories'];
  addCategory: (label: string, icon: string) => void;
  renameCategory: MenuProps['onRenameCategory'];
  removeCategory: (id: string) => void;
  resetCategories: MenuProps['onResetCategories'];
  onExport: MenuProps['onExport'];
  onImport: MenuProps['onImport'];
  onSharedBase: MenuProps['onSharedBase'];
  onSelect: MenuProps['onSelect'];
  onPrint: MenuProps['onPrint'];
  onPrintBatch: MenuProps['onPrintBatch'];
  onDefrost: MenuProps['onDefrost'];
  onAdd: MenuProps['onAdd'];
  onEdit: MenuProps['onEdit'];
  removeProduct: (id: string) => void;
  prefs: MenuProps['prefs'];
  onPrefsChange: MenuProps['onPrefsChange'];
  onRequestAdmin: MenuProps['onRequestAdmin'];
  expiredIds: MenuProps['expiredIds'];
  getStatus: MenuProps['getStatus'];
  jobs: PrintJob[];
  onClearJobs: () => void;
}

const IndexMain = ({
  inventoryOnly,
  readOnly = false,
  managerPicked,
  activeTarget,
  section,
  canInventory,
  userId,
  isAdmin,
  items,
  categories,
  addCategory,
  renameCategory,
  removeCategory,
  resetCategories,
  onExport,
  onImport,
  onSharedBase,
  onSelect,
  onPrint,
  onPrintBatch,
  onDefrost,
  onAdd,
  onEdit,
  removeProduct,
  prefs,
  onPrefsChange,
  onRequestAdmin,
  expiredIds,
  getStatus,
  jobs,
  onClearJobs,
}: IndexMainProps) => (
  <main>
    {inventoryOnly && !managerPicked && !activeTarget ? (
      <div className="mx-auto flex max-w-[520px] flex-col items-center gap-2 px-4 py-16 text-center">
        <Icon name="Store" size={34} strokeWidth={2} className="text-primary" />
        <p className="font-head text-base font-black uppercase text-primary">
          {readOnly ? 'Выбери точку' : 'Выбери сотрудника'}
        </p>
        <p className="text-[13px] text-muted-foreground">
          {readOnly
            ? 'В строке выше укажи точку — откроется её оборудование и история инвентаризаций.'
            : 'В строке выше укажи точку — откроется её оборудование и маркировка.'}
        </p>
      </div>
    ) : (section === 'equipment' || (inventoryOnly && !managerPicked)) && canInventory ? (
      <EquipmentSection userId={userId} targetId={activeTarget} isAdmin={isAdmin} readOnly={readOnly} />
    ) : (
      <MenuSection
        products={items}
        categories={categories}
        onAddCategory={(label, icon) => {
          addCategory(label, icon);
          toast({ title: 'Категория добавлена', description: label });
        }}
        onRenameCategory={renameCategory}
        onRemoveCategory={(category) => {
          const used = items.filter((p) => productCategories(p).includes(category.id)).length;
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
        onExport={onExport}
        onImport={onImport}
        onSharedBase={onSharedBase}
        onSelect={onSelect}
        onPrint={onPrint}
        onPrintBatch={onPrintBatch}
        onDefrost={onDefrost}
        onAdd={onAdd}
        onEdit={onEdit}
        onDelete={(product) => {
          removeProduct(product.id);
          toast({ title: 'Продукт удалён', description: product.name });
        }}
        isAdmin={isAdmin}
        prefs={prefs}
        onPrefsChange={onPrefsChange}
        onRequestAdmin={onRequestAdmin}
        expiredIds={expiredIds}
        getStatus={getStatus}
      />
    )}
    {(!inventoryOnly || managerPicked) && (section === 'labels' || !canInventory) && (
      <PrintLog jobs={jobs} onClear={onClearJobs} />
    )}
  </main>
);

export default IndexMain;
