import {Component, effect, inject, input, signal, WritableSignal} from '@angular/core';
import {DataService} from '../../services/data.service';
import { Supplier } from '../../models/supplier.model';
import {EventData} from '../../models/event.model';
import {DateUtilsService} from '../../services/date-utils.service';
import {MatButtonModule} from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import {AddSupplierComponent} from './add-supplier/add-supplier.component';
import {AddEventComponent} from './add-event/add-event.component';
import {ImportDialogComponent} from './import-dialog/import-dialog.component';
import {MatInputModule} from '@angular/material/input';
import {MatFormFieldModule} from '@angular/material/form-field';
import {FormsModule} from '@angular/forms';
import {combineLatest} from 'rxjs';
import Papa from 'papaparse';
import {MatTabsModule} from '@angular/material/tabs';
import {MatBadgeModule} from '@angular/material/badge';
import {AddDistanceComponent} from './add-distance/add-distance.component';
import {DistanceDemand, DistanceSuppliers} from '../../models/distance.model';
import {LoadDataComponent} from './load-data/load-data.component';

@Component({
  selector: 'app-import-data',
  imports: [MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    FormsModule,
    MatTabsModule,
    MatBadgeModule,
  ],
  standalone: true,
  templateUrl: './import-data.component.html',
  styleUrls: ['./import-data.component.scss']
})
export class ImportDataComponent {
  supplierOverflowErrors = input<string[]>([]);
  eventsShiftErrors = input<string[]>([]);
  shiftPenalties = input<number>(0);
  allCalcSum = input<{km: number, min: number}>({km: 0, min: 0});
  unassignedPenalties = input<{amount: number, demand: number}>({amount: 0, demand: 0});
  productionPenalties = input<{over: number, under: number}>({over: 0, under: 0});

  suppliers: WritableSignal<Supplier[]> = signal([]);
  events: WritableSignal<EventData[]> = signal([]);
  distance: WritableSignal<{demand: DistanceDemand[], suppliers: DistanceSuppliers[]}> = signal({demand: [], suppliers: []});
  penaltiesBadge: WritableSignal<number> = signal(0);

  readonly dialog = inject(MatDialog);


  constructor(public dataService: DataService, private dateService: DateUtilsService) {
    effect(() => {
      let badge = 0;
      if (this.shiftPenalties() > 0) badge += 1;
      if (this.unassignedPenalties().amount > 0) badge += 1;
      if (this.productionPenalties().over > 0) badge += 1;
      if (this.productionPenalties().under > 0) badge += 1;
      this.penaltiesBadge.set(badge);
    });
  }

  addSuppliers() {
    const dialogRef = this.dialog.open(AddSupplierComponent, {
      width: '400px',
    });

    dialogRef.afterClosed().subscribe((result: Supplier[]) => {
      if (result) {
        this.suppliers.set(this.dataService.suppliers$.getValue());
        this.suppliers.update((e) => {
          return e.concat(result);
        });
        this.dataService.suppliers$.next(this.suppliers());
      }
    });
  }

  addDemand() {
    const dialogRef = this.dialog.open(AddEventComponent, {
      width: '400px',
    });

    dialogRef.afterClosed().subscribe((result: EventData[]) => {
      if (result) {
        /*this.events.set(this.dataService.events$.getValue());
        this.events.update((e) => {
          return e.concat(result);
        });*/
        this.events.set(result);
        this.dataService.events$.next(this.events());
      }
    });
  }

  addDistance() {
    const dialogRef = this.dialog.open(AddDistanceComponent, {
      width: '400px',
    });

    dialogRef.afterClosed().subscribe((result: {demand: DistanceDemand[], suppliers: DistanceSuppliers[]}) => {
      if (result) {
        /*this.events.set(this.dataService.events$.getValue());
        this.events.update((e) => {
          return e.concat(result);
        });*/
        this.distance.set(result);
        this.dataService.distance$.next(this.distance());
      }
    });
  }

  importData() {
    const dialogRef = this.dialog.open(ImportDialogComponent, {
      width: '400px',
    });

    dialogRef.afterClosed().subscribe((result: {events: EventData[], suppliers: Supplier[]} | null) => {
      if (result) {
        this.events.set(result.events);
        this.suppliers.set(result.suppliers);
        this.dataService.events$.next(this.events());
        this.dataService.suppliers$.next(this.suppliers());
      }
    });
  }

