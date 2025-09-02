import { Component, inject } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogActions, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { HttpService, ScheduleResponse } from '../../../services/http.service';
import { combineLatest } from 'rxjs';
import { Supplier } from '../../../models/supplier.model';
import { EventData } from '../../../models/event.model';
import { DistanceDemand, DistanceSuppliers } from '../../../models/distance.model';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { addWeeks, getISOWeek, setWeek, setYear, startOfWeek } from 'date-fns';
import { DateUtilsService } from '../../../services/date-utils.service';


@Component({
  selector: 'app-load-data',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatProgressSpinner,
  ],
  templateUrl: './load-data.component.html',
  styleUrls: ['./load-data.component.scss']
})
export class LoadDataComponent {
  readonly dialogRef = inject(MatDialogRef<LoadDataComponent>);

  inputId = 0;
  errorMessage = {
    type: '',
    message: '',
  }
  loading = false;

  constructor(private api: HttpService, private dateUtils: DateUtilsService) {
  }

  onCloseDialog(data: any = null): void {
    this.dialogRef.close(data ? data : null);
  }

  onLoadData() {
    if (this.inputId) {
      this.loading = true;
      combineLatest([
        this.api.getSchedules(this.inputId),
        this.api.getBreeders(this.inputId),
        this.api.getProducers(this.inputId),
        this.api.getBreederProducers(this.inputId),
        this.api.getProducerProducers(this.inputId),
        this.api.getProducerBreeder(this.inputId)
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
                date: this.processWeeks(weekIn, fromSchedule, producer.external_id),
                amount: producer.capacity,
                supplierId: 'unassigned'
              }
              event.date = this.dateUtils.fixIsoWeek(event.date);
              const eventFemale = new EventData(event);
              eventFemale.endWeek = this.getISOWeekString(addWeeks(this.getDateFromISOWeekStr(eventFemale.startWeek), 18 - 1));
              events.push(eventFemale);
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

              const idx = events.findIndex(e => e.name === producerBreeder.producer_id);
              const schedule = idx !== -1 ? events.splice(idx, 1)[0] : undefined;

              const endWeekDate =
                this.dateUtils.addWeeks(
                  this.dateUtils.parseWeekString(startWeekString),
                  producerBreeder.producer_id ? 18 - 1 : 10 - 1
                );

              const endWeekString = this.dateUtils.getWeekString(endWeekDate);


              const event: any = {
                id: `${producerBreeder.producer_id ? `${producerBreeder.producer_id}_${producerBreeder.date}` : producerBreeder.id}`,
                name: `${producerBreeder.producer_id ? producerBreeder.producer_id : producerBreeder.id}`,
                date: schedule ? schedule.date : producerBreederDate,
                amount: schedule ? schedule.amount : producerBreeder.amount,
                productType: schedule ? 'F' : 'M',
                supplierId: producerBreeder.breeder_id,
                startWeek: startWeekString,
                endWeek: endWeekString
              }

              const eventData = new EventData(event);
              eventData.endWeek = this.getISOWeekString(addWeeks(this.getDateFromISOWeekStr(eventData.startWeek), 17));

              producerBreederEvents.push(eventData);
            });
          }
          this.onCloseDialog({ suppliers, events, distanceSuppliers, distanceDemand, producerBreederEvents })

          this.loading = false;
        }, error => {
          this.loading = false;
        });
    }
  }

  processWeeks(dateString: string, fromSchedule: boolean, id: string) {
    if (!fromSchedule)
      return dateString;
    const date = this.getISOWeekString(addWeeks(this.getDateFromISOWeekStr(dateString), -17));
    return this.getISOWeekString(addWeeks(this.getDateFromISOWeekStr(dateString), -17))
  }

  groupByProducer(data: ScheduleResponse[]): Record<string, ScheduleResponse[]> {
    return data.reduce((acc, item) => {
      if (!acc[item.producer]) {
        acc[item.producer] = [];
      }
      acc[item.producer].push(item);
      return acc;
    }, {} as Record<string, ScheduleResponse[]>);
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
}
