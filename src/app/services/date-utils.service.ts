import { Injectable } from '@angular/core';
import { getISOWeek, getWeekYear, startOfWeek, endOfWeek, addWeeks, parseISO, format, setISOWeek, getISOWeeksInYear } from 'date-fns';
import { Week } from '../models/week.model';

@Injectable({
  providedIn: 'root' // This makes the service a singleton and tree-shakable
})
export class DateUtilsService {

  constructor() { }

  getWeekString(date: Date): string {
    const year = getWeekYear(date);
    const week = getISOWeek(date);
    return `${year}-W${String(week)}`;
  }

  parseWeekString(weekString: string): Date {
    const [yearStr, weekNumStr] = weekString.split('-W');
    const year = parseInt(yearStr, 10);
    const weekNumber = parseInt(weekNumStr, 10);

    const jan4th = new Date(year, 0, 4);
    return setISOWeek(jan4th, weekNumber);
  }

  getWeekRangeCount2(startWeekString: string, endWeekString: string): number {
    let [sy, sw] = startWeekString.split('-W').map(Number);
    let [ey, ew] = endWeekString.split('-W').map(Number);

    if (sy > ey || (sy === ey && sw > ew)) {
      [sy, ey] = [ey, sy];
      [sw, ew] = [ew, sw];
    }

    const maxWeeks = (y: number) => getISOWeeksInYear(new Date(y, 0, 4));

    ew = Math.min(ew, maxWeeks(ey));
    sw = Math.max(1, sw);

    if (sy === ey) return ew - sw + 1;

    let count = maxWeeks(sy) - sw + 1;
    for (let y = sy + 1; y < ey; y++) {
      count += maxWeeks(y);
    }
    count += ew;

    return count;
  }

  getWeekRangeCount(startWeekString: string, endWeekString: string): number {
    const startDate = this.parseWeekString(startWeekString);
    const endDate = this.parseWeekString(endWeekString);

    let count = 0;
    let currentDate = startDate;
    while (currentDate <= endDate) {
      count++;
      currentDate = addWeeks(currentDate, 1);
    }
    return count;
  }

  generateWeekRange(startWeek: string, endWeek: string): Week[] {
    const weeks: Week[] = [];
    if (!startWeek || !endWeek) return weeks;

    let [startY, startW] = startWeek.split('-W').map(Number);
    let [endY, endW] = endWeek.split('-W').map(Number);

    if (startY > endY || (startY === endY && startW > endW)) {
      [startY, endY] = [endY, startY];
      [startW, endW] = [endW, startW];
    }

    let y = startY;
    let w = startW;

    while (y < endY || (y === endY && w <= endW)) {
      const maxWeeks = getISOWeeksInYear(new Date(y, 0, 4));
      const lastWeekThisYear = (y < endY) ? maxWeeks : Math.min(endW, maxWeeks);

      for (let i = w; i <= lastWeekThisYear; i++) {
        weeks.push({
          year: y,
          weekNumber: i,
          label: `W${i}`,
          overflow: false,
        });
      }

      y += 1;
      w = 1;
    }

    return weeks;
  }

  // A utility method to add weeks to a date, used in drag-and-drop
  addWeeks(date: Date, numWeeks: number): Date {
    return addWeeks(date, numWeeks);
  }

  fixIsoWeek(
    input: string,
    opts?: { padWeek?: boolean }
  ): string | null {
    if (typeof input !== 'string') return null;

    const m = /^\s*(\d{4})\s*[-_ ]?\s*[Ww]\s*(\d{1,2})\s*$/.exec(input);
    if (!m) return null;

    const year = Number(m[1]);
    const week = Number(m[2]);

    if (week < 1 || week > 53) return null;

    const weekStr = opts?.padWeek
      ? String(week).padStart(2, '0')
      : String(week);

    return `${year}-W${weekStr}`;
  }
}
