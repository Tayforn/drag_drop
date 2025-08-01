export class EventData {
  id!: string;
  name!: string;
  startWeek!: string;
  endWeek: string;
  date!: string;
  amount!: number;
  supplierId!: string;
  leftPosition: number;
  topPosition: number;
  maxShiftWeeksEarly: number;
  maxShiftWeeksLate: number;
  productType: 'F' | 'M';
  stackOffsetPx?: number;
  distance?: { distance_km: number, distance_minute: number } | null;
  order: number;

  constructor(event: EventData) {
    this.id = event.id;
    this.name = event.name;
    this.startWeek = event.startWeek || event.date;
    this.endWeek = event.endWeek;
    this.date = event.date;
    this.amount = event.amount;
    this.supplierId = event.supplierId;
    this.leftPosition = event.leftPosition || 0;
    this.topPosition = event.topPosition || 0;
    this.maxShiftWeeksEarly = event.maxShiftWeeksEarly || 0;
    this.maxShiftWeeksLate = event.maxShiftWeeksLate || 0;
    this.productType = event.productType || 'F';
    this.stackOffsetPx = event.stackOffsetPx || 0;
    this.distance = null;
    this.order = 0;
  }
}
