/**
 * Add N business days to a date, skipping weekends (Saturday/Sunday).
 */
export function addBusinessDays(date: Date, days: number): Date {
  let count = 0;
  const result = new Date(date);
  while (count < days) {
    result.setDate(result.getDate() + 1);
    // Skip Saturday (6) and Sunday (0)
    if (result.getDay() !== 0 && result.getDay() !== 6) {
      count++;
    }
  }
  return result;
}

/**
 * Format a date as yyyy年MM月dd日 (Japanese format).
 */
export function formatDateJP(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}
