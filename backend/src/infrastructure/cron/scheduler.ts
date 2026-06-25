import cron from 'node-cron';
import { env } from '../config/env.js';
import { PeriodKey } from '../../modules/shared/domain/PeriodKey.js';
import { enqueueCycle } from '../queue/queues.js';

/**
 * Agendador embutido (node-cron). Dispara 2x ao dia (08:00 e 18:00 BRT por
 * padrão, configurável). Cada disparo apenas ENFILEIRA um ciclo — o trabalho
 * roda no worker. O periodKey é derivado do horário atual no fuso BRT.
 */
export function startScheduler(): cron.ScheduledTask[] {
  if (!env.CRON_ENABLED) {
    console.log('⏰ Cron desabilitado (CRON_ENABLED=false).');
    return [];
  }

  const options = { timezone: env.TZ };

  const schedule = (expression: string, label: string) =>
    cron.schedule(
      expression,
      async () => {
        const periodKey = PeriodKey.fromDate(new Date(), env.TZ).toString();
        console.log(`⏰ Cron ${label} disparou → enfileirando ciclo ${periodKey}`);
        await enqueueCycle(periodKey, 'scheduled');
      },
      options,
    );

  const tasks = [
    schedule(env.CRON_MORNING, 'manhã'),
    schedule(env.CRON_EVENING, 'tarde'),
  ];

  console.log(
    `⏰ Cron ativo (${env.TZ}): manhã="${env.CRON_MORNING}", tarde="${env.CRON_EVENING}".`,
  );
  return tasks;
}
