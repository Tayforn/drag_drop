import {Component, inject, OnInit, signal, WritableSignal} from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle
} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule, ValidationErrors,
  ValidatorFn,
  Validators
} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {Supplier} from '../../../models/supplier.model';
import * as Papa from 'papaparse';
import {DistanceDemand, DistanceSuppliers} from '../../../models/distance.model';


@Component({
  selector: 'app-add-supplier',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
  ],
  templateUrl: './add-distance.component.html',
  styleUrls: ['./add-distance.component.scss']
})
export class AddDistanceComponent implements OnInit {
  readonly dialogRef = inject(MatDialogRef<AddDistanceComponent>);
  distanceDemand: WritableSignal<DistanceDemand[]> = signal([]);
  distanceSuppliers: WritableSignal<DistanceSuppliers[]> = signal([]);

  constructor() {
  }

  ngOnInit() {

  }

  onDistanceDemand(event: Event): void {
    const file = (event.target as HTMLInputElement)?.files?.[0];

    if (file) {
      this.distanceDemand.set([]);
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
                if (item.hasOwnProperty('producer_id_from') && item.hasOwnProperty('producer_id_too') && item.hasOwnProperty('distance_km') && item.hasOwnProperty('distance_minute')) {
                  arr.push({
                    ...item,
                    distance_km: +item.distance_km,
                    distance_minute: +item.distance_minute,
                  });
                }
              });
              this.distanceDemand.set(arr);
            }
          },
        });
      };
      reader.readAsText(file);
    }
  }

  onDistanceSuppliers(event: Event): void {
    const file = (event.target as HTMLInputElement)?.files?.[0];

    if (file) {
      this.distanceSuppliers.set([]);
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
                if (item.hasOwnProperty('breeder_id') && item.hasOwnProperty('producer_id') && item.hasOwnProperty('distance_km') && item.hasOwnProperty('distance_minute')) {
                  arr.push({
                    ...item,
                    distance_km: +item.distance_km,
                    distance_minute: +item.distance_minute,
                  });
                }
              });
              this.distanceSuppliers.set(arr);
            }
          },
        });
      };
      reader.readAsText(file);
    }
  }

  onCloseDialog(close = true): void {
    let distance: {demand: DistanceDemand[], suppliers: DistanceSuppliers[]} | null = null;
    if (!close) {
      if (this.distanceSuppliers().length > 0 && this.distanceDemand().length > 0) {
        distance = {
          demand: this.distanceDemand(),
          suppliers: this.distanceSuppliers(),
        }
      }
    }
    this.dialogRef.close(distance);
  }
}
