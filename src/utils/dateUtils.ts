import { toZonedTime, format } from 'date-fns-tz';
import { startOfISOWeek, startOfMonth, startOfYear, addWeeks, addMonths, addYears } from 'date-fns';

const TIMEZONE = 'America/Los_Angeles';

// Get current zoned date
export const getNow = (): Date => {
  return toZonedTime(new Date(), TIMEZONE);
};

// Weekly: "2026-W01"
export const getWeeklyPeriodKey = (date: Date = getNow()): string => {
  // Use 'I' for ISO week year and 'R' for ISO week number
  return format(date, "RRRR-'W'II", { timeZone: TIMEZONE });
};

// Monthly: "2026-01"
export const getMonthlyPeriodKey = (date: Date = getNow()): string => {
  return format(date, 'yyyy-MM', { timeZone: TIMEZONE });
};

// Yearly: "2026"
export const getYearlyPeriodKey = (date: Date = getNow()): string => {
  return format(date, 'yyyy', { timeZone: TIMEZONE });
};

// Calculate milliseconds until the next period reset
export const getTimeUntilNextReset = (period: 'weekly' | 'monthly' | 'yearly'): number => {
  const now = getNow();
  let nextReset: Date;

  if (period === 'weekly') {
    // Next ISO week starts on Monday
    // We get end of current ISO week and add 1 millisecond (or just rely on start of next)
    // Next ISO week starts on Monday
    // Actually simpler: startOfNextWeek
    nextReset = startOfISOWeek(addWeeks(now, 1));
  } else if (period === 'monthly') {
    nextReset = startOfMonth(addMonths(now, 1));
  } else {
    nextReset = startOfYear(addYears(now, 1));
  }

  // Calculate difference
  // Note: ensure we compare timestamps correctly
  return nextReset.getTime() - now.getTime();
};