  loadData() {
    const dialogRef = this.dialog.open(LoadDataComponent, {
      width: '400px',
    });
    dialogRef.afterClosed().subscribe((result: {events: EventData[], suppliers: Supplier[], distanceSuppliers: DistanceSuppliers[], distanceDemand: DistanceDemand[]} | null) => {
      if (result) {
        this.events.set(result.events);
        this.suppliers.set(result.suppliers);
        this.distance.set({demand: result.distanceDemand, suppliers: result.distanceSuppliers});
        this.dataService.events$.next(this.events());
        this.dataService.suppliers$.next(this.suppliers());
        this.dataService.distance$.next(this.distance());
      }
    });
  }

  exportData() {
    const events = this.dataService.events$.getValue();
    const suppliers = this.dataService.suppliers$.getValue();
    const data = {events: events, suppliers: suppliers};
    const jsonStr = JSON.stringify(data, null, 2); // pretty print
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const timestamp = new Date().toISOString().replace(/[:T]/g, '-').split('.')[0];
    const filename = `export-data-${timestamp}.json`;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);

    const eventsSorted =  events.sort((a, b) => {
      const dateA = this.dateService.parseWeekString(a.date);
      const dateB = this.dateService.parseWeekString(b.date);
      return dateA.getTime() - dateB.getTime();
    }).filter(e => e.productType === 'F').map(e => {

        return {
          producer_id: e.name,
          'einstallung_wish_date(sus1)': e.date,
          'einstallung_real_date': e.startWeek,
          producer_name: e.name,
          'demand_femal_cap': e.amount,
          'demand_male_cap': e.amount,
          aufzucht_id: e.supplierId,
          aufzucht_name: suppliers.find(s => s.id === e.supplierId)?.name,
          aufzucht_cap: suppliers.find(s => s.id === e.supplierId)?.capacity,
        }

    });

    const csv = Papa.unparse(eventsSorted);

    const blobCsv = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const urlCsv = URL.createObjectURL(blobCsv);
    const aCsv = document.createElement('a');
    aCsv.href = urlCsv;
    aCsv.download = `export-data-${timestamp}.csv`;

