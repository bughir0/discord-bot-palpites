"use client";

import dynamic from "next/dynamic";
import { PageHeader } from "@/components/PageHeader";
import "./quiz.css";

const QuizPanel = dynamic(
  () =>
    import("@/components/quiz/QuizPanel").then((mod) => mod.QuizPanel),
  {
    ssr: false,
    loading: () => (
      <div className="mx-auto max-w-6xl px-4 py-16 text-center text-zinc-400">
        Carregando painel do quiz…
      </div>
    ),
  },
);

export default function QuizPage() {
  return (
    <>
      <PageHeader />
      <QuizPanel />
    </>
  );
}
