// src/app/components/event-block/event-block.component.ts
import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  EventEmitter,
  Output, input, computed, viewChild, signal, effect, inject
} from '@angular/core';
import { CommonModule } from '@angular/common'; // Import CommonModule for ngIf, ngFor etc.
import { EventData } from '../../models/event.model';
import { DateUtilsService } from '../../services/date-utils.service';
import {CdkDrag} from '@angular/cdk/drag-drop';
import {EditEventComponent} from './edit-event/edit-event.component';
import {MatDialog} from '@angular/material/dialog';
import {DistanceDemand, DistanceSuppliers} from '../../models/distance.model';

@Component({
  selector: 'app-event-block',
  standalone: true, // Make it standalone
  imports: [CommonModule, CdkDrag], // Import CommonModule
  templateUrl: './event-block.component.html',
  styleUrls: ['./event-block.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EventBlockComponent implements OnInit {
  event = input.required<EventData>();
  amount = input.required<number>();
  pixelsPerWeek = input.required<number>();
  pixelsPerAmountUnit = input.required<number>();
  top = input.required<number>();
  left = input.required<number>();
  distance = input.required<{distance_km: number, distance_minute: number} | null | undefined>();

  @Output() dragEnded = new EventEmitter<any>();
  @Output() dragStarted = new EventEmitter<any>();
  @Output() dragMoved = new EventEmitter<any>();
  @Output() editEvent = new EventEmitter<EventData>();

  eventComponent = viewChild('eventBlock');

  blockWidthPx = computed(() => {
    const weekCount = this.dateUtils.getWeekRangeCount(this.event().startWeek, this.event().endWeek);
    if (this.event().supplierId === 'unassigned') {
      return this.pixelsPerWeek();
    }
    return weekCount * this.pixelsPerWeek();
  });
  blockHeightPx = computed(() => {
    return this.amount() * this.pixelsPerAmountUnit();
  });

  background = '';
  readonly dialog = inject(MatDialog);


  constructor(private dateUtils: DateUtilsService) {
    effect(() => {
      this.checkForWeeksShifting();
    });
  }

  ngOnInit(): void {

  }

  checkForWeeksShifting() {
    const bV = {
      1: {color: '', pixel: ''},
      2: {color: '', pixel: ''},
      3: {color: '', pixel: ''},
      4: {color: '', pixel: ''}
    };
    const mainColor = (this.event().productType === 'F') ? 'pink' : '#007bff';
    if (this.event().supplierId === 'unassigned') {
      this.background = mainColor;
      return;
    }

    const mainShiftColor = (this.event().productType === 'F') ? '#A40006' : '#FF453A';
    const mainWidth = (this.event().productType === 'F') ? '570px' : '330px';
    let first = this.event().date;
    let second = this.event().startWeek;
    let shifting: 'left' | 'right' = 'right';
    if (this.dateUtils.parseWeekString(this.event().startWeek) <= this.dateUtils.parseWeekString(this.event().date)) {
      first = this.event().startWeek;
      second = this.event().date;
      shifting = 'left';
    }
    const durationWeeks = this.dateUtils.getWeekRangeCount(first, second) - 1;
    if (shifting === 'left') {
      bV['1'].color = mainShiftColor;
      bV['1'].pixel = '0px';
      bV['2'].color = mainShiftColor;
      bV['2'].pixel = '0px';
      bV['3'].color =  mainColor;
      bV['3'].pixel = '0px';
      bV['4'].color = mainColor;
      bV['4'].pixel = mainWidth;
      if (durationWeeks > this.event().maxShiftWeeksEarly) {
        const diff = durationWeeks - this.event().maxShiftWeeksEarly;
        bV['2'].pixel = bV['3'].pixel = `${diff * 30}px`;
      }
    } else {
      bV['1'].color = mainColor;
      bV['1'].pixel = '0px';
      bV['2'].color = mainColor;
      bV['2'].pixel = mainWidth;
      bV['3'].color = mainShiftColor;
      bV['3'].pixel = mainWidth;
      bV['4'].color = mainShiftColor;
      bV['4'].pixel = mainWidth;
      if (durationWeeks > this.event().maxShiftWeeksLate) {
        const diff = durationWeeks - this.event().maxShiftWeeksLate;
        const value1 = (this.event().productType === 'F') ? 570 : 330;
        const value2 = value1 - (diff * 30);
        bV['2'].pixel = bV['3'].pixel = `${value2 > 0 ? value2 : 0}px`;
      }
    }

    this.background = `linear-gradient(to right, ${bV['1'].color} ${bV['1'].pixel}, ${bV['2'].color} ${bV['2'].pixel}, ${bV['3'].color} ${bV['3'].pixel}, ${bV['4'].color} ${bV['4'].pixel})`
  }

  onEditEvent() {
    const dialogRef = this.dialog.open(EditEventComponent, {
      data: this.event(),
      width: '400px',
    });

    dialogRef.afterClosed().subscribe((result: EventData) => {
      if (result) {
        this.editEvent.emit(result);
      }
    });
  }
}
