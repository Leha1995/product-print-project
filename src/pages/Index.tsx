import { useState } from 'react';
import AnnounceStrip from '@/components/AnnounceStrip';
import TerminalHeader from '@/components/TerminalHeader';
import Hero from '@/components/Hero';
import MenuSection from '@/components/MenuSection';
import PrintDialog from '@/components/PrintDialog';
import ProductFormDialog from '@/components/ProductFormDialog';
import useCatalog from '@/hooks/useCatalog';
import AdminLoginDialog from '@/components/AdminLoginDialog';
import useAdmin from '@/hooks/useAdmin';
import useLabelSettings from '@/hooks/useLabelSettings';
import DirectPrintArea from '@/components/DirectPrintArea';
import PrintLog, { PrintJob } from '@/components/PrintLog';
import PointsSection from '@/components/PointsSection';
import Footer from '@/components/Footer';
import { Product } from '@/data/products';
import { toast } from '@/hooks/use-toast';

const Index = () => {
  const [selected, setSelected] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [editing, setEditing] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const { items, saveProduct, removeProduct, resetCatalog } = useCatalog();
  const { isAdmin, login, logout, changePin, isDefaultPin } = useAdmin();
  const [adminOpen, setAdminOpen] = useState(false);
  const { settings, update, reset } = useLabelSettings();
  const [quickPrint, setQuickPrint] = useState<Product | null>(null);
  const [quickStamp, setQuickStamp] = useState(() => new Date());

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSelect = (product: Product) => {
    if (isAdmin) {
      setSelected(product);
      setOpen(true);
      return;
    }
    const now = new Date();
    setQuickStamp(now);
    setQuickPrint(product);
    window.setTimeout(() => {
      window.print();
      handlePrinted(product, 1);
      setQuickPrint(null);
    }, 120);
  };

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
      title: 'Ценник отправлен на принтер',
      description: `${product.name} · ${copies} шт.`,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <AnnounceStrip />
      <TerminalHeader
        printedCount={jobs.length}
        onNavigate={scrollTo}
        isAdmin={isAdmin}
        onAdminClick={() => setAdminOpen(true)}
      />
      <main>
        <Hero onOpenMenu={() => scrollTo('menu')} />
        <MenuSection
          products={items}
          onSelect={handleSelect}
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
        <PointsSection />
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
      />
      <DirectPrintArea product={quickPrint} settings={settings} printedAt={quickStamp} />
      <ProductFormDialog
        product={editing}
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
        isDefaultPin={isDefaultPin}
        onLogin={(pin) => {
          const ok = login(pin);
          if (ok) toast({ title: 'Вход выполнен', description: 'Редактирование каталога доступно' });
          return ok;
        }}
        onChangePin={changePin}
        onLogout={() => {
          logout();
          toast({ title: 'Вы вышли из режима администратора' });
        }}
      />
    </div>
  );
};

export default Index;