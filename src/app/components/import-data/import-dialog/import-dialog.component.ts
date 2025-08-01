import {Component, inject, signal, WritableSignal} from '@angular/core';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatDialogActions, MatDialogContent, MatDialogRef, MatDialogTitle} from '@angular/material/dialog';
import {EventData} from '../../../models/event.model';
import {Supplier} from '../../../models/supplier.model';

@Component({
  selector: 'app-import-dialog',
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
  templateUrl: './import-dialog.component.html',
  styleUrls: ['./import-dialog.component.scss']
})
export class ImportDialogComponent {
  readonly dialogRef = inject(MatDialogRef<ImportDialogComponent>);

  importData: WritableSignal<{events: EventData[], suppliers: Supplier[]} | null> = signal(null);
  errorMessage = {
    type: '',
    message: '',
  }

  onImportData(event: Event) {
    const input = event.target as HTMLInputElement;

    if (!input.files?.length) return;

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = () => {
      try {
        const result: {events: EventData[], suppliers: Supplier[]} | null = JSON.parse(reader.result as string);
        if (!result?.hasOwnProperty('events') || !result?.hasOwnProperty('suppliers')) {
          this.errorMessage.type = 'error';
          this.errorMessage.message = 'Invalid json';
        }
        result?.events.forEach((item: EventData) => {
          if (!item.hasOwnProperty('id') || !item.hasOwnProperty('name') || !item.hasOwnProperty('startWeek') || !item.hasOwnProperty('endWeek') || !item.hasOwnProperty('date') || !item.hasOwnProperty('amount') || !item.hasOwnProperty('supplierId') || !item.hasOwnProperty('leftPosition') || !item.hasOwnProperty('topPosition') || !item.hasOwnProperty('maxShiftWeeksEarly') || !item.hasOwnProperty('maxShiftWeeksLate') || !item.hasOwnProperty('productType')) {
            this.errorMessage.type = 'error';
            this.errorMessage.message = 'Invalid json';
          }
        });
        result?.suppliers.forEach((supplier: Supplier) => {
          if (!supplier.hasOwnProperty('id') || !supplier.hasOwnProperty('name') || !supplier.hasOwnProperty('capacity')) {
            this.errorMessage.type = 'error';
            this.errorMessage.message = 'Invalid json';
          }
        });
        if (this.errorMessage.type === 'error') {
          return;
        }
        this.importData.set(result);
        this.errorMessage.type = 'success';
        this.errorMessage.message = 'Valid json';
      } catch (err) {
        console.error('Invalid JSON file:', err);
      }
    };

    reader.readAsText(file);
  }

  onCloseDialog(close = true): void {
    let importData: {events: EventData[], suppliers: Supplier[]} | null = null;
    if (!close) {
      importData = this.importData();
    }
    this.dialogRef.close(importData ? importData : null);
  }

}
