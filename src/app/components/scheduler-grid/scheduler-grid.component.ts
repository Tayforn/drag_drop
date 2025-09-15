import {
  Component,
  OnInit,
  ElementRef,
  ViewChild,
  AfterViewInit,
  ChangeDetectorRef,
  ChangeDetectionStrategy, signal, WritableSignal, HostListener, ViewChildren, viewChild, viewChildren, inject, runInInjectionContext,
  computed,
  Signal,
  effect
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { DragDropModule, CdkDragEnd, CdkDragStart, CdkDragMove } from '@angular/cdk/drag-drop';
import { EventBlockComponent } from '../event-block/event-block.component';
import { DateUtilsService } from '../../services/date-utils.service';
import { EventData } from '../../models/event.model';
import { Supplier } from '../../models/supplier.model';
import { Week } from '../../models/week.model';
import { ImportDataComponent } from '../import-data/import-data.component';
import { DataService } from '../../services/data.service';
import { combineLatest, filter, fromEvent, throttleTime } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { addWeeks, getISOWeek, setWeek, setYear, startOfWeek, subWeeks } from 'date-fns';
import { DistanceDemand, DistanceSuppliers } from '../../models/distance.model';
import { MatSnackBar } from '@angular/material/snack-bar';
import { HttpService } from '../../services/http.service';
import { ActivatedRoute } from '@angular/router';
import { MatProgressSpinner } from '@angular/material/progress-spinner';

// Interface for event bounding boxes (useful for overlap calculations)
interface EventRect {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

type DropPreview = {
  show: boolean;
  colLeft: number;
  rowTop: number;
  rowHeight: number;
  ghostLeft: number;
  ghostWidth: number;
  valid: boolean;
};

@Component({
  selector: 'app-scheduler-grid',
  standalone: true,
  imports: [
    CommonModule,
    DragDropModule,
    EventBlockComponent,
    ImportDataComponent,
    MatProgressSpinner,
    MatButtonModule
  ],
  templateUrl: './scheduler-grid.component.html',
  styleUrls: ['./scheduler-grid.component.scss']
})
export class SchedulerGridComponent implements OnInit, AfterViewInit {
  @ViewChild('gridContainer') gridContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('scrollContainer') scrollContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('supplierContainer') supplierContainer!: ElementRef<HTMLDivElement>;

  WEEK_COLUMN_WIDTH_PX = 30;
  AMOUNT_ROW_HEIGHT_UNIT_PX = 0.02;
  SUPPLIER_COLUMN_WIDTH_PX = 130;

  weeks: Week[] = [];
  suppliers: Supplier[] = [];
  distance: { demand: DistanceDemand[], suppliers: DistanceSuppliers[] } = { demand: [], suppliers: [] };
  events: WritableSignal<EventData[]> = signal([]);
  years: { year: number; count: number }[] = [];

  maleEvents: Signal<EventData[]> = signal([]);

  // Placeholder properties
  showPlaceholder: boolean = false;
  placeholderLeftPx: number = 0;
  placeholderTopPx: number = 0;
  placeholderWidthPx: number = 0;
  placeholderHeightPx: number = 0;

  // Store the event being dragged for placeholder calculations
  private draggingEvent: EventData | null = null;

  // Define a small vertical offset for stacking
  private STACK_VERTICAL_OFFSET_PX = 0; // 0 pixels between stacked events

  selfUpdate = false;

  supplierOverflowErrors: string[] = [];
  eventsShiftErrors: string[] = [];
  shiftPenalties: WritableSignal<number> = signal(0);
  unassignedPenalties: WritableSignal<{ amount: number, demand: number }> = signal({ amount: 0, demand: 0 });
  productionPenalties: WritableSignal<{ over: number, under: number }> = signal({ over: 0, under: 0 });
  allCalcSum: WritableSignal<{ km: number, min: number }> = signal({ km: 0, min: 0 });

  draggedWeek: WritableSignal<null | string> = signal(null);

  drop = signal<DropPreview>({
    show: false,
    colLeft: 0,
    rowTop: 0,
    rowHeight: 0,
    ghostLeft: 0,
    ghostWidth: 0,
    valid: true,
  });

  setId?: number;
  loading = false;

  private _snackBar = inject(MatSnackBar);

  constructor(private dateUtils: DateUtilsService, private cdr: ChangeDetectorRef, private api: HttpService, private dataService: DataService, private route: ActivatedRoute) { }

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      this.setId = +params.get('id')!;
      if (this.setId)
        this.loadData()
    });

    combineLatest([
      this.dataService.suppliers$,
      this.dataService.events$
    ]).pipe(filter(() => !this.selfUpdate))
      .subscribe(
        ([suppliers, events]) => {
          this.suppliers = suppliers;
          if ((suppliers.length > 0) && (events.length > 0)) {
            this.generateWeekRange(events);

            const breederMappingMaleEvents = events.filter(e => e.productType === 'M');
            const femaleEvents = events.filter(e => e.productType === 'F');

            const newGroupedEvents = this.generateEventsWithMaleGroups(femaleEvents);

            const updatedAfterMale = this.bulkApplyMalePlacements(newGroupedEvents, breederMappingMaleEvents, this.suppliers);
            this.events.set([...femaleEvents, ...updatedAfterMale]);

            this.checkForUnassignedEvents();
            // this.updateEventsWithMaleGroups();
            this.calculateAllEventPositions();
          }
          this.cdr.detectChanges();
        });
    this.dataService.distance$.subscribe((distance) => {
      this.distance = distance;
      if (distance.demand.length && distance.suppliers.length) {
        this.calcDistance();
      }
    });
  }

  ngAfterViewInit(): void {
    this.onScrollContainer();
    this.onScrollSuppliers();
    this.cdr.detectChanges();
  }

  loadData() {
    if (this.setId) {
      this.loading = true;
      combineLatest([
        this.api.getSchedules(this.setId),
        this.api.getBreeders(this.setId),
        this.api.getProducers(this.setId),
        this.api.getBreederProducers(this.setId),
        this.api.getProducerProducers(this.setId),
        this.api.getProducerBreeder(this.setId)
      ]).subscribe(
        ([schedules, breeders, producers, breederProducers, producerProducers, producerBreeder]) => {
          const suppliers: Supplier[] = [];
          if (breeders.success) {
            breeders.data.forEach((breeder) => {
              suppliers.push({
                id: breeder.external_id,
                name: breeder.name,
                capacity: breeder.capacity,
              });
            })
          }

          const events: EventData[] = [];
          if (producers.success && schedules.success) {
            producers.data.forEach((producer) => {
              const schedule = schedules.data.find(s => s.producer === producer.external_id)
              const fromSchedule = schedule?.week_in ? true : false;
              const weekIn = schedule?.week_in ? schedule?.week_in : producer.week_in;
              const event: any = {
                id: `${producer.external_id}_${producer.week_in}`,
                name: producer.name,
                date: this.processWeeks(weekIn, fromSchedule),
                amount: producer.capacity,
                supplierId: 'unassigned'
              }
              event.date = this.dateUtils.fixIsoWeek(event.date);
              const eventFemale = new EventData(event);
              const eventMale = Object.assign({}, eventFemale);
              eventFemale.endWeek = this.getISOWeekString(addWeeks(this.getDateFromISOWeekStr(eventFemale.startWeek), 18 - 1));
              eventMale.endWeek = this.getISOWeekString(addWeeks(this.getDateFromISOWeekStr(eventMale.startWeek), 10));
              eventMale.productType = 'M';
              events.push(eventFemale, eventMale);
            });
          }

          const distanceDemand: DistanceDemand[] = [];
          if (producerProducers.success) {
            producerProducers.data.forEach((producerProducer) => {
              distanceDemand.push({
                distance_km: producerProducer.distance_km,
                distance_minute: producerProducer.distance_min,
                producer_id_too: producerProducer.producer_to,
                producer_id_from: producerProducer.producer_from,
              });
            })
          }

          const distanceSuppliers: DistanceSuppliers[] = [];
          if (breederProducers.success) {
            breederProducers.data.forEach((breederProducer) => {
              distanceSuppliers.push({
                distance_km: breederProducer.distance_km,
                distance_minute: breederProducer.distance_min,
                breeder_id: breederProducer.breeder,
                producer_id: breederProducer.producer,
              });
            })
          }

          const producerBreederEvents: EventData[] = [];
          if (producerBreeder && producerBreeder.length) {
            producerBreeder.forEach((producerBreeder: any) => {
              const producerBreederDate = this.dateUtils.fixIsoWeek(producerBreeder.date);
              const startWeekString = producerBreederDate ? producerBreederDate : producerBreeder.date;
              const endWeekDate =
                this.dateUtils.addWeeks(
                  this.dateUtils.parseWeekString(startWeekString),
                  producerBreeder.producer_id ? 10 - 1 : 18 - 1
                );
              const endWeekString = this.dateUtils.getWeekString(endWeekDate);

              const event: any = {
                id: `${producerBreeder.producer_id ? `${producerBreeder.producer_id}_${producerBreeder.date}` : producerBreeder.id}`,
                name: `${producerBreeder.producer_id ? producerBreeder.producer_id : producerBreeder.id}`,
                date: producerBreederDate,
                amount: producerBreeder.amount,
                productType: producerBreeder.producer_id ? 'F' : 'M',
                supplierId: producerBreeder.breeder_id ? `${producerBreeder.breeder_id}` : 'unassigned',
                startWeek: startWeekString,
                endWeek: endWeekString
              }
              const eventData = new EventData(event);
              eventData.endWeek = this.getISOWeekString(addWeeks(this.getDateFromISOWeekStr(eventData.startWeek), 18 - 1));

              producerBreederEvents.push(eventData);
            });
          }
          // this.onCloseDialog({ suppliers, events, distanceSuppliers, distanceDemand, producerBreederEvents })

          if (producerBreeder) {
            const evs = this.processLoadedEvents(events, producerBreederEvents);
            this.events.set(evs);
          } else {
            this.events.set(events);
          }

          this.dataService.events$.next(this.events());
          this.dataService.suppliers$.next(suppliers);
          this.dataService.distance$.next({ demand: distanceDemand, suppliers: distanceSuppliers });

          this.loading = false;
        }, error => {
          this.loading = false;
          console.log(`Load data error`, error);
          // this._snackBar.open(error, undefined, { duration: 3000 });
        });
    }
  }

  processWeeks(dateString: string, fromSchedule: boolean) {
    if (!fromSchedule)
      return dateString;

    return this.getISOWeekString(addWeeks(this.getDateFromISOWeekStr(dateString), -18))
  }

  private updateEventsWithMaleGroups(eventData?: EventData, newStartWeek?: string) {
    const events = this.events() as EventData[];

    // 1) Розділяємо події
    const sourceEvents = events.filter(ev => ev.productType === 'F'); // лише F
    const groupedEvents = events.filter(ev => ev.productType === 'M'); // всі M (і assigned, і unassigned)

    // 2) Перегенерація всіх M-груп під час первинного лоаду
    if (!eventData) {
      // генеруємо M-групи ТІЛЬКИ з F-івентів
      const newGroupedEvents = this.generateEventsWithMaleGroups(sourceEvents);

      // зберігаємо вже розміщені (assigned) M-блоки як є
      const loadedMaleEvents = events
        .filter(ev => ev.productType === 'M' && ev.supplierId !== 'unassigned')
        .map(e => {
          const endWeekDate = this.dateUtils.addWeeks(this.dateUtils.parseWeekString(e.startWeek), 9);
          return { ...e, endWeek: this.dateUtils.getWeekString(endWeekDate) };
        });

      this.events.set([...sourceEvents, ...newGroupedEvents, ...loadedMaleEvents]);
      return;
    }

    // 3) Локальна перегенерація для переміщення F-блока
    const affectedStartWeek = eventData.startWeek;
    const affectedNewStartWeek = newStartWeek || eventData.startWeek;

    // Беремо тільки F-блоки, які торкаються цих тижнів
    const relatedSourceEvents = sourceEvents.filter(ev =>
      ev.startWeek === affectedStartWeek || ev.startWeek === affectedNewStartWeek
    );
    if (relatedSourceEvents.length === 0) return;

    // Створюємо нові unassigned M-групи для цих тижнів
    // const updatedGroupEvents = this.generateEventsWithMaleGroups(relatedSourceEvents);

    // Вилучаємо ЛИШЕ unassigned M для цих тижнів, але залишаємо assigned M (щоб не зникали)
    // const filteredGroupedEvents = groupedEvents.filter(
    //   g => g.supplierId !== 'unassigned' || (g.startWeek !== affectedStartWeek && g.startWeek !== affectedNewStartWeek)
    // );

    // Складаємо новий масив подій:
    // - всі F як є
    // - усі M, крім старих unassigned на цих тижнях
    // - нові unassigned M-групи для цих тижнів
    const newEvents = [
      ...sourceEvents,
      ...groupedEvents,
      // ...filteredGroupedEvents,
      // ...updatedGroupEvents,
    ];

    this.events.set(newEvents);
  }

  processLoadedEvents(events: EventData[], producerBreederEvents: EventData[]) {
    const map = new Map<string, EventData>();
    events.forEach(event => map.set(`${event.name}${event.productType}`, event));
    producerBreederEvents.forEach(event => map.set(`${event.name}${event.productType}`, event));

    return Array.from(map.values());
  }

  generateEventsWithMaleGroups(sourceEvents: EventData[]) {
    const groups = new Map<string, EventData[]>();
    for (const ev of sourceEvents) {
      if (!groups.has(ev.startWeek)) {
        groups.set(ev.startWeek, []);
      }
      groups.get(ev.startWeek)!.push(ev);
    }

    const durationWeeks = 10;

    const newGroupedEvents: EventData[] = Array.from(groups.values()).map(group => {
      const newEndWeekDate = this.dateUtils.addWeeks(this.dateUtils.parseWeekString(group[0].startWeek), durationWeeks - 1);
      const newEndWeekString = this.dateUtils.getWeekString(newEndWeekDate);

      const totalAmount = group.reduce((sum, item) => sum + (item.amount || 0), 0);
      return {
        ...group[0],
        amount: totalAmount,
        supplierId: 'unassigned',
        productType: 'M',
        endWeek: newEndWeekString,
        id: `${group[0].startWeek}-${Date.now()}`,
      };
    });

    return newGroupedEvents;
  }

  checkForUnassignedEvents() {
    const unassigned = this.events().filter(event => event.supplierId === 'unassigned');
    if (unassigned?.length > 0) {
      // check if suppliers has such supplier
      if (this.suppliers.length === 0 || this.suppliers[0].id !== 'unassigned') {
        this.suppliers.unshift({
          id: 'unassigned',
          name: 'Unassigned',
          capacity: 0,
          calculatedCapacity: 0,
        });
      }
      unassigned.forEach(event => {
        if (event.amount > this.suppliers[0].capacity) {
          this.suppliers[0].capacity = event.amount;
          this.suppliers[0].calculatedCapacity = event.amount;
        }
      })
    }
  }

  generateWeekRange(events: EventData[]) {
    let startViewWeek = '';
    let endViewWeek = '';
    events.forEach((item: EventData) => {
      if (startViewWeek) {
        const a = this.dateUtils.parseWeekString(startViewWeek);
        const b = this.dateUtils.parseWeekString(item.startWeek);
        if (b < a) {
          startViewWeek = item.startWeek;
        }
      } else {
        startViewWeek = item.startWeek;
      }

      if (endViewWeek) {
        const a = this.dateUtils.parseWeekString(endViewWeek);
        const b = this.dateUtils.parseWeekString(item.endWeek);
        if (b > a) {
          endViewWeek = item.endWeek;
        }
      } else {
        endViewWeek = item.endWeek;
      }
    });
    this.weeks = this.dateUtils.generateWeekRange(startViewWeek, endViewWeek);
    this.getYearsArray();
  }

  addWeeksToRange(start: boolean) {
    if (this.weeks.length > 0) {
      const week = start ? this.weeks[0] : this.weeks[this.weeks.length - 1];
      if (start) {
        this.weeks.unshift(new Week(this.dateUtils.getWeekString(subWeeks(this.dateUtils.parseWeekString(`${week.year}-${week.label}`), 1))));
      } else {
        this.weeks.push(new Week(this.dateUtils.getWeekString(addWeeks(this.dateUtils.parseWeekString(`${week.year}-${week.label}`), 1))));
      }
      this.getYearsArray();

      this.updateEventsWithMaleGroups();
      this.calculateAllEventPositions();
    }
  }

  getYearsArray() {
    const arr: { year: number; count: number }[] = [];
    if (this.weeks.length > 0) {
      let currentYear: number = this.weeks[0].year;
      let count: number = 0;
      this.weeks.forEach((week, ind) => {
        if (currentYear === week.year) {
          count = count + 1;
        } else {
          arr.push({ year: currentYear, count: count });
          currentYear = week.year;
          count = 1;
        }
        if (ind === this.weeks.length - 1) {
          arr.push({ year: currentYear, count: count });
        }
      });
    }
    this.years = arr;
  }

  // --- Helper to calculate positions for all events ---
  // Modified to reset stackOffsetPx before calculating base positions and then applying stacking.
  calculateAllEventPositions(): void {
    // First, ensure stackOffsetPx is reset for all events.
    // This is crucial before re-calculating positions, especially after a drag.
    this.events().forEach(event => {
      event.stackOffsetPx = 0; // Reset
      event.order = 0; // Reset
      // Now calculate the base left and top positions (which modify the event object)
      this.getEventLeftPosition(event);
      this.getEventTopPosition(event); // This calculates the *base* top.
    });
    // Then, apply stacking across all lanes based on their base positions
    this.calcDistance();
    this.applyStackingForAllEvents();
    this.updateSupplierPeakCapacities();
    this.applyStackingForAllEvents();
    this.updateSupplierPeakCapacities();
    this.updateEvents();
  }

  // --- NEW METHOD: Dynamically Update Supplier Peak Capacities ---
  /**
   * Calculates the peak (maximum) event amount usage for each supplier
   * across all weeks in the current view.
   * Updates the `calculatedCapacity` property of each supplier.
   */
  public updateSupplierPeakCapacities(): void {
    // A map to store weekly amounts for each supplier:
    // { supplierId: { '2023-W36': 150, '2023-W37': 270, ... } }
    const supplierWeeklyAmounts = new Map<string, Map<string, number>>();

    // Initialize map for each supplier
    this.suppliers.forEach(supplier => {
      if (supplier.id !== 'unassigned') {
        supplierWeeklyAmounts.set(supplier.id, new Map<string, number>());
        supplier.calculatedCapacity = 0; // Reset for recalculation
      }
    });

    // Iterate through all events to accumulate amounts per week per supplier
    // this.filteredAndGroupedEvents().forEach(event => {
    this.events().forEach(event => {
      const startWeekDate = this.dateUtils.parseWeekString(event.startWeek);
      const endWeekDate = this.dateUtils.parseWeekString(event.endWeek);

      // Iterate through each week the event spans
      let currentWeekDate = new Date(startWeekDate);
      while (currentWeekDate <= endWeekDate) {
        const weekString = this.dateUtils.getWeekString(currentWeekDate);
        const currentSupplierWeeklyMap = supplierWeeklyAmounts.get(event.supplierId);

        if (currentSupplierWeeklyMap) {
          const currentAmount = currentSupplierWeeklyMap.get(weekString) || 0;
          currentSupplierWeeklyMap.set(weekString, currentAmount + event.amount);
        }

        currentWeekDate = this.dateUtils.addWeeks(currentWeekDate, 1); // Move to the next week
      }
    });

    this.weeks.forEach((week) => { week.overflow = false; });
    this.supplierOverflowErrors = [];
    let under = 0;
    let over = 0;

    // Determine the peak usage for each supplier
    this.suppliers.forEach(supplier => {
      const weeklyAmountsMap = supplierWeeklyAmounts.get(supplier.id);
      if (weeklyAmountsMap) {
        let peakAmount = 0;
        weeklyAmountsMap.forEach(amount => {
          if (amount > peakAmount) {
            peakAmount = amount;
          }
        });
        supplier.calculatedCapacity = peakAmount; // Assign the peak usage

        // product penalties calc
        if (supplier.capacity > supplier.calculatedCapacity) {
          under += supplier.capacity - supplier.calculatedCapacity;
        }
        if (supplier.capacity < supplier.calculatedCapacity) {
          over += supplier.calculatedCapacity - supplier.capacity;
        }

        let errorWeeks: string = '';
        if (peakAmount > supplier.capacity) {
          for (const key of weeklyAmountsMap.keys()) {
            const value: any = weeklyAmountsMap.get(key);
            if (value > supplier.capacity) {
              this.weeks.forEach((week) => {
                if (key === `${week.year}-${week.label}`) {
                  week.overflow = true;
                }
              });
              errorWeeks = `${errorWeeks}${errorWeeks.length ? ', ' : ''}${key}`;
            }
          }
        }

        if (errorWeeks.length > 0) {
          this.supplierOverflowErrors.push(`Supplier <span>${supplier.name}</span> has overflows in <span>${errorWeeks}</span>`);
        }
      }
    });

    this.productionPenalties.set({ under: under, over: over });

    this.cdr.detectChanges(); // Trigger change detection to update the view with new capacities
  }



  // --- NEW: Apply Stacking Logic for all events ---
  // This will be called after initial positions are set, and after a drag operation
  private applyStackingForAllEvents(): void {
    const uniqueSupplierIds = new Set(this.events().map(e => e.supplierId));
    uniqueSupplierIds.forEach(supplierId => {
      if (supplierId /*&& supplierId !== 'unassigned'*/) {
        this.applyStackingForLane(supplierId, this.events());
      }
    });
    // After applying stacking, trigger change detection
    this.cdr.detectChanges();
  }

  private applyStackingForLane(supplierId: string, eventsArray: EventData[]): void {
    const eventsInLane = eventsArray.filter(e => e.supplierId === supplierId);

    eventsInLane.sort((a, b) => {
      const startWeekA = this.dateUtils.parseWeekString(a.startWeek).getTime();
      const startWeekB = this.dateUtils.parseWeekString(b.startWeek).getTime();
      if (startWeekA !== startWeekB) return startWeekA - startWeekB;

      const baseTopA = this.calculateEventBaseTopPositionInternal(a);
      const baseTopB = this.calculateEventBaseTopPositionInternal(b);
      if (baseTopA !== baseTopB) return baseTopA - baseTopB;

      const durationA = this.dateUtils.getWeekRangeCount(a.startWeek, a.endWeek);
      const durationB = this.dateUtils.getWeekRangeCount(b.startWeek, b.endWeek);
      if (durationA !== durationB) return durationB - durationA;

      return a.order - b.order;
    });

    const placedEventRects: EventRect[] = [];

    for (const currentEvent of eventsInLane) {
      const currentEventCalculatedLeft = this.calculateEventLeftPositionInternal(currentEvent);
      const currentEventWidth = (supplierId === 'unassigned') ? this.WEEK_COLUMN_WIDTH_PX : this.getEventBlockWidth(currentEvent);
      const currentEventHeight = this.getEventBlockHeight(currentEvent);

      let maxOverlappingBottom = 0;

      for (const placedRect of placedEventRects) {
        const xOverlap = Math.max(0, Math.min(
          currentEventCalculatedLeft + currentEventWidth,
          placedRect.left + placedRect.width
        ) - Math.max(currentEventCalculatedLeft, placedRect.left));

        if (xOverlap > 0) {
          maxOverlappingBottom = Math.max(maxOverlappingBottom, placedRect.top + placedRect.height);
        }
      }

      // Determine the new stack offset based on the max bottom of overlapping events
      const newStackOffsetPx = maxOverlappingBottom > 0
        ? (maxOverlappingBottom - this.calculateEventBaseTopPositionInternal(currentEvent) + this.STACK_VERTICAL_OFFSET_PX)
        : 0; // If no overlap, stack offset is 0

      // Update the event's stack offset and final top position
      currentEvent.stackOffsetPx = newStackOffsetPx;
      currentEvent.topPosition = this.calculateEventBaseTopPositionInternal(currentEvent) + currentEvent.stackOffsetPx;
      currentEvent.leftPosition = currentEventCalculatedLeft;

      placedEventRects.push({
        id: currentEvent.id,
        left: currentEvent.leftPosition,
        top: currentEvent.topPosition,
        width: currentEventWidth,
        height: currentEventHeight
      });
    }
  }

  resetPreventDefault(e: MouseEvent, eventData: EventData) {
    e.preventDefault();
    this.resetEvent(eventData);
  }

  resetEvent(eventData: EventData) {
    if (eventData.supplierId === 'unassigned') return;
    if (eventData.productType === 'M') return;

    this.draggedWeek.set(null);
    // Hide placeholder and clear dragging event reference
    this.showPlaceholder = false;
    this.draggingEvent = null;

    let newStartWeekString: string = eventData.date;

    const durationWeeks = this.dateUtils.getWeekRangeCount2(eventData.startWeek, eventData.endWeek);

    let newEndWeekString: string; // Changed to string
    if (newStartWeekString) {
      const newEndWeekDate = this.dateUtils.addWeeks(this.dateUtils.parseWeekString(newStartWeekString), durationWeeks - 1);
      newEndWeekString = this.dateUtils.getWeekString(newEndWeekDate);
    } else {
      newEndWeekString = eventData.endWeek; // Should not happen if newStartWeekString is always set
    }

    // if (eventData.productType === 'M') {
    //   const newUnassignedEvents = this.events().filter(e => e.productType === 'M' && e.startWeek === newStartWeekString && e.supplierId === 'unassigned' && e.id !== eventData.id)
    //   if (!newUnassignedEvents.length) {
    //     const newEvent: EventData = {
    //       ...eventData,
    //       amount: eventData.amount,
    //       productType: 'M',
    //       startWeek: newStartWeekString,
    //       endWeek: newEndWeekString,
    //       stackOffsetPx: 0,
    //       supplierId: 'unassigned',
    //       id: `${eventData.startWeek}-${Date.now()}`
    //     }

    //     const currentEvents = this.events();
    //     this.events.set([...currentEvents, newEvent]);
    //   } else {
    //     newUnassignedEvents[0].amount += eventData.amount;
    //   }
    //   this.events.set(this.events().filter(e => e.id !== eventData.id));

    //   return;
    // }

    // --- Determine new supplier based on newLogicalY ---
    let newSupplierId: string = 'unassigned';

    const unassignedEvents = this.events().filter(e => e.productType === 'M' && e.startWeek === eventData.startWeek && e.supplierId === 'unassigned' && e.id !== eventData.id)
    const totalunassignedEventsAmount = unassignedEvents.reduce((sum, item) => sum + (item.amount || 0), 0) + eventData.amount;

    let notAllowed = false;
    let notAllowedMessage = 'Not allowed';

    if (eventData.startWeek !== newStartWeekString) {
      if (!unassignedEvents.length || totalunassignedEventsAmount < eventData.amount) {
        notAllowed = true;
        notAllowedMessage = `Put M-block ${eventData.amount} to unassigned`;
      } else {
        const newUnassignedEvents = this.events().filter(e => e.productType === 'M' && e.startWeek === newStartWeekString && e.supplierId === 'unassigned' && e.id !== eventData.id)
        if (!newUnassignedEvents.length) {
          const newEvent: EventData = {
            ...eventData,
            amount: eventData.amount,
            productType: 'M',
            startWeek: newStartWeekString,
            endWeek: newEndWeekString,
            stackOffsetPx: 0,
            supplierId: 'unassigned',
            id: `${eventData.startWeek}-${Date.now()}`
          }

          const currentEvents = this.events();
          this.events.set([...currentEvents, newEvent]);
        } else {
          newUnassignedEvents[0].amount += eventData.amount;
        }
        unassignedEvents[0].amount -= eventData.amount;
      }
    }

    if (notAllowed) {
      newSupplierId = eventData.supplierId;
      newStartWeekString = eventData.startWeek;
      newEndWeekString = eventData.endWeek;
      this._snackBar.open(notAllowedMessage, undefined, { duration: 3000 });
    }

    // --- Update Event Data & Re-render ---
    // Create a new array reference and update the specific event to trigger OnPush
    const updatedEvents = this.events().map(e => {
      if ((e.id === eventData.id) && (e.productType === eventData.productType)) {
        return {
          ...e,
          startWeek: newStartWeekString,
          endWeek: newEndWeekString,
          supplierId: newSupplierId,
          stackOffsetPx: 0 // Reset stack offset for the dragged event for re-calculation
        };
      }
      return e;
    });

    this.events.set(updatedEvents); // Assign new array to trigger change detection

    // After updating the event's core properties, re-calculate all positions and apply stacking
    // The previous calls to getEventLeftPosition(e) and getEventTopPosition(e) were insufficient
    // because they didn't account for the new stacking.

    // if (eventData.productType === 'F' && (newStartWeekString !== eventData.startWeek))
    // this.updateEventsWithMaleGroups(eventData, newStartWeekString);

    this.calculateAllEventPositions(); // Re-calculate base positions for all events

    console.log(`Event ${eventData.name} final update to: ${newStartWeekString} - ${newEndWeekString}, Supplier: ${newSupplierId}`);
    // IMPORTANT: Clear the transform applied by cdkDrag
    // This needs to be done *after* Angular has applied the new top/left positions
    setTimeout(() => {
      this.cdr.detectChanges(); // Trigger final change detection
    }, 0);
  }

  // --- Drag Event Handlers ---
  onDragStarted(event: CdkDragStart, eventData: EventData): void {
    const p = (event as any).source?._lastPointerEvent;

    if (p) this.drop.set(this.snapToDropCell(p.clientX, p.clientY, eventData));

    this.draggingEvent = eventData;
    this.showPlaceholder = true; // Show placeholder when drag starts

    const week = this.draggingEvent.date.split('-')[1];
    if (eventData.productType === 'F')
      this.draggedWeek.set(this.draggingEvent.date.split('-')[1]);


    // Set initial placeholder dimensions (same as the event block)
    this.placeholderWidthPx = this.getEventBlockWidth(eventData);
    this.placeholderHeightPx = this.getEventBlockHeight(eventData);

    // Set the initial placeholder position to the event's current logical position
    // Use the values already stored in eventData
    this.placeholderLeftPx = eventData.leftPosition;
    this.placeholderTopPx = eventData.topPosition;

    this.cdr.detectChanges(); // Force update to show placeholder immediately
  }


  onDragMoved(event: CdkDragMove, eventData: EventData): void {
    if (!this.draggingEvent) return;

    // 1) Дельта, яку дає CDK (з моменту старту drag)
    const dx = event.distance?.x ?? 0;
    const dy = event.distance?.y ?? 0;

    // 2) Лівий (X) беремо, як і було
    const originalLeftPx = this.calculateEventLeftPositionInternal(eventData);

    // 3) ВЕРТИКАЛЬ (Y): беремо реальний top блоку (включає stackOffset),
    //    а не базовий top рядка. Це і є різний "зсув" для кожного елемента в unassigned.
    const baseTopPx = this.calculateEventBaseTopPositionInternal(eventData);
    const originalTopPx = (eventData.topPosition ?? baseTopPx);

    // Поточний ЛВ-кут у координатах grid-content
    const anchorContentX = originalLeftPx + dx;
    const anchorContentY = originalTopPx + dy;

    // 4) Переводимо в viewport-координати (snapToDropCell очікує clientX/Y)
    const gridRect = this.gridContainer.nativeElement.getBoundingClientRect();
    const scrollLeft = this.scrollContainer?.nativeElement.scrollLeft ?? 0;
    const anchorClientX = anchorContentX - scrollLeft + gridRect.left;
    const anchorClientY = anchorContentY + gridRect.top;

    // 5) Підсвічуємо клітинку по фактичній позиції блоку
    this.drop.set(this.snapToDropCell(anchorClientX, anchorClientY, eventData));

    // ==== решта без змін ====
    const potentialNewLogicalX = anchorContentX;
    const potentialNewLogicalY = anchorContentY;

    const potentialNewStartWeekIndex = Math.round(potentialNewLogicalX / this.WEEK_COLUMN_WIDTH_PX);
    let effectiveStartWeekIndex = potentialNewStartWeekIndex;
    if (effectiveStartWeekIndex < 0) effectiveStartWeekIndex = 0;
    if (effectiveStartWeekIndex >= this.weeks.length) effectiveStartWeekIndex = this.weeks.length - 1;

    let potentialNewSupplierId: string | undefined = undefined;
    let currentSupplierLaneY = 0;
    for (const supplier of this.suppliers) {
      const supplierRowHeight = this.getSupplierCapacity(supplier) * this.AMOUNT_ROW_HEIGHT_UNIT_PX;
      if (potentialNewLogicalY >= currentSupplierLaneY && potentialNewLogicalY < currentSupplierLaneY + supplierRowHeight) {
        potentialNewSupplierId = supplier.id;
        break;
      }
      currentSupplierLaneY += supplierRowHeight;
    }

    this.placeholderLeftPx = effectiveStartWeekIndex * this.WEEK_COLUMN_WIDTH_PX;

    let effectiveSupplierIndex = this.suppliers.findIndex(s => s.id === potentialNewSupplierId);
    if (effectiveSupplierIndex === -1) effectiveSupplierIndex = 0;

    let placeholderSupplierTop = 0;
    for (let i = 0; i < effectiveSupplierIndex; i++) {
      placeholderSupplierTop += this.getSupplierCapacity(this.suppliers[i]) * this.AMOUNT_ROW_HEIGHT_UNIT_PX;
    }
    this.placeholderTopPx = placeholderSupplierTop;

    this.cdr.detectChanges();
  }

  onDragEnded(event: CdkDragEnd, eventData: EventData): void {
    this.drop.set({ ...this.drop(), show: false });

    this.draggedWeek.set(null);
    // Hide placeholder and clear dragging event reference
    this.showPlaceholder = false;
    this.draggingEvent = null;

    // Get the element's initial *base* logical position (before drag started, ignoring current stack offset)
    const initialLeftPx = this.calculateEventLeftPositionInternal(eventData);
    const initialTopPx = (eventData.topPosition - this.calculateEventBaseTopPositionInternal(eventData)) + this.calculateEventBaseTopPositionInternal(eventData);

    // Get the distance dragged from the cdkDragEnd event
    const draggedDistanceX = event.distance.x;
    const draggedDistanceY = event.distance.y;

    // Calculate the new logical X and Y positions for the final placement
    const newLogicalX = initialLeftPx + draggedDistanceX;
    const newLogicalY = initialTopPx + draggedDistanceY;

    // --- Determine new startWeek based on newLogicalX ---
    const newStartWeekIndex = Math.round(newLogicalX / this.WEEK_COLUMN_WIDTH_PX);
    let newStartWeekString: string; // Changed to string, no undefined for safety
    if (newStartWeekIndex >= 0 && newStartWeekIndex < this.weeks.length) {
      const newStartWeekObj = this.weeks[newStartWeekIndex];
      newStartWeekString = this.dateUtils.getWeekString(this.dateUtils.parseWeekString(`${newStartWeekObj.year}-W${String(newStartWeekObj.weekNumber)}`));
    } else {
      newStartWeekString = eventData.startWeek;
    }

    const durationWeeks = this.dateUtils.getWeekRangeCount2(eventData.startWeek, eventData.endWeek);

    let newEndWeekString: string; // Changed to string
    if (newStartWeekString) {
      const newEndWeekDate = this.dateUtils.addWeeks(this.dateUtils.parseWeekString(newStartWeekString), durationWeeks - 1);
      newEndWeekString = this.dateUtils.getWeekString(newEndWeekDate);
    } else {
      newEndWeekString = eventData.endWeek; // Should not happen if newStartWeekString is always set
    }

    // --- Determine new supplier based on newLogicalY ---
    let newSupplierId: string | undefined = undefined;
    let currentSupplierLaneY = 0;
    for (const supplier of this.suppliers) {
      const supplierRowHeight = this.getSupplierCapacity(supplier) * this.AMOUNT_ROW_HEIGHT_UNIT_PX;
      if (newLogicalY >= currentSupplierLaneY && newLogicalY < currentSupplierLaneY + supplierRowHeight) {
        newSupplierId = supplier.id;
        break;
      }
      currentSupplierLaneY += supplierRowHeight;
    }

    if (!newSupplierId) {
      newSupplierId = eventData.supplierId;
    }

    // check for events that should start from one week and finish in one week
    let notAllowed = false;
    let notAllowedMessage = 'Not allowed';

    if (eventData.productType === 'M' && eventData.startWeek !== newStartWeekString) {
      notAllowed = true;
      notAllowedMessage = 'Not allowed, only female blocks can be move left and right';
    }

    if (eventData.productType === 'F' && newSupplierId === 'unassigned') {
      if (newStartWeekString !== eventData.date) {
        newSupplierId = 'unassigned';
        newStartWeekString = eventData.date;

        const newEndWeekDate = this.dateUtils.addWeeks(this.dateUtils.parseWeekString(newStartWeekString), durationWeeks - 1);
        newEndWeekString = this.dateUtils.getWeekString(newEndWeekDate);

        this._snackBar.open(notAllowedMessage, undefined, { duration: 3000 });
      }
    }

    if (eventData.productType === 'F' && newSupplierId !== 'unassigned') {
      const unassignedEvents = this.events().filter(e => e.productType === 'M' && e.startWeek === eventData.startWeek && e.supplierId === 'unassigned' && e.id !== eventData.id)
      const totalunassignedEventsAmount = unassignedEvents.reduce((sum, item) => sum + (item.amount || 0), 0) + eventData.amount;

      if (eventData.startWeek !== newStartWeekString) {
        if (!unassignedEvents.length || totalunassignedEventsAmount < eventData.amount) {
          notAllowed = true;
          notAllowedMessage = `Put M-block ${eventData.amount} to unassigned`;
        } else {
          const newUnassignedEvents = this.events().filter(e => e.productType === 'M' && e.startWeek === newStartWeekString && e.supplierId === 'unassigned' && e.id !== eventData.id)
          if (!newUnassignedEvents.length) {
            const newEvent: EventData = {
              ...eventData,
              amount: eventData.amount,
              productType: 'M',
              startWeek: newStartWeekString,
              endWeek: newEndWeekString,
              stackOffsetPx: 0,
              supplierId: 'unassigned',
              id: `${eventData.startWeek}-${Date.now()}`
            }

            const currentEvents = this.events();
            this.events.set([...currentEvents, newEvent]);
          } else {
            newUnassignedEvents[0].amount += eventData.amount;
          }
          unassignedEvents[0].amount -= eventData.amount;
        }
      }
    }

    if (newSupplierId !== 'unassigned' && !notAllowed) {
      // const eventsInLane = this.events().filter(e => (e.supplierId === newSupplierId)).filter(e => !((e.id === eventData.id) && (e.productType === eventData.productType)));
      const eventsInLane: EventData[] = [];
      notAllowed = this.hasWeekOverlap(eventsInLane, newStartWeekString, newEndWeekString)
    }

    if (notAllowed) {
      newSupplierId = eventData.supplierId;
      newStartWeekString = eventData.startWeek;
      newEndWeekString = eventData.endWeek;
      this._snackBar.open(notAllowedMessage, undefined, { duration: 3000 });
    }

    if (!notAllowed && eventData.productType === 'M')
      if (newSupplierId !== 'unassigned') {
        const newSupplier = this.suppliers.find(s => s.id === newSupplierId);
        const filteredEvents = this.events().filter(e => e.date === eventData.date && e.supplierId === newSupplierId && e.id !== eventData.id)
        const totalAmount = filteredEvents.reduce((sum, item) => sum + (item.amount || 0), 0) + eventData.amount;

        const unassignedEvents = this.events().filter(e => e.productType === 'M' && e.startWeek === newStartWeekString && e.supplierId === 'unassigned' && e.id !== eventData.id)
        if (newSupplier?.capacity && newSupplier?.capacity < totalAmount) {
          const newEventAmount = totalAmount - newSupplier?.capacity;

          if (!unassignedEvents.length) {
            const newEvent: EventData = { ...eventData, amount: newEventAmount, supplierId: 'unassigned', id: `${eventData.startWeek}-${Date.now()}` }
            eventData.amount = eventData.amount - newEventAmount;

            const currentEvents = this.events();
            this.events.set([...currentEvents, newEvent]);
          } else {
            unassignedEvents[0].amount += newEventAmount;
            eventData.amount -= newEventAmount;
          }
        }
      } else {
        const unassignedEvents = this.events().filter(e => e.productType === 'M' && e.startWeek === newStartWeekString && e.supplierId === 'unassigned' && e.id !== eventData.id)
        if (unassignedEvents.length > 0) {
          eventData.amount += unassignedEvents[0].amount;

          this.events.update(events =>
            events.filter(e => !unassignedEvents.includes(e))
          );
        }
      }

    // --- Update Event Data & Re-render ---
    // Create a new array reference and update the specific event to trigger OnPush
    const updatedEvents = this.events().map(e => {
      if ((e.id === eventData.id) && (e.productType === eventData.productType)) {
        return {
          ...e,
          startWeek: newStartWeekString,
          endWeek: newEndWeekString,
          supplierId: newSupplierId,
          stackOffsetPx: 0 // Reset stack offset for the dragged event for re-calculation
        };
      }
      return e;
    });

    this.events.set(updatedEvents); // Assign new array to trigger change detection

    if (!notAllowed) {
      this.changeLeftPositionToRelatedEvent(eventData);
      this.updateEvents();
    }

    // After updating the event's core properties, re-calculate all positions and apply stacking
    // The previous calls to getEventLeftPosition(e) and getEventTopPosition(e) were insufficient
    // because they didn't account for the new stacking.

    // if (eventData.productType === 'F' && (newStartWeekString !== eventData.startWeek))
    // this.updateEventsWithMaleGroups(eventData, newStartWeekString);

    this.calculateAllEventPositions(); // Re-calculate base positions for all events

    console.log(`Event ${eventData.name} final update to: ${newStartWeekString} - ${newEndWeekString}, Supplier: ${newSupplierId}`);
    // IMPORTANT: Clear the transform applied by cdkDrag
    // This needs to be done *after* Angular has applied the new top/left positions
    setTimeout(() => {
      event.source.element.nativeElement.style.transform = '';
      this.cdr.detectChanges(); // Trigger final change detection
    }, 0);
  }

  hasWeekOverlap(events: EventData[], startWeek: string, endWeek: string) {
    let notAllowed = false;
    const weekRange = this.dateUtils.generateWeekRange(startWeek, endWeek).map(w => `${w.year}-${w.label}`);
    events.forEach((evInLane) => {
      const weekRangeEvInLine = this.dateUtils.generateWeekRange(evInLane.startWeek, evInLane.endWeek).map(w => `${w.year}-${w.label}`);
      const hasCommon = weekRange.some(item => weekRangeEvInLine.includes(item));
      if (hasCommon) {
        if ((evInLane.startWeek !== startWeek) || (evInLane.endWeek !== endWeek)) {
          notAllowed = true;
        }
      }
    });
    return notAllowed;
  }

  changeLeftPositionToRelatedEvent(eventData: EventData): void {
    const find = this.events().find(e => (e.id === eventData.id) && (e.productType === eventData.productType));
    if (find) {
      const durationWeeks = (find.productType === 'M') ? 10 : 18;
      const newEndWeekDate = this.dateUtils.addWeeks(this.dateUtils.parseWeekString(find.startWeek), durationWeeks - 1);
      const newEndWeekString = this.dateUtils.getWeekString(newEndWeekDate);

      const updatedEvents = this.events().map(ev => {
        if ((ev.id === eventData.id) && (ev.productType !== eventData.productType)) {
          return {
            ...ev,
            startWeek: find.startWeek,
            endWeek: newEndWeekString,
            stackOffsetPx: 0 // Reset stack offset for the dragged event for re-calculation
          };
        }
        return ev;
      });
      this.events.set(updatedEvents);
    }
  }

  // --- NEW: Stacking Logic Placeholder ---
  // This method will now be properly implemented to handle overlapping events.
  // It's called internally by applyStackingForLane.
  checkForOverlappingEvents() {
    // This function can now be removed or refactored as its logic is within applyStackingForLane.
    // If you had other general overlap checks (e.g., for visual warnings), they'd go here.
    // For now, it's just a placeholder as the core stacking is in applyStackingForLane.
  }

  // --- Helper Methods (Modified to work with stacking logic) ---

  // Original getEventTopPosition and getEventLeftPosition now become setters for EventData
  // and are primarily called by calculateAllEventPositions.
  // The template bindings will directly read event.topPosition and event.leftPosition.

  /**
   * Calculates the base top position for an event (based on supplier lane, no stacking).
   * It also sets the `topPosition` on the event data, but this will be overridden
   * by stacking if there are overlaps.
   * This function is primarily used internally by `calculateAllEventPositions`.
   */
  getEventTopPosition(event: EventData, eventBlockComponent: EventBlockComponent | any = null): void {
    const supplierIndex = this.suppliers.findIndex(s => s.id === event.supplierId);
    if (supplierIndex === -1) {
      console.warn(`Event ${event.id} has no valid supplierId: ${event.supplierId}. Positioning at top.`);
      // event.supplierId = 'unassigned';
      event.topPosition = 0;
      // this.events.set(this.events().filter(e => e.id !== event.id))
      return;
    }
    let totalHeightAbove = 0;
    for (let i = 0; i < supplierIndex; i++) {
      totalHeightAbove += this.getSupplierCapacity(this.suppliers[i]) * this.AMOUNT_ROW_HEIGHT_UNIT_PX;
    }
    /*const eventSupplierCapacity = this.suppliers.find(s => s.id === event.supplierId)?.capacity;
    if (eventSupplierCapacity) {
      totalHeightAbove += (eventSupplierCapacity - event.amount) * this.AMOUNT_ROW_HEIGHT_UNIT_PX;
    }*/
    // Set the base top position here. StackOffsetPx will be added by applyStackingForLane.
    event.topPosition = totalHeightAbove;

    // This part for clearing transform is a bit tricky with your current setup.
    // Ideally, cdkDrag should handle its own transform, and you manage the [top]/[left] inputs.
    // If you absolutely need this, it should be called in ngAfterViewInit or when a component is initialized/updated.
    // For now, keeping it as is, but be aware it might not always behave as expected with OnPush and direct property updates.
    /*
    if (this.draggingEvent && (this.draggingEvent.id !== event.id) && eventBlockComponent) {
      eventBlockComponent.eventComponent().nativeElement.style.transform = '';
      // No return needed here, as it's a void function setting a property.
    }
    */
  }

  /**
   * Calculates the left position for an event (based on start week).
   * It also sets the `leftPosition` on the event data.
   * This function is primarily used internally by `calculateAllEventPositions`.
   */
  getEventLeftPosition(event: EventData): void {
    const startWeekIndex = this.weeks.findIndex(w => this.dateUtils.getWeekString(this.dateUtils.parseWeekString(`${w.year}-W${String(w.weekNumber)}`)) === event.startWeek);
    if (startWeekIndex !== -1) {
      event.leftPosition = startWeekIndex * this.WEEK_COLUMN_WIDTH_PX;
      return;
    }
    console.warn(`Event ${event.id} startWeek ${event.startWeek} not found in current view. Positioning at left (0).`);
    event.leftPosition = 0;
  }

  // --- NEW: Internal Helpers for calculations (don't modify event object) ---
  // These are pure functions to calculate positions without side effects,
  // used by stacking logic and drag calculations.

  /**
   * Calculates the raw left position of an event based on its start week.
   * Does NOT modify the event object.
   */
  private calculateEventLeftPositionInternal(event: EventData): number {
    const startWeekIndex = this.weeks.findIndex(w => this.dateUtils.getWeekString(this.dateUtils.parseWeekString(`${w.year}-W${String(w.weekNumber)}`)) === event.startWeek);
    if (startWeekIndex !== -1) {
      return startWeekIndex * this.WEEK_COLUMN_WIDTH_PX;
    }
    return 0; // Default to 0 if not found
  }

  /**
   * Calculates the base top position of an event based purely on its supplier lane.
   * This does NOT include any stacking offset and does NOT modify the event object.
   */
  private calculateEventBaseTopPositionInternal(event: EventData): number {
    const supplierIndex = this.suppliers.findIndex(s => s.id === event.supplierId);
    if (supplierIndex === -1) {
      return 0; // Default to 0 if no valid supplier
    }
    let totalHeightAboveSuppliers = 0;
    for (let i = 0; i < supplierIndex; i++) {
      totalHeightAboveSuppliers += this.getSupplierCapacity(this.suppliers[i]) * this.AMOUNT_ROW_HEIGHT_UNIT_PX;
    }
    /* const eventSupplierCapacity = this.suppliers.find(s => s.id === event.supplierId)?.capacity;
     if (eventSupplierCapacity) {
       totalHeightAboveSuppliers += (eventSupplierCapacity - event.amount) * this.AMOUNT_ROW_HEIGHT_UNIT_PX;
     }*/
    return totalHeightAboveSuppliers;
  }

  onEditEvent(data: { event: EventData, reset: boolean }): void {
    if (data.reset) {
      let eventData = this.events().find(ev => ev.id === data.event.id);
      if (eventData)
        this.resetEvent(eventData)
      return;
    }

    if (!data.event) return;

    if (data.event.productType === 'F') {
      const newSupplier = this.suppliers.find(s => s.id === data.event.supplierId);
      const filteredEvents = this.events().filter(e => e.startWeek === data.event.startWeek && e.supplierId === data.event.supplierId && e.id !== data.event.id)
      const totalAmount = filteredEvents.reduce((sum, item) => sum + (item.amount || 0), 0) + data.event.amount;

      const unassignedEvents = this.events().filter(e => e.productType === 'M' && e.startWeek === data.event.startWeek && e.supplierId === 'unassigned' && e.id !== data.event.id)
      if (newSupplier?.capacity && newSupplier?.capacity < totalAmount) {
        const newEventAmount = totalAmount - newSupplier?.capacity;

        if (!unassignedEvents.length) {
          const newEvent: EventData = { ...data.event, amount: newEventAmount, supplierId: 'unassigned', id: `${data.event.startWeek}-${Date.now()}` }

          const currentEvents = this.events();
          this.events.set([...currentEvents, newEvent]);
        } else {
          unassignedEvents[0].amount += newEventAmount;
        }
      }

      this.updateEventsWithMaleGroups(data.event);
    } else {
      const newSupplier = this.suppliers.find(s => s.id === data.event.supplierId);
      const filteredEvents = this.events().filter(e => e.startWeek === data.event.startWeek && e.supplierId === data.event.supplierId && e.id !== data.event.id)
      const totalAmount = filteredEvents.reduce((sum, item) => sum + (item.amount || 0), 0) + data.event.amount;

      const unassignedEvents = this.events().filter(e => e.productType === 'M' && e.startWeek === data.event.startWeek && e.supplierId === 'unassigned' && e.id !== data.event.id)
      if (newSupplier?.capacity && newSupplier?.capacity < totalAmount) {
        const newEventAmount = totalAmount - newSupplier?.capacity;

        if (!unassignedEvents.length) {
          const newEvent: EventData = { ...data.event, amount: newEventAmount, supplierId: 'unassigned', id: `${data.event.startWeek}-${Date.now()}` }
          data.event.amount = data.event.amount - newEventAmount;

          const currentEvents = this.events();
          this.events.set([...currentEvents, newEvent]);
        } else {
          unassignedEvents[0].amount += newEventAmount;
          data.event.amount -= newEventAmount;
        }
      }
    }

    const updated = this.events().map((ev: EventData) => {
      if (ev.id === data.event.id) {
        ev.name = data.event.name;
        ev.amount = data.event.amount;
        ev.maxShiftWeeksEarly = data.event.maxShiftWeeksEarly;
        ev.maxShiftWeeksLate = data.event.maxShiftWeeksLate;
      }
      return ev;
    });
    this.events.set(updated);

    this.calculateAllEventPositions();
    this.updateEvents();
  }


  // --- Helper Methods (Dimensions, Background Lines, TrackBy) ---

  getSupplierCapacity(s: Supplier): number {
    return (s.calculatedCapacity && (s.calculatedCapacity > s.capacity)) ? s.calculatedCapacity : s.capacity;
  }

  getGridContentHeight(): number {
    const totalCapacity = this.suppliers.reduce((sum, s) => sum + this.getSupplierCapacity(s), 0);
    return totalCapacity * this.AMOUNT_ROW_HEIGHT_UNIT_PX;
  }

  getSupplierLineTopPosition(index: number): number {
    const sumOfPreviousCapacities = this.suppliers
      .slice(0, index)
      .reduce((sum, s) => sum + this.getSupplierCapacity(s), 0);
    return sumOfPreviousCapacities * this.AMOUNT_ROW_HEIGHT_UNIT_PX;
  }

  getEventBlockWidth(event: EventData): number {
    return this.dateUtils.getWeekRangeCount(event.startWeek, event.endWeek) * this.WEEK_COLUMN_WIDTH_PX;
  }

  getEventBlockHeight(event: EventData): number {
    return event.amount * this.AMOUNT_ROW_HEIGHT_UNIT_PX;
  }

  trackByEventId(index: number, event: EventData): string {
    return event.id;
  }

  updateEvents() {
    this.selfUpdate = true;
    this.dataService.events$.next(this.events());
    this.dataService.suppliers$.next(this.suppliers);
    this.checkForEventsErrorMessages();
    this.selfUpdate = false;
  }

  private uniqStrings(arr: string[]): string[] {
    const seen = new Set<string>();
    return arr.filter(s => {
      if (seen.has(s)) return false;
      seen.add(s);
      return true;
    });
  }

  checkForEventsErrorMessages() {
    this.eventsShiftErrors = [];
    this.shiftPenalties.set(0);
    let amount = 0;
    let demand = 0;
    this.events().forEach(event => {
      let first = event.date;
      let second = event.startWeek;
      let shifting: 'left' | 'right' = 'right';
      if (this.dateUtils.parseWeekString(event.startWeek) <= this.dateUtils.parseWeekString(event.date)) {
        first = event.startWeek;
        second = event.date;
        shifting = 'left';
      }
      const durationWeeks = this.dateUtils.getWeekRangeCount(first, second) - 1;
      if (shifting === 'left') {
        if (durationWeeks > event.maxShiftWeeksEarly) {
          const diff = durationWeeks - event.maxShiftWeeksEarly;
          if (event.supplierId !== 'unassigned' && event.productType === 'F')
            this.shiftPenalties.update((v) => v + (event.amount * diff));
          this.eventsShiftErrors.push(`Event <span>${event.name} (${event.productType})</span> is shifted early for <span>${diff} weeks</span>`);
        }
      } else {
        if (durationWeeks > event.maxShiftWeeksLate) {
          const diff = durationWeeks - event.maxShiftWeeksLate;
          if (event.supplierId !== 'unassigned' && event.productType === 'F')
            this.shiftPenalties.update((v) => v + (event.amount * diff));
          this.eventsShiftErrors.push(`Event <span>${event.name} (${event.productType})</span> is shifted late for <span>${diff} weeks</span>`);
        }
      }
      // calc unassigned penalties
      if (event.supplierId === 'unassigned') {
        amount += event.amount;
        demand += 1;
      }
    });

    this.eventsShiftErrors = this.uniqStrings(this.eventsShiftErrors);
    this.unassignedPenalties.set({ amount, demand });
  }

  calcDistance() {
    if (this.events().length && this.suppliers.length && this.distance.demand.length && this.distance.suppliers.length) {
      const events = this.events().map(event => {
        if (event.supplierId !== 'unassigned' && event.productType !== 'M') {
          this.distance?.suppliers?.forEach(supplierDistance => {
            if (supplierDistance.breeder_id === event.supplierId && supplierDistance.producer_id === event.name) {
              event.distance = {
                distance_km: supplierDistance.distance_km,
                distance_minute: supplierDistance.distance_minute
              };
            }
          });
        }
        return event;
      });
      const grouped =
        events.filter(e => (e.supplierId !== 'unassigned') && (e.productType !== 'M'))
          .reduce((acc, curr) => {
            const key = `${curr.supplierId}_${curr.startWeek}_${curr.endWeek}`;
            if (!acc.has(key)) acc.set(key, []);
            acc.get(key)!.push(curr);  // push full object
            return acc;
          }, new Map<string, typeof events>());

      Array.from(grouped.values()).forEach((items) => {
        if (items.length > 1) {
          const bestRoute = this.dataService.findShortestRoute(items[0].supplierId, items.map(e => e.name), this.distance.suppliers, this.distance.demand)?.route
          bestRoute?.forEach((name, ind) => {
            const findItems = items.find(i => i.name === name);
            events.forEach(event => {
              if (event.id === findItems?.id && event.productType !== 'M' && event.supplierId === findItems?.supplierId) {
                event.order = ind;
                if (ind !== 0) {
                  this.distance?.demand?.forEach((demandDistance) => {
                    if (demandDistance.producer_id_from === bestRoute[ind - 1] && demandDistance.producer_id_too === name) {
                      event.distance = {
                        distance_km: demandDistance.distance_km,
                        distance_minute: demandDistance.distance_minute
                      };
                    }
                  })
                }
              }
            })
          });
        }
      });

      let km = 0;
      let min = 0;
      events.forEach(event => {
        if (event.supplierId !== 'unassigned' && event.productType !== 'M' && event.distance) {
          km = km + event.distance.distance_km;
          min = min + event.distance.distance_minute;
        }
      });

      this.allCalcSum.set({ km, min });

      this.events.set(events);
    }
  }

  onScrollContainer() {
    if (!this.scrollContainer) {
      setTimeout(() => {
        this.onScrollContainer();
      }, 100);
      return;
    }

    fromEvent(this.scrollContainer.nativeElement, 'scroll')
      .pipe(throttleTime(0)) // optional: reduce event frequency
      .subscribe(() => {
        this.supplierContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollTop;
      });
  }

  onScrollSuppliers() {
    if (!this.supplierContainer) {
      setTimeout(() => {
        this.onScrollSuppliers();
      }, 100);
      return;
    }

    fromEvent(this.supplierContainer.nativeElement, 'scroll')
      .pipe(throttleTime(0)) // optional: reduce event frequency
      .subscribe(() => {
        this.scrollContainer.nativeElement.scrollTop = this.supplierContainer.nativeElement.scrollTop;
      });
  }

  getDateFromISOWeekStr(weekStr: string): Date {
    const [year, week] = weekStr.split('-W').map(Number);
    return this.getDateFromISOWeek(week, year);
  }

  getDateFromISOWeek(week: number, year: number): Date {
    const date = setWeek(setYear(new Date(), year), week);
    return startOfWeek(date, { weekStartsOn: 1 }); // Monday
  }

  getISOWeekString(date: Date): string {
    const week = getISOWeek(date);
    const year = date.getFullYear();
    return `${year}-W${week.toString()}`;
  }

  private bulkApplyMalePlacements(
    newGroupedEvents: EventData[],
    breederMappingMaleEvents: EventData[],
    suppliers: { id: string; capacity?: number | null }[]
  ): EventData[] {
    // Work on a copy to avoid mutating inputs
    const updated: EventData[] = newGroupedEvents.map(e => ({ ...e }));

    // Fast index by id
    const idxById = new Map<string, number>();
    updated.forEach((e, i) => idxById.set(e.id, i));

    // Supplier map
    const suppliersById = new Map<string, { id: string; capacity?: number | null }>();
    suppliers.forEach(s => suppliersById.set(s.id, s));

    // Index of unassigned male events by startWeek
    const unassignedMByWeek = new Map<string, EventData[]>();
    for (const e of updated) {
      if (e.productType === 'M' && e.supplierId === 'unassigned') {
        const list = unassignedMByWeek.get(e.startWeek) ?? [];
        list.push(e);
        unassignedMByWeek.set(e.startWeek, list);
      }
    }

    // Aggregate already placed amounts by (date, supplierId) for capacity checks
    const keyDS = (date: string, supplierId: string) => `${date}#${supplierId}`;
    const totalsByDateSupplier = new Map<string, number>();
    for (const e of updated) {
      if (e.productType === 'M' && e.supplierId !== 'unassigned') {
        const k = keyDS(e.date, e.supplierId);
        totalsByDateSupplier.set(k, (totalsByDateSupplier.get(k) ?? 0) + (e.amount ?? 0));
      }
    }

    // Process desired placements
    for (const target of breederMappingMaleEvents) {
      if (target.productType !== 'M') continue;
      const pool = unassignedMByWeek.get(target.startWeek);
      if (!pool || pool.length === 0) continue;

      const event = pool.shift()!;
      const eventIdx = idxById.get(event.id);
      if (eventIdx == null) continue;

      const desiredSupplierId = target.supplierId;
      if (!desiredSupplierId || desiredSupplierId === 'unassigned') {
        // Nothing to do, it is already unassigned
        continue;
      }

      const supplier = suppliersById.get(desiredSupplierId);
      const cap = supplier?.capacity ?? Number.POSITIVE_INFINITY;

      const k = keyDS(event.date, desiredSupplierId);
      const currentTotal = totalsByDateSupplier.get(k) ?? 0;
      const amount = event.amount ?? 0;

      const placeable = Math.min(amount, Math.max(0, cap - currentTotal));
      if (placeable <= 0) {
        // Supplier is full; put event back
        pool.unshift(event);
        continue;
      }

      const leftover = amount - placeable;

      // Update moved event
      const moved = { ...updated[eventIdx] };
      moved.supplierId = desiredSupplierId;
      moved.amount = placeable;   // M blocks keep weeks unchanged
      updated[eventIdx] = moved;

      totalsByDateSupplier.set(k, currentTotal + placeable);

      if (leftover > 0) {
        // Return leftover to unassigned of the same week; merge if possible
        const restList = unassignedMByWeek.get(event.startWeek) ?? [];
        const maybeMerge = restList[0];
        if (maybeMerge && idxById.has(maybeMerge.id)) {
          const mIdx = idxById.get(maybeMerge.id)!;
          const merged = { ...updated[mIdx], amount: (updated[mIdx].amount ?? 0) + leftover };
          updated[mIdx] = merged;
        } else {
          const clone: EventData = {
            ...event,
            id: `${event.startWeek}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            supplierId: 'unassigned',
            amount: leftover,
          };
          updated.push(clone);
          idxById.set(clone.id, updated.length - 1);
          restList.push(clone);
          unassignedMByWeek.set(event.startWeek, restList);
        }
      }
    }

    return updated;
  }

  /** Глобальний (по контенту) X для точки, з урахуванням горизонтального скролу */
  private toContentX(pointerClientX: number) {
    const gridEl = this.gridContainer?.nativeElement as HTMLElement;
    const scrollEl = this.scrollContainer?.nativeElement as HTMLElement; // #scrollContainer
    if (!gridEl) return 0;
    const rect = gridEl.getBoundingClientRect();
    const scrollLeft = scrollEl ? scrollEl.scrollLeft : 0;
    // pointerClientX -> в координати контенту (а не видимої області)
    return Math.max(0, pointerClientX - rect.left + scrollLeft);
  }

  /** Підсвітка строго тієї тижневої клітинки, куди впаде блок */
  private snapToDropCell(pointerX: number, pointerY: number, event: EventData) {
    const gridEl = this.gridContainer?.nativeElement as HTMLElement;
    if (!gridEl) return this.drop();

    // --- X з урахуванням scrollLeft ---
    const xContent = this.toContentX(pointerX);

    // --- Обчислюємо індекс тижня ТАК САМО, як у onDrop ---
    // якщо у тебе є вже готова функція для пікселі->startWeek, краще викликати її
    // і потім знайти індекс у this.weeks. Якщо ні — робимо за шириною колонки:
    let colIdx = Math.floor(xContent / this.WEEK_COLUMN_WIDTH_PX);
    colIdx = Math.max(0, Math.min(this.weeks.length - 1, colIdx));

    const colLeft = colIdx * this.WEEK_COLUMN_WIDTH_PX; // координата в системі "grid-content"

    // --- Y: шукаємо правильний рядок-постачальник (без змін) ---
    const rect = gridEl.getBoundingClientRect();
    const y = Math.max(0, pointerY - rect.top);
    let rowTop = 0;
    let rowHeight = 0;
    let accTop = 0;

    for (const s of this.suppliers) {
      const hUnits = (s.calculatedCapacity && s.calculatedCapacity > s.capacity) ? s.calculatedCapacity : s.capacity;
      const h = hUnits * this.AMOUNT_ROW_HEIGHT_UNIT_PX;
      if (y >= accTop && y < accTop + h) {
        rowTop = accTop;
        rowHeight = h;
        break;
      }
      accTop += h;
    }
    if (rowHeight === 0 && this.suppliers.length) {
      const last = this.suppliers[this.suppliers.length - 1];
      const hUnits = (last.calculatedCapacity && last.calculatedCapacity > last.capacity) ? last.calculatedCapacity : last.capacity;
      rowHeight = hUnits * this.AMOUNT_ROW_HEIGHT_UNIT_PX;
      rowTop = accTop - rowHeight;
    }

    // Підсвічуємо рівно одну тижневу колонку — саме ту, куди впаде блок.
    const ghostLeft = colLeft;
    const ghostWidth = this.WEEK_COLUMN_WIDTH_PX;

    // Якщо маєш власну перевірку валідності — підстав сюди
    const valid = true;

    return {
      show: true,
      colLeft,
      rowTop,
      rowHeight,
      ghostLeft,
      ghostWidth,
      valid,
    };
  }
}
