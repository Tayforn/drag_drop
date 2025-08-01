import {Injectable} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {Observable} from 'rxjs';

export interface ScheduleResponse {
  cat1: boolean;
  cat2: boolean;
  cat3: boolean;
  cat4: boolean;
  cat5: boolean;
  cat6: boolean;
  cat7: boolean;
  cat8: boolean;
  cat9: boolean;
  cat10: boolean;
  cat11: boolean;
  cat12: boolean;
  created: string;
  duration: string;
  id: number
  producer: string
  shift_weeks: number;
  updated: string;
  week_in: string;
  week_out: string;
}

export interface BreedersResponse {
  address: string;
  capacity: number;
  capacity_max: number;
  external_id: string;
  id: number
  name: string;
}

export interface ProducersResponse {
  address: string;
  can_eliminate_after: string;
  capacity: number;
  cat1: boolean;
  cat2: boolean;
  cat3: boolean;
  cat4: boolean;
  cat5: boolean;
  cat6: boolean;
  cat7: boolean;
  cat8: boolean;
  cat9: boolean;
  cat10: boolean;
  cat11: boolean;
  cat12: boolean;
  created: string;
  external_id: string;
  id: number;
  max_empty_weeks: number;
  max_full_weeks: number;
  min_empty_weeks: number;
  min_full_weeks: number;
  must_eliminate_after: string;
  name: string;
  race: string;
  updated: string;
  week_in: string;
}

export interface BreederProducersResponse {
  breeder: string;
  distance_km: number;
  distance_min: number;
  id: number;
  producer: string;
}

export interface ProducerProducersResponse {
  distance_km: number;
  distance_min: number;
  id: number;
  producer_from: string;
  producer_to: string;
}

@Injectable({
  providedIn: 'root',
})
export class HttpService {

  baseUrl: string = 'https://supplysolver.bytebrand.net';

  constructor(private http: HttpClient) {
  }

  private get<T>(url: string): Observable<T> {
    return this.http.get<T>(`${this.baseUrl}/${url}`, {headers: {'Content-Type': 'application/json'}});
  }

  public getSchedules(id: number): Observable<{success: boolean, data: ScheduleResponse[]}> {
    return this.get<{ data: ScheduleResponse[], success: boolean }>(`hotCrud/getCollection/getSchedules/PlanningSet/${id}`);
  }

  public getBreeders(id: number): Observable<{success: boolean, data: BreedersResponse[]}> {
    return this.get<{ data: BreedersResponse[], success: boolean }>(`hotCrud/getCollection/getBreeders/PlanningSet/${id}`);
  }

  public getProducers(id: number): Observable<{success: boolean, data: ProducersResponse[]}> {
    return this.get<{ data: ProducersResponse[], success: boolean }>(`hotCrud/getCollection/getProducers/PlanningSet/${id}`);
  }

  public getBreederProducers(id: number): Observable<{success: boolean, data: BreederProducersResponse[]}> {
    return this.get<{ data: BreederProducersResponse[], success: boolean }>(`hotCrud/getCollection/getBreederProducers/PlanningSet/${id}`);
  }

  public getProducerProducers(id: number): Observable<{success: boolean, data: ProducerProducersResponse[]}> {
    return this.get<{ data: ProducerProducersResponse[], success: boolean }>(`hotCrud/getCollection/getProducerProducers/PlanningSet/${id}`);
  }

}
