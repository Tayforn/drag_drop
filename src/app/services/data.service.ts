import {Injectable} from '@angular/core';
import {Supplier} from '../models/supplier.model';
import {BehaviorSubject} from 'rxjs';
import {EventData} from '../models/event.model';
import {Week} from '../models/week.model';
import {DistanceDemand, DistanceSuppliers} from '../models/distance.model';

@Injectable({
  providedIn: 'root' // This makes the service a singleton and tree-shakable
})
export class DataService {
  readyEventData$ = new BehaviorSubject<{suppliers: Supplier[], events: EventData[], weekRange: Week[]} | null>(null);
  suppliers$ = new BehaviorSubject<Supplier[]>([]);
  events$ = new BehaviorSubject<EventData[]>([]);
  distance$ = new BehaviorSubject<{demand: DistanceDemand[], suppliers: DistanceSuppliers[]}>({demand: [], suppliers: []});

  constructor() {
  }

  public findShortestRoute(
    supplierId: string,
    stationIds: string[],
    supplierToDemandDistances: DistanceSuppliers[],
    demandToDemandDistances: DistanceDemand[]
  ): { route: string[]; totalDistance: number } | null {
    const allRoutes = this.permute(stationIds);
    let minDistance = Infinity;
    let bestRoute: string[] = [];

    for (const route of allRoutes) {
      let total = 0;

      // Supplier to first station
      const firstLeg = supplierToDemandDistances.find(
        d => d.breeder_id === supplierId && d.producer_id === route[0]
      );
      if (!firstLeg) continue;
      total += firstLeg.distance_minute;

      // Station-to-station legs
      let valid = true;
      for (let i = 0; i < route.length - 1; i++) {
        const leg = demandToDemandDistances.find(
          d => d.producer_id_from === route[i] && d.producer_id_too === route[i + 1]
        );
        if (!leg) {
          valid = false;
          break;
        }
        total += leg.distance_minute;
      }

      if (valid && total < minDistance) {
        minDistance = total;
        bestRoute = [...route];
      }
    }

    return bestRoute.length ? { route: bestRoute, totalDistance: minDistance } : null;
  }

  private permute<T>(inputArr: T[]): T[][] {
    const result: T[][] = [];

    const permute = (arr: T[], m: T[] = []) => {
      if (arr.length === 0) {
        result.push(m);
      } else {
        for (let i = 0; i < arr.length; i++) {
          const curr = arr.slice();
          const next = curr.splice(i, 1);
          permute(curr.slice(), m.concat(next));
        }
      }
    };

    permute(inputArr);
    return result;
  }
}
