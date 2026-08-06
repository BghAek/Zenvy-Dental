import { DemoCta } from "./demo-cta";

export function DemoHero() {
  return (
    <section className="w-full flex flex-col items-center justify-center pt-24 pb-16 px-8 text-center space-y-8">
      <div className="space-y-4 max-w-3xl">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-primary text-balance">
          Découvrez ZenvyDental en action
        </h1>
        <p className="text-xl text-muted-foreground text-balance mx-auto">
          Regardez comment notre assistant WhatsApp et notre tableau de bord transforment le quotidien des cabinets dentaires, sans changer de logiciel métier.
        </p>
      </div>
      <div className="pt-4">
        <DemoCta />
      </div>
    </section>
  );
}
