export interface DistanceDemand {
  producer_id_from: string;
  producer_id_too: string;
  distance_km: number;
  distance_minute: number;
}

export interface DistanceSuppliers {
  breeder_id: string;
  producer_id: string;
  distance_km: number;
  distance_minute: number;
}
