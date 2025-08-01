export class Week {
  year: number;
  weekNumber: number;
  label: string;
  overflow: boolean;

  constructor(date: string) {
    const match = date.match(/^(\d{4})-W(\d{2})$/);
    if (!match) {
      this.year = 0;
      this.weekNumber = 0;
      this.label = '';
      this.overflow = false;
    } else {
      this.year = parseInt(match[1], 10);
      this.weekNumber = parseInt(match[2], 10);
      this.label = `W${match[2]}`;
      this.overflow = false;
    }


  }
}
