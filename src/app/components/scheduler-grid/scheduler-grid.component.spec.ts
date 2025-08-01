import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SchedulerGridComponent } from './scheduler-grid.component';

describe('SchedulerGridComponent', () => {
  let component: SchedulerGridComponent;
  let fixture: ComponentFixture<SchedulerGridComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SchedulerGridComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SchedulerGridComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
