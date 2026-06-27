import { palpitesModule } from '../modules/palpites/module';
import { pointsModule } from '../modules/points/module';
import { walletsModule } from '../modules/wallets/module';
import { eventsModule } from '../modules/events/module';
import { quizModule } from '../modules/quiz/module';
import type { BotModule } from './types';

/** Todos os módulos do Palpito */
export const modules: BotModule[] = [
  palpitesModule,
  pointsModule,
  walletsModule,
  eventsModule,
  quizModule,
];

export function allCommands() {
  return modules.flatMap((m) => m.commands);
}
