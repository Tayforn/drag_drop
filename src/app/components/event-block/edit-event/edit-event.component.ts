import {Component, inject} from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle
} from '@angular/material/dialog';
import {EventData} from '../../../models/event.model';
import {FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators} from '@angular/forms';
import { MatButtonModule} from '@angular/material/button';
import { MatInputModule} from '@angular/material/input';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatSelectModule} from '@angular/material/select';
import {addWeeks} from 'date-fns';

@Component({
  selector: 'app-edit-event',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatSelectModule
  ],
  templateUrl: './edit-event.component.html',
  styleUrls: ['./edit-event.component.scss']
})
export class EditEventComponent {
  readonly dialogRef = inject(MatDialogRef<EditEventComponent>);
  readonly data = inject<EventData>(MAT_DIALOG_DATA);

  editForm: FormGroup;

  constructor(private fb: FormBuilder) {
    this.editForm = this.fb.group({
      name: [this.data.name, Validators.required],
      amount: [this.data.amount, [Validators.required, Validators.min(1)]],
      maxShiftWeeksEarly: [this.data.maxShiftWeeksEarly, [Validators.required, Validators.min(0)]],
      maxShiftWeeksLate: [this.data.maxShiftWeeksLate, [Validators.required, Validators.min(0)]],
    });
  }

  onCloseDialog(close = true): void {
    let event: EventData | null = null;
    if (!close) {
      this.editForm.markAsTouched();
      if (this.editForm.invalid) return;
      const data = this.editForm.value;
      event = new EventData(this.data);
      event.name = data.name;
      event.amount = data.amount;
      event.maxShiftWeeksEarly = data.maxShiftWeeksEarly;
      event.maxShiftWeeksLate = data.maxShiftWeeksLate;
    }
    this.dialogRef.close(event ? event : null);
  }
}
