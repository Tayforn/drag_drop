import { ComponentFixture, TestBed } from '@angular/core/testing';

import {AddDistanceComponent} from './add-distance.component';

describe('AddDistanceComponent', () => {
  let component: AddDistanceComponent;
  let fixture: ComponentFixture<AddDistanceComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddDistanceComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddDistanceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
