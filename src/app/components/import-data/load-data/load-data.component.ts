import {Component, inject} from '@angular/core';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatDialogActions, MatDialogContent, MatDialogRef, MatDialogTitle} from '@angular/material/dialog';
import {HttpService} from '../../../services/http.service';
import {combineLatest} from 'rxjs';
import {Supplier} from '../../../models/supplier.model';
import {EventData} from '../../../models/event.model';
import {DistanceDemand, DistanceSuppliers} from '../../../models/distance.model';
import {MatProgressSpinner} from '@angular/material/progress-spinner';
import {addWeeks, getISOWeek, setWeek, setYear, startOfWeek} from 'date-fns';


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

  constructor(private api: HttpService) {
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
      ]).subscribe(
        ([schedules, breeders, producers, breederProducers, producerProducers]) => {
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
          if (producers.success) {
            producers.data.forEach((producer) => {
              const event: any = {
                id: `${producer.external_id}_${producer.week_in}`,
                name: producer.name,
                date: producer.week_in,
                amount: producer.capacity,
                supplierId: 'unassigned'
              }
              const eventFemale = new EventData(event);
              const eventMale = Object.assign({}, eventFemale);
              eventFemale.endWeek =  this.getISOWeekString(addWeeks(this.getDateFromISOWeekStr(eventFemale.startWeek), 18));
              eventMale.endWeek =  this.getISOWeekString(addWeeks(this.getDateFromISOWeekStr(eventMale.startWeek), 10));
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

          this.onCloseDialog({suppliers, events, distanceSuppliers, distanceDemand})

          this.loading = false;
        }, error => {
          this.loading = false;
        });
    }
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