    aCsv.click();
    URL.revokeObjectURL(urlCsv);
  }

  /*onSuppliersSelect(event: Event): void {
    const file = (event.target as HTMLInputElement)?.files?.[0];

    if (file) {
      this.suppliers.set([]);
      const reader = new FileReader();
      reader.onload = () => {
        const csv = reader.result as string;
        Papa.parse(csv, {
          header: true,
          skipEmptyLines: true,
          complete: (result: any) => {
            if (result.data?.length) {
              const arr: any[] = [];
              result.data.forEach((item: any) => {
                if (item.hasOwnProperty('id') && item.hasOwnProperty('capacity')) {
                  arr.push({
                    ...item,
                    capacity: +item.capacity,
                    name: item.id,
                  });
                }
              });
              this.suppliers.set(arr)
            }
          },
        });
      };
      reader.readAsText(file);
    }
  }


  onDemandSelect(event: Event): void {
    const file = (event.target as HTMLInputElement)?.files?.[0];

    if (file) {
      this.demand.set([]);
      const reader = new FileReader();
      reader.onload = () => {
        const csv = reader.result as string;
        Papa.parse(csv, {
          header: true,
          skipEmptyLines: true,
          complete: (result: any) => {
            if (result.data?.length) {
              const arr: any[] = [];
              result.data.forEach((item: any) => {
                if (item.hasOwnProperty('amount') && item.hasOwnProperty('date') && item.hasOwnProperty('id') && item.hasOwnProperty('max_shift_weeks_early') && item.hasOwnProperty('max_shift_weeks_late') && item.hasOwnProperty('product_type')) {
                  arr.push({
                    id: `${item.id}_${item.date}`,
                    name: item.id,
                    startWeek: '',
                    endWeek: '',
                    date: item.date,
                    amount: +item.amount,
                    supplierId: '',
                    leftPosition: 0,
                    topPosition: 0,
                    maxShiftWeeksEarly: +item.max_shift_weeks_early,
                    maxShiftWeeksLate: +item.max_shift_weeks_late,
                    productType: item.product_type,
                    stackOffsetPx: 0
                  });
                }
              });
              this.demand.set(arr);
            }
          },
        });
      };
      reader.readAsText(file);
    }
  }

  applyChanges(): void {
    const data =  this.generateDemandAssignments(this.demand(), this.suppliers());
    debugger
    let startViewWeek = '';
    let endViewWeek = '';
    data.forEach((item: EventData) => {
        if (startViewWeek) {
          const a = this.dateService.parseWeekString(startViewWeek);
          const b = this.dateService.parseWeekString(item.startWeek);
          if (b < a) {
            startViewWeek = item.startWeek;
          }
        } else {
          startViewWeek = item.startWeek;
        }

        if (endViewWeek) {
          const a = this.dateService.parseWeekString(endViewWeek);
          const b = this.dateService.parseWeekString(item.endWeek);
          if (b > a) {
            endViewWeek = item.endWeek;
          }
        } else {
          endViewWeek = item.endWeek;
        }
    });
    const weekRange = this.dateService.generateWeekRange(startViewWeek, endViewWeek);

    this.dataService.readyEventData$.next({
      suppliers: this.suppliers(),
      events: data,
      weekRange: weekRange
    });
  }

  generateDemandAssignments(demands: EventData[], suppliers: Supplier[]): EventData[] {
    const assignedDemands: EventData[] = [];
    const supplierUsage: Record<string, Record<string, number>> = {};

    const startWeekMap = new Map<string, string>(); // common startWeek for same demand.id

    for (const demand of demands) {
      const [yearStr, weekStr] = demand.date.split('-W');
      const baseDate = this.getDateFromISOWeek(+weekStr, +yearStr);

      // Determine valid startWeek candidates
      const candidateWeeks: string[] = [];
      for (let shift = -demand.maxShiftWeeksEarly; shift <= demand.maxShiftWeeksLate; shift++) {
        const shiftedDate = addWeeks(baseDate, shift);
        const isoWeek = this.getISOWeekString(shiftedDate);
        candidateWeeks.push(isoWeek);
      }

      // Use consistent startWeek for shared IDs (like M/F types)
      let fixedStartWeek = startWeekMap.get(demand.id);
      let assignedSupplierId: string | undefined;
      let selectedStartWeek: string | undefined;
      let selectedEndWeek: string | undefined;

      // Loop over candidate weeks if start is not fixed
      const tryWeeks = fixedStartWeek ? [fixedStartWeek] : candidateWeeks;

      for (const startWeek of tryWeeks) {
        const startDate = this.getDateFromISOWeekStr(startWeek);
        const duration = demand.productType === 'F' ? 18 : 10;
        const endDate = addWeeks(startDate, duration);
        const endWeek = this.getISOWeekString(endDate);
        const activeWeeks = this.getWeeksBetween(startWeek, endWeek);

        // Try to assign supplier
        for (const supplier of suppliers) {
          let fits = true;

          for (const week of activeWeeks) {
            const used = supplierUsage[supplier.id]?.[week] || 0;
            if (used + demand.amount > supplier.capacity) {
              fits = false;
              break;
            }
          }

          if (fits) {
            // Assign supplier and update usage
            assignedSupplierId = supplier.id;
            for (const week of activeWeeks) {
              if (!supplierUsage[supplier.id]) supplierUsage[supplier.id] = {};
              supplierUsage[supplier.id][week] = (supplierUsage[supplier.id][week] || 0) + demand.amount;
            }
            selectedStartWeek = startWeek;
            selectedEndWeek = endWeek;
            break;
          }
        }

        if (assignedSupplierId) break; // exit candidate loop if assigned
      }

      if (!assignedSupplierId || !selectedStartWeek || !selectedEndWeek) {
        // throw new Error(`No supplier can handle demand ${demand.id} (${demand.productType})`);
        break;
      }

      // Store selected startWeek for this demand.id
      if (!startWeekMap.has(demand.id)) {
        startWeekMap.set(demand.id, selectedStartWeek);
      }

      assignedDemands.push({
        ...demand,
        startWeek: selectedStartWeek,
        endWeek: selectedEndWeek,
        supplierId: assignedSupplierId
      });
    }

    return assignedDemands;
  }

  getWeeksBetween(startWeek: string, endWeek: string): string[] {
    const weeks: string[] = [];
    let current = this.getDateFromISOWeekStr(startWeek);
    const end = this.getDateFromISOWeekStr(endWeek);

    while (current <= end) {
      weeks.push(this.getISOWeekString(current));
      current = addWeeks(current, 1);
    }

    return weeks;
  }


  getDateFromISOWeek(week: number, year: number): Date {
    const date = setWeek(setYear(new Date(), year), week);
    return startOfWeek(date, { weekStartsOn: 1 }); // Monday
  }

  getISOWeekString(date: Date): string {
    const week = getISOWeek(date);
    const year = date.getFullYear();
    return `${year}-W${week.toString().padStart(2, '0')}`;
  }

  getDateFromISOWeekStr(weekStr: string): Date {
    const [year, week] = weekStr.split('-W').map(Number);
    return this.getDateFromISOWeek(week, year);
  }*/


}
