import { useState } from 'react';
import AnnounceStrip from '@/components/AnnounceStrip';
import TerminalHeader from '@/components/TerminalHeader';
import Hero from '@/components/Hero';
import MenuSection from '@/components/MenuSection';
import PrintDialog from '@/components/PrintDialog';
import PrintLog, { PrintJob } from '@/components/PrintLog';
import PointsSection from '@/components/PointsSection';
import Footer from '@/components/Footer';
import { Product } from '@/data/products';
import { toast } from '@/hooks/use-toast';

const Index = () => {
  const [selected, setSelected] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<PrintJob[]>([]);

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
        <MenuSection onSelect={handleSelect} />
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
    </div>
  );
};

export default Index;
