import { Injectable } from '@angular/core';
import { getISOWeek, getWeekYear, startOfWeek, endOfWeek, addWeeks, parseISO, format, setISOWeek } from 'date-fns';
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
    /*let currentDate = this.parseWeekString(startWeek);
    const endDate = this.parseWeekString(endWeek);

    debugger

    while (currentDate <= endDate) {
      weeks.push({
        year: getWeekYear(currentDate),
        weekNumber: getISOWeek(currentDate),
        label: `W${String(getISOWeek(currentDate))}`
      });
      currentDate = addWeeks(currentDate, 1);
    }*/
    let [currentYear, currentWeek] = startWeek.split('-W').map(Number);
    const [endYear, endWeekNumber] = endWeek.split('-W').map(Number);

    while (currentYear <= endYear) {
      for (let i = currentWeek; i <= ((currentYear < endYear) ? 52 : endWeekNumber); i++) {
        weeks.push({
          year: currentYear,
          weekNumber: i,
          label: `W${i}`,
          overflow: false,
        });
      }
      currentYear = currentYear + 1;
      currentWeek = 1;
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
