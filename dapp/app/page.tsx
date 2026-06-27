import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { SiteMain } from "@/components/SiteMain";

const PORTALS = [
  {
    id: "palpites",
    href: "/palpites",
    emoji: "⚽",
    tag: "Copa 2026",
    title: "Palpites",
    subtitle: "Bolão da Copa on-chain",
    desc: "Palpite grátis no Discord ou entre no modo CHZ com validação por tx hash. Ranking ao vivo e rodadas pelo site.",
    cta: "Abrir palpites",
    accent: "from-chiliz/25 via-chiliz/5 to-transparent",
    border: "border-chiliz/35 hover:border-chiliz/60",
    glow: "shadow-chiliz/20",
    delay: 1,
  },
  {
    id: "quiz",
    href: "/quiz",
    emoji: "🧠",
    tag: "Admin",
    title: "Quiz",
    subtitle: "Painel de perguntas ao vivo",
    desc: "Área restrita a administradores. Entre com usuário e senha para gerenciar quizzes.",
    cta: "Entrar no quiz",
    accent: "from-purple-600/25 via-violet-900/10 to-transparent",
    border: "border-purple-500/30 hover:border-purple-400/50",
    glow: "shadow-purple-500/15",
    delay: 2,
  },
] as const;

export default function HomePage() {
  return (
    <>
      <PageHeader />
      <SiteMain className="flex min-h-[calc(100vh-4rem)] flex-col justify-center pb-20 pt-10 sm:pt-14">
        <section className="animate-fade-up mb-12 text-center">
          <div className="badge-pill mx-auto mb-5">
            <span className="badge-pill-dot" />
            Palpito · Discord + Web
          </div>

          <h1 className="mx-auto flex max-w-3xl flex-col items-center gap-1 overflow-visible text-center text-4xl font-black leading-[1.15] tracking-tight sm:text-5xl lg:text-6xl">
            <span>Escolha onde você quer</span>
            <span className="glow-text-animated">jogar hoje</span>
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-base text-zinc-400 sm:text-lg">
            Um só lugar para palpitar na Copa ou rodar o quiz no Palpito.
            Conecte a wallet quando precisar — o resto é só clicar.
          </p>
        </section>

        <section className="mx-auto grid w-full max-w-4xl gap-5 sm:gap-6 md:grid-cols-2">
          {PORTALS.map((portal) => (
            <PortalCard key={portal.id} {...portal} />
          ))}
        </section>

        <p className="animate-fade-up animate-fade-up-delay-3 mx-auto mt-10 max-w-lg text-center text-sm text-zinc-500">
          Palpites e quiz rodam no mesmo bot do Discord. Abra pelo site ou use os
          comandos <span className="text-zinc-400">/palpite</span> e{" "}
          <span className="text-zinc-400">/quiz</span> no servidor.
        </p>
      </SiteMain>
    </>
  );
}

function PortalCard({
  href,
  emoji,
  tag,
  title,
  subtitle,
  desc,
  cta,
  accent,
  border,
  glow,
  delay,
}: (typeof PORTALS)[number]) {
  return (
    <Link
      href={href}
      className={`portal-card glass-panel-strong card-hover animate-fade-up animate-fade-up-delay-${delay} group flex flex-col rounded-3xl border bg-gradient-to-br ${accent} ${border} p-6 shadow-lg ${glow} transition sm:p-8`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-4xl transition group-hover:scale-110">{emoji}</span>
        <span className="rounded-full border border-white/10 bg-black/40 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          {tag}
        </span>
      </div>

      <h2 className="mt-5 text-2xl font-black sm:text-3xl">{title}</h2>
      <p className="mt-1 text-sm font-medium text-chiliz-gold">{subtitle}</p>
      <p className="mt-4 flex-1 text-sm leading-relaxed text-zinc-400">{desc}</p>

      <span className="btn-primary mt-6 inline-flex w-full justify-center sm:w-auto">
        {cta} →
      </span>
    </Link>
  );
}
