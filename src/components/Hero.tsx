import { HERO_IMG } from '@/data/products';

interface HeroProps {
  onOpenMenu: () => void;
}

const Hero = ({ onOpenMenu }: HeroProps) => {
  return (
    <section className="stage-fade relative h-[clamp(440px,calc(100vh-104px),760px)] w-full overflow-hidden bg-secondary">
      <img
        src={HERO_IMG}
        alt="Роллы и пицца в полёте"
        className="absolute right-[-2%] top-1/2 aspect-square w-[85%] -translate-y-1/2 object-cover opacity-90 md:w-[62%] md:opacity-100"
      />
      <div className="absolute left-6 top-1/2 z-[2] max-w-[640px] -translate-y-1/2 md:left-14">
        <h1 className="animate-fade-in font-head text-[38px] font-medium uppercase leading-[1.06] tracking-[-0.005em] text-white sm:text-[48px] lg:text-[62px]">
          Жми на продукт —<br />
          чек печатается
        </h1>
        <button
          onClick={onOpenMenu}
          className="mt-8 inline-block animate-fade-in rounded-[3px] bg-accent px-8 py-4 font-head text-base font-medium uppercase tracking-[0.01em] text-accent-foreground transition-transform [animation-delay:120ms] hover:-translate-y-0.5 md:px-11 md:text-xl"
        >
          Открыть меню
        </button>
      </div>
    </section>
  );
};

export default Hero;