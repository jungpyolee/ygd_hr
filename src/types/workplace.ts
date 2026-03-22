export interface StorePosition {
  id: string;
  store_id: string;
  position_key: string;
  label: string;
  display_order: number;
}

export interface WorkLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  work_location_key: string;
  label: string;
  color: string;
  bg_color: string;
  display_order: number;
  positions: StorePosition[];
}
