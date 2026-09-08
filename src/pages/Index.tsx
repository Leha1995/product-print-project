import { useState } from 'react';
import AnnounceStrip from '@/components/AnnounceStrip';
import TerminalHeader from '@/components/TerminalHeader';
import Hero from '@/components/Hero';
import MenuSection from '@/components/MenuSection';
import PrintDialog from '@/components/PrintDialog';
import ProductFormDialog from '@/components/ProductFormDialog';
import useCatalog from '@/hooks/useCatalog';
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

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSelect = (product: Product) => {
    setSelected(product);
    setOpen(true);
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
      <TerminalHeader printedCount={jobs.length} onNavigate={scrollTo} />
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
      />
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
    </div>
  );
};

export default Index;