import { Component, inject, signal, WritableSignal } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogActions, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { EventData } from '../../../models/event.model';
import { DataService } from '../../../services/data.service';
import { HttpService } from '../../../services/http.service';

@Component({
    selector: 'app-api-export',
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
    templateUrl: './api-export.component.html',
    styleUrls: ['./api-export.component.scss']
})
export class ApiExportComponent {
    readonly dialogRef = inject(MatDialogRef<ApiExportComponent>);

    exportId = 0;
    errorMessage = {
        type: '',
        message: '',
    }
    loading = false;

    constructor(public dataService: DataService, private api: HttpService) {

    }

    onExportData() {
        const events = this.dataService.events$.getValue().filter(e => e.supplierId !== 'unassigned');
        const res = events.map(event => {
            const producerId = event.id.split('_')[0];

            return {
                producer_id: event.productType === 'M' ? null : +producerId,
                breeder_id: +event.supplierId ? +event.supplierId : 1,
                date: event.startWeek,
                amount: event.amount
            }
        })
        this.api.setProducerBreeder(this.exportId, { items: res }).subscribe((response: any) => {
            this.onCloseDialog();
        })
    }

    onCloseDialog(): void {
        this.dialogRef.close();
    }

}
