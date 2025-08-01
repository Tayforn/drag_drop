import {Component, inject, model, OnInit, signal, WritableSignal} from '@angular/core';
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

export function noSpacesValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const hasSpace = /\s/.test(control.value);
    return hasSpace ? { noSpaces: true } : null;
  };
}

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
  templateUrl: './add-supplier.component.html',
  styleUrls: ['./add-supplier.component.scss']
})
export class AddSupplierComponent implements OnInit {
  readonly dialogRef = inject(MatDialogRef<AddSupplierComponent>);
  suppliers: WritableSignal<Supplier[]> = signal([]);

  formSupplier: FormGroup;

  constructor(private fb: FormBuilder) {
    this.formSupplier = this.fb.group({
      id: ['', [Validators.required, noSpacesValidator()]],
      name: ['', Validators.required],
      capacity: [null, [Validators.required, Validators.min(0)]],
    })
  }

  ngOnInit() {

  }

  onSuppliersUpload(event: Event): void {
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
                    name: (item?.name) ? item.name : item.id,
                  });
                }
              });
              this.suppliers.set(arr);
              this.dialogRef.close(this.suppliers());
            }
          },
        });
      };
      reader.readAsText(file);
    }
  }

  onCloseDialog(close = true): void {
    let suppliers: Supplier[] | null = null;
    if (!close) {
      this.formSupplier.markAsTouched();
      if (this.formSupplier.invalid) return;
      suppliers = [this.formSupplier.getRawValue()];
    }
    this.dialogRef.close(suppliers);
  }
}
